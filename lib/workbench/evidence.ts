import { compareFinding } from "@/lib/audit/recapture";
import type {
  AuditSnapshot,
  AuditBrief,
  CoverageGap,
  DemoState,
  Finding,
  ReviewResult,
  Verification,
  Viewport,
} from "@/lib/audit/types";
import { boundedText } from "@/lib/text";
import { MAX_TOOL_TEXT_BYTES } from "@/lib/webmcp/result";
import type { CoverageGapTarget, CoverageSummary } from "./coverage";
import type { Decision } from "./decisions";
import type { VerificationReceipt } from "./types";

export type EvidenceBoardDescription = {
  summary: string;
  currentCount: number | null;
  baselineCount: number;
  retainsBaseline: boolean;
  listLabel: string;
  truthLabel: "Current evidence" | "Baseline evidence";
};

type AuthorityCheckpoint = { id: string; scopeId: string };

export function describeAgentAuthority(
  mode: "sample" | "remote",
  checkpoint: AuthorityCheckpoint | null,
  currentScopeKey?: string,
) {
  if (mode === "sample") {
    const scope = currentScopeKey ?? "included:/demo";
    return { label: "Included workspace", scope, scopeTitle: scope };
  }
  if (!checkpoint) {
    return { label: "Public workspace", scope: "No checkpoint yet", scopeTitle: undefined };
  }
  return {
    label: "Public checkpoint",
    scope: checkpoint.id,
    scopeTitle: checkpoint.scopeId,
  };
}

export function describeHostToolCount(expectedCount: number, confirmedCount: number | null) {
  return confirmedCount === null
    ? `${expectedCount} expected · not confirmed by host`
    : `${confirmedCount}/${expectedCount} confirmed by host`;
}

type AgentBoardTarget =
  | {
      kind: "public_checkpoint";
      displayUrl: string | null;
      checkpointId: string | null;
      scopeId: string | null;
      screenshotVisible: boolean;
      captureExtent: "full-page" | "viewport";
    }
  | { kind: "included_live_target"; path: string; scopeId: string; screenshotVisible: boolean };

type AgentBoardContextInput = {
  auditGoal: string;
  target: AgentBoardTarget;
  viewport: Viewport;
  state: DemoState;
  currentFindingCount: number | null;
  retainedBaselineFindingCount: number;
  currentMeasuredAt: string | null;
  selectedFindingId: string | null;
  retainsBaseline: boolean;
  findings: Finding[];
  decisions: Record<string, { decision: Decision } | undefined>;
  verifications: Record<string, { status: Verification } | undefined>;
  coverageGaps: Array<CoverageGap & { viewports?: Viewport[]; targets?: CoverageGapTarget[] }>;
  trailStepCount: number;
  uncapturedNav?: Array<{ url: string; label: string }>;
  findingOffset?: number;
  auditBrief?: AuditBrief | null;
  reviewResults?: ReviewResult[];
  coverage?: CoverageSummary;
};

const AGENT_FINDING_PAGE_SIZE = 5;
const AGENT_FINDING_TITLE_BYTES = 90;
const BOARD_RESULT_ENVELOPE_BYTES = 80;
const CEREMONY_KEYS = [
  "coverage",
  "coverage_gaps",
  "audit_brief",
  "review_results_omitted",
  "review_results",
] as const;

function jsonBytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function judgmentRecordOutcome(input: {
  findingId: string;
  previewVisible: boolean;
  hasBrief: boolean;
}) {
  return {
    receipt: `Added ${input.findingId} as a judged finding linked to ${
      input.previewVisible
        ? "the retained baseline evidence while a preview is visible"
        : "the current evidence"
    }.`,
    next: input.hasBrief
      ? undefined
      : "This judgment is unoriented. Call record_audit_brief when the host allows it, then read the board.",
  };
}

function auditToolEnvelopeBytes(payload: Record<string, unknown>) {
  return jsonBytes({
    ...payload,
    tool_name: "audit_current_scope",
    actor: "agent",
    status: "success",
    elapsed_ms: 12,
  });
}

