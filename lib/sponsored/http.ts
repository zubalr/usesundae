import { z } from "zod";

import {
  createJudgedFinding,
  deriveCheckpointFindings,
  snapshotFromCheckpoint,
  type JudgedFindingInput,
} from "@/lib/audit/remote";
import type { AuditSnapshot, Viewport } from "@/lib/audit/types";
import {
  MAX_CAPTURE_HTTP_RESPONSE_BYTES,
  MAX_CAPTURE_SCREENSHOT_BASE64_CHARS,
} from "@/lib/capture/limits";
import type { RemoteCheckpoint } from "@/lib/capture/types";
import { normalizePublicTarget, TargetPolicyError } from "@/lib/capture/url-policy";
import { readTextUpTo } from "@/lib/capture/stream";
import type { RedemptionClaim, RedemptionClaimResult } from "./redemption";
import {
  createSponsoredAuditReceipt,
  createSponsoredRecoveryReceipt,
  readSponsoredAuditReceipt,
  readSponsoredRecoveryClaim,
  sponsoredAuditCookieHeader,
  sponsoredRecoveryCookieHeader,
  verifySponsoredAuditReceipt,
} from "./receipt";

const requestSchema = z
  .object({
    url: z.string().trim().min(1).max(2048),
    goal: z.string().trim().max(320).optional(),
    viewport: z.enum(["mobile", "desktop"]),
    consent: z.literal(true),
    turnstile_token: z.string().trim().min(1).max(2048),
  })
  .strict();

const MAX_REQUEST_BYTES = 16_384;

export type SponsoredStrength = { title: string; evidence: string };

export type SponsoredReview = {
  summary: string;
  strengths: SponsoredStrength[];
  findings: JudgedFindingInput[];
  coverageNotes: string[];
  provider: {
    name: string;
    model: string;
    thinkingLevel: "HIGH";
  };
};

export type SponsoredAuditDependencies = {
  verifyChallenge: (token: string, request: Request) => Promise<boolean>;
  claimRedemption: (request: Request, recoveryClaimId?: string) => Promise<RedemptionClaimResult>;
  beginReviewRedemption: (claim: RedemptionClaim) => Promise<void>;
  completeRedemption: (claim: RedemptionClaim) => Promise<void>;
  releaseRedemption: (claim: RedemptionClaim) => Promise<void>;
  capture: (input: {
    url: string;
    viewport: Viewport;
    signal: AbortSignal;
  }) => Promise<RemoteCheckpoint>;
  review: (
    checkpoint: RemoteCheckpoint,
    goal: string,
    measuredFindings: AuditSnapshot["findings"],
    signal: AbortSignal,
  ) => Promise<SponsoredReview>;
};

export type SponsoredAuditHttpConfig = {
  allowedOrigin?: string;
  receiptSecret: string;
};

function json(payload: Record<string, unknown>, status: number, cookie?: string) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
      ...(cookie ? { "set-cookie": cookie } : {}),
    },
  });
}

function invalidRequest() {
  return json(
    {
      ok: false,
      code: "invalid_sponsored_audit_request",
      message: "Choose a public URL, approve the evidence transfer, and complete verification.",
    },
    400,
  );
}

function failClosedAfterReview(code: string, message: string) {
  return json({ ok: false, code, message }, 502);
}

async function releaseFailedAudit(
  request: Request,
  config: SponsoredAuditHttpConfig,
  dependencies: SponsoredAuditDependencies,
  claim: RedemptionClaim,
  code: string,
  message: string,
) {
  try {
    await dependencies.releaseRedemption(claim);
    return json({ ok: false, code, message }, 502);
  } catch {
    const recovery = createSponsoredRecoveryReceipt(config.receiptSecret, claim.claimId);
    return json(
      {
        ok: false,
        code: "sponsored_audit_release_failed",
        message:
          "The review failed, and Sundae could not immediately reopen the allowance. No successful receipt was issued; retry after the reservation recovers.",
      },
      503,
      sponsoredRecoveryCookieHeader(recovery, request.url),
    );
  }
}

function originAllowed(request: Request, configured?: string) {
  let expected: string;
  try {
    expected = new URL(configured?.trim() || request.url).origin;
    const origin = request.headers.get("origin")?.trim();
    if (!origin || new URL(origin).origin !== expected) return false;
  } catch {
    return false;
  }
  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  return fetchSite === "same-origin";
}

