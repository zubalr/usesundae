export const MAX_TOOL_TEXT_BYTES = 4000;

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
};

const RETAINED_RESULT_KEYS = [
  "ok",
  "tool_name",
  "actor",
  "status",
  "elapsed_ms",
  "checkpoint_id",
  "scope_id",
  "next",
  "receipt",
] as const;

const RETAINED_TEXT_BYTES: Partial<Record<(typeof RETAINED_RESULT_KEYS)[number], number>> = {
  tool_name: 80,
  actor: 16,
  status: 16,
  checkpoint_id: 96,
  scope_id: 96,
  next: 240,
  receipt: 300,
};

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function boundedText(value: string, maximumBytes: number) {
  let text = value.slice(0, maximumBytes);
  while (byteLength(JSON.stringify(text)) - 2 > maximumBytes) text = text.slice(0, -1);
  return text;
}

function retainedValue(key: (typeof RETAINED_RESULT_KEYS)[number], value: unknown) {
  if (typeof value === "string") return boundedText(value, RETAINED_TEXT_BYTES[key] ?? 80);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  return undefined;
}

export function createToolResult(value: Record<string, unknown>): ToolResult {
  let text = JSON.stringify(value);

  if (byteLength(text) > MAX_TOOL_TEXT_BYTES) {
    const retained = Object.fromEntries(
      RETAINED_RESULT_KEYS.flatMap((key) => {
        const candidate = retainedValue(key, value[key]);
        return candidate === undefined ? [] : [[key, candidate]];
      }),
    );
    text = JSON.stringify({
      ...retained,
      truncated: true,
      receipt: retained.receipt ?? "The command completed.",
      message:
        "The full result exceeded Sundae's WebMCP output budget. Read the visible board for complete evidence.",
    });
  }

  return { content: [{ type: "text", text }] };
}
