import { isIP } from "node:net";

export function clientAddressFromRequest(request: Request) {
  // Vercel documents this as platform-authenticated and identical to the
  // client address it places in X-Forwarded-For. Do not fall back to generic
  // forwarding headers that a direct client can supply.
  const value = request.headers.get("x-vercel-forwarded-for")?.split(",", 1)[0]?.trim() ?? "";
  return isIP(value) ? value : undefined;
}
