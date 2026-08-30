import assert from "node:assert/strict";
import test from "node:test";

import type { WorkbenchCommands } from "../lib/workbench/types";
import {
  countRegisteredWorkbenchTools,
  registerWorkbenchTools,
  WEBMCP_INPUT_SCHEMAS,
  WEBMCP_TOOL_COUNTS,
  WEBMCP_TOOL_NAMES,
} from "../lib/webmcp/register";

type ExecuteToolInput = Parameters<NonNullable<ModelContext["executeTool"]>>[1];
type Extends<Source, Target> = [Source] extends [Target] ? true : false;

const executeToolAcceptsJsonStrings: Extends<string, ExecuteToolInput> = true;
const executeToolInputIsJsonString: Extends<ExecuteToolInput, string | undefined> = true;

test("native executeTool input matches Chrome's serialized JSON contract", () => {
  assert.equal(executeToolAcceptsJsonStrings, true);
  assert.equal(executeToolInputIsJsonString, true);
});

test("runtime counts include only Sundae workbench tools", () => {
  const tools = [
    ...WEBMCP_TOOL_NAMES.slice(-WEBMCP_TOOL_COUNTS.sample).map((name) => ({
      name,
      description: "Sundae workbench tool",
    })),
    { name: "sundae_lab_get_workflow_summary", description: "Controlled target tool" },
    { name: "sundae_lab_archive_workflow", description: "Controlled target tool" },
  ] as RegisteredWebMcpTool[];

  assert.equal(countRegisteredWorkbenchTools(tools), WEBMCP_TOOL_COUNTS.sample);
});

const commandResult = (receipt: string) => Promise.resolve({ ok: true, receipt });

function stringSchema(schema: WebMcpInputSchema, key: string) {
  const property = schema.properties?.[key] as Record<string, unknown> | undefined;
  assert.equal(property?.type, "string", `${key} must be a string schema`);
  return property;
}

function assertToolContracts(registered: Array<{ tool: WebMcpTool; signal?: AbortSignal }>) {
  for (const { tool } of registered) {
    assert.ok(tool.title && tool.title.length >= 8, `${tool.name} needs a human-readable title`);
    assert.ok(tool.description.length >= 80, `${tool.name} needs a decision-useful description`);
    assert.ok(
      tool.description.length <= 500,
      `${tool.name} description exceeds Chrome's ~500 character budget`,
    );
    assert.equal(
      tool.inputSchema?.additionalProperties,
      false,
      `${tool.name} needs a closed input schema`,
    );
    assert.ok(
      Object.keys(tool.annotations ?? {}).every((key) =>
        ["readOnlyHint", "untrustedContentHint"].includes(key),
      ),
    );
  }
}

