export const MAX_TOOL_TEXT_BYTES = 1500;

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
};

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

export function createToolResult(value: Record<string, unknown>): ToolResult {
  let text = JSON.stringify(value);

  if (byteLength(text) > MAX_TOOL_TEXT_BYTES) {
    text = JSON.stringify({
      ok: value.ok ?? true,
      truncated: true,
      receipt: value.receipt ?? "The command completed.",
      message:
        "The full result exceeded Sundae's WebMCP output budget. Read the visible board for complete evidence.",
    });
  }

  return { content: [{ type: "text", text }] };
}
