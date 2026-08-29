import assert from "node:assert/strict";
import test from "node:test";

import { createRedemptionGate } from "../lib/sponsored/redemption";

const config = {
  url: "https://sundae-redemption-gate.example.workers.dev",
  sharedSecret: "a-gate-shared-secret-that-is-long-enough",
  fingerprintSecret: "a-sponsored-audit-secret-that-is-long-enough",
};

function visitorRequest() {
  return new Request("https://sundae.example/api/sponsored-audit", {
    headers: {
      "x-vercel-forwarded-for": "198.51.100.44",
      "user-agent": "Sundae test browser",
    },
  });
}

test("claims a one-way browser-network fingerprint without sending raw visitor data", async () => {
  let endpoint = "";
  let authorization = "";
  let body = "";
  const fetchImpl: typeof fetch = async (input, init) => {
    endpoint = String(input);
    authorization = new Headers(init?.headers).get("authorization") ?? "";
    body = String(init?.body);
    return Response.json({ status: "claimed" }, { status: 201 });
  };
  const gate = createRedemptionGate(config, fetchImpl);

  const result = await gate.claim(visitorRequest());

  assert.equal(result.status, "claimed");
  assert.equal(endpoint, `${config.url}/claim`);
  assert.equal(authorization, `Bearer ${config.sharedSecret}`);
  assert.doesNotMatch(body, /198\.51\.100\.44|Sundae test browser/);
  assert.match(body, /"fingerprint":"[a-f0-9]{64}"/);
  assert.match(body, /"claim_id":"[0-9a-f-]{36}"/);
});

test("completes and releases only the exact returned claim", async () => {
  const actions: Array<{ action: string; body: Record<string, string> }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const action = new URL(String(input)).pathname.slice(1);
    const body = JSON.parse(String(init?.body)) as Record<string, string>;
    actions.push({ action, body });
    return action === "claim"
      ? Response.json({ status: "claimed" }, { status: 201 })
      : new Response(null, { status: 204 });
  };
  const gate = createRedemptionGate(config, fetchImpl);
  const result = await gate.claim(visitorRequest());
  assert.equal(result.status, "claimed");
  if (result.status !== "claimed") return;

  await gate.beginReview(result.claim);
  await gate.complete(result.claim);
  await gate.release(result.claim);

  assert.deepEqual(
    actions.map(({ action }) => action),
    ["claim", "review", "complete", "release"],
  );
  assert.deepEqual(actions[1]?.body, actions[0]?.body);
  assert.deepEqual(actions[2]?.body, actions[0]?.body);
  assert.deepEqual(actions[3]?.body, actions[0]?.body);
});

test("forwards only a server-validated recovery claim identifier", async () => {
  let body: Record<string, string> = {};
  const gate = createRedemptionGate(config, async (_input, init) => {
    body = JSON.parse(String(init?.body)) as Record<string, string>;
    return Response.json({ status: "claimed" }, { status: 201 });
  });
  const recoveryClaimId = "481b2e52-b733-4a0b-88bf-2ba2addc2f72";

  assert.equal((await gate.claim(visitorRequest(), recoveryClaimId)).status, "claimed");
  assert.equal(body.recovery_claim_id, recoveryClaimId);
});

test("surfaces used, closed, and busy gate decisions without paid work", async () => {
  for (const status of ["used", "closed", "busy"] as const) {
    const gate = createRedemptionGate(config, async () =>
      Response.json({ status }, { status: 409 }),
    );
    assert.deepEqual(await gate.claim(visitorRequest()), { status });
  }
});

test("surfaces the global capacity ceiling without paid work", async () => {
  const gate = createRedemptionGate(config, async () =>
    Response.json({ status: "capacity" }, { status: 429 }),
  );
  assert.deepEqual(await gate.claim(visitorRequest()), { status: "capacity" });
});

test("retries an idempotent claim once with the same claim id", async () => {
  const bodies: string[] = [];
  const gate = createRedemptionGate(config, async (_input, init) => {
    bodies.push(String(init?.body));
    return bodies.length === 1
      ? Response.json({ status: "temporary" }, { status: 503 })
      : Response.json({ status: "claimed" }, { status: 201 });
  });

  assert.equal((await gate.claim(visitorRequest())).status, "claimed");
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
});

test("fails closed without Vercel's authenticated visitor address", async () => {
  const gate = createRedemptionGate(config, async () => {
    throw new Error("network must not run");
  });

  await assert.rejects(
    gate.claim(
      new Request("https://sundae.example/api/sponsored-audit", {
        headers: { "x-forwarded-for": "198.51.100.44" },
      }),
    ),
    /trusted visitor address/i,
  );
});
