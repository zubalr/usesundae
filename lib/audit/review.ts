import { boundedText } from "@/lib/text";
import type {
  AuditBrief,
  AuditBriefInput,
  Finding,
  JudgmentConfidence,
  ReviewResult,
  ReviewResultInput,
  Severity,
} from "./types";

const BRIEF_BOUNDS = {
  category: 80,
  audience: 100,
  productJob: 140,
  proposition: 180,
  primaryAction: 100,
  goal: 240,
  evidenceRef: 120,
  question: 160,
} as const;

function required(value: string, maximum: number, label: string) {
  const normalized = boundedText(value, maximum);
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function uniqueBounded(values: string[], maximumItems: number, maximumLength: number) {
  return [
    ...new Set(values.map((value) => boundedText(value, maximumLength)).filter(Boolean)),
  ].slice(0, maximumItems);
}

export function createAuditBrief(
  input: AuditBriefInput,
  suppliedGoal: string,
  updatedAt = new Date().toISOString(),
): AuditBrief {
  const evidenceRefs = uniqueBounded(input.evidenceRefs, 6, BRIEF_BOUNDS.evidenceRef);
  if (evidenceRefs.length === 0) throw new Error("At least one evidence reference is required.");
  return {
    status: "provisional",
    productCategory: required(input.productCategory, BRIEF_BOUNDS.category, "Product category"),
    audience: required(input.audience, BRIEF_BOUNDS.audience, "Audience"),
    productJob: required(input.productJob, BRIEF_BOUNDS.productJob, "Product job"),
    visibleProposition: required(
      input.visibleProposition,
      BRIEF_BOUNDS.proposition,
      "Visible proposition",
    ),
    primaryAction: required(input.primaryAction, BRIEF_BOUNDS.primaryAction, "Primary action"),
    auditGoal: boundedText(suppliedGoal, BRIEF_BOUNDS.goal),
    confidence: input.confidence,
    evidenceRefs,
    unresolvedQuestions: uniqueBounded(input.unresolvedQuestions, 6, BRIEF_BOUNDS.question),
    updatedAt,
  };
}

export function validateReviewResultScope(
  input: ReviewResultInput,
  inspectedScopeIds: ReadonlySet<string>,
  evidenceRefsForScope: ReadonlySet<string>,
) {
  if (!inspectedScopeIds.has(input.scopeId)) {
    throw new Error("A review result must cite an inspected scope on the current evidence board.");
  }
  if (!evidenceRefsForScope.has(input.evidenceRef)) {
    throw new Error("A review result must cite evidence from that same inspected scope.");
  }
}

export function createReviewResult(
  input: ReviewResultInput,
  sequence: number,
  recordedAt = new Date().toISOString(),
): ReviewResult {
  const observation = required(input.observation, 240, "Observation");
  return {
    id: `review-${input.kind.replaceAll("_", "-")}-${input.category}-${sequence}`,
    kind: input.kind,
    category: input.category,
    observation,
    whyItSupportsJob: required(input.whyItSupportsJob, 240, "Product-job rationale"),
    confidence: input.confidence,
    scopeId: required(input.scopeId, 120, "Scope"),
    evidenceRef: required(input.evidenceRef, 120, "Evidence reference"),
    recordedAt,
  };
}

export function withoutConflictingNoIssue(results: ReviewResult[], finding: Finding) {
  if (!finding.category || !finding.scopeKey) return results;
  return results.filter(
    (result) =>
      result.kind !== "no_material_issue" ||
      result.category !== finding.category ||
      result.scopeId !== finding.scopeKey,
  );
}

const severityOrder: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
const confidenceOrder: Record<JudgmentConfidence, number> = { high: 0, medium: 1, low: 2 };

export function reviewLane(finding: Finding) {
  return finding.truth === "judged" ? ("product" as const) : ("supporting" as const);
}

export function compareFindingsForReview(left: Finding, right: Finding) {
  const laneDifference =
    Number(reviewLane(left) === "supporting") - Number(reviewLane(right) === "supporting");
  const severityDifference = severityOrder[left.severity] - severityOrder[right.severity];
  const confidenceDifference =
    confidenceOrder[left.confidence ?? "low"] - confidenceOrder[right.confidence ?? "low"];
  return (
    laneDifference ||
    severityDifference ||
    confidenceDifference ||
    left.title.localeCompare(right.title)
  );
}

export function orderFindingsForReview(findings: Finding[]) {
  return findings.toSorted(compareFindingsForReview);
}
