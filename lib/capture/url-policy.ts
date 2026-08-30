import { createHash } from "node:crypto";
import { isIP } from "node:net";

import { withDefaultHttps } from "@/lib/url";

const MAX_URL_LENGTH = 2048;
const MAX_PREVIEW_CSS_LENGTH = 4000;
const MAX_WAIT_SELECTOR_LENGTH = 160;

const blockedHostSuffixes = [".internal", ".invalid", ".lan", ".local", ".localhost", ".test"];

export class TargetPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TargetPolicyError";
  }
}

export class PreviewPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreviewPolicyError";
  }
}

export class WaitForSelectorPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WaitForSelectorPolicyError";
  }
}

export function sanitizeWaitForSelector(input: string) {
  const selector = input.trim();
  if (!selector || selector.length > MAX_WAIT_SELECTOR_LENGTH) {
    throw new WaitForSelectorPolicyError("The wait selector must contain 1 to 160 characters.");
  }
  if (
    /[\u0000-\u001f\u007f]/.test(selector) ||
    /[,\\(){};@</]/.test(selector) ||
    !/^[-A-Za-z0-9_#.*:[\]=~|^$'" >+]+$/.test(selector)
  ) {
    throw new WaitForSelectorPolicyError(
      "Use one simple CSS selector without lists, escapes, or functional pseudo-classes.",
    );
  }

  let bracketDepth = 0;
  let quote: "'" | '"' | null = null;
  for (const character of selector) {
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      if (bracketDepth === 0) {
        throw new WaitForSelectorPolicyError(
          "Quoted selector values must stay inside an attribute selector.",
        );
      }
      quote = character;
    } else if (character === "[") {
      bracketDepth += 1;
      if (bracketDepth > 1) {
        throw new WaitForSelectorPolicyError("Nested attribute selectors are not supported.");
      }
    } else if (character === "]") {
      bracketDepth -= 1;
      if (bracketDepth < 0) {
        throw new WaitForSelectorPolicyError("The wait selector contains an unmatched bracket.");
      }
    }
  }
  if (quote || bracketDepth !== 0) {
    throw new WaitForSelectorPolicyError("The wait selector contains an unclosed attribute value.");
  }
  return selector;
}

