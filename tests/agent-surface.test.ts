import assert from "node:assert/strict";
import test from "node:test";

import {
  auditWebMcpTools,
  collectSiteToolFindings,
  normalizeRuntimeToolContract,
} from "../lib/audit/tools";
import {
  demoWebMcpReadyMessage,
  DEMO_TOOL_CONTRACTS,
  DEMO_WEBMCP_STATUS_MESSAGES,
} from "../lib/demo/tools";

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

test("normalizes object and serialized runtime schemas before auditing them", () => {
  const closedSchema = { type: "object", properties: {}, additionalProperties: false } as const;

  for (const inputSchema of [closedSchema, JSON.stringify(closedSchema)]) {
    const tool = normalizeRuntimeToolContract({
      name: "sundae_lab_get_workflow_summary",
      description:
        "Read the visible controlled-fixture workflow summary without changing product state.",
      inputSchema,
      annotations: { readOnlyHint: true },
    });

    assert.equal(tool.schemaInspection, "inspectable");
    assert.equal(tool.inputSchema?.additionalProperties, false);
    assert.equal(
      auditWebMcpTools([tool], "desktop").some((finding) =>
        finding.auditId.endsWith("-closed-schema"),
      ),
      false,
    );
  }
});

test("marks malformed or oversized runtime schemas uninspectable without inventing a defect", () => {
  for (const inputSchema of ["{not-json", JSON.stringify("not-an-object"), "x".repeat(20_000)]) {
    const tool = normalizeRuntimeToolContract({
      name: "sundae_lab_get_workflow_summary",
      description:
        "Read the visible controlled-fixture workflow summary without changing product state.",
      inputSchema,
      annotations: { readOnlyHint: true },
    });

    assert.equal(tool.schemaInspection, "not_inspectable");
    assert.equal(
      auditWebMcpTools([tool], "desktop").some((finding) =>
        finding.auditId.endsWith("-closed-schema"),
      ),
      false,
    );
  }
});

test("a page with no Site Tools is an honest coverage finding, not an error", () => {
  const findings = collectSiteToolFindings([], "desktop");

  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.rule, "agent-surface");
  assert.equal(findings[0]?.truth, "measured");
  assert.match(findings[0]?.title ?? "", /no Site Tools/i);
  assert.match(findings[0]?.observation ?? "", /cannot reach any state behind an interaction/i);
  assert.match(findings[0]?.observation ?? "", /menus, modals, and forms were not observed/i);
  assert.doesNotMatch(findings[0]?.title ?? "", /error/i);
});

test("observed Site Tools still surface the planted read-only lie", () => {
  const findings = collectSiteToolFindings(DEMO_TOOL_CONTRACTS, "desktop");
  assert.ok(
    findings.some(
      (finding) => finding.auditId === "sundae_lab_archive_workflow-read-only-annotation",
    ),
  );
  assert.equal(
    findings.some((finding) => finding.title.includes("no Site Tools")),
    false,
  );
});

test("the nested fixture status does not imply the workbench lost Site Tools", () => {
  assert.match(DEMO_WEBMCP_STATUS_MESSAGES.unavailable, /Nested Site Tools/);
  assert.match(DEMO_WEBMCP_STATUS_MESSAGES.unavailable, /declared contracts/);
  assert.doesNotMatch(DEMO_WEBMCP_STATUS_MESSAGES.unavailable, /^Site Tools unavailable/);
  assert.equal(demoWebMcpReadyMessage(2), "2 nested target tools registered.");
});
