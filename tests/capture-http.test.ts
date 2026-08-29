import assert from "node:assert/strict";
import test from "node:test";

import {
  captureLimiterOptionsFromEnv,
  createCaptureLimiterState,
  handleCaptureGateGet,
  handleCapturePost,
} from "../lib/capture/http";
import { createCaptureGate } from "../lib/capture/gate";

function captureRequest(
  body: Record<string, unknown> = { url: "https://example.com", viewport: "desktop" },
  headers: Record<string, string> = { "content-type": "application/json" },
) {
  return new Request("https://sundae.test/api/capture", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function gateCookie(response: Response) {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie);
  return setCookie.split(";", 1)[0]!;
}

const successfulCaptureFetch: typeof fetch = async () =>
  Response.json({
    success: true,
    result: {
      screenshot: "aGVsbG8=",
      markdown: "# Example",
      accessibilityTree: { role: "RootWebArea", name: "Example" },
    },
    meta: { status: 200, title: "Example" },
  });

test("rejects a configured capture gate secret shorter than 32 characters", () => {
  assert.throws(() => createCaptureGate({ secret: "too-short" }), /at least 32 characters/i);
});

test("issues a short-lived strict httpOnly capture gate cookie", async () => {
  const gate = createCaptureGate({
    secret: "test-secret-that-is-long-enough-for-a-stable-gate",
    now: () => 1_000_000,
  });
  const response = handleCaptureGateGet(
    new Request("https://sundae.test/api/capture", {
      headers: {
        origin: "https://sundae.test",
        "sec-fetch-site": "same-origin",
      },
    }),
    gate,
  );

  assert.equal(response.status, 204);
  const setCookie = response.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /^sundae_capture_gate=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  assert.match(setCookie, /Max-Age=600/i);
  assert.match(setCookie, /Path=\/api\/capture/i);
  assert.match(setCookie, /Secure/i);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("capture gate issuance requires same-origin browser metadata", () => {
  const gate = createCaptureGate({
    secret: "test-secret-that-is-long-enough-for-a-stable-gate",
  });
  const crossSite = handleCaptureGateGet(
    new Request("https://sundae.test/api/capture", {
      headers: {
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      },
    }),
    gate,
  );
  const missingMetadata = handleCaptureGateGet(
    new Request("https://sundae.test/api/capture"),
    gate,
  );

  assert.equal(crossSite.status, 403);
  assert.equal(crossSite.headers.has("set-cookie"), false);
  assert.equal(missingMetadata.status, 403);
  assert.equal(missingMetadata.headers.has("set-cookie"), false);
});

test("capture gate rejects missing, invalid, and expired cookies before paid work", async () => {
  let now = 1_000_000;
  const gate = createCaptureGate({
    secret: "test-secret-that-is-long-enough-for-a-stable-gate",
    now: () => now,
  });
  const issued = handleCaptureGateGet(
    new Request("https://sundae.test/api/capture", {
      headers: { "sec-fetch-site": "same-origin" },
    }),
    gate,
  );
  const cookie = gateCookie(issued);
  let providerCalled = false;
  const fetchImpl: typeof fetch = async () => {
    providerCalled = true;
    return new Response();
  };
  const sameOriginHeaders = {
    "content-type": "application/json",
    origin: "https://sundae.test",
    "sec-fetch-site": "same-origin",
  };

  for (const cookieHeader of [undefined, "sundae_capture_gate=invalid"]) {
    const response = await handleCapturePost(
      captureRequest(undefined, {
        ...sameOriginHeaders,
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
      }),
      { accountId: "account", apiToken: "token" },
      fetchImpl,
      { gate },
    );
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "capture_gate_required");
  }

  now += 601_000;
  const expired = await handleCapturePost(
    captureRequest(undefined, { ...sameOriginHeaders, cookie }),
    { accountId: "account", apiToken: "token" },
    fetchImpl,
    { gate },
  );
  assert.equal(expired.status, 403);
  assert.equal(providerCalled, false);
});

test("a valid capture gate reaches normal capture validation", async () => {
  const gate = createCaptureGate({
    secret: "test-secret-that-is-long-enough-for-a-stable-gate",
    now: () => 1_000_000,
  });
  const issued = handleCaptureGateGet(
    new Request("https://sundae.test/api/capture", {
      headers: { "sec-fetch-site": "same-origin" },
    }),
    gate,
  );
  const response = await handleCapturePost(
    captureRequest(undefined, {
      "content-type": "application/json",
      origin: "https://sundae.test",
      "sec-fetch-site": "same-origin",
      cookie: gateCookie(issued),
    }),
    null,
    fetch,
    { gate },
  );

  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "remote_capture_unavailable");
});

test("capture endpoint rejects invalid payloads before calling the provider", async () => {
  let called = false;
  const response = await handleCapturePost(
    captureRequest({ url: "file:///etc/passwd", viewport: "tablet" }),
    { accountId: "account", apiToken: "token" },
    async () => {
      called = true;
      return new Response();
    },
  );

  assert.equal(response.status, 400);
  assert.equal(called, false);
  assert.deepEqual(await response.json(), {
    ok: false,
    code: "invalid_capture_request",
    message: "Choose a public URL, a supported viewport, and valid bounded capture options.",
  });
});

test("capture endpoint reports missing deployment configuration honestly", async () => {
  const response = await handleCapturePost(captureRequest(), null);

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    ok: false,
    code: "remote_capture_unavailable",
    message:
      "Remote capture is not configured on this deployment. Use the included live target or configure Browser Run.",
  });
});

