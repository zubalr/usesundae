import assert from "node:assert/strict";
import test from "node:test";

import {
  sponsoredAuditConfigFromEnv,
  sponsoredAuditPublicConfigFromEnv,
} from "../lib/sponsored/config";

const completeEnv = {
  SPONSORED_AUDIT_ENABLED: "true",
  GEMINI_API_KEY: "gemini-key",
  GEMINI_MODEL: "gemini-3.7-flash",
  TURNSTILE_SECRET_KEY: "turnstile-secret",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "turnstile-site-key",
  SPONSORED_AUDIT_SIGNING_SECRET: "a-sponsored-audit-secret-that-is-long-enough",
  CLOUDFLARE_ACCOUNT_ID: "cloudflare-account",
  CLOUDFLARE_API_TOKEN: "browser-run-token",
  SPONSORED_GATE_URL: "https://sundae-redemption-gate.example.workers.dev",
  SPONSORED_GATE_SHARED_SECRET: "a-gate-shared-secret-that-is-long-enough",
  SUNDAE_APP_ORIGIN: "https://sundae.example/path",
};

test("enables sponsored audits only when every spend and abuse-control dependency exists", () => {
  const config = sponsoredAuditConfigFromEnv(completeEnv);
  assert.ok(config);
  assert.equal(config.allowedOrigin, "https://sundae.example");
  assert.equal(config.gemini.model, "gemini-3.7-flash");
  assert.equal(config.redemption.url, "https://sundae-redemption-gate.example.workers.dev");

  assert.equal(sponsoredAuditConfigFromEnv({ ...completeEnv, SPONSORED_GATE_URL: "" }), null);
  assert.equal(sponsoredAuditConfigFromEnv({ ...completeEnv, SUNDAE_APP_ORIGIN: "" }), null);
  assert.equal(
    sponsoredAuditConfigFromEnv({ ...completeEnv, SUNDAE_APP_ORIGIN: "http://sundae.example" }),
    null,
  );
  assert.equal(
    sponsoredAuditConfigFromEnv({ ...completeEnv, NEXT_PUBLIC_TURNSTILE_SITE_KEY: "" }),
    null,
  );
  assert.equal(
    sponsoredAuditConfigFromEnv({ ...completeEnv, SPONSORED_AUDIT_ENABLED: "false" }),
    null,
  );
  assert.equal(
    sponsoredAuditConfigFromEnv({ ...completeEnv, SPONSORED_AUDIT_ENABLED: undefined }),
    null,
  );
});

test("exposes only the site key to the landing page", () => {
  assert.deepEqual(sponsoredAuditPublicConfigFromEnv(completeEnv), {
    available: true,
    turnstileSiteKey: "turnstile-site-key",
  });
  assert.deepEqual(sponsoredAuditPublicConfigFromEnv({ ...completeEnv, GEMINI_API_KEY: "" }), {
    available: false,
  });
});

test("uses Gemini 3.7 Flash when GEMINI_MODEL is omitted", () => {
  const config = sponsoredAuditConfigFromEnv({ ...completeEnv, GEMINI_MODEL: "" });
  assert.ok(config);
  assert.equal(config.gemini.model, "gemini-3.7-flash");
});
