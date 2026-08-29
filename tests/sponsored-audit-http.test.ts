import assert from "node:assert/strict";
import test from "node:test";

import type { RemoteCheckpoint } from "../lib/capture/types";
import {
  MAX_CAPTURE_HTTP_RESPONSE_BYTES,
  MAX_CAPTURE_SCREENSHOT_BASE64_CHARS,
} from "../lib/capture/limits";
import { handleSponsoredAuditPost, type SponsoredAuditDependencies } from "../lib/sponsored/http";
import {
  createSponsoredAuditReceipt,
  createSponsoredRecoveryReceipt,
  SPONSORED_AUDIT_COOKIE,
  SPONSORED_RECOVERY_COOKIE,
} from "../lib/sponsored/receipt";

const receiptSecret = "a-sponsored-audit-secret-that-is-long-enough";
const claim = {
  fingerprint: "a".repeat(64),
  claimId: "3d594650-3436-4f21-9734-7b0c2ef5af76",
};

const checkpoint: RemoteCheckpoint = {
  id: "checkpoint_demo",
  scopeId: "scope_demo",
  source: "cloudflare",
  capturedAt: "2026-08-29T12:00:00.000Z",
  target: { displayUrl: "https://example.com/", origin: "https://example.com" },
  title: "Example",
  status: 200,
  viewport: "desktop",
  viewportSize: { width: 1440, height: 900 },
  screenshotDataUrl: "data:image/png;base64,aGVsbG8=",
  textExcerpt: "# Example\nA clear public page.",
  accessibility: {
    rootName: "Example",
    nodeCount: 3,
    interactiveCount: 1,
    unnamedInteractiveCount: 0,
    mainLandmarkCount: 1,
    headingOutline: [{ level: 1, name: "Example" }],
    nodes: [
      { role: "RootWebArea", name: "Example", states: [] },
      { role: "main", name: "", states: [] },
      { role: "heading", name: "Example", level: 1, states: [] },
    ],
  },
  gaps: [
    {
      id: "gap-flow-states",
      label: "Unvisited flow states",
      detail: "No additional journey step was captured.",
    },
  ],
  preview: { applied: false },
  capture: { fullPage: false },
};

const review: Awaited<ReturnType<SponsoredAuditDependencies["review"]>> = {
  summary: "The page is understandable, but the primary action blends into its surroundings.",
  strengths: [
    {
      title: "Clear page purpose",
      evidence: "The first visible heading names the product directly.",
    },
  ],
  findings: [
    {
      title: "The primary action lacks visual priority",
      observation: "The main action uses the same weight and contrast as supporting controls.",
      whyItMatters: "New visitors may not know which action advances the signup journey.",
      recommendation: "Give the primary action one distinct treatment and label it by outcome.",
      severity: "high",
      rect: { x: 900, y: 520, width: 260, height: 72 },
    },
  ],
  coverageNotes: ["The post-signup state was not opened."],
  provider: {
    name: "Google Gemini Developer API",
    model: "gemini-3.7-flash",
    thinkingLevel: "HIGH",
  },
};

