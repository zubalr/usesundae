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
  | "agent-surface";

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

export type Measurement = {
  value: string;
  threshold: string;
  unit: string;
};

export type Finding = {
  id: string;
  auditId: string;
  rule: FindingRule;
  truth: TruthKind;
  severity: Severity;
  title: string;
  observation: string;
  whyItMatters: string;
  recommendation: string;
  viewport: Viewport;
  rect: Region | null;
  measurement: Measurement | null;
  identityConfidence?: IdentityConfidence;
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
