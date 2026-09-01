export type Viewport = "desktop" | "mobile";
export type DemoState = "baseline" | "improved";
export type TruthKind = "measured" | "judged";
export type DesignCategory = "ui" | "ux" | "interaction";
export type Severity = "high" | "medium" | "low";
export type JudgmentConfidence = "high" | "medium" | "low";
export type Verification = "not_run" | "fixed" | "still_open" | "unverified";
export type IdentityConfidence = "stable" | "unstable";

export type FindingRule =
  | "tap-target"
  | "accessible-name"
  | "contrast"
  | "horizontal-overflow"
  | "content-clarity"
  | "heading-outline"
  | "http-status"
  | "main-landmark"
  | "document-name"
  | "visual-judgment"
  | "agent-surface"
  | "design-signal";

export type EvidenceReference = {
  kind: "dom" | "screenshot" | "accessibility" | "tool-contract";
  ref: string;
};

export type Region = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const NO_DEFENSIBLE_THRESHOLD = "NO_DEFENSIBLE_THRESHOLD";

export type MeasurementDirection =
  | "descriptive"
  | "higher-is-worse"
  | "lower-is-worse"
  | "non-monotonic";
export type MeasurementProvenance = "standard" | "study" | "design-system" | "convention" | "none";
export type ClaimType = "MEASUREMENT";

export type Measurement = {
  value: string;
  threshold: string;
  unit: string;
  direction: MeasurementDirection;
  provenance: MeasurementProvenance;
};

export function hasDefensibleThreshold(measurement: Measurement | null | undefined) {
  if (!measurement) return false;
  return (
    measurement.threshold !== NO_DEFENSIBLE_THRESHOLD &&
    measurement.direction !== "descriptive" &&
    measurement.provenance !== "none"
  );
}

export function thresholdMeasurement(
  value: string,
  threshold: string,
  unit: string,
  direction: MeasurementDirection,
): Measurement {
  return { value, threshold, unit, direction, provenance: "standard" };
}

export function descriptiveMeasurement(value: string, unit: string): Measurement {
  return {
    value,
    threshold: NO_DEFENSIBLE_THRESHOLD,
    unit,
    direction: "descriptive",
    provenance: "none",
  };
}

export type Finding = {
  id: string;
  auditId: string;
  rule: FindingRule;
  truth: TruthKind;
  claimType?: ClaimType;
  severity?: Severity;
  title: string;
  observation: string;
  whyItMatters: string;
  recommendation: string;
  viewport: Viewport;
  rect: Region | null;
  measurement: Measurement | null;
  identityConfidence?: IdentityConfidence;
  groupKey?: string;
  instanceCount?: number;
  aboveTheFold?: boolean;
  prominenceScore?: number;
  checkpointId?: string;
  scopeKey?: string;
  evidence?: EvidenceReference;
  category?: DesignCategory;
  productJob?: string;
  confidence?: JudgmentConfidence;
};

export type AuditBrief = {
  status: "provisional";
  productCategory: string;
  audience: string;
  productJob: string;
  visibleProposition: string;
  primaryAction: string;
  auditGoal: string;
  confidence: JudgmentConfidence;
  evidenceRefs: string[];
  unresolvedQuestions: string[];
  updatedAt: string;
};

export type AuditBriefInput = Omit<AuditBrief, "status" | "auditGoal" | "updatedAt">;

export type ReviewResultKind = "strength" | "no_material_issue";

export type ReviewResult = {
  id: string;
  kind: ReviewResultKind;
  category: DesignCategory;
  observation: string;
  whyItSupportsJob: string;
  confidence: JudgmentConfidence;
  scopeId: string;
  evidenceRef: string;
  recordedAt: string;
};

export type ReviewResultInput = Omit<ReviewResult, "id" | "recordedAt">;

export type CoverageGap = {
  id: string;
  label: string;
  detail: string;
  checkpointId?: string;
  scopeKey?: string;
};

export type AuditSnapshot = {
  capturedAt: string;
  demoState: DemoState;
  viewport: Viewport;
  viewportSize: { width: number; height: number };
  scopeKey?: string;
  findings: Finding[];
  gaps: CoverageGap[];
};
