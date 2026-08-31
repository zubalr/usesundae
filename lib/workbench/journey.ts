import type { AuditSnapshot } from "@/lib/audit/types";
import { withoutVisibleNavGap } from "@/lib/capture/visible-nav";
import { withDefaultScheme } from "@/lib/url";

function gapKey(gap: AuditSnapshot["gaps"][number]) {
  return `${gap.scopeKey ?? "audit"}:${gap.id || gap.label.toLowerCase()}`;
}

export function clearVisibleNavGaps(
  snapshots: Partial<Record<AuditSnapshot["viewport"], AuditSnapshot>>,
) {
  const next = { ...snapshots };
  for (const viewport of ["desktop", "mobile"] as const) {
    const snapshot = snapshots[viewport];
    if (snapshot) next[viewport] = { ...snapshot, gaps: withoutVisibleNavGap(snapshot.gaps) };
  }
  return next;
}

export function assertSameJourneyOrigin(activeOrigin: string, requestedUrl: string) {
  let parsed: URL;
  try {
    const active = new URL(activeOrigin);
    parsed = new URL(withDefaultScheme(requestedUrl, active.protocol as "http:" | "https:"));
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
  const gaps = new Map(previous.gaps.map((gap) => [gapKey(gap), gap]));
  for (const gap of next.gaps) gaps.set(gapKey(gap), gap);

  return {
    ...next,
    scopeKey: retainsAnotherScope ? undefined : next.scopeKey,
    findings: [...findings.values()],
    gaps: [...gaps.values()],
  };
}

export function mergeBelowFoldSnapshot(
  previous: AuditSnapshot,
  next: AuditSnapshot,
  capturedFullPage = true,
) {
  const aggregate = mergeJourneySnapshots(previous, next);
  if (!capturedFullPage) return aggregate;
  return {
    ...aggregate,
    gaps: aggregate.gaps.filter(
      (gap) => gap.id !== "gap-below-fold" || gap.scopeKey !== next.scopeKey,
    ),
  };
}
