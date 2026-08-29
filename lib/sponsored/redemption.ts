import { createHash, createHmac, randomUUID } from "node:crypto";

import { readTextUpTo } from "@/lib/capture/stream";
import { clientAddressFromRequest } from "./client";

const MAX_GATE_RESPONSE_BYTES = 4096;
const GATE_TIMEOUT_MS = 5000;

type RedemptionGateConfig = {
  url: string;
  sharedSecret: string;
  fingerprintSecret: string;
};

export type RedemptionClaim = {
  fingerprint: string;
  claimId: string;
};

export type RedemptionClaimResult =
  | { status: "claimed"; claim: RedemptionClaim }
  | { status: "used" | "closed" | "busy" | "capacity" };

export type RedemptionGate = {
  claim: (request: Request, recoveryClaimId?: string) => Promise<RedemptionClaimResult>;
  beginReview: (claim: RedemptionClaim) => Promise<void>;
  complete: (claim: RedemptionClaim) => Promise<void>;
  release: (claim: RedemptionClaim) => Promise<void>;
};

export class RedemptionGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RedemptionGateError";
  }
}

function validatedConfig(input: RedemptionGateConfig) {
  let url: URL;
  try {
    url = new URL(input.url.trim());
  } catch {
    throw new RedemptionGateError("Sponsored-audit redemption gate is not configured.");
  }
  const sharedSecret = input.sharedSecret.trim();
  const fingerprintSecret = input.fingerprintSecret.trim();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    sharedSecret.length < 32 ||
    fingerprintSecret.length < 32
  ) {
    throw new RedemptionGateError("Sponsored-audit redemption gate is not configured.");
  }
  return {
    url: url.toString().replace(/\/$/, ""),
    sharedSecret,
    fingerprintSecret,
  };
}

function fingerprint(secret: string, request: Request) {
  const address = clientAddressFromRequest(request);
  if (!address) {
    throw new RedemptionGateError("A trusted visitor address is required for sponsored audits.");
  }
  const userAgent = (request.headers.get("user-agent") ?? "unknown").trim().slice(0, 256);
  const key = createHash("sha256").update(secret, "utf8").digest();
  return createHmac("sha256", key).update(`${address}\n${userAgent}`, "utf8").digest("hex");
}

async function responseBody(response: Response) {
  const text = await readTextUpTo(response.body, MAX_GATE_RESPONSE_BYTES);
  if (text === null) {
    throw new RedemptionGateError("Sponsored-audit redemption gate returned too much data.");
  }
  try {
    return text ? (JSON.parse(text) as unknown) : null;
  } catch {
    throw new RedemptionGateError("Sponsored-audit redemption gate returned invalid data.");
  }
}

export function createRedemptionGate(
  input: RedemptionGateConfig,
  fetchImpl: typeof fetch = fetch,
): RedemptionGate {
  const config = validatedConfig(input);

  async function call(
    action: "claim" | "review" | "complete" | "release",
    body: RedemptionClaim,
    recoveryClaimId?: string,
  ) {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetchImpl(`${config.url}/${action}`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.sharedSecret}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            fingerprint: body.fingerprint,
            claim_id: body.claimId,
            ...(recoveryClaimId ? { recovery_claim_id: recoveryClaimId } : {}),
          }),
          signal: AbortSignal.timeout(GATE_TIMEOUT_MS),
          cache: "no-store",
        });
        if (response.status < 500) return response;
        lastError = new RedemptionGateError(
          "Sponsored-audit redemption gate could not complete the request.",
        );
      } catch (error) {
        lastError = error;
      }
    }
    throw new RedemptionGateError(
      lastError instanceof RedemptionGateError
        ? lastError.message
        : "Sponsored-audit redemption gate could not be reached.",
    );
  }

  return {
    async claim(request, recoveryClaimId) {
      const claim = {
        fingerprint: fingerprint(config.fingerprintSecret, request),
        claimId: randomUUID(),
      };
      const response = await call("claim", claim, recoveryClaimId);
      const payload = (await responseBody(response)) as { status?: unknown } | null;
      if (response.status === 201 && payload?.status === "claimed") {
        return { status: "claimed", claim };
      }
      if (
        response.status === 409 &&
        (payload?.status === "used" || payload?.status === "closed" || payload?.status === "busy")
      ) {
        return { status: payload.status };
      }
      if (response.status === 429 && payload?.status === "capacity") {
        return { status: "capacity" };
      }
      throw new RedemptionGateError("Sponsored-audit eligibility could not be reserved.");
    },

    async beginReview(claim) {
      const response = await call("review", claim);
      if (response.status !== 204) {
        await responseBody(response);
        throw new RedemptionGateError("Sponsored-audit review could not be reserved.");
      }
    },

    async complete(claim) {
      const response = await call("complete", claim);
      if (response.status !== 204) {
        await responseBody(response);
        throw new RedemptionGateError("Sponsored-audit redemption could not be finalized.");
      }
    },

    async release(claim) {
      const response = await call("release", claim);
      if (response.status !== 204) {
        await responseBody(response);
        throw new RedemptionGateError("Sponsored-audit reservation could not be released.");
      }
    },
  };
}
