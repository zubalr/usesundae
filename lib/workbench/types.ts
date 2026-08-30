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
  toolName?: string;
};

export function activityTitle(activity: Pick<Activity, "action" | "toolName">) {
  return activity.toolName ? `${activity.action} · ${activity.toolName}` : activity.action;
}

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
    toolName?: string,
  ) => Promise<CommandResult>;
  captureJourneyStep: (
    url: string,
    label: string,
    actor: Actor,
    signal?: AbortSignal,
    waitForSelector?: string,
    toolName?: string,
  ) => Promise<CommandResult>;
  captureBelowFold: (
    waitForSelector: string | undefined,
    actor: Actor,
    signal?: AbortSignal,
    toolName?: string,
  ) => Promise<CommandResult>;
  auditCurrentScope: (
    actor: Actor,
    signal?: AbortSignal,
    waitForSelector?: string,
    toolName?: string,
  ) => Promise<CommandResult>;
  inspectAgentSurface: (actor: Actor, toolName?: string) => Promise<CommandResult>;
  getBoardContext: (actor: Actor, findingOffset?: number, toolName?: string) => CommandResult;
  recordVisualFinding: (
    input: JudgedFindingInput,
    actor: Actor,
    toolName?: string,
  ) => Promise<CommandResult>;
  recordCoverageGap: (
    label: string,
    detail: string,
    actor: Actor,
    toolName?: string,
  ) => Promise<CommandResult>;
  focusFinding: (findingId: string, actor: Actor, toolName?: string) => Promise<CommandResult>;
  setFindingDecision: (
    findingId: string,
    decision: Decision,
    reason: string,
    actor: Actor,
    toolName?: string,
  ) => Promise<CommandResult>;
  previewFix: (
    previewCss: string | undefined,
    actor: Actor,
    signal?: AbortSignal,
    waitForSelector?: string,
    toolName?: string,
  ) => Promise<CommandResult>;
  verifyRecapture: (
    findingId: string | undefined,
    actor: Actor,
    signal?: AbortSignal,
    waitForSelector?: string,
    toolName?: string,
  ) => Promise<CommandResult>;
};

export type VisibleFinding = Finding & {
  decision: Decision;
  verification: Verification;
  verificationReceipt?: VerificationReceipt;
};
