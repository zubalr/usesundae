import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const readSource = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");

function tokenRem(css: string, name: string) {
  const match = css.match(new RegExp(`${name}:\\s*([0-9.]+)rem`));
  assert.ok(match, `expected token ${name}`);
  return Number(match[1]) * 16;
}

function tokenCalcPx(css: string, name: string, tokens: Record<string, number>) {
  const match = css.match(
    new RegExp(`${name}:\\s*calc\\(var\\((--space-[\\w-]+)\\) \\+ var\\((--space-[\\w-]+)\\)\\)`),
  );
  if (!match) return null;
  return tokens[match[1]!]! + tokens[match[2]!]!;
}

function mediaBlock(css: string, query: string) {
  const start = css.indexOf(`@media (${query})`);
  assert.ok(start >= 0, `expected ${query} media query`);
  let depth = 0;
  for (let index = start; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(start, index + 1);
    }
  }
  throw new Error(`Unclosed ${query} media query`);
}

function ruleBody(css: string, selector: string) {
  const match = css.match(
    new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]+)\\}`),
  );
  return match?.[1] ?? "";
}

function usesVar(body: string, property: string, token: string) {
  return new RegExp(`${property}:\\s*var\\(${token}\\)`).test(body);
}

test("mobile CSS keeps launcher chrome inside a 390x844 first viewport budget", () => {
  const tokensCss = readSource("app", "globals.css");
  const pageCss = readSource("app", "page.module.css");
  const launcherCss = readSource("components", "AuditLauncher.module.css");
  const mobilePage = mediaBlock(pageCss, "max-width: 40rem");
  const mobileLauncher = mediaBlock(launcherCss, "max-width: 40rem");
  const tokens = {
    "--space-2xs": tokenRem(tokensCss, "--space-2xs"),
    "--space-xs": tokenRem(tokensCss, "--space-xs"),
    "--space-s": tokenRem(tokensCss, "--space-s"),
    "--space-m": tokenRem(tokensCss, "--space-m"),
    "--space-l": tokenRem(tokensCss, "--space-l"),
    "--space-xl": tokenRem(tokensCss, "--space-xl"),
    "--space-2xl": tokenRem(tokensCss, "--space-2xl"),
    "--text-xs": tokenRem(tokensCss, "--text-xs"),
    "--text-s": tokenRem(tokensCss, "--text-s"),
    "--text-m": tokenRem(tokensCss, "--text-m"),
    "--text-2xl": tokenRem(tokensCss, "--text-2xl"),
  };

  const masthead = ruleBody(mobilePage, ".masthead");
  const hero = ruleBody(mobilePage, ".hero");
  const thesis = ruleBody(mobilePage, ".heroThesis");
  const command = ruleBody(mobilePage, ".commandStrip");
  const launcher = ruleBody(mobileLauncher, ".launcher") || ruleBody(launcherCss, ".launcher");
  const demoAction =
    ruleBody(mobileLauncher, ".demoAction") || ruleBody(launcherCss, ".demoAction");
  const inputMin =
    tokenCalcPx(launcherCss, "min-block-size", tokens) ??
    tokens["--space-xl"]! + tokens["--space-xs"]!;

  assert.ok(
    usesVar(masthead, "min-block-size", "--space-xl") ||
      usesVar(masthead, "min-block-size", "--space-l"),
  );
  assert.doesNotMatch(masthead, /min-block-size:\s*var\(--space-2xl\)/);
  assert.match(hero, /padding-block:\s*var\(--space-s\)/);
  assert.ok(usesVar(thesis, "gap", "--space-s") || usesVar(thesis, "gap", "--space-xs"));
  assert.ok(
    usesVar(thesis, "margin-bottom", "--space-s") || usesVar(thesis, "margin-bottom", "--space-xs"),
  );
  assert.ok(usesVar(command, "padding", "--space-s") || usesVar(command, "padding", "--space-xs"));
  assert.ok(usesVar(launcher, "gap", "--space-xs") || usesVar(launcher, "gap", "--space-2xs"));
  assert.doesNotMatch(
    demoAction,
    /min-block-size:\s*calc\(var\(--space-xl\) \+ var\(--space-xs\)\)/,
  );

  const stack =
    tokens["--space-xl"]! +
    tokens["--space-xl"]! +
    tokens["--space-s"]! +
    tokens["--text-xs"]! * 1.15 +
    tokens["--space-s"]! +
    tokens["--text-2xl"]! * 1.15 * 3 +
    tokens["--space-s"]! +
    tokens["--text-m"]! * 1.55 * 3 +
    tokens["--space-s"]! +
    tokens["--space-s"]! * 2 +
    tokens["--text-m"]! * 1.15 +
    tokens["--space-xs"]! +
    tokens["--text-xs"]! +
    tokens["--space-2xs"]! +
    inputMin +
    tokens["--space-xs"]! +
    tokens["--text-xs"]! +
    tokens["--space-2xs"]! +
    inputMin +
    tokens["--space-xs"]! +
    inputMin +
    tokens["--space-xs"]! +
    tokens["--space-xl"]!;

  assert.ok(stack <= 844, `first-viewport CSS budget ${stack}px exceeds 844px`);
  assert.match(readSource("app", "page.tsx"), /How it works/);
  assert.match(readSource("app", "page.tsx"), /Live demo/);
  assert.match(readSource("app", "page.tsx"), /GitHub/);
  assert.match(readSource("app", "page.tsx"), /Judge path/);
});

test("production geometry is a separate fail-closed release command", () => {
  const packageJson = JSON.parse(readSource("package.json")) as {
    scripts: Record<string, string>;
  };
  const verifier = readSource("scripts", "verify-landing-production.ts");

  assert.equal(
    packageJson.scripts["verify:production"],
    "tsx scripts/verify-landing-production.ts",
  );
  assert.match(verifier, /SUNDAE_GEOMETRY_ORIGIN is required/);
  assert.match(verifier, /https:\/\/usesundae\.vercel\.app/);
  assert.match(verifier, /scrollWidth/);
  assert.match(verifier, /primary CTA is below the viewport/);
  assert.match(verifier, /INCLUDED_DEMO_PRIMARY_ACTION_MIN_HEIGHT_PX/);
});