export function mergeAuditWithFirstBoardPage(
  audit: {
    ok: true;
    receipt: string;
    checkpoint_id?: unknown;
    scope_id?: unknown;
    browser_ms_used?: unknown;
  },
  board: ReturnType<typeof buildAgentBoardContext>,
): ({ ok: true; receipt: string } & Record<string, unknown>) | null {
  const withReceipt = { ...board, ok: true as const, receipt: audit.receipt };
  const withAuditIds = {
    ...withReceipt,
    ...(audit.checkpoint_id !== undefined ? { checkpoint_id: audit.checkpoint_id } : {}),
    ...(audit.scope_id !== undefined ? { scope_id: audit.scope_id } : {}),
    ...(typeof audit.browser_ms_used === "number"
      ? { browser_ms_used: audit.browser_ms_used }
      : {}),
  };
  if (auditToolEnvelopeBytes(withAuditIds) <= MAX_TOOL_TEXT_BYTES) return withAuditIds;
  if (auditToolEnvelopeBytes(withReceipt) <= MAX_TOOL_TEXT_BYTES) return withReceipt;
  return null;
}

function agentText(value: string, maximumBytes: number) {
  let text = boundedText(value, maximumBytes);
  const encoder = new TextEncoder();
  while (encoder.encode(JSON.stringify(text)).byteLength - 2 > maximumBytes) {
    text = text.slice(0, -1);
  }
  return text;
}

function agentTitle(value: string, maximumBytes: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  const encoder = new TextEncoder();
  const fits = (text: string) =>
    encoder.encode(JSON.stringify(text)).byteLength - 2 <= maximumBytes;
  if (fits(normalized)) return normalized;
  let text = normalized;
  while (text && !fits(text)) text = text.slice(0, -1);
  const boundary = text.lastIndexOf(" ");
  return boundary > 0 ? text.slice(0, boundary) : "";
}

function routePath(url: string) {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return "/";
  }
}

function compactAgentTarget(target: AgentBoardTarget) {
  if (target.kind === "included_live_target") {
    return {
      kind: target.kind,
      path: agentText(target.path, 40),
      scope_id: agentText(target.scopeId, 40),
      evidence_ref: "included-live-target",
    };
  }
  return {
    kind: target.kind,
    display_url: target.displayUrl ? agentText(target.displayUrl, 48) : null,
    checkpoint_id: target.checkpointId ? agentText(target.checkpointId, 40) : null,
    scope_id: target.scopeId ? agentText(target.scopeId, 40) : null,
    capture_extent: target.captureExtent,
  };
}

function agentFindingPage(
  findings: Finding[],
  selectedFindingId: string | null,
  requestedOffset = 0,
  pageSize = AGENT_FINDING_PAGE_SIZE,
) {
  const selected = findings.find(({ id }) => id === selectedFindingId);
  const ordered = selected
    ? [selected, ...findings.filter(({ id }) => id !== selected.id)]
    : findings;
  const offset = Math.min(Math.max(0, Math.trunc(requestedOffset)), ordered.length);
  const pageFindings = ordered.slice(offset, offset + pageSize);
  const nextOffset = offset + pageFindings.length;
  return {
    findings: pageFindings,
    page: {
      offset,
      limit: pageSize,
      total: ordered.length,
      next_offset: nextOffset < ordered.length ? nextOffset : null,
    },
  };
}

function compactAuditBrief(brief?: AuditBrief | null) {
  if (!brief) return undefined;
  return {
    category: agentText(brief.productCategory, 32),
    audience: agentText(brief.audience, 32),
    product_job: agentText(brief.productJob, 48),
    visible_proposition: agentText(brief.visibleProposition, 56),
    primary_action: agentText(brief.primaryAction, 32),
    audit_goal: brief.auditGoal ? agentText(brief.auditGoal, 32) : undefined,
    confidence: brief.confidence,
    evidence_refs: brief.evidenceRefs.slice(0, 2).map((ref) => agentText(ref, 24)),
    evidence_refs_omitted: Math.max(0, brief.evidenceRefs.length - 2) || undefined,
    unresolved_count: brief.unresolvedQuestions.length,
  };
}

