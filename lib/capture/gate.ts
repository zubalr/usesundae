import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const CAPTURE_GATE_COOKIE = "sundae_capture_gate";
export const CAPTURE_GATE_TTL_SECONDS = 600;

export type CaptureGate = {
  issue: () => string;
  verify: (token: string | undefined) => boolean;
};

type CaptureGateOptions = {
  secret?: string;
  now?: () => number;
};

function signature(key: Buffer, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest("base64url");
}

export function createCaptureGate(options: CaptureGateOptions = {}): CaptureGate {
  const configuredSecret = options.secret?.trim();
  if (configuredSecret && configuredSecret.length < 32) {
    throw new Error("CAPTURE_GATE_SECRET must contain at least 32 characters.");
  }
  const keyMaterial = configuredSecret ? Buffer.from(configuredSecret, "utf8") : randomBytes(32);
  const key = createHash("sha256").update(keyMaterial).digest();
  const now = options.now ?? (() => Date.now());

  return {
    issue() {
      const expiresAt = Math.floor(now() / 1000) + CAPTURE_GATE_TTL_SECONDS;
      const unsigned = `v1.${expiresAt.toString(36)}.${randomBytes(18).toString("base64url")}`;
      return `${unsigned}.${signature(key, unsigned)}`;
    },
    verify(token) {
      if (!token || token.length > 256) return false;
      const parts = token.split(".");
      if (parts.length !== 4 || parts[0] !== "v1") return false;
      const [, rawExpiry, nonce, suppliedSignature] = parts;
      if (
        !rawExpiry ||
        !/^[0-9a-z]+$/.test(rawExpiry) ||
        !nonce ||
        !/^[A-Za-z0-9_-]{24}$/.test(nonce) ||
        !suppliedSignature ||
        !/^[A-Za-z0-9_-]{43}$/.test(suppliedSignature)
      )
        return false;

      const expiresAt = Number.parseInt(rawExpiry, 36);
      if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now() / 1000)) return false;
      const unsigned = `v1.${rawExpiry}.${nonce}`;
      const expected = Buffer.from(signature(key, unsigned), "base64url");
      const supplied = Buffer.from(suppliedSignature, "base64url");
      return expected.length === supplied.length && timingSafeEqual(expected, supplied);
    },
  };
}

export function readCaptureGateCookie(request: Request) {
  const header = request.headers.get("cookie") ?? "";
  if (!header || header.length > 4096) return undefined;
  for (const part of header.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === CAPTURE_GATE_COOKIE) return value.join("=") || undefined;
  }
  return undefined;
}

export function captureGateCookieHeader(token: string, requestUrl: string) {
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `${CAPTURE_GATE_COOKIE}=${token}; Path=/api/capture; Max-Age=${CAPTURE_GATE_TTL_SECONDS}; HttpOnly; SameSite=Strict${secure}`;
}
