import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const readSource = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");

test("the root is either the product entrance or the dedicated workbench", () => {
  const page = readSource("app", "page.tsx");
  const workspaceBranch = page.indexOf("if (initialTarget.trim())");
  const landingBranch = page.indexOf('<div className={styles.landing} id="top">');

  assert.ok(workspaceBranch >= 0, "expected an explicit workspace branch");
  assert.ok(landingBranch > workspaceBranch, "landing should follow the workspace branch");
  assert.match(page.slice(workspaceBranch, landingBranch), /<Workbench/);
  assert.doesNotMatch(page.slice(landingBranch), /<Workbench/);
});

test("the entrance makes the guaranteed demo primary and public capture secondary", () => {
  const page = readSource("app", "page.tsx");
  const launcher = readSource("components", "AuditLauncher.tsx");
  const demoAction = launcher.indexOf("Run included /demo");
  const publicAction = launcher.indexOf("Open public workspace");

  assert.ok(demoAction >= 0 && demoAction < publicAction);
  assert.match(page, /11 page-hosted tools · zero provider keys/);
  assert.match(page, /<dd className=\{styles\.toolCount\}>11 Site Tools<\/dd>/);
  assert.match(page, /<dd className=\{styles\.toolCount\}>15 Site Tools<\/dd>/);
  assert.match(page, /Public capture is a bounded secondary path/);
});

test("the landing uses valid named regions and definition-list groups", () => {
  const page = readSource("app", "page.tsx");
  const styles = readSource("app", "page.module.css");
  const ledgerStart = page.indexOf("<dl className={styles.toolLedger}>");
  const ledgerEnd = page.indexOf("</dl>", ledgerStart);
  const ledger = page.slice(ledgerStart, ledgerEnd);

  assert.match(
    page,
    /<section className=\{styles\.liveSet\} aria-label="Sundae shared audit loop">/,
  );
  assert.match(page, /<div className=\{styles\.fixtureWindow\}>/);
  assert.doesNotMatch(page, /styles\.fixtureWindow\} aria-label=/);
  assert.ok(ledgerStart >= 0 && ledgerEnd > ledgerStart);
  assert.doesNotMatch(ledger, /<p>/);
  assert.equal((ledger.match(/className=\{styles\.toolDescription\}/g) ?? []).length, 2);
  assert.match(
    styles,
    /\.causalProof article:last-child > p\s*\{[\s\S]*?color:\s*var\(--text-primary\)/,
  );
});

test("hover styling is limited to hover-capable fine pointers", () => {
  const pageStyles = readSource("app", "page.module.css");
  const launcherStyles = readSource("components", "AuditLauncher.module.css");
  const query = "@media (hover: hover) and (pointer: fine)";
  const pageStart = pageStyles.indexOf(query);
  const pageEnd = pageStyles.indexOf("@media (max-width", pageStart);
  const launcherStart = launcherStyles.indexOf(query);
  const launcherEnd = launcherStyles.indexOf("@media (max-width", launcherStart);
  const pageHoverBlock = pageStyles.slice(pageStart, pageEnd);
  const launcherHoverBlock = launcherStyles.slice(launcherStart, launcherEnd);

  assert.ok(pageStart >= 0 && pageEnd > pageStart);
  assert.ok(launcherStart >= 0 && launcherEnd > launcherStart);
  assert.equal((pageStyles.match(/:hover/g) ?? []).length, 3);
  assert.equal((pageHoverBlock.match(/:hover/g) ?? []).length, 3);
  assert.equal((launcherStyles.match(/:hover/g) ?? []).length, 5);
  assert.equal((launcherHoverBlock.match(/:hover/g) ?? []).length, 5);
  assert.match(pageStyles, /:active[\s\S]*?transform:\s*scale\(0\.98\)/);
  assert.match(launcherStyles, /:active[\s\S]*?transform:\s*scale\(0\.98\)/);
  assert.match(readSource("app", "globals.css"), /button:focus-visible,[\s\S]*?a:focus-visible/);
});

