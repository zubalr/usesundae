import { randomUUID } from "node:crypto";

import type { BrowserFacts } from "@/lib/audit/dom";

import { summarizeAccessibilityTree } from "./accessibility";
import { assertPublicDnsTarget, type ResolveTarget } from "./dns-policy";
import { MAX_CAPTURE_PROVIDER_RESPONSE_BYTES, MAX_CAPTURE_SCREENSHOT_BASE64_CHARS } from "./limits";
import { extractVisibleNav } from "./visible-nav";
import { readTextUpTo } from "./stream";
import type { RemoteCaptureInput, RemoteCheckpoint } from "./types";
import { normalizePublicTarget, sanitizePreviewCss, sanitizeWaitForSelector } from "./url-policy";
import { WORKER_SECRET_HEADER } from "./worker-protocol";

export type CloudflareCaptureConfig = {
  accountId?: string;
  apiToken?: string;
  workerUrl?: string;
  workerSecret?: string;
};

export type CaptureProviderCategory =
  | "timeout"
  | "browser_crash"
  | "resource_limit"
  | "blocked_rendering"
  | "invalid_target"
  | "rate_limit"
  | "provider_rejection";

type CloudflareSnapshotResponse = {
  success?: boolean;
  result?: {
    screenshot?: unknown;
    markdown?: unknown;
    accessibilityTree?: unknown;
  };
  meta?: {
    finalUrl?: unknown;
    redirectChain?: unknown;
    status?: unknown;
    title?: unknown;
  };
};

const DEFAULT_PROVIDER_TIMEOUT_MS = 35_000;
const MAX_RATE_LIMIT_RETRY_MS = 10_000;
const PRIVATE_REQUEST_PATTERNS = [
  "/^https?:\\/\\/[^/]*@/i",
  "/^https?:\\/\\/(?:localhost|[^/]+\\.(?:local|localhost|localdomain|internal|lan|test|invalid))\\.?(?::\\d+)?(?:[/?#]|$)/i",
  "/^https?:\\/\\/(?:0|10|127)(?:\\.\\d{1,3}){3}\\.?(?::\\d+)?(?:[/?#]|$)/i",
  "/^https?:\\/\\/(?:100\\.(?:6[4-9]|[7-9]\\d|1[01]\\d|12[0-7])|169\\.254|172\\.(?:1[6-9]|2\\d|3[01])|192\\.168)(?:\\.\\d{1,3}){2}\\.?(?::\\d+)?(?:[/?#]|$)/i",
  "/^https?:\\/\\/(?:192\\.0|198\\.(?:1[89]|51)|203\\.0|(?:22[4-9]|2[3-5]\\d))(?:\\.\\d{1,3}){2}\\.?(?::\\d+)?(?:[/?#]|$)/i",
  "/^https?:\\/\\/\\[/i",
] as const;

const viewportSizes = {
  mobile: { width: 390, height: 844, deviceScaleFactor: 2 },
  desktop: { width: 1440, height: 900, deviceScaleFactor: 2 },
} as const;

export class CaptureProviderError extends Error {
  constructor(
    message: string,
    readonly category: CaptureProviderCategory = "provider_rejection",
  ) {
    super(message);
    this.name = "CaptureProviderError";
  }
}

class CaptureResponseTooLargeError extends CaptureProviderError {}

export type CloudflareCaptureOptions = {
  timeoutMs?: number;
  waitForRetry?: (delayMs: number, signal: AbortSignal) => Promise<void>;
  resolveTarget?: ResolveTarget;
};

function cleanText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.replace(/\0/g, "").trim().slice(0, maximum) : "";
}

