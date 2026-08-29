import { captureWithCloudflare } from "@/lib/capture/cloudflare";
import { sponsoredAuditConfigFromEnv } from "@/lib/sponsored/config";
import { handleSponsoredAuditPost } from "@/lib/sponsored/http";
import { createRedemptionGate, type RedemptionGate } from "@/lib/sponsored/redemption";
import { verifyTurnstile } from "@/lib/sponsored/turnstile";
import { reviewWithGemini } from "@/lib/sponsored/gemini";

export const runtime = "nodejs";
export const maxDuration = 120;

const SPONSORED_OPERATION_TIMEOUT_MS = 100_000;
let redemptionGate: RedemptionGate | undefined;

function unavailable() {
  return Response.json(
    {
      ok: false,
      code: "sponsored_audit_unavailable",
      message: "The complimentary audit is not configured on this deployment yet.",
    },
    {
      status: 503,
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
        "x-content-type-options": "nosniff",
      },
    },
  );
}

export async function POST(request: Request) {
  const config = sponsoredAuditConfigFromEnv();
  if (!config) return unavailable();

  redemptionGate ??= createRedemptionGate(config.redemption);
  const signal = AbortSignal.any([
    request.signal,
    AbortSignal.timeout(SPONSORED_OPERATION_TIMEOUT_MS),
  ]);
  const boundedRequest = new Request(request, { signal });
  const expectedHostname = new URL(config.allowedOrigin).hostname;
  return handleSponsoredAuditPost(
    boundedRequest,
    { allowedOrigin: config.allowedOrigin, receiptSecret: config.receiptSecret },
    {
      verifyChallenge: (token, challengeRequest) =>
        verifyTurnstile({ ...config.turnstile, expectedHostname }, token, challengeRequest),
      claimRedemption: redemptionGate.claim,
      beginReviewRedemption: redemptionGate.beginReview,
      completeRedemption: redemptionGate.complete,
      releaseRedemption: redemptionGate.release,
      capture: ({ url, viewport, signal: captureSignal }) =>
        captureWithCloudflare(config.capture, {
          url,
          viewport,
          fullPage: true,
          signal: captureSignal,
        }),
      review: (checkpoint, goal, measuredFindings, reviewSignal) =>
        reviewWithGemini(config.gemini, checkpoint, goal, measuredFindings, reviewSignal),
    },
  );
}
