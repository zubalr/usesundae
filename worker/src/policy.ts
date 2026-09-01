import { normalizePublicTarget, TargetPolicyError } from "../../lib/capture/url-policy";

export function publicCaptureUrl(input: string): string {
  return normalizePublicTarget(input).captureUrl;
}

export function isBlockedBrowserRequest(url: string): boolean {
  if (!/^https?:/i.test(url)) return false;
  try {
    publicCaptureUrl(url);
    return false;
  } catch (error) {
    return error instanceof TargetPolicyError || error instanceof TypeError;
  }
}
