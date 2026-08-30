import assert from "node:assert/strict";
import test from "node:test";

import { captureWithCloudflare as captureCloudflare } from "../lib/capture/cloudflare";
import {
  MAX_CAPTURE_PROVIDER_RESPONSE_BYTES,
  MAX_CAPTURE_SCREENSHOT_BASE64_CHARS,
} from "../lib/capture/limits";

const publicResolver = async () => ["93.184.216.34"];

function captureWithCloudflare(
  config: Parameters<typeof captureCloudflare>[0],
  input: Parameters<typeof captureCloudflare>[1],
  fetchImpl: Parameters<typeof captureCloudflare>[2] = fetch,
  options: Parameters<typeof captureCloudflare>[3] = {},
) {
  return captureCloudflare(config, input, fetchImpl, {
    resolveTarget: publicResolver,
    ...options,
  });
}

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
    meta: { status: 200, title: "Example", finalUrl: "https://example.com/" },
  });

const oversizedScreenshotFetch: typeof fetch = async () =>
  Response.json({
    success: true,
    result: {
      screenshot: "A".repeat(MAX_CAPTURE_SCREENSHOT_BASE64_CHARS + 1),
      markdown: "# Example",
      accessibilityTree: { role: "RootWebArea", name: "Example" },
    },
    meta: { finalUrl: "https://example.com/" },
  });

const visibleNavFetch: typeof fetch = async () =>
  Response.json({
    success: true,
    result: {
      screenshot: "aGVsbG8=",
      markdown: "[Pricing](https://example.com/pricing)\n[Docs](/docs)",
      accessibilityTree: { role: "RootWebArea", name: "Product" },
    },
    meta: { status: 200, title: "Product", finalUrl: "https://example.com/" },
  });

const pendingProviderFetch: typeof fetch = async () => new Promise<Response>(() => undefined);

const privateNavigationFetch: typeof fetch = async () =>
  Response.json({
    success: true,
    result: {
      screenshot: "aGVsbG8=",
      markdown: "# Internal",
      accessibilityTree: { role: "RootWebArea", name: "Internal" },
    },
    meta: {
      status: 200,
      title: "Internal",
      finalUrl: "http://127.0.0.1/admin",
      redirectChain: [{ status: 302, url: "https://example.com/redirect", headers: {} }],
    },
  });

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
      meta: {
        status: 200,
        title: "Product",
        finalUrl: "https://example.com/onboarding?invite=secret#step",
      },
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
  assert.equal(Array.isArray(body.rejectRequestPattern), true);
  assert.match(JSON.stringify(body.rejectRequestPattern), /localhost/);
  assert.equal("allowRequestPattern" in body, false);
  const rejected = (body.rejectRequestPattern as string[]).map((pattern) => {
    const delimiter = pattern.lastIndexOf("/");
    return new RegExp(pattern.slice(1, delimiter), pattern.slice(delimiter + 1));
  });
  for (const privateUrl of [
    "http://ignored@127.0.0.1/admin",
    "http://localhost./admin",
    "http://localhost.localdomain/admin",
    "http://service.local./admin",
    "http://service.test/admin",
    "http://service.invalid/admin",
    "http://127.0.0.1./admin",
  ]) {
    assert.equal(
      rejected.some((pattern) => pattern.test(privateUrl)),
      true,
      privateUrl,
    );
  }
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

test("rejects a provider navigation that ends on a private destination", async () => {
  await assert.rejects(
    captureWithCloudflare(
      { accountId: "account-123", apiToken: "secret-token" },
      { url: "https://example.com/redirect", viewport: "desktop" },
      privateNavigationFetch,
    ),
    /private or unsupported destination/i,
  );
});

test("rejects a successful provider response without a confirmed final URL", async () => {
  await assert.rejects(
    captureWithCloudflare(
      { accountId: "account-123", apiToken: "secret-token" },
      { url: "https://example.com/", viewport: "desktop" },
      async () =>
        Response.json({
          success: true,
          result: {
            screenshot: "aGVsbG8=",
            markdown: "# Example",
            accessibilityTree: { role: "RootWebArea", name: "Example" },
          },
          meta: { status: 200, title: "Example" },
        }),
    ),
    /did not confirm the final public destination/i,
  );
});