function nextBoardAction({
  nextFindingOffset,
  uncapturedNavCount,
  hasBrief,
  hasBelowFoldGap,
  inactiveBelowFoldTarget,
  hasUncoveredScope,
}: {
  nextFindingOffset: number | null;
  uncapturedNavCount: number;
  hasBrief: boolean;
  hasBelowFoldGap: boolean;
  inactiveBelowFoldTarget?: CoverageGapTarget;
  hasUncoveredScope: boolean;
}) {
  if (nextFindingOffset !== null) {
    return `Call get_board_context with finding_offset ${nextFindingOffset}.`;
  }
  if (uncapturedNavCount > 0) {
    return "Call capture_visible_nav for the listed same-origin routes, then get_board_context.";
  }
  if (!hasBrief) return "Call record_audit_brief before adding product judgments.";
  if (hasBelowFoldGap) {
    return "Call capture_below_fold for the open gap, then read the board again.";
  }
  if (inactiveBelowFoldTarget) {
    const target =
      inactiveBelowFoldTarget.route ?? inactiveBelowFoldTarget.scopeId ?? "named route";
    const checkpoint = inactiveBelowFoldTarget.checkpointId
      ? ` checkpoint ${inactiveBelowFoldTarget.checkpointId}`
      : " checkpoint";
    return `The ${target} ${inactiveBelowFoldTarget.viewport}${checkpoint} remains viewport-only. Ask the person to activate that checkpoint, then read the board before calling capture_below_fold.`;
  }
  if (hasUncoveredScope) {
    return "Keep named gaps open and continue the strongest supported review sweep.";
  }
  return "Use focus_finding on the strongest supported finding, or record a strength or no-issue result.";
}

