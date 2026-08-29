export const CHATGPT_HOME_URL = "https://chatgpt.com/";
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
  const workspace = new URL("/", appOrigin);
  workspace.searchParams.set("url", launch.targetUrl);
  workspace.searchParams.set("goal", launch.goal);
  workspace.hash = "workbench";
  return workspace.toString();
}

export function buildChatGptHandoffPrompt(launch: AuditLaunch, workspaceUrl: string) {
  const goal =
    launch.goal ||
    "Review the most important UI, UX, interaction, accessibility, clarity, trust, and visual-quality problems.";
  return [
    `Use Sundae to audit ${launch.targetUrl}`,
    `Review goal: ${goal}`,
    `Open this exact Sundae workspace in the built-in browser: ${workspaceUrl}`,
    "When Sundae Site Tools are available, use them to capture the approved public scope, keep measured facts separate from product judgments, name what was not seen, and prioritize evidence-linked findings.",
    "If Site Tools are unavailable on this surface, keep the workspace link and tell me what I need to open; do not claim that an audit or capture completed.",
  ].join("\n\n");
}
