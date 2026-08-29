const CLAIM_LEASE_MS = 5 * 60 * 1000;
const REDEMPTION_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 512;
const BUDGET_KEY = "budget";
const GLOBAL_GATE_NAME = "sponsored-audit-global-v1";
const DEFAULT_DAILY_ATTEMPTS = 50;
const DEFAULT_AUDIT_JOBS_IN_FLIGHT = 3;

function json(payload, status) {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function noContent() {
  return new Response(null, {
    status: 204,
    headers: { "cache-control": "no-store" },
  });
}

async function secureEqual(left, right) {
  if (!left || !right) return false;
  const encoder = new TextEncoder();
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

async function readClaim(request) {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return null;
  try {
    const value = JSON.parse(text);
    if (
      !value ||
      typeof value !== "object" ||
      !/^[a-f0-9]{64}$/.test(value.fingerprint) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value.claim_id,
      ) ||
      (value.recovery_claim_id !== undefined &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          value.recovery_claim_id,
        ))
    ) {
      return null;
    }
    return {
      fingerprint: value.fingerprint,
      claimId: value.claim_id,
      recoveryClaimId: value.recovery_claim_id,
    };
  } catch {
    return null;
  }
}

function redemptionKey(fingerprint) {
  return `redemption:${fingerprint}`;
}

function positiveLimit(value, fallback, maximum) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function currentBudget(value, now) {
  const day = new Date(now).toISOString().slice(0, 10);
  const storedInFlight =
    value?.inFlight && typeof value.inFlight === "object" ? value.inFlight : {};
  const inFlight = Object.fromEntries(
    Object.entries(storedInFlight).filter(
      ([claimId, expiresAt]) =>
        /^[0-9a-f-]{36}$/i.test(claimId) && typeof expiresAt === "number" && expiresAt > now,
    ),
  );
  const attempts = value?.day === day && Number.isSafeInteger(value.attempts) ? value.attempts : 0;
  return { day, attempts: Math.max(0, attempts), inFlight };
}

function removeInFlight(budget, claimId) {
  const inFlight = { ...budget.inFlight };
  delete inFlight[claimId];
  return { ...budget, inFlight };
}

export class RedemptionGate {
  constructor(state, environment = {}) {
    this.state = state;
    this.dailyLimit = positiveLimit(
      environment.SPONSORED_MAX_DAILY_ATTEMPTS,
      DEFAULT_DAILY_ATTEMPTS,
      1_000,
    );
    this.inFlightLimit = positiveLimit(
      environment.SPONSORED_MAX_IN_FLIGHT,
      DEFAULT_AUDIT_JOBS_IN_FLIGHT,
      10,
    );
  }

  async claim(claim) {
    const now = Date.now();
    let status = "claimed";
    await this.state.storage.transaction(async (storage) => {
      const key = redemptionKey(claim.fingerprint);
      const [storedRedemption, storedBudget] = await Promise.all([
        storage.get(key),
        storage.get(BUDGET_KEY),
      ]);
      let current = storedRedemption;
      let budget = currentBudget(storedBudget, now);
      if (
        claim.recoveryClaimId &&
        current?.claimId === claim.recoveryClaimId &&
        (current.state === "pending" || current.state === "reviewing")
      ) {
        budget = removeInFlight(budget, current.claimId);
        await storage.delete(key);
        current = undefined;
      }
      if (current?.state === "used" && current.expiresAt > now) {
        status = "used";
        await storage.put(BUDGET_KEY, budget);
        return;
      }
      if (current?.state === "closed" && current.expiresAt > now) {
        status = "closed";
        await storage.put(BUDGET_KEY, budget);
        return;
      }
      if (current?.state === "pending" && current.expiresAt > now) {
        status = current.claimId === claim.claimId ? "claimed" : "busy";
        await storage.put(BUDGET_KEY, budget);
        return;
      }
      if (current?.state === "reviewing" && current.expiresAt > now) {
        status = "busy";
        await storage.put(BUDGET_KEY, budget);
        return;
      }
      if (current?.state === "pending") {
        budget = removeInFlight(budget, current.claimId);
        await storage.delete(key);
      }
      if (current?.state === "reviewing") {
        budget = removeInFlight(budget, current.claimId);
        await storage.put(key, {
          state: "closed",
          claimId: current.claimId,
          expiresAt: now + REDEMPTION_TTL_MS,
        });
        await storage.put(BUDGET_KEY, budget);
        status = "closed";
        return;
      }
      if (
        budget.attempts >= this.dailyLimit ||
        Object.keys(budget.inFlight).length >= this.inFlightLimit
      ) {
        status = "capacity";
        await storage.put(BUDGET_KEY, budget);
        return;
      }
      const expiresAt = now + CLAIM_LEASE_MS;
      await storage.put(key, {
        state: "pending",
        claimId: claim.claimId,
        expiresAt,
      });
      await storage.put(BUDGET_KEY, {
        ...budget,
        attempts: budget.attempts + 1,
        inFlight: { ...budget.inFlight, [claim.claimId]: expiresAt },
      });
    });
    const responseStatus = status === "claimed" ? 201 : status === "capacity" ? 429 : 409;
    return json({ status }, responseStatus);
  }

