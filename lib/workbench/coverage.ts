import type { AuditSnapshot } from "@/lib/audit/types";

export type SurfaceType =
  | "entry"
  | "core value"
  | "product"
  | "pricing"
  | "about"
  | "docs/support"
  | "journey step"
  | "empty"
  | "loading"
  | "error"
  | "success/confirmation"
  | "permission"
  | "other";

export type CoverageTrailEntry = {
  checkpointId: string;
  scopeId: string;
  label: string;
  displayUrl: string;
  capturedAt: string;
  findingCount: number;
  surfaceType?: SurfaceType;
  state?: string;
  captureExtent?: "viewport" | "full-page";
  reason?: string;
  motion?: "observed" | "not_seen" | "not_applicable";
};

export type CoverageSurface = {
  checkpointId: string;
  scopeId: string;
  route: string;
  finalUrl: string;
  label: string;
  surfaceType: SurfaceType;
  viewport: AuditSnapshot["viewport"];
  state: string;
  captureExtent: "viewport" | "full-page";
  evidenceTypes: Array<"dom" | "screenshot" | "text" | "accessibility">;
  motion: "observed" | "not_seen" | "not_applicable";
  status: "observed" | "blocked" | "not_seen" | "not_applicable";
  capturedAt: string;
  reason?: string;
};

export type CoverageSummary = {
  surfaces: CoverageSurface[];
  openGapCount: number;
  hasUncoveredScope: boolean;
};

function routePath(value: string) {
  try {
    return new URL(value).pathname || "/";
  } catch {
    return value || "/";
  }
}

export function inferSurfaceType(label: string, url: string): SurfaceType {
  const evidence = `${label} ${routePath(url)}`.toLowerCase();
  if (/\b(pricing|plans?)\b/.test(evidence)) return "pricing";
  if (/\b(about|company)\b/.test(evidence)) return "about";
  if (/\b(docs?|support|help|faq)\b/.test(evidence)) return "docs/support";
  if (/\b(dashboard|app|workspace|product|features?)\b/.test(evidence)) return "product";
  return "journey step";
}

function sampleSurface(snapshot: AuditSnapshot): CoverageSurface {
  return {
    checkpointId: "included-live-target",
    scopeId: snapshot.scopeKey ?? `included:/demo:${snapshot.viewport}`,
    route: "/demo",
    finalUrl: "/demo",
    label: "Included product surface",
    surfaceType: "entry",
    viewport: snapshot.viewport,
    state: snapshot.demoState,
    captureExtent: "viewport",
    evidenceTypes: ["dom", "screenshot"],
    motion: "not_seen",
    status: "observed",
    capturedAt: snapshot.capturedAt,
    reason: "Zero-key controlled product review",
  };
}

function remoteSurface(
  entry: CoverageTrailEntry,
  viewport: AuditSnapshot["viewport"],
): CoverageSurface {
  return {
    checkpointId: entry.checkpointId,
    scopeId: entry.scopeId,
    route: routePath(entry.displayUrl),
    finalUrl: entry.displayUrl,
    label: entry.label,
    surfaceType: entry.surfaceType ?? "other",
    viewport,
    state: entry.state ?? "settled render",
    captureExtent: entry.captureExtent ?? "viewport",
    evidenceTypes: ["screenshot", "text", "accessibility"],
    motion: entry.motion ?? "not_seen",
    status: "observed",
    capturedAt: entry.capturedAt,
    reason: entry.reason,
  };
}

export function deriveCoverageSummary({
  mode,
  baseline,
  current,
  trail,
  hasVerification = false,
}: {
  mode: "sample" | "remote";
  baseline?: AuditSnapshot;
  current?: AuditSnapshot;
  trail: CoverageTrailEntry[];
  hasVerification?: boolean;
}): CoverageSummary {
  const source = current ?? baseline;
  const surfaces = source
    ? mode === "sample"
      ? [sampleSurface(baseline ?? source)]
      : trail.map((entry) => remoteSurface(entry, source.viewport))
    : [];
  if (mode === "sample" && baseline && current && current.capturedAt !== baseline.capturedAt) {
    surfaces.push({
      ...sampleSurface(current),
      checkpointId: `included-${hasVerification ? "verification" : "preview"}-${current.capturedAt}`,
      label: hasVerification ? "Fresh verification" : "Reversible preview",
      state: current.demoState,
      reason: hasVerification
        ? "Comparable recapture after explicit verification"
        : "Preview measurement; not verification",
    });
  }
  const openGapCount = (baseline ?? current)?.gaps.length ?? 0;
  return { surfaces, openGapCount, hasUncoveredScope: openGapCount > 0 };
}