function checkpointViewportSize(
  screenshot: string,
  viewport: { width: number; height: number; deviceScaleFactor: number },
  fullPage: boolean,
) {
  const fallback = { width: viewport.width, height: viewport.height };
  if (!fullPage) return fallback;
  try {
    const header = Buffer.from(screenshot.slice(0, 40), "base64");
    const pngSignature = Buffer.from("89504e470d0a1a0a", "hex");
    if (
      header.length < 24 ||
      !header.subarray(0, 8).equals(pngSignature) ||
      header.toString("ascii", 12, 16) !== "IHDR"
    )
      return fallback;

    const pixelWidth = header.readUInt32BE(16);
    const pixelHeight = header.readUInt32BE(20);
    const logicalWidth = Math.round(pixelWidth / viewport.deviceScaleFactor);
    const logicalHeight = Math.round(pixelHeight / viewport.deviceScaleFactor);
    if (Math.abs(logicalWidth - viewport.width) > 2 || logicalHeight < 1 || logicalHeight > 50_000)
      return fallback;
    return { width: logicalWidth, height: logicalHeight };
  } catch {
    return fallback;
  }
}

function previewScript(css: string) {
  return `(() => { const style = document.createElement("style"); style.setAttribute("data-sundae-preview", "true"); style.textContent = ${JSON.stringify(css)}; document.documentElement.append(style); })();`;
}

async function parseProviderResponse(response: Response): Promise<CloudflareSnapshotResponse> {
  try {
    const text = await readTextUpTo(response.body, MAX_CAPTURE_PROVIDER_RESPONSE_BYTES);
    if (text === null) {
      throw new CaptureResponseTooLargeError(
        "The remote browser returned a response that was too large to inspect safely.",
        "resource_limit",
      );
    }
    return JSON.parse(text) as CloudflareSnapshotResponse;
  } catch (error) {
    if (error instanceof CaptureProviderError) throw error;
    throw new CaptureProviderError(
      `The remote browser returned an unreadable response (${response.status}).`,
    );
  }
}

function readBrowserMsUsed(headers: Headers) {
  const raw = headers.get("x-browser-ms-used")?.trim() ?? "";
  if (!/^[0-9]+$/.test(raw)) return undefined;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : undefined;
}

function providerTimeoutMs(input: CloudflareCaptureOptions | undefined) {
  const timeout = input?.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  return Number.isFinite(timeout) && timeout > 0
    ? Math.min(timeout, DEFAULT_PROVIDER_TIMEOUT_MS)
    : DEFAULT_PROVIDER_TIMEOUT_MS;
}

function retryAfterMs(response: Response) {
  const raw = response.headers.get("retry-after")?.trim() ?? "";
  if (response.status !== 429 || !/^\d+$/.test(raw)) return null;
  const delayMs = Number(raw) * 1000;
  return delayMs <= MAX_RATE_LIMIT_RETRY_MS ? delayMs : null;
}

