import type { IdentityConfidence, Region, Viewport } from "./types";

type BrowserIdentity = {
  auditId: string;
  identityConfidence: IdentityConfidence;
};

export type BrowserFacts = {
  viewport: Viewport;
  viewportSize: { width: number; height: number };
  tapTargets: Array<BrowserIdentity & { label: string; rect: Region }>;
  controls: Array<{
    auditId: string;
    identityConfidence: IdentityConfidence;
    label: string;
    accessibleName: string;
    rect: Region;
  }>;
  contrastSamples: Array<{
    auditId: string;
    identityConfidence: IdentityConfidence;
    label: string;
    foreground: string;
    background: string;
    rect: Region;
  }>;
  overflow: { scrollWidth: number; clientWidth: number; rect?: Region };
  copy: { promise: string; primaryAction: string; rect: Region } | null;
};

function region(element: Element): Region {
  const rect = element.getBoundingClientRect();
  return {
    x: Math.round(rect.x * 10) / 10,
    y: Math.round(rect.y * 10) / 10,
    width: Math.round(rect.width * 10) / 10,
    height: Math.round(rect.height * 10) / 10,
  };
}

function labelFor(element: Element, index = 0) {
  return (
    element.getAttribute("aria-label")?.trim() ||
    element.textContent?.trim() ||
    `${element.tagName.toLowerCase()} ${index + 1}`
  );
}

function isVisible(element: Element, view: Window) {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = view.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

function auditIdentity(element: Element, family: string, index: number): BrowserIdentity {
  const explicit = element.id || element.getAttribute("data-audit-id");
  if (explicit?.trim()) {
    return { auditId: explicit.trim().slice(0, 80), identityConfidence: "stable" };
  }
  const name = element
    .getAttribute("name")
    ?.trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .slice(0, 48);
  return {
    auditId: `${family}-${element.tagName.toLowerCase()}-${name ? `${name}-` : ""}${index + 1}`,
    identityConfidence: "unstable",
  };
}

function accessibleName(element: Element, document: Document) {
  const ariaLabel = element.getAttribute("aria-label")?.trim();
  if (ariaLabel) return ariaLabel;

  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
      .filter(Boolean)
      .join(" ");
    if (text) return text;
  }

  if (element instanceof HTMLInputElement && element.id) {
    const explicit = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
    if (explicit?.textContent?.trim()) return explicit.textContent.trim();
  }

  const wrappingLabel = element.closest("label")?.textContent?.trim();
  if (wrappingLabel) return wrappingLabel;

  const alt = element.querySelector("img[alt]")?.getAttribute("alt")?.trim();
  if (alt) return alt;

  return element.textContent?.trim() ?? element.getAttribute("title")?.trim() ?? "";
}

function opaqueBackground(element: Element, view: Window) {
  let current: Element | null = element;
  while (current) {
    const color = view.getComputedStyle(current).backgroundColor;
    if (color && color !== "transparent" && color !== "rgba(0, 0, 0, 0)") return color;
    current = current.parentElement;
  }
  return "rgb(255, 255, 255)";
}

export function captureBrowserFacts(document: Document, viewport: Viewport): BrowserFacts {
  const view = document.defaultView;
  if (!view) throw new Error("The audited document does not have a browser window.");

  const interactiveSelector = [
    "button",
    "a[href]",
    "input:not([type='hidden'])",
    "select",
    "textarea",
    "[role='button']",
    "[role='link']",
    "[role='checkbox']",
    "[role='radio']",
    "[role='switch']",
    "[role='tab']",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");
  const interactive: Element[] = [];
  for (const element of document.querySelectorAll(interactiveSelector)) {
    if (!isVisible(element, view)) continue;
    interactive.push(element);
    if (interactive.length === 120) break;
  }

  const interactiveRecords = interactive.map((element, index) => {
    const controlIdentity = auditIdentity(element, "control", index);
    const targetIdentity = auditIdentity(element, "target", index);
    return {
      controlIdentity,
      targetIdentity,
      label: labelFor(element, index),
      accessibleName: accessibleName(element, document),
      rect: region(element),
    };
  });
  const controls = interactiveRecords.map(
    ({ controlIdentity, label, accessibleName: name, rect }) => ({
      ...controlIdentity,
      label,
      accessibleName: name,
      rect,
    }),
  );

  const tapTargets =
    viewport === "mobile"
      ? interactiveRecords.map(({ targetIdentity, label, rect }) => ({
          ...targetIdentity,
          label,
          rect,
        }))
      : [];

  const textCandidates: Element[] = [];
  for (const element of document.querySelectorAll(
    "p, small, label, button, a, li, td, [role='cell']",
  )) {
    if (!isVisible(element, view)) continue;
    const copy = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (!copy || copy.length > 320) continue;
    const style = view.getComputedStyle(element);
    const fontSize = Number.parseFloat(style.fontSize);
    const fontWeight = Number.parseFloat(style.fontWeight);
    if (fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700)) continue;
    textCandidates.push(element);
    if (textCandidates.length === 80) break;
  }
  const contrastSamples = textCandidates.map((element, index) => ({
    ...auditIdentity(element, "copy", index),
    label: labelFor(element, index),
    foreground: view.getComputedStyle(element).color,
    background: opaqueBackground(element, view),
    rect: region(element),
  }));

  const promise = Array.from(document.querySelectorAll("h1")).find((element) =>
    isVisible(element, view),
  );
  const promiseScope = promise?.closest("section") ?? promise?.parentElement;
  const primaryAction = promiseScope
    ? Array.from(promiseScope.querySelectorAll("button, a[href]")).find((element) =>
        isVisible(element, view),
      )
    : undefined;

  const scrollWidth = document.documentElement.scrollWidth;
  const clientWidth = document.documentElement.clientWidth;
  let overflowRegion: Element | undefined;
  if (scrollWidth > clientWidth) {
    let visibleCount = 0;
    let rightmost = Number.NEGATIVE_INFINITY;
    for (const element of document.querySelectorAll("body *")) {
      if (!isVisible(element, view)) continue;
      visibleCount += 1;
      const right = element.getBoundingClientRect().right;
      if (right > rightmost) {
        rightmost = right;
        overflowRegion = element;
      }
      if (visibleCount === 500) break;
    }
  }

  return {
    viewport,
    viewportSize: {
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    },
    tapTargets,
    controls,
    contrastSamples,
    overflow: {
      scrollWidth,
      clientWidth,
      rect: overflowRegion ? region(overflowRegion) : undefined,
    },
    copy:
      promise && primaryAction
        ? {
            promise: promise.textContent?.trim() ?? "",
            primaryAction: primaryAction.textContent?.trim() ?? "",
            rect: region(promise),
          }
        : null,
  };
}
