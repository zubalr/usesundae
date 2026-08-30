import type { RemoteCheckpoint } from "@/lib/capture/types";
import { boundedText } from "@/lib/text";
import type { AuditSnapshot, DesignCategory, Finding, Region, Severity } from "./types";

export type JudgedFindingInput = {
  title: string;
  observation: string;
  whyItMatters: string;
  recommendation: string;
  severity: Severity;
  category: DesignCategory;
  productJob?: string;
  rect?: Region | null;
};

function normalizeRegion(
  rect: Region | null | undefined,
  bounds?: { width: number; height: number },
) {
  if (!rect) return null;
  const values = [rect.x, rect.y, rect.width, rect.height];
  if (values.some((value) => !Number.isFinite(value)) || rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  const maximumX = Math.max(0, Math.round(bounds?.width ?? 50_000) - 1);
  const maximumY = Math.max(0, Math.round(bounds?.height ?? 50_000) - 1);
  const x = Math.min(maximumX, Math.max(0, Math.round(rect.x)));
  const y = Math.min(maximumY, Math.max(0, Math.round(rect.y)));
  return {
    x,
    y,
    width: Math.min(maximumX + 1 - x, 50_000, Math.round(rect.width)),
    height: Math.min(maximumY + 1 - y, 50_000, Math.round(rect.height)),
  };
}

function slug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "finding"
  );
}

function targetKey(checkpoint: RemoteCheckpoint) {
  return checkpoint.scopeId;
}

function headingOutlineIssue(checkpoint: RemoteCheckpoint) {
  const headings = checkpoint.accessibility.headingOutline;
  if (headings.length === 0) return "No heading was exposed in the captured accessibility tree.";
  if (!headings.some((heading) => heading.level === 1)) {
    return "The captured accessibility tree does not expose a level-one heading.";
  }
  for (let index = 1; index < headings.length; index += 1) {
    const previous = headings[index - 1];
    const current = headings[index];
    if (previous && current && current.level - previous.level > 1) {
      return `The heading outline jumps from level ${previous.level} to level ${current.level} near “${boundedText(current.name, 80)}”.`;
    }
  }
  return null;
}

export function deriveCheckpointFindings(checkpoint: RemoteCheckpoint): Finding[] {
  const findings: Finding[] = [];
  const scope = targetKey(checkpoint);
  const common = {
    viewport: checkpoint.viewport,
    rect: null,
    checkpointId: checkpoint.id,
    scopeKey: checkpoint.scopeId,
  } as const;

  if (checkpoint.status !== null && checkpoint.status >= 400) {
    findings.push({
      ...common,
      id: `${checkpoint.viewport}:http-status:${scope}-document`,
      auditId: "document",
      rule: "http-status",
      truth: "measured",
      severity: "high",
      title: `The captured page returned HTTP ${checkpoint.status}`,
      observation: `The remote browser received status ${checkpoint.status} for this checkpoint.`,
      whyItMatters:
        "The captured experience may be an error state rather than the intended product surface.",
      recommendation: "Confirm the public URL and capture the intended page state again.",
      measurement: { value: String(checkpoint.status), threshold: "200–399", unit: "HTTP status" },
      evidence: { kind: "screenshot", ref: checkpoint.id },
    });
  }

  const unnamed = checkpoint.accessibility.unnamedInteractiveCount;
  const interactive = checkpoint.accessibility.interactiveCount;
  if (unnamed > 0) {
    findings.push({
      ...common,
      id: `${checkpoint.viewport}:accessible-name:${scope}-interactive-summary`,
      auditId: "remote-interactive-summary",
      rule: "accessible-name",
      truth: "measured",
      severity: "high",
      title: `${unnamed} interactive ${unnamed === 1 ? "control has" : "controls have"} no accessible name`,
      observation: `${unnamed} of ${interactive} interactive controls in the captured accessibility tree have no exposed name.`,
      whyItMatters: "People using assistive technology may not know what those controls do.",
      recommendation: "Inspect the unnamed controls and give each a concise programmatic name.",
      measurement: {
        value: `${unnamed} of ${interactive}`,
        threshold: "0 unnamed",
        unit: "interactive controls",
      },
      evidence: { kind: "accessibility", ref: checkpoint.id },
    });
  }

  if (
    checkpoint.accessibility.mainLandmarkCount === 0 &&
    checkpoint.accessibility.truncated !== true
  ) {
    findings.push({
      ...common,
      id: `${checkpoint.viewport}:main-landmark:${scope}-document`,
      auditId: "document",
      rule: "main-landmark",
      truth: "measured",
      severity: "medium",
      title: "The page exposes no main landmark",
      observation:
        "The captured accessibility summary contains zero elements with the main landmark role.",
      whyItMatters:
        "A main landmark helps assistive-technology users move directly to the page’s primary content.",
      recommendation: "Wrap the page’s primary content in one semantic main landmark.",
      measurement: { value: "0", threshold: "at least 1", unit: "main landmarks" },
      evidence: { kind: "accessibility", ref: checkpoint.id },
    });
  }

  const documentName = checkpoint.accessibility.rootName.trim();
  if (!documentName || documentName === "Untitled page") {
    findings.push({
      ...common,
      id: `${checkpoint.viewport}:document-name:${scope}-document`,
      auditId: "document",
      rule: "document-name",
      truth: "measured",
      severity: "medium",
      title: "The document exposes no accessible name",
      observation: "The captured accessibility-tree root does not expose a usable document name.",
      whyItMatters:
        "A descriptive document name helps people identify the current page in tabs, history, and assistive technology.",
      recommendation: "Give this page a concise, descriptive document title.",
      measurement: { value: "empty", threshold: "non-empty", unit: "accessible document name" },
      evidence: { kind: "accessibility", ref: checkpoint.id },
    });
  }

  const outlineIssue = headingOutlineIssue(checkpoint);
  if (outlineIssue) {
    findings.push({
      ...common,
      id: `${checkpoint.viewport}:heading-outline:${scope}-document`,
      auditId: "document",
      rule: "heading-outline",
      truth: "measured",
      severity: "medium",
      title: "The page hierarchy is not exposed clearly",
      observation: outlineIssue,
      whyItMatters:
        "A coherent heading structure helps people scan the page and navigate with assistive technology.",
      recommendation:
        "Use one descriptive level-one heading and keep later heading levels in a logical order.",
      measurement: {
        value:
          checkpoint.accessibility.headingOutline
            .map((heading) => `h${heading.level}`)
            .join(" → ") || "none",
        threshold: "logical outline",
        unit: "heading levels",
      },
      evidence: { kind: "accessibility", ref: checkpoint.id },
    });
  }

  return findings;
}

