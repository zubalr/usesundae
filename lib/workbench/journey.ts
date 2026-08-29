import type { AuditSnapshot } from "@/lib/audit/types";

export function assertSameJourneyOrigin(activeOrigin: string, requestedUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(requestedUrl);
  } catch {
    throw new Error("Enter a valid public http or https URL for this journey step.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Journey steps require a public http or https URL.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Journey-step URLs cannot contain credentials.");
  }
  if (parsed.origin !== activeOrigin) {
    throw new Error(
      "Journey steps stay on the active origin. Start a new audit to inspect another site.",
    );
  }
  return parsed.toString();
}

export function mergeJourneySnapshots(previous: AuditSnapshot, next: AuditSnapshot): AuditSnapshot {
  if (previous.viewport !== next.viewport) {
    throw new Error("Journey checkpoints must use the same viewport to share one evidence board.");
  }
  const priorScopes = new Set(previous.findings.map((finding) => finding.scopeKey).filter(Boolean));
  const retainsAnotherScope =
    Boolean(next.scopeKey) && [...priorScopes].some((scopeKey) => scopeKey !== next.scopeKey);
  const retained = previous.findings.filter((finding) => {
    if (!next.scopeKey) return finding.truth === "judged" || finding.rule === "agent-surface";
    return finding.scopeKey !== next.scopeKey || finding.truth === "judged";
  });
  const findings = new Map(retained.map((finding) => [finding.id, finding]));
  for (const finding of next.findings) findings.set(finding.id, finding);
  const gaps = new Map(previous.gaps.map((gap) => [gap.label.toLowerCase(), gap]));
  for (const gap of next.gaps) gaps.set(gap.label.toLowerCase(), gap);

  return {
    ...next,
    scopeKey: retainsAnotherScope ? undefined : next.scopeKey,
    findings: [...findings.values()],
    gaps: [...gaps.values()],
  };
}

export function mergeBelowFoldSnapshot(previous: AuditSnapshot, next: AuditSnapshot) {
  const aggregate = mergeJourneySnapshots(previous, next);
  if (aggregate.scopeKey !== next.scopeKey) return aggregate;
  return {
    ...aggregate,
    gaps: aggregate.gaps.filter((gap) => gap.id !== "gap-below-fold"),
  };
}
