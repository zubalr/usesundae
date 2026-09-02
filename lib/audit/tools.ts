import { thresholdMeasurement, type Finding, type Viewport } from "./types";

export type AuditedToolContract = {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: WebMcpInputSchema;
  schemaInspection?: "inspectable" | "not_inspectable";
  annotations?: WebMcpTool["annotations"];
  origin?: string;
};

type RuntimeToolContract = Omit<AuditedToolContract, "inputSchema" | "schemaInspection"> & {
  inputSchema?: unknown;
};

const MAX_RUNTIME_SCHEMA_BYTES = 8_192;

function objectSchema(value: unknown): value is WebMcpInputSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRuntimeSchema(value: string) {
  if (new TextEncoder().encode(value).byteLength > MAX_RUNTIME_SCHEMA_BYTES) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function normalizeRuntimeToolContract(tool: RuntimeToolContract): AuditedToolContract {
  const { inputSchema, ...contract } = tool;
  if (inputSchema === undefined) return { ...contract, schemaInspection: "inspectable" };
  const candidate = typeof inputSchema === "string" ? parseRuntimeSchema(inputSchema) : inputSchema;
  const inspectable = objectSchema(candidate);
  return {
    ...contract,
    inputSchema: inspectable ? candidate : undefined,
    schemaInspection: inspectable ? "inspectable" : "not_inspectable",
  };
}

// Tool annotations are hints to an agent, so a contract that calls itself
// read-only must not use mutating language in either its name or description.
// Keep this conservative: a false positive is useful evidence
// for a human to inspect, while a false negative can make an agent act without
// the caution the action deserves.
const MUTATING_LANGUAGE =
  /\b(?:add|archive|approve|book|cancel|change|checkout|create|delete|deploy|edit|invite|merge|move|pay|publish|purchase|remove|rename|reserve|restore|schedule|send|submit|update|write)\b/i;

function contractFinding(
  tool: AuditedToolContract,
  viewport: Viewport,
  suffix: string,
  input: Omit<
    Finding,
    "id" | "auditId" | "rule" | "truth" | "viewport" | "rect" | "checkpointId" | "evidence"
  >,
): Finding {
  const auditId = `${tool.name}-${suffix}`;
  return {
    ...input,
    id: `${viewport}:agent-surface:${auditId}`,
    auditId,
    rule: "agent-surface",
    truth: "measured",
    viewport,
    rect: null,
    evidence: { kind: "tool-contract", ref: tool.name },
  };
}

export function auditWebMcpTools(
  tools: readonly AuditedToolContract[],
  viewport: Viewport,
): Finding[] {
  const findings: Finding[] = [];

  for (const tool of tools.slice(0, 60)) {
    const description = tool.description?.replace(/\s+/g, " ").trim() ?? "";
    if (description.length < 32) {
      findings.push(
        contractFinding(tool, viewport, "description", {
          severity: "medium",
          title: `${tool.name} does not explain its contract clearly`,
          observation: `The exposed description contains ${description.length} characters.`,
          whyItMatters: "An agent may choose the wrong tool or use it with the wrong expectations.",
          recommendation:
            "Describe when to call the tool, its bounded effect, and the receipt it returns.",
          measurement: thresholdMeasurement(
            `${description.length}`,
            "32+",
            "description characters",
            "lower-is-worse",
          ),
        }),
      );
    }

    if (
      tool.annotations?.readOnlyHint === true &&
      MUTATING_LANGUAGE.test(`${tool.name} ${description}`)
    ) {
      findings.push(
        contractFinding(tool, viewport, "read-only-annotation", {
          severity: "high",
          title: `${tool.name} is marked read-only despite mutating language`,
          observation:
            "The tool name or description uses mutating language while readOnlyHint is true.",
          whyItMatters:
            "An agent may treat a state-changing action as safe to invoke without user caution.",
          recommendation:
            "Remove readOnlyHint or make the tool read-only, and describe its visible state change and receipt.",
          measurement: thresholdMeasurement(
            "true",
            "false or absent",
            "readOnlyHint",
            "non-monotonic",
          ),
        }),
      );
    }

    if (
      tool.schemaInspection !== "not_inspectable" &&
      tool.inputSchema?.additionalProperties !== false
    ) {
      findings.push(
        contractFinding(tool, viewport, "closed-schema", {
          severity: "medium",
          title: `${tool.name} accepts an open-ended input shape`,
          observation: "The exposed object schema does not set additionalProperties to false.",
          whyItMatters:
            "Unexpected arguments make tool behavior harder to validate, debug, and trust.",
          recommendation: "Close the object schema and name every accepted field explicitly.",
          measurement: thresholdMeasurement(
            String(tool.inputSchema?.additionalProperties ?? "missing"),
            "false",
            "additionalProperties",
            "non-monotonic",
          ),
        }),
      );
    }
  }

  return findings;
}

export function collectSiteToolFindings(
  tools: readonly AuditedToolContract[],
  viewport: Viewport,
): Finding[] {
  if (tools.length > 0) return auditWebMcpTools(tools, viewport);
  return [
    {
      id: `${viewport}:agent-surface:no-site-tools`,
      auditId: "no-site-tools",
      rule: "agent-surface",
      truth: "measured",
      severity: "medium",
      title: "This page exposes no Site Tools",
      observation:
        "An agent can read what is rendered but cannot reach any state behind an interaction. States behind menus, modals, and forms were not observed.",
      whyItMatters:
        "Without Site Tools, an agent is limited to the rendered snapshot and cannot reach states behind interaction.",
      recommendation:
        "Expose the product's important states as WebMCP Site Tools so an agent can reach them without clicking.",
      viewport,
      rect: null,
      measurement: thresholdMeasurement("0", "1+", "Site Tools", "lower-is-worse"),
      evidence: { kind: "tool-contract", ref: "document" },
    },
  ];
}
