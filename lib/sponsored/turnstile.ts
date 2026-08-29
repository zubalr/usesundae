import { randomUUID } from "node:crypto";

import { readTextUpTo } from "@/lib/capture/stream";
import { clientAddressFromRequest } from "./client";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_RESPONSE_BYTES = 16_384;
const TURNSTILE_TIMEOUT_MS = 8_000;

type TurnstileConfig = {
  secretKey: string;
  expectedHostname?: string;
};

type TurnstileResponse = {
  success?: unknown;
  hostname?: unknown;
};

export async function verifyTurnstile(
  config: TurnstileConfig,
  token: string,
  request: Request,
  fetchImpl: typeof fetch = fetch,
) {
  const secret = config.secretKey.trim();
  const responseToken = token.trim();
  if (!secret || !responseToken || responseToken.length > 2048) return false;

  const form = new URLSearchParams({
    secret,
    response: responseToken,
    idempotency_key: randomUUID(),
  });
  const remoteAddress = clientAddressFromRequest(request);
  if (remoteAddress) form.set("remoteip", remoteAddress);

  try {
    const response = await fetchImpl(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(TURNSTILE_TIMEOUT_MS)]),
      cache: "no-store",
    });
    const text = await readTextUpTo(response.body, MAX_RESPONSE_BYTES);
    if (!response.ok || text === null) return false;
    const payload = JSON.parse(text) as TurnstileResponse;
    if (payload.success !== true) return false;

    const expected = config.expectedHostname?.trim().toLowerCase();
    if (!expected) return true;
    return typeof payload.hostname === "string" && payload.hostname.toLowerCase() === expected;
  } catch {
    return false;
  }
}
