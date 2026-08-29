import type { Finding, Viewport } from "./types";

export type AuditedToolContract = {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: WebMcpInputSchema;
  annotations?: WebMcpTool["annotations"];
};

// Tool annotations are hints to an agent, so a contract that calls itself
// read-only must not use mutating language in either its name or description.
// Keep this deliberately conservative: a false positive is useful evidence
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
          measurement: {
            value: `${description.length}`,
            threshold: "32+",
            unit: "description characters",
          },
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
            "Remove readOnlyHint or make the tool genuinely read-only, and describe its visible state change and receipt.",
          measurement: { value: "true", threshold: "false or absent", unit: "readOnlyHint" },
        }),
      );
    }

    if (tool.inputSchema?.additionalProperties !== false) {
      findings.push(
        contractFinding(tool, viewport, "closed-schema", {
          severity: "medium",
          title: `${tool.name} accepts an open-ended input shape`,
          observation: "The exposed object schema does not set additionalProperties to false.",
          whyItMatters:
            "Unexpected arguments make tool behavior harder to validate, debug, and trust.",
          recommendation: "Close the object schema and name every accepted field explicitly.",
          measurement: {
            value: String(tool.inputSchema?.additionalProperties ?? "missing"),
            threshold: "false",
            unit: "additionalProperties",
          },
        }),
      );
    }
  }

  return findings;
}
