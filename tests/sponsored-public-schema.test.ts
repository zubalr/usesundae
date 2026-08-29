import assert from "node:assert/strict";
import test from "node:test";

import { sponsoredAuditSuccessSchema } from "../lib/sponsored/public-schema";
import { MAX_CAPTURE_SCREENSHOT_BASE64_CHARS } from "../lib/capture/limits";

const validReport = {
  ok: true,
  checkpoint: {
    id: "checkpoint_public",
    scopeId: "scope_public",
    source: "cloudflare",
    capturedAt: "2026-08-29T12:00:00.000Z",
    target: { displayUrl: "https://example.com/", origin: "https://example.com" },
    title: "Example product",
    status: 200,
    viewport: "desktop",
    viewportSize: { width: 1440, height: 900 },
    screenshotDataUrl: "data:image/png;base64,aGVsbG8=",
    textExcerpt: "# Example product",
    accessibility: {
      rootName: "Example product",
      nodeCount: 2,
      interactiveCount: 1,
      unnamedInteractiveCount: 0,
      mainLandmarkCount: 1,
      headingOutline: [{ level: 1, name: "Example product" }],
      nodes: [{ role: "button", name: "Start", states: [] }],
    },
    gaps: [
      {
        id: "gap_flow",
        label: "Unvisited flow",
        detail: "No additional route was captured.",
      },
    ],
    preview: { applied: false },
    capture: { fullPage: true },
  },
  snapshot: {
    capturedAt: "2026-08-29T12:00:00.000Z",
    demoState: "baseline",
    viewport: "desktop",
    viewportSize: { width: 1440, height: 900 },
    scopeKey: "scope_public",
    gaps: [],
    findings: [
      {
        id: "finding_public",
        auditId: "audit_public",
        rule: "visual-judgment",
        truth: "judged",
        severity: "medium",
        title: "The primary path lacks visual priority",
        observation: "The action uses the same emphasis as supporting controls.",
        whyItMatters: "A new visitor may need to scan before choosing the next step.",
        recommendation: "Give the primary action one distinct treatment.",
        viewport: "desktop",
        rect: { x: 900, y: 500, width: 240, height: 80 },
        measurement: null,
      },
    ],
  },
  summary: "The page is clear, with one evidence-backed hierarchy concern.",
  strengths: [{ title: "Clear promise", evidence: "The first heading names the product outcome." }],
  coverage_notes: ["Post-action states were not opened."],
  session: {
    captureUrl: "https://example.com/?variant=review#pricing",
    goal: "Clarify the activation path",
  },
  receipt: {
    provider: "Google Gemini Developer API",
    model: "gemini-3.7-flash",
    thinking_level: "HIGH",
    scope: "one approved public page and viewport",
  },
};

test("accepts the bounded report fields used by the sponsored UI", () => {
  const result = sponsoredAuditSuccessSchema.safeParse(validReport);
  assert.equal(result.success, true);
});

test("rejects a malformed ok response before the report can render", () => {
  const result = sponsoredAuditSuccessSchema.safeParse({
    ok: true,
    checkpoint: { title: "Missing bounded evidence" },
  });
  assert.equal(result.success, false);
});

test("rejects screenshot evidence larger than the function response budget", () => {
  const result = sponsoredAuditSuccessSchema.safeParse({
    ...validReport,
    checkpoint: {
      ...validReport.checkpoint,
      screenshotDataUrl: `data:image/png;base64,${"A".repeat(
        MAX_CAPTURE_SCREENSHOT_BASE64_CHARS + 101,
      )}`,
    },
  });
  assert.equal(result.success, false);
});