function assertSchemaContracts() {
  for (const [schemaName, schema] of Object.entries(WEBMCP_INPUT_SCHEMAS)) {
    for (const [key, property] of Object.entries(schema.properties ?? {})) {
      const description = (property as { description?: string }).description;
      if (!description) continue;
      assert.ok(
        description.length <= 150,
        `${schemaName}.${key} description exceeds Chrome's ~150 character budget`,
      );
    }
  }

  const captureUrl = stringSchema(WEBMCP_INPUT_SCHEMAS.capturePublicPage, "url");
  assert.equal(captureUrl?.format, "uri");
  assert.equal(captureUrl?.pattern, "^https?:\\/\\/");
  assert.equal(captureUrl?.minLength, 1);
  assert.equal(captureUrl?.maxLength, 2048);
  assert.deepEqual(WEBMCP_INPUT_SCHEMAS.capturePublicPage.required, ["url"]);
  assert.equal(
    (WEBMCP_INPUT_SCHEMAS.capturePublicPage.properties?.viewport as Record<string, unknown>)
      ?.default,
    "desktop",
  );
  assert.equal(
    stringSchema(WEBMCP_INPUT_SCHEMAS.capturePublicPage, "wait_for_selector")?.maxLength,
    160,
  );
  assert.equal(stringSchema(WEBMCP_INPUT_SCHEMAS.captureJourneyStep, "label")?.minLength, 1);
  assert.equal(stringSchema(WEBMCP_INPUT_SCHEMAS.captureJourneyStep, "label")?.maxLength, 100);
  assert.equal(
    stringSchema(WEBMCP_INPUT_SCHEMAS.captureBelowFold, "wait_for_selector")?.maxLength,
    160,
  );
  assert.equal(
    stringSchema(WEBMCP_INPUT_SCHEMAS.captureVisibleNav, "wait_for_selector")?.maxLength,
    160,
  );
  assert.equal(Object.hasOwn(WEBMCP_INPUT_SCHEMAS.captureVisibleNav.properties, "url"), false);
  assert.equal(Object.hasOwn(WEBMCP_INPUT_SCHEMAS.captureBelowFold.properties, "url"), false);
  const findingOffset = WEBMCP_INPUT_SCHEMAS.boardContext.properties?.finding_offset as Record<
    string,
    unknown
  >;
  assert.equal(findingOffset.type, "integer");
  assert.equal(findingOffset.minimum, 0);
  assert.equal(findingOffset.maximum, 100);
  assert.equal(stringSchema(WEBMCP_INPUT_SCHEMAS.finding, "finding_id")?.maxLength, 120);
  for (const [key, maxLength] of [
    ["title", 140],
    ["observation", 360],
    ["why_it_matters", 300],
    ["recommendation", 300],
  ] as const) {
    assert.equal(stringSchema(WEBMCP_INPUT_SCHEMAS.judgedFinding, key)?.minLength, 1);
    assert.equal(stringSchema(WEBMCP_INPUT_SCHEMAS.judgedFinding, key)?.maxLength, maxLength);
  }
  assert.deepEqual(
    (WEBMCP_INPUT_SCHEMAS.judgedFinding.properties?.severity as Record<string, unknown>)?.enum,
    ["high", "medium", "low"],
  );
  assert.deepEqual(
    (WEBMCP_INPUT_SCHEMAS.judgedFinding.properties?.category as Record<string, unknown>)?.enum,
    ["ui", "ux", "interaction"],
  );
  assert.equal(stringSchema(WEBMCP_INPUT_SCHEMAS.judgedFinding, "product_job")?.maxLength, 80);
  assert.deepEqual(WEBMCP_INPUT_SCHEMAS.judgedFinding.required, [
    "title",
    "observation",
    "why_it_matters",
    "recommendation",
    "severity",
    "category",
  ]);
  assert.equal(stringSchema(WEBMCP_INPUT_SCHEMAS.gap, "label")?.maxLength, 100);
  assert.equal(stringSchema(WEBMCP_INPUT_SCHEMAS.gap, "detail")?.maxLength, 300);
  assert.deepEqual(
    (WEBMCP_INPUT_SCHEMAS.decision.properties?.decision as Record<string, unknown>)?.enum,
    ["open", "accepted", "deferred", "dismissed"],
  );
  assert.equal(stringSchema(WEBMCP_INPUT_SCHEMAS.decision, "reason")?.maxLength, 240);
  assert.equal(stringSchema(WEBMCP_INPUT_SCHEMAS.verification, "finding_id")?.maxLength, 120);
  assert.equal(stringSchema(WEBMCP_INPUT_SCHEMAS.preview, "css")?.maxLength, 4000);
}

