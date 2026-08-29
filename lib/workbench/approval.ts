import type { Actor } from "./types";

export function canonicalizeApprovedUrl(value: string) {
  let target: URL;
  try {
    target = new URL(value.trim());
  } catch {
    throw new Error("Approval requires a complete public http or https URL.");
  }
  if (
    (target.protocol !== "http:" && target.protocol !== "https:") ||
    target.username ||
    target.password
  ) {
    throw new Error("Approval requires a complete public http or https URL without credentials.");
  }
  return target.toString();
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