function navigationHost(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function sameNavigationHost(left: string, right: string) {
  return navigationHost(left) === navigationHost(right);
}

async function assertSafeProviderNavigation(
  meta: CloudflareSnapshotResponse["meta"],
  requestedUrl: string,
  resolveTarget?: ResolveTarget,
) {
  const requested = new URL(requestedUrl);
  if (typeof meta?.finalUrl !== "string" || !meta.finalUrl.trim()) {
    throw new CaptureProviderError(
      "The remote browser did not confirm the final public destination.",
    );
  }
  const urls = [meta.finalUrl];
  if (meta.redirectChain !== undefined && !Array.isArray(meta.redirectChain)) {
    throw new CaptureProviderError("The remote browser returned an invalid redirect record.");
  }
  // Cloudflare also omits this field for direct navigation, so omission cannot
  // safely distinguish a direct load from an unreported client-side redirect.
  if (Array.isArray(meta.redirectChain)) {
    if (meta.redirectChain.length === 0) {
      throw new CaptureProviderError(
        "The remote browser could not prove a complete redirect history.",
      );
    }
    for (const entry of meta.redirectChain) {
      const url = entry && typeof entry === "object" ? (entry as { url?: unknown }).url : undefined;
      if (typeof url !== "string" || !url.trim()) {
        throw new CaptureProviderError("The remote browser returned an invalid redirect record.");
      }
      urls.push(url);
    }
  }
  for (const value of urls) {
    try {
      const navigation = normalizePublicTarget(value);
      const hostname = new URL(navigation.captureUrl).hostname;
      if (!sameNavigationHost(requested.hostname, hostname)) throw new Error("cross-host redirect");
      await assertPublicDnsTarget(hostname, resolveTarget);
    } catch {
      throw new CaptureProviderError(
        "The remote page navigated to a private or unsupported destination.",
      );
    }
  }
}

function waitForRetry(delayMs: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const onAbort = () => {
      clearTimeout(handle);
      reject(new DOMException("The capture was cancelled.", "AbortError"));
    };
    const handle = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function runWithProviderTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  inputSignal: AbortSignal | undefined,
  timeoutMs: number,
) {
  if (inputSignal?.aborted) {
    throw new DOMException("The capture was cancelled.", "AbortError");
  }

  const controller = new AbortController();
  let timedOut = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let removeInputListener: (() => void) | undefined;
  let removeInputAbortListener: (() => void) | undefined;
  const abortFromInput = () => controller.abort(inputSignal?.reason);
  if (inputSignal) {
    inputSignal.addEventListener("abort", abortFromInput, { once: true });
    removeInputListener = () => inputSignal.removeEventListener("abort", abortFromInput);
  }

  const workPromise = Promise.resolve().then(() => work(controller.signal));
  let inputAbortPromise: Promise<never> | undefined;
  if (inputSignal) {
    inputAbortPromise = new Promise<never>((_, reject) => {
      const onAbort = () => {
        reject(new DOMException("The capture was cancelled.", "AbortError"));
      };
      inputSignal.addEventListener("abort", onAbort, { once: true });
      removeInputAbortListener = () => inputSignal.removeEventListener("abort", onAbort);
    });
  }
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      controller.abort(new DOMException("The remote browser timed out.", "TimeoutError"));
      reject(
        new CaptureProviderError(
          "The remote browser took too long to respond. Try the capture again.",
          "timeout",
        ),
      );
    }, timeoutMs);
  });

  try {
    const pending = [workPromise, timeoutPromise] as Array<Promise<T> | Promise<never>>;
    if (inputAbortPromise) pending.push(inputAbortPromise);
    return await Promise.race(pending);
  } catch (error) {
    if (timedOut) {
      throw new CaptureProviderError(
        "The remote browser took too long to respond. Try the capture again.",
        "timeout",
      );
    }
    if (inputSignal?.aborted) throw new DOMException("The capture was cancelled.", "AbortError");
    if (error instanceof CaptureProviderError) throw error;
    throw new CaptureProviderError(
      "The remote browser could not be reached. Try the capture again.",
    );
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    removeInputListener?.();
    removeInputAbortListener?.();
  }
}

type WorkerCapturePayload = {
  ok?: boolean;
  browser_ms?: unknown;
  http_status?: unknown;
  final_url?: unknown;
  redirect_chain?: unknown;
  screenshot_base64?: unknown;
  full_page?: unknown;
  text_or_markdown?: unknown;
  accessibility_tree?: unknown;
  facts?: unknown;
  title?: unknown;
};

function workerRedirectChain(value: unknown): Array<{ url: string }> | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const url =
      typeof entry === "string"
        ? entry
        : entry && typeof entry === "object"
          ? (entry as { url?: unknown }).url
          : undefined;
    return { url: typeof url === "string" ? url : "" };
  });
}

function readBrowserFacts(value: unknown): BrowserFacts | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as BrowserFacts;
}

async function parseWorkerCaptureResponse(response: Response): Promise<WorkerCapturePayload> {
  try {
    const text = await readTextUpTo(response.body, MAX_CAPTURE_PROVIDER_RESPONSE_BYTES);
    if (text === null) {
      throw new CaptureResponseTooLargeError(
        "The remote browser returned a response that was too large to inspect safely.",
        "resource_limit",
      );
    }
    return JSON.parse(text) as WorkerCapturePayload;
  } catch (error) {
    if (error instanceof CaptureProviderError) throw error;
    throw new CaptureProviderError(
      `The remote browser returned an unreadable response (${response.status}).`,
    );
  }
}

