import { compareFinding } from "@/lib/audit/recapture";
import type { AuditSnapshot, DemoState, Finding, Verification, Viewport } from "@/lib/audit/types";
import type { VerificationReceipt } from "./types";

export type EvidenceBoardDescription = {
  summary: string;
  currentCount: number | null;
  baselineCount: number;
  retainsBaseline: boolean;
  listLabel: string;
  truthLabel: "Current evidence" | "Baseline evidence";
};

function findingCount(count: number, role?: "current" | "retained baseline") {
  return `${count}${role ? ` ${role}` : ""} finding${count === 1 ? "" : "s"}`;
}

export function describeEvidenceBoard(
  baseline: AuditSnapshot | undefined,
  current: AuditSnapshot | undefined,
  activeState: DemoState,
  viewport: Viewport,
): EvidenceBoardDescription {
  const baselineCount = baseline?.findings.length ?? 0;

  if (!baseline) {
    return {
      summary: "Measuring the live product…",
      currentCount: null,
      baselineCount: 0,
      retainsBaseline: false,
      listLabel: "Findings",
      truthLabel: "Current evidence",
    };
  }

  if (current?.demoState !== activeState) {
    const returningToBaseline = activeState === "baseline";
    return {
      summary: returningToBaseline
        ? "Refreshing the baseline measurement…"
        : `${findingCount(baselineCount, "retained baseline")} · measuring current preview…`,
      currentCount: null,
      baselineCount,
      retainsBaseline: !returningToBaseline,
      listLabel: returningToBaseline ? "Findings" : "Retained baseline findings",
      truthLabel: returningToBaseline ? "Current evidence" : "Baseline evidence",
    };
  }

  const currentCount = current.findings.length;
  const retainsBaseline = activeState === "improved" || current !== baseline;
  return {
    summary: retainsBaseline
      ? `${findingCount(currentCount, "current")} · ${findingCount(baselineCount, "retained baseline")}`
      : `${findingCount(currentCount, "current")} from a fresh ${viewport} measurement`,
    currentCount,
    baselineCount,
    retainsBaseline,
    listLabel: retainsBaseline ? "Retained baseline findings" : "Current findings",
    truthLabel: retainsBaseline ? "Baseline evidence" : "Current evidence",
  };
}

export function verificationLabel(status: Verification) {
  if (status === "not_run") return "Not verified";
  if (status === "still_open") return "Still open";
  if (status === "fixed") return "Verified fixed";
  return "Unverified";
}

export function invalidateVerificationForFindings(
  receipts: Record<string, VerificationReceipt>,
  findings: Finding[],
) {
  const next = { ...receipts };
  let changed = false;

  for (const finding of findings) {
    if (!(finding.id in next)) continue;
    delete next[finding.id];
    changed = true;
  }

  return changed ? next : receipts;
}

export function buildVerificationReceipts(
  previousFindings: Finding[],
  currentSnapshot: AuditSnapshot,
  at: string,
) {
  const receipts: Record<string, VerificationReceipt> = {};
  const currentById = new Map(currentSnapshot.findings.map((finding) => [finding.id, finding]));
  const summary = { fixed: 0, still_open: 0, unverified: 0 };
  const results = previousFindings.map((finding) => {
    const scopeWasMeasured =
      currentSnapshot.viewport === finding.viewport &&
      (!finding.scopeKey || finding.scopeKey === currentSnapshot.scopeKey);
    const status = compareFinding(finding, currentById, scopeWasMeasured);
    const currentFinding = currentById.get(finding.id);
    receipts[finding.id] = {
      status,
      before: finding.measurement?.value ?? finding.observation,
      after:
        currentFinding?.measurement?.value ??
        currentFinding?.observation ??
        (status === "fixed" ? "Not reproduced" : "Scope not measured"),
      at,
    };
    if (status !== "not_run") summary[status] += 1;
    return { id: finding.id, status };
  });

  return {
    receipts,
    results,
    summary,
  };
}
