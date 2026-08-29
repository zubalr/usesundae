type Environment = NodeJS.ProcessEnv | Record<string, string | undefined>;

export type SponsoredAuditConfig = {
  allowedOrigin: string;
  receiptSecret: string;
  capture: {
    accountId: string;
    apiToken: string;
  };
  redemption: {
    url: string;
    sharedSecret: string;
    fingerprintSecret: string;
  };
  turnstile: {
    secretKey: string;
  };
  gemini: {
    apiKey: string;
    model: string;
  };
};

export type SponsoredAuditPublicConfig =
  | { available: false }
  | { available: true; turnstileSiteKey: string };

function value(env: Environment, name: string) {
  return env[name]?.trim() ?? "";
}

function configuredOrigin(env: Environment) {
  const candidate = value(env, "SUNDAE_APP_ORIGIN");
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" ? parsed.origin : null;
  } catch {
    return null;
  }
}

function configuredHttpsUrl(env: Environment, name: string) {
  const candidate = value(env, name);
  if (!candidate) return "";
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password
      ? parsed.toString().replace(/\/$/, "")
      : "";
  } catch {
    return "";
  }
}

export function sponsoredAuditConfigFromEnv(
  env: Environment = process.env,
): SponsoredAuditConfig | null {
  if (value(env, "SPONSORED_AUDIT_ENABLED") !== "true") return null;
  const allowedOrigin = configuredOrigin(env);
  const receiptSecret = value(env, "SPONSORED_AUDIT_SIGNING_SECRET");
  const accountId = value(env, "CLOUDFLARE_ACCOUNT_ID");
  const captureToken = value(env, "CLOUDFLARE_API_TOKEN");
  const gateUrl = configuredHttpsUrl(env, "SPONSORED_GATE_URL");
  const gateSecret = value(env, "SPONSORED_GATE_SHARED_SECRET");
  const turnstileSecret = value(env, "TURNSTILE_SECRET_KEY");
  const turnstileSiteKey = value(env, "NEXT_PUBLIC_TURNSTILE_SITE_KEY");
  const geminiApiKey = value(env, "GEMINI_API_KEY");
  const model = value(env, "GEMINI_MODEL") || "gemini-3.7-flash";
  if (
    !allowedOrigin ||
    receiptSecret.length < 32 ||
    !accountId ||
    !captureToken ||
    !gateUrl ||
    gateSecret.length < 32 ||
    !turnstileSecret ||
    !turnstileSiteKey ||
    !geminiApiKey ||
    !model
  ) {
    return null;
  }

  return {
    allowedOrigin,
    receiptSecret,
    capture: { accountId, apiToken: captureToken },
    redemption: {
      url: gateUrl,
      sharedSecret: gateSecret,
      fingerprintSecret: receiptSecret,
    },
    turnstile: { secretKey: turnstileSecret },
    gemini: { apiKey: geminiApiKey, model },
  };
}

export function sponsoredAuditPublicConfigFromEnv(
  env: Environment = process.env,
): SponsoredAuditPublicConfig {
  const siteKey = value(env, "NEXT_PUBLIC_TURNSTILE_SITE_KEY");
  return sponsoredAuditConfigFromEnv(env) && siteKey
    ? { available: true, turnstileSiteKey: siteKey }
    : { available: false };
}
