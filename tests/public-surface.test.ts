import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const pathFromRoot = (...parts: string[]) => join(root, ...parts);

test("the public build has no connector package or remote entry route", () => {
  const removedPaths = [
    ["plugins", "sundae", ".app.json"],
    ["plugins", "sundae", ".codex-plugin", "plugin.json"],
    ["plugins", "sundae", "skills", "audit-public-product", "SKILL.md"],
    ["app", "mcp", "route.ts"],
    ["lib", "mcp", "server.ts"],
    ["evals", "plugin-prompts.json"],
  ];

  for (const parts of removedPaths) {
    assert.equal(existsSync(pathFromRoot(...parts)), false, `${parts.join("/")} must be absent`);
  }

  const sdkName = ["@modelcontext", "protocol/sdk"].join("");
  const packageText = readFileSync(pathFromRoot("package.json"), "utf8");
  const lockText = readFileSync(pathFromRoot("package-lock.json"), "utf8");
  assert.equal(packageText.includes(sdkName), false);
  assert.equal(lockText.includes(sdkName), false);
});

test("the launcher opens ChatGPT with the audit instruction already typed", () => {
  const launcher = readFileSync(pathFromRoot("components", "AuditLauncher.tsx"), "utf8");
  const launch = readFileSync(pathFromRoot("lib", "launch.ts"), "utf8");
  const combined = `${launcher}\n${launch}`;

  assert.match(combined, /ChatGPT Desktop/);
  assert.match(combined, /ChatGPT Work/);
  assert.match(combined, /built-in browser/);
  assert.match(combined, /Site Tools/);
  assert.match(combined, /Audit in ChatGPT Work/);
  assert.match(combined, /window\.open/);
  assert.match(combined, /searchParams\.set\("surface", "work"\)/);
  assert.match(combined, /searchParams\.set\("model", "gpt-5\.6-sol-wm"\)/);
  assert.match(combined, /Copy workspace URL/);
  assert.doesNotMatch(combined, /Prepare Desktop handoff/);
  assert.doesNotMatch(combined, /Human controls ready/);
  assert.doesNotMatch(combined, new RegExp(["start", "audit"].join("_"), "i"));
  assert.doesNotMatch(combined, new RegExp(["workspace", "ready"].join("_"), "i"));
});

test("readiness presentation tolerates registration-only hosts and stale registration results", () => {
  const launcher = readFileSync(pathFromRoot("components", "AuditLauncher.tsx"), "utf8");
  const workbench = readFileSync(
    pathFromRoot("components", "workbench", "WorkbenchView.tsx"),
    "utf8",
  );

  assert.doesNotMatch(launcher, /modelContext\.(?:getTools|addEventListener|removeEventListener)/);
  assert.match(workbench, /confirmedWorkbenchToolCount/);
  assert.match(workbench, /describeHostToolCount/);
  assert.match(workbench, /Agent tool calls:/);
  assert.doesNotMatch(workbench, /\$\{expectedCount\}\/\$\{expectedCount\} registered/);
  assert.doesNotMatch(workbench, /page tools ready/);
  assert.match(
    workbench,
    /registerWorkbenchTools[\s\S]*?report\(ready \? "ready" : "unavailable"\)/,
  );
  assert.match(workbench, /const report[\s\S]*?controller\.signal\.aborted[\s\S]*?return/);
  assert.match(
    workbench,
    /toolRegistration\.mode === props\.mode \? toolRegistration\.status : "checking"/,
  );
});