test("remote mode registers the full bounded, page-scoped tool set", async () => {
  const registered: Array<{ tool: WebMcpTool; signal?: AbortSignal }> = [];
  const calls: string[] = [];
  const auditSignals: Array<AbortSignal | undefined> = [];
  const auditWaits: Array<string | undefined> = [];
  const verifySignals: Array<AbortSignal | undefined> = [];
  const verifyWaits: Array<string | undefined> = [];
  const boardRequests: Array<{ actor: string; offset: number | undefined }> = [];
  const receiptTools: string[] = [];
  const recordReceiptTool = (toolName?: string) => {
    if (toolName) receiptTools.push(toolName);
  };
  let cancelAuditAfterHandler = false;
  let auditCancellation: AbortController | undefined;
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      modelContext: {
        registerTool(tool: WebMcpTool, options?: { signal?: AbortSignal }) {
          registered.push({ tool, signal: options?.signal });
        },
      },
    },
  });

  const commands = {
    capturePublicPage: async (url, viewport, actor, _signal, waitForSelector, toolName) => {
      recordReceiptTool(toolName);
      calls.push(`capture:${url}:${viewport}:${actor}:${waitForSelector ?? "none"}`);
      return commandResult("capture");
    },
    captureJourneyStep: async (url, label, actor, _signal, waitForSelector, toolName) => {
      recordReceiptTool(toolName);
      calls.push(`step:${url}:${label}:${actor}:${waitForSelector ?? "none"}`);
      return commandResult("step");
    },
    captureVisibleNav: async (actor, _signal, waitForSelector, toolName) => {
      recordReceiptTool(toolName);
      calls.push(`visible-nav:${waitForSelector ?? "none"}:${actor}`);
      return {
        ok: false,
        receipt:
          "Captured 3 visible navigation routes; 1 remains after the provider stopped the batch.",
        captured_routes: ["About", "Domains", "Root zone"],
        remaining_count: 1,
      };
    },
    captureBelowFold: async (waitForSelector, actor, _signal, toolName) => {
      recordReceiptTool(toolName);
      calls.push(`below-fold:${waitForSelector ?? "none"}:${actor}`);
      return commandResult("below-fold");
    },
    auditCurrentScope: async (_actor, signal, waitForSelector, toolName) => {
      recordReceiptTool(toolName);
      auditSignals.push(signal);
      auditWaits.push(waitForSelector);
      if (cancelAuditAfterHandler)
        auditCancellation?.abort(new Error("Cancelled after audit handler."));
      return commandResult("audit");
    },
    inspectAgentSurface: async (_actor, toolName) => {
      recordReceiptTool(toolName);
      return commandResult("agent-surface");
    },
    getBoardContext: (actor, offset, toolName) => {
      recordReceiptTool(toolName);
      boardRequests.push({ actor, offset });
      return { ok: true, receipt: "context", findings: [] };
    },
    recordVisualFinding: async ({ title, severity, category, productJob }, actor, toolName) => {
      recordReceiptTool(toolName);
      calls.push(`finding:${title}:${severity}:${category}:${productJob ?? "none"}:${actor}`);
      return commandResult("finding");
    },
    recordCoverageGap: async (label, detail, actor, toolName) => {
      recordReceiptTool(toolName);
      calls.push(`gap:${label}:${detail}:${actor}`);
      return commandResult("gap");
    },
    focusFinding: async (id, _actor, toolName) => {
      recordReceiptTool(toolName);
      calls.push(`focus:${id}`);
      return {
        ok: true,
        receipt: 'Focused “🙂” and preserved a quoted \\\"receipt\\\".',
        checkpoint_id: "checkpoint-focus",
        scope_id: "scope-focus",
        next: "Ask the person for a decision.",
      };
    },
    setFindingDecision: async (id, decision, _reason, _actor, toolName) => {
      recordReceiptTool(toolName);
      calls.push(`decision:${id}:${decision}`);
      return commandResult("decision");
    },
    previewFix: async (css, _actor, signal, waitForSelector, toolName) => {
      recordReceiptTool(toolName);
      calls.push(`preview:${css ?? "none"}:${waitForSelector ?? "none"}`);
      if (!signal) return commandResult("preview");
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
      return commandResult("preview");
    },
    verifyRecapture: async (_findingId, _actor, signal, waitForSelector, toolName) => {
      recordReceiptTool(toolName);
      verifySignals.push(signal);
      verifyWaits.push(waitForSelector);
      return commandResult("verify");
    },
  } satisfies WorkbenchCommands;

  try {
    const controller = new AbortController();
    assert.equal(await registerWorkbenchTools(commands, controller.signal, "remote"), true);
    assert.deepEqual(
      registered.map(({ tool }) => tool.name),
      [
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
      ],
    );
    assert.equal(registered.length, WEBMCP_TOOL_COUNTS.remote);
    assert.ok(registered.every(({ signal }) => signal));
    assert.equal(new Set(registered.map(({ signal }) => signal)).size, 1);
    assert.notEqual(registered[0]?.signal, controller.signal);
    const boardTool = registered.find(({ tool }) => tool.name === "get_board_context")?.tool;
    assert.equal(boardTool?.annotations?.readOnlyHint, false);
    assert.equal(boardTool?.annotations?.untrustedContentHint, true);
    const auditTool = registered.find(({ tool }) => tool.name === "audit_current_scope")?.tool;
    const previewTool = registered.find(({ tool }) => tool.name === "preview_fix")?.tool;
    const verifyTool = registered.find(({ tool }) => tool.name === "verify_recapture")?.tool;
    assert.match(auditTool?.description ?? "", /first.*Site Tool|Site Tools.*first/i);
    assert.match(auditTool?.description ?? "", /\/demo/);
    assert.match(boardTool?.description ?? "", /after.*capture|after.*audit/i);
    assert.match(boardTool?.description ?? "", /next action/i);
    assert.match(boardTool?.description ?? "", /visible.*receipt/i);
    assert.match(previewTool?.description ?? "", /board|decision/i);
    assert.match(verifyTool?.description ?? "", /after.*preview/i);
    assertToolContracts(registered);
    assertSchemaContracts();

    const capture = registered.find(({ tool }) => tool.name === "capture_public_page")!.tool;
    const invalidCapture = await capture.execute({
      url: "ftp://example.com/file",
      viewport: "desktop",
    });
    const invalidCaptureReceipt = JSON.parse(invalidCapture.content[0]!.text);
    assert.equal(invalidCaptureReceipt.ok, false);
    assert.equal(invalidCaptureReceipt.tool_name, "capture_public_page");
    assert.equal(invalidCaptureReceipt.actor, "agent");
    assert.equal(invalidCaptureReceipt.status, "failure");
    assert.equal(typeof invalidCaptureReceipt.elapsed_ms, "number");
    assert.match(invalidCaptureReceipt.next, /visible board/i);
    const captureReceipt = JSON.parse(
      (
        await capture.execute({
          url: "https://example.com/pricing",
          wait_for_selector: "#pricing",
        })
      ).content[0]!.text,
    );
    assert.deepEqual(calls, ["capture:https://example.com/pricing:desktop:agent:#pricing"]);
    assert.equal(captureReceipt.tool_name, "capture_public_page");
    assert.equal(captureReceipt.actor, "agent");
    assert.equal(captureReceipt.status, "success");
    assert.equal(typeof captureReceipt.elapsed_ms, "number");
    assert.match(captureReceipt.next, /visible board/i);

    const journeyStep = registered.find(({ tool }) => tool.name === "capture_journey_step")!.tool;
    await journeyStep.execute({
      url: "https://example.com/checkout",
      label: "Checkout entry",
      wait_for_selector: "#checkout",
    });
    assert.equal(calls.at(-1), "step:https://example.com/checkout:Checkout entry:agent:#checkout");

    const visibleNav = registered.find(({ tool }) => tool.name === "capture_visible_nav")!.tool;
    const visibleNavResult = JSON.parse(
      (await visibleNav.execute({ wait_for_selector: "main" })).content[0]!.text,
    );
    assert.equal(calls.at(-1), "visible-nav:main:agent");
    assert.equal(visibleNavResult.status, "failure");
    assert.equal(visibleNavResult.remaining_count, 1);
    assert.match(visibleNavResult.receipt, /Captured 3.*1 remains/);

    const belowFold = registered.find(({ tool }) => tool.name === "capture_below_fold")!.tool;
    await belowFold.execute({ wait_for_selector: "main" });
    assert.equal(calls.at(-1), "below-fold:main:agent");

    const audit = registered.find(({ tool }) => tool.name === "audit_current_scope")!.tool;
    const auditInvocation = new AbortController();
    await audit.execute({ wait_for_selector: "main" }, { signal: auditInvocation.signal });
    assert.equal(auditSignals.length, 1);
    assert.ok(auditSignals[0]);
    assert.equal(auditWaits[0], "main");

    const board = registered.find(({ tool }) => tool.name === "get_board_context")!.tool;
    await board.execute({ finding_offset: 4 });
    assert.deepEqual(boardRequests, [{ actor: "agent", offset: 4 }]);

    const inspect = registered.find(({ tool }) => tool.name === "inspect_agent_surface")!.tool;
    await inspect.execute({});

    auditCancellation = new AbortController();
    cancelAuditAfterHandler = true;
    const cancelledAudit = JSON.parse(
      (await audit.execute({}, { signal: auditCancellation.signal })).content[0]!.text,
    );
    assert.equal(cancelledAudit.ok, false);
    assert.equal(cancelledAudit.tool_name, "audit_current_scope");
    assert.equal(cancelledAudit.status, "cancelled");
    assert.match(cancelledAudit.receipt, /cancelled/i);
    cancelAuditAfterHandler = false;

    const recordFinding = registered.find(
      ({ tool }) => tool.name === "record_visual_finding",
    )!.tool;
    assert.match(recordFinding.description, /UI.*UX.*Interaction/i);
    const missingCategory = await recordFinding.execute({
      title: "Primary action is visually buried",
      observation: "The action uses the same treatment as tertiary links.",
      why_it_matters: "A visitor may not know where to begin.",
      recommendation: "Give the primary action a distinct treatment.",
      severity: "high",
    });
    assert.equal(JSON.parse(missingCategory.content[0]!.text).ok, false);
    await recordFinding.execute({
      title: "Primary action is visually buried",
      observation: "The action uses the same treatment as tertiary links.",
      why_it_matters: "A visitor may not know where to begin.",
      recommendation: "Give the primary action a distinct treatment.",
      severity: "high",
      category: "ui",
      product_job: "Help a new visitor start the product",
    });
    assert.equal(
      calls.at(-1),
      "finding:Primary action is visually buried:high:ui:Help a new visitor start the product:agent",
    );

    const recordGap = registered.find(({ tool }) => tool.name === "record_coverage_gap")!.tool;
    await recordGap.execute({ label: "Checkout", detail: "The checkout flow was not opened." });
    assert.equal(calls.at(-1), "gap:Checkout:The checkout flow was not opened.:agent");

    const focus = registered.find(({ tool }) => tool.name === "focus_finding")!.tool;
    const response = await focus.execute({ finding_id: "mobile:contrast:helper-copy" });
    assert.equal(calls.at(-1), "focus:mobile:contrast:helper-copy");
    const focusReceipt = JSON.parse(response.content[0]!.text);
    assert.equal(focusReceipt.receipt, 'Focused “🙂” and preserved a quoted \\\"receipt\\\".');
    assert.equal(focusReceipt.checkpoint_id, "checkpoint-focus");
    assert.equal(focusReceipt.scope_id, "scope-focus");
    assert.equal(focusReceipt.next, "Ask the person for a decision.");
    assert.equal(focusReceipt.tool_name, "focus_finding");
    assert.equal(focusReceipt.actor, "agent");
    assert.equal(focusReceipt.status, "success");

    const decision = registered.find(({ tool }) => tool.name === "set_finding_decision")!.tool;
    const invalid = await decision.execute({ finding_id: "f1", decision: "accepted", reason: "" });
    assert.equal(JSON.parse(invalid.content[0]!.text).ok, false);
    assert.equal(calls.at(-1), "focus:mobile:contrast:helper-copy");

    await decision.execute({
      finding_id: "f1",
      decision: "open",
      reason: "Reconsider this evidence.",
    });
    assert.equal(calls.at(-1), "decision:f1:open");

    const preview = registered.find(({ tool }) => tool.name === "preview_fix")!.tool;
    const invocation = new AbortController();
    const pendingPreview = preview.execute({}, { signal: invocation.signal });
    invocation.abort(new Error("Cancelled for test."));
    const cancelled = JSON.parse((await pendingPreview).content[0]!.text);
    assert.equal(cancelled.ok, false);
    assert.equal(cancelled.tool_name, "preview_fix");
    assert.equal(cancelled.status, "cancelled");
    assert.match(cancelled.receipt, /cancelled.*rolled back/i);
    assert.equal(calls.at(-1), "preview:none:none");
    await preview.execute({ css: "main { display: block; }", wait_for_selector: "main" });
    assert.equal(calls.at(-1), "preview:main { display: block; }:main");

    const verify = registered.find(({ tool }) => tool.name === "verify_recapture")!.tool;
    const verifyInvocation = new AbortController();
    await verify.execute(
      { finding_id: "f1", wait_for_selector: "main" },
      { signal: verifyInvocation.signal },
    );
    assert.equal(verifySignals.length, 1);
    assert.ok(verifySignals[0]);
    assert.equal(verifyWaits[0], "main");

    assert.deepEqual(
      [...new Set(receiptTools)].toSorted(),
      registered.map(({ tool }) => tool.name).toSorted(),
    );

    controller.abort();
    assert.equal(registered[0]?.signal?.aborted, true);
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("sample mode registers only tools that operate on the included target", async () => {
  const tools: WebMcpTool[] = [];
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      modelContext: {
        registerTool(tool: WebMcpTool) {
          tools.push(tool);
        },
      },
    },
  });

  try {
    assert.equal(
      await registerWorkbenchTools({} as WorkbenchCommands, new AbortController().signal, "sample"),
      true,
    );
    assert.deepEqual(
      tools.map((tool) => tool.name),
      [
        "audit_current_scope",
        "inspect_agent_surface",
        "get_board_context",
        "record_visual_finding",
        "record_coverage_gap",
        "focus_finding",
        "set_finding_decision",
        "preview_fix",
        "verify_recapture",
      ],
    );
    assert.equal(tools.length, WEBMCP_TOOL_COUNTS.sample);
    const schemaKeys = (name: string) =>
      Object.keys(tools.find((tool) => tool.name === name)?.inputSchema?.properties ?? {});
    assert.deepEqual(schemaKeys("audit_current_scope"), []);
    assert.deepEqual(schemaKeys("get_board_context"), ["finding_offset"]);
    assert.deepEqual(schemaKeys("preview_fix"), []);
    assert.deepEqual(schemaKeys("verify_recapture"), ["finding_id"]);
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("a partial top-level registration aborts the shared registration lifecycle", async () => {
  const registeredSignals: AbortSignal[] = [];
  const activeTools = new Set<string>();
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      modelContext: {
        async registerTool(tool: WebMcpTool, options?: { signal?: AbortSignal }) {
          if (options?.signal) registeredSignals.push(options.signal);
          activeTools.add(tool.name);
          options?.signal?.addEventListener("abort", () => activeTools.delete(tool.name), {
            once: true,
          });
          if (registeredSignals.length === 4) throw new Error("Simulated registration failure.");
        },
      },
    },
  });

  try {
    const caller = new AbortController();
    await assert.rejects(
      () => registerWorkbenchTools({} as WorkbenchCommands, caller.signal, "sample"),
      /Simulated registration failure/,
    );
    assert.equal(caller.signal.aborted, false);
    assert.equal(registeredSignals.length, 4);
    assert.ok(
      registeredSignals.slice(0, 3).every((signal) => signal.aborted),
      "successful registrations must be cleaned up",
    );
    assert.equal(
      registeredSignals[3]?.aborted,
      true,
      "the failed registration shares the aborted lifecycle",
    );
    assert.equal(activeTools.size, 0, "the registration transaction must leave no tool behind");
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