export function buildAgentBoardContext(input: AgentBoardContextInput) {
  const uncapturedNav = (input.uncapturedNav ?? []).slice(0, 4);
  const findingPage = agentFindingPage(
    input.findings,
    input.selectedFindingId,
    input.findingOffset,
    AGENT_FINDING_PAGE_SIZE,
  );
  const nextFindingOffset = findingPage.page.next_offset;
  const reviewResults = input.reviewResults ?? [];
  const strengths = reviewResults.filter(({ kind }) => kind === "strength");
  const noMaterialIssues = reviewResults.filter(({ kind }) => kind === "no_material_issue");
  const belowFoldGap = input.coverageGaps.find(({ id }) => id === "gap-below-fold");
  const activeScopeId = input.target.scopeId;
  const belowFoldTargets: CoverageGapTarget[] =
    belowFoldGap?.targets ?? (belowFoldGap?.viewports ?? []).map((viewport) => ({ viewport }));
  const hasBelowFoldGap = belowFoldTargets.some(
    ({ scopeId, viewport }) =>
      viewport === input.viewport && (!scopeId || !activeScopeId || scopeId === activeScopeId),
  );
  const inactiveBelowFoldTarget = hasBelowFoldGap ? undefined : belowFoldTargets[0];
  const hasUncoveredScope =
    uncapturedNav.length > 0 ||
    (input.coverage?.hasUncoveredScope ?? input.coverageGaps.length > 0);
  const next = nextBoardAction({
    nextFindingOffset,
    uncapturedNavCount: uncapturedNav.length,
    hasBrief: Boolean(input.auditBrief),
    hasBelowFoldGap,
    inactiveBelowFoldTarget,
    hasUncoveredScope,
  });
  const visibleReviewResults = reviewResults.slice(-1);
  const visibleCoverageGaps = input.coverageGaps
    .filter(({ id }) => id !== "gap-visible-nav")
    .slice(0, input.auditBrief ? 1 : 4);
  const budget = MAX_TOOL_TEXT_BYTES - BOARD_RESULT_ENVELOPE_BYTES;
  const payload = {
    ok: true,
    receipt: "Board read; receipt visible.",
    target: compactAgentTarget(input.target),
    scope: {
      goal: input.auditGoal && !input.auditBrief ? agentText(input.auditGoal, 16) : undefined,
      viewport: input.viewport,
      state: input.state,
      retained_baseline_count:
        input.retainedBaselineFindingCount > 0 ? input.retainedBaselineFindingCount : undefined,
      trail_steps: input.trailStepCount > 0 ? input.trailStepCount : undefined,
      measured_at:
        input.auditBrief || input.trailStepCount > 1 ? undefined : input.currentMeasuredAt,
    },
    counts: {
      findings: input.findings.length,
      strengths: strengths.length,
      no_material_issue: noMaterialIssues.length,
      gaps: input.coverageGaps.length,
    },
    findings: findingPage.findings.map((finding) => ({
      id: agentText(finding.id, 120),
      truth: finding.truth,
      claim_type: finding.claimType,
      category: finding.category,
      product_job:
        finding.productJob && !input.auditBrief ? agentText(finding.productJob, 48) : undefined,
      confidence: finding.confidence,
      severity: finding.severity,
      title: agentTitle(finding.title, AGENT_FINDING_TITLE_BYTES),
      observation:
        finding.claimType === "MEASUREMENT" ? agentText(finding.observation, 240) : undefined,
      decision:
        input.decisions[finding.id]?.decision === "open"
          ? undefined
          : input.decisions[finding.id]?.decision,
      verification:
        input.verifications[finding.id]?.status === "not_run"
          ? undefined
          : input.verifications[finding.id]?.status,
      measurement: finding.measurement ? agentText(finding.measurement.value, 20) : undefined,
      instance_count:
        finding.instanceCount && finding.instanceCount > 1 ? finding.instanceCount : undefined,
      group_key: finding.groupKey ? agentText(finding.groupKey, 80) : undefined,
      above_the_fold: finding.aboveTheFold,
      checkpoint_id: finding.checkpointId ? agentText(finding.checkpointId, 40) : undefined,
      evidence_role: input.retainsBaseline && !input.auditBrief ? "retained_baseline" : undefined,
    })),
    finding_page: findingPage.page,
    uncaptured_nav:
      uncapturedNav.length > 0
        ? uncapturedNav.map((route) => agentText(routePath(route.url), 32))
        : undefined,
    unread: { findings: nextFindingOffset !== null, scope: hasUncoveredScope },
    next,
    review_results:
      visibleReviewResults.length > 0
        ? visibleReviewResults.map(
            (result) =>
              `${result.kind}|${result.category}|${result.confidence}|${agentText(result.scopeId, 32)}|${agentText(result.evidenceRef, 32)}`,
          )
        : undefined,
    review_results_omitted:
      Math.max(0, reviewResults.length - visibleReviewResults.length) || undefined,
    audit_brief: compactAuditBrief(input.auditBrief),
    coverage_gaps: visibleCoverageGaps.map(({ id, label, viewports, targets }) => {
      const targetSummary = targets
        ?.slice(0, 1)
        .map(({ route, scopeId, viewport }) =>
          [agentText(route ?? scopeId ?? "scope", 20), viewport].join("@"),
        )
        .join(",");
      return [agentText(id, 20), agentText(label, 16), targetSummary ?? viewports?.join(",")]
        .filter(Boolean)
        .join("|");
    }),
    coverage: input.coverage
      ? {
          surface_count: input.coverage.surfaces.length,
          surfaces: input.coverage.surfaces.slice(0, 1).map((surface) => ({
            route: agentText(surface.route, 32),
            type: surface.surfaceType,
            state: agentText(surface.state, 20),
            extent: surface.captureExtent,
            motion: surface.motion,
            interaction: surface.interaction,
            status: surface.status,
          })),
        }
      : undefined,
  };
  for (const key of CEREMONY_KEYS) {
    if (jsonBytes(payload) <= budget) break;
    (payload as Record<string, unknown>)[key] = undefined;
  }
  return payload;
}