  async beginReview(claim) {
    const now = Date.now();
    let reserved = false;
    await this.state.storage.transaction(async (storage) => {
      const key = redemptionKey(claim.fingerprint);
      const [current, storedBudget] = await Promise.all([
        storage.get(key),
        storage.get(BUDGET_KEY),
      ]);
      if (current?.state === "reviewing" && current.claimId === claim.claimId) {
        reserved = true;
        return;
      }
      if (current?.state !== "pending" || current.claimId !== claim.claimId) return;

      const expiresAt = now + CLAIM_LEASE_MS;
      const budget = currentBudget(storedBudget, now);
      await storage.put(key, { state: "reviewing", claimId: claim.claimId, expiresAt });
      await storage.put(BUDGET_KEY, {
        ...budget,
        inFlight: { ...budget.inFlight, [claim.claimId]: expiresAt },
      });
      reserved = true;
    });
    return reserved ? noContent() : json({ status: "claim_invalid" }, 409);
  }

  async complete(claim) {
    const now = Date.now();
    let completed = false;
    await this.state.storage.transaction(async (storage) => {
      const key = redemptionKey(claim.fingerprint);
      const [current, storedBudget] = await Promise.all([
        storage.get(key),
        storage.get(BUDGET_KEY),
      ]);
      const budget = removeInFlight(currentBudget(storedBudget, now), claim.claimId);
      if (current?.state === "used" && current.claimId === claim.claimId) {
        completed = true;
        await storage.put(BUDGET_KEY, budget);
        return;
      }
      if (current?.state !== "reviewing" || current.claimId !== claim.claimId) {
        return;
      }
      await storage.put(key, {
        state: "used",
        claimId: claim.claimId,
        expiresAt: now + REDEMPTION_TTL_MS,
      });
      await storage.put(BUDGET_KEY, budget);
      completed = true;
    });
    return completed ? noContent() : json({ status: "claim_invalid" }, 409);
  }

  async release(claim) {
    const now = Date.now();
    let released = false;
    await this.state.storage.transaction(async (storage) => {
      const key = redemptionKey(claim.fingerprint);
      const [current, storedBudget] = await Promise.all([
        storage.get(key),
        storage.get(BUDGET_KEY),
      ]);
      const budget = removeInFlight(currentBudget(storedBudget, now), claim.claimId);
      if (!current) {
        released = true;
        await storage.put(BUDGET_KEY, budget);
        return;
      }
      if (
        (current.state === "pending" || current.state === "reviewing") &&
        current.claimId === claim.claimId
      ) {
        await storage.delete(key);
        await storage.put(BUDGET_KEY, budget);
        released = true;
      }
    });
    return released ? noContent() : json({ status: "claim_invalid" }, 409);
  }

  async fetch(request) {
    const claim = await readClaim(request);
    if (!claim) return json({ status: "invalid_request" }, 400);
    const action = new URL(request.url).pathname;
    if (action === "/claim") return this.claim(claim);
    if (action === "/review") return this.beginReview(claim);
    if (action === "/complete") return this.complete(claim);
    if (action === "/release") return this.release(claim);
    return json({ status: "not_found" }, 404);
  }
}

export default {
  async fetch(request, environment) {
    if (request.method !== "POST") return json({ status: "method_not_allowed" }, 405);
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!(await secureEqual(token, environment.SPONSORED_GATE_SHARED_SECRET))) {
      return json({ status: "unauthorized" }, 401);
    }

    const claim = await readClaim(request);
    if (!claim) return json({ status: "invalid_request" }, 400);
    const gate = environment.REDEMPTION_GATE.getByName(GLOBAL_GATE_NAME);
    return gate.fetch(
      new Request(`https://redemption-gate.internal${new URL(request.url).pathname}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fingerprint: claim.fingerprint,
          claim_id: claim.claimId,
          ...(claim.recoveryClaimId ? { recovery_claim_id: claim.recoveryClaimId } : {}),
        }),
      }),
    );
  },
};