function isBlockedIpv4(hostname: string) {
  const parts = hostname.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

function assertPublicHostname(hostname: string) {
  const normalized = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (!normalized || normalized === "localhost" || normalized === "localhost.localdomain") {
    throw new TargetPolicyError("Choose a public website host.");
  }
  if (blockedHostSuffixes.some((suffix) => normalized.endsWith(suffix))) {
    throw new TargetPolicyError("Private and reserved hostnames cannot be captured remotely.");
  }

  const version = isIP(normalized);
  if (version === 6) {
    // IPv4-mapped IPv6 literals (for example ::ffff:127.0.0.1) can otherwise
    // bypass an IPv4-only private-range check. A literal IPv6 target is not
    // needed for the public URL workflow, so reject every literal conservatively.
    throw new TargetPolicyError(
      "Literal IPv6 targets are not supported for remote capture; use a public DNS hostname.",
    );
  }
  if (version === 4 && isBlockedIpv4(normalized)) {
    throw new TargetPolicyError(
      "Private, local, and reserved IP addresses cannot be captured remotely.",
    );
  }
}

export function normalizePublicTarget(input: string) {
  const candidate = withDefaultHttps(input);
  if (!candidate || candidate.length > MAX_URL_LENGTH) {
    throw new TargetPolicyError("Enter a public URL no longer than 2,048 characters.");
  }

  let target: URL;
  try {
    target = new URL(candidate);
  } catch {
    throw new TargetPolicyError("Enter a public website URL or hostname.");
  }

  if (target.protocol !== "https:" && target.protocol !== "http:") {
    throw new TargetPolicyError("Only http and https targets are supported.");
  }
  if (target.username || target.password) {
    throw new TargetPolicyError("Credentials must never be placed in the target URL.");
  }
  if (target.port && target.port !== "80" && target.port !== "443") {
    throw new TargetPolicyError("Remote capture supports standard web ports only.");
  }

  assertPublicHostname(target.hostname);

  const display = new URL(target);
  display.search = "";
  display.hash = "";

  const captureUrl = target.toString();
  const scopeId = `scope_${createHash("sha256").update(captureUrl, "utf8").digest("hex").slice(0, 32)}`;

  return {
    captureUrl,
    displayUrl: display.toString(),
    origin: target.origin,
    scopeId,
  };
}

const allowedPreviewProperties = new Set([
  "align-content",
  "align-items",
  "align-self",
  "background-color",
  "border",
  "border-bottom",
  "border-bottom-color",
  "border-bottom-left-radius",
  "border-bottom-right-radius",
  "border-bottom-style",
  "border-bottom-width",
  "border-color",
  "border-left",
  "border-left-color",
  "border-left-style",
  "border-left-width",
  "border-radius",
  "border-right",
  "border-right-color",
  "border-right-style",
  "border-right-width",
  "border-style",
  "border-top",
  "border-top-color",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-top-style",
  "border-top-width",
  "border-width",
  "bottom",
  "box-shadow",
  "box-sizing",
  "color",
  "column-gap",
  "display",
  "flex",
  "flex-basis",
  "flex-direction",
  "flex-grow",
  "flex-shrink",
  "flex-wrap",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "gap",
  "grid-column",
  "grid-column-end",
  "grid-column-start",
  "grid-row",
  "grid-row-end",
  "grid-row-start",
  "grid-template-columns",
  "grid-template-rows",
  "height",
  "justify-content",
  "justify-items",
  "justify-self",
  "left",
  "letter-spacing",
  "line-height",
  "margin",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-height",
  "max-width",
  "min-height",
  "min-width",
  "object-fit",
  "opacity",
  "order",
  "outline",
  "outline-color",
  "outline-offset",
  "outline-style",
  "outline-width",
  "overflow",
  "overflow-wrap",
  "overflow-x",
  "overflow-y",
  "padding",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "place-content",
  "place-items",
  "place-self",
  "pointer-events",
  "position",
  "right",
  "row-gap",
  "text-align",
  "text-decoration",
  "text-decoration-color",
  "text-decoration-line",
  "text-decoration-style",
  "text-indent",
  "text-overflow",
  "text-transform",
  "top",
  "transform",
  "transition",
  "user-select",
  "vertical-align",
  "visibility",
  "white-space",
  "width",
  "word-break",
  "z-index",
]);

const blockedPreviewProperties = new Set([
  "background",
  "background-image",
  "border-image",
  "content",
  "cursor",
  "filter",
  "list-style",
  "list-style-image",
  "mask",
  "mask-image",
  "-moz-binding",
  "src",
  "behavior",
]);

const blockedPreviewTokens =
  /\b(?:url|image-set|image|import|expression|javascript|data|https?|file|blob)\b/i;
const simpleType = /^[A-Za-z][A-Za-z0-9_-]*/;
const simplePart = /^(?:[.#][A-Za-z][A-Za-z0-9_-]*|:{1,2}[A-Za-z][A-Za-z0-9_-]*)/;

function isSimpleSelector(selector: string) {
  let rest = selector.trim();
  if (!rest || /\s/.test(rest)) return false;
  let hasType = false;
  if (rest.startsWith("*")) rest = rest.slice(1);
  else {
    const type = rest.match(simpleType);
    if (type) {
      rest = rest.slice(type[0].length);
      hasType = true;
    }
  }

  let parts = 0;
  while (rest) {
    const part = rest.match(simplePart);
    if (!part) return false;
    rest = rest.slice(part[0].length);
    parts += 1;
  }
  return hasType || parts > 0 || selector.trim() === "*";
}

function assertSafePreviewSelector(selector: string) {
  if (!selector || selector.split(",").some((part) => !isSimpleSelector(part))) {
    throw new PreviewPolicyError(
      "Preview CSS may target only simple element, class, id, or state selectors.",
    );
  }
}

function assertSafePreviewDeclarations(declarations: string) {
  const parts = declarations.split(";");
  for (const [index, declaration] of parts.entries()) {
    const trimmed = declaration.trim();
    if (!trimmed && index === parts.length - 1) continue;
    if (!trimmed) throw new PreviewPolicyError("Preview CSS contains an empty declaration.");

    const colon = trimmed.indexOf(":");
    if (colon <= 0)
      throw new PreviewPolicyError("Preview CSS declarations must use property: value pairs.");
    const property = trimmed.slice(0, colon).trim().toLowerCase();
    const value = trimmed.slice(colon + 1).trim();
    if (!/^[a-z][a-z0-9-]*$/.test(property) || property.startsWith("--")) {
      throw new PreviewPolicyError("Preview CSS contains an unsupported property name.");
    }
    if (blockedPreviewProperties.has(property) || !allowedPreviewProperties.has(property)) {
      throw new PreviewPolicyError(
        "Preview CSS may use only allowlisted visual and layout properties.",
      );
    }
    if (!value || blockedPreviewTokens.test(value)) {
      throw new PreviewPolicyError("Preview CSS values may not load resources or execute code.");
    }
  }
}

export function sanitizePreviewCss(input: string) {
  const css = input.trim();
  if (!css || css.length > MAX_PREVIEW_CSS_LENGTH) {
    throw new PreviewPolicyError("Preview CSS must contain 1 to 4,000 characters.");
  }

  if (/[\\"'()<>@]/.test(css) || /\/\*|\*\//.test(css) || /[\u0000-\u001f\u007f]/.test(css)) {
    throw new PreviewPolicyError(
      "Preview CSS may not contain escapes, at-rules, quotes, parentheses, comments, or markup.",
    );
  }

  const blocks: Array<{ selector: string; declarations: string }> = [];
  let cursor = 0;
  while (cursor < css.length) {
    while (/\s/.test(css[cursor] ?? "")) cursor += 1;
    if (cursor >= css.length) break;

    const open = css.indexOf("{", cursor);
    if (open < 0) throw new PreviewPolicyError("Preview CSS must contain selector blocks.");
    const close = css.indexOf("}", open + 1);
    if (close < 0) throw new PreviewPolicyError("Preview CSS contains an unclosed block.");
    if (css.indexOf("{", open + 1) >= 0 && css.indexOf("{", open + 1) < close) {
      throw new PreviewPolicyError("Preview CSS may not contain nested blocks.");
    }
    const selector = css.slice(cursor, open).trim();
    const declarations = css.slice(open + 1, close).trim();
    assertSafePreviewSelector(selector);
    assertSafePreviewDeclarations(declarations);
    blocks.push({ selector, declarations });
    cursor = close + 1;
  }
  if (!blocks.length)
    throw new PreviewPolicyError("Preview CSS must contain at least one safe selector block.");

  return css;
}
