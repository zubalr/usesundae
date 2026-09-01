import type { Actor, CommandResult, WorkbenchCommands } from "./types";
import type { Decision } from "./decisions";

export type AcceptFollowThroughKind = "preview_then_verify" | "remeasure_no_preview" | "none";

export function acceptFollowThroughKind(input: {
  decision: Decision;
  mode: "sample" | "remote";
  previewCss: string;
}): AcceptFollowThroughKind {
  if (input.decision !== "accepted") return "none";
  if (input.mode === "sample") return "preview_then_verify";
  return input.previewCss.trim() ? "preview_then_verify" : "remeasure_no_preview";
}

export function acceptFollowThroughReceipt(kind: AcceptFollowThroughKind, acceptReceipt: string) {
  if (kind === "preview_then_verify") return `${acceptReceipt} Accepted · previewed and verified.`;
  if (kind === "remeasure_no_preview")
    return `${acceptReceipt} Accepted · re-measured, no preview.`;
  return acceptReceipt;
}

export async function runAcceptFollowThrough(input: {
  kind: Exclude<AcceptFollowThroughKind, "none">;
  accept: CommandResult;
  findingId: string;
  actor: Actor;
  signal?: AbortSignal;
  waitForSelector?: string;
  toolName?: string;
  previewCss: string | undefined;
  previewFix: WorkbenchCommands["previewFix"];
  verifyRecapture: WorkbenchCommands["verifyRecapture"];
  auditCurrentScope: WorkbenchCommands["auditCurrentScope"];
}): Promise<CommandResult> {
  const receipt = acceptFollowThroughReceipt(input.kind, input.accept.receipt);
  if (input.kind === "remeasure_no_preview") {
    const remasure = await input.auditCurrentScope(
      input.actor,
      input.signal,
      input.waitForSelector,
      input.toolName,
    );
    return {
      ...input.accept,
      receipt,
      follow_through: "remeasured_no_preview",
      remasure,
    };
  }

  const preview = await input.previewFix(
    input.previewCss,
    input.actor,
    input.signal,
    input.waitForSelector,
    input.toolName,
  );
  const verification = await input.verifyRecapture(
    input.findingId,
    input.actor,
    input.signal,
    input.waitForSelector,
    input.toolName,
  );
  return {
    ...input.accept,
    receipt,
    follow_through: "previewed_and_verified",
    preview,
    verification,
  };
}
