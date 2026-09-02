export const DECISION_OPTIONS = {
  open: {
    label: "Open",
    defaultReason: "Reopened for another evidence-based decision.",
  },
  accepted: {
    label: "Accepted",
    defaultReason: "Evidence supports fixing this in the current scope.",
  },
  deferred: {
    label: "Deferred",
    defaultReason: "Keep the evidence, but schedule the change later.",
  },
  dismissed: {
    label: "Dismissed",
    defaultReason: "Reviewed and out of scope for this product state.",
  },
} as const;

export type Decision = keyof typeof DECISION_OPTIONS;

export const DECISION_VALUES = Object.keys(DECISION_OPTIONS) as [Decision, ...Decision[]];

export function isDecision(value: unknown): value is Decision {
  return typeof value === "string" && Object.hasOwn(DECISION_OPTIONS, value);
}
