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
import { deriveCoverageSummary, findFindingSurface } from "../lib/workbench/coverage";

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
  assert.throws(
    () =>
      validateReviewResultScope(
        input,
        new Set(["included:/demo:desktop"]),
        new Set(["included-live-target"]),
        sampledSnapshot.gaps,
      ),
    /interaction.*not fully inspected/i,
  );
});

test("another route's gaps do not block an inspected no-issue result", () => {
  const input = {
    kind: "no_material_issue" as const,
    category: "interaction" as const,
    observation: "The visible primary control has a clear action label and affordance.",
    whyItSupportsJob: "The operator can predict the immediate action from this sampled state.",
    confidence: "medium" as const,
    scopeId: "scope-b",
    evidenceRef: "checkpoint-b",
  };

  assert.doesNotThrow(() =>
    validateReviewResultScope(input, new Set(["scope-a", "scope-b"]), new Set(["checkpoint-b"]), [
      {
        id: "gap-motion-window",
        label: "Motion and transition behavior",
        detail: "No motion window was captured on route A.",
        scopeKey: "scope-a",
      },
    ]),
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
  assert.equal(coverage.surfaces[0]?.interaction, "not_seen");
  assert.equal(coverage.openGapCount, 1);
});

test("sample coverage retains every inspected responsive viewport", () => {
  const mobile = {
    ...sampledSnapshot,
    capturedAt: "2030-01-01T10:01:00.000Z",
    viewport: "mobile" as const,
    viewportSize: { width: 390, height: 844 },
    scopeKey: "included:/demo:mobile",
  };
  const coverage = deriveCoverageSummary({
    mode: "sample",
    baseline: mobile,
    current: mobile,
    trail: [],
    baselinesByViewport: { desktop: sampledSnapshot, mobile },
  });

  assert.deepEqual(
    coverage.surfaces.map(({ scopeId, viewport }) => [scopeId, viewport]),
    [
      ["included:/demo:mobile", "mobile"],
      ["included:/demo:desktop", "desktop"],
    ],
  );
  assert.equal(new Set(coverage.surfaces.map(({ checkpointId }) => checkpointId)).size, 2);
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

test("coverage preserves each captured surface viewport", () => {
  const coverage = deriveCoverageSummary({
    mode: "remote",
    baseline: sampledSnapshot,
    current: sampledSnapshot,
    trail: [
      {
        checkpointId: "checkpoint-mobile-entry",
        scopeId: "scope-entry",
        label: "Entry",
        displayUrl: "https://example.com/",
        capturedAt: "2030-01-01T10:00:00.000Z",
        findingCount: 1,
        viewport: "mobile",
        surfaceType: "entry",
        captureExtent: "full-page",
      },
      {
        checkpointId: "checkpoint-desktop-pricing",
        scopeId: "scope-pricing",
        label: "Pricing",
        displayUrl: "https://example.com/pricing",
        capturedAt: "2030-01-01T10:01:00.000Z",
        findingCount: 0,
        viewport: "desktop",
        surfaceType: "pricing",
        captureExtent: "viewport",
      },
    ],
  });

  assert.deepEqual(
    coverage.surfaces.map(({ route, viewport }) => [route, viewport]),
    [
      ["/", "mobile"],
      ["/pricing", "desktop"],
    ],
  );
});

test("finding scope resolves the exact checkpoint before a shared scope", () => {
  const coverage = deriveCoverageSummary({
    mode: "remote",
    baseline: sampledSnapshot,
    current: sampledSnapshot,
    trail: [
      {
        checkpointId: "checkpoint-entry",
        scopeId: "scope-shared",
        label: "Entry",
        displayUrl: "https://example.com/",
        capturedAt: "2030-01-01T10:00:00.000Z",
        findingCount: 1,
        viewport: "desktop",
        state: "settled render",
      },
      {
        checkpointId: "checkpoint-verification",
        scopeId: "scope-shared",
        label: "Verification",
        displayUrl: "https://example.com/",
        capturedAt: "2030-01-01T10:02:00.000Z",
        findingCount: 1,
        viewport: "desktop",
        state: "verification",
      },
    ],
  });

  const surface = findFindingSurface(
    coverage.surfaces,
    finding({ checkpointId: "checkpoint-verification", scopeKey: "scope-shared" }),
  );
  assert.equal(surface?.checkpointId, "checkpoint-verification");
  assert.equal(surface?.state, "verification");
  assert.equal(
    findFindingSurface(
      coverage.surfaces,
      finding({ checkpointId: "checkpoint-evicted", scopeKey: "scope-evicted" }),
    ),
    undefined,
  );
});

test("finding scope fallback keeps the finding's exact responsive viewport", () => {
  const coverage = deriveCoverageSummary({
    mode: "remote",
    baseline: sampledSnapshot,
    current: sampledSnapshot,
    trail: [
      {
        checkpointId: "checkpoint-desktop",
        scopeId: "scope-shared",
        label: "Desktop entry",
        displayUrl: "https://example.com/",
        capturedAt: "2030-01-01T10:00:00.000Z",
        findingCount: 1,
        viewport: "desktop",
      },
      {
        checkpointId: "checkpoint-mobile",
        scopeId: "scope-shared",
        label: "Mobile entry",
        displayUrl: "https://example.com/",
        capturedAt: "2030-01-01T10:01:00.000Z",
        findingCount: 1,
        viewport: "mobile",
      },
    ],
  });
  const surface = findFindingSurface(coverage.surfaces, {
    ...finding({ scopeKey: "scope-shared" }),
    checkpointId: "checkpoint-stale",
    viewport: "mobile",
  });

  assert.equal(surface?.checkpointId, "checkpoint-mobile");
  assert.equal(surface?.viewport, "mobile");
});

test("coverage retains an inactive responsive viewport gap", () => {
  const mobile = {
    ...sampledSnapshot,
    viewport: "mobile" as const,
    viewportSize: { width: 390, height: 844 },
    scopeKey: "scope-mobile",
    gaps: [
      {
        id: "gap-below-fold",
        label: "Below-fold content",
        detail: "The full page did not fit the provider response budget.",
      },
    ],
  };
  const desktop = {
    ...sampledSnapshot,
    scopeKey: "scope-desktop",
    gaps: [],
  };
  const coverage = deriveCoverageSummary({
    mode: "remote",
    baseline: desktop,
    current: desktop,
    trail: [],
    baselinesByViewport: { mobile, desktop },
  });

  assert.equal(coverage.openGapCount, 1);
  assert.equal(coverage.hasUncoveredScope, true);
  assert.deepEqual(coverage.openGaps[0]?.viewports, ["mobile"]);
  assert.deepEqual(coverage.openGaps[0]?.targets, [
    { scopeId: "scope-mobile", viewport: "mobile" },
  ]);
});

test("coverage keeps a viewport fallback on its exact route when another route is full-page", () => {
  const aggregate: AuditSnapshot = {
    ...sampledSnapshot,
    scopeKey: undefined,
    gaps: [
      {
        id: "gap-below-fold",
        label: "Below-fold content",
        detail: "The root route remained viewport-only.",
        checkpointId: "checkpoint-root",
        scopeKey: "scope-root",
      },
    ],
  };
  const coverage = deriveCoverageSummary({
    mode: "remote",
    baseline: aggregate,
    current: aggregate,
    trail: [
      {
        checkpointId: "checkpoint-root",
        scopeId: "scope-root",
        label: "Entry",
        displayUrl: "https://example.com/",
        capturedAt: "2030-01-01T10:00:00.000Z",
        findingCount: 0,
        viewport: "desktop",
        captureExtent: "viewport",
      },
      {
        checkpointId: "checkpoint-pricing",
        scopeId: "scope-pricing",
        label: "Pricing",
        displayUrl: "https://example.com/pricing",
        capturedAt: "2030-01-01T10:01:00.000Z",
        findingCount: 0,
        viewport: "desktop",
        captureExtent: "full-page",
      },
    ],
  });

  assert.deepEqual(coverage.openGaps[0]?.targets, [
    {
      checkpointId: "checkpoint-root",
      scopeId: "scope-root",
      route: "/",
      viewport: "desktop",
    },
  ]);
});

test("coverage resolves stale gap receipts to the current checkpoint for the same route", () => {
  const refreshed: AuditSnapshot = {
    ...sampledSnapshot,
    scopeKey: "scope-root",
    gaps: [
      {
        id: "gap-flow-states",
        label: "Flow states",
        detail: "A multi-step flow was not opened.",
        checkpointId: "checkpoint-old",
        scopeKey: "scope-root",
      },
    ],
  };
  const coverage = deriveCoverageSummary({
    mode: "remote",
    baseline: refreshed,
    current: refreshed,
    trail: [
      {
        checkpointId: "checkpoint-current",
        scopeId: "scope-root",
        label: "Entry",
        displayUrl: "https://example.com/",
        capturedAt: "2030-01-01T10:02:00.000Z",
        findingCount: 0,
        viewport: "desktop",
        captureExtent: "full-page",
      },
    ],
  });

  assert.deepEqual(coverage.openGaps[0]?.targets, [
    {
      checkpointId: "checkpoint-current",
      scopeId: "scope-root",
      route: "/",
      viewport: "desktop",
    },
  ]);
  assert.equal(coverage.openGaps[0]?.checkpointId, "checkpoint-old");
});
