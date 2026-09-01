import puppeteer from "@cloudflare/puppeteer";

import { MAX_CAPTURE_SCREENSHOT_BASE64_CHARS } from "../../lib/capture/limits";
import { MAX_LAUNCH_RETRY_MS } from "../../lib/capture/worker-protocol";
import { DOM_SOURCE } from "./dom-source.js";
import { isBlockedBrowserRequest } from "./policy";

type WorkerEnv = Cloudflare.Env & { SUNDAE_WORKER_SECRET: string };

const VIEWPORTS = {
  mobile: { width: 390, height: 844, deviceScaleFactor: 2 },
  desktop: { width: 1440, height: 900, deviceScaleFactor: 2 },
} as const;

export type CaptureSessionInput = {
  url: string;
  viewport: "mobile" | "desktop";
  fullPage: boolean;
  previewCss?: string;
  waitForSelector?: string;
};

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const onAbort = () => {
      clearTimeout(handle);
      reject(new DOMException("The capture was cancelled.", "AbortError"));
    };
    const handle = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function launchRetryMs(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error);
  if (!/code:\s*429\b/.test(message)) return null;
  const seconds = Number(message.match(/retry-after["'\s:=]+(\d+)/i)?.[1] ?? "1");
  const delayMs = seconds * 1000;
  return delayMs > 0 && delayMs <= MAX_LAUNCH_RETRY_MS ? delayMs : null;
}

async function launchBrowser(env: WorkerEnv, signal: AbortSignal) {
  try {
    return await puppeteer.launch(env.BROWSER);
  } catch (error) {
    const delayMs = launchRetryMs(error);
    if (delayMs === null) throw error;
    await sleep(delayMs, signal);
    return await puppeteer.launch(env.BROWSER);
  }
}

function previewScript(css: string) {
  return `(() => { const style = document.createElement("style"); style.setAttribute("data-sundae-preview", "true"); style.textContent = ${JSON.stringify(css)}; document.documentElement.append(style); })();`;
}

function navigationHops(
  requestedUrl: string,
  response: {
    url(): string;
    status(): number;
    request(): {
      redirectChain(): Array<{
        url(): string;
        response(): { status(): number } | null;
      }>;
    };
  } | null,
) {
  const hops: Array<{ url: string; status: number }> = [];
  if (response) {
    for (const request of response.request().redirectChain()) {
      hops.push({ url: request.url(), status: request.response()?.status() ?? 0 });
    }
    hops.push({ url: response.url(), status: response.status() });
  }
  if (hops.length === 0 || hops[0]?.url !== requestedUrl) {
    hops.unshift({ url: requestedUrl, status: hops[0]?.status ?? 0 });
  }
  return hops;
}

export async function runBrowserCapture(
  env: WorkerEnv,
  input: CaptureSessionInput,
  signal: AbortSignal,
) {
  const started = Date.now();
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  try {
    browser = await launchBrowser(env, signal);
    const page = await browser.newPage();
    await page.setViewport(VIEWPORTS[input.viewport]);
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      if (isBlockedBrowserRequest(request.url())) void request.abort();
      else void request.continue();
    });
    if (input.previewCss) await page.evaluateOnNewDocument(previewScript(input.previewCss));
    const response = await page.goto(input.url, { waitUntil: "networkidle2", timeout: 30_000 });
    if (input.waitForSelector) {
      await page.waitForSelector(input.waitForSelector, { timeout: 8_000 });
    }
    const evaluated = JSON.parse(
      (await page.evaluate(
        `${DOM_SOURCE};JSON.stringify((() => { const facts = SundaeDom.captureBrowserFacts(document, ${JSON.stringify(input.viewport)}); const links = []; for (const node of document.querySelectorAll("a[href]")) { links.push("[" + ((node.textContent || "").trim().slice(0, 80)) + "](" + node.href + ")"); if (links.length === 80) break; } return { facts, title: document.title, markdown: "# " + document.title + "\\n\\n" + ((document.body && document.body.innerText) || "").slice(0, 20000) + "\\n\\n" + links.join("\\n") }; })())`,
      )) as string,
    ) as { facts: unknown; title: string; markdown: string };
    const accessibilityTree = await page.accessibility.snapshot({ interestingOnly: true });
    let fullPage = input.fullPage;
    let screenshot = (await page.screenshot({
      type: "png",
      encoding: "base64",
      fullPage,
    })) as string;
    if (fullPage && screenshot.length > MAX_CAPTURE_SCREENSHOT_BASE64_CHARS) {
      fullPage = false;
      screenshot = (await page.screenshot({
        type: "png",
        encoding: "base64",
        fullPage: false,
      })) as string;
    }
    const hops = navigationHops(input.url, response);
    return {
      ok: true as const,
      elapsed_ms: Date.now() - started,
      browser_ms: Date.now() - started,
      http_status: response?.status() ?? hops.at(-1)?.status ?? 0,
      final_url: page.url(),
      redirect_chain: hops,
      screenshot_base64: screenshot,
      viewport_size: VIEWPORTS[input.viewport],
      full_page: fullPage,
      text_or_markdown: evaluated.markdown,
      accessibility_tree: accessibilityTree ?? { role: "RootWebArea", name: evaluated.title },
      facts: evaluated.facts,
      title: evaluated.title,
    };
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}
