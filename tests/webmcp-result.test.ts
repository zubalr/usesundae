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
    findings: Array.from({ length: 80 }, (_, index) => ({
      id: `finding-${index}`,
      title: "A deliberately long audited-page title that must be bounded",
    })),
  });
  const text = result.content[0]?.text ?? "";

  assert.ok(Buffer.byteLength(text, "utf8") <= MAX_TOOL_TEXT_BYTES);
  assert.equal(JSON.parse(text).truncated, true);
});
