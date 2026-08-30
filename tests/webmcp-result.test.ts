import assert from "node:assert/strict";
import test from "node:test";

import { createToolResult, MAX_TOOL_TEXT_BYTES } from "../lib/webmcp/result";

test("tool results use a text content envelope", () => {
  assert.deepEqual(createToolResult({ ok: true, receipt: "measured" }), {
    content: [{ type: "text", text: '{"ok":true,"receipt":"measured"}' }],
  });
});

test("tool result text is bounded without emitting invalid JSON", () => {
  const result = createToolResult({
    ok: true,
    tool_name: "get_board_context",
    actor: "agent",
    status: "success",
    elapsed_ms: 12,
    checkpoint_id: "checkpoint-🙂",
    scope_id: 'scope-"quoted"',
    next: "Focus the strongest supported finding.",
    receipt: "Board read completed.",
    findings: Array.from({ length: 80 }, (_, index) => ({
      id: `finding-${index}`,
      title: "A deliberately long audited-page title that must be bounded",
    })),
  });
  const text = result.content[0]?.text ?? "";

  assert.ok(Buffer.byteLength(text, "utf8") <= MAX_TOOL_TEXT_BYTES);
  const payload = JSON.parse(text);
  assert.equal(payload.truncated, true);
  assert.equal(payload.tool_name, "get_board_context");
  assert.equal(payload.actor, "agent");
  assert.equal(payload.status, "success");
  assert.equal(payload.elapsed_ms, 12);
  assert.equal(payload.checkpoint_id, "checkpoint-🙂");
  assert.equal(payload.scope_id, 'scope-"quoted"');
  assert.equal(payload.next, "Focus the strongest supported finding.");
  assert.equal(payload.receipt, "Board read completed.");
});

test("truncation also bounds retained multibyte receipt fields", () => {
  const result = createToolResult({
    ok: false,
    tool_name: "capture_public_page",
    actor: "agent",
    status: "failure",
    receipt: `quoted "${"🙂".repeat(2_000)}`,
    next: "Read the visible board. ".repeat(500),
    findings: ["untrusted".repeat(500)],
  });
  const text = result.content[0]!.text;
  const payload = JSON.parse(text);

  assert.ok(Buffer.byteLength(text, "utf8") <= MAX_TOOL_TEXT_BYTES);
  assert.equal(payload.truncated, true);
  assert.equal(payload.tool_name, "capture_public_page");
  assert.match(payload.receipt, /^quoted/);
  assert.match(payload.next, /^Read the visible board/);
});
