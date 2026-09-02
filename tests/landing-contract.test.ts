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

test("the entrance makes public capture primary and the included demo secondary", () => {
  const page = readSource("app", "page.tsx");
  const launcher = readSource("components", "AuditLauncher.tsx");
  const publicAction = launcher.indexOf("Start the review");
  const demoAction = launcher.indexOf("Try the live demo");
  const chatAction = launcher.indexOf("Audit with ChatGPT");

  assert.ok(publicAction >= 0 && publicAction < demoAction);
  assert.ok(demoAction > publicAction && chatAction > demoAction);
  assert.match(launcher, /Review a public page/);
  assert.match(launcher, /See the complete review on our sample product/);
  assert.match(page, /id="judges"[\s\S]*<ChatGptNextStep/);
  assert.doesNotMatch(
    page.slice(
      page.indexOf('<div className={styles.landing} id="top">'),
      page.indexOf('id="judges"'),
    ),
    /ChatGptNextStep/,
  );
  assert.match(page, /<dd className=\{styles\.toolCount\}>11 Site Tools<\/dd>/);
  assert.match(page, /<dd className=\{styles\.toolCount\}>15 Site Tools<\/dd>/);
  assert.match(page, /id="judges"/);
  assert.doesNotMatch(launcher, /fallback/i);
  assert.doesNotMatch(page, /fallback/i);
  assert.doesNotMatch(page, /11 page-hosted tools · zero provider keys/);
  assert.doesNotMatch(page, /Public capture is a bounded secondary path/);
  assert.doesNotMatch(page, /Why WebMCP/);
  assert.doesNotMatch(page, /Open \/demo/);
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

test("the landing leads with a shared workspace and keeps measurements as evidence", () => {
  const page = readSource("app", "page.tsx");
  const styles = readSource("app", "page.module.css");

  assert.match(page, /Design reviews shouldn&rsquo;t disappear into chat\./);
  assert.match(page, /A live design review with your AI/);
  assert.match(page, /Every finding shows its evidence\. Every decision stays yours\./);
  assert.doesNotMatch(page, /Every finding is a measurement/);
  assert.doesNotMatch(page, /AI audits your product/);
  assert.match(page, /includedDemoProofReceipt/);
  assert.match(page, /proof\.title/);
  assert.match(page, /Measure[\s\S]*you decide[\s\S]*preview[\s\S]*recheck/);
  assert.doesNotMatch(page, /accepted by you|previewed|rechecked/);
  assert.doesNotMatch(page, /4\.09:1/);
  assert.doesNotMatch(page, /28 undersized/);
  assert.doesNotMatch(page, /any public page/);
  assert.match(page, /a public page/);
  assert.doesNotMatch(page, /todoist|linear\.app|notion|figma|stripe/i);
  assert.match(
    page,
    /The image, conversation, evidence, and decision trail live in different places/,
  );
  assert.match(page, /Findings sit on the live page/);
  assert.match(page, /Try the complete WebMCP loop in two minutes/);
  assert.match(page, /Judge path/);
  assert.doesNotMatch(page, /For WebMCP Challenge judges/);
  assert.match(page, /GPT-5\.6 Luna has WebMCP disabled/);
  assert.match(page, /Enterprise[\s\S]*Edu/);
  assert.match(page, /A host may deny an individual tool call/);
  assert.match(page, /audit_current_scope/);
  assert.match(page, /verify_recapture/);
  assert.match(page, /<summary>Browser and model support<\/summary>/);
  assert.match(page, /<summary>View the Site Tools<\/summary>/);
  assert.match(page, /<summary>Capture boundaries<\/summary>/);
  assert.match(styles, /\.liveSet\s*\{/);
  assert.match(styles, /\.rundown\s*\{/);
  assert.match(styles, /\.playhead\s*\{/);
  assert.match(styles, /\.proofReceipt\s*\{/);
  assert.match(
    styles,
    /\.wordmark\s*\{[\s\S]*?min-block-size:\s*calc\(var\(--space-xl\) \+ var\(--space-xs\)\)/,
  );
  assert.match(
    styles,
    /\.landing > header,[\s\S]*?\.landing > main > \.hero\s*\{[\s\S]*?isolation:\s*isolate;/,
  );
  assert.match(styles, /\.proofReceipt\s*\{[\s\S]*?isolation:\s*isolate;/);
  assert.match(styles, /\.playhead\s*\{[\s\S]*?border-inline-start:\s*thin solid/);
  assert.doesNotMatch(styles, /\.proofScan\s*\{|@keyframes proof-resolve/);
  assert.doesNotMatch(styles, /@keyframes audit-signal-path/);
  assert.doesNotMatch(styles, /@keyframes rundown-playhead[\s\S]*?inset-block-start/);
  assert.doesNotMatch(styles.match(/\.playhead\s*\{([^}]+)\}/)?.[1] ?? "animation:", /animation:/);
  assert.doesNotMatch(styles, /(?:inline-size|block-size):\s*thin;/);
  assert.doesNotMatch(styles, /\.proofShell\s*\{|\.evidenceSheet\s*\{/);
  assert.doesNotMatch(
    styles,
    /\.hero\s*\{[\s\S]*?padding-block:\s*var\(--space-2xl\) var\(--space-3xl\)/,
  );
});

test("the explanatory signal settles and preserves an intentional reduced-motion state", () => {
  const styles = readSource("app", "page.module.css");
  const launcherStyles = readSource("components", "AuditLauncher.module.css");

  assert.match(styles, /\.playhead\s*\{[\s\S]*?transform:\s*scaleY\(1\)/);
  assert.doesNotMatch(styles, /@keyframes (?:program|fixture|rundown|audit-signal)-/);
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

test("compact layouts present the launch controls before the fixture and keep the receipt beside the action", () => {
  const styles = readSource("app", "page.module.css");

  assert.match(
    styles,
    /@media \(max-width: 56\.25rem\)[\s\S]*?\.heroEntry,\n\s*\.liveSet \{\n\s*grid-template-columns: 1fr/,
  );
  assert.match(styles, /\.heroEntry[\s\S]*?\.commandStrip/);
  assert.match(
    styles,
    /@media \(max-width: 40rem\)[\s\S]*?\.rundown li\s*\{[\s\S]*?min-block-size:\s*calc\(var\(--space-2xl\) \+ var\(--space-m\)\)/,
  );
});

test("public hostnames use a forgiving text field and Desktop guidance stays honest", () => {
  const page = readSource("app", "page.tsx");
  const launcher = readSource("components", "AuditLauncher.tsx");
  const launch = readSource("lib", "launch.ts");

  assert.match(launcher, /type="text"[\s\S]{0,80}inputMode="url"/);
  assert.doesNotMatch(launcher, /type="url"/);
  assert.match(launcher, /Type a public URL and press Enter/);
  assert.doesNotMatch(launcher, /Human controls ready/);
  assert.match(launcher, /ChatGPT Desktop/);
  assert.match(launcher, /Work Cloud/);
  assert.match(launcher, /Audit with ChatGPT/);
  assert.match(launcher, /window\.open/);
  assert.match(launch, /chatgpt\.com\/\?q=/);
  assert.doesNotMatch(launcher, /Prepare Desktop handoff/);
  assert.match(page, /ChatGPT Work Cloud/);
  assert.match(page, /built-in browser or ChatGPT Work Cloud/);
  assert.match(page, /Judge path/);
  assert.match(page, /<ChatGptNextStep/);
});

test("the controlled fixture cannot scroll away from its evidence pins", () => {
  const landing = readSource("app", "page.tsx");
  const viewport = readSource("components", "DemoViewport.tsx");
  const viewportStyles = readSource("components", "DemoViewport.module.css");
  const demoPage = readSource("app", "demo", "page.tsx");

  assert.match(
    landing,
    /src="\/demo\?state=baseline"[\s\S]{0,180}sandbox="allow-same-origin allow-scripts"[\s\S]{0,80}scrolling="no"/,
  );
  assert.match(viewport, /className=\{styles\.frame\}[\s\S]{0,320}scrolling="no"/);
  assert.match(viewportStyles, /\.frame\s*\{[\s\S]*?pointer-events:\s*none;/);

  assert.match(demoPage, /if \(!query\.state\)[\s\S]*?redirect\(/);
  assert.match(demoPage, /<header className=\{styles\.topbar\}>/);
  assert.match(demoPage, /<nav aria-label="Product navigation">/);
  assert.match(demoPage, /<button[\s\S]*?id="primary-action"/);
});

test("the interface uses a focus-ring size token and one numbered-step counter", () => {
  const styles = readSource("app", "page.module.css");
  const tokens = readSource("app", "globals.css");

  assert.match(tokens, /--focus-ring-width:/);
  assert.match(tokens, /outline:\s*var\(--focus-ring-width\) solid var\(--focus-ring\)/);
  assert.match(styles, /\.desktopSteps,\n\s*\.judgeSteps\s*\{/);
  assert.match(styles, /counter-reset:\s*landing-step/);
  assert.doesNotMatch(styles, /counter-reset:\s*handoff/);
  assert.doesNotMatch(styles, /counter-reset:\s*judge-step/);
});

test("the README leads with the shared page and documents both tool surfaces", () => {
  const readme = readSource("README.md");

  assert.match(readme, /screenshot chat[\s\S]*separates the live interface/i);
  assert.match(readme, /page-hosted WebMCP Site Tools/);
  assert.match(readme, /published `\/demo` workspace/);
  assert.match(readme, /included `\/demo` registers eleven Sundae workbench tools/);
  assert.match(readme, /15 tools total/);
  assert.match(readme, /Challenge work added during the submission period/);
  assert.match(readme, /Sundae did not exist before this challenge/);
  assert.match(readme, /GPT-5\.6 Sol/);
  assert.match(readme, /GPT-5\.6 Terra/);
  assert.match(readme, /GPT-5\.6 Luna has WebMCP disabled/);
  assert.match(readme, /Work Cloud/);
  assert.match(readme, /page\.evaluate/);
  assert.match(readme, /Browser Use rejected this action due to browser security policy/);
  assert.match(readme, /The five tools a judge will see/);
  assert.match(readme, /pre-authored improved variant/);
  assert.match(readme, /does not discover tools registered inside iframes/);
  assert.doesNotMatch(readme, /any public page/);
  assert.match(readme, /a public page/);
});
