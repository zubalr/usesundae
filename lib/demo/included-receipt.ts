import { findingIdentity, TAP_TARGET_MIN_PX } from "@/lib/audit/measurements";

export const INCLUDED_DEMO_PRIMARY_ACTION_ID = "primary-action";
export const INCLUDED_DEMO_PRIMARY_ACTION_MIN_HEIGHT_PX = 36;

export function demoBaselinePrimaryActionMinHeightPx(css: string) {
  const match = css.match(/\.baseline \.primaryAction\s*\{[\s\S]*?min-height:\s*(\d+)px/);
  if (!match) {
    throw new Error("Included demo baseline primary action has no measured min-height.");
  }
  return Number(match[1]);
}

export function includedDemoProofReceipt() {
  const size = INCLUDED_DEMO_PRIMARY_ACTION_MIN_HEIGHT_PX;
  if (size >= TAP_TARGET_MIN_PX) {
    throw new Error("Included demo primary action no longer has an undersized CSS minimum height.");
  }
  return {
    findingId: findingIdentity("mobile", "tap-target", INCLUDED_DEMO_PRIMARY_ACTION_ID),
    title: "A real issue in the included demo",
    meaning: `Its primary mobile action is configured with a ${size}px minimum height, below Sundae's ${TAP_TARGET_MIN_PX}px tap-target guidance.`,
    evidence: `CSS minimum height ${size}px · guidance ${TAP_TARGET_MIN_PX}px`,
  };
}
