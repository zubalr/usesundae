export type WebMcpDeclarationFile = never;

declare global {
  type WebMcpInputSchema = {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };

  type WebMcpToolResult = {
    content: Array<{ type: "text"; text: string }>;
  };

  type WebMcpToolAnnotations = {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  };

  type WebMcpToolExecuteOptions = {
    signal?: AbortSignal;
  };

  type WebMcpTool = {
    name: string;
    title?: string;
    description: string;
    inputSchema?: WebMcpInputSchema;
    annotations?: WebMcpToolAnnotations;
    execute: (
      input: Record<string, unknown>,
      extras?: WebMcpToolExecuteOptions,
    ) => Promise<WebMcpToolResult>;
  };

  type RegisteredWebMcpTool = Omit<WebMcpTool, "execute" | "inputSchema"> & {
    inputSchema?: WebMcpInputSchema | string;
    origin?: string;
    window?: Window;
  };

  type ModelContext = EventTarget & {
    registerTool: (
      tool: WebMcpTool,
      options?: { exposedTo?: string[]; signal?: AbortSignal },
    ) => Promise<void> | void;
    getTools?: (options?: {
      fromOrigins?: string[];
    }) => Promise<RegisteredWebMcpTool[]> | RegisteredWebMcpTool[];
    executeTool?: (
      tool: RegisteredWebMcpTool,
      input?: string,
      options?: { signal?: AbortSignal },
    ) => Promise<string>;
    ontoolchange?: ((event: Event) => void) | null;
  };

  interface Document {
    modelContext?: ModelContext;
  }
}
