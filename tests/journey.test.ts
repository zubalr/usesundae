import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSameJourneyOrigin,
  mergeBelowFoldSnapshot,
  mergeJourneySnapshots,
} from "../lib/workbench/journey";
import type { AuditSnapshot, Finding } from "../lib/audit/types";

function snapshot(scopeKey: string, id: string, gapLabel: string): AuditSnapshot {
  const finding: Finding = {
    id,
    auditId: id,
    rule: "accessible-name",
    truth: "measured",
    severity: "high",
    title: id,
    observation: "Observed in the rendered checkpoint.",
    whyItMatters: "The issue may block understanding.",
    recommendation: "Correct the exposed name.",
    viewport: "desktop",
    rect: null,
    measurement: { value: "1", threshold: "0", unit: "controls" },
    scopeKey,
  };
  return {
    capturedAt: "2030-01-01T10:00:00.000Z",
    demoState: "baseline",
    viewport: "desktop",
    viewportSize: { width: 1440, height: 900 },
    scopeKey,
    findings: [finding],
    gaps: [{ id: gapLabel, label: gapLabel, detail: "Not observed." }],
  };
}

test("journey steps stay on the active origin", () => {
  assert.equal(
    assertSameJourneyOrigin("https://example.com", "https://example.com/checkout"),
    "https://example.com/checkout",
  );
  assert.throws(
    () => assertSameJourneyOrigin("https://example.com", "https://other.example/checkout"),
    /active origin/i,
  );
  assert.throws(
    () => assertSameJourneyOrigin("https://example.com", "ftp://example.com/file"),
    /http or https/i,
  );
});

test("journey steps preserve hash-routed application state", () => {
  assert.equal(
    assertSameJourneyOrigin("https://example.com", "https://example.com/app?plan=pro#/checkout"),
    "https://example.com/app?plan=pro#/checkout",
  );
});

test("journey snapshots retain route-scoped findings and deduplicate gaps", () => {
  const pricing = snapshot(
    "https://example.com/pricing",
    "pricing-finding",
    "Unvisited flow states",
  );
  const checkout = snapshot(
    "https://example.com/checkout",
    "checkout-finding",
    "Unvisited flow states",
  );
  const merged = mergeJourneySnapshots(pricing, checkout);

  assert.deepEqual(
    merged.findings.map((finding) => finding.id),
    ["pricing-finding", "checkout-finding"],
  );
  assert.equal(merged.gaps.length, 1);
  assert.equal(merged.scopeKey, undefined);
  assert.equal(merged.capturedAt, checkout.capturedAt);
});

test("refreshing one route replaces its measurements but retains judgments and other routes", () => {
  const pricing = snapshot("scope-pricing", "pricing-measured", "Unvisited flow states");
  pricing.findings.push({
    ...pricing.findings[0]!,
    id: "pricing-judgment",
    auditId: "pricing-judgment",
    rule: "visual-judgment",
    truth: "judged",
    measurement: null,
  });
  const checkout = snapshot("scope-checkout", "checkout-measured", "Unvisited flow states");
  const aggregate = mergeJourneySnapshots(pricing, checkout);
  const refreshedPricing = snapshot(
    "scope-pricing",
    "pricing-new-measurement",
    "Unvisited flow states",
  );
  const refreshed = mergeJourneySnapshots(aggregate, refreshedPricing);

  assert.deepEqual(
    refreshed.findings.map((finding) => finding.id),
    ["pricing-judgment", "checkout-measured", "pricing-new-measurement"],
  );
  assert.equal(refreshed.scopeKey, undefined);
});

test("a full-page checkpoint closes the below-fold gap for one active scope", () => {
  const viewport = snapshot("scope-page", "viewport-finding", "Unvisited flow states");
  viewport.gaps.unshift({
    id: "gap-below-fold",
    label: "Below-the-fold visuals",
    detail: "The viewport did not show the rest of this page.",
  });
  const fullPage = snapshot("scope-page", "full-page-finding", "Unvisited flow states");

  const merged = mergeBelowFoldSnapshot(viewport, fullPage);

  assert.equal(merged.scopeKey, "scope-page");
  assert.equal(
    merged.gaps.some((gap) => gap.id === "gap-below-fold"),
    false,
  );
});

test("a full-page checkpoint does not close below-fold coverage for another route", () => {
  const viewport = snapshot("scope-page", "viewport-finding", "Unvisited flow states");
  viewport.gaps.unshift({
    id: "gap-below-fold",
    label: "Below-the-fold visuals",
    detail: "At least one route is still viewport-bounded.",
  });
  const otherRoute = snapshot("scope-other", "other-finding", "Motion beyond load");
  const journey = mergeJourneySnapshots(viewport, otherRoute);
  const fullPage = snapshot("scope-page", "full-page-finding", "Unvisited flow states");

  const merged = mergeBelowFoldSnapshot(journey, fullPage);

  assert.equal(merged.scopeKey, undefined);
  assert.equal(
    merged.gaps.some((gap) => gap.id === "gap-below-fold"),
    true,
  );
});
