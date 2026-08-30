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

test("the demo route resolves to the complete workbench rather than the bare fixture", () => {
  const demoPage = readFileSync(pathFromRoot("app", "demo", "page.tsx"), "utf8");

  assert.match(demoPage, /buildPublicDemoWorkspacePath/);
  assert.match(demoPage, /if \(!query\.state\)[\s\S]*?redirect\(/);
  assert.ok(demoPage.indexOf("redirect(") < demoPage.indexOf("const improved"));
  assert.match(demoPage, /<DemoWebMcp/);
});
