import { z } from "zod";

import {
  CaptureProviderError,
  captureWithCloudflare,
  type CaptureProviderCategory,
  type CloudflareCaptureConfig,
} from "./cloudflare";
import {
  normalizePublicTarget,
  PreviewPolicyError,
  sanitizePreviewCss,
  sanitizeWaitForSelector,
  TargetPolicyError,
  WaitForSelectorPolicyError,
} from "./url-policy";
import type { ResolveTarget } from "./dns-policy";
import { readTextUpTo } from "./stream";
import { captureGateCookieHeader, type CaptureGate, readCaptureGateCookie } from "./gate";

const MAX_REQUEST_BYTES = 16_384;
const DEFAULT_MAX_CONCURRENT_CAPTURES = 4;
const DEFAULT_RATE_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT = 20;

const providerFailures: Record<
  CaptureProviderCategory,
  { code: string; message: string; status: number }
> = {
  timeout: {
    code: "capture_provider_timeout",
    message: "The browser provider timed out before a checkpoint was created. Try again once.",
    status: 504,
  },
  browser_crash: {
    code: "capture_provider_browser_crash",
    message: "The remote browser stopped before a checkpoint was created. Try again once.",
    status: 502,
  },
  resource_limit: {
    code: "capture_provider_resource_limit",
    message: "The rendered page exceeded the browser provider’s safe capture limits.",
    status: 502,
  },
  blocked_rendering: {
    code: "capture_provider_blocked",
    message: "The page did not allow the configured browser provider to render it.",
    status: 502,
  },
  invalid_target: {
    code: "capture_provider_invalid_target",
    message: "The browser provider could not navigate to this public target.",
    status: 400,
  },
  rate_limit: {
    code: "capture_provider_rate_limited",
    message: "The browser provider is rate limited. Try again shortly.",
    status: 429,
  },
  provider_rejection: {
    code: "capture_provider_rejected",
    message:
      "The browser provider rejected this capture. Existing board evidence was left unchanged.",
    status: 502,
  },
};

function parsePositiveIntEnv(raw: string | undefined, fallback: number) {
  const trimmed = raw?.trim() ?? "";
  if (!/^[1-9][0-9]*$/.test(trimmed)) return fallback;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : fallback;
}

export function captureLimiterOptionsFromEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
) {
  return {
    maxConcurrent: parsePositiveIntEnv(env.CAPTURE_MAX_CONCURRENT, DEFAULT_MAX_CONCURRENT_CAPTURES),
    rateLimit: parsePositiveIntEnv(env.CAPTURE_RATE_LIMIT, DEFAULT_RATE_LIMIT),
    rateWindowMs: parsePositiveIntEnv(env.CAPTURE_RATE_WINDOW_MS, DEFAULT_RATE_WINDOW_MS),
  };
}

const requestSchema = z
  .object({
    url: z.string().trim().min(1).max(2048),
    viewport: z.enum(["mobile", "desktop"]),
    preview_css: z.string().max(4000).optional(),
    full_page: z.boolean().optional(),
    wait_for_selector: z.string().trim().min(1).max(160).optional(),
  })
  .strict();

function json(payload: Record<string, unknown>, status: number, retryAfterSeconds?: number) {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
      ...(retryAfterSeconds === undefined ? {} : { "retry-after": String(retryAfterSeconds) }),
    },
  });
}

function invalidRequest() {
  return json(
    {
      ok: false,
      code: "invalid_capture_request",
      message: "Choose a public URL, a supported viewport, and valid bounded capture options.",
    },
    400,
  );
}

export type CaptureLimiterState = {
  activeCaptures: number;
  clients: Map<string, { windowStartedAt: number; count: number }>;
  now: () => number;
  maxConcurrent: number;
  rateWindowMs: number;
  rateLimit: number;
};

export type CaptureHttpOptions = {
  limiter?: CaptureLimiterState;
  allowedOrigin?: string;
  clientKey?: (request: Request) => string;
  gate?: CaptureGate;
  resolveTarget?: ResolveTarget;
};

export function createCaptureLimiterState(
  options: Partial<
    Pick<CaptureLimiterState, "now" | "maxConcurrent" | "rateWindowMs" | "rateLimit">
  > = {},
): CaptureLimiterState {
  return {
    activeCaptures: 0,
    clients: new Map(),
    now: options.now ?? (() => Date.now()),
    maxConcurrent: options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT_CAPTURES,
    rateWindowMs: options.rateWindowMs ?? DEFAULT_RATE_WINDOW_MS,
    rateLimit: options.rateLimit ?? DEFAULT_RATE_LIMIT,
  };
}

const defaultLimiter = createCaptureLimiterState();

function clientKeyFromRequest(request: Request) {
  // These headers are trustworthy only when a deployment's edge proxy strips
  // client-supplied copies. This is a pragmatic app-level limiter, not a WAF.
  const forwarded =
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  return forwarded ? `ip:${forwarded.slice(0, 128)}` : "anonymous";
}

function originIsAllowed(request: Request, allowedOrigin?: string) {
  const expectedOrigin = allowedOrigin?.trim() || new URL(request.url).origin;
  const origin = request.headers.get("origin")?.trim();
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(expectedOrigin).origin) return false;
    } catch {
      return false;
    }
  }

  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite && fetchSite !== "same-origin") return false;
  return true;
}

function forbiddenOrigin() {
  return json(
    {
      ok: false,
      code: "capture_origin_forbidden",
      message: "Capture requests must originate from the Sundae app.",
    },
    403,
  );
}

function captureGateRequired() {
  return json(
    {
      ok: false,
      code: "capture_gate_required",
      message: "Refresh the Sundae workbench before starting another public capture.",
    },
    403,
  );
}

