import type { NextConfig } from "next";

const requestedDistDir = process.env.SUNDAE_NEXT_DIST_DIR?.trim();

if (requestedDistDir && !/^\.next-[a-z0-9-]{1,64}$/.test(requestedDistDir)) {
  throw new Error("SUNDAE_NEXT_DIST_DIR must match .next-<lowercase-run-name>.");
}

const nextConfig: NextConfig = {
  agentRules: false,
  distDir: requestedDistDir || ".next",
  // Next 16.3 standalone output conflicts with deployment adapters. Vercel
  // produces its own serverless output, so retain standalone for self-hosting.
  output: process.env.VERCEL === "1" ? undefined : "standalone",
};

export default nextConfig;
