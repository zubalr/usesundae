import assert from "node:assert/strict";
import test from "node:test";

import {
  buildChatGptHandoffPrompt,
  buildPublicDemoWorkspacePath,
  buildWorkspaceUrl,
  createAuditLaunch,
  isIncludedDemoTarget,
  MAX_AUDIT_GOAL_LENGTH,
  resolveInitialTargetMode,
  resolvePublicDemoUrl,
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
  assert.match(prompt, /start_audit/);
  assert.match(prompt, /Open this exact Sundae workspace/);
  assert.ok(prompt.includes(workspaceUrl));
  assert.match(prompt, /wait for Sundae Site Tools/i);
  assert.match(prompt, /audit_current_scope/);
  assert.match(prompt, /get_board_context/);
  assert.match(prompt, /measured.*judged.*not seen/is);
  assert.match(prompt, /preview_fix/);
  assert.match(prompt, /verify_recapture/);
  assert.match(prompt, /do not claim that an audit or capture completed/i);
  assert.doesNotMatch(prompt, /Gemini|Google Cloud/i);
});

test("the included capture preset always resolves to a public Sundae demo", () => {
  assert.equal(resolvePublicDemoUrl(), "https://usesundae.vercel.app/demo");
  assert.equal(
    resolvePublicDemoUrl("https://sundae.example/settings"),
    "https://sundae.example/demo",
  );
  assert.equal(
    buildPublicDemoWorkspacePath(),
    "/?url=https%3A%2F%2Fusesundae.vercel.app%2Fdemo&goal=#workbench",
  );
  assert.equal(
    buildPublicDemoWorkspacePath("https://sundae.example/settings"),
    "/?url=https%3A%2F%2Fsundae.example%2Fdemo&goal=#workbench",
  );
  assert.equal(isIncludedDemoTarget("https://usesundae.vercel.app/demo"), true);
  assert.equal(isIncludedDemoTarget("https://example.com/demo"), false);
  assert.equal(isIncludedDemoTarget("https://sundae.example/demo", "https://sundae.example"), true);

  const customDemo = createAuditLaunch("https://sundae.example/demo");
  assert.equal(
    new URL(buildWorkspaceUrl("https://sundae.example", customDemo)).searchParams.get("demo"),
    null,
  );
  assert.equal(resolveInitialTargetMode(""), "sample");
  assert.equal(resolveInitialTargetMode("https://usesundae.vercel.app/demo"), "sample");
  assert.equal(
    resolveInitialTargetMode("https://sundae.example/demo", "https://sundae.example"),
    "sample",
  );
  assert.equal(resolveInitialTargetMode("https://example.com"), "remote");
  assert.throws(() => resolvePublicDemoUrl("http://sundae.example"), /public HTTPS/i);
  assert.throws(() => resolvePublicDemoUrl("https://localhost:3000"), /public|standard/i);
});

test("keeps the public demo redirect relative instead of trusting request host headers", () => {
  const location = buildPublicDemoWorkspacePath();

  assert.equal(location.startsWith("/"), true);
  assert.equal(location.startsWith("//"), false);
  assert.doesNotMatch(location, /attacker\.example/);
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
