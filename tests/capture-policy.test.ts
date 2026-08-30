import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizePublicTarget,
  sanitizePreviewCss,
  sanitizeWaitForSelector,
} from "../lib/capture/url-policy";

test("keeps the exact private target URL while redacting query and fragment from display", () => {
  const target = normalizePublicTarget("https://example.com/product?mode=trial#pricing");

  assert.equal(target.captureUrl, "https://example.com/product?mode=trial#pricing");
  assert.equal(target.displayUrl, "https://example.com/product");
  assert.equal(target.origin, "https://example.com");
  assert.match(target.scopeId, /^scope_[a-f0-9]{32}$/);
  assert.equal(target.scopeId, normalizePublicTarget(target.captureUrl).scopeId);
  assert.notEqual(
    target.scopeId,
    normalizePublicTarget("https://example.com/product?mode=trial#other").scopeId,
  );
  assert.notEqual(
    target.scopeId,
    normalizePublicTarget("https://example.com/product?mode=other#pricing").scopeId,
  );
});

test("normalizes a bare public hostname to https", () => {
  const target = normalizePublicTarget("www.linear.app/path");
  assert.equal(target.captureUrl, "https://www.linear.app/path");
  assert.equal(target.displayUrl, "https://www.linear.app/path");
});

test("rejects credentials, local networks, non-web schemes, and oversized URLs", () => {
  const rejected = [
    "file:///etc/passwd",
    "https://user:secret@example.com",
    "http://localhost:3000",
    "http://127.0.0.1/admin",
    "http://[::1]/admin",
    "http://[::ffff:127.0.0.1]/admin",
    "http://[::ffff:10.0.0.1]/admin",
    "http://[fd00::1]/admin",
    "http://[2001:4860:4860::8888]/admin",
    "http://169.254.169.254/latest/meta-data",
    "https://service.internal/dashboard",
    `https://example.com/${"x".repeat(2100)}`,
  ];

  for (const value of rejected) {
    assert.throws(() => normalizePublicTarget(value), { name: "TargetPolicyError" }, value);
  }
});

test("allows bounded visual preview CSS and rejects network-capable CSS", () => {
  assert.equal(
    sanitizePreviewCss(
      ".cta:hover, button.primary { min-height: 44px; color: #15221c; transition: color 180ms ease; }",
    ),
    ".cta:hover, button.primary { min-height: 44px; color: #15221c; transition: color 180ms ease; }",
  );

  for (const value of [
    "@import 'https://example.com/steal.css';",
    ".x { background: url(https://example.com/pixel); }",
    ".x { background-color: image-set(#fff 1x); }",
    ".x { color: \\75rl(https://example.com/pixel); }",
    ".x { behavior: url(test.htc); }",
    ".x { background-image: none; }",
    ".x { --theme: red; }",
    ".card .cta { color: red; }",
    ".x { color: rgb(1, 2, 3); }",
    '.x { color: "red"; }',
    "body { color: red; } /* </style><script>alert(1)</script> */",
  ]) {
    assert.throws(() => sanitizePreviewCss(value), { name: "PreviewPolicyError" }, value);
  }
});

test("allows one bounded wait selector and rejects expensive selector lists", () => {
  assert.equal(
    sanitizeWaitForSelector('  .app[data-state="ready"] > main  '),
    '.app[data-state="ready"] > main',
  );

  for (const value of [
    "main, iframe",
    "main:has(.ready)",
    "main\\:ready",
    "main\niframe",
    "x".repeat(161),
  ]) {
    assert.throws(
      () => sanitizeWaitForSelector(value),
      { name: "WaitForSelectorPolicyError" },
      value,
    );
  }
});
