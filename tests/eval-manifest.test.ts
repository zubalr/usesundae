import assert from "node:assert/strict";
import test from "node:test";

import evals from "../evals/webmcp-prompts.json";
import type { WorkbenchCommands } from "../lib/workbench/types";
import { registerWorkbenchTools } from "../lib/webmcp/register";

const registeredTools = new Set([
  "capture_public_page",
  "capture_journey_step",
  "capture_visible_nav",
  "capture_below_fold",
  "audit_current_scope",
  "inspect_agent_surface",
  "get_board_context",
  "record_visual_finding",
  "record_coverage_gap",
  "focus_finding",
  "set_finding_decision",
  "preview_fix",
  "verify_recapture",
]);

function commandResult(receipt: string) {
  return Promise.resolve({ ok: true, receipt });
}

test("the WebMCP eval manifest only expects registered tools", () => {
  assert.equal(new Set(evals.map((entry) => entry.id)).size, evals.length);
  assert.ok(evals.length >= registeredTools.size);
  for (const entry of evals) {
    assert.ok(entry.messages[0]?.content);
    assert.ok(entry.expectedCall.length > 0);
    for (const call of entry.expectedCall) {
      assert.equal(
        registeredTools.has(call.functionName),
        true,
        `${entry.id} references ${call.functionName}`,
      );
    }
  }
});

test("design-review evals require categorized visible judgment after measurement and board context", () => {
  const designReview = evals.find((entry) =>
    /review this product/i.test(entry.messages[0]!.content),
  );
  assert.ok(designReview);
  assert.deepEqual(
    designReview.expectedCall.slice(0, 2).map(({ functionName }) => functionName),
    ["audit_current_scope", "get_board_context"],
  );
  const judgedCalls = designReview.expectedCall.filter(
    ({ functionName }) => functionName === "record_visual_finding",
  );
  assert.deepEqual(
    judgedCalls
      .map(({ arguments: input }) => ("category" in input ? input.category : undefined))
      .toSorted(),
    ["interaction", "ui", "ux"],
  );
  assert.ok(
    judgedCalls.every(
      ({ arguments: input }) =>
        "product_job" in input &&
        typeof input.product_job === "string" &&
        input.product_job.length <= 80,
    ),
  );

  for (const entry of evals) {
    for (const call of entry.expectedCall) {
      if (call.functionName !== "record_visual_finding") continue;
      assert.ok(
        "category" in call.arguments &&
          typeof call.arguments.category === "string" &&
          ["ui", "ux", "interaction"].includes(call.arguments.category),
      );
    }
  }
});

test("representative eval calls execute through the registered tool surface", async () => {
  const registered: WebMcpTool[] = [];
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      modelContext: {
        registerTool(tool: WebMcpTool) {
          registered.push(tool);
        },
      },
    },
  });

  const calls: string[] = [];
  const commands = {
    capturePublicPage: async (url, viewport, actor) => {
      calls.push(`capture:${url}:${viewport}:${actor}`);
      return commandResult("capture");
    },
    captureJourneyStep: async (url, label, actor) => {
      calls.push(`journey:${url}:${label}:${actor}`);
      return commandResult("journey");
    },
    captureVisibleNav: async (actor) => {
      calls.push(`visible-nav:${actor}`);
      return commandResult("visible-nav");
    },
    captureBelowFold: async (_waitForSelector, actor) => {
      calls.push(`below-fold:${actor}`);
      return commandResult("below-fold");
    },
    auditCurrentScope: async (_actor, _signal) => {
      calls.push("audit");
      return commandResult("audit");
    },
    inspectAgentSurface: async (actor) => {
      calls.push(`inspect:${actor}`);
      return commandResult("inspect");
    },
    getBoardContext: (actor) => {
      calls.push(`board:${actor}`);
      return { ok: true, receipt: "board" };
    },
    recordVisualFinding: async (_input, actor) => {
      calls.push(`finding:${actor}`);
      return commandResult("finding");
    },
    recordCoverageGap: async (_label, _detail, actor) => {
      calls.push(`gap:${actor}`);
      return commandResult("gap");
    },
    focusFinding: async (_findingId, actor) => {
      calls.push(`focus:${actor}`);
      return commandResult("focus");
    },
    setFindingDecision: async (_findingId, _decision, _reason, actor) => {
      calls.push(`decision:${actor}`);
      return commandResult("decision");
    },
    previewFix: async (_css, actor) => {
      calls.push(`preview:${actor}`);
      return commandResult("preview");
    },
    verifyRecapture: async (_findingId, actor) => {
      calls.push(`verify:${actor}`);
      return commandResult("verify");
    },
  } satisfies WorkbenchCommands;

  try {
    assert.equal(
      await registerWorkbenchTools(commands, new AbortController().signal, "remote"),
      true,
    );
    const byName = new Map(registered.map((tool) => [tool.name, tool]));
    const representativeCalls: Array<{ name: string; input: Record<string, unknown> }> = [
      {
        name: "capture_public_page",
        input: { url: "https://example.com/pricing", viewport: "desktop" },
      },
      {
        name: "capture_journey_step",
        input: { url: "https://example.com/checkout", label: "Checkout entry" },
      },
      { name: "capture_visible_nav", input: {} },
      { name: "capture_below_fold", input: {} },
      { name: "audit_current_scope", input: {} },
      { name: "get_board_context", input: {} },
      {
        name: "record_visual_finding",
        input: {
          title: "The action is visually buried",
          observation: "The current screenshot gives the action the same weight as tertiary links.",
          why_it_matters: "A visitor may not know where to begin.",
          recommendation: "Give the primary action a distinct treatment.",
          severity: "high",
          category: "ui",
          product_job: "Help a new visitor start the product",
        },
      },
      {
        name: "record_coverage_gap",
        input: { label: "Checkout", detail: "The checkout state was not captured." },
      },
      {
        name: "set_finding_decision",
        input: {
          finding_id: "f1",
          decision: "accepted",
          reason: "Keep the measured issue visible as a ship blocker.",
        },
      },
      { name: "preview_fix", input: {} },
      { name: "verify_recapture", input: {} },
    ];

    for (const call of representativeCalls) {
      const tool = byName.get(call.name);
      assert.ok(tool, `${call.name} should be registered`);
      const response = await tool.execute(call.input);
      const payload = JSON.parse(response.content[0]!.text) as { ok?: boolean };
      assert.equal(payload.ok, true, `${call.name} should return a successful command result`);
    }

    assert.deepEqual(calls, [
      "capture:https://example.com/pricing:desktop:agent",
      "journey:https://example.com/checkout:Checkout entry:agent",
      "visible-nav:agent",
      "below-fold:agent",
      "audit",
      "board:agent",
      "finding:agent",
      "gap:agent",
      "decision:agent",
      "preview:agent",
      "verify:agent",
    ]);
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
