import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SPONSORED_AUDIT_COOKIE = "sundae_sponsored_audit";
export const SPONSORED_RECOVERY_COOKIE = "sundae_sponsored_recovery";
const RECEIPT_VERSION = "v1";
const RECEIPT_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
const RECOVERY_MAX_AGE_SECONDS = 60 * 60;
const CLAIM_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function receiptKey(secret: string) {
  if (secret.trim().length < 32) {
    throw new Error("SPONSORED_AUDIT_SIGNING_SECRET must contain at least 32 characters.");
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

function sign(key: Buffer, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest("base64url");
}

function signatureMatches(secret: string, unsigned: string, suppliedSignature: string) {
  const expected = Buffer.from(sign(receiptKey(secret), unsigned), "base64url");
  const supplied = Buffer.from(suppliedSignature, "base64url");
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

function readCookie(request: Request, cookieName: string) {
  const cookie = request.headers.get("cookie") ?? "";
  if (!cookie || cookie.length > 4096) return undefined;
  for (const part of cookie.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === cookieName) return value.join("=") || undefined;
  }
  return undefined;
}

function cookieHeader(
  name: string,
  token: string,
  requestUrl: string,
  path: string,
  maxAge: number,
) {
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `${name}=${token}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

export function createSponsoredAuditReceipt(secret: string) {
  const key = receiptKey(secret);
  const value = `${RECEIPT_VERSION}.redeemed`;
  return `${value}.${sign(key, value)}`;
}

export function verifySponsoredAuditReceipt(secret: string, token: string | undefined) {
  if (!token || token.length > 128) return false;
  const [version, status, suppliedSignature, extra] = token.split(".");
  if (extra || version !== RECEIPT_VERSION || status !== "redeemed" || !suppliedSignature) {
    return false;
  }
  const unsigned = `${version}.${status}`;
  return signatureMatches(secret, unsigned, suppliedSignature);
}

export function readSponsoredAuditReceipt(request: Request) {
  return readCookie(request, SPONSORED_AUDIT_COOKIE);
}

export function sponsoredAuditCookieHeader(token: string, requestUrl: string) {
  return cookieHeader(SPONSORED_AUDIT_COOKIE, token, requestUrl, "/", RECEIPT_MAX_AGE_SECONDS);
}

export function createSponsoredRecoveryReceipt(secret: string, claimId: string, now = Date.now()) {
  if (!CLAIM_ID_PATTERN.test(claimId)) throw new Error("A valid recovery claim is required.");
  const expiresAt = Math.floor(now / 1000) + RECOVERY_MAX_AGE_SECONDS;
  const unsigned = `${RECEIPT_VERSION}.recovery.${claimId}.${expiresAt}`;
  return `${unsigned}.${sign(receiptKey(secret), unsigned)}`;
}

export function readSponsoredRecoveryClaim(secret: string, request: Request, now = Date.now()) {
  const token = readCookie(request, SPONSORED_RECOVERY_COOKIE);
  if (!token || token.length > 256) return undefined;
  const [version, purpose, claimId, rawExpiry, suppliedSignature, extra] = token.split(".");
  if (
    extra ||
    version !== RECEIPT_VERSION ||
    purpose !== "recovery" ||
    !claimId ||
    !CLAIM_ID_PATTERN.test(claimId) ||
    !/^\d{10}$/.test(rawExpiry ?? "") ||
    !suppliedSignature
  ) {
    return undefined;
  }
  const expiresAt = Number(rawExpiry);
  const unsigned = `${version}.${purpose}.${claimId}.${rawExpiry}`;
  return expiresAt >= Math.floor(now / 1000) &&
    signatureMatches(secret, unsigned, suppliedSignature)
    ? claimId
    : undefined;
}

export function sponsoredRecoveryCookieHeader(token: string, requestUrl: string) {
  return cookieHeader(
    SPONSORED_RECOVERY_COOKIE,
    token,
    requestUrl,
    "/api/sponsored-audit",
    RECOVERY_MAX_AGE_SECONDS,
  );
}
