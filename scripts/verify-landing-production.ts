import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import { TAP_TARGET_MIN_PX } from "../lib/audit/measurements";
import { INCLUDED_DEMO_PRIMARY_ACTION_MIN_HEIGHT_PX } from "../lib/demo/included-receipt";

const CANONICAL_ORIGIN = "https://usesundae.vercel.app";

type Box = { y: number; height: number; bottom: number };

function agentBrowser(args: string[]) {
  const result = spawnSync("agent-browser", ["--json", ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout) as { data?: { result?: unknown } };
}

function closeAgentBrowser() {
  spawnSync("agent-browser", ["--json", "close"], { encoding: "utf8" });
}

function measure(origin: string, width: number, height: number) {
  agentBrowser(["set", "viewport", String(width), String(height)]);
  agentBrowser(["open", origin]);
  agentBrowser(["wait", "#landing-title"]);
  const result = agentBrowser([
    "eval",
    `(() => {
      const box = (el) => {
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { y: rect.y, height: rect.height, bottom: rect.bottom };
      };
      const form = document.querySelector('form[aria-label="Start a Sundae audit"]');
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        cta: box(form?.querySelector('button[type="submit"]') ?? null),
        demo: box(form?.querySelector('a[href="/demo"]') ?? null),
      };
    })()`,
  ]).data?.result;
  assert.equal(typeof result, "object");
  return result as {
    scrollWidth: number;
    clientWidth: number;
    cta: Box | null;
    demo: Box | null;
  };
}

function measureDemoPrimaryAction(origin: string) {
  agentBrowser(["set", "viewport", "390", "844"]);
  agentBrowser(["open", new URL("/demo?state=baseline", origin).href]);
  agentBrowser(["wait", "#primary-action"]);
  const result = agentBrowser([
    "eval",
    `(() => {
      const rect = document.getElementById('primary-action')?.getBoundingClientRect();
      return rect ? { width: rect.width, height: rect.height } : null;
    })()`,
  ]).data?.result;
  assert.ok(result && typeof result === "object", "included demo primary action is missing");
  return result as { width: number; height: number };
}

const configuredOrigin = process.env.SUNDAE_GEOMETRY_ORIGIN;
assert.ok(configuredOrigin, "SUNDAE_GEOMETRY_ORIGIN is required for production verification.");
const origin = new URL(configuredOrigin).origin;
assert.equal(origin, CANONICAL_ORIGIN, "production verification must use the canonical origin");

try {
  const viewports = [
    [1440, 900],
    [390, 844],
    [320, 844],
  ] as const;
  const landing = viewports.map(([width, height]) => {
    const result = measure(origin, width, height);
    assert.equal(result.scrollWidth, result.clientWidth, `horizontal overflow at ${width}px`);
    assert.ok(result.cta, `primary CTA is missing at ${width}px`);
    assert.ok(result.cta.bottom <= height, `primary CTA is below the viewport at ${width}px`);
    if (width === 390) {
      assert.ok(result.demo, "live demo link is missing at 390px");
      assert.ok(result.demo.bottom <= height, "live demo link is below the 390px viewport");
    }
    return { width, height, ...result };
  });

  const demoAction = measureDemoPrimaryAction(origin);
  assert.equal(Math.round(demoAction.height), INCLUDED_DEMO_PRIMARY_ACTION_MIN_HEIGHT_PX);
  assert.ok(demoAction.height < TAP_TARGET_MIN_PX);

  console.log(
    JSON.stringify(
      {
        origin,
        landing,
        demoAction,
        configuredHeight: INCLUDED_DEMO_PRIMARY_ACTION_MIN_HEIGHT_PX,
      },
      null,
      2,
    ),
  );
} finally {
  closeAgentBrowser();
}
