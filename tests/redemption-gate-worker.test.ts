import assert from "node:assert/strict";
import test from "node:test";

class MemoryStorage {
  values = new Map<string, unknown>();

  async transaction<T>(work: (storage: MemoryStorage) => Promise<T>) {
    return work(this);
  }

  async get(key: string) {
    return this.values.get(key);
  }

  async put(key: string, value: unknown) {
    this.values.set(key, value);
  }

  async delete(key: string) {
    this.values.delete(key);
  }
}

type Gate = { fetch: (request: Request) => Promise<Response> };
type GateConstructor = new (
  state: { storage: MemoryStorage },
  environment?: Record<string, string>,
) => Gate;

async function workerModule() {
  const workerUrl = new URL("../cloudflare/redemption-gate/worker.mjs", import.meta.url).href;
  return (await import(workerUrl)) as {
    RedemptionGate: GateConstructor;
    default: {
      fetch: (request: Request, environment: Record<string, unknown>) => Promise<Response>;
    };
  };
}

async function newGate(environment: Record<string, string> = {}) {
  const module = await workerModule();
  return new module.RedemptionGate({ storage: new MemoryStorage() }, environment);
}

function gateRequest(
  action: string,
  claimId: string,
  options: { fingerprint?: string; recoveryClaimId?: string } = {},
) {
  return new Request(`https://redemption-gate.internal/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fingerprint: options.fingerprint ?? "a".repeat(64),
      claim_id: claimId,
      ...(options.recoveryClaimId ? { recovery_claim_id: options.recoveryClaimId } : {}),
    }),
  });
}

function numberedClaimId(index: number) {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

test("serializes one pending claim and one completed redemption", async () => {
  const gate = await newGate();
  const firstId = "3d594650-3436-4f21-9734-7b0c2ef5af76";
  const secondId = "481b2e52-b733-4a0b-88bf-2ba2addc2f72";

  assert.equal((await gate.fetch(gateRequest("claim", firstId))).status, 201);
  assert.equal((await gate.fetch(gateRequest("claim", firstId))).status, 201);
  const busy = await gate.fetch(gateRequest("claim", secondId));
  assert.equal(busy.status, 409);
  assert.deepEqual(await busy.json(), { status: "busy" });

  assert.equal((await gate.fetch(gateRequest("complete", firstId))).status, 409);
  assert.equal((await gate.fetch(gateRequest("review", firstId))).status, 204);
  assert.equal((await gate.fetch(gateRequest("review", firstId))).status, 204);
  assert.equal((await gate.fetch(gateRequest("complete", firstId))).status, 204);
  assert.equal((await gate.fetch(gateRequest("complete", firstId))).status, 204);
  const used = await gate.fetch(gateRequest("claim", secondId));
  assert.equal(used.status, 409);
  assert.deepEqual(await used.json(), { status: "used" });
});

test("releasing a matching pending claim restores eligibility", async () => {
  const gate = await newGate();
  const firstId = "3d594650-3436-4f21-9734-7b0c2ef5af76";
  const secondId = "481b2e52-b733-4a0b-88bf-2ba2addc2f72";

  assert.equal((await gate.fetch(gateRequest("claim", firstId))).status, 201);
  assert.equal((await gate.fetch(gateRequest("release", firstId))).status, 204);
  assert.equal((await gate.fetch(gateRequest("claim", secondId))).status, 201);
});

test("releasing a matching review reservation restores eligibility", async () => {
  const gate = await newGate();
  const firstId = "3d594650-3436-4f21-9734-7b0c2ef5af76";
  const secondId = "481b2e52-b733-4a0b-88bf-2ba2addc2f72";

  assert.equal((await gate.fetch(gateRequest("claim", firstId))).status, 201);
  assert.equal((await gate.fetch(gateRequest("review", firstId))).status, 204);
  assert.equal((await gate.fetch(gateRequest("release", firstId))).status, 204);
  assert.equal((await gate.fetch(gateRequest("claim", secondId))).status, 201);
});

test("an unresolved expired claim reopens eligibility without issuing a success receipt", async () => {
  const originalNow = Date.now;
  let now = 1_788_000_000_000;
  Date.now = () => now;
  try {
    const gate = await newGate();
    const firstId = "3d594650-3436-4f21-9734-7b0c2ef5af76";
    const secondId = "481b2e52-b733-4a0b-88bf-2ba2addc2f72";

    assert.equal((await gate.fetch(gateRequest("claim", firstId))).status, 201);
    now += 16 * 60 * 1000;
    const recovered = await gate.fetch(gateRequest("claim", secondId));
    assert.equal(recovered.status, 201);
    assert.deepEqual(await recovered.json(), { status: "claimed" });
    assert.equal((await gate.fetch(gateRequest("complete", firstId))).status, 409);
  } finally {
    Date.now = originalNow;
  }
});

test("an expired review reservation becomes closed after ambiguous settlement", async () => {
  const originalNow = Date.now;
  let now = 1_788_000_000_000;
  Date.now = () => now;
  try {
    const gate = await newGate();
    const firstId = "3d594650-3436-4f21-9734-7b0c2ef5af76";
    const secondId = "481b2e52-b733-4a0b-88bf-2ba2addc2f72";

    assert.equal((await gate.fetch(gateRequest("claim", firstId))).status, 201);
    assert.equal((await gate.fetch(gateRequest("review", firstId))).status, 204);
    now += 6 * 60 * 1000;
    const closed = await gate.fetch(gateRequest("claim", secondId));
    assert.equal(closed.status, 409);
    assert.deepEqual(await closed.json(), { status: "closed" });
  } finally {
    Date.now = originalNow;
  }
});

test("a signed-server recovery id reopens the exact failed review reservation", async () => {
  const originalNow = Date.now;
  let now = 1_788_000_000_000;
  Date.now = () => now;
  try {
    const gate = await newGate();
    const firstId = "3d594650-3436-4f21-9734-7b0c2ef5af76";
    const secondId = "481b2e52-b733-4a0b-88bf-2ba2addc2f72";

    assert.equal((await gate.fetch(gateRequest("claim", firstId))).status, 201);
    assert.equal((await gate.fetch(gateRequest("review", firstId))).status, 204);
    now += 6 * 60 * 1000;
    const recovered = await gate.fetch(
      gateRequest("claim", secondId, { recoveryClaimId: firstId }),
    );
    assert.equal(recovered.status, 201);
    assert.deepEqual(await recovered.json(), { status: "claimed" });
  } finally {
    Date.now = originalNow;
  }
});

test("enforces one global in-flight ceiling across different fingerprints", async () => {
  const gate = await newGate({
    SPONSORED_MAX_DAILY_ATTEMPTS: "10",
    SPONSORED_MAX_IN_FLIGHT: "1",
  });
  const firstId = "3d594650-3436-4f21-9734-7b0c2ef5af76";
  const secondId = "481b2e52-b733-4a0b-88bf-2ba2addc2f72";

  assert.equal((await gate.fetch(gateRequest("claim", firstId))).status, 201);
  const secondFingerprint = gateRequest("claim", secondId, { fingerprint: "b".repeat(64) });
  const capacity = await gate.fetch(secondFingerprint);
  assert.equal(capacity.status, 429);
  assert.deepEqual(await capacity.json(), { status: "capacity" });
});

test("defaults to three full sponsored audit jobs in flight globally", async () => {
  const gate = await newGate();

  for (let index = 0; index < 3; index += 1) {
    const fingerprint = "abcdef"[index]?.repeat(64);
    assert.ok(fingerprint);
    assert.equal(
      (await gate.fetch(gateRequest("claim", numberedClaimId(index), { fingerprint }))).status,
      201,
    );
  }

  const capacity = await gate.fetch(
    gateRequest("claim", numberedClaimId(3), { fingerprint: "d".repeat(64) }),
  );
  assert.equal(capacity.status, 429);
  assert.deepEqual(await capacity.json(), { status: "capacity" });
});

test("defaults to fifty sponsored audit attempts per UTC day globally", async () => {
  const gate = await newGate();
  const fingerprint = "e".repeat(64);

  for (let index = 0; index < 50; index += 1) {
    const claimId = numberedClaimId(index);
    assert.equal((await gate.fetch(gateRequest("claim", claimId, { fingerprint }))).status, 201);
    assert.equal((await gate.fetch(gateRequest("release", claimId, { fingerprint }))).status, 204);
  }

  const capacity = await gate.fetch(gateRequest("claim", numberedClaimId(50), { fingerprint }));
  assert.equal(capacity.status, 429);
  assert.deepEqual(await capacity.json(), { status: "capacity" });
});

test("counts sponsored audit attempts against a durable UTC-day budget even after release", async () => {
  const gate = await newGate({
    SPONSORED_MAX_DAILY_ATTEMPTS: "1",
    SPONSORED_MAX_IN_FLIGHT: "2",
  });
  const firstId = "3d594650-3436-4f21-9734-7b0c2ef5af76";
  const secondId = "481b2e52-b733-4a0b-88bf-2ba2addc2f72";

  assert.equal((await gate.fetch(gateRequest("claim", firstId))).status, 201);
  assert.equal((await gate.fetch(gateRequest("release", firstId))).status, 204);
  const capacity = await gate.fetch(gateRequest("claim", secondId));
  assert.equal(capacity.status, 429);
  assert.deepEqual(await capacity.json(), { status: "capacity" });
});

test("routes every fingerprint through the same global Durable Object", async () => {
  const module = await workerModule();
  const names: string[] = [];
  const response = await module.default.fetch(
    gateRequest("claim", "3d594650-3436-4f21-9734-7b0c2ef5af76"),
    {
      SPONSORED_GATE_SHARED_SECRET: "a".repeat(32),
      REDEMPTION_GATE: {
        getByName(name: string) {
          names.push(name);
          return { fetch: async () => Response.json({ status: "claimed" }, { status: 201 }) };
        },
      },
    },
  );

  assert.equal(response.status, 401);
  assert.equal(names.length, 0);

  const authorized = gateRequest("claim", "3d594650-3436-4f21-9734-7b0c2ef5af76");
  authorized.headers.set("authorization", `Bearer ${"a".repeat(32)}`);
  assert.equal(
    (
      await module.default.fetch(authorized, {
        SPONSORED_GATE_SHARED_SECRET: "a".repeat(32),
        REDEMPTION_GATE: {
          getByName(name: string) {
            names.push(name);
            return { fetch: async () => Response.json({ status: "claimed" }, { status: 201 }) };
          },
        },
      })
    ).status,
    201,
  );
  assert.deepEqual(names, ["sponsored-audit-global-v1"]);
});

test("rejects malformed claims before touching durable state", async () => {
  const gate = await newGate();
  const response = await gate.fetch(
    new Request("https://redemption-gate.internal/claim", {
      method: "POST",
      body: JSON.stringify({ fingerprint: "raw-address", claim_id: "not-a-uuid" }),
    }),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { status: "invalid_request" });
});
