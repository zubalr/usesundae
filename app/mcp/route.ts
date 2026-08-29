import { handleSundaeMcpRequest } from "@/lib/mcp/server";

export const runtime = "nodejs";

function handle(request: Request) {
  return handleSundaeMcpRequest(request, process.env.SUNDAE_APP_ORIGIN);
}

export const GET = handle;
export const POST = handle;
export const OPTIONS = handle;
