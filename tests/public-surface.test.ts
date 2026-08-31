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

test("the launcher prepares a page-native Desktop handoff without opening a chat website", () => {
  const launcher = readFileSync(pathFromRoot("components", "AuditLauncher.tsx"), "utf8");
  const launch = readFileSync(pathFromRoot("lib", "launch.ts"), "utf8");
  const combined = `${launcher}\n${launch}`;

  assert.match(combined, /ChatGPT Desktop/);
  assert.match(combined, /built-in browser/);
  assert.match(combined, /Site Tools/);
  assert.doesNotMatch(combined, /window\.open/);
  assert.doesNotMatch(combined, /chatgpt\.com/i);
  assert.doesNotMatch(combined, new RegExp(["start", "audit"].join("_"), "i"));
  assert.doesNotMatch(combined, new RegExp(["workspace", "ready"].join("_"), "i"));
});

test("readiness presentation tolerates registration-only hosts and stale registration results", () => {
  const launcher = readFileSync(pathFromRoot("components", "AuditLauncher.tsx"), "utf8");
  const workbench = readFileSync(
    pathFromRoot("components", "workbench", "WorkbenchView.tsx"),
    "utf8",
  );
  const presentation = `${launcher}\n${workbench}`;

  assert.doesNotMatch(
    presentation,
    /modelContext\.(?:getTools|addEventListener|removeEventListener)/,
  );
  assert.match(
    workbench,
    /registerWorkbenchTools[\s\S]*?report\(ready \? "ready" : "unavailable"\)/,
  );
  assert.match(workbench, /const report[\s\S]*?controller\.signal\.aborted[\s\S]*?return/);
  assert.match(
    workbench,
    /toolRegistration\.mode === props\.mode \? toolRegistration\.status : "checking"/,
  );
  assert.match(workbench, /toolStatus === "ready"[\s\S]*?registered/);
});

test("the demo route resolves to the complete workbench rather than the bare fixture", () => {
  const demoPage = readFileSync(pathFromRoot("app", "demo", "page.tsx"), "utf8");

  assert.match(demoPage, /buildPublicDemoWorkspacePath/);
  assert.match(demoPage, /if \(!query\.state\)[\s\S]*?redirect\(/);
  assert.ok(demoPage.indexOf("redirect(") < demoPage.indexOf("const improved"));
  assert.match(demoPage, /<DemoWebMcp/);
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
