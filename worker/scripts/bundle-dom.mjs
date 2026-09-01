import { build } from "esbuild";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const result = await build({
  absWorkingDir: root,
  entryPoints: ["lib/audit/dom.ts"],
  bundle: true,
  format: "iife",
  globalName: "SundaeDom",
  write: false,
});
const source = result.outputFiles[0]?.text;
if (!source) throw new Error("esbuild did not emit the Sundae DOM bundle.");
writeFileSync(
  join(root, "worker/src/dom-source.js"),
  `export const DOM_SOURCE = ${JSON.stringify(source)};\n`,
);
