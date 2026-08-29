import { randomUUID } from "node:crypto";

import { summarizeAccessibilityTree } from "./accessibility";
import { readTextUpTo } from "./stream";
import type { RemoteCaptureInput, RemoteCheckpoint } from "./types";
import { normalizePublicTarget, sanitizePreviewCss, sanitizeWaitForSelector } from "./url-policy";

export type CloudflareCaptureConfig = {
  accountId: string;
  apiToken: string;
};

type CloudflareSnapshotResponse = {
  success?: boolean;
  result?: {
    screenshot?: unknown;
    markdown?: unknown;
    accessibilityTree?: unknown;
  };
  meta?: {
    status?: unknown;
    title?: unknown;
  };
};

const MAX_PROVIDER_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAX_SCREENSHOT_CHARS = 12_000_000;
const DEFAULT_PROVIDER_TIMEOUT_MS = 35_000;
const MAX_RATE_LIMIT_RETRY_MS = 10_000;

const viewportSizes = {
  mobile: { width: 390, height: 844, deviceScaleFactor: 2 },
  desktop: { width: 1440, height: 900, deviceScaleFactor: 2 },
} as const;

export class CaptureProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaptureProviderError";
  }
}

export type CloudflareCaptureOptions = {
  timeoutMs?: number;
  waitForRetry?: (delayMs: number, signal: AbortSignal) => Promise<void>;
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
    const text = await readTextUpTo(response.body, MAX_PROVIDER_RESPONSE_BYTES);
    if (text === null) {
      throw new CaptureProviderError(
        "The remote browser returned a response that was too large to inspect safely.",
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

export async function captureWithCloudflare(
  config: CloudflareCaptureConfig,
  input: RemoteCaptureInput,
  fetchImpl: typeof fetch = fetch,
  options?: CloudflareCaptureOptions,
): Promise<RemoteCheckpoint> {
  if (!config.accountId.trim() || !config.apiToken.trim()) {
    throw new CaptureProviderError("Remote capture is not configured on this deployment.");
  }

  const target = normalizePublicTarget(input.url);
  const viewport = viewportSizes[input.viewport];
  const previewCss = input.previewCss ? sanitizePreviewCss(input.previewCss) : undefined;
  const waitForSelector = input.waitForSelector
    ? sanitizeWaitForSelector(input.waitForSelector)
    : undefined;
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}/browser-rendering/snapshot`;
  const body: Record<string, unknown> = {
    url: target.captureUrl,
    formats: ["screenshot", "markdown", "accessibilityTree"],
    viewport,
    screenshotOptions: { fullPage: input.fullPage === true },
    gotoOptions: { waitUntil: "networkidle2", timeout: 30_000 },
  };
  if (previewCss) body.addScriptTag = [{ content: previewScript(previewCss) }];
  if (waitForSelector) body.waitForSelector = { selector: waitForSelector, timeout: 8_000 };

  const captured = await runWithProviderTimeout(
    async (signal) => {
      const requestSnapshot = () =>
        fetchImpl(endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.apiToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
          signal,
          cache: "no-store",
        });
      let response = await requestSnapshot();
      const delayMs = retryAfterMs(response);
      if (delayMs !== null) {
        await (options?.waitForRetry ?? waitForRetry)(delayMs, signal);
        signal.throwIfAborted();
        response = await requestSnapshot();
      }
      return { response, payload: await parseProviderResponse(response) };
    },
    input.signal,
    providerTimeoutMs(options),
  );
  const { response, payload } = captured;
  if (!response.ok || payload.success !== true || !payload.result) {
    throw new CaptureProviderError(
      `The remote browser could not capture this page (${response.status}).`,
    );
  }

  if (
    typeof payload.result.screenshot === "string" &&
    payload.result.screenshot.length > MAX_SCREENSHOT_CHARS
  ) {
    throw new CaptureProviderError(
      "The remote browser returned a screenshot that was too large to inspect safely.",
    );
  }
  const screenshot = cleanText(payload.result.screenshot, MAX_SCREENSHOT_CHARS);
  if (!screenshot || !/^[A-Za-z0-9+/=]+$/.test(screenshot)) {
    throw new CaptureProviderError("The remote browser did not return a usable screenshot.");
  }

  const accessibility = summarizeAccessibilityTree(payload.result.accessibilityTree);
  const gaps = [
    ...(input.fullPage
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
      detail: "No additional journey step is covered until it is explicitly opened and captured.",
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
  const viewportSize = checkpointViewportSize(screenshot, viewport, input.fullPage === true);
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
    textExcerpt: cleanText(payload.result.markdown, 4000),
    accessibility,
    gaps,
    preview: { applied: Boolean(previewCss) },
    capture: {
      fullPage: input.fullPage === true,
      ...(waitForSelector ? { waitForSelector } : {}),
    },
    browserMsUsed,
  };
}