function findingCount(count: number, role?: "current" | "retained baseline") {
  return `${count}${role ? ` ${role}` : ""} finding${count === 1 ? "" : "s"}`;
}

export function describeEvidenceBoard(
  baseline: AuditSnapshot | undefined,
  current: AuditSnapshot | undefined,
  activeState: DemoState,
  viewport: Viewport,
  agentToolCallCount?: number,
): EvidenceBoardDescription {
  const baselineCount = baseline?.findings.length ?? 0;
  const measuredBaseline =
    agentToolCallCount === 0 && activeState === "baseline" && current?.demoState === activeState;

  if (!baseline) {
    return {
      summary: "Measuring the live product…",
      currentCount: null,
      baselineCount: 0,
      retainsBaseline: false,
      listLabel: "Findings",
      truthLabel: "Current evidence",
    };
  }

  if (current?.demoState !== activeState) {
    const returningToBaseline = activeState === "baseline";
    return {
      summary: returningToBaseline
        ? "Refreshing the baseline measurement…"
        : `${findingCount(baselineCount, "retained baseline")} · measuring current preview…`,
      currentCount: null,
      baselineCount,
      retainsBaseline: !returningToBaseline,
      listLabel: returningToBaseline ? "Findings" : "Retained baseline findings",
      truthLabel: returningToBaseline ? "Current evidence" : "Baseline evidence",
    };
  }

  const currentCount = current.findings.length;
  const retainsBaseline = activeState === "improved" || current !== baseline;
  return {
    summary: measuredBaseline
      ? "Baseline measurement · no agent tool has run yet"
      : retainsBaseline
        ? `${findingCount(currentCount, "current")} · ${findingCount(baselineCount, "retained baseline")}`
        : `${findingCount(currentCount, "current")} from a fresh ${viewport} measurement`,
    currentCount,
    baselineCount,
    retainsBaseline,
    listLabel: retainsBaseline ? "Retained baseline findings" : "Current findings",
    truthLabel: retainsBaseline ? "Baseline evidence" : "Current evidence",
  };
}

export function verificationLabel(status: Verification) {
  if (status === "not_run") return "Not verified";
  if (status === "still_open") return "Still open";
  if (status === "fixed") return "Verified fixed";
  return "Unverified";
}

export function invalidateVerificationForFindings(
  receipts: Record<string, VerificationReceipt>,
  findings: Finding[],
) {
  const next = { ...receipts };
  let changed = false;

  for (const finding of findings) {
    if (!(finding.id in next)) continue;
    delete next[finding.id];
    changed = true;
  }

  return changed ? next : receipts;
}

export function buildVerificationReceipts(
  previousFindings: Finding[],
  currentSnapshot: AuditSnapshot,
  at: string,
) {
  const receipts: Record<string, VerificationReceipt> = {};
  const currentById = new Map(currentSnapshot.findings.map((finding) => [finding.id, finding]));
  const summary = { fixed: 0, still_open: 0, unverified: 0 };
  const results = previousFindings.map((finding) => {
    const scopeWasMeasured =
      currentSnapshot.viewport === finding.viewport &&
      (!finding.scopeKey || finding.scopeKey === currentSnapshot.scopeKey);
    const status = compareFinding(finding, currentById, scopeWasMeasured);
    const currentFinding = currentById.get(finding.id);
    receipts[finding.id] = {
      status,
      before: finding.measurement?.value ?? finding.observation,
      after:
        currentFinding?.measurement?.value ??
        currentFinding?.observation ??
        (status === "fixed" ? "Not reproduced" : "Scope not measured"),
      at,
    };
    if (status !== "not_run") summary[status] += 1;
    return { id: finding.id, status };
  });

  return {
    receipts,
    results,
    summary,
  };
}
