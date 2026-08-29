import type { Viewport } from "@/lib/audit/types";

export type CaptureSource = "cloudflare" | "local";

export type CaptureTarget = {
  displayUrl: string;
  origin: string;
};

export type AccessibilityNodeSummary = {
  role: string;
  name: string;
  level?: number;
  states: string[];
};

export type AccessibilitySummary = {
  rootName: string;
  nodeCount: number;
  interactiveCount: number;
  unnamedInteractiveCount: number;
  mainLandmarkCount: number;
  /** True when the provider tree could not be traversed within the safety budget. */
  truncated?: boolean;
  headingOutline: Array<{ level: number; name: string }>;
  nodes: AccessibilityNodeSummary[];
};

export type CaptureGap = {
  id: string;
  label: string;
  detail: string;
};

export type RemoteCheckpoint = {
  id: string;
  /** Opaque, stable identity for the normalized target URL (including private query/fragment). */
  scopeId: string;
  source: CaptureSource;
  capturedAt: string;
  target: CaptureTarget;
  title: string;
  status: number | null;
  viewport: Viewport;
  viewportSize: { width: number; height: number };
  screenshotDataUrl: string;
  textExcerpt: string;
  accessibility: AccessibilitySummary;
  gaps: CaptureGap[];
  preview: { applied: boolean };
  capture: {
    fullPage: boolean;
    waitForSelector?: string;
  };
  /** Cloudflare Browser Run `X-Browser-Ms-Used`, when the provider sent a valid integer. */
  browserMsUsed?: number;
};

export type RemoteCaptureInput = {
  url: string;
  viewport: Viewport;
  previewCss?: string;
  /** Capture the full rendered document instead of only the initial viewport. */
  fullPage?: boolean;
  /** Wait for one user-provided, policy-checked CSS selector before capturing. */
  waitForSelector?: string;
  signal?: AbortSignal;
};
