import assert from "node:assert/strict";
import test from "node:test";

import { auditWebMcpTools } from "../lib/audit/tools";
import { DEMO_TOOL_CONTRACTS } from "../lib/demo/tools";

test("agent-surface audit reports underspecified and misannotated tools", () => {
  const findings = auditWebMcpTools(
    [
      {
        name: "get_summary",
        description: "Read the current summary without changing it.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true },
      },
      {
        name: "delete_workspace",
        description: "Delete the selected workspace and all its fixture-local records.",
        inputSchema: { type: "object", properties: { id: { type: "string" } } },
        annotations: { readOnlyHint: true },
      },
    ],
    "desktop",
  );

  assert.deepEqual(
    findings.map((finding) => finding.auditId),
    ["delete_workspace-read-only-annotation", "delete_workspace-closed-schema"],
  );
  assert.ok(findings.every((finding) => finding.rule === "agent-surface"));
  assert.ok(findings.every((finding) => finding.evidence?.kind === "tool-contract"));
});

test("the included target keeps an inspectable read-only contract defect", () => {
  const findings = auditWebMcpTools(DEMO_TOOL_CONTRACTS, "desktop");
  const archiveFindings = findings.filter((finding) =>
    finding.auditId.startsWith("sundae_lab_archive_workflow-"),
  );

  assert.deepEqual(
    archiveFindings.map((finding) => finding.auditId),
    [
      "sundae_lab_archive_workflow-read-only-annotation",
      "sundae_lab_archive_workflow-closed-schema",
    ],
  );
});
