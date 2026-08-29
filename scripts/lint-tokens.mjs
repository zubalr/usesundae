#!/usr/bin/env node
/**
 * Token contract.
 *
 * Docs are a suggestion, CI is a contract. A design system only holds if the
 * wrong thing is unrepresentable, so this rejects raw values everywhere except
 * the one file allowed to define them.
 *
 *   app/globals.css   may declare raw hex, rgb and px  (the primitive layer)
 *   everywhere else   must go through var(--token)
 *
 * Run: npm run lint:tokens
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const PRIMITIVE_FILE = "app/globals.css";
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "scripts", "tests"]);

const RULES = [
  {
    id: "raw-color",
    re: /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g,
    msg: "raw colour — use var(--accent), var(--surface), var(--text-primary)…",
  },
  {
    id: "raw-space",
    re: /(?<![\w-])(?:margin|padding|gap|top|right|bottom|left|inset)(?:-[a-z]+)?\s*:\s*[^;{}]*?\b\d+(?:\.\d+)?px/g,
    msg: "raw px spacing — use var(--space-m), var(--space-l)…",
  },
  {
    id: "raw-duration",
    re: /(?:transition|animation)(?:-duration)?\s*:\s*[^;{}]*?\b\d+(?:\.\d+)?m?s/g,
    msg: "raw duration — use var(--duration-fast), var(--duration-base)…",
  },
  {
    id: "named-color",
    re: /(?<![\w-])(?:color|background(?:-color)?|border-color|fill|stroke)\s*:\s*(?:white|black|red|blue|green|gray|grey)\b/g,
    msg: "named colour — use a semantic token",
  },
];

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (/\.(css|tsx|jsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

/* Baseline: existing drift is recorded, not fixed in one pass. CI fails only on
   NEW violations, and the count ratchets down as files are migrated.
   Regenerate deliberately with:  npm run lint:tokens -- --update-baseline   */
const BASELINE = join(ROOT, "scripts/token-baseline.json");
const updating = process.argv.includes("--update-baseline");
const baseline = existsSync(BASELINE)
  ? new Set(JSON.parse(readFileSync(BASELINE, "utf8")).entries)
  : new Set();

/* --file <path> checks one file, for the post-edit hook. Whole-repo otherwise. */
const fileArg = process.argv.indexOf("--file");
const files =
  fileArg !== -1 && process.argv[fileArg + 1] ? [process.argv[fileArg + 1]] : await walk(ROOT);
const found = [];

for (const file of files) {
  const rel = relative(ROOT, file);
  if (rel === PRIMITIVE_FILE) continue;

  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (/^\s*(\/\*|\*|\/\/)/.test(line)) return; // comments
    if (/lint-tokens-allow/.test(line)) return; // deliberate escape hatch
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      if (!rule.re.exec(line)) continue;
      found.push({
        key: `${rel}::${rule.id}::${line.trim()}`,
        rel,
        line: i + 1,
        rule,
        text: line.trim(),
      });
    }
  });
}

if (updating) {
  writeFileSync(BASELINE, JSON.stringify({ entries: found.map((f) => f.key) }, null, 2) + "\n");
  console.log(`Baseline written: ${found.length} known violations recorded.`);
  process.exit(0);
}

const fresh = found.filter((f) => !baseline.has(f.key));
const fixed = baseline.size - (found.length - fresh.length);

for (const f of fresh) {
  console.error(
    `  ${f.rel}:${f.line}  ${f.rule.id}\n` + `    ${f.text.slice(0, 92)}\n` + `    → ${f.rule.msg}`,
  );
}

if (fresh.length) {
  console.error(
    `\n${fresh.length} NEW token violation${fresh.length === 1 ? "" : "s"}.\n` +
      `Raw values belong in ${PRIMITIVE_FILE}. Everywhere else uses var(--token).\n` +
      `If a value genuinely cannot be a token, append  /* lint-tokens-allow */  and say why.\n`,
  );
  process.exit(1);
}

console.log(
  `Token contract clean — ${files.length} files, no new violations.` +
    (baseline.size
      ? `  Baseline: ${baseline.size} known${fixed > 0 ? `, ${fixed} fixed since` : ""}.`
      : ""),
);
