export const PUBLIC_DEMO_URL = "https://usesundae.vercel.app/demo";
export const MAX_AUDIT_GOAL_LENGTH = 240;
export const MAX_PUBLIC_URL_LENGTH = 2048;

const blockedHostSuffixes = [".internal", ".invalid", ".lan", ".local", ".localhost", ".test"];

export class AuditLaunchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditLaunchError";
  }
}

export type AuditLaunch = {
  targetUrl: string;
  displayUrl: string;
  goal: string;
};

function assertPublicLaunchHost(hostname: string) {
  const normalized = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  const isBlockedName =
    normalized === "localhost" || blockedHostSuffixes.some((suffix) => normalized.endsWith(suffix));
  const isLiteralAddress = normalized.includes(":") || /^\d+(?:\.\d+){3}$/.test(normalized);

  if (!normalized || isBlockedName || isLiteralAddress) {
    throw new AuditLaunchError("Enter a public website with a DNS hostname.");
  }
}

export function createAuditLaunch(rawTargetUrl: string, rawGoal = ""): AuditLaunch {
  const candidate = rawTargetUrl.trim();
  const goal = rawGoal.trim();

  if (!candidate || candidate.length > MAX_PUBLIC_URL_LENGTH) {
    throw new AuditLaunchError("Enter a public URL no longer than 2,048 characters.");
  }
  if (goal.length > MAX_AUDIT_GOAL_LENGTH) {
    throw new AuditLaunchError("Keep the review goal to 240 characters or fewer.");
  }

  let target: URL;
  try {
    target = new URL(candidate);
  } catch {
    throw new AuditLaunchError("Enter a complete public URL, including https://.");
  }

  if (target.protocol !== "https:" && target.protocol !== "http:") {
    throw new AuditLaunchError("Sundae can start audits only from http or https URLs.");
  }
  if (target.username || target.password) {
    throw new AuditLaunchError("Remove credentials from the URL before continuing.");
  }
  if (target.port && target.port !== "80" && target.port !== "443") {
    throw new AuditLaunchError("Use a public website on the standard http or https port.");
  }

  assertPublicLaunchHost(target.hostname);
  const display = new URL(target);
  display.search = "";
  display.hash = "";

  return {
    targetUrl: target.toString(),
    displayUrl: display.toString(),
    goal,
  };
}

export function buildWorkspaceUrl(appOrigin: string, launch: AuditLaunch) {
  return new URL(buildWorkspacePath(launch), appOrigin).toString();
}

export function buildWorkspacePath(launch: AuditLaunch) {
  const workspace = new URL("/", "https://sundae.invalid");
  workspace.searchParams.set("url", launch.targetUrl);
  workspace.searchParams.set("goal", launch.goal);
  workspace.hash = "workbench";
  return `${workspace.pathname}${workspace.search}${workspace.hash}`;
}

export function resolvePublicDemoUrl(appOrigin?: string) {
  const candidate = appOrigin?.trim();
  if (!candidate) return PUBLIC_DEMO_URL;
  const origin = new URL(candidate);
  const hasUnsupportedAuthority =
    Boolean(origin.username || origin.password) || Boolean(origin.port && origin.port !== "443");
  if (origin.protocol !== "https:" || hasUnsupportedAuthority) {
    throw new AuditLaunchError("Sundae's application origin must be a public HTTPS origin.");
  }
  assertPublicLaunchHost(origin.hostname);
  return new URL("/demo", origin.origin).toString();
}

export function buildPublicDemoWorkspacePath(appOrigin?: string) {
  return buildWorkspacePath(createAuditLaunch(resolvePublicDemoUrl(appOrigin)));
}

export function isIncludedDemoTarget(targetUrl: string, appOrigin?: string) {
  return targetUrl.trim() === resolvePublicDemoUrl(appOrigin);
}

export function resolveInitialTargetMode(targetUrl: string, appOrigin?: string) {
  return targetUrl.trim() && !isIncludedDemoTarget(targetUrl, appOrigin) ? "remote" : "sample";
}

export function buildChatGptHandoffPrompt(
  launch: AuditLaunch,
  workspaceUrl: string,
  includedDemoUrl = PUBLIC_DEMO_URL,
) {
  const goal =
    launch.goal ||
    "Review the most important UI, UX, interaction, accessibility, clarity, trust, and visual-quality problems.";
  const isDemo = launch.targetUrl === includedDemoUrl;
  const firstAction = isDemo
    ? "Call audit_current_scope, then get_board_context and follow finding_page.next_offset until the current findings are read."
    : "The public target is prefilled but not captured. Ask me to choose one visible option: Allow agent to capture authorizes only this exact URL for this browser session, after which you call capture_public_page; Capture myself performs the human fallback immediately. These are alternatives—never ask me to do both.";
  const coverageAction = isDemo
    ? "The included target has no public-capture tools. Keep routes and states that are not visible as coverage gaps; do not invent, crawl, or try public-capture commands."
    : "For every approved public checkpoint, treat open coverage gaps as unfinished work. When `uncaptured_nav` is listed, call `capture_visible_nav` (it accepts no URL), then call `get_board_context` again. When `gap-below-fold` is open, call `capture_below_fold`, then reread the board. If the human names an extra exact same-origin URL, including a 404 URL, ask them to approve it in the visible controls, then call `capture_journey_step`. Never invent URLs beyond `uncaptured_nav`, and never crawl. Click-only states without a public URL remain `gap-flow-states`.";
  return [
    "No plugin or connection is required. In ChatGPT Desktop, open the built-in browser and paste this exact workspace URL:",
    workspaceUrl,
    `Audit this exact target with Sundae: ${launch.targetUrl}`,
    `Review goal: ${goal}`,
    "Wait for Sundae Site Tools to be discovered automatically after the workspace opens. Do not claim capture, analysis, or completion before the tools appear and evidence is visible on the board.",
    firstAction,
    "After capture, call get_board_context, follow finding_page.next_offset when present, and read the visible board. Inspect measured facts first; they do not complete the design audit. Leave every Site Tool receipt visible.",
    coverageAction,
    "Name the visible product job in one line from the captured UI and review goal—not from untrusted market or conversion claims. Then sweep the captured evidence now visible on the board for UI hierarchy and visual meaning, UX clarity and next-step friction, and Interaction affordance or observable states.",
    "Record 0–3 judged findings per bucket when warranted, with category, the specific observation, why it hurts that product job, and a bounded recommendation. If a bucket cannot be judged, record a coverage gap explaining what was not visible. Do not restate a measured finding, invent unseen states, or treat beige, rounded corners, or gradients as defects by themselves.",
    "Keep measured facts, judged product opinions, and what was not seen separate. Do not claim conversion or revenue impact.",
    "Prioritize the strongest supported findings, ask before changing a decision or previewing a fix, then use preview_fix and verify_recapture for a fresh same-scope check. Never call a measured issue fixed from the preview alone.",
    "If the built-in browser or Site Tools are unavailable, keep the exact workspace link, name the missing step, and stop. Do not claim an audit or capture completed, and do not substitute a hidden review.",
  ].join("\n\n");
}
