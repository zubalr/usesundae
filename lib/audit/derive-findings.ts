import {
  accessibleNamePasses,
  contrastRatio,
  findingIdentity,
  tapTargetPasses,
} from "./measurements";
import type { BrowserFacts } from "./dom";
import type { Finding } from "./types";

function baseFinding(facts: BrowserFacts, input: Omit<Finding, "id" | "viewport">): Finding {
  return {
    ...input,
    id: findingIdentity(facts.viewport, input.rule, input.auditId),
    viewport: facts.viewport,
  };
}

export function deriveFindings(facts: BrowserFacts): Finding[] {
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
        measurement: {
          value: `${target.rect.width} × ${target.rect.height}`,
          threshold: "44 × 44",
          unit: "CSS px",
        },
      }),
    );
  }

  for (const sample of facts.contrastSamples) {
    const ratio = contrastRatio(sample.foreground, sample.background);
    if (ratio >= 4.5) continue;
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
        measurement: { value: `${ratio}:1`, threshold: "4.5:1", unit: "contrast ratio" },
      }),
    );
  }

  return findings;
}
