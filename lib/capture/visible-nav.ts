export const MAX_VISIBLE_NAV_ROUTES = 4;

export type VisibleNavRoute = {
  url: string;
  label: string;
};

const SKIP_PATH = /\/(?:log-?out|sign-?out)(?:\/|$)/i;
const SKIP_FILE =
  /\.(?:7z|avi|csv|dmg|docx?|exe|gif|ico|jpe?g|mov|mp[34]|ogg|pdf|png|pptx?|rar|svg|tar|wav|webm|webp|xlsx?|zip)$/i;
const MARKDOWN_LINK = /\[([^\]]{1,80})\]\(\s*<?([^>\s)]+)>?\s*\)/g;
const URL_SHAPED_VALUE = /^(?:https?:\/\/|\.{1,2}\/|\/)/i;

function navKey(target: URL) {
  const path = target.pathname.replace(/\/+$/, "") || "/";
  return `${target.origin}${path}`;
}

function labelFromPath(target: URL) {
  const segment = target.pathname.split("/").filter(Boolean).at(-1);
  if (!segment) return "Home";
  return segment.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function cleanLabel(value: string, fallback: string) {
  const label = value.replace(/\s+/g, " ").trim().slice(0, 80);
  return label || fallback;
}

function acceptedRoute(current: URL, candidate: URL): VisibleNavRoute | null {
  if (candidate.protocol !== "http:" && candidate.protocol !== "https:") return null;
  if (candidate.username || candidate.password) return null;
  if (candidate.origin !== current.origin) return null;
  if (SKIP_PATH.test(candidate.pathname) || SKIP_FILE.test(candidate.pathname)) return null;
  if (navKey(candidate) === navKey(current)) return null;
  candidate.hash = "";
  candidate.search = "";
  return {
    url: candidate.toString(),
    label: labelFromPath(candidate),
  };
}

function pushUnique(routes: VisibleNavRoute[], seen: Set<string>, route: VisibleNavRoute) {
  const key = navKey(new URL(route.url));
  if (seen.has(key) || routes.length >= MAX_VISIBLE_NAV_ROUTES) return;
  seen.add(key);
  routes.push(route);
}

function accessibleLinkHref(record: Record<string, unknown>) {
  if (typeof record.url === "string") return record.url;
  if (typeof record.value !== "string") return "";
  const value = record.value.trim();
  return URL_SHAPED_VALUE.test(value) ? value : "";
}

function collectMarkdownRoutes(current: URL, markdown: string, seen: Set<string>) {
  const routes: VisibleNavRoute[] = [];
  for (const match of markdown.matchAll(MARKDOWN_LINK)) {
    const href = match[2]?.trim() ?? "";
    const text = match[1] ?? "";
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      continue;
    }
    try {
      const accepted = acceptedRoute(current, new URL(href, current));
      if (!accepted) continue;
      pushUnique(routes, seen, {
        ...accepted,
        label: cleanLabel(text, accepted.label),
      });
    } catch {
      continue;
    }
    if (routes.length >= MAX_VISIBLE_NAV_ROUTES) break;
  }
  return routes;
}

function collectAccessibleRoutes(current: URL, tree: unknown, seen: Set<string>) {
  const routes: VisibleNavRoute[] = [];
  if (!tree || typeof tree !== "object") return routes;
  const queue: unknown[] = [tree];
  let visited = 0;
  while (queue.length > 0 && visited < 300 && routes.length < MAX_VISIBLE_NAV_ROUTES) {
    const node = queue.shift();
    visited += 1;
    if (!node || typeof node !== "object" || Array.isArray(node)) continue;
    const record = node as Record<string, unknown>;
    const role = typeof record.role === "string" ? record.role : "";
    const href = accessibleLinkHref(record);
    if (role === "link" && href) {
      try {
        const accepted = acceptedRoute(current, new URL(href, current));
        if (accepted) {
          const name = typeof record.name === "string" ? record.name : "";
          pushUnique(routes, seen, { ...accepted, label: cleanLabel(name, accepted.label) });
        }
      } catch {
        // Ignore malformed accessibility URLs.
      }
    }
    if (Array.isArray(record.children)) queue.push(...record.children);
  }
  return routes;
}

export function extractVisibleNav(
  currentUrl: string,
  markdown: string,
  accessibilityTree?: unknown,
): VisibleNavRoute[] {
  let current: URL;
  try {
    current = new URL(currentUrl);
  } catch {
    return [];
  }
  const seen = new Set<string>([navKey(current)]);
  const fromMarkdown = collectMarkdownRoutes(current, markdown, seen);
  if (fromMarkdown.length >= MAX_VISIBLE_NAV_ROUTES) return fromMarkdown;
  return [...fromMarkdown, ...collectAccessibleRoutes(current, accessibilityTree, seen)].slice(
    0,
    MAX_VISIBLE_NAV_ROUTES,
  );
}

export function uncapturedVisibleNav(
  routes: readonly VisibleNavRoute[],
  capturedUrls: Iterable<string>,
) {
  const captured = new Set<string>();
  for (const value of capturedUrls) {
    try {
      captured.add(navKey(new URL(value)));
    } catch {
      continue;
    }
  }
  return routes.filter((route) => {
    try {
      return !captured.has(navKey(new URL(route.url)));
    } catch {
      return false;
    }
  });
}

export function capturedVisibleNavLabels(
  attempted: readonly VisibleNavRoute[],
  remaining: readonly VisibleNavRoute[],
) {
  const remainingUrls = new Set(remaining.map(({ url }) => url));
  return attempted.filter(({ url }) => !remainingUrls.has(url)).map(({ label }) => label);
}

export function visibleNavGap(count: number) {
  const noun = count === 1 ? "same-origin link is" : "same-origin links are";
  return {
    id: "gap-visible-nav",
    label: "Visible navigation routes",
    detail: `${count} ${noun} listed from this page and not yet captured.`,
  };
}

export function withoutVisibleNavGap<T extends { id?: string }>(gaps: T[]) {
  return gaps.filter((gap) => gap.id !== "gap-visible-nav");
}

type VisibleNavGapEvidence = ReturnType<typeof visibleNavGap> & {
  checkpointId?: string;
  scopeKey?: string;
};

export function reconcileVisibleNavGap(
  gaps: readonly VisibleNavGapEvidence[],
  remainingCount: number,
  fallback: Pick<VisibleNavGapEvidence, "checkpointId" | "scopeKey">,
) {
  const retained = gaps.find(({ id }) => id === "gap-visible-nav") ?? fallback;
  const next = withoutVisibleNavGap([...gaps]);
  if (remainingCount < 1) return next;
  return [
    ...next,
    {
      ...visibleNavGap(remainingCount),
      ...(retained.checkpointId ? { checkpointId: retained.checkpointId } : {}),
      ...(retained.scopeKey ? { scopeKey: retained.scopeKey } : {}),
    },
  ];
}