test("the demo route resolves to the complete workbench rather than the bare fixture", () => {
  const demoPage = readFileSync(pathFromRoot("app", "demo", "page.tsx"), "utf8");

  assert.match(demoPage, /buildPublicDemoWorkspacePath/);
  assert.match(demoPage, /if \(!query\.state\)[\s\S]*?redirect\(/);
  assert.ok(demoPage.indexOf("redirect(") < demoPage.indexOf("const improved"));
  assert.match(demoPage, /<DemoWebMcp/);
});

test("the workbench mount measurement is a baseline that no agent produced", () => {
  const controller = readFileSync(pathFromRoot("components", "Workbench.tsx"), "utf8");

  assert.match(controller, /Baseline measurement · no agent tool has run yet/);
  assert.match(controller, /countAgentToolCalls\(activityRef\.current\) === 0/);
  assert.match(controller, /contentDocument\?\.readyState === "complete"\) scheduleAudit/);
  assert.match(controller, /onScheduleAudit=\{\(\) => scheduleAudit\(\)\}/);
  assert.match(controller, /committedSystemBaselineRef/);
  assert.match(controller, /shouldScheduleSystemAudit\(/);
  assert.doesNotMatch(controller, /didMountAudit|onLoadFired/);
});

test("a human-supplied query URL is approved and auto-starts capture", () => {
  const controller = readFileSync(pathFromRoot("components", "Workbench.tsx"), "utf8");
  const workbench = readFileSync(
    pathFromRoot("components", "workbench", "WorkbenchView.tsx"),
    "utf8",
  );
  const viewport = readFileSync(pathFromRoot("components", "DemoViewport.tsx"), "utf8");

  assert.match(controller, /seedApprovedUrl\(initialUrl\)/);
  assert.match(controller, /shouldAutoStartPublicCapture/);
  assert.match(controller, /captureProgress/);
  assert.match(controller, /onCancelCapture/);
  assert.match(workbench, /approved for this session/i);
  assert.match(workbench, /Rendering the page|captureProgress/);
  assert.match(workbench, />\s*Cancel\s*</);
  assert.doesNotMatch(workbench, /Allow agent to capture/);
  assert.doesNotMatch(workbench, /Capture myself/);
  assert.doesNotMatch(viewport, /Approve the prefilled target or use Capture page/);
});

test("the evidence pane leads with actionable findings and collapses secondary inputs", () => {
  const workbench = readFileSync(
    pathFromRoot("components", "workbench", "WorkbenchView.tsx"),
    "utf8",
  );
  const paneStart = workbench.indexOf("function EvidencePane");
  const pane = workbench.slice(paneStart, workbench.indexOf("export function WorkbenchView"));
  const findings = pane.indexOf("<FindingList");
  const inspector = pane.indexOf("<FindingInspector");
  const strengths = pane.indexOf("<ReviewResultsPanel");
  const coverage = pane.indexOf("<CoveragePanel");
  const brief = pane.indexOf("<AuditBriefPanel");
  const receipts = pane.indexOf("<ActivityReceipts");

  assert.ok(paneStart >= 0);
  assert.ok(findings >= 0 && inspector > findings);
  assert.ok(strengths > inspector && coverage > strengths);
  assert.ok(brief > coverage && receipts > brief);
  const receiptsSource = workbench.slice(workbench.indexOf("function ActivityReceipts"));
  assert.match(receiptsSource, /<h3 id="receipts-title">Action receipts<\/h3>/);
  assert.doesNotMatch(receiptsSource, /<details[\s\S]*?<h3 id="receipts-title">Action receipts/);
  assert.match(receiptsSource, /Earlier receipts/);
  assert.match(
    workbench,
    /<details className=\{styles\.authorityBar\} aria-label="Agent authority">/,
  );
  assert.match(workbench, /<details[\s\S]*id="audit-brief-title"/);
  assert.doesNotMatch(workbench, /briefEditor\} open=\{!auditBrief\}/);
  assert.match(workbench, /<details[\s\S]*id="coverage-title"/);
  assert.doesNotMatch(workbench, /Ask ChatGPT to audit/);
  assert.doesNotMatch(workbench, /Approve one finding/);
  assert.doesNotMatch(workbench, /Preview and verify/);
  assert.match(workbench, /"Refresh evidence"/);
  assert.doesNotMatch(workbench, /"Re-measure"/);
  assert.doesNotMatch(workbench, /Audit live target/);
  assert.doesNotMatch(workbench, /Recapture page/);
  assert.match(workbench, /Design findings/);
  assert.match(workbench, /Measured findings/);
  assert.match(workbench, /Signals and Site Tools/);
  assert.match(workbench, /hasDefensibleThreshold/);
  assert.match(workbench, /Ready for design review/);
  assert.match(workbench, /Review in ChatGPT Work/);
  assert.match(workbench, /Inspect Site Tools/);
  assert.match(workbench, /<h2 id="evidence-title">Findings<\/h2>/);
  assert.match(workbench, /What already works/);
  assert.match(workbench, /What was reviewed/);
  assert.match(workbench, /Review context/);
  assert.match(workbench, /Sample review/);
  assert.match(workbench, /<details className=\{styles\.secondaryReview\}>/);
  assert.doesNotMatch(workbench, /<details className=\{styles\.secondaryReview\}\s+open/);
  assert.match(workbench, /aria-label=\{evidenceBoard\.listLabel\}/);
  const designLane = workbench.indexOf("Design findings");
  const measuredLane = workbench.indexOf("Measured findings");
  const secondaryInputs = workbench.indexOf("Signals and Site Tools");
  assert.ok(designLane >= 0 && measuredLane > designLane && secondaryInputs > measuredLane);
});

