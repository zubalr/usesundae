import assert from "node:assert/strict";
import test from "node:test";

import { captureWithCloudflare } from "../lib/capture/cloudflare";

function pngHeader(width: number, height: number) {
  const bytes = Buffer.alloc(24);
  Buffer.from("89504e470d0a1a0a", "hex").copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes.toString("base64");
}

const providerErrorFetch: typeof fetch = async () =>
  new Response(
    JSON.stringify({
      success: false,
      errors: [{ code: 1001, message: "token secret-token denied" }],
    }),
    { status: 403, headers: { "content-type": "application/json" } },
  );

const truncatedAccessibilityFetch: typeof fetch = async () =>
  Response.json({
    success: true,
    result: {
      screenshot: "aGVsbG8=",
      markdown: "# Example",
      accessibilityTree: {
        role: "RootWebArea",
        name: "Example",
        children: Array.from({ length: 400 }, (_, index) => ({
          role: "button",
          name: `Action ${index}`,
        })),
      },
    },
    meta: { status: 200, title: "Example" },
  });

const oversizedScreenshotFetch: typeof fetch = async () =>
  Response.json({
    success: true,
    result: {
      screenshot: "A".repeat(12_000_001),
      markdown: "# Example",
      accessibilityTree: { role: "RootWebArea", name: "Example" },
    },
  });

const pendingProviderFetch: typeof fetch = async () => new Promise<Response>(() => undefined);

test("requests a bounded multi-format snapshot and returns a redacted checkpoint", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const fetchImpl: typeof fetch = async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return Response.json({
      success: true,
      result: {
        screenshot: "aGVsbG8=",
        markdown: `# Product\n\n${"Useful copy. ".repeat(600)}`,
        accessibilityTree: {
          role: "RootWebArea",
          name: "Product",
          children: [{ role: "button", name: "" }],
        },
      },
      meta: { status: 200, title: "Product" },
    });
  };

  const checkpoint = await captureWithCloudflare(
    { accountId: "account-123", apiToken: "secret-token" },
    {
      url: "https://example.com/onboarding?invite=secret#step",
      viewport: "mobile",
      previewCss: ".primary { min-height: 44px; }",
    },
    fetchImpl,
  );

  assert.equal(
    requestUrl,
    "https://api.cloudflare.com/client/v4/accounts/account-123/browser-rendering/snapshot",
  );
  assert.equal(new Headers(requestInit?.headers).get("authorization"), "Bearer secret-token");
  const body = JSON.parse(String(requestInit?.body)) as Record<string, unknown>;
  assert.equal(body.url, "https://example.com/onboarding?invite=secret#step");
  assert.deepEqual(body.formats, ["screenshot", "markdown", "accessibilityTree"]);
  assert.deepEqual(body.viewport, { width: 390, height: 844, deviceScaleFactor: 2 });
  assert.equal(Array.isArray(body.addScriptTag), true);

  assert.equal(checkpoint.target.displayUrl, "https://example.com/onboarding");
  assert.equal(Object.hasOwn(checkpoint.target, "captureUrl"), false);
  assert.match(checkpoint.scopeId, /^scope_[a-f0-9]{32}$/);
  assert.equal(checkpoint.screenshotDataUrl, "data:image/png;base64,aGVsbG8=");
  assert.equal(checkpoint.textExcerpt.length <= 4000, true);
  assert.equal(checkpoint.accessibility.unnamedInteractiveCount, 1);
  assert.equal(checkpoint.accessibility.truncated, false);
  assert.deepEqual(
    checkpoint.gaps.map((gap) => gap.id),
    ["gap-below-fold", "gap-motion-window", "gap-flow-states"],
  );
  assert.equal(JSON.stringify(checkpoint).includes("secret-token"), false);
  assert.equal(JSON.stringify(checkpoint).includes("invite=secret"), false);
  assert.equal(checkpoint.browserMsUsed, undefined);
});

test("supports an explicit full-page checkpoint after a bounded selector appears", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const fetchImpl: typeof fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({
      success: true,
      result: {
        screenshot: pngHeader(2_880, 5_000),
        markdown: "# Product",
        accessibilityTree: {
          role: "RootWebArea",
          name: "Product",
          children: [{ role: "main", name: "Product" }],
        },
      },
      meta: { status: 200, title: "Product" },
    });
  };

  const checkpoint = await captureWithCloudflare(
    { accountId: "account-123", apiToken: "secret-token" },
    {
      url: "https://example.com/product",
      viewport: "desktop",
      fullPage: true,
      waitForSelector: '.app[data-state="ready"]',
    },
    fetchImpl,
  );

  assert.deepEqual(requestBody?.screenshotOptions, { fullPage: true });
  assert.deepEqual(requestBody?.waitForSelector, {
    selector: '.app[data-state="ready"]',
    timeout: 8_000,
  });
  assert.deepEqual(checkpoint.capture, {
    fullPage: true,
    waitForSelector: '.app[data-state="ready"]',
  });
  assert.deepEqual(checkpoint.viewportSize, { width: 1440, height: 2500 });
  assert.equal((requestBody?.gotoOptions as Record<string, unknown>)?.waitUntil, "networkidle2");
  assert.equal(
    checkpoint.gaps.some((gap) => gap.id === "gap-below-fold"),
    false,
  );
});

