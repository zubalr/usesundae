import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import {
  createSundaeMcpServer,
  handleSundaeMcpRequest,
  resolveSundaeAppOrigin,
} from "../lib/mcp/server";

test("publishes one read-only audit entry tool with truthful workspace output", async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createSundaeMcpServer("https://sundae.example");
  const client = new Client({ name: "sundae-test", version: "1.0.0" });

  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map((tool) => tool.name),
      ["start_audit"],
    );
    assert.equal(tools.tools[0]?.annotations?.readOnlyHint, true);
    assert.equal(tools.tools[0]?.annotations?.destructiveHint, false);
    assert.match(tools.tools[0]?.description ?? "", /does not capture|workspace only/i);
    const instructions = client.getInstructions() ?? "";
    assert.match(instructions, /visible product job/i);
    assert.match(instructions, /UI.*UX.*Interaction/is);
    assert.match(instructions, /`uncaptured_nav`.*`capture_visible_nav`/is);
    assert.match(instructions, /`capture_visible_nav`.*accepts no URL/is);
    assert.match(instructions, /`gap-below-fold`.*`capture_below_fold`/is);
    assert.match(instructions, /`capture_journey_step`/);
    assert.match(instructions, /human.*extra.*exact.*same-origin URL/is);
    assert.match(instructions, /404/);
    assert.match(instructions, /click-only states.*`gap-flow-states`/is);
    assert.match(instructions, /never invent URLs beyond `uncaptured_nav`/i);
    assert.match(instructions, /never crawl/i);
    assert.match(instructions, /0–3 judged findings per bucket/i);
    assert.match(instructions, /coverage gap/i);
    assert.match(instructions, /do not restate a measured finding/i);

    const result = await client.callTool({
      name: "start_audit",
      arguments: {
        url: "https://example.com/signup?plan=pro",
        goal: "Review signup clarity",
      },
    });
    assert.equal("isError" in result ? result.isError : false, false);
    assert.ok("structuredContent" in result && result.structuredContent);
    const output = result.structuredContent as Record<string, unknown>;
    const workspaceUrl = String(output.workspace_url);
    const workspace = new URL(workspaceUrl);
    assert.equal(workspace.origin, "https://sundae.example");
    assert.equal(workspace.searchParams.get("url"), "https://example.com/signup?plan=pro");
    assert.equal(workspace.searchParams.get("goal"), "Review signup clarity");
    assert.equal(workspace.hash, "#workbench");
    assert.equal(output.handoff_status, "workspace_ready");
    assert.match(String(output.site_tools_next_step), /Site Tools/i);
    assert.match(String(output.site_tools_next_step), /wait/i);
    assert.match(String(output.site_tools_next_step), /Capture page/);
    assert.match(String(output.site_tools_next_step), /do not call audit_current_scope/);
    assert.match(String(output.site_tools_next_step), /get_board_context/);
    assert.match(String(output.site_tools_next_step), /capture_visible_nav/);
    assert.match(String(output.site_tools_next_step), /capture_below_fold/);
    assert.match(String(output.site_tools_next_step), /capture_journey_step/);
    assert.match(String(output.site_tools_next_step), /gap-flow-states/);
    assert.match(String(output.site_tools_next_step), /not.*complete/i);

    const demoResult = await client.callTool({
      name: "start_audit",
      arguments: { url: "https://sundae.example/demo" },
    });
    assert.ok("structuredContent" in demoResult && demoResult.structuredContent);
    const demoOutput = demoResult.structuredContent as Record<string, unknown>;
    const demoNextStep = String(demoOutput.site_tools_next_step);
    assert.match(demoNextStep, /call audit_current_scope/);
    assert.doesNotMatch(demoNextStep, /do not call audit_current_scope/);
    assert.match(demoNextStep, /get_board_context/);
    assert.match(demoNextStep, /visible product job/i);
    assert.match(demoNextStep, /UI.*UX.*Interaction/is);
    assert.doesNotMatch(
      demoNextStep,
      /capture_visible_nav|capture_below_fold|capture_journey_step/,
    );

    const boardRead = instructions.indexOf("get_board_context");
    const visibleNav = instructions.indexOf("`uncaptured_nav`");
    const belowFold = instructions.indexOf("`gap-below-fold`");
    const designPass = instructions.indexOf("visible product job");
    assert.ok(boardRead < visibleNav && visibleNav < belowFold && belowFold < designPass);

    const otherDemoResult = await client.callTool({
      name: "start_audit",
      arguments: { url: "https://usesundae.vercel.app/demo" },
    });
    assert.ok("structuredContent" in otherDemoResult && otherDemoResult.structuredContent);
    const otherDemoOutput = otherDemoResult.structuredContent as Record<string, unknown>;
    assert.match(String(otherDemoOutput.site_tools_next_step), /do not call audit_current_scope/);
  } finally {
    await client.close();
    await server.close();
  }
});

test("the audit entry tool rejects local targets without claiming a capture", async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createSundaeMcpServer("https://sundae.example");
  const client = new Client({ name: "sundae-test", version: "1.0.0" });

  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const result = await client.callTool({
      name: "start_audit",
      arguments: { url: "http://localhost:3000" },
    });
    assert.equal("isError" in result && result.isError, true);
    const blocks =
      "content" in result && Array.isArray(result.content)
        ? (result.content as Array<{ type?: string; text?: string }>)
        : [];
    const text = blocks[0]?.type === "text" ? (blocks[0].text ?? "") : "";
    assert.match(text, /public website/i);
    assert.doesNotMatch(text, /captured|completed/i);
  } finally {
    await client.close();
    await server.close();
  }
});

test("the HTTP seam handles preflight and rejects unsupported methods with CORS", async () => {
  const preflight = await handleSundaeMcpRequest(
    new Request("https://sundae.example/mcp", { method: "OPTIONS" }),
  );
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "*");
  assert.equal(preflight.headers.get("cache-control"), "no-store");

  const unsupported = await handleSundaeMcpRequest(
    new Request("https://sundae.example/mcp", { method: "GET" }),
  );
  assert.equal(unsupported.status, 405);
  assert.equal(unsupported.headers.get("allow"), "POST, OPTIONS");
  assert.equal(unsupported.headers.get("access-control-allow-origin"), "*");
  assert.equal(unsupported.headers.get("cache-control"), "no-store");
});

test("uses only a configured or fixed canonical application origin", () => {
  assert.equal(resolveSundaeAppOrigin("https://sundae.example/path"), "https://sundae.example");
  assert.equal(resolveSundaeAppOrigin(), "https://usesundae.vercel.app");
  assert.throws(() => resolveSundaeAppOrigin("http://sundae.example"), /public HTTPS/i);
  assert.throws(() => resolveSundaeAppOrigin("https://localhost:3000"), /public|standard/i);
});
