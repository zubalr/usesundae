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

test("normalizes bare public hostnames to https", () => {
  assert.equal(createAuditLaunch("linear.app").targetUrl, "https://linear.app/");
  assert.equal(createAuditLaunch("www.linear.app/path").targetUrl, "https://www.linear.app/path");
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
  assert.match(prompt, /ChatGPT Desktop/);
  assert.match(prompt, /built-in browser/);
  assert.match(prompt, /No plugin or connection is required/);
  assert.ok(prompt.includes(workspaceUrl));
  assert.match(prompt, /wait for Sundae Site Tools/i);
  assert.match(prompt, /Allow agent to capture/);
  assert.match(prompt, /Capture myself/);
  assert.match(prompt, /alternatives.*never ask me to do both/is);
  assert.doesNotMatch(prompt, /chatgpt\.com/i);
  assert.doesNotMatch(prompt, /start.audit|workspace.ready/i);
  assert.match(prompt, /get_board_context/);
  assert.match(prompt, /`uncaptured_nav`.*`capture_visible_nav`/is);
  assert.match(prompt, /`capture_visible_nav`.*accepts no URL/is);
  assert.match(prompt, /`gap-below-fold`.*`capture_below_fold`/is);
  assert.match(prompt, /`capture_journey_step`/);
  assert.match(prompt, /human.*extra.*exact.*same-origin URL/is);
  assert.match(prompt, /404/);
  assert.match(prompt, /click-only states.*`gap-flow-states`/is);
  assert.match(prompt, /never invent URLs beyond `uncaptured_nav`/i);
  assert.match(prompt, /never crawl/i);
  assert.match(prompt, /measured.*judged.*not seen/is);
  assert.match(prompt, /visible product job/i);
  assert.match(prompt, /record_audit_brief/i);
  assert.match(prompt, /record_review_result/i);
  assert.match(prompt, /UI.*UX.*Interaction/is);
  assert.match(prompt, /maximum of three per inspected category/i);
  assert.match(prompt, /fewer or none/i);
  assert.match(prompt, /severity.*confidence|confidence.*severity/is);
  assert.doesNotMatch(prompt, /0–3 judged findings per bucket/i);
  assert.match(prompt, /coverage gap/i);
  assert.match(prompt, /do not restate a measured finding/i);
  assert.match(prompt, /preview_fix/);
  assert.match(prompt, /verify_recapture/);
  assert.match(prompt, /do not claim an audit or capture completed/i);
  assert.doesNotMatch(prompt, /Gemini|Google Cloud/i);

  const boardRead = prompt.indexOf("get_board_context");
  const visibleNav = prompt.indexOf("`uncaptured_nav`");
  const belowFold = prompt.indexOf("`gap-below-fold`");
  const designPass = prompt.indexOf("visible product job");
  assert.ok(boardRead < visibleNav && visibleNav < belowFold && belowFold < designPass);

  const demoLaunch = createAuditLaunch("https://sundae.example/demo");
  const demoPrompt = buildChatGptHandoffPrompt(
    demoLaunch,
    buildWorkspaceUrl("https://sundae.example", demoLaunch),
    demoLaunch.targetUrl,
  );
  assert.match(demoPrompt, /audit_current_scope.*get_board_context/is);
  assert.match(demoPrompt, /no public-capture tools/i);
  assert.match(demoPrompt, /not visible as coverage gaps/i);
  assert.doesNotMatch(
    demoPrompt,
    /capture_public_page|capture_visible_nav|capture_below_fold|capture_journey_step/,
  );
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
