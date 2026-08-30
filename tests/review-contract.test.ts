import assert from "node:assert/strict";
import test from "node:test";

import type { AuditSnapshot, Finding } from "../lib/audit/types";
import {
  createAuditBrief,
  createReviewResult,
  orderFindingsForReview,
  reviewLane,
  validateReviewResultScope,
  withoutConflictingNoIssue,
} from "../lib/audit/review";
import { deriveCoverageSummary } from "../lib/workbench/coverage";

const sampledSnapshot: AuditSnapshot = {
  capturedAt: "2030-01-01T10:00:00.000Z",
  demoState: "baseline",
  viewport: "desktop",
  viewportSize: { width: 1440, height: 900 },
  scopeKey: "included:/demo:desktop",
  findings: [],
  gaps: [
    {
      id: "gap-motion-window",
      label: "Motion and transition behavior",
      detail: "No reproducible motion window was captured.",
    },
  ],
};

function finding(overrides: Partial<Finding>): Finding {
  return {
    id: "desktop:contrast:helper-copy",
    auditId: "helper-copy",
    rule: "contrast",
    truth: "measured",
    severity: "high",
    title: "Supporting contrast fact",
    observation: "The measured value is below the stated threshold.",
    whyItMatters: "Some text may be difficult to read.",
    recommendation: "Increase the text contrast.",
    viewport: "desktop",
    rect: null,
    measurement: { value: "3.2:1", threshold: "4.5:1", unit: "ratio" },
    scopeKey: "included:/demo:desktop",
    ...overrides,
  };
}

test("an audit brief is bounded, provisional, and preserves the supplied goal", () => {
  const brief = createAuditBrief(
    {
      productCategory: "Product operations dashboard",
      audience: "Product operations lead",
      productJob: "Find workflows that need attention",
      visibleProposition: "See operational exceptions in one place",
      primaryAction: "Review workflows",
      confidence: "medium",
      evidenceRefs: ["included-live-target", "included-live-target"],
      unresolvedQuestions: ["What happens after selecting a workflow?"],
    },
    "Review activation clarity",
    "2030-01-01T10:00:00.000Z",
  );

  assert.equal(brief.auditGoal, "Review activation clarity");
  assert.equal(brief.status, "provisional");
  assert.deepEqual(brief.evidenceRefs, ["included-live-target"]);
  assert.equal(brief.confidence, "medium");
});

test("an audit brief cannot exist without visible evidence", () => {
  assert.throws(
    () =>
      createAuditBrief(
        {
          productCategory: "Dashboard",
          audience: "Operator",
          productJob: "Find work needing attention",
          visibleProposition: "See active work",
          primaryAction: "Review work",
          confidence: "low",
          evidenceRefs: [],
          unresolvedQuestions: [],
        },
        "",
      ),
    /evidence reference/i,
  );
});

test("strengths and inspected no-issue results remain separate from faults", () => {
  const strength = createReviewResult(
    {
      kind: "strength",
      category: "ui",
      observation: "The exception count and status labels create a useful first scan.",
      whyItSupportsJob: "The intended operator can locate urgent work without reading every row.",
      confidence: "high",
      scopeId: "included:/demo:desktop",
      evidenceRef: "included-live-target",
    },
    1,
    "2030-01-01T10:00:00.000Z",
  );

  assert.equal(strength.kind, "strength");
  assert.equal(strength.category, "ui");
  assert.equal(strength.confidence, "high");
  assert.match(strength.id, /^review-strength-ui-/);
});

test("a later judged fault invalidates a conflicting no-issue result", () => {
  const noIssue = createReviewResult(
    {
      kind: "no_material_issue",
      category: "ux",
      observation: "No material navigation issue was observed.",
      whyItSupportsJob: "The next step was visible in this sampled state.",
      confidence: "medium",
      scopeId: "included:/demo:desktop",
      evidenceRef: "included-live-target",
    },
    1,
  );
  const judged = finding({
    id: "desktop:visual-judgment:unclear-next-step",
    rule: "visual-judgment",
    truth: "judged",
    category: "ux",
    measurement: null,
  });

  assert.deepEqual(withoutConflictingNoIssue([noIssue], judged), []);
});

test("no-material-issue requires evidence from an inspected scope", () => {
  const input = {
    kind: "no_material_issue" as const,
    category: "interaction" as const,
    observation: "The visible primary control has a clear action label and affordance.",
    whyItSupportsJob: "The operator can predict the immediate action from this sampled state.",
    confidence: "medium" as const,
    scopeId: "included:/demo:desktop",
    evidenceRef: "included-live-target",
  };

  assert.doesNotThrow(() =>
    validateReviewResultScope(
      input,
      new Set(["included:/demo:desktop"]),
      new Set(["included-live-target"]),
    ),
  );
  assert.throws(
    () =>
      validateReviewResultScope(
        input,
        new Set(["included:/demo:mobile"]),
        new Set(["included-live-target"]),
      ),
    /inspected scope/i,
  );
  assert.throws(
    () =>
      validateReviewResultScope(
        input,
        new Set(["included:/demo:desktop"]),
        new Set(["checkpoint-other-scope"]),
      ),
    /same inspected scope/i,
  );
});

test("product judgments lead while deterministic facts remain supporting evidence", () => {
  const judged = finding({
    id: "desktop:visual-judgment:buried-action",
    rule: "visual-judgment",
    truth: "judged",
    category: "ux",
    severity: "medium",
    confidence: "high",
    title: "The next action conflicts with the populated state",
    measurement: null,
  });
  const measured = finding({});

  assert.equal(reviewLane(judged), "product");
  assert.equal(reviewLane(measured), "supporting");
  assert.deepEqual(
    orderFindingsForReview([measured, judged]).map(({ id }) => id),
    [judged.id, measured.id],
  );
});

test("coverage reports sampled evidence and keeps motion explicitly not seen", () => {
  const coverage = deriveCoverageSummary({
    mode: "sample",
    baseline: sampledSnapshot,
    current: sampledSnapshot,
    trail: [],
  });

  assert.equal(coverage.surfaces.length, 1);
  assert.equal(coverage.surfaces[0]?.surfaceType, "entry");
  assert.equal(coverage.surfaces[0]?.finalUrl, "/demo");
  assert.equal(coverage.surfaces[0]?.captureExtent, "viewport");
  assert.equal(coverage.surfaces[0]?.motion, "not_seen");
  assert.equal(coverage.openGapCount, 1);
});

test("coverage distinguishes a reversible preview from explicit verification", () => {
  const preview = {
    ...sampledSnapshot,
    capturedAt: "2026-08-30T02:00:00.000Z",
    demoState: "improved" as const,
  };
  const beforeVerification = deriveCoverageSummary({
    mode: "sample",
    baseline: sampledSnapshot,
    current: preview,
    trail: [],
  });
  const afterVerification = deriveCoverageSummary({
    mode: "sample",
    baseline: sampledSnapshot,
    current: preview,
    trail: [],
    hasVerification: true,
  });

  assert.equal(beforeVerification.surfaces[1]?.label, "Reversible preview");
  assert.equal(beforeVerification.surfaces[1]?.reason, "Preview measurement; not verification");
  assert.equal(afterVerification.surfaces[1]?.label, "Fresh verification");
  assert.equal(
    afterVerification.surfaces[1]?.reason,
    "Comparable recapture after explicit verification",
  );
});