export function createJudgedFinding(
  checkpoint: RemoteCheckpoint,
  input: JudgedFindingInput,
  sequence: number,
): Finding {
  const { title, observation, whyItMatters, recommendation, severity, category, productJob, rect } =
    normalizeJudgedFindingInput(input);

  return {
    id: `${checkpoint.viewport}:visual-judgment:${targetKey(checkpoint)}-${slug(title)}-${sequence}`,
    auditId: `visual-${sequence}`,
    rule: "visual-judgment",
    truth: "judged",
    severity,
    category,
    productJob,
    title,
    observation,
    whyItMatters,
    recommendation,
    viewport: checkpoint.viewport,
    rect: normalizeRegion(rect, checkpoint.viewportSize),
    measurement: null,
    checkpointId: checkpoint.id,
    scopeKey: checkpoint.scopeId,
    evidence: { kind: "screenshot", ref: checkpoint.id },
  };
}

export function normalizeJudgedFindingInput(input: JudgedFindingInput): JudgedFindingInput {
  const normalized = {
    title: boundedText(input.title, 140),
    observation: boundedText(input.observation, 360),
    whyItMatters: boundedText(input.whyItMatters, 300),
    recommendation: boundedText(input.recommendation, 300),
    severity: input.severity,
    category: input.category,
    productJob: input.productJob ? boundedText(input.productJob, 80) || undefined : undefined,
    rect: normalizeRegion(input.rect),
  };
  if (
    !normalized.title ||
    !normalized.observation ||
    !normalized.whyItMatters ||
    !normalized.recommendation
  ) {
    throw new Error("A judged finding needs a title, observation, impact, and recommendation.");
  }
  return normalized;
}

export function snapshotFromCheckpoint(
  checkpoint: RemoteCheckpoint,
  findings: Finding[] = deriveCheckpointFindings(checkpoint),
): AuditSnapshot {
  return {
    capturedAt: checkpoint.capturedAt,
    demoState: checkpoint.preview.applied ? "improved" : "baseline",
    viewport: checkpoint.viewport,
    viewportSize: checkpoint.viewportSize,
    scopeKey: checkpoint.scopeId,
    findings,
    gaps: checkpoint.gaps,
  };
}
