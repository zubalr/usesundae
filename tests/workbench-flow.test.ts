import assert from "node:assert/strict";
import test from "node:test";

import type { AuditSnapshot, Finding } from "../lib/audit/types";
import {
  buildAgentBoardContext,
  buildVerificationReceipts,
  describeAgentAuthority,
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
    confidence: index === 5 ? "medium" : undefined,
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

test("agent authority keeps pre-capture public scope honest", () => {
  assert.deepEqual(describeAgentAuthority("remote", null), {
    label: "Public workspace",
    scope: "No checkpoint yet",
    scopeTitle: undefined,
  });
  assert.deepEqual(
    describeAgentAuthority("remote", { id: "checkpoint-1", scopeId: "scope-public" }),
    {
      label: "Public checkpoint",
      scope: "checkpoint-1",
      scopeTitle: "scope-public",
    },
  );
  assert.deepEqual(describeAgentAuthority("sample", null, "included:/demo:mobile"), {
    label: "Included workspace",
    scope: "included:/demo:mobile",
    scopeTitle: "included:/demo:mobile",
  });
});

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
      viewports: ["mobile" as const],
    })),
    trailStepCount: 12,
    uncapturedNav: Array.from({ length: 4 }, (_, index) => ({
      url: `https://example.com/${"long-route/".repeat(10)}${index}?private=removed`,
      label: `${hostileCopy}${index}`,
    })),
  });
  const wrappedContext = {
    ...context,
    tool_name: "get_board_context",
    actor: "agent",
    status: "success",
    elapsed_ms: 12,
  };
  const result = createToolResult(wrappedContext);
  const text = result.content[0]!.text;
  const wrappedBytes = Buffer.byteLength(JSON.stringify(wrappedContext), "utf8");
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
  assert.ok(
    wrappedBytes <= MAX_TOOL_TEXT_BYTES,
    `The complete board context and receipt metadata used ${wrappedBytes} bytes.`,
  );
  assert.notEqual(payload.truncated, true);
  assert.equal(payload.findings[0]?.id, selected.id.slice(0, 120));
  assert.equal(payload.findings[0]?.checkpoint_id.startsWith("checkpoint_9_"), true);
  assert.equal(payload.findings[0]?.evidence_role, "retained_baseline");
  assert.equal(payload.target.checkpoint_id.startsWith("checkpoint_"), true);
  assert.equal(payload.findings.length, 1);
  assert.equal(payload.coverage_gaps.length, 4);
  assert.match(payload.coverage_gaps[0]!, /^gap-/);
  assert.equal(context.uncaptured_nav?.length, 4);
});

