import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

import {
  buildWorkspaceUrl,
  createAuditLaunch,
  MAX_AUDIT_GOAL_LENGTH,
  MAX_PUBLIC_URL_LENGTH,
} from "@/lib/launch";

const MCP_VERSION = "0.1.0";

const corsHeaders = {
  "Access-Control-Allow-Headers": "Accept, Content-Type, MCP-Protocol-Version, MCP-Session-Id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "MCP-Protocol-Version, MCP-Session-Id",
  "Cache-Control": "no-store",
} as const;

function addCors(response: Response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders)) headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function toolFailure(message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}

function internalMcpError() {
  return addCors(
    Response.json(
      {
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      },
      { status: 500 },
    ),
  );
}

export function createSundaeMcpServer(appOrigin: string) {
  const server = new McpServer(
    { name: "sundae", version: MCP_VERSION },
    {
      instructions: [
        "Use start_audit when a user asks to review, audit, critique, or improve a public website or product interface.",
        "The tool prepares an exact Sundae workspace; it does not itself capture or inspect the target.",
        "In a host that can open the returned workspace and expose page-scoped WebMCP tools, open it, wait for Sundae Site Tools, and use those tools for evidence-backed review.",
        "Never claim an audit or capture completed when the workspace or Site Tools were unavailable.",
      ].join(" "),
    },
  );

  server.registerTool(
    "start_audit",
    {
      title: "Start a Sundae product audit",
      description:
        "Prepare an exact Sundae workspace for an evidence-backed UI and UX audit of a public website. Use for requests to review, critique, improve, or find design problems in a site or web product.",
      inputSchema: {
        url: z
          .string()
          .max(MAX_PUBLIC_URL_LENGTH)
          .describe("Complete public http or https URL to review."),
        goal: z
          .string()
          .max(MAX_AUDIT_GOAL_LENGTH)
          .optional()
          .describe(
            "Optional review focus, such as activation, signup clarity, accessibility, or visual polish.",
          ),
      },
      outputSchema: {
        workspace_url: z.string(),
        target_url: z.string(),
        display_url: z.string(),
        goal: z.string(),
        handoff_status: z.literal("workspace_ready"),
        site_tools_next_step: z.string(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ url, goal }) => {
      try {
        const launch = createAuditLaunch(url, goal);
        const structuredContent = {
          workspace_url: buildWorkspaceUrl(appOrigin, launch),
          target_url: launch.targetUrl,
          display_url: launch.displayUrl,
          goal: launch.goal,
          handoff_status: "workspace_ready" as const,
          site_tools_next_step:
            "Open workspace_url in a host browser that exposes Sundae Site Tools, then capture only the user-approved public scope.",
        };
        return {
          content: [
            {
              type: "text" as const,
              text: `Sundae workspace ready: ${structuredContent.workspace_url}\n\nOpen it before claiming any audit evidence was captured.`,
            },
          ],
          structuredContent,
        };
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : "Sundae could not prepare this audit.";
        return toolFailure(message);
      }
    },
  );

  return server;
}

export function resolveSundaeAppOrigin(requestUrl: string, configuredOrigin?: string) {
  const candidate = configuredOrigin?.trim() || new URL(requestUrl).origin;
  const parsed = new URL(candidate);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("SUNDAE_APP_ORIGIN must be an http or https origin.");
  }
  return parsed.origin;
}

export async function handleSundaeMcpRequest(request: Request, configuredOrigin?: string) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return addCors(
      new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "POST, OPTIONS" },
      }),
    );
  }

  let appOrigin: string;
  try {
    appOrigin = resolveSundaeAppOrigin(request.url, configuredOrigin);
  } catch {
    return internalMcpError();
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createSundaeMcpServer(appOrigin);
  try {
    await server.connect(transport);
    return addCors(await transport.handleRequest(request));
  } catch {
    return internalMcpError();
  }
}
