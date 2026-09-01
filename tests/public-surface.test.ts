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
  assert.match(combined, /Work Cloud/);
  assert.match(combined, /built-in browser/);
  assert.match(combined, /Site Tools/);
  assert.match(combined, /Audit with ChatGPT/);
  assert.match(combined, /window\.open/);
  assert.match(combined, /chatgpt\.com\/\?q=/);
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

test("the evidence pane leads with findings, then strengths, gaps, brief, and receipts", () => {
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
  assert.match(
    workbench,
    /<details className=\{styles\.authorityBar\} aria-label="Agent authority">/,
  );
  assert.match(workbench, /<details[\s\S]*id="audit-brief-title"/);
  assert.doesNotMatch(workbench, /briefEditor\} open=\{!auditBrief\}/);
  assert.match(workbench, /<details[\s\S]*id="coverage-title"/);
  assert.match(workbench, /Ask ChatGPT to audit/);
  assert.match(workbench, /Approve one finding/);
  assert.match(workbench, /Preview and verify/);
  assert.match(workbench, /"Re-measure"/);
  assert.doesNotMatch(workbench, /Audit live target/);
  assert.doesNotMatch(workbench, /Recapture page/);
  assert.match(workbench, />Design</);
  assert.match(workbench, /Design signal/);
  assert.match(workbench, /descriptive counts · no threshold/);
  assert.match(workbench, /hasDefensibleThreshold/);
  assert.match(workbench, /Agent readiness/);
  assert.match(workbench, /Technical facts/);
  assert.doesNotMatch(workbench, /Product findings/);
  assert.doesNotMatch(workbench, /Accessibility &(?:amp;)? technical facts/);
  assert.match(
    workbench,
    /No design judgment yet\. Sundae measured the evidence below\. Open this workspace in ChatGPT\s+to add judged findings against it\./,
  );
  assert.match(workbench, /Audit with ChatGPT/);
  assert.match(workbench, /<details[\s\S]*Technical facts/);
  assert.doesNotMatch(workbench, /<details[^>]*\sopen[\s\S]{0,200}Technical facts/);
  assert.match(workbench, /aria-label=\{evidenceBoard\.listLabel\}/);
  const designLane = workbench.indexOf(">Design<");
  const agentLane = workbench.indexOf("Agent readiness");
  const technicalLane = workbench.indexOf("Technical facts");
  assert.ok(designLane >= 0 && agentLane > designLane && technicalLane > agentLane);
});

test("the workbench accepts bare domains and contains desktop pane scrolling", () => {
  const workbench = readFileSync(
    pathFromRoot("components", "workbench", "WorkbenchView.tsx"),
    "utf8",
  );
  const styles = readFileSync(pathFromRoot("components", "Workbench.module.css"), "utf8");

  assert.match(workbench, /type="text"[\s\S]{0,80}inputMode="url"[\s\S]{0,120}value=\{urlDraft\}/);
  assert.match(styles, /\.app\s*\{[\s\S]*?height:\s*100dvh;[\s\S]*?overflow:\s*hidden;/);
  assert.match(styles, /\.workbench\s*\{[\s\S]*?flex:\s*1 1 auto;/);
  assert.match(styles, /\.productPane\s*\{[\s\S]*?overflow-y:\s*auto;/);
  assert.match(styles, /\.evidencePane\s*\{[\s\S]*?overflow-y:\s*auto;/);
  assert.match(
    styles,
    /@media \(max-width: 900px\)[\s\S]*?\.app\s*\{[\s\S]*?height:\s*auto;[\s\S]*?overflow:\s*visible;/,
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

test("accepting a finding orchestrates preview or honest re-measure through existing commands", () => {
  const controller = readFileSync(pathFromRoot("components", "Workbench.tsx"), "utf8");

  assert.match(controller, /acceptFollowThroughKind/);
  assert.match(controller, /runAcceptFollowThrough|previewFix\(/);
  assert.match(controller, /auditCurrentScope/);
  assert.match(controller, /acceptFollowThroughReceipt/);
  assert.doesNotMatch(controller, /lib\/audit\/recapture/);
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