test("capture endpoint returns a provider checkpoint without exposing configuration", async () => {
  const response = await handleCapturePost(
    captureRequest(),
    { accountId: "account-secret", apiToken: "token-secret" },
    successfulCaptureFetch,
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const text = await response.text();
  assert.equal(text.includes("account-secret"), false);
  assert.equal(text.includes("token-secret"), false);
  const payload = JSON.parse(text) as { ok: boolean; checkpoint: { title: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.checkpoint.title, "Example");
});

test("capture endpoint forwards explicit full-page and wait-selector options", async () => {
  let providerBody: Record<string, unknown> | undefined;
  const response = await handleCapturePost(
    captureRequest({
      url: "https://example.com/product",
      viewport: "desktop",
      full_page: true,
      wait_for_selector: '.app[data-state="ready"]',
    }),
    { accountId: "account", apiToken: "token" },
    async (_input, init) => {
      providerBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        success: true,
        result: {
          screenshot: "aGVsbG8=",
          markdown: "# Example",
          accessibilityTree: { role: "RootWebArea", name: "Example" },
        },
        meta: { status: 200, title: "Example" },
      });
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(providerBody?.screenshotOptions, { fullPage: true });
  assert.deepEqual(providerBody?.waitForSelector, {
    selector: '.app[data-state="ready"]',
    timeout: 8_000,
  });
});

test("capture endpoint rejects unsafe wait selectors before calling the provider", async () => {
  let called = false;
  const response = await handleCapturePost(
    captureRequest({
      url: "https://example.com",
      viewport: "desktop",
      wait_for_selector: "main, iframe",
    }),
    { accountId: "account", apiToken: "token" },
    async () => {
      called = true;
      return new Response();
    },
  );

  assert.equal(response.status, 400);
  assert.equal(called, false);
});

test("rejects a chunked request body once it exceeds the byte cap", async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode('{"url":"https://example.com","viewport":"desktop","preview_css":"'),
      );
      controller.enqueue(new Uint8Array(16_384));
    },
  });
  const request = new Request("https://sundae.test/api/capture", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: stream,
    duplex: "half",
  } as RequestInit);
  let called = false;

  const response = await handleCapturePost(
    request,
    { accountId: "account", apiToken: "token" },
    async () => {
      called = true;
      return new Response();
    },
  );

  assert.equal(response.status, 400);
  assert.equal(called, false);
});

test("requires same-origin browser metadata when it is present", async () => {
  const crossOrigin = await handleCapturePost(
    captureRequest(undefined, {
      "content-type": "application/json",
      origin: "https://attacker.example",
    }),
    null,
  );
  assert.equal(crossOrigin.status, 403);
  assert.equal((await crossOrigin.json()).code, "capture_origin_forbidden");

  const crossSite = await handleCapturePost(
    captureRequest(undefined, {
      "content-type": "application/json",
      "sec-fetch-site": "cross-site",
    }),
    null,
  );
  assert.equal(crossSite.status, 403);
  assert.equal((await crossSite.json()).code, "capture_origin_forbidden");

  const sameOrigin = await handleCapturePost(
    captureRequest(undefined, {
      "content-type": "application/json",
      origin: "https://sundae.test",
      "sec-fetch-site": "same-origin",
    }),
    null,
  );
  assert.equal(sameOrigin.status, 503);
});

