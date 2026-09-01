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

function captureConfig() {
  const workerUrl = process.env.SUNDAE_BROWSER_WORKER_URL?.trim();
  const workerSecret = process.env.SUNDAE_BROWSER_WORKER_SECRET?.trim();
  if (workerUrl && workerSecret) return { workerUrl, workerSecret };
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  return accountId && apiToken ? { accountId, apiToken } : null;
}

export async function POST(request: Request) {
  return handleCapturePost(request, captureConfig(), fetch, {
    allowedOrigin: allowedOrigin(),
    limiter,
    gate,
  });
}
