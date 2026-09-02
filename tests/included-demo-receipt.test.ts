import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { findingIdentity, TAP_TARGET_MIN_PX } from "../lib/audit/measurements";
import {
  demoBaselinePrimaryActionMinHeightPx,
  INCLUDED_DEMO_PRIMARY_ACTION_MIN_HEIGHT_PX,
  includedDemoProofReceipt,
} from "../lib/demo/included-receipt";

const root = process.cwd();
const readSource = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");

test("the hero proof states the included demo's source-level tap-target evidence", () => {
  const demoPage = readSource("app", "demo", "page.tsx");
  const demoCss = readSource("app", "demo", "demo.module.css");
  const landing = readSource("app", "page.tsx");
  const size = demoBaselinePrimaryActionMinHeightPx(demoCss);
  const receipt = includedDemoProofReceipt();

  assert.match(demoPage, /id="primary-action"/);
  assert.equal(size, INCLUDED_DEMO_PRIMARY_ACTION_MIN_HEIGHT_PX);
  assert.ok(size < TAP_TARGET_MIN_PX);
  assert.equal(receipt.findingId, findingIdentity("mobile", "tap-target", "primary-action"));
  assert.match(receipt.evidence, new RegExp(`${size}px`));
  assert.match(receipt.evidence, new RegExp(`${TAP_TARGET_MIN_PX}px`));
  assert.match(receipt.evidence, /CSS minimum height/);
  assert.match(receipt.meaning, /configured with/);
  assert.doesNotMatch(`${receipt.meaning}\n${receipt.evidence}`, /measures|measured/i);
  assert.match(landing, /includedDemoProofReceipt/);
  assert.match(landing, /proof\.title/);
  assert.match(landing, /proof\.meaning/);
  assert.match(landing, /proof\.evidence/);
  assert.doesNotMatch(landing, /4\.09:1/);
  assert.doesNotMatch(landing, /28 undersized/);
  assert.doesNotMatch(receipt.title, /\d+(?:\.\d+)?\s*(?::1|px)/);
  assert.doesNotMatch(
    `${receipt.title}\n${receipt.meaning}\n${receipt.evidence}`,
    /convert|revenue/i,
  );
});
