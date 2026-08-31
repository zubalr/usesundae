import type { AuditSnapshot, CoverageGap, Finding } from "@/lib/audit/types";

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
  viewport: AuditSnapshot["viewport"];
  surfaceType?: SurfaceType;
  state?: string;
  captureExtent?: "viewport" | "full-page";
  reason?: string;
  motion?: "observed" | "not_seen" | "not_applicable";
  interaction?: "observed" | "not_seen" | "not_applicable";
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
  interaction: "observed" | "not_seen" | "not_applicable";
  status: "observed" | "blocked" | "not_seen" | "not_applicable";
  capturedAt: string;
  reason?: string;
};

export type CoverageSummary = {
  surfaces: CoverageSurface[];
  openGaps: ScopedCoverageGap[];
  openGapCount: number;
  hasUncoveredScope: boolean;
};

export type ScopedCoverageGap = CoverageGap & {
  viewports: AuditSnapshot["viewport"][];
  targets: CoverageGapTarget[];
};

export type CoverageGapTarget = {
  checkpointId?: string;
  scopeId?: string;
  route?: string;
  viewport: AuditSnapshot["viewport"];
};

export function findFindingSurface(
  surfaces: readonly CoverageSurface[],
  finding: Pick<Finding, "checkpointId" | "scopeKey" | "viewport">,
) {
  const checkpoint = surfaces.find(({ checkpointId }) => checkpointId === finding.checkpointId);
  if (checkpoint) return checkpoint;
  const scope = surfaces.find(
    ({ scopeId, viewport }) => scopeId === finding.scopeKey && viewport === finding.viewport,
  );
  if (scope) return scope;
  if (finding.checkpointId ?? finding.scopeKey) return undefined;
  return surfaces.find(({ viewport }) => viewport === finding.viewport);
}

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
    checkpointId: `included-live-target-${snapshot.viewport}`,
    scopeId: snapshot.scopeKey ?? `included:/demo:${snapshot.viewport}`,
    route: "/demo",
    finalUrl: "/demo",
    label: `Included product surface · ${snapshot.viewport}`,
    surfaceType: "entry",
    viewport: snapshot.viewport,
    state: snapshot.demoState,
    captureExtent: "viewport",
    evidenceTypes: ["dom", "screenshot"],
    motion: "not_seen",
    interaction: "not_seen",
    status: "observed",
    capturedAt: snapshot.capturedAt,
    reason: "Zero-key controlled product review",
  };
}

function remoteSurface(entry: CoverageTrailEntry): CoverageSurface {
  return {
    checkpointId: entry.checkpointId,
    scopeId: entry.scopeId,
    route: routePath(entry.displayUrl),
    finalUrl: entry.displayUrl,
    label: entry.label,
    surfaceType: entry.surfaceType ?? "other",
    viewport: entry.viewport,
    state: entry.state ?? "settled render",
    captureExtent: entry.captureExtent ?? "viewport",
    evidenceTypes: ["screenshot", "text", "accessibility"],
    motion: entry.motion ?? "not_seen",
    interaction: entry.interaction ?? "not_seen",
    status: "observed",
    capturedAt: entry.capturedAt,
    reason: entry.reason,
  };
}

const SAMPLE_VIEWPORTS = ["mobile", "desktop"] as const;

function responsiveSnapshots(
  source: AuditSnapshot | undefined,
  baselines: Partial<Record<AuditSnapshot["viewport"], AuditSnapshot>> | undefined,
) {
  const inspected = SAMPLE_VIEWPORTS.map((viewport) => baselines?.[viewport]).filter(
    (snapshot): snapshot is AuditSnapshot => Boolean(snapshot),
  );
  if (inspected.length > 0) return inspected;
  return source ? [source] : [];
}

function aggregateOpenGaps(
  source: AuditSnapshot | undefined,
  baselines: Partial<Record<AuditSnapshot["viewport"], AuditSnapshot>> | undefined,
  surfaces: readonly CoverageSurface[],
) {
  const aggregated = new Map<string, ScopedCoverageGap>();
  for (const snapshot of responsiveSnapshots(source, baselines)) {
    for (const gap of snapshot.gaps) {
      const surface =
        surfaces.find(({ checkpointId }) => checkpointId === gap.checkpointId) ??
        surfaces.findLast(
          ({ scopeId, viewport }) =>
            scopeId === (gap.scopeKey ?? snapshot.scopeKey) && viewport === snapshot.viewport,
        );
      const target = {
        ...((surface?.checkpointId ?? gap.checkpointId)
          ? { checkpointId: surface?.checkpointId ?? gap.checkpointId }
          : {}),
        ...((surface?.scopeId ?? gap.scopeKey ?? snapshot.scopeKey)
          ? { scopeId: surface?.scopeId ?? gap.scopeKey ?? snapshot.scopeKey }
          : {}),
        ...(surface?.route ? { route: surface.route } : {}),
        viewport: snapshot.viewport,
      };
      const existing = aggregated.get(gap.id);
      if (existing) {
        if (!existing.viewports.includes(snapshot.viewport)) {
          existing.viewports.push(snapshot.viewport);
        }
        const targetKey = `${target.scopeId ?? "audit"}:${target.viewport}`;
        const targetIndex = existing.targets.findIndex(
          (candidate) => `${candidate.scopeId ?? "audit"}:${candidate.viewport}` === targetKey,
        );
        if (targetIndex >= 0) existing.targets[targetIndex] = target;
        else existing.targets.push(target);
        continue;
      }
      aggregated.set(gap.id, { ...gap, viewports: [snapshot.viewport], targets: [target] });
    }
  }
  return [...aggregated.values()];
}

export function deriveCoverageSummary({
  mode,
  baseline,
  current,
  trail,
  baselinesByViewport,
  hasVerification = false,
}: {
  mode: "sample" | "remote";
  baseline?: AuditSnapshot;
  current?: AuditSnapshot;
  trail: CoverageTrailEntry[];
  baselinesByViewport?: Partial<Record<AuditSnapshot["viewport"], AuditSnapshot>>;
  hasVerification?: boolean;
}): CoverageSummary {
  const source = current ?? baseline;
  const surfaces =
    mode === "sample"
      ? responsiveSnapshots(baseline ?? source, baselinesByViewport).map(sampleSurface)
      : trail.map(remoteSurface);
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
  const openGaps = aggregateOpenGaps(baseline ?? source, baselinesByViewport, surfaces);
  return {
    surfaces,
    openGaps,
    openGapCount: openGaps.length,
    hasUncoveredScope: openGaps.length > 0,
  };
}