test("the landing states why WebMCP is necessary without fabricating audit results", () => {
  const page = readSource("app", "page.tsx");
  const styles = readSource("app", "page.module.css");

  assert.match(
    page,
    /Screenshot audits split the interface, model conversation, evidence, and decisions/,
  );
  assert.match(page, /shared WebMCP tool host/);
  assert.match(page, /ChatGPT records evidence[\s\S]*Site Tools/);
  assert.match(page, /you govern judgment/);
  assert.match(page, /fresh recapture is required before[\s\S]*fixed/);
  assert.match(styles, /\.liveSet\s*\{/);
  assert.match(styles, /\.rundown\s*\{/);
  assert.match(styles, /\.playhead\s*\{/);
  assert.match(
    styles,
    /\.landing > header,[\s\S]*?\.landing > main > \.hero\s*\{[\s\S]*?isolation:\s*isolate;/,
  );
  assert.match(styles, /\.desktopGuide\s*\{[\s\S]*?isolation:\s*isolate;/);
  assert.match(styles, /\.playhead\s*\{[\s\S]*?border-inline-start:\s*thin solid/);
  assert.match(styles, /@keyframes audit-signal-path\s*\{[\s\S]*?transform:\s*scaleY\(1\)/);
  assert.doesNotMatch(styles, /@keyframes rundown-playhead[\s\S]*?inset-block-start/);
  assert.doesNotMatch(styles, /\.playhead\s*\{[\s\S]*?animation:[^;]*infinite/);
  assert.doesNotMatch(styles, /(?:inline-size|block-size):\s*thin;/);
  assert.doesNotMatch(styles, /\.proofShell\s*\{|\.evidenceSheet\s*\{/);
});

test("the explanatory signal settles and preserves an intentional reduced-motion state", () => {
  const styles = readSource("app", "page.module.css");
  const launcherStyles = readSource("components", "AuditLauncher.module.css");

  assert.match(styles, /animation:\s*audit-signal-path[\s\S]*?both;/);
  assert.match(styles, /@keyframes audit-signal-tip[\s\S]*?var\(--stage-verification\)/);
  assert.doesNotMatch(styles, /@keyframes (?:program|fixture|rundown)-/);
  assert.doesNotMatch(
    styles.match(/@keyframes audit-signal-path[\s\S]*?\n}/)?.[0] ?? "",
    /border-color|opacity|filter/,
  );
  assert.match(
    styles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.playhead\s*\{[\s\S]*?transform:\s*scaleY\(1\)/,
  );
  assert.match(
    styles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.masthead nav a:active,[\s\S]*?transform:\s*none/,
  );
  assert.match(
    launcherStyles,
    /\.controlNote\[data-state="checking"\] i\s*\{[\s\S]*?animation:\s*status-checking/,
  );
  assert.doesNotMatch(
    launcherStyles,
    /\.controlNote\[data-state="available"\] i\s*\{[^}]*animation:/,
  );
  assert.doesNotMatch(
    launcherStyles.match(/@keyframes status-checking[\s\S]*?\n}/)?.[0] ?? "",
    /transform/,
  );
  assert.match(
    launcherStyles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition:\s*opacity var\(--duration-instant\)/,
  );
  assert.match(
    launcherStyles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.actions button:active,[\s\S]*?transform:\s*none/,
  );
});

test("compact layouts present the launch controls before the fixture and densify the phone rundown", () => {
  const styles = readSource("app", "page.module.css");

  assert.match(
    styles,
    /@media \(max-width: 56\.25rem\)[\s\S]*?\.commandStrip\s*\{[\s\S]*?order:\s*2;/,
  );
  assert.match(
    styles,
    /@media \(max-width: 56\.25rem\)[\s\S]*?\.fixtureWindow\s*\{[\s\S]*?order:\s*3;/,
  );
  assert.match(
    styles,
    /@media \(max-width: 40rem\)[\s\S]*?\.rundown li\s*\{[\s\S]*?min-block-size:\s*calc\(var\(--space-2xl\) \+ var\(--space-m\)\)/,
  );
});

test("public hostnames use a forgiving text field and Desktop guidance stays honest", () => {
  const launcher = readSource("components", "AuditLauncher.tsx");

  assert.match(launcher, /type="text"[\s\S]{0,80}inputMode="url"/);
  assert.doesNotMatch(launcher, /type="url"/);
  assert.match(launcher, /Human controls ready/);
  assert.match(launcher, /open the built-in browser/);
  assert.match(launcher, /ordinary browser cannot force that internal browser to open/);
  assert.doesNotMatch(launcher, /window\.open|chatgpt\.com/i);
});

test("the controlled fixture cannot scroll away from its evidence pins", () => {
  const landing = readSource("app", "page.tsx");
  const viewport = readSource("components", "DemoViewport.tsx");
  const viewportStyles = readSource("components", "DemoViewport.module.css");
  const demoPage = readSource("app", "demo", "page.tsx");

  assert.match(
    landing,
    /src="\/demo\?state=baseline"[\s\S]{0,180}sandbox="allow-same-origin"[\s\S]{0,80}scrolling="no"/,
  );
  assert.match(viewport, /className=\{styles\.frame\}[\s\S]{0,320}scrolling="no"/);
  assert.match(viewportStyles, /\.frame\s*\{[\s\S]*?pointer-events:\s*none;/);

  assert.match(demoPage, /if \(!query\.state\)[\s\S]*?redirect\(/);
  assert.match(demoPage, /<header className=\{styles\.topbar\}>/);
  assert.match(demoPage, /<nav aria-label="Product navigation">/);
  assert.match(demoPage, /<button[\s\S]*?id="primary-action"/);
});

test("the README leads with the shared page and documents both tool surfaces", () => {
  const readme = readSource("README.md");

  assert.match(readme, /screenshot chat[\s\S]*separates the live interface/i);
  assert.match(readme, /page-hosted WebMCP Site Tools/);
  assert.match(readme, /published `\/demo` workspace/);
  assert.match(readme, /included `\/demo` registers eleven Sundae workbench tools/);
  assert.match(readme, /15 tools total/);
});
