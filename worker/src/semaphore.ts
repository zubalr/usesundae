import { DurableObject } from "cloudflare:workers";

import { LEASE_TTL_MS, MAX_CONCURRENT_BROWSERS } from "../../lib/capture/worker-protocol";

export type AcquireResult =
  | { ok: true; id: string; expiresAt: number }
  | { ok: false; retryAfterSeconds: number };

export class BrowserSemaphore extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS leases (
          id TEXT PRIMARY KEY,
          expires_at INTEGER NOT NULL
        )
      `);
    });
  }

  #sweep(now: number) {
    this.ctx.storage.sql.exec("DELETE FROM leases WHERE expires_at <= ?", now);
  }

  async #scheduleAlarm() {
    const next = this.ctx.storage.sql
      .exec<{ expires_at: number | null }>("SELECT MIN(expires_at) AS expires_at FROM leases")
      .one();
    if (next.expires_at == null) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.ctx.storage.setAlarm(next.expires_at);
  }

  async acquire(): Promise<AcquireResult> {
    const now = Date.now();
    this.#sweep(now);
    const count = this.ctx.storage.sql
      .exec<{ n: number }>("SELECT COUNT(*) AS n FROM leases")
      .one().n;
    if (count >= MAX_CONCURRENT_BROWSERS) {
      const next = this.ctx.storage.sql
        .exec<{ expires_at: number | null }>("SELECT MIN(expires_at) AS expires_at FROM leases")
        .one();
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(((next.expires_at ?? now + 1000) - now) / 1000),
      );
      return { ok: false, retryAfterSeconds };
    }
    const id = crypto.randomUUID();
    const expiresAt = now + LEASE_TTL_MS;
    this.ctx.storage.sql.exec("INSERT INTO leases (id, expires_at) VALUES (?, ?)", id, expiresAt);
    await this.#scheduleAlarm();
    return { ok: true, id, expiresAt };
  }

  async release(id: string): Promise<void> {
    this.ctx.storage.sql.exec("DELETE FROM leases WHERE id = ?", id);
    await this.#scheduleAlarm();
  }

  async alarm(): Promise<void> {
    this.#sweep(Date.now());
    await this.#scheduleAlarm();
  }
}
