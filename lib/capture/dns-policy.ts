import { resolve4, resolve6 } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

import { TargetPolicyError } from "./url-policy";

const DNS_LOOKUP_TIMEOUT_MS = 4_000;

const blockedAddresses = new BlockList();
const globalIpv6Addresses = new BlockList();

// IANA reserves every unlisted part of 2000::/3. Keep this allowlist aligned
// with its Global Unicast Address Space registry instead of trusting the whole range.
for (const [network, prefix] of [
  ["2001:200::", 23],
  ["2001:400::", 23],
  ["2001:600::", 23],
  ["2001:800::", 22],
  ["2001:c00::", 23],
  ["2001:e00::", 23],
  ["2001:1200::", 23],
  ["2001:1400::", 22],
  ["2001:1800::", 23],
  ["2001:1a00::", 23],
  ["2001:1c00::", 22],
  ["2001:2000::", 19],
  ["2001:4000::", 23],
  ["2001:4200::", 23],
  ["2001:4400::", 23],
  ["2001:4600::", 23],
  ["2001:4800::", 23],
  ["2001:4a00::", 23],
  ["2001:4c00::", 23],
  ["2001:5000::", 20],
  ["2001:8000::", 19],
  ["2001:a000::", 20],
  ["2001:b000::", 20],
  ["2003::", 18],
  ["2400::", 12],
  ["2410::", 12],
  ["2600::", 12],
  ["2610::", 23],
  ["2620::", 23],
  ["2630::", 12],
  ["2800::", 12],
  ["2a00::", 12],
  ["2a10::", 12],
  ["2c00::", 12],
] as const) {
  globalIpv6Addresses.addSubnet(network, prefix, "ipv6");
}

for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedAddresses.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fec0::", 10],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blockedAddresses.addSubnet(network, prefix, "ipv6");
}

export type ResolveTarget = (hostname: string) => Promise<string[]>;

function publicAddress(address: string) {
  const version = isIP(address);
  if (version === 0) return false;
  if (version === 4) return !blockedAddresses.check(address, "ipv4");
  if (/^::(?:ffff:)?/i.test(address)) return false;
  return globalIpv6Addresses.check(address, "ipv6") && !blockedAddresses.check(address, "ipv6");
}

async function resolveTargetAddresses(hostname: string) {
  const answers = await Promise.allSettled([resolve4(hostname), resolve6(hostname)]);
  return answers.flatMap((answer) => (answer.status === "fulfilled" ? answer.value : []));
}

export async function assertPublicDnsTarget(
  hostname: string,
  resolveTarget: ResolveTarget = resolveTargetAddresses,
  timeoutMs = DNS_LOOKUP_TIMEOUT_MS,
) {
  if (isIP(hostname) !== 0) {
    if (!publicAddress(hostname)) {
      throw new TargetPolicyError("The target uses a private or reserved address.");
    }
    return;
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new TargetPolicyError("The public hostname could not be resolved safely.")),
      timeoutMs,
    );
  });

  try {
    const addresses = await Promise.race([resolveTarget(hostname), timeout]);
    if (addresses.length === 0) {
      throw new TargetPolicyError("The public hostname could not be resolved.");
    }
    if (!addresses.every(publicAddress)) {
      throw new TargetPolicyError("The hostname resolves to a private or reserved address.");
    }
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
}