export function handleCaptureGateGet(
  request: Request,
  gate: CaptureGate,
  options: Pick<CaptureHttpOptions, "allowedOrigin"> = {},
) {
  if (!originIsAllowed(request, options.allowedOrigin)) return forbiddenOrigin();
  const origin = request.headers.get("origin")?.trim();
  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (!origin && fetchSite !== "same-origin") return forbiddenOrigin();

  return new Response(null, {
    status: 204,
    headers: {
      "cache-control": "no-store",
      "set-cookie": captureGateCookieHeader(
        gate.issue(),
        options.allowedOrigin?.trim() || request.url,
      ),
      "x-content-type-options": "nosniff",
    },
  });
}

function rateLimited(retryAfterSeconds: number) {
  return json(
    {
      ok: false,
      code: "capture_rate_limited",
      message: "Too many capture requests. Try again shortly.",
    },
    429,
    retryAfterSeconds,
  );
}

function captureBusy(retryAfterSeconds: number) {
  return json(
    {
      ok: false,
      code: "capture_busy",
      message: "Sundae is processing the maximum number of captures. Try again shortly.",
    },
    503,
    retryAfterSeconds,
  );
}

function consumeRate(state: CaptureLimiterState, key: string) {
  const now = state.now();
  const existing = state.clients.get(key);
  const bucket =
    !existing ||
    now < existing.windowStartedAt ||
    now - existing.windowStartedAt >= state.rateWindowMs
      ? { windowStartedAt: now, count: 0 }
      : existing;
  if (bucket.count >= state.rateLimit) {
    const elapsed = Math.max(0, now - bucket.windowStartedAt);
    return Math.max(1, Math.ceil((state.rateWindowMs - elapsed) / 1000));
  }
  bucket.count += 1;

  // Keep the in-memory map bounded when a proxy supplies many distinct client
  // addresses. Expired entries are not useful for enforcing the next window.
  for (const [client, candidate] of state.clients) {
    if (now - candidate.windowStartedAt >= state.rateWindowMs) state.clients.delete(client);
  }
  if (!state.clients.has(key) && state.clients.size >= 10_000) {
    const oldest = state.clients.keys().next().value;
    if (oldest !== undefined) state.clients.delete(oldest);
  }
  state.clients.set(key, bucket);
  return null;
}

function acquireCapture(state: CaptureLimiterState) {
  if (state.activeCaptures >= state.maxConcurrent) return false;
  state.activeCaptures += 1;
  return true;
}

function releaseCapture(state: CaptureLimiterState) {
  state.activeCaptures = Math.max(0, state.activeCaptures - 1);
}

async function readRequestBody(request: Request) {
  return readTextUpTo(request.body, MAX_REQUEST_BYTES);
}

export async function handleCapturePost(
  request: Request,
  config: CloudflareCaptureConfig | null,
  fetchImpl: typeof fetch = fetch,
  options: CaptureHttpOptions = {},
) {
  if (!originIsAllowed(request, options.allowedOrigin)) return forbiddenOrigin();
  if (options.gate && !options.gate.verify(readCaptureGateCookie(request))) {
    return captureGateRequired();
  }

  const limiter = options.limiter ?? defaultLimiter;
  const retryAfter = consumeRate(
    limiter,
    options.clientKey?.(request) ?? clientKeyFromRequest(request),
  );
  if (retryAfter !== null) return rateLimited(retryAfter);

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return invalidRequest();
  }

  let body: unknown;
  try {
    const text = await readRequestBody(request);
    if (text === null) return invalidRequest();
    body = JSON.parse(text);
  } catch {
    return invalidRequest();
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return invalidRequest();

  try {
    const target = normalizePublicTarget(parsed.data.url);
    const previewCss = parsed.data.preview_css
      ? sanitizePreviewCss(parsed.data.preview_css)
      : undefined;
    const waitForSelector = parsed.data.wait_for_selector
      ? sanitizeWaitForSelector(parsed.data.wait_for_selector)
      : undefined;

    if (!config) {
      return json(
        {
          ok: false,
          code: "remote_capture_unavailable",
          message:
            "Remote capture is not configured on this deployment. Use the included live target or configure Browser Run.",
        },
        503,
      );
    }

    if (!acquireCapture(limiter)) return captureBusy(1);
    let checkpoint;
    try {
      checkpoint = await captureWithCloudflare(
        config,
        {
          url: target.captureUrl,
          viewport: parsed.data.viewport,
          ...(previewCss ? { previewCss } : {}),
          ...(parsed.data.full_page ? { fullPage: true } : {}),
          ...(waitForSelector ? { waitForSelector } : {}),
          signal: request.signal,
        },
        fetchImpl,
        { resolveTarget: options.resolveTarget },
      );
    } finally {
      releaseCapture(limiter);
    }

    return json({ ok: true, checkpoint }, 200);
  } catch (error) {
    if (
      error instanceof TargetPolicyError ||
      error instanceof PreviewPolicyError ||
      error instanceof WaitForSelectorPolicyError
    ) {
      return invalidRequest();
    }
    if (request.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      return json(
        {
          ok: false,
          code: "capture_cancelled",
          message: "The capture was cancelled before a checkpoint was created.",
        },
        408,
      );
    }
    if (error instanceof CaptureProviderError) {
      const failure = providerFailures[error.category];
      return json(
        {
          ok: false,
          code: failure.code,
          category: error.category,
          message: failure.message,
        },
        failure.status,
      );
    }
    return json(
      {
        ok: false,
        code: "capture_failed",
        message: "Sundae could not create this checkpoint. No audit result was recorded.",
      },
      500,
    );
  }
}
