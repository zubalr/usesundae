import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

import {
  buildWorkspaceUrl,
  createAuditLaunch,
  isIncludedDemoTarget,
  MAX_AUDIT_GOAL_LENGTH,
  MAX_PUBLIC_URL_LENGTH,
  resolvePublicDemoUrl,
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

function siteToolsNextStep(targetUrl: string, appOrigin: string) {
  if (isIncludedDemoTarget(targetUrl, appOrigin)) {
    return "Open workspace_url, wait for Sundae Site Tools, call audit_current_scope for the included /demo, then call get_board_context before the next action. workspace_ready is not an audit-complete state.";
  }
  return "Open workspace_url and wait for Sundae Site Tools. The requested public URL is prefilled but not captured: do not call audit_current_scope while the board still shows /demo. Ask the human to use the visible Capture page control for this exact target; after its checkpoint appears, call get_board_context before the next action. workspace_ready is not an audit-complete state.";
}

export function createSundaeMcpServer(appOrigin: string) {
  const server = new McpServer(
    { name: "sundae", version: MCP_VERSION },
    {
      instructions: [
        "Use start_audit when a user asks to review, audit, critique, or improve a public website or product interface.",
        "start_audit is read-only workspace preparation: workspace_ready does not mean that Sundae captured, inspected, or reviewed the target.",
        "Open the returned workspace_url in the built-in browser and wait for page-scoped Sundae Site Tools before taking an audit action.",
        "For the included /demo path, call audit_current_scope, then get_board_context; follow finding_page.next_offset when present before choosing what to do next.",
        "For another public URL, the exact target is prefilled but not captured: ask the human to use the visible Capture page control, then continue from that approved checkpoint.",
        "Keep measured facts, judged product opinions, and unseen coverage separate; leave tool receipts visible, ask before decisions or previews, and use preview_fix followed by verify_recapture for fresh evidence.",
        "If the workspace or Site Tools are unavailable, return the exact workspace_url and name the missing step; never claim that capture or audit completed and never substitute a hidden fallback review.",
      ].join(" "),
    },
  );

  server.registerTool(
    "start_audit",
    {
      title: "Start a Sundae product audit",
      description:
        "Prepare an exact Sundae workspace for an evidence-backed UI and UX audit of a public website. This read-only handoff does not capture or inspect the target; page-scoped Sundae Site Tools operate the visible board after the workspace opens.",
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
          site_tools_next_step: siteToolsNextStep(launch.targetUrl, appOrigin),
        };
        return {
          content: [
            {
              type: "text" as const,
              text: `Sundae workspace ready: ${structuredContent.workspace_url}\n\nThis handoff did not capture or review the page. Open the workspace, wait for Sundae Site Tools, and follow site_tools_next_step before making any audit-complete claim.`,
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

export function resolveSundaeAppOrigin(configuredOrigin?: string) {
  return new URL(resolvePublicDemoUrl(configuredOrigin)).origin;
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
    appOrigin = resolveSundaeAppOrigin(configuredOrigin);
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
