import {
  captureLimiterOptionsFromEnv,
  createCaptureLimiterState,
  handleCaptureGateGet,
  handleCapturePost,
} from "@/lib/capture/http";
import { createCaptureGate } from "@/lib/capture/gate";

export const runtime = "nodejs";
export const maxDuration = 45;

const limiter = createCaptureLimiterState(captureLimiterOptionsFromEnv());
const gate = createCaptureGate({ secret: process.env.CAPTURE_GATE_SECRET });

function allowedOrigin() {
  return process.env.SUNDAE_APP_ORIGIN?.trim() || undefined;
}

export function GET(request: Request) {
  return handleCaptureGateGet(request, gate, { allowedOrigin: allowedOrigin() });
}

export async function POST(request: Request) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  const config = accountId && apiToken ? { accountId, apiToken } : null;
  return handleCapturePost(request, config, fetch, {
    allowedOrigin: allowedOrigin(),
    limiter,
    gate,
  });
}
