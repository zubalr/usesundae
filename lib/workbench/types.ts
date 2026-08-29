import type { Finding, Verification } from "@/lib/audit/types";
import type { JudgedFindingInput } from "@/lib/audit/remote";
import type { Viewport } from "@/lib/audit/types";
import type { Decision } from "./decisions";

export type Actor = "human" | "agent" | "system";

export function activityActorLabel(actor: Actor) {
  return `${actor[0].toUpperCase()}${actor.slice(1)} action`;
}

export type Activity = {
  id: string;
  actor: Actor;
  action: string;
  detail: string;
  at: string;
};

export type VerificationReceipt = {
  status: Verification;
  before: string;
  after: string;
  at: string;
};

export type CommandResult = Record<string, unknown> & {
  ok: boolean;
  receipt: string;
};

export type WorkbenchCommands = {
  capturePublicPage: (
    url: string,
    viewport: Viewport,
    actor: Actor,
    signal?: AbortSignal,
    waitForSelector?: string,
  ) => Promise<CommandResult>;
  captureJourneyStep: (
    url: string,
    label: string,
    actor: Actor,
    signal?: AbortSignal,
    waitForSelector?: string,
  ) => Promise<CommandResult>;
  captureBelowFold: (
    waitForSelector: string | undefined,
    actor: Actor,
    signal?: AbortSignal,
  ) => Promise<CommandResult>;
  auditCurrentScope: (
    actor: Actor,
    signal?: AbortSignal,
    waitForSelector?: string,
  ) => Promise<CommandResult>;
  inspectAgentSurface: (actor: Actor) => Promise<CommandResult>;
  getBoardContext: (actor: Actor) => CommandResult;
  recordVisualFinding: (input: JudgedFindingInput, actor: Actor) => Promise<CommandResult>;
  recordCoverageGap: (label: string, detail: string, actor: Actor) => Promise<CommandResult>;
  focusFinding: (findingId: string, actor: Actor) => Promise<CommandResult>;
  setFindingDecision: (
    findingId: string,
    decision: Decision,
    reason: string,
    actor: Actor,
  ) => Promise<CommandResult>;
  previewFix: (
    previewCss: string | undefined,
    actor: Actor,
    signal?: AbortSignal,
    waitForSelector?: string,
  ) => Promise<CommandResult>;
  verifyRecapture: (
    findingId: string | undefined,
    actor: Actor,
    signal?: AbortSignal,
    waitForSelector?: string,
  ) => Promise<CommandResult>;
};

export type VisibleFinding = Finding & {
  decision: Decision;
  verification: Verification;
  verificationReceipt?: VerificationReceipt;
};
