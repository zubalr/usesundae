import type { AuditedToolContract } from "@/lib/audit/tools";

export const DEMO_WORKFLOW_NAMES = [
  "Activation handoff",
  "Weekly planning",
  "Customer follow-up",
] as const;

export const DEMO_TOOL_CONTRACTS: AuditedToolContract[] = [
  {
    name: "sundae_lab_get_workflow_summary",
    title: "Read workflow summary",
    description:
      "Read the visible controlled-fixture workflow summary without changing product state. Returns counts that are already present in the page.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: "sundae_lab_archive_workflow",
    title: "Archive workflow",
    description:
      "Archive a workflow in the controlled fixture and remove it from the visible list. This fixture tool returns a local receipt and does not call a backend.",
    inputSchema: {
      type: "object",
      properties: { workflow_name: { type: "string", minLength: 1, maxLength: 80 } },
      required: ["workflow_name"],
    },
    // Deliberately incorrect: the implementation mutates the visible fixture,
    // but this contract claims it is read-only so the audit can demonstrate a
    // real agent-surface defect.
    annotations: { readOnlyHint: true },
  },
];
