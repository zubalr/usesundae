import assert from "node:assert/strict";
import test from "node:test";

import { captureWithCloudflare } from "../lib/capture/cloudflare";
import { MAX_CAPTURE_PROVIDER_RESPONSE_BYTES } from "../lib/capture/limits";
import { WORKER_SECRET_HEADER } from "../lib/capture/worker-protocol";
import type { BrowserFacts } from "../lib/audit/dom";

const publicResolver = async () => ["93.184.216.34"];
const facts: BrowserFacts = {
  viewport: "mobile",
  viewportSize: { width: 390, height: 844 },
  tapTargets: [],
  controls: [],
  contrastSamples: [
    {
      auditId: "start-for-free",
      identityConfidence: "unstable",
      label: "Start for free",
      foreground: "rgb(140, 140, 140)",
      background: "rgb(255, 255, 255)",
      rect: { x: 24, y: 80, width: 120, height: 20 },
    },
  ],
  overflow: { scrollWidth: 390, clientWidth: 390 },
  copy: null,
};

function workerPayload(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    elapsed_ms: 6700,
    browser_ms: 6400,
    http_status: 200,
    final_url: "https://example.com/",
    redirect_chain: [{ url: "https://example.com/", status: 200 }],
    screenshot_base64: "aGVsbG8=",
    viewport_size: { width: 390, height: 844 },
    full_page: false,
    text_or_markdown: "# Example\n\n[Docs](/docs)",
    accessibility_tree: { role: "RootWebArea", name: "Example" },
    facts,
    title: "Example",
    ...overrides,
  };
}

test("a configured Worker capture uses one Worker session and keeps facts on the checkpoint", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const fetchImpl: typeof fetch = async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return Response.json(workerPayload());
  };

  const checkpoint = await captureWithCloudflare(
    {
      workerUrl: "https://sundae-browser-capture.example.workers.dev",
      workerSecret: "worker-secret",
    },
    { url: "https://example.com/", viewport: "mobile" },
    fetchImpl,
    { resolveTarget: publicResolver },
  );

  assert.equal(requestUrl, "https://sundae-browser-capture.example.workers.dev/capture");
  assert.equal(new Headers(requestInit?.headers).get(WORKER_SECRET_HEADER), "worker-secret");
  assert.equal(new Headers(requestInit?.headers).get("authorization"), null);
  const body = JSON.parse(String(requestInit?.body)) as Record<string, unknown>;
  assert.equal(body.url, "https://example.com/");
  assert.equal(body.viewport, "mobile");
  assert.equal(checkpoint.screenshotDataUrl, "data:image/png;base64,aGVsbG8=");
  assert.equal(checkpoint.browserMsUsed, 6400);
  assert.equal(checkpoint.facts?.contrastSamples[0]?.label, "Start for free");
  assert.equal(checkpoint.siteTools, undefined);
  assert.equal(checkpoint.accessibility.rootName, "Example");
  assert.equal(checkpoint.visibleNav[0]?.url, "https://example.com/docs");
});

test("Worker captures keep observed siteTools when the payload includes them", async () => {
  const checkpoint = await captureWithCloudflare(
    {
      workerUrl: "https://sundae-browser-capture.example.workers.dev",
      workerSecret: "worker-secret",
    },
    { url: "https://example.com/", viewport: "mobile" },
    async () =>
      Response.json(
        workerPayload({
          site_tools: [
            {
              name: "sundae_lab_archive_workflow",
              title: "Archive workflow",
              description: "Archive a workflow in the controlled fixture and remove it.",
              annotations: { readOnlyHint: true },
            },
          ],
        }),
      ),
    { resolveTarget: publicResolver },
  );

  assert.equal(checkpoint.siteTools?.[0]?.name, "sundae_lab_archive_workflow");
  assert.equal(checkpoint.siteTools?.[0]?.annotations?.readOnlyHint, true);
});

test("Worker captures still refuse a private final hop", async () => {
  await assert.rejects(
    captureWithCloudflare(
      {
        workerUrl: "https://sundae-browser-capture.example.workers.dev",
        workerSecret: "worker-secret",
      },
      { url: "https://example.com/", viewport: "desktop" },
      async () =>
        Response.json(
          workerPayload({
            final_url: "http://169.254.169.254/latest/meta-data",
            redirect_chain: [
              { url: "https://example.com/", status: 302 },
              { url: "http://169.254.169.254/latest/meta-data", status: 200 },
            ],
          }),
        ),
      { resolveTarget: publicResolver },
    ),
    /private or unsupported destination/i,
  );
});

test("Worker captures keep the existing provider response size cap", async () => {
  await assert.rejects(
    captureWithCloudflare(
      {
        workerUrl: "https://sundae-browser-capture.example.workers.dev",
        workerSecret: "worker-secret",
      },
      { url: "https://example.com/", viewport: "desktop" },
      async () =>
        new Response("x".repeat(MAX_CAPTURE_PROVIDER_RESPONSE_BYTES + 1), {
          headers: { "content-type": "application/json" },
        }),
      { resolveTarget: publicResolver },
    ),
    /too large to inspect safely/i,
  );
});