test("rate limits a client in deterministic injected state", async () => {
  const limiter = createCaptureLimiterState({
    now: () => 10_000,
    rateLimit: 1,
    rateWindowMs: 60_000,
  });
  const options = { limiter, clientKey: () => "test-client" };
  const first = await handleCapturePost(captureRequest(), null, fetch, options);
  const second = await handleCapturePost(captureRequest(), null, fetch, options);

  assert.equal(first.status, 503);
  assert.equal(second.status, 429);
  assert.equal(second.headers.get("retry-after"), "60");
  assert.equal((await second.json()).code, "capture_rate_limited");
});

test("rejects a capture when the injected concurrency budget is occupied", async () => {
  const limiter = createCaptureLimiterState({ maxConcurrent: 1, rateLimit: 10 });
  let resolveProvider!: (response: Response) => void;
  const fetchImpl: typeof fetch = async () =>
    new Promise<Response>((resolve) => {
      resolveProvider = resolve;
    });

  const firstPromise = handleCapturePost(
    captureRequest(),
    { accountId: "account", apiToken: "token" },
    fetchImpl,
    { limiter },
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  const second = await handleCapturePost(
    captureRequest(),
    { accountId: "account", apiToken: "token" },
    fetchImpl,
    { limiter },
  );

  assert.equal(second.status, 503);
  assert.equal((await second.json()).code, "capture_busy");
  resolveProvider(
    Response.json({
      success: true,
      result: {
        screenshot: "aGVsbG8=",
        markdown: "# Example",
        accessibilityTree: { role: "RootWebArea", name: "Example" },
      },
      meta: { status: 200, title: "Example" },
    }),
  );
  const first = await firstPromise;
  assert.equal(first.status, 200);
  assert.equal(limiter.activeCaptures, 0);
});

test("reads capture limiter options from env and keeps defaults when values are missing or invalid", () => {
  assert.deepEqual(captureLimiterOptionsFromEnv({}), {
    maxConcurrent: 4,
    rateLimit: 20,
    rateWindowMs: 60_000,
  });
  assert.deepEqual(
    captureLimiterOptionsFromEnv({
      CAPTURE_MAX_CONCURRENT: "8",
      CAPTURE_RATE_LIMIT: "3",
      CAPTURE_RATE_WINDOW_MS: "1500",
    }),
    {
      maxConcurrent: 8,
      rateLimit: 3,
      rateWindowMs: 1500,
    },
  );
  assert.deepEqual(
    captureLimiterOptionsFromEnv({
      CAPTURE_MAX_CONCURRENT: "0",
      CAPTURE_RATE_LIMIT: "-1",
      CAPTURE_RATE_WINDOW_MS: "nope",
    }),
    {
      maxConcurrent: 4,
      rateLimit: 20,
      rateWindowMs: 60_000,
    },
  );
  assert.deepEqual(
    captureLimiterOptionsFromEnv({
      CAPTURE_MAX_CONCURRENT: " 12 ",
      CAPTURE_RATE_LIMIT: "",
      CAPTURE_RATE_WINDOW_MS: "1.5",
    }),
    {
      maxConcurrent: 12,
      rateLimit: 20,
      rateWindowMs: 60_000,
    },
  );
});

test("applies env-derived limiter options to capture rate limiting", async () => {
  const limiter = createCaptureLimiterState(
    captureLimiterOptionsFromEnv({
      CAPTURE_RATE_LIMIT: "1",
      CAPTURE_RATE_WINDOW_MS: "30000",
    }),
  );
  const options = { limiter, clientKey: () => "env-client" };
  const first = await handleCapturePost(captureRequest(), null, fetch, options);
  const second = await handleCapturePost(captureRequest(), null, fetch, options);

  assert.equal(first.status, 503);
  assert.equal(second.status, 429);
  assert.equal(second.headers.get("retry-after"), "30");
});