function sponsoredRequest(
  body: Record<string, unknown> = {
    url: "https://example.com/?variant=A#pricing",
    goal: "Improve signup clarity",
    viewport: "desktop",
    consent: true,
    turnstile_token: "verified-turnstile-token",
  },
  headers: Record<string, string> = {
    "content-type": "application/json",
    origin: "https://sundae.test",
    "sec-fetch-site": "same-origin",
  },
) {
  return new Request("https://sundae.test/api/sponsored-audit", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function dependencies(
  overrides: Partial<SponsoredAuditDependencies> = {},
): SponsoredAuditDependencies {
  return {
    verifyChallenge: async () => true,
    claimRedemption: async () => ({ status: "claimed", claim }),
    beginReviewRedemption: async () => {},
    completeRedemption: async () => {},
    releaseRedemption: async () => {},
    capture: async () => checkpoint,
    review: async () => review,
    ...overrides,
  };
}

function run(request: Request, customDependencies = dependencies()) {
  return handleSponsoredAuditPost(
    request,
    { allowedOrigin: "https://sundae.test", receiptSecret },
    customDependencies,
  );
}

test("returns evidence only after the durable claim is completed", async () => {
  let reviewReserved = false;
  let completed = false;
  const response = await run(
    sponsoredRequest(),
    dependencies({
      beginReviewRedemption: async (reviewClaim) => {
        assert.deepEqual(reviewClaim, claim);
        reviewReserved = true;
      },
      completeRedemption: async (completedClaim) => {
        assert.deepEqual(completedClaim, claim);
        assert.equal(reviewReserved, true);
        completed = true;
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(reviewReserved, true);
  assert.equal(completed, true);
  assert.match(response.headers.get("set-cookie") ?? "", /^sundae_sponsored_audit=/);
  assert.match(response.headers.get("set-cookie") ?? "", /HttpOnly/i);
  const payload = (await response.json()) as {
    ok: boolean;
    snapshot: { findings: Array<{ truth: string; rect: unknown }> };
    strengths: Array<{ title: string }>;
    session: { captureUrl: string; goal: string };
    receipt: { model: string; thinking_level: string };
  };
  assert.equal(payload.ok, true);
  assert.deepEqual(
    payload.snapshot.findings.map((finding) => finding.truth),
    ["judged"],
  );
  assert.deepEqual(payload.snapshot.findings[0]?.rect, {
    x: 900,
    y: 520,
    width: 260,
    height: 72,
  });
  assert.equal(payload.strengths[0]?.title, "Clear page purpose");
  assert.deepEqual(payload.session, {
    captureUrl: "https://example.com/?variant=A#pricing",
    goal: "Improve signup clarity",
  });
  assert.equal(payload.receipt.model, "gemini-3.7-flash");
  assert.equal(payload.receipt.thinking_level, "HIGH");
});

test("rejects invalid targets and absent consent before any external work", async () => {
  let called = false;
  const guarded = dependencies({
    verifyChallenge: async () => {
      called = true;
      return true;
    },
  });
  const invalidTarget = await run(
    sponsoredRequest({
      url: "http://127.0.0.1/admin",
      viewport: "desktop",
      consent: true,
      turnstile_token: "verified-turnstile-token",
    }),
    guarded,
  );
  const absentConsent = await run(
    sponsoredRequest({
      url: "https://example.com/",
      viewport: "desktop",
      turnstile_token: "verified-turnstile-token",
    }),
    guarded,
  );

  assert.equal(invalidTarget.status, 400);
  assert.equal(absentConsent.status, 400);
  assert.equal(called, false);
});

test("requires exact browser same-origin metadata", async () => {
  let called = false;
  const guarded = dependencies({
    verifyChallenge: async () => {
      called = true;
      return true;
    },
  });
  const headerSets: Array<Record<string, string>> = [
    { "content-type": "application/json", "sec-fetch-site": "same-origin" },
    { "content-type": "application/json", origin: "https://sundae.test" },
    {
      "content-type": "application/json",
      origin: "https://attacker.example",
      "sec-fetch-site": "cross-site",
    },
  ];

  for (const headers of headerSets) {
    assert.equal((await run(sponsoredRequest(undefined, headers), guarded)).status, 403);
  }
  assert.equal(called, false);
});

test("stops before reservation when human verification fails", async () => {
  let claimed = false;
  const response = await run(
    sponsoredRequest(),
    dependencies({
      verifyChallenge: async () => false,
      claimRedemption: async () => {
        claimed = true;
        return { status: "claimed", claim };
      },
    }),
  );

  assert.equal(response.status, 403);
  assert.equal(claimed, false);
});

test("releases a capture failure but fails closed after model review begins", async () => {
  let releases = 0;
  const releaseRedemption = async () => {
    releases += 1;
  };
  const captureFailure = await run(
    sponsoredRequest(),
    dependencies({
      releaseRedemption,
      capture: async () => {
        throw new Error("provider detail must stay private");
      },
    }),
  );
  const reviewFailure = await run(
    sponsoredRequest(),
    dependencies({
      releaseRedemption,
      review: async () => {
        throw new Error("model detail must stay private");
      },
    }),
  );

  assert.equal(captureFailure.status, 502);
  assert.equal(reviewFailure.status, 502);
  assert.equal(captureFailure.headers.has("set-cookie"), false);
  assert.equal(reviewFailure.headers.has("set-cookie"), false);
  assert.equal(
    ((await reviewFailure.json()) as { code: string }).code,
    "sponsored_audit_review_failed",
  );
  assert.equal(releases, 1);
});

test("fails closed before paid work when a durable claim cannot be reserved", async () => {
  let captured = false;
  const response = await run(
    sponsoredRequest(),
    dependencies({
      claimRedemption: async () => {
        throw new Error("gate detail must stay private");
      },
      capture: async () => {
        captured = true;
        return checkpoint;
      },
    }),
  );

  assert.equal(response.status, 503);
  assert.equal(captured, false);
  assert.equal(
    ((await response.json()) as { code: string }).code,
    "sponsored_audit_temporarily_unavailable",
  );
});

test("rejects used, closed, and in-progress durable claims before paid work", async () => {
  for (const status of ["used", "closed", "busy"] as const) {
    let captured = false;
    const response = await run(
      sponsoredRequest(),
      dependencies({
        claimRedemption: async () => ({ status }),
        capture: async () => {
          captured = true;
          return checkpoint;
        },
      }),
    );
    assert.equal(response.status, 409);
    assert.equal(captured, false);
  }
});

test("describes a fail-closed provider allowance without claiming a completed audit", async () => {
  const response = await run(
    sponsoredRequest(),
    dependencies({ claimRedemption: async () => ({ status: "closed" }) }),
  );
  const payload = (await response.json()) as { code: string; message: string };

  assert.equal(response.status, 409);
  assert.equal(payload.code, "sponsored_audit_allowance_closed");
  assert.doesNotMatch(payload.message, /already completed/i);
  assert.match(payload.message, /did not produce a deliverable receipt/i);
});

test("describes a used allowance without claiming a lost receipt was delivered", async () => {
  const response = await run(
    sponsoredRequest(),
    dependencies({ claimRedemption: async () => ({ status: "used" }) }),
  );
  const payload = (await response.json()) as { code: string; message: string };

  assert.equal(response.status, 409);
  assert.equal(payload.code, "sponsored_audit_already_used");
  assert.doesNotMatch(payload.message, /already completed|report was delivered/i);
  assert.match(payload.message, /allowance has already been finalized/i);
});

test("rejects exhausted global capacity before paid work", async () => {
  let captured = false;
  const response = await run(
    sponsoredRequest(),
    dependencies({
      claimRedemption: async () => ({ status: "capacity" }),
      capture: async () => {
        captured = true;
        return checkpoint;
      },
    }),
  );

  assert.equal(response.status, 503);
  assert.equal(captured, false);
  assert.equal(
    ((await response.json()) as { code: string }).code,
    "sponsored_audit_capacity_reached",
  );
});

test("a signed browser receipt rejects reuse before challenge verification", async () => {
  let verified = false;
  const token = createSponsoredAuditReceipt(receiptSecret);
  const request = sponsoredRequest(undefined, {
    "content-type": "application/json",
    origin: "https://sundae.test",
    "sec-fetch-site": "same-origin",
    cookie: `${SPONSORED_AUDIT_COOKIE}=${token}`,
  });
  const response = await run(
    request,
    dependencies({
      verifyChallenge: async () => {
        verified = true;
        return true;
      },
    }),
  );

  assert.equal(response.status, 409);
  assert.equal(verified, false);
});

test("a signed recovery receipt reopens only its exact failed claim before paid work", async () => {
  const recovery = createSponsoredRecoveryReceipt(receiptSecret, claim.claimId);
  let suppliedRecovery: string | undefined;
  const request = sponsoredRequest(undefined, {
    "content-type": "application/json",
    origin: "https://sundae.test",
    "sec-fetch-site": "same-origin",
    cookie: `${SPONSORED_RECOVERY_COOKIE}=${recovery}`,
  });
  const response = await run(
    request,
    dependencies({
      claimRedemption: async (_claimRequest, recoveryClaimId) => {
        suppliedRecovery = recoveryClaimId;
        return { status: "claimed", claim };
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(suppliedRecovery, claim.claimId);
});

test("serializes concurrent attempts before capture", async () => {
  let active = false;
  let captures = 0;
  let allowCapture: (() => void) | undefined;
  let captureStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    captureStarted = resolve;
  });
  const waitForCapture = new Promise<void>((resolve) => {
    allowCapture = resolve;
  });
  const shared = dependencies({
    claimRedemption: async () => {
      if (active) return { status: "busy" };
      active = true;
      return { status: "claimed", claim };
    },
    capture: async () => {
      captures += 1;
      captureStarted?.();
      await waitForCapture;
      return checkpoint;
    },
  });

  const first = run(sponsoredRequest(), shared);
  await started;
  const second = await run(sponsoredRequest(), shared);
  allowCapture?.();
  const firstResponse = await first;

  assert.equal(firstResponse.status, 200);
  assert.equal(second.status, 409);
  assert.equal(captures, 1);
});

test("surfaces durable completion failure without issuing a success receipt", async () => {
  const response = await run(
    sponsoredRequest(),
    dependencies({
      completeRedemption: async () => {
        throw new Error("gate became unavailable");
      },
    }),
  );

  assert.equal(response.status, 503);
  assert.equal(response.headers.has("set-cookie"), false);
  const payload = (await response.json()) as { code: string; message: string };
  assert.equal(payload.code, "sponsored_audit_receipt_failed");
  assert.match(payload.message, /allowance is terminal/i);
  assert.doesNotMatch(payload.message, /audit was completed|already completed/i);
});

test("fails closed when a provider failure cannot release its durable claim", async () => {
  const response = await run(
    sponsoredRequest(),
    dependencies({
      capture: async () => {
        throw new Error("capture failed");
      },
      releaseRedemption: async () => {
        throw new Error("gate unavailable");
      },
    }),
  );

  assert.equal(response.status, 503);
  const recoveryCookie = response.headers.get("set-cookie") ?? "";
  assert.match(recoveryCookie, new RegExp(`^${SPONSORED_RECOVERY_COOKIE}=`));
  assert.doesNotMatch(recoveryCookie, new RegExp(`^${SPONSORED_AUDIT_COOKIE}=`));
  assert.equal(
    ((await response.json()) as { code: string }).code,
    "sponsored_audit_release_failed",
  );
});

test("releases a claim when the durable review reservation cannot be confirmed", async () => {
  let reviewed = false;
  let released = false;
  const response = await run(
    sponsoredRequest(),
    dependencies({
      beginReviewRedemption: async () => {
        throw new Error("gate unavailable");
      },
      review: async () => {
        reviewed = true;
        return review;
      },
      releaseRedemption: async () => {
        released = true;
      },
    }),
  );

  assert.equal(response.status, 502);
  assert.equal(reviewed, false);
  assert.equal(released, true);
  assert.equal(
    ((await response.json()) as { code: string }).code,
    "sponsored_audit_review_reservation_failed",
  );
});

test("releases safely when the caller aborts before model review begins", async () => {
  const controller = new AbortController();
  let reviewed = false;
  let released = false;
  const response = await run(
    new Request(sponsoredRequest(), { signal: controller.signal }),
    dependencies({
      beginReviewRedemption: async () => {
        controller.abort();
      },
      review: async () => {
        reviewed = true;
        return review;
      },
      releaseRedemption: async () => {
        released = true;
      },
    }),
  );

  assert.equal(response.status, 502);
  assert.equal(reviewed, false);
  assert.equal(released, true);
  assert.equal(
    ((await response.json()) as { code: string }).code,
    "sponsored_audit_review_reservation_failed",
  );
});

test("rejects oversized visual evidence before model review or redemption completion", async () => {
  let reviewed = false;
  let completed = false;
  let released = false;
  const response = await run(
    sponsoredRequest(),
    dependencies({
      capture: async () => ({
        ...checkpoint,
        screenshotDataUrl: `data:image/png;base64,${"A".repeat(
          MAX_CAPTURE_SCREENSHOT_BASE64_CHARS + 101,
        )}`,
      }),
      review: async () => {
        reviewed = true;
        return review;
      },
      completeRedemption: async () => {
        completed = true;
      },
      releaseRedemption: async () => {
        released = true;
      },
    }),
  );

  assert.equal(response.status, 502);
  assert.equal(reviewed, false);
  assert.equal(completed, false);
  assert.equal(released, true);
  assert.equal(
    ((await response.json()) as { code: string }).code,
    "sponsored_audit_evidence_too_large",
  );
});

test("fails closed when a completed model review exceeds the response budget", async () => {
  let completed = false;
  let released = false;
  const response = await run(
    sponsoredRequest(),
    dependencies({
      review: async () => ({
        ...review,
        summary: "A".repeat(MAX_CAPTURE_HTTP_RESPONSE_BYTES),
      }),
      completeRedemption: async () => {
        completed = true;
      },
      releaseRedemption: async () => {
        released = true;
      },
    }),
  );

  assert.equal(response.status, 502);
  assert.equal(completed, false);
  assert.equal(released, false);
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(
    ((await response.json()) as { code: string }).code,
    "sponsored_audit_evidence_too_large",
  );
});

test("rejects an oversized request before any external work", async () => {
  let called = false;
  const request = new Request("https://sundae.test/api/sponsored-audit", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://sundae.test",
      "sec-fetch-site": "same-origin",
    },
    body: `${JSON.stringify({
      url: "https://example.com/",
      viewport: "desktop",
      consent: true,
      turnstile_token: "verified-turnstile-token",
    })}${" ".repeat(20_000)}`,
  });
  const response = await run(
    request,
    dependencies({
      verifyChallenge: async () => {
        called = true;
        return true;
      },
    }),
  );

  assert.equal(response.status, 400);
  assert.equal(called, false);
});
