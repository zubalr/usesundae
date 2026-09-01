import { LEASE_TTL_MS, MAX_CONCURRENT_BROWSERS } from "./worker-protocol";

export type BrowserLease = {
  id: string;
  expiresAt: number;
};

export function sweepExpiredLeases(leases: BrowserLease[], now: number): BrowserLease[] {
  return leases.filter((lease) => lease.expiresAt > now);
}

export function retryAfterSeconds(leases: BrowserLease[], now: number): number {
  const nextExpiry = leases.reduce(
    (earliest, lease) => Math.min(earliest, lease.expiresAt),
    Number.POSITIVE_INFINITY,
  );
  if (!Number.isFinite(nextExpiry)) return 1;
  return Math.max(1, Math.ceil((nextExpiry - now) / 1000));
}

export function tryAcquireLease(
  leases: BrowserLease[],
  now: number,
  id: string,
):
  | { ok: true; leases: BrowserLease[]; lease: BrowserLease }
  | { ok: false; leases: BrowserLease[]; retryAfterSeconds: number } {
  const active = sweepExpiredLeases(leases, now);
  if (active.length >= MAX_CONCURRENT_BROWSERS) {
    return { ok: false, leases: active, retryAfterSeconds: retryAfterSeconds(active, now) };
  }
  const lease = { id, expiresAt: now + LEASE_TTL_MS };
  return { ok: true, leases: [...active, lease], lease };
}

export function releaseLease(leases: BrowserLease[], id: string): BrowserLease[] {
  return leases.filter((lease) => lease.id !== id);
}
