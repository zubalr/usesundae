import assert from "node:assert/strict";
import test from "node:test";

import type { AuditSnapshot, Finding } from "../lib/audit/types";
import {
  buildAgentBoardContext,
  buildVerificationReceipts,
  describeEvidenceBoard,
  invalidateVerificationForFindings,
  verificationLabel,
} from "../lib/workbench/evidence";
import { createToolResult, MAX_TOOL_TEXT_BYTES } from "../lib/webmcp/result";
import { activityActorLabel, activityTitle } from "../lib/workbench/types";

function finding(index: number): Finding {
  return {
    id: `mobile:contrast:item-${index}`,
    auditId: `item-${index}`,
    rule: "contrast",
    truth: index === 5 ? "judged" : "measured",
    category: index === 5 ? "ux" : undefined,
    productJob: index === 5 ? "Help a new visitor understand the next step" : undefined,
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

test("agent board context stays useful inside the WebMCP output budget", () => {
  const hostileCopy = `${'"\\\n\t'.repeat(80)}${"🙂".repeat(80)}`;
  const findings = Array.from({ length: 14 }, (_, index) => ({
    ...finding(index),
    id: `mobile:contrast:${"selected-or-measured-identity-".repeat(4)}${index}`,
    title: `${hostileCopy}${index}`,
    checkpointId: `checkpoint_${index}_${"a".repeat(80)}`,
  }));
  const selected = findings[9]!;
  const context = buildAgentBoardContext({
    auditGoal: hostileCopy,
    target: {
      kind: "public_checkpoint",
      displayUrl: `https://example.com/${"long-path/".repeat(30)}`,
      checkpointId: `checkpoint_${"b".repeat(120)}`,
      scopeId: `scope_${"c".repeat(120)}`,
      screenshotVisible: true,
      captureExtent: "viewport",
    },
    viewport: "mobile",
    state: "baseline",
    currentFindingCount: findings.length,
    retainedBaselineFindingCount: 0,
    currentMeasuredAt: "2030-01-01T10:00:00.000Z",
    selectedFindingId: selected.id,
    retainsBaseline: true,
    findings,
    decisions: Object.fromEntries(findings.map(({ id }) => [id, { decision: "accepted" }])),
    verifications: Object.fromEntries(findings.map(({ id }) => [id, { status: "still_open" }])),
    coverageGaps: Array.from({ length: 12 }, (_, index) => ({
      id: `gap-${index}`,
      label: `${hostileCopy}${index}`,
      detail: "This state was not observed. ".repeat(20),
    })),
    trailStepCount: 12,
  });
  const result = createToolResult(context);
  const text = result.content[0]!.text;
  const payload = JSON.parse(text) as {
    truncated?: boolean;
    target: { checkpoint_id: string };
    findings: Array<{
      id: string;
      checkpoint_id: string;
      evidence_role: string;
      category?: string;
      product_job?: string;
    }>;
    coverage_gaps: string[];
  };

  assert.ok(Buffer.byteLength(text, "utf8") <= MAX_TOOL_TEXT_BYTES);
  assert.notEqual(payload.truncated, true);
  assert.equal(payload.findings[0]?.id, selected.id.slice(0, 120));
  assert.equal(payload.findings[0]?.checkpoint_id.startsWith("checkpoint_9_"), true);
  assert.equal(payload.findings[0]?.evidence_role, "retained_baseline");
  assert.equal(payload.target.checkpoint_id.startsWith("checkpoint_"), true);
  assert.equal(payload.findings.length, 2);
  assert.equal(payload.coverage_gaps.length, 3);
});

test("agent board context exposes the product-job category for judged evidence", () => {
  const judged = finding(5);
  const context = buildAgentBoardContext({
    auditGoal: "Review activation",
    target: {
      kind: "included_live_target",
      path: "/demo",
      scopeId: "included:/demo:mobile",
      screenshotVisible: true,
    },
    viewport: "mobile",
    state: "baseline",
    currentFindingCount: 1,
    retainedBaselineFindingCount: 0,
    currentMeasuredAt: "2030-01-01T10:00:00.000Z",
    selectedFindingId: judged.id,
    retainsBaseline: false,
    findings: [judged],
    decisions: {},
    verifications: {},
    coverageGaps: [],
    trailStepCount: 0,
  });

  assert.equal(context.findings[0]?.category, "ux");
  assert.equal(context.findings[0]?.product_job, "Help a new visitor understand the next step");
});

test("agent board context lists at most four uncaptured visible-nav routes", () => {
  const context = buildAgentBoardContext({
    auditGoal: "Review activation",
    target: {
      kind: "public_checkpoint",
      displayUrl: "https://example.com/",
      checkpointId: "checkpoint-root",
      scopeId: "scope-root",
      screenshotVisible: true,
      captureExtent: "full-page",
    },
    viewport: "desktop",
    state: "baseline",
    currentFindingCount: 0,
    retainedBaselineFindingCount: 0,
    currentMeasuredAt: "2030-01-01T10:00:00.000Z",
    selectedFindingId: null,
    retainsBaseline: false,
    findings: [],
    decisions: {},
    verifications: {},
    coverageGaps: [],
    trailStepCount: 1,
    uncapturedNav: ["pricing", "docs", "about", "blog", "careers"].map((path) => ({
      url: `https://example.com/${path}?private=removed`,
      label: path,
    })),
  });

  assert.deepEqual(context.uncaptured_nav, [
    { label: "pricing", path: "/pricing" },
    { label: "docs", path: "/docs" },
    { label: "about", path: "/about" },
    { label: "blog", path: "/blog" },
  ]);
  assert.match(context.next, /capture_visible_nav/);
  assert.doesNotMatch(JSON.stringify(context), /private=removed/);
});

test("agent board context paginates exact actionable finding ids", () => {
  const findings = [1, 2, 3, 4, 5].map(finding);
  const input = {
    auditGoal: "Review activation",
    target: {
      kind: "included_live_target" as const,
      path: "/demo",
      scopeId: "included:/demo:mobile",
      screenshotVisible: true,
    },
    viewport: "mobile" as const,
    state: "baseline" as const,
    currentFindingCount: findings.length,
    retainedBaselineFindingCount: 0,
    currentMeasuredAt: "2030-01-01T10:00:00.000Z",
    selectedFindingId: null,
    retainsBaseline: false,
    findings,
    decisions: {},
    verifications: {},
    coverageGaps: [],
    trailStepCount: 0,
  };

  const first = buildAgentBoardContext({ ...input, findingOffset: 0 });
  const second = buildAgentBoardContext({ ...input, findingOffset: 2 });
  const withVisibleNav = buildAgentBoardContext({
    ...input,
    findingOffset: 0,
    uncapturedNav: [{ url: "https://example.com/docs", label: "Docs" }],
  });

  assert.equal(first.receipt, "Evidence unchanged; visible board-read receipt added.");
  assert.deepEqual(
    first.findings.map(({ id }) => id),
    [findings[0]!.id, findings[1]!.id],
  );
  assert.deepEqual(first.finding_page, { offset: 0, limit: 2, total: 5, next_offset: 2 });
  assert.deepEqual(
    second.findings.map(({ id }) => id),
    [findings[2]!.id, findings[3]!.id],
  );
  assert.deepEqual(second.finding_page, { offset: 2, limit: 2, total: 5, next_offset: 4 });
  assert.match(withVisibleNav.next, /finding_offset 2.*capture_visible_nav/);
});

test("agent context keeps route provenance distinct from the active checkpoint", () => {
  const routeA = { ...finding(1), checkpointId: "checkpoint-route-a", scopeKey: "scope-a" };
  const routeB = { ...finding(2), checkpointId: "checkpoint-route-b", scopeKey: "scope-b" };
  const context = buildAgentBoardContext({
    auditGoal: "Review signup clarity",
    target: {
      kind: "public_checkpoint",
      displayUrl: "https://example.com/checkout",
      checkpointId: "checkpoint-route-b",
      scopeId: "scope-b",
      screenshotVisible: true,
      captureExtent: "viewport",
    },
    viewport: "mobile",
    state: "improved",
    currentFindingCount: 2,
    retainedBaselineFindingCount: 2,
    currentMeasuredAt: "2030-01-01T10:00:00.000Z",
    selectedFindingId: routeA.id,
    retainsBaseline: true,
    findings: [routeA, routeB],
    decisions: {},
    verifications: {},
    coverageGaps: [],
    trailStepCount: 2,
  });

  assert.equal(context.target.checkpoint_id, "checkpoint-route-b");
  assert.equal(context.findings[0]?.checkpoint_id, "checkpoint-route-a");
  assert.equal(context.findings[0]?.evidence_role, "retained_baseline");
  assert.equal(context.scope.trail_steps, 2);
});

test("activity actors have explicit accessible labels", () => {
  assert.equal(activityActorLabel("human"), "Human action");
  assert.equal(activityActorLabel("agent"), "Agent action");
  assert.equal(activityActorLabel("system"), "System action");
  assert.equal(
    activityTitle({
      action: "Read evidence board",
      toolName: "get_board_context",
    }),
    "Read evidence board · get_board_context",
  );
});
