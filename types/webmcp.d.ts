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

  type RegisteredWebMcpTool = Omit<WebMcpTool, "execute"> & {
    origin?: string;
    window?: Window;
  };

  type ModelContext = {
    registerTool: (tool: WebMcpTool, options?: { signal?: AbortSignal }) => Promise<void> | void;
    getTools?: () => Promise<RegisteredWebMcpTool[]> | RegisteredWebMcpTool[];
  };

  interface Document {
    modelContext?: ModelContext;
  }
}
