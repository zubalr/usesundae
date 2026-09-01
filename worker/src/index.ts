import {
  PreviewPolicyError,
  sanitizePreviewCss,
  sanitizeWaitForSelector,
  TargetPolicyError,
  WaitForSelectorPolicyError,
} from "../../lib/capture/url-policy";
import { requestHasWorkerSecret } from "../../lib/capture/worker-auth";
import { runBrowserCapture } from "./capture";
import { publicCaptureUrl } from "./policy";
import { BrowserSemaphore } from "./semaphore";

export { BrowserSemaphore };

type WorkerEnv = Cloudflare.Env & { SUNDAE_WORKER_SECRET: string };

function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers },
  });
}

async function readJson(request: Request) {
  try {
    const value: unknown = await request.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function handleLease(request: Request, env: WorkerEnv) {
  const body = await readJson(request);
  const stub = env.BROWSER_SEMAPHORE.getByName("global");
  if (body?.op === "acquire") {
    const result = await stub.acquire();
    if (!result.ok) {
      return json({ ok: false, error: "busy" }, 429, {
        "retry-after": String(result.retryAfterSeconds),
      });
    }
    return json({ ok: true, id: result.id, expiresAt: result.expiresAt });
  }
  if (body?.op === "release" && typeof body.id === "string") {
    await stub.release(body.id);
    return json({ ok: true });
  }
  return json({ ok: false, error: "invalid_request" }, 400);
}

async function handleCapture(request: Request, env: WorkerEnv) {
  const body = await readJson(request);
  if (!body || typeof body.url !== "string") {
    return json({ ok: false, error: "invalid_target" }, 400);
  }
  const viewport = body.viewport === "desktop" ? "desktop" : "mobile";
  let url: string;
  try {
    url = publicCaptureUrl(body.url);
  } catch (error) {
    if (error instanceof TargetPolicyError)
      return json({ ok: false, error: "invalid_target" }, 400);
    throw error;
  }
  let previewCss: string | undefined;
  let waitForSelector: string | undefined;
  try {
    previewCss =
      typeof body.preview_css === "string" ? sanitizePreviewCss(body.preview_css) : undefined;
    waitForSelector =
      typeof body.wait_for_selector === "string"
        ? sanitizeWaitForSelector(body.wait_for_selector)
        : undefined;
  } catch (error) {
    if (error instanceof PreviewPolicyError || error instanceof WaitForSelectorPolicyError) {
      return json({ ok: false, error: "invalid_target" }, 400);
    }
    throw error;
  }

  const stub = env.BROWSER_SEMAPHORE.getByName("global");
  const lease = await stub.acquire();
  if (!lease.ok) {
    return json({ ok: false, error: "busy" }, 429, {
      "retry-after": String(lease.retryAfterSeconds),
    });
  }
  try {
    return json(
      await runBrowserCapture(
        env,
        {
          url,
          viewport,
          fullPage: body.full_page === true,
          ...(previewCss ? { previewCss } : {}),
          ...(waitForSelector ? { waitForSelector } : {}),
        },
        request.signal,
      ),
    );
  } catch {
    return json({ ok: false, error: "capture_failed" }, 502);
  } finally {
    await stub.release(lease.id).catch(() => undefined);
  }
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
    if (!requestHasWorkerSecret(request, env.SUNDAE_WORKER_SECRET ?? "")) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
    const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
    if (path === "/lease") return handleLease(request, env);
    if (path === "/capture" || path === "/") return handleCapture(request, env);
    return json({ ok: false, error: "not_found" }, 404);
  },
};
