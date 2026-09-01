export type ObservedSiteTool = {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: unknown;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
};

const TOOL_NAME_MAX = 120;
const TOOL_TITLE_MAX = 160;
const TOOL_DESCRIPTION_MAX = 800;
const MAX_OBSERVED_SITE_TOOLS = 60;

function clip(value: unknown, maximum: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maximum) : undefined;
}

export function describeObservedSiteTool(value: unknown): ObservedSiteTool | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const tool = value as Record<string, unknown>;
  const name = clip(tool.name, TOOL_NAME_MAX);
  if (!name) return null;
  const annotations =
    tool.annotations && typeof tool.annotations === "object" && !Array.isArray(tool.annotations)
      ? (tool.annotations as ObservedSiteTool["annotations"])
      : undefined;
  return {
    name,
    title: clip(tool.title, TOOL_TITLE_MAX),
    description: clip(tool.description, TOOL_DESCRIPTION_MAX),
    inputSchema: tool.inputSchema,
    annotations,
  };
}

export function parseObservedSiteTools(value: unknown): ObservedSiteTool[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tools: ObservedSiteTool[] = [];
  for (const entry of value) {
    const tool = describeObservedSiteTool(entry);
    if (!tool || seen.has(tool.name)) continue;
    seen.add(tool.name);
    tools.push(tool);
    if (tools.length === MAX_OBSERVED_SITE_TOOLS) break;
  }
  return tools;
}

export const MODEL_CONTEXT_OBSERVER_SOURCE = `(() => {
  const tools = [];
  const clip = (value, maximum) =>
    typeof value === "string" && value.trim() ? value.trim().slice(0, maximum) : undefined;
  const describe = (tool) => ({
    name: clip(tool && tool.name, ${TOOL_NAME_MAX}),
    title: clip(tool && tool.title, ${TOOL_TITLE_MAX}),
    description: clip(tool && tool.description, ${TOOL_DESCRIPTION_MAX}),
    inputSchema: tool && tool.inputSchema,
    annotations:
      tool && tool.annotations && typeof tool.annotations === "object" && !Array.isArray(tool.annotations)
        ? tool.annotations
        : undefined,
  });
  const modelContext = {
    registerTool(tool) {
      const observed = describe(tool || {});
      if (observed.name && !tools.some((entry) => entry.name === observed.name)) tools.push(observed);
    },
    getTools() {
      return Promise.resolve(tools.map((tool) => ({ ...tool })));
    },
    executeTool() {
      return Promise.reject(new Error("Sundae observes Site Tools and never invokes them."));
    },
  };
  Object.defineProperty(document, "modelContext", {
    configurable: true,
    get() {
      return modelContext;
    },
    set() {},
  });
})()`;

export const READ_OBSERVED_SITE_TOOLS_SOURCE = `async () => {
  const read = async (root) => {
    try {
      const listed = await root.modelContext?.getTools?.();
      return Array.isArray(listed) ? listed : [];
    } catch {
      return [];
    }
  };
  const tools = await read(document);
  for (const frame of document.querySelectorAll("iframe")) {
    try {
      if (frame.contentDocument) tools.push(...(await read(frame.contentDocument)));
    } catch {}
  }
  return tools;
}`;