test("rejects an opaque provider redirect history", async () => {
  await assert.rejects(
    captureWithCloudflare(
      { accountId: "account-123", apiToken: "secret-token" },
      { url: "https://example.com/", viewport: "desktop" },
      async () =>
        Response.json({
          success: true,
          result: {
            screenshot: "aGVsbG8=",
            markdown: "# Example",
            accessibilityTree: { role: "RootWebArea", name: "Example" },
          },
          meta: { finalUrl: "https://example.com/", redirectChain: [] },
        }),
    ),
    /complete redirect history/i,
  );
});

test("rejects a hostname that resolves to a private address before provider work", async () => {
  let providerCalled = false;
  await assert.rejects(
    captureWithCloudflare(
      { accountId: "account-123", apiToken: "secret-token" },
      { url: "https://public-name.example/", viewport: "desktop" },
      async () => {
        providerCalled = true;
        return new Response();
      },
      { resolveTarget: async () => ["127.0.0.1"] },
    ),
    /private or reserved address/i,
  );
  assert.equal(providerCalled, false);
});

test("rejects IPv4-mapped private DNS answers before provider work", async () => {
  await assert.rejects(
    captureWithCloudflare(
      { accountId: "account-123", apiToken: "secret-token" },
      { url: "https://mapped-address.example/", viewport: "desktop" },
      async () => assert.fail("Provider work must not start."),
      { resolveTarget: async () => ["::ffff:127.0.0.1"] },
    ),
    /private or reserved address/i,
  );
});

test("rejects non-global IPv6 DNS answers before provider work", async () => {
  for (const address of [
    "fec0::1",
    "2001:10::1",
    "2d00::1",
    "2e00::1",
    "2f00::1",
    "3ffe::1",
    "3fff::1",
    "4000::1",
  ]) {
    await assert.rejects(
      captureWithCloudflare(
        { accountId: "account-123", apiToken: "secret-token" },
        { url: "https://reserved-v6.example/", viewport: "desktop" },
        async () => assert.fail("Provider work must not start."),
        { resolveTarget: async () => [address] },
      ),
      /private or reserved address/i,
    );
  }
});

test("accepts an IANA-allocated global IPv6 answer", async () => {
  const checkpoint = await captureWithCloudflare(
    { accountId: "account-123", apiToken: "secret-token" },
    { url: "https://example.com/", viewport: "desktop" },
    async () =>
      Response.json({
        success: true,
        result: {
          screenshot: "aGVsbG8=",
          markdown: "# Example",
          accessibilityTree: { role: "RootWebArea", name: "Example" },
        },
        meta: { status: 200, title: "Example", finalUrl: "https://example.com/" },
      }),
    { resolveTarget: async () => ["2606:4700:4700::1111"] },
  );

  assert.equal(checkpoint.title, "Example");
});

test("rejects a reserved literal address before provider work", async () => {
  await assert.rejects(
    captureWithCloudflare(
      { accountId: "account-123", apiToken: "secret-token" },
      { url: "https://192.88.99.1/", viewport: "desktop" },
      async () => assert.fail("Provider work must not start."),
    ),
    /private or reserved address/i,
  );
});

test("rejects a cross-host provider redirect even when both names are public", async () => {
  await assert.rejects(
    captureWithCloudflare(
      { accountId: "account-123", apiToken: "secret-token" },
      { url: "https://example.com/", viewport: "desktop" },
      async () =>
        Response.json({
          success: true,
          result: {
            screenshot: "aGVsbG8=",
            markdown: "# Redirected",
            accessibilityTree: { role: "RootWebArea", name: "Redirected" },
          },
          meta: { finalUrl: "https://attacker.example/" },
        }),
    ),
    /private or unsupported destination/i,
  );
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
      meta: { status: 200, title: "Product", finalUrl: "https://example.com/product" },
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

test("honors a bounded Retry-After once when the free quick-action limit is hit", async () => {
  let calls = 0;
  const waits: number[] = [];
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response("Too many requests", {
        status: 429,
        headers: { "Retry-After": "10", "content-type": "text/plain" },
      });
    }
    return Response.json({
      success: true,
      result: {
        screenshot: "aGVsbG8=",
        markdown: "# Example",
        accessibilityTree: { role: "RootWebArea", name: "Example" },
      },
      meta: { status: 200, title: "Example", finalUrl: "https://example.com/" },
    });
  };

  const checkpoint = await captureWithCloudflare(
    { accountId: "account-123", apiToken: "secret-token" },
    { url: "https://example.com", viewport: "desktop" },
    fetchImpl,
    {
      waitForRetry: async (delayMs) => {
        waits.push(delayMs);
      },
    },
  );

  assert.equal(calls, 2);
  assert.deepEqual(waits, [10_000]);
  assert.equal(checkpoint.title, "Example");
});