test("the evidence dock closes, reopens, and resizes with pointer or keyboard", () => {
  const workbench = readFileSync(
    pathFromRoot("components", "workbench", "WorkbenchView.tsx"),
    "utf8",
  );

  assert.match(workbench, /aria-controls="evidence-pane"/);
  assert.match(workbench, /aria-label=\{`\$\{sidebarOpen \? "Hide" : "Show"\} findings panel/);
  assert.match(workbench, /className=\{styles\.closePane\}[\s\S]{0,100}onClick=\{onClose\}/);
  assert.match(workbench, /role="separator"/);
  assert.match(workbench, /aria-valuetext=\{`\$\{sidebarWidth\} pixels wide`\}/);
  assert.match(workbench, /const SIDEBAR_MIN_WIDTH = 288/);
  assert.match(workbench, /const SIDEBAR_MAX_WIDTH = 560/);
  assert.match(workbench, /useState\(360\)/);
  assert.match(workbench, /event\.key === "ArrowLeft"/);
  assert.match(workbench, /event\.key === "ArrowRight"/);
  assert.match(workbench, /event\.key === "Home"/);
  assert.match(workbench, /event\.key === "End"/);
  assert.match(workbench, /sidebarToggleRef\.current\?\.focus\(\)/);

  const closeSidebar = workbench.slice(
    workbench.indexOf("const closeSidebar"),
    workbench.indexOf("return (", workbench.indexOf("const closeSidebar")),
  );
  assert.doesNotMatch(closeSidebar, /onFocusFinding|setSelected/);
});

test("choosing a finding reveals its inspector without forcing motion", () => {
  const controller = readFileSync(pathFromRoot("components", "Workbench.tsx"), "utf8");
  const focusFinding = controller.slice(
    controller.indexOf("const focusFinding"),
    controller.indexOf("const setFindingDecision", controller.indexOf("const focusFinding")),
  );

  assert.match(controller, /inspector\?\.scrollIntoView/);
  assert.match(controller, /prefers-reduced-motion: reduce/);
  assert.match(controller, /\?\s+"auto"\s*:\s+"smooth"/);
  assert.match(controller, /inspector\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(focusFinding, /setSidebarOpen\(true\)/);
});

test("pre-capture target status and sample coverage do not expose unavailable actions", () => {
  const workbench = readFileSync(
    pathFromRoot("components", "workbench", "WorkbenchView.tsx"),
    "utf8",
  );

  assert.match(workbench, /awaitingCapture \? \([\s\S]*?data-static="true"/);
  assert.match(workbench, /mode === "remote" \? \([\s\S]*?onOpenJourneyCheckpoint/);
});

test("the workbench accepts bare domains and contains desktop pane scrolling", () => {
  const workbench = readFileSync(
    pathFromRoot("components", "workbench", "WorkbenchView.tsx"),
    "utf8",
  );
  const styles = readFileSync(pathFromRoot("components", "Workbench.module.css"), "utf8");

  assert.match(workbench, /<main[\s\S]*?aria-label="Sundae audit workbench"/);
  assert.match(workbench, /type="text"[\s\S]{0,80}inputMode="url"[\s\S]{0,120}value=\{urlDraft\}/);
  assert.match(styles, /\.app\s*\{[\s\S]*?height:\s*100dvh;[\s\S]*?overflow:\s*hidden;/);
  assert.match(styles, /\.workbench\s*\{[\s\S]*?flex:\s*1 1 auto;/);
  assert.match(styles, /\.productPane\s*\{[\s\S]*?overflow-y:\s*auto;/);
  assert.match(styles, /\.evidencePane\s*\{[\s\S]*?overflow-y:\s*auto;/);
  assert.match(
    styles,
    /@media \(max-width: 900px\)[\s\S]*?\.app\s*\{[\s\S]*?height:\s*auto;[\s\S]*?overflow-x:\s*clip;/,
  );
  assert.match(
    styles,
    /@media \(max-width: 900px\)[\s\S]*?\.workbench\s*\{[\s\S]*?display:\s*block;[\s\S]*?\.sidebarHandle\s*\{[\s\S]*?display:\s*none;/,
  );
});

test("agent authority values wrap instead of hiding the governance contract", () => {
  const styles = readFileSync(pathFromRoot("components", "Workbench.module.css"), "utf8");
  const authorityValue = styles.match(/\.authorityBar dd\s*\{(?<body>[\s\S]*?)\}/)?.groups?.body;

  assert.ok(authorityValue, "Missing authority value styles");
  assert.doesNotMatch(authorityValue, /text-overflow:\s*ellipsis/);
  assert.match(authorityValue, /white-space:\s*normal/);
});

test("judged finding details keep exact scope and verification visible", () => {
  const workbench = readFileSync(
    pathFromRoot("components", "workbench", "WorkbenchView.tsx"),
    "utf8",
  );

  assert.match(workbench, /<dt>Route<\/dt>/);
  assert.match(workbench, /<dt>State<\/dt>/);
  assert.match(workbench, /<dt>Viewport<\/dt>/);
  assert.match(workbench, /<dt>Verification<\/dt>/);
});

test("accepting a finding orchestrates preview or labeled re-measure through existing commands", () => {
  const controller = readFileSync(pathFromRoot("components", "Workbench.tsx"), "utf8");

  assert.match(controller, /acceptFollowThroughKind/);
  assert.match(controller, /runAcceptFollowThrough|previewFix\(/);
  assert.match(controller, /auditCurrentScope/);
  assert.match(controller, /setFindingDecisionWithFollowThrough/);
  assert.doesNotMatch(controller, /lib\/audit\/recapture/);
});

test("agent decisions stay atomic while the human callback keeps follow-through", () => {
  const controller = readFileSync(pathFromRoot("components", "Workbench.tsx"), "utf8");
  const actualCommands = controller.slice(
    controller.indexOf("const actualCommands"),
    controller.indexOf("commandRef.current = actualCommands"),
  );
  const followThrough = controller.slice(
    controller.indexOf("const setFindingDecisionWithFollowThrough"),
    controller.indexOf("const actualCommands"),
  );

  assert.match(actualCommands, /setFindingDecision(?:\s*:\s*setFindingDecision)?,/);
  assert.doesNotMatch(actualCommands, /setFindingDecision:\s*setFindingDecisionWithFollowThrough/);
  assert.match(
    controller,
    /onSetFindingDecision=\{\(findingId, decision, reason\) =>\s*runVisibleCommand\(setFindingDecisionWithFollowThrough\(/,
  );
  assert.match(followThrough, /return runAcceptFollowThrough\(/);
  assert.doesNotMatch(followThrough, /follow_through_error/);
});

test("public viewport capture retains the existing responsive audit", () => {
  const controller = readFileSync(pathFromRoot("components", "Workbench.tsx"), "utf8");

  assert.match(controller, /const continuesAudit\s*=/);
  assert.match(controller, /if \(!continuesAudit\) resetEvidence\(\)/);
  assert.match(
    controller,
    /baselineCheckpointRef\.current = \{[\s\S]{0,120}\[nextViewport\]: nextCheckpoint/,
  );
  assert.match(controller, /journeyRef\.current = continuesAudit/);
});

test("new review panels keep styled and failure-safe human controls", () => {
  const workbench = readFileSync(
    pathFromRoot("components", "workbench", "WorkbenchView.tsx"),
    "utf8",
  );
  const controller = readFileSync(pathFromRoot("components", "Workbench.tsx"), "utf8");
  const stylesheet = readFileSync(pathFromRoot("components", "Workbench.module.css"), "utf8");
  const classNames = new Set(
    [...workbench.matchAll(/styles\.([A-Za-z0-9_]+)/g)].map((match) => match[1]!),
  );

  for (const className of classNames) {
    assert.ok(stylesheet.includes(`.${className}`), `Missing Workbench style: ${className}`);
  }
  assert.match(workbench, /\.then\(\(recorded\) => \{\s*if \(recorded\) form\.reset\(\)/);
  assert.match(workbench, /disabled=\{demoState !== "baseline" \|\| !auditBrief\}/);
  assert.match(
    workbench,
    /disabled=\{!baseline \|\| !auditBrief \|\| !scopeId \|\| demoState !== "baseline"\}/,
  );
  assert.match(controller, /Record review results on baseline evidence, not a reversible preview/);
  assert.match(
    controller,
    /Record the product brief on baseline evidence, not a reversible preview/,
  );
});
