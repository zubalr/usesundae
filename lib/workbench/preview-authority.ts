import type { Decision } from "./decisions";

type PreviewAuthorityInput = {
  findingId?: string | null;
  decision?: Decision;
  reason?: string;
  previewActive: boolean;
  previewFindingId?: string | null;
};

export function evaluatePreviewAuthority(input: PreviewAuthorityInput) {
  const hasReasonedAcceptance = Boolean(
    input.findingId && input.decision === "accepted" && input.reason?.trim(),
  );
  const hasMatchingPreview = Boolean(
    hasReasonedAcceptance && input.previewActive && input.previewFindingId === input.findingId,
  );
  const previewConflicts = input.previewActive && !hasMatchingPreview;

  return {
    canPreview: hasReasonedAcceptance && !previewConflicts,
    canVerify: hasMatchingPreview,
    previewMessage: hasReasonedAcceptance
      ? "Reset the active preview before previewing another finding."
      : "Accept the selected finding with a reason before previewing.",
    verifyMessage: hasMatchingPreview
      ? "Freshly recapture the active preview for this finding."
      : "Create an active preview for this accepted finding before verification.",
  };
}