async function captureWithBrowserWorker(
  config: { workerUrl: string; workerSecret: string },
  input: RemoteCaptureInput,
  fetchImpl: typeof fetch,
  options?: CloudflareCaptureOptions,
): Promise<RemoteCheckpoint> {
  const target = normalizePublicTarget(input.url);
  await assertPublicDnsTarget(new URL(target.captureUrl).hostname, options?.resolveTarget);
  const viewport = viewportSizes[input.viewport];
  const previewCss = input.previewCss ? sanitizePreviewCss(input.previewCss) : undefined;
  const waitForSelector = input.waitForSelector
    ? sanitizeWaitForSelector(input.waitForSelector)
    : undefined;
  const endpoint = `${config.workerUrl.replace(/\/+$/, "")}/capture`;
  const captured = await runWithProviderTimeout(
    async (signal) => {
      const requestCapture = () =>
        fetchImpl(endpoint, {
          method: "POST",
          headers: {
            [WORKER_SECRET_HEADER]: config.workerSecret,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            url: target.captureUrl,
            viewport: input.viewport,
            ...(previewCss ? { preview_css: previewCss } : {}),
            ...(input.fullPage ? { full_page: true } : {}),
            ...(waitForSelector ? { wait_for_selector: waitForSelector } : {}),
          }),
          signal,
          cache: "no-store",
        });
      let response = await requestCapture();
      const delayMs = retryAfterMs(response);
      if (delayMs !== null) {
        await (options?.waitForRetry ?? waitForRetry)(delayMs, signal);
        signal.throwIfAborted();
        response = await requestCapture();
      }
      return { response, payload: await parseWorkerCaptureResponse(response) };
    },
    input.signal,
    providerTimeoutMs(options),
  );
  const { response, payload } = captured;
  if (!response.ok || payload.ok !== true) {
    const categoryByStatus: Partial<Record<number, CaptureProviderCategory>> = {
      400: "invalid_target",
      408: "timeout",
      413: "resource_limit",
      429: "rate_limit",
      504: "timeout",
    };
    throw new CaptureProviderError(
      `The remote browser could not capture this page (${response.status}).`,
      categoryByStatus[response.status] ?? "provider_rejection",
    );
  }
  await assertSafeProviderNavigation(
    {
      finalUrl: payload.final_url,
      redirectChain: workerRedirectChain(payload.redirect_chain),
      status: payload.http_status,
      title: payload.title,
    },
    target.captureUrl,
    options?.resolveTarget,
  );
  if (
    typeof payload.screenshot_base64 === "string" &&
    payload.screenshot_base64.length > MAX_CAPTURE_SCREENSHOT_BASE64_CHARS
  ) {
    throw new CaptureProviderError(
      "The remote browser returned a screenshot that was too large to inspect safely.",
      "resource_limit",
    );
  }
  const screenshot = cleanText(payload.screenshot_base64, MAX_CAPTURE_SCREENSHOT_BASE64_CHARS);
  if (!screenshot || !/^[A-Za-z0-9+/=]+$/.test(screenshot)) {
    throw new CaptureProviderError("The remote browser did not return a usable screenshot.");
  }
  const facts = readBrowserFacts(payload.facts);
  if (!facts) {
    throw new CaptureProviderError("The remote browser did not return page measurements.");
  }
  const markdown = typeof payload.text_or_markdown === "string" ? payload.text_or_markdown : "";
  const accessibility = summarizeAccessibilityTree(payload.accessibility_tree);
  const visibleNav = extractVisibleNav(target.displayUrl, markdown, payload.accessibility_tree);
  const fullPage = payload.full_page === true;
  const gaps = [
    ...(fullPage
      ? []
      : [
          {
            id: "gap-below-fold",
            label: "Below-the-fold visuals",
            detail: `This ${input.viewport} screenshot is viewport-bounded at ${viewport.width} × ${viewport.height}px; content below the fold was not visually inspected.`,
          },
        ]),
    {
      id: "gap-motion-window",
      label: "Motion beyond load",
      detail:
        "This checkpoint captures the settled initial render, not every animation or transition over time.",
    },
    {
      id: "gap-flow-states",
      label: "Unvisited flow states",
      detail:
        "In-page states (modals, empty or loading views, logged-in surfaces, and controls without a public URL) were not opened.",
    },
  ];
  if (accessibility.truncated) {
    gaps.unshift({
      id: "gap-accessibility-tree-truncated",
      label: "Accessibility tree truncated",
      detail:
        "The provider accessibility tree exceeded Sundae's safe traversal budget; semantic counts describe only the captured portion.",
    });
  }
  const browserMsUsed =
    typeof payload.browser_ms === "number" && Number.isSafeInteger(payload.browser_ms)
      ? payload.browser_ms
      : undefined;
  return {
    id: `checkpoint_${randomUUID()}`,
    scopeId: target.scopeId,
    source: "cloudflare",
    capturedAt: new Date().toISOString(),
    target: {
      displayUrl: target.displayUrl,
      origin: target.origin,
    },
    title: cleanText(payload.title, 160) || "Untitled page",
    status: typeof payload.http_status === "number" ? payload.http_status : null,
    viewport: input.viewport,
    viewportSize: checkpointViewportSize(screenshot, viewport, fullPage),
    screenshotDataUrl: `data:image/png;base64,${screenshot}`,
    textExcerpt: cleanText(markdown, 4000),
    accessibility,
    gaps,
    visibleNav,
    preview: { applied: Boolean(previewCss) },
    capture: {
      fullPage,
      ...(waitForSelector ? { waitForSelector } : {}),
    },
    browserMsUsed,
    facts,
  };
}