export async function handleSponsoredAuditPost(
  request: Request,
  config: SponsoredAuditHttpConfig,
  dependencies: SponsoredAuditDependencies,
) {
  if (!originAllowed(request, config.allowedOrigin)) {
    return json(
      {
        ok: false,
        code: "sponsored_audit_origin_forbidden",
        message: "Sponsored audits must start from the Sundae app.",
      },
      403,
    );
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return invalidRequest();
  }

  let body: unknown;
  try {
    const text = await readTextUpTo(request.body, MAX_REQUEST_BYTES);
    body = text === null ? null : JSON.parse(text);
  } catch {
    body = null;
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return invalidRequest();

  let target;
  try {
    target = normalizePublicTarget(parsed.data.url);
  } catch (error) {
    if (error instanceof TargetPolicyError) return invalidRequest();
    throw error;
  }

  if (verifySponsoredAuditReceipt(config.receiptSecret, readSponsoredAuditReceipt(request))) {
    return json(
      {
        ok: false,
        code: "sponsored_audit_already_used",
        message: "This browser or network has already completed its complimentary audit.",
      },
      409,
    );
  }

  let challengeVerified = false;
  try {
    challengeVerified = await dependencies.verifyChallenge(parsed.data.turnstile_token, request);
  } catch {
    challengeVerified = false;
  }
  if (!challengeVerified) {
    return json(
      {
        ok: false,
        code: "sponsored_audit_challenge_failed",
        message: "Verification expired or could not be confirmed. Complete it again and retry.",
      },
      403,
    );
  }

  let redemption: RedemptionClaimResult;
  try {
    redemption = await dependencies.claimRedemption(
      request,
      readSponsoredRecoveryClaim(config.receiptSecret, request),
    );
  } catch {
    return json(
      {
        ok: false,
        code: "sponsored_audit_temporarily_unavailable",
        message: "Complimentary audit eligibility could not be reserved. Try again shortly.",
      },
      503,
    );
  }
  if (redemption.status !== "claimed") {
    if (redemption.status === "used") {
      return json(
        {
          ok: false,
          code: "sponsored_audit_already_used",
          message:
            "This browser/network allowance has already been finalized and cannot start another complimentary provider review.",
        },
        409,
      );
    }
    if (redemption.status === "closed") {
      return json(
        {
          ok: false,
          code: "sponsored_audit_allowance_closed",
          message:
            "A previous provider attempt did not produce a deliverable receipt. This browser/network allowance is closed to prevent duplicate provider spend.",
        },
        409,
      );
    }
    return redemption.status === "capacity"
      ? json(
          {
            ok: false,
            code: "sponsored_audit_capacity_reached",
            message:
              "Sundae’s global complimentary audit capacity is currently full. Try again later or after the UTC-day reset.",
          },
          503,
        )
      : json(
          {
            ok: false,
            code: "sponsored_audit_in_progress",
            message: "A complimentary audit is already in progress for this browser or network.",
          },
          409,
        );
  }
  const claim = redemption.claim;

  let checkpoint: RemoteCheckpoint;
  try {
    checkpoint = await dependencies.capture({
      url: target.captureUrl,
      viewport: parsed.data.viewport,
      signal: request.signal,
    });
    request.signal.throwIfAborted();
  } catch {
    return releaseFailedAudit(
      request,
      config,
      dependencies,
      claim,
      "sponsored_audit_capture_failed",
      "Sundae could not capture that page. Your complimentary audit was not used.",
    );
  }
  if (checkpoint.screenshotDataUrl.length > MAX_CAPTURE_SCREENSHOT_BASE64_CHARS + 100) {
    return releaseFailedAudit(
      request,
      config,
      dependencies,
      claim,
      "sponsored_audit_evidence_too_large",
      "That page produced more visual evidence than Sundae can return safely. Your complimentary audit was not used.",
    );
  }
  const measuredFindings = deriveCheckpointFindings(checkpoint);
  try {
    await dependencies.beginReviewRedemption(claim);
    request.signal.throwIfAborted();
  } catch {
    return releaseFailedAudit(
      request,
      config,
      dependencies,
      claim,
      "sponsored_audit_review_reservation_failed",
      "Sundae could not safely reserve the design-review step. Your complimentary audit was not used.",
    );
  }
  let review: SponsoredReview;
  let judgedFindings: AuditSnapshot["findings"];
  try {
    review = await dependencies.review(
      checkpoint,
      parsed.data.goal ?? "",
      measuredFindings,
      request.signal,
    );
    judgedFindings = review.findings.map((finding, index) =>
      createJudgedFinding(checkpoint, finding, index + 1),
    );
    request.signal.throwIfAborted();
  } catch {
    return failClosedAfterReview(
      "sponsored_audit_review_failed",
      "The model did not return a deliverable review after provider work began. No browser receipt was issued, and this allowance is closed to prevent duplicate provider spend.",
    );
  }
  const snapshot = snapshotFromCheckpoint(checkpoint, [...measuredFindings, ...judgedFindings]);
  const successPayload = {
    ok: true,
    checkpoint,
    snapshot,
    summary: review.summary,
    strengths: review.strengths,
    coverage_notes: review.coverageNotes,
    session: {
      captureUrl: target.captureUrl,
      goal: parsed.data.goal ?? "",
    },
    receipt: {
      provider: review.provider.name,
      model: review.provider.model,
      thinking_level: review.provider.thinkingLevel,
      scope: "one approved public page and viewport",
    },
  };
  const serializedPayload = JSON.stringify(successPayload);
  if (new TextEncoder().encode(serializedPayload).byteLength > MAX_CAPTURE_HTTP_RESPONSE_BYTES) {
    return failClosedAfterReview(
      "sponsored_audit_evidence_too_large",
      "The completed review produced more evidence than Sundae can return safely. No browser receipt was issued, and this allowance is closed to prevent duplicate provider spend.",
    );
  }

  try {
    await dependencies.completeRedemption(claim);
  } catch {
    return json(
      {
        ok: false,
        code: "sponsored_audit_receipt_failed",
        message:
          "The review finished, but Sundae could not confirm delivery of its one-time receipt. No browser receipt was issued. This allowance is terminal because durable completion may already have succeeded, and another provider run could duplicate spend.",
      },
      503,
    );
  }
  const receipt = createSponsoredAuditReceipt(config.receiptSecret);
  return new Response(serializedPayload, {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
      "set-cookie": sponsoredAuditCookieHeader(receipt, request.url),
    },
  });
}