test("mutated review board keeps actionable structure inside the WebMCP budget", () => {
  const findings = Array.from({ length: 8 }, (_, index) => finding(index));
  const context = buildAgentBoardContext({
    auditGoal: "Review onboarding clarity",
    target: {
      kind: "included_live_target",
      path: "/demo",
      scopeId: "included:/demo:mobile",
      screenshotVisible: true,
    },
    viewport: "mobile",
    state: "improved",
    currentFindingCount: 7,
    retainedBaselineFindingCount: 8,
    currentMeasuredAt: "2030-01-01T10:04:00.000Z",
    selectedFindingId: findings[5]!.id,
    retainsBaseline: true,
    findings,
    decisions: { [findings[5]!.id]: { decision: "accepted" } },
    verifications: { [findings[5]!.id]: { status: "unverified" } },
    coverageGaps: ["motion", "flow", "billing", "invite"].map((label, index) => ({
      id: `gap-${label}`,
      label: `${label} state`,
      detail: `${label} was not observed in this scope.`,
      viewports: ["mobile" as const],
      targets: [
        {
          checkpointId: `checkpoint-${index}`,
          scopeId: "included:/demo:mobile",
          route: "/demo",
          viewport: "mobile" as const,
        },
      ],
    })),
    trailStepCount: 2,
    auditBrief: {
      status: "provisional",
      productCategory: "Operations dashboard",
      audience: "Product operations lead",
      productJob: "Find workflows that need attention",
      visibleProposition: "See workflow exceptions and act on the strongest signal",
      primaryAction: "Review workflows",
      auditGoal: "Review onboarding clarity",
      confidence: "medium",
      evidenceRefs: ["included-live-target", "checkpoint-mobile"],
      unresolvedQuestions: ["What happens after the primary action?"],
      updatedAt: "2030-01-01T10:02:00.000Z",
    },
    reviewResults: [
      {
        id: "review-strength-ui-1",
        kind: "strength",
        category: "ui",
        observation: "Exception counts are easy to scan.",
        whyItSupportsJob: "Urgent work is visible.",
        confidence: "high",
        scopeId: "included:/demo:mobile",
        evidenceRef: "included-live-target",
        recordedAt: "2030-01-01T10:03:00.000Z",
      },
    ],
    coverage: {
      openGapCount: 4,
      hasUncoveredScope: true,
      openGaps: [],
      surfaces: [
        {
          checkpointId: "included-live-target-mobile",
          scopeId: "included:/demo:mobile",
          route: "/demo",
          finalUrl: "/demo",
          label: "Included product surface · mobile",
          surfaceType: "entry",
          viewport: "mobile",
          state: "baseline",
          captureExtent: "viewport",
          evidenceTypes: ["dom", "screenshot"],
          motion: "not_seen",
          interaction: "not_seen",
          status: "observed",
          capturedAt: "2030-01-01T10:00:00.000Z",
        },
        {
          checkpointId: "included-preview",
          scopeId: "included:/demo:mobile",
          route: "/demo",
          finalUrl: "/demo",
          label: "Reversible preview",
          surfaceType: "entry",
          viewport: "mobile",
          state: "improved",
          captureExtent: "viewport",
          evidenceTypes: ["dom", "screenshot"],
          motion: "not_seen",
          interaction: "not_seen",
          status: "observed",
          capturedAt: "2030-01-01T10:04:00.000Z",
        },
      ],
    },
  });
  const wrapped = {
    ...context,
    tool_name: "get_board_context",
    actor: "agent",
    status: "success",
    elapsed_ms: 8,
  };
  const serializedBytes = Buffer.byteLength(JSON.stringify(wrapped), "utf8");
  const text = createToolResult(wrapped).content[0]!.text;
  const payload = JSON.parse(text) as Record<string, unknown>;

  assert.ok(
    serializedBytes <= MAX_TOOL_TEXT_BYTES,
    `The realistic mutated board used ${serializedBytes} bytes before the result envelope.`,
  );
  assert.ok(Buffer.byteLength(text, "utf8") <= MAX_TOOL_TEXT_BYTES);
  assert.notEqual(payload.truncated, true);
  assert.ok(payload.target);
  assert.ok(payload.scope);
  assert.ok(payload.counts);
  assert.ok(payload.findings);
  assert.ok(payload.coverage);
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
  assert.equal(context.findings[0]?.confidence, "medium");
});

