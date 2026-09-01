import assert from "node:assert/strict";
import test from "node:test";

import {
  releaseLease,
  retryAfterSeconds,
  sweepExpiredLeases,
  tryAcquireLease,
  type BrowserLease,
} from "../lib/capture/browser-leases";
import { LEASE_TTL_MS, MAX_CONCURRENT_BROWSERS } from "../lib/capture/worker-protocol";

test("the browser cap is the named constant 10", () => {
  assert.equal(MAX_CONCURRENT_BROWSERS, 10);
  assert.equal(LEASE_TTL_MS, 90_000);
});

test("the eleventh concurrent acquire is refused with Retry-After", () => {
  const now = 1_000_000;
  let leases: BrowserLease[] = [];
  for (let index = 0; index < MAX_CONCURRENT_BROWSERS; index += 1) {
    const result = tryAcquireLease(leases, now, `lease-${index}`);
    assert.equal(result.ok, true);
    leases = result.leases;
  }

  const overflow = tryAcquireLease(leases, now, "lease-overflow");
  assert.equal(overflow.ok, false);
  if (overflow.ok) throw new Error("expected the cap to refuse the eleventh lease");
  assert.equal(overflow.retryAfterSeconds, 90);
  assert.equal(overflow.leases.length, MAX_CONCURRENT_BROWSERS);
});

test("an unreleased lease is reclaimed after it expires", () => {
  const now = 5_000_000;
  let leases: BrowserLease[] = [];
  for (let index = 0; index < MAX_CONCURRENT_BROWSERS; index += 1) {
    const acquired = tryAcquireLease(leases, now, `abandoned-${index}`);
    assert.equal(acquired.ok, true);
    if (!acquired.ok) throw new Error("expected the first leases");
    leases = acquired.leases;
  }

  const stillHeld = tryAcquireLease(leases, now + LEASE_TTL_MS - 1, "next");
  assert.equal(stillHeld.ok, false);

  const afterExpiry = tryAcquireLease(leases, now + LEASE_TTL_MS, "next");
  assert.equal(afterExpiry.ok, true);
  if (!afterExpiry.ok) throw new Error("expected expiry to free the slot");
  assert.equal(afterExpiry.leases.length, 1);
  assert.equal(afterExpiry.lease.id, "next");
});

test("release frees a slot immediately", () => {
  const now = 8_000_000;
  const acquired = tryAcquireLease([], now, "held");
  assert.equal(acquired.ok, true);
  if (!acquired.ok) throw new Error("expected a lease");
  const remaining = releaseLease(acquired.leases, "held");
  assert.deepEqual(remaining, []);
  const next = tryAcquireLease(remaining, now, "replacement");
  assert.equal(next.ok, true);
});

test("sweep drops only expired leases and Retry-After uses the soonest expiry", () => {
  const now = 10_000_000;
  const leases: BrowserLease[] = [
    { id: "stale", expiresAt: now },
    { id: "live", expiresAt: now + 4_000 },
  ];
  assert.deepEqual(sweepExpiredLeases(leases, now), [{ id: "live", expiresAt: now + 4_000 }]);
  assert.equal(retryAfterSeconds([{ id: "live", expiresAt: now + 4_000 }], now), 4);
});
