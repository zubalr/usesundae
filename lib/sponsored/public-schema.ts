import { z } from "zod";

import { MAX_CAPTURE_SCREENSHOT_BASE64_CHARS } from "@/lib/capture/limits";

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);

const regionSchema = z
  .object({
    x: z.number().finite().min(0).max(50_000),
    y: z.number().finite().min(0).max(50_000),
    width: z.number().finite().positive().max(50_000),
    height: z.number().finite().positive().max(50_000),
  })
  .strict();

const findingSchema = z.object({
  id: boundedText(240),
  auditId: boundedText(160),
  rule: z.enum([
    "tap-target",
    "accessible-name",
    "contrast",
    "horizontal-overflow",
    "content-clarity",
    "heading-outline",
    "http-status",
    "main-landmark",
    "document-name",
    "visual-judgment",
    "agent-surface",
  ]),
  truth: z.enum(["measured", "judged"]),
  severity: z.enum(["high", "medium", "low"]),
  title: boundedText(200),
  observation: boundedText(500),
  whyItMatters: boundedText(500),
  recommendation: boundedText(500),
  viewport: z.enum(["mobile", "desktop"]),
  rect: regionSchema.nullable(),
  measurement: z
    .object({
      value: boundedText(160),
      threshold: boundedText(160),
      unit: z.string().max(80),
    })
    .nullable(),
  identityConfidence: z.enum(["stable", "unstable"]).optional(),
  checkpointId: boundedText(160).optional(),
  scopeKey: boundedText(240).optional(),
  evidence: z
    .object({
      kind: z.enum(["dom", "screenshot", "accessibility", "tool-contract"]),
      ref: boundedText(320),
    })
    .optional(),
});

const gapSchema = z.object({
  id: boundedText(160),
  label: boundedText(160),
  detail: boundedText(500),
});

export const sponsoredAuditSuccessSchema = z.object({
  ok: z.literal(true),
  checkpoint: z.object({
    id: boundedText(160),
    scopeId: boundedText(160),
    source: z.enum(["cloudflare", "local"]),
    capturedAt: boundedText(64),
    target: z.object({
      displayUrl: z.string().url().max(2048),
      origin: z.string().url().max(2048),
    }),
    title: boundedText(160),
    status: z.number().int().min(100).max(599).nullable(),
    viewport: z.enum(["mobile", "desktop"]),
    viewportSize: z.object({
      width: z.number().int().positive().max(50_000),
      height: z.number().int().positive().max(50_000),
    }),
    screenshotDataUrl: z
      .string()
      .max(MAX_CAPTURE_SCREENSHOT_BASE64_CHARS + 100)
      .regex(/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/),
    textExcerpt: z.string().max(4000),
    accessibility: z.object({
      rootName: z.string().max(320),
      nodeCount: z.number().int().min(0).max(100_000),
      interactiveCount: z.number().int().min(0).max(100_000),
      unnamedInteractiveCount: z.number().int().min(0).max(100_000),
      mainLandmarkCount: z.number().int().min(0).max(100_000),
      truncated: z.boolean().optional(),
      headingOutline: z
        .array(z.object({ level: z.number().int().min(1).max(6), name: z.string().max(320) }))
        .max(256),
      nodes: z
        .array(
          z.object({
            role: z.string().max(120),
            name: z.string().max(320),
            level: z.number().int().min(1).max(6).optional(),
            states: z.array(z.string().max(120)).max(32),
          }),
        )
        .max(256),
    }),
    gaps: z.array(gapSchema).max(16),
    preview: z.object({ applied: z.boolean() }),
    capture: z.object({
      fullPage: z.boolean(),
      waitForSelector: z.string().max(160).optional(),
    }),
    browserMsUsed: z.number().int().min(0).optional(),
  }),
  snapshot: z.object({
    capturedAt: boundedText(64),
    demoState: z.enum(["baseline", "improved"]),
    viewport: z.enum(["mobile", "desktop"]),
    viewportSize: z.object({
      width: z.number().int().positive().max(50_000),
      height: z.number().int().positive().max(50_000),
    }),
    scopeKey: boundedText(240).optional(),
    findings: z.array(findingSchema).max(24),
    gaps: z.array(gapSchema).max(24),
  }),
  summary: boundedText(700),
  strengths: z
    .array(
      z.object({
        title: boundedText(120),
        evidence: boundedText(320),
      }),
    )
    .max(6),
  coverage_notes: z.array(boundedText(240)).max(8),
  session: z.object({
    captureUrl: z.string().url().max(2048),
    goal: z.string().max(320),
  }),
  receipt: z.object({
    provider: boundedText(120),
    model: boundedText(120),
    thinking_level: boundedText(40),
    scope: boundedText(160),
  }),
});

export const sponsoredAuditFailureSchema = z.object({
  ok: z.literal(false),
  message: boundedText(500).optional(),
});

export type SponsoredAuditSuccess = z.infer<typeof sponsoredAuditSuccessSchema>;