test("does not retry a daily-quota response with a long Retry-After", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return Response.json(
      { success: false, errors: [{ message: "Browser time limit exceeded for today" }] },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  };

  await assert.rejects(() =>
    captureWithCloudflare(
      { accountId: "account-123", apiToken: "secret-token" },
      { url: "https://example.com", viewport: "desktop" },
      fetchImpl,
      { waitForRetry: async () => assert.fail("Long waits must not be retried in-process.") },
    ),
  );
  assert.equal(calls, 1);
});

test("rejects an oversized chunked provider response before parsing it", async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('{"success":true,"result":{"screenshot":"'));
      controller.enqueue(new Uint8Array(MAX_CAPTURE_PROVIDER_RESPONSE_BYTES));
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

test("lists visible same-origin nav from captured markdown", async () => {
  const checkpoint = await captureWithCloudflare(
    { accountId: "account-123", apiToken: "secret-token" },
    { url: "https://example.com/", viewport: "desktop" },
    visibleNavFetch,
  );

  assert.deepEqual(checkpoint.visibleNav, [
    { url: "https://example.com/pricing", label: "Pricing" },
    { url: "https://example.com/docs", label: "Docs" },
  ]);
});

test("retries a too-large full-page screenshot as a viewport capture", async () => {
  const fullPages: boolean[] = [];
  const fetchImpl: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      screenshotOptions?: { fullPage?: boolean };
    };
    fullPages.push(body.screenshotOptions?.fullPage === true);
    if (fullPages.length === 1) {
      return Response.json({
        success: true,
        result: {
          screenshot: "A".repeat(MAX_CAPTURE_SCREENSHOT_BASE64_CHARS + 1),
          markdown: "# Product",
          accessibilityTree: { role: "RootWebArea", name: "Product" },
        },
        meta: { status: 200, title: "Product", finalUrl: "https://example.com/" },
      });
    }
    return Response.json({
      success: true,
      result: {
        screenshot: "aGVsbG8=",
        markdown: "# Product",
        accessibilityTree: { role: "RootWebArea", name: "Product" },
      },
      meta: { status: 200, title: "Product", finalUrl: "https://example.com/" },
    });
  };

  const checkpoint = await captureWithCloudflare(
    { accountId: "account-123", apiToken: "secret-token" },
    { url: "https://example.com/", viewport: "desktop", fullPage: true },
    fetchImpl,
  );

  assert.deepEqual(fullPages, [true, false]);
  assert.equal(checkpoint.capture.fullPage, false);
  assert.ok(checkpoint.gaps.some((gap) => gap.id === "gap-below-fold"));
});

test("retries an oversized full-page response as a viewport capture", async () => {
  const fullPages: boolean[] = [];
  const encoder = new TextEncoder();
  const fetchImpl: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      screenshotOptions?: { fullPage?: boolean };
    };
    fullPages.push(body.screenshotOptions?.fullPage === true);
    if (fullPages.length === 1) {
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('{"success":true,"result":{"screenshot":"'));
            controller.enqueue(new Uint8Array(MAX_CAPTURE_PROVIDER_RESPONSE_BYTES));
          },
        }),
      );
    }
    return Response.json({
      success: true,
      result: {
        screenshot: "aGVsbG8=",
        markdown: "# Product",
        accessibilityTree: { role: "RootWebArea", name: "Product" },
      },
      meta: { status: 200, title: "Product", finalUrl: "https://example.com/" },
    });
  };

  const checkpoint = await captureWithCloudflare(
    { accountId: "account-123", apiToken: "secret-token" },
    { url: "https://example.com/", viewport: "desktop", fullPage: true },
    fetchImpl,
  );

  assert.deepEqual(fullPages, [true, false]);
  assert.equal(checkpoint.capture.fullPage, false);
  assert.ok(checkpoint.gaps.some((gap) => gap.id === "gap-below-fold"));
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
        meta: { status: 200, title: "Example", finalUrl: "https://example.com/" },
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
          meta: { status: 200, title: "Example", finalUrl: "https://example.com/" },
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
