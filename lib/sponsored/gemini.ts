import { z } from "zod";

import type { Finding } from "@/lib/audit/types";
import type { RemoteCheckpoint } from "@/lib/capture/types";
import { readTextUpTo } from "@/lib/capture/stream";
import type { SponsoredReview } from "./http";
import { buildSundaeReviewPrompt, SUNDAE_REVIEW_SYSTEM_INSTRUCTION } from "./rubric";

const MAX_PROVIDER_RESPONSE_BYTES = 1_048_576;
const DEFAULT_REVIEW_TIMEOUT_MS = 45_000;
const MAX_REVIEW_OUTPUT_TOKENS = 8_192;
const MIN_REGION_SIZE = 0.001;

const regionSchema = z
  .object({
    x: z.number().finite().min(0).max(50_000),
    y: z.number().finite().min(0).max(50_000),
    width: z.number().finite().min(MIN_REGION_SIZE).max(50_000),
    height: z.number().finite().min(MIN_REGION_SIZE).max(50_000),
  })
  .strict();

const providerReviewSchema = z
  .object({
    summary: z.string().trim().min(1).max(700),
    strengths: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(120),
            evidence: z.string().trim().min(1).max(320),
          })
          .strict(),
      )
      .max(6),
    findings: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(140),
            observation: z.string().trim().min(1).max(360),
            whyItMatters: z.string().trim().min(1).max(300),
            recommendation: z.string().trim().min(1).max(300),
            severity: z.enum(["high", "medium", "low"]),
            rect: regionSchema.nullable(),
          })
          .strict(),
      )
      .max(10),
    coverage_notes: z.array(z.string().trim().min(1).max(240)).max(8),
  })
  .strict();

const responseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "strengths", "findings", "coverage_notes"],
  properties: {
    summary: { type: "string" },
    strengths: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "evidence"],
        properties: {
          title: { type: "string" },
          evidence: { type: "string" },
        },
      },
    },
    findings: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "observation", "whyItMatters", "recommendation", "severity", "rect"],
        properties: {
          title: { type: "string" },
          observation: { type: "string" },
          whyItMatters: { type: "string" },
          recommendation: { type: "string" },
          severity: { type: "string", enum: ["high", "medium", "low"] },
          rect: {
            anyOf: [
              { type: "null" },
              {
                type: "object",
                additionalProperties: false,
                required: ["x", "y", "width", "height"],
                properties: {
                  x: { type: "number", minimum: 0, maximum: 50_000 },
                  y: { type: "number", minimum: 0, maximum: 50_000 },
                  width: { type: "number", minimum: MIN_REGION_SIZE, maximum: 50_000 },
                  height: { type: "number", minimum: MIN_REGION_SIZE, maximum: 50_000 },
                },
              },
            ],
          },
        },
      },
    },
    coverage_notes: {
      type: "array",
      maxItems: 8,
      items: { type: "string" },
    },
  },
} as const;

type GeminiConfig = {
  apiKey: string;
  model: string;
};

export type GeminiReviewOptions = { timeoutMs?: number };

type GeminiInteractionResponse = {
  status?: unknown;
  steps?: Array<{
    type?: unknown;
    content?: Array<{ type?: unknown; text?: unknown }>;
  }>;
};

export class GeminiReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiReviewError";
  }
}

function screenshotInput(checkpoint: RemoteCheckpoint) {
  const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(
    checkpoint.screenshotDataUrl,
  );
  if (!match?.[1] || !match[2]) {
    throw new GeminiReviewError("The captured screenshot could not be prepared for review.");
  }
  return { type: "image", mime_type: match[1], data: match[2] };
}

async function parseGeminiResponse(response: Response) {
  const text = await readTextUpTo(response.body, MAX_PROVIDER_RESPONSE_BYTES);
  if (!response.ok || text === null) {
    throw new GeminiReviewError("The design review provider did not return a usable response.");
  }

  let payload: GeminiInteractionResponse;
  try {
    payload = JSON.parse(text) as GeminiInteractionResponse;
  } catch {
    throw new GeminiReviewError("The design review provider returned unreadable output.");
  }
  const modelOutput = payload.steps?.filter((step) => step.type === "model_output").at(-1);
  const candidateText = modelOutput?.content
    ?.filter((part) => part.type === "text")
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
  if (payload.status !== "completed" || !candidateText) {
    throw new GeminiReviewError("The design review provider returned no structured review.");
  }

  try {
    return providerReviewSchema.parse(JSON.parse(candidateText));
  } catch {
    throw new GeminiReviewError(
      "The design review provider returned an invalid structured review.",
    );
  }
}

async function runWithReviewTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  inputSignal: AbortSignal,
  timeoutMs: number,
) {
  inputSignal.throwIfAborted();
  const controller = new AbortController();
  const abortFromInput = () => controller.abort(inputSignal.reason);
  inputSignal.addEventListener("abort", abortFromInput, { once: true });

  let timedOut = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      controller.abort(new DOMException("The design review timed out.", "TimeoutError"));
      reject(new GeminiReviewError("The design review took too long to respond."));
    }, timeoutMs);
  });
  let removeInputAbortListener: (() => void) | undefined;
  const inputAbort = new Promise<never>((_, reject) => {
    const onAbort = () =>
      reject(new DOMException("The design review was cancelled.", "AbortError"));
    inputSignal.addEventListener("abort", onAbort, { once: true });
    removeInputAbortListener = () => inputSignal.removeEventListener("abort", onAbort);
  });

  try {
    return await Promise.race([work(controller.signal), timeout, inputAbort]);
  } catch (error) {
    if (timedOut) throw new GeminiReviewError("The design review took too long to respond.");
    throw error;
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    inputSignal.removeEventListener("abort", abortFromInput);
    removeInputAbortListener?.();
  }
}

export async function reviewWithGemini(
  config: GeminiConfig,
  checkpoint: RemoteCheckpoint,
  goal: string,
  measuredFindings: Finding[],
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
  options: GeminiReviewOptions = {},
): Promise<SponsoredReview> {
  if (!config.apiKey.trim() || !config.model.trim()) {
    throw new GeminiReviewError("The design review provider is not configured.");
  }
  const timeoutMs = Math.min(
    Math.max(1, options.timeoutMs ?? DEFAULT_REVIEW_TIMEOUT_MS),
    DEFAULT_REVIEW_TIMEOUT_MS,
  );
  return runWithReviewTimeout(
    async (boundedSignal) => {
      const endpoint = "https://generativelanguage.googleapis.com/v1/interactions";
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": config.apiKey,
        },
        body: JSON.stringify({
          model: config.model,
          store: false,
          system_instruction: SUNDAE_REVIEW_SYSTEM_INSTRUCTION,
          input: [
            { type: "text", text: buildSundaeReviewPrompt(checkpoint, goal, measuredFindings) },
            screenshotInput(checkpoint),
          ],
          generation_config: {
            thinking_level: "high",
            max_output_tokens: MAX_REVIEW_OUTPUT_TOKENS,
          },
          response_format: {
            type: "text",
            mime_type: "application/json",
            schema: responseJsonSchema,
          },
        }),
        signal: boundedSignal,
        cache: "no-store",
      });
      const review = await parseGeminiResponse(response);
      return {
        summary: review.summary,
        strengths: review.strengths,
        findings: review.findings,
        coverageNotes: review.coverage_notes,
        provider: {
          name: "Google Gemini Developer API",
          model: config.model,
          thinkingLevel: "HIGH",
        },
      };
    },
    signal,
    timeoutMs,
  );
}
