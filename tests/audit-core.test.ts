import assert from "node:assert/strict";
import test from "node:test";

import {
  accessibleNamePasses,
  contrastRatio,
  findingIdentity,
  tapTargetPasses,
} from "../lib/audit/measurements";
import { compareFinding } from "../lib/audit/recapture";
import type { Finding } from "../lib/audit/types";

function finding(id: string): Finding {
  return {
    id,
    auditId: "primary-action",
    rule: "tap-target",
    truth: "measured",
    severity: "high",
    title: "Primary action is difficult to target",
    observation: "The action measures 36 × 36 px; the threshold is 44 × 44 px.",
    whyItMatters: "Small targets can be harder to activate accurately.",
    recommendation: "Increase the interactive hit area to at least 44 × 44 px.",
    viewport: "mobile",
    rect: { x: 10, y: 10, width: 36, height: 36 },
    measurement: { value: "36 × 36", threshold: "44 × 44", unit: "CSS px" },
  };
}

test("contrast uses the WCAG relative luminance ratio", () => {
  assert.equal(contrastRatio("#000000", "#ffffff"), 21);
  assert.equal(contrastRatio("rgb(255, 255, 255)", "#fff"), 1);
  assert.ok(Math.abs(contrastRatio("#8b8f96", "#ffffff") - 3.25) < 0.02);
});

test("tap targets pass only when both dimensions meet the threshold", () => {
  assert.equal(tapTargetPasses({ width: 44, height: 44 }), true);
  assert.equal(tapTargetPasses({ width: 60, height: 43.9 }), false);
});

test("an accessible name must contain visible characters", () => {
  assert.equal(accessibleNamePasses("Save changes"), true);
  assert.equal(accessibleNamePasses("  \n "), false);
  assert.equal(accessibleNamePasses(null), false);
});

test("finding identities stay stable across recaptures", () => {
  assert.equal(
    findingIdentity("mobile", "tap-target", "primary-action"),
    "mobile:tap-target:primary-action",
  );
});

test("recapture never reports fixed when the original scope was not measured", () => {
  const before = finding("mobile:tap-target:primary-action");
  const judged = { ...before, truth: "judged" as const, measurement: null };

  assert.equal(compareFinding(before, [], false), "unverified");
  assert.equal(compareFinding(before, [before], true), "still_open");
  assert.equal(compareFinding(before, [], true), "fixed");
  assert.equal(compareFinding(judged, [], true), "unverified");
  assert.equal(compareFinding(judged, [judged], true), "still_open");
});
