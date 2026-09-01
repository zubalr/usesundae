import {
  accessibleNamePasses,
  contrastRatioOrNull,
  findingIdentity,
  tapTargetPasses,
} from "./measurements";
import type { BrowserFacts } from "./dom";
import type { Finding, Region, Severity } from "./types";

const FOLD_PX = 700;
const SEVERITY_WEIGHT: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

function baseFinding(facts: BrowserFacts, input: Omit<Finding, "id" | "viewport">): Finding {
  return {
    ...input,
    id: findingIdentity(facts.viewport, input.rule, input.auditId),
    viewport: facts.viewport,
  };
}

export function isAuditableSurface(rect: Finding["rect"], viewportWidth: number) {
  if (!rect) return true;
  return (
    rect.width >= 8 &&
    rect.height >= 8 &&
    rect.width * rect.height >= 120 &&
    rect.x + rect.width > 0 &&
    rect.x < viewportWidth &&
    rect.y >= 0
  );
}

function tapTargetShapeClass(rect: Pick<Region, "width" | "height">) {
  const icon = Math.abs(rect.width - rect.height) < 12 && rect.width < 60;
  return icon ? "icon control" : rect.height < 30 ? "inline text link" : "button or tile";
}

function prominenceScore(finding: Finding) {
  const weight = SEVERITY_WEIGHT[finding.severity];
  const rect = finding.rect;
  if (!rect) return weight * 10;
  return weight * Math.sqrt(rect.width * rect.height) * (FOLD_PX / (FOLD_PX + rect.y));
}

function groupAndRankFindings(findings: Finding[]) {
  const groups = new Map<string, Finding[]>();
  for (const finding of findings) {
    const key = finding.groupKey ?? finding.id;
    const members = groups.get(key);
    if (members) members.push(finding);
    else groups.set(key, [finding]);
  }

  const ranked: Finding[] = [];
  for (const members of groups.values()) {
    const worst = members.reduce((lead, candidate) =>
      prominenceScore(candidate) > prominenceScore(lead) ? candidate : lead,
    );
    const instanceCount = members.length;
    ranked.push({
      ...worst,
      instanceCount,
      aboveTheFold: worst.rect !== null && worst.rect.y < FOLD_PX,
      prominenceScore: prominenceScore(worst),
      observation:
        instanceCount > 1
          ? `${worst.observation} ${instanceCount} instances · worst shown.`
          : worst.observation,
    });
  }
  return ranked.toSorted(
    (left, right) => (right.prominenceScore ?? 0) - (left.prominenceScore ?? 0),
  );
}

export function presentFindings(findings: Finding[], viewportWidth: number) {
  return groupAndRankFindings(
    findings.filter((finding) => isAuditableSurface(finding.rect, viewportWidth)),
  );
}

export function collectMeasuredFindings(facts: BrowserFacts): Finding[] {
  const findings: Finding[] = [];
  const overflowBy = Math.max(0, facts.overflow.scrollWidth - facts.overflow.clientWidth);

  if (overflowBy > 0) {
    findings.push(
      baseFinding(facts, {
        auditId: "document-overflow",
        rule: "horizontal-overflow",
        truth: "measured",
        severity: "high",
        title: "Content escapes the mobile viewport",
        observation: `The rendered document is ${overflowBy} CSS px wider than the viewport.`,
        whyItMatters: "People may need to pan sideways or may miss clipped controls and values.",
        recommendation:
          "Reflow the wide content at this breakpoint instead of preserving a fixed minimum width.",
        rect: facts.overflow.rect ?? {
          x: 0,
          y: 0,
          width: facts.overflow.clientWidth,
          height: Math.min(72, facts.viewportSize.height),
        },
        measurement: {
          value: `${overflowBy}`,
          threshold: "0",
          unit: "CSS px beyond viewport",
        },
      }),
    );
  }

  for (const control of facts.controls) {
    if (accessibleNamePasses(control.accessibleName)) continue;
    findings.push(
      baseFinding(facts, {
        auditId: control.auditId,
        identityConfidence: control.identityConfidence,
        rule: "accessible-name",
        truth: "measured",
        severity: "high",
        title: `${control.label} has no accessible name`,
        observation: "The browser exposes no text or ARIA label for this interactive control.",
        whyItMatters: "People using assistive technology may not know what the control does.",
        recommendation: "Add a concise accessible name that describes the action.",
        rect: control.rect,
        measurement: { value: "empty", threshold: "non-empty", unit: "accessible name" },
      }),
    );
  }

  for (const target of facts.tapTargets) {
    if (tapTargetPasses(target.rect)) continue;
    findings.push(
      baseFinding(facts, {
        auditId: target.auditId,
        identityConfidence: target.identityConfidence,
        rule: "tap-target",
        truth: "measured",
        severity: "medium",
        title: `${target.label} is difficult to target`,
        observation: `The action measures ${target.rect.width} × ${target.rect.height} CSS px; the threshold is 44 × 44.`,
        whyItMatters: "Small targets can be harder to activate accurately on touch screens.",
        recommendation: "Increase the interactive hit area to at least 44 × 44 CSS px.",
        rect: target.rect,
        groupKey: tapTargetShapeClass(target.rect),
        measurement: {
          value: `${target.rect.width} × ${target.rect.height}`,
          threshold: "44 × 44",
          unit: "CSS px",
        },
      }),
    );
  }

  for (const sample of facts.contrastSamples) {
    const ratio = contrastRatioOrNull(sample.foreground, sample.background);
    if (ratio === null || ratio >= 4.5) continue;
    findings.push(
      baseFinding(facts, {
        auditId: sample.auditId,
        identityConfidence: sample.identityConfidence,
        rule: "contrast",
        truth: "measured",
        severity: "medium",
        title: `${sample.label} falls below text contrast guidance`,
        observation: `The measured contrast is ${ratio}:1; the normal-text threshold is 4.5:1.`,
        whyItMatters: "Low-contrast supporting copy can become difficult to read.",
        recommendation: "Use a darker text color while preserving the visual hierarchy.",
        rect: sample.rect,
        groupKey: `${sample.foreground} / ${sample.background}`,
        measurement: { value: `${ratio}:1`, threshold: "4.5:1", unit: "contrast ratio" },
      }),
    );
  }

  return findings;
}

export function deriveFindings(facts: BrowserFacts): Finding[] {
  return presentFindings(collectMeasuredFindings(facts), facts.viewportSize.width);
}