test("agent board context orients with the brief, positive results, and honest coverage", () => {
  const findings = Array.from({ length: 8 }, (_, index) => finding(index));
  const judged = findings[5]!;
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
    currentFindingCount: findings.length,
    retainedBaselineFindingCount: 0,
    currentMeasuredAt: "2030-01-01T10:00:00.000Z",
    selectedFindingId: judged.id,
    retainsBaseline: false,
    findings,
    decisions: {},
    verifications: {},
    coverageGaps: [{ id: "gap-motion", label: "Motion", detail: "Motion was not observed." }],
    trailStepCount: 0,
    auditBrief: {
      status: "provisional",
      productCategory: "Operations dashboard",
      audience: "Product operations lead",
      productJob: "Find workflows needing attention",
      visibleProposition: "See exceptions in one place",
      primaryAction: "Review workflows",
      auditGoal: "Review activation",
      confidence: "medium",
      evidenceRefs: ["included-live-target"],
      unresolvedQuestions: ["What happens after a workflow opens?"],
      updatedAt: "2030-01-01T10:00:00.000Z",
    },
    reviewResults: [
      {
        id: "review-strength-ui-1",
        kind: "strength",
        category: "ui",
        observation: "Exception counts are easy to scan.",
        whyItSupportsJob: "Urgent work is visible.",
        confidence: "high",
        scopeId: "included:/demo:mobile",
        evidenceRef: "included-live-target",
        recordedAt: "2030-01-01T10:00:00.000Z",
      },
      {
        id: "review-no-material-issue-interaction-2",
        kind: "no_material_issue",
        category: "interaction",
        observation: "No material affordance issue was observed in this viewport.",
        whyItSupportsJob: "The visible primary control is predictable.",
        confidence: "medium",
        scopeId: "included:/demo:mobile",
        evidenceRef: "included-live-target",
        recordedAt: "2030-01-01T10:00:00.000Z",
      },
    ],
    coverage: {
      openGapCount: 1,
      hasUncoveredScope: true,
      openGaps: [
        {
          id: "gap-motion",
          label: "Motion",
          detail: "Motion was not observed.",
          viewports: ["mobile"],
          targets: [
            {
              checkpointId: "included-live-target",
              scopeId: "included:/demo:mobile",
              route: "/demo",
              viewport: "mobile",
            },
          ],
        },
      ],
      surfaces: [
        {
          checkpointId: "included-live-target",
          scopeId: "included:/demo:mobile",
          route: "/demo",
          finalUrl: "/demo",
          label: "Included product surface",
          surfaceType: "entry",
          viewport: "mobile",
          state: "baseline",
          captureExtent: "viewport",
          evidenceTypes: ["dom", "screenshot"],
          motion: "not_seen",
          interaction: "not_seen",
          status: "observed",
          capturedAt: "2030-01-01T10:00:00.000Z",
        },
      ],
    },
  });

  assert.equal(context.audit_brief?.product_job, "Find workflows needing attention");
  assert.equal(context.audit_brief?.visible_proposition, "See exceptions in one place");
  assert.equal(context.audit_brief?.audit_goal, "Review activation");
  assert.deepEqual(context.audit_brief?.evidence_refs, ["included-live-target"]);
  assert.deepEqual(context.target, {
    kind: "included_live_target",
    path: "/demo",
    scope_id: "included:/demo:mobile",
    evidence_ref: "included-live-target",
  });
  assert.deepEqual(context.counts, {
    findings: 8,
    strengths: 1,
    no_material_issue: 1,
    gaps: 1,
  });
  assert.equal(context.coverage?.surfaces[0]?.motion, "not_seen");
  assert.equal(context.coverage?.surfaces[0]?.interaction, "not_seen");
  assert.equal(context.unread.findings, true);
  assert.equal(context.unread.scope, true);
  assert.match(context.next, /finding_offset/i);
  const afterFindingPages = buildAgentBoardContext({
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
    selectedFindingId: judged.id,
    retainsBaseline: false,
    findings,
    decisions: {},
    verifications: {},
    coverageGaps: [{ id: "gap-motion", label: "Motion", detail: "Not observed." }],
    trailStepCount: 0,
    findingOffset: findings.length - 1,
    auditBrief: {
      status: "provisional" as const,
      productCategory: "Operations dashboard",
      audience: "Product operations lead",
      productJob: "Find workflows needing attention",
      visibleProposition: "See exceptions in one place",
      primaryAction: "Review workflows",
      auditGoal: "Review activation",
      confidence: "medium" as const,
      evidenceRefs: ["included-live-target"],
      unresolvedQuestions: [],
      updatedAt: "2030-01-01T10:00:00.000Z",
    },
  });
  assert.match(afterFindingPages.next, /keep named gaps open.*continue/i);

  const wrappedContext = {
    ...context,
    tool_name: "get_board_context",
    actor: "agent",
    status: "success",
    elapsed_ms: 1,
  };
  const result = createToolResult(wrappedContext);
  const payload = JSON.parse(result.content[0]!.text) as {
    truncated?: boolean;
    audit_brief?: { product_job?: string };
    review_results?: string[];
    findings?: unknown[];
    coverage_gaps?: string[];
  };
  assert.notEqual(
    payload.truncated,
    true,
    `The complete review board used ${Buffer.byteLength(JSON.stringify(wrappedContext), "utf8")} bytes.`,
  );
  assert.equal(payload.audit_brief?.product_job, "Find workflows needing attention");
  assert.ok((payload.review_results?.length ?? 0) > 0);
  assert.match(payload.review_results?.[0] ?? "", /included:\/demo:mobile.*included-live-target/);
  assert.ok((payload.findings?.length ?? 0) > 0);
  assert.match(payload.coverage_gaps?.[0] ?? "", /^gap-motion\|/);
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

  assert.deepEqual(context.uncaptured_nav, ["/pricing", "/docs", "/about", "/blog"]);
  assert.match(context.next, /capture_visible_nav/);
  assert.doesNotMatch(JSON.stringify(context), /private=removed/);
});

