import type { Finding, Verification } from "./types";

export function compareFinding(
  previous: Finding,
  currentFindings: readonly Finding[] | { has: (findingId: string) => boolean },
  scopeWasMeasured: boolean,
): Verification {
  if (!scopeWasMeasured) return "unverified";
  const wasReproduced =
    "has" in currentFindings
      ? currentFindings.has(previous.id)
      : currentFindings.some((finding) => finding.id === previous.id);
  if (previous.identityConfidence === "unstable" && !wasReproduced) return "unverified";
  if (previous.truth === "judged" && !wasReproduced) return "unverified";
  return wasReproduced ? "still_open" : "fixed";
}
