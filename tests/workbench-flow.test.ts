import assert from "node:assert/strict";
import test from "node:test";

import type { AuditSnapshot, Finding } from "../lib/audit/types";
import {
  buildVerificationReceipts,
  describeEvidenceBoard,
  invalidateVerificationForFindings,
  verificationLabel,
} from "../lib/workbench/evidence";

function finding(index: number): Finding {
  return {
    id: `mobile:contrast:item-${index}`,
    auditId: `item-${index}`,
    rule: "contrast",
    truth: index === 5 ? "judged" : "measured",
    severity: "high",
    title: `Finding ${index}`,
    observation: "Baseline evidence is below the stated threshold.",
    whyItMatters: "The evidence may affect product quality.",
    recommendation: "Improve the included target state.",
    viewport: "mobile",
    rect: { x: 10, y: index * 20, width: 100, height: 18 },
    measurement: index === 5 ? null : { value: "3.25:1", threshold: "4.5:1", unit: "ratio" },
  };
}

const baseline: AuditSnapshot = {
  capturedAt: "2030-01-01T10:00:00.000Z",
  demoState: "baseline",
  viewport: "mobile",
  viewportSize: { width: 390, height: 700 },
  findings: [1, 2, 3, 4, 5].map(finding),
  gaps: [],
};

test("baseline → preview → recapture keeps current and historical evidence distinct", () => {
  const initial = describeEvidenceBoard(baseline, baseline, "baseline", "mobile");
  assert.equal(initial.summary, "5 current findings from a fresh mobile measurement");
  assert.equal(initial.retainsBaseline, false);
  assert.equal(initial.listLabel, "Current findings");

  const improved: AuditSnapshot = {
    ...baseline,
    capturedAt: "2030-01-01T10:01:00.000Z",
    demoState: "improved",
    findings: [],
  };
  const preview = describeEvidenceBoard(baseline, improved, "improved", "mobile");
  assert.equal(preview.summary, "0 current findings · 5 retained baseline findings");
  assert.equal(preview.currentCount, 0);
  assert.equal(preview.retainsBaseline, true);
  assert.equal(preview.listLabel, "Retained baseline findings");
  assert.equal(preview.truthLabel, "Baseline evidence");

  const recapture = buildVerificationReceipts(
    baseline.findings,
    improved,
    "2030-01-01T10:01:00.000Z",
  );
  assert.deepEqual(recapture.summary, { fixed: 4, still_open: 0, unverified: 1 });
  assert.equal(recapture.receipts[baseline.findings[0]!.id]?.status, "fixed");
  assert.equal(recapture.receipts[baseline.findings[0]!.id]?.after, "Not reproduced");
  assert.equal(
    verificationLabel(recapture.receipts[baseline.findings[0]!.id]!.status),
    "Verified fixed",
  );
  assert.equal(recapture.receipts[baseline.findings[4]!.id]?.status, "unverified");

  const desktopReceipt = {
    "desktop:contrast:item": {
      status: "fixed" as const,
      before: "3.25:1",
      after: "Not reproduced",
      at: "2030-01-01T10:01:00.000Z",
    },
  };
  const afterLeavingImprovedMobile = invalidateVerificationForFindings(
    { ...recapture.receipts, ...desktopReceipt },
    baseline.findings,
  );
  assert.equal(afterLeavingImprovedMobile[baseline.findings[0]!.id], undefined);
  assert.deepEqual(
    afterLeavingImprovedMobile["desktop:contrast:item"],
    desktopReceipt["desktop:contrast:item"],
  );
});

test("recapturing another route never verifies a route-scoped finding", () => {
  const routeFinding = {
    ...finding(1),
    scopeKey: "https://example.com/pricing",
  };
  const otherRoute: AuditSnapshot = {
    ...baseline,
    scopeKey: "https://example.com/checkout",
    findings: [],
  };

  const comparison = buildVerificationReceipts(
    [routeFinding],
    otherRoute,
    "2030-01-01T10:02:00.000Z",
  );
  assert.deepEqual(comparison.summary, { fixed: 0, still_open: 0, unverified: 1 });
});

test("a direct baseline recapture is shown beside retained evidence", () => {
  const recaptured: AuditSnapshot = {
    ...baseline,
    capturedAt: "2030-01-01T10:02:30.000Z",
    findings: [],
  };
  const description = describeEvidenceBoard(baseline, recaptured, "baseline", "mobile");

  assert.equal(description.retainsBaseline, true);
  assert.equal(description.summary, "0 current findings · 5 retained baseline findings");
  assert.equal(description.listLabel, "Retained baseline findings");
});

test("a generated DOM identity cannot be called fixed when continuity is uncertain", () => {
  const unstable = {
    ...finding(1),
    identityConfidence: "unstable" as const,
  };
  const comparison = buildVerificationReceipts(
    [unstable],
    { ...baseline, findings: [] },
    "2030-01-01T10:03:00.000Z",
  );

  assert.deepEqual(comparison.summary, { fixed: 0, still_open: 0, unverified: 1 });
});