export async function captureWithCloudflare(
  config: CloudflareCaptureConfig,
  input: RemoteCaptureInput,
  fetchImpl: typeof fetch = fetch,
  options?: CloudflareCaptureOptions,
): Promise<RemoteCheckpoint> {
  const workerUrl = config.workerUrl?.trim() ?? "";
  const workerSecret = config.workerSecret?.trim() ?? "";
  if (workerUrl && workerSecret) {
    return captureWithBrowserWorker({ workerUrl, workerSecret }, input, fetchImpl, options);
  }
  const accountId = config.accountId?.trim() ?? "";
  const apiToken = config.apiToken?.trim() ?? "";
  if (!accountId || !apiToken) {
    throw new CaptureProviderError("Remote capture is not configured on this deployment.");
  }

  const target = normalizePublicTarget(input.url);
  await assertPublicDnsTarget(new URL(target.captureUrl).hostname, options?.resolveTarget);
  const viewport = viewportSizes[input.viewport];
  const previewCss = input.previewCss ? sanitizePreviewCss(input.previewCss) : undefined;
  const waitForSelector = input.waitForSelector
    ? sanitizeWaitForSelector(input.waitForSelector)
    : undefined;
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/browser-rendering/snapshot`;
  const snapshotBody = (fullPage: boolean) => {
    const body: Record<string, unknown> = {
      url: target.captureUrl,
      formats: ["screenshot", "markdown", "accessibilityTree"],
      viewport,
      screenshotOptions: { fullPage },
      gotoOptions: { waitUntil: "networkidle2", timeout: 30_000 },
      rejectRequestPattern: PRIVATE_REQUEST_PATTERNS,
    };
    if (previewCss) body.addScriptTag = [{ content: previewScript(previewCss) }];
    if (waitForSelector) body.waitForSelector = { selector: waitForSelector, timeout: 8_000 };
    return body;
  };

  const captured = await runWithProviderTimeout(
    async (signal) => {
      const requestSnapshot = (fullPage: boolean) =>
        fetchImpl(endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(snapshotBody(fullPage)),
          signal,
          cache: "no-store",
        });
      const load = async (fullPage: boolean) => {
        let response = await requestSnapshot(fullPage);
        const delayMs = retryAfterMs(response);
        if (delayMs !== null) {
          await (options?.waitForRetry ?? waitForRetry)(delayMs, signal);
          signal.throwIfAborted();
          response = await requestSnapshot(fullPage);
        }
        return { response, payload: await parseProviderResponse(response), fullPage };
      };
      const requestedFullPage = input.fullPage === true;
      let result;
      try {
        result = await load(requestedFullPage);
      } catch (error) {
        if (!requestedFullPage || !(error instanceof CaptureResponseTooLargeError)) throw error;
        result = await load(false);
      }
      const screenshot = result.payload.result?.screenshot;
      if (
        result.fullPage &&
        typeof screenshot === "string" &&
        screenshot.length > MAX_CAPTURE_SCREENSHOT_BASE64_CHARS
      ) {
        result = await load(false);
      }
      return result;
    },
    input.signal,
    providerTimeoutMs(options),
  );
  const { response, payload, fullPage } = captured;
  if (!response.ok || payload.success !== true || !payload.result) {
    const categoryByStatus: Partial<Record<number, CaptureProviderCategory>> = {
      400: "invalid_target",
      408: "timeout",
      413: "resource_limit",
      429: "rate_limit",
      504: "timeout",
    };
    throw new CaptureProviderError(
      `The remote browser could not capture this page (${response.status}).`,
      categoryByStatus[response.status] ?? "provider_rejection",
    );
  }
  await assertSafeProviderNavigation(payload.meta, target.captureUrl, options?.resolveTarget);

  if (
    typeof payload.result.screenshot === "string" &&
    payload.result.screenshot.length > MAX_CAPTURE_SCREENSHOT_BASE64_CHARS
  ) {
    throw new CaptureProviderError(
      "The remote browser returned a screenshot that was too large to inspect safely.",
      "resource_limit",
    );
  }
  const screenshot = cleanText(payload.result.screenshot, MAX_CAPTURE_SCREENSHOT_BASE64_CHARS);
  if (!screenshot || !/^[A-Za-z0-9+/=]+$/.test(screenshot)) {
    throw new CaptureProviderError("The remote browser did not return a usable screenshot.");
  }

  const markdown = typeof payload.result.markdown === "string" ? payload.result.markdown : "";
  const accessibility = summarizeAccessibilityTree(payload.result.accessibilityTree);
  const visibleNav = extractVisibleNav(
    target.displayUrl,
    markdown,
    payload.result.accessibilityTree,
  );
  const gaps = [
    ...(fullPage
      ? []
      : [
          {
            id: "gap-below-fold",
            label: "Below-the-fold visuals",
            detail: `This ${input.viewport} screenshot is viewport-bounded at ${viewport.width} × ${viewport.height}px; content below the fold was not visually inspected.`,
          },
        ]),
    {
      id: "gap-motion-window",
      label: "Motion beyond load",
      detail:
        "This checkpoint captures the settled initial render, not every animation or transition over time.",
    },
    {
      id: "gap-flow-states",
      label: "Unvisited flow states",
      detail:
        "In-page states (modals, empty or loading views, logged-in surfaces, and controls without a public URL) were not opened.",
    },
  ];
  if (accessibility.truncated) {
    gaps.unshift({
      id: "gap-accessibility-tree-truncated",
      label: "Accessibility tree truncated",
      detail:
        "The provider accessibility tree exceeded Sundae's safe traversal budget; semantic counts describe only the captured portion.",
    });
  }

  const browserMsUsed = readBrowserMsUsed(response.headers);
  const viewportSize = checkpointViewportSize(screenshot, viewport, fullPage);
  return {
    id: `checkpoint_${randomUUID()}`,
    scopeId: target.scopeId,
    source: "cloudflare",
    capturedAt: new Date().toISOString(),
    target: {
      displayUrl: target.displayUrl,
      origin: target.origin,
    },
    title: cleanText(payload.meta?.title, 160) || "Untitled page",
    status: typeof payload.meta?.status === "number" ? payload.meta.status : null,
    viewport: input.viewport,
    viewportSize,
    screenshotDataUrl: `data:image/png;base64,${screenshot}`,
    textExcerpt: cleanText(markdown, 4000),
    accessibility,
    gaps,
    visibleNav,
    preview: { applied: Boolean(previewCss) },
    capture: {
      fullPage,
      ...(waitForSelector ? { waitForSelector } : {}),
    },
    browserMsUsed,
  };
}
