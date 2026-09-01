import {
  DESIGN_SIGNAL_NODE_CAP,
  readDesignScopes,
  type DesignHistogram,
  type DesignScopeMetrics,
} from "./design-signal";
import {
  accessibleNamePasses,
  contrastRatioOrNull,
  findingIdentity,
  tapTargetPasses,
} from "./measurements";
import type { BrowserFacts } from "./dom";
import {
  descriptiveMeasurement,
  thresholdMeasurement,
  type Finding,
  type Region,
  type Severity,
} from "./types";

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
  const weight = SEVERITY_WEIGHT[finding.severity ?? "low"];
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
        measurement: thresholdMeasurement(
          `${overflowBy}`,
          "0",
          "CSS px beyond viewport",
          "higher-is-worse",
        ),
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
        measurement: thresholdMeasurement("empty", "non-empty", "accessible name", "non-monotonic"),
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
        measurement: thresholdMeasurement(
          `${target.rect.width} × ${target.rect.height}`,
          "44 × 44",
          "CSS px",
          "lower-is-worse",
        ),
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
        measurement: thresholdMeasurement(
          `${ratio}:1`,
          "4.5:1",
          "contrast ratio",
          "lower-is-worse",
        ),
      }),
    );
  }

  return findings;
}

const NO_THRESHOLD_SENTENCE = "No universal quality threshold exists.";

function histogramK(histogram: DesignHistogram) {
  return histogram.values.length + histogram.omitted;
}

function formatEffective(value: number) {
  return (Math.round(value * 10) / 10).toFixed(1);
}

function formatReuse(value: number) {
  return (Math.round(value * 100) / 100).toFixed(2);
}

type CountPart = {
  noun: string;
  weighting: string;
  of: (scope: DesignScopeMetrics) => DesignHistogram;
};

function describeCounts(
  first: DesignScopeMetrics | null,
  full: DesignScopeMetrics,
  parts: readonly CountPart[],
  truncated: boolean,
) {
  const scopes = first
    ? ([
        ["The first viewport", first],
        ["The full page", full],
      ] as const)
    : ([["The full page", full]] as const);
  const sentences: string[] = [];
  for (const [label, scope] of scopes) {
    for (const part of parts) {
      const histogram = part.of(scope);
      sentences.push(
        `${label} contains ${histogramK(histogram)} exact ${part.noun}; ${part.weighting} effective count is ${formatEffective(histogram.kEff)}.`,
      );
    }
  }
  sentences.push(NO_THRESHOLD_SENTENCE);
  if (truncated) sentences.push(`Sample truncated at ${DESIGN_SIGNAL_NODE_CAP} visible nodes.`);
  return sentences.join(" ");
}

function describeAlignment(
  first: DesignScopeMetrics | null,
  full: DesignScopeMetrics,
  truncated: boolean,
) {
  const scopes = first
    ? ([
        ["The first viewport", first],
        ["The full page", full],
      ] as const)
    : ([["The full page", full]] as const);
  const sentences = scopes.map(
    ([label, scope]) =>
      `${label} contains ${scope.alignment.distinctEdges} distinct alignment edges; reuse fraction is ${formatReuse(scope.alignment.reuseFraction)}.`,
  );
  sentences.push(NO_THRESHOLD_SENTENCE);
  if (truncated) sentences.push(`Sample truncated at ${DESIGN_SIGNAL_NODE_CAP} visible nodes.`);
  return sentences.join(" ");
}

function compactCount(first: DesignScopeMetrics | null, full: DesignScopeMetrics, part: CountPart) {
  const histogram = part.of(first ?? full);
  return `${histogramK(histogram)} (K_eff ${formatEffective(histogram.kEff)})`;
}

export function collectDesignSignalFindings(facts: BrowserFacts): Finding[] {
  const scopes = readDesignScopes(facts.designSignal);
  if (!scopes) return [];
  const { firstViewport, fullPage, truncated } = scopes;
  const common = {
    rule: "design-signal" as const,
    truth: "measured" as const,
    claimType: "MEASUREMENT" as const,
    whyItMatters:
      "This is a descriptive count of what the rendered surface uses. No universal quality threshold exists.",
    recommendation:
      "Cite this count as evidence. Label any conclusion about whether the hierarchy serves the task as judgment.",
    rect: null,
  };
  const metrics = [
    {
      auditId: "font-sizes",
      title: "Font sizes",
      unit: "font sizes",
      observation: describeCounts(
        firstViewport,
        fullPage,
        [
          {
            noun: "font sizes",
            weighting: "character-weighted",
            of: (scope) => scope.typeScale,
          },
        ],
        truncated,
      ),
      value: compactCount(firstViewport, fullPage, {
        noun: "font sizes",
        weighting: "character-weighted",
        of: (scope) => scope.typeScale,
      }),
    },
    {
      auditId: "colours",
      title: "Text and surface colours",
      unit: "colours",
      observation: describeCounts(
        firstViewport,
        fullPage,
        [
          {
            noun: "text colours",
            weighting: "character-weighted",
            of: (scope) => scope.textColors,
          },
          {
            noun: "surface colours",
            weighting: "area-weighted",
            of: (scope) => scope.surfaceColors,
          },
        ],
        truncated,
      ),
      value: compactCount(firstViewport, fullPage, {
        noun: "text colours",
        weighting: "character-weighted",
        of: (scope) => scope.textColors,
      }),
    },
    {
      auditId: "spacing",
      title: "Spacing values",
      unit: "spacing values",
      observation: describeCounts(
        firstViewport,
        fullPage,
        [
          {
            noun: "spacing values",
            weighting: "area-weighted",
            of: (scope) => scope.spacing,
          },
        ],
        truncated,
      ),
      value: compactCount(firstViewport, fullPage, {
        noun: "spacing values",
        weighting: "area-weighted",
        of: (scope) => scope.spacing,
      }),
    },
    {
      auditId: "radii-shadows",
      title: "Border radii and shadow signatures",
      unit: "radii and shadows",
      observation: describeCounts(
        firstViewport,
        fullPage,
        [
          {
            noun: "border radii",
            weighting: "area-weighted",
            of: (scope) => scope.radii,
          },
          {
            noun: "shadow signatures",
            weighting: "area-weighted",
            of: (scope) => scope.shadows,
          },
        ],
        truncated,
      ),
      value: compactCount(firstViewport, fullPage, {
        noun: "border radii",
        weighting: "area-weighted",
        of: (scope) => scope.radii,
      }),
    },
    {
      auditId: "alignment",
      title: "Alignment edges",
      unit: "alignment edges",
      observation: describeAlignment(firstViewport, fullPage, truncated),
      value: `${(firstViewport ?? fullPage).alignment.distinctEdges} (reuse ${formatReuse((firstViewport ?? fullPage).alignment.reuseFraction)})`,
    },
  ];
  return metrics.map((metric) =>
    baseFinding(facts, {
      ...common,
      auditId: metric.auditId,
      title: metric.title,
      observation: metric.observation,
      measurement: descriptiveMeasurement(metric.value, metric.unit),
    }),
  );
}

export function deriveFindings(facts: BrowserFacts): Finding[] {
  return [
    ...presentFindings(collectMeasuredFindings(facts), facts.viewportSize.width),
    ...collectDesignSignalFindings(facts),
  ];
}
