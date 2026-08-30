import { createAuditLaunch } from "@/lib/launch";

import type { Actor } from "./types";

export function canonicalizeApprovedUrl(value: string) {
  return createAuditLaunch(value).targetUrl;
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
