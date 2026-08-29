import assert from "node:assert/strict";
import test from "node:test";

import { verifyTurnstile } from "../lib/sponsored/turnstile";

const providerFailure: typeof fetch = async () => Response.json({ success: false });
const hostnameMismatch: typeof fetch = async () =>
  Response.json({ success: true, hostname: "attacker.example" });

test("verifies a single-use Turnstile token with the visitor network address", async () => {
  let submitted = "";
  const fetchImpl: typeof fetch = async (input, init) => {
    assert.equal(String(input), "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    submitted = String(init?.body);
    return Response.json({ success: true, hostname: "sundae.example" });
  };
  const request = new Request("https://sundae.example/api/sponsored-audit", {
    headers: { "x-vercel-forwarded-for": "203.0.113.8" },
  });

  const verified = await verifyTurnstile(
    { secretKey: "turnstile-secret", expectedHostname: "sundae.example" },
    "turnstile-response-token",
    request,
    fetchImpl,
  );

  assert.equal(verified, true);
  const form = new URLSearchParams(submitted);
  assert.equal(form.get("secret"), "turnstile-secret");
  assert.equal(form.get("response"), "turnstile-response-token");
  assert.equal(form.get("remoteip"), "203.0.113.8");
  assert.match(form.get("idempotency_key") ?? "", /^[0-9a-f-]{36}$/);
});

test("fails closed for a provider error or hostname mismatch", async () => {
  const request = new Request("https://sundae.example/api/sponsored-audit");

  assert.equal(
    await verifyTurnstile(
      { secretKey: "turnstile-secret", expectedHostname: "sundae.example" },
      "token",
      request,
      providerFailure,
    ),
    false,
  );
  assert.equal(
    await verifyTurnstile(
      { secretKey: "turnstile-secret", expectedHostname: "sundae.example" },
      "token",
      request,
      hostnameMismatch,
    ),
    false,
  );
});