test("agent context keeps an inactive responsive below-fold gap open", () => {
  const context = buildAgentBoardContext({
    auditGoal: "Review activation",
    target: {
      kind: "public_checkpoint",
      displayUrl: "https://example.com/",
      checkpointId: "checkpoint-desktop",
      scopeId: "scope-desktop",
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
    coverageGaps: [
      {
        id: "gap-below-fold",
        label: "Below-fold content",
        detail: "The mobile checkpoint remained viewport-only.",
        viewports: ["mobile"],
      },
    ],
    trailStepCount: 2,
    auditBrief: {
      status: "provisional",
      productCategory: "Marketing site",
      audience: "Prospective customer",
      productJob: "Understand the product",
      visibleProposition: "See the product value",
      primaryAction: "Start",
      auditGoal: "Review activation",
      confidence: "medium",
      evidenceRefs: ["checkpoint-desktop"],
      unresolvedQuestions: [],
      updatedAt: "2030-01-01T10:00:00.000Z",
    },
  });

  assert.equal(context.unread.scope, true);
  assert.match(context.next, /mobile.*activate|activate.*mobile/i);
  assert.match(context.coverage_gaps[0]!, /mobile/);
});

test("agent context never applies another route's below-fold gap to the active route", () => {
  const context = buildAgentBoardContext({
    auditGoal: "Review activation",
    target: {
      kind: "public_checkpoint",
      displayUrl: "https://example.com/pricing",
      checkpointId: "checkpoint-pricing",
      scopeId: "scope-pricing",
      screenshotVisible: true,
      captureExtent: "full-page",
    },
    viewport: "desktop",
    state: "baseline",
    currentFindingCount: 0,
    retainedBaselineFindingCount: 0,
    currentMeasuredAt: "2030-01-01T10:01:00.000Z",
    selectedFindingId: null,
    retainsBaseline: false,
    findings: [],
    decisions: {},
    verifications: {},
    coverageGaps: [
      {
        id: "gap-below-fold",
        label: "Below-fold content",
        detail: "The root route remained viewport-only.",
        viewports: ["desktop"],
        targets: [
          {
            checkpointId: "checkpoint-root",
            scopeId: "scope-root",
            route: "/",
            viewport: "desktop",
          },
        ],
      },
    ],
    trailStepCount: 2,
    auditBrief: {
      status: "provisional",
      productCategory: "Marketing site",
      audience: "Prospective customer",
      productJob: "Understand the product",
      visibleProposition: "See the product value",
      primaryAction: "Start",
      auditGoal: "Review activation",
      confidence: "medium",
      evidenceRefs: ["checkpoint-root", "checkpoint-pricing"],
      unresolvedQuestions: [],
      updatedAt: "2030-01-01T10:01:00.000Z",
    },
  });

  assert.doesNotMatch(context.next, /^Call capture_below_fold/);
  assert.match(context.next, /\/.*checkpoint-root.*activate/i);
  assert.match(context.coverage_gaps[0]!, /\/@desktop/);
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

  assert.equal(first.receipt, "Board read; receipt visible.");
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
  assert.deepEqual(withVisibleNav.finding_page, {
    offset: 0,
    limit: 1,
    total: 5,
    next_offset: 1,
  });
  assert.match(withVisibleNav.next, /finding_offset 1/);
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
