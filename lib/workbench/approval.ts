import { createAuditLaunch } from "@/lib/launch";

import type { Actor } from "./types";

export function canonicalizeApprovedUrl(value: string) {
  return createAuditLaunch(value).targetUrl;
}

export function seedApprovedUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return canonicalizeApprovedUrl(trimmed);
  } catch {
    return null;
  }
}

export function shouldAutoStartPublicCapture(input: {
  mode: "sample" | "remote";
  initialUrl: string;
  hasCheckpoint: boolean;
}) {
  return (
    input.mode === "remote" && !input.hasCheckpoint && seedApprovedUrl(input.initialUrl) !== null
  );
}

export function describeCaptureApproval(input: {
  mode: "sample" | "remote";
  hasCheckpoint: boolean;
  currentUrlApproved: boolean;
}) {
  if (input.mode === "sample") return "Included target; no public capture grant";
  if (input.currentUrlApproved) return "Human-supplied target approved for this session";
  if (input.hasCheckpoint) return "Captured target allowed for bounded follow-up";
  return "No agent capture allowed yet";
}

export function assertApprovedForActor(
  actor: Actor,
  value: string,
  approvedUrls: ReadonlySet<string>,
) {
  const canonicalUrl = canonicalizeApprovedUrl(value);
  if (actor === "agent" && !approvedUrls.has(canonicalUrl)) {
    throw new Error(
      "This exact target has not been explicitly allowed or captured through the visible human controls.",
    );
  }
  return canonicalUrl;
}