test("rejects unsafe wait selectors before calling the provider", async () => {
  let called = false;
  await assert.rejects(
    () =>
      captureWithCloudflare(
        { accountId: "account-123", apiToken: "secret-token" },
        {
          url: "https://example.com",
          viewport: "desktop",
          waitForSelector: "main, iframe",
        },
        async () => {
          called = true;
          return new Response();
        },
      ),
    { name: "WaitForSelectorPolicyError" },
  );
  assert.equal(called, false);
});

test("maps provider errors without leaking provider response internals", async () => {
  await assert.rejects(
    () =>
      captureWithCloudflare(
        { accountId: "account-123", apiToken: "secret-token" },
        { url: "https://example.com", viewport: "desktop" },
        providerErrorFetch,
      ),
    (error: unknown) => {
      assert.equal(error instanceof Error, true);
      assert.equal((error as Error).name, "CaptureProviderError");
      assert.equal((error as Error).message.includes("secret-token"), false);
      return true;
    },
  );
});

test("rejects an oversized chunked provider response before parsing it", async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('{"success":true,"result":{"screenshot":"'));
      controller.enqueue(new Uint8Array(16 * 1024 * 1024));
    },
  });

  await assert.rejects(
    () =>
      captureWithCloudflare(
        { accountId: "account-123", apiToken: "secret-token" },
        { url: "https://example.com", viewport: "desktop" },
        async () => new Response(stream),
      ),
    (error: unknown) => {
      assert.equal(error instanceof Error, true);
      assert.equal((error as Error).name, "CaptureProviderError");
      assert.match((error as Error).message, /too large/i);
      return true;
    },
  );
});

test("records an accessibility coverage gap when the provider tree is truncated", async () => {
  const checkpoint = await captureWithCloudflare(
    { accountId: "account-123", apiToken: "secret-token" },
    { url: "https://example.com", viewport: "desktop" },
    truncatedAccessibilityFetch,
  );

  assert.equal(checkpoint.accessibility.truncated, true);
  assert.ok(checkpoint.gaps.some((gap) => gap.id === "gap-accessibility-tree-truncated"));
});

test("rejects an oversized screenshot result even when the response envelope fits", async () => {
  await assert.rejects(
    () =>
      captureWithCloudflare(
        { accountId: "account-123", apiToken: "secret-token" },
        { url: "https://example.com", viewport: "desktop" },
        oversizedScreenshotFetch,
      ),
    (error: unknown) => {
      assert.equal(error instanceof Error, true);
      assert.match((error as Error).message, /screenshot.*too large/i);
      return true;
    },
  );
});

test("times out a provider request on the server even when fetch ignores cancellation", async () => {
  await assert.rejects(
    () =>
      captureWithCloudflare(
        { accountId: "account-123", apiToken: "secret-token" },
        { url: "https://example.com", viewport: "desktop" },
        pendingProviderFetch,
        { timeoutMs: 5 },
      ),
    (error: unknown) => {
      assert.equal(error instanceof Error, true);
      assert.match((error as Error).message, /too long/i);
      return true;
    },
  );
});

test("times out a provider body read as well as the initial fetch", async () => {
  const encoder = new TextEncoder();
  const fetchImpl: typeof fetch = async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('{"success":true,"result":'));
          // Leave the chunked body open to prove the body parser is bounded by the
          // same server-side deadline as the provider request.
        },
      }),
    );

  await assert.rejects(
    () =>
      captureWithCloudflare(
        { accountId: "account-123", apiToken: "secret-token" },
        { url: "https://example.com", viewport: "desktop" },
        fetchImpl,
        { timeoutMs: 5 },
      ),
    (error: unknown) => {
      assert.equal(error instanceof Error, true);
      assert.match((error as Error).message, /too long/i);
      return true;
    },
  );
});

test("records billed browser milliseconds from the provider response header", async () => {
  let requestInit: RequestInit | undefined;
  const fetchImpl: typeof fetch = async (_input, init) => {
    requestInit = init;
    return new Response(
      JSON.stringify({
        success: true,
        result: {
          screenshot: "aGVsbG8=",
          markdown: "# Example",
          accessibilityTree: { role: "RootWebArea", name: "Example" },
        },
        meta: { status: 200, title: "Example" },
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "X-Browser-Ms-Used": "1842",
        },
      },
    );
  };

  const checkpoint = await captureWithCloudflare(
    { accountId: "account-123", apiToken: "secret-token" },
    { url: "https://example.com", viewport: "desktop" },
    fetchImpl,
  );

  const body = JSON.parse(String(requestInit?.body)) as Record<string, unknown>;
  assert.deepEqual(body.viewport, { width: 1440, height: 900, deviceScaleFactor: 2 });
  assert.equal(checkpoint.browserMsUsed, 1842);
  assert.equal(JSON.stringify(checkpoint).includes("secret-token"), false);
});

test("omits billed browser milliseconds when the provider header is invalid", async () => {
  const checkpoint = await captureWithCloudflare(
    { accountId: "account-123", apiToken: "secret-token" },
    { url: "https://example.com", viewport: "desktop" },
    async () =>
      new Response(
        JSON.stringify({
          success: true,
          result: {
            screenshot: "aGVsbG8=",
            markdown: "# Example",
            accessibilityTree: { role: "RootWebArea", name: "Example" },
          },
          meta: { status: 200, title: "Example" },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "X-Browser-Ms-Used": "fast",
          },
        },
      ),
  );

  assert.equal(checkpoint.browserMsUsed, undefined);
});
