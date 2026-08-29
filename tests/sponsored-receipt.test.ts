import assert from "node:assert/strict";
import test from "node:test";

import {
  createSponsoredRecoveryReceipt,
  readSponsoredRecoveryClaim,
  SPONSORED_RECOVERY_COOKIE,
  sponsoredRecoveryCookieHeader,
} from "../lib/sponsored/receipt";

const secret = "a-sponsored-audit-secret-that-is-long-enough";
const claimId = "3d594650-3436-4f21-9734-7b0c2ef5af76";
const now = 1_788_000_000_000;

function requestWithRecovery(token: string) {
  return new Request("https://sundae.example/api/sponsored-audit", {
    headers: { cookie: `${SPONSORED_RECOVERY_COOKIE}=${token}` },
  });
}

test("binds a recovery receipt to one claim and one-hour lifetime", () => {
  const token = createSponsoredRecoveryReceipt(secret, claimId, now);
  assert.equal(readSponsoredRecoveryClaim(secret, requestWithRecovery(token), now), claimId);
  assert.equal(
    readSponsoredRecoveryClaim(secret, requestWithRecovery(token), now + 60 * 60 * 1000 + 1_000),
    undefined,
  );
  assert.equal(
    readSponsoredRecoveryClaim(`${secret}-different`, requestWithRecovery(token), now),
    undefined,
  );
});

test("scopes the recovery cookie to the sponsored endpoint without marking success", () => {
  const token = createSponsoredRecoveryReceipt(secret, claimId, now);
  const header = sponsoredRecoveryCookieHeader(token, "https://sundae.example/api/sponsored-audit");

  assert.match(header, new RegExp(`^${SPONSORED_RECOVERY_COOKIE}=`));
  assert.match(header, /Path=\/api\/sponsored-audit/);
  assert.match(header, /Max-Age=3600/);
  assert.match(header, /HttpOnly/);
  assert.match(header, /Secure/);
});
