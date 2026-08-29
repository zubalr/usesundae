import assert from "node:assert/strict";
import test from "node:test";

import {
  buildChatGptHandoffPrompt,
  buildWorkspaceUrl,
  createAuditLaunch,
  MAX_AUDIT_GOAL_LENGTH,
} from "../lib/launch";

test("keeps the exact target for capture while removing private state from display", () => {
  const launch = createAuditLaunch(
    "https://EXAMPLE.com/signup?plan=pro#payment",
    " Review signup clarity ",
  );

  assert.equal(launch.targetUrl, "https://example.com/signup?plan=pro#payment");
  assert.equal(launch.displayUrl, "https://example.com/signup");
  assert.equal(launch.goal, "Review signup clarity");
});

test("builds an exact recoverable workspace and truthful ChatGPT request", () => {
  const launch = createAuditLaunch("https://example.com/launch?source=test", "Improve activation");
  const workspaceUrl = buildWorkspaceUrl("https://sundae.example", launch);
  const workspace = new URL(workspaceUrl);
  const prompt = buildChatGptHandoffPrompt(launch, workspaceUrl);

  assert.equal(workspace.origin, "https://sundae.example");
  assert.equal(workspace.searchParams.get("url"), launch.targetUrl);
  assert.equal(workspace.searchParams.get("goal"), launch.goal);
  assert.equal(workspace.hash, "#workbench");
  assert.match(prompt, /Open this exact Sundae workspace/);
  assert.ok(prompt.includes(workspaceUrl));
  assert.match(prompt, /do not claim that an audit or capture completed/i);
});

test("rejects unsafe or unsupported launch targets", () => {
  const invalidTargets = [
    "ftp://example.com/file",
    "https://user:secret@example.com/",
    "https://localhost/",
    "https://product.internal/",
    "http://127.0.0.1/",
    "http://[::1]/",
    "https://example.com:8443/",
  ];

  for (const target of invalidTargets) {
    assert.throws(() => createAuditLaunch(target), /public|credentials|standard|http/i);
  }
});

test("bounds the optional review goal", () => {
  assert.throws(
    () => createAuditLaunch("https://example.com", "x".repeat(MAX_AUDIT_GOAL_LENGTH + 1)),
    /240 characters/i,
  );
});
