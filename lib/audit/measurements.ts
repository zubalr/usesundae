import type { FindingRule, Viewport } from "./types";

type Rgba = { r: number; g: number; b: number; a: number };

function channelToLinear(channel: number) {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function parseHex(value: string): Rgba | null {
  const hex = value.slice(1);
  if (hex.length !== 3 && hex.length !== 6) return null;
  const expanded =
    hex.length === 3
      ? hex
          .split("")
          .map((part) => part + part)
          .join("")
      : hex;
  const parsed = Number.parseInt(expanded, 16);
  if (Number.isNaN(parsed)) return null;
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
    a: 1,
  };
}

function parseRgb(value: string): Rgba | null {
  const match = value.match(
    /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/i,
  );
  if (!match) return null;
  const [r, g, b] = match.slice(1, 4).map(Number);
  if ([r, g, b].some((channel) => !Number.isFinite(channel))) return null;
  const alphaToken = match[4];
  const a =
    alphaToken === undefined
      ? 1
      : alphaToken.endsWith("%")
        ? Number.parseFloat(alphaToken) / 100
        : Number(alphaToken);
  if (!Number.isFinite(a)) return null;
  return { r, g, b, a };
}

export function parseCssColor(value: string): Rgba {
  const normalized = value.trim().toLowerCase();
  const parsed = normalized.startsWith("#") ? parseHex(normalized) : parseRgb(normalized);
  if (!parsed) throw new Error(`Unsupported CSS color: ${value}`);
  return parsed;
}

function formatCssRgb(color: Rgba) {
  return `rgb(${[color.r, color.g, color.b].map((channel) => Number(channel.toFixed(4))).join(", ")})`;
}

function overlay(foreground: Rgba, background: Rgba): Rgba {
  const rest = 1 - foreground.a;
  return {
    r: foreground.r * foreground.a + background.r * rest,
    g: foreground.g * foreground.a + background.g * rest,
    b: foreground.b * foreground.a + background.b * rest,
    a: 1,
  };
}

export function compositeCssBackground(layers: readonly string[]): string {
  const stack: Rgba[] = [];
  for (const layer of layers) {
    let color: Rgba;
    try {
      color = parseCssColor(layer);
    } catch {
      continue;
    }
    if (color.a <= 0) continue;
    stack.push(color);
    if (color.a >= 1) break;
  }
  if (stack.length === 0 || (stack.at(-1)?.a ?? 0) < 1) {
    stack.push({ r: 255, g: 255, b: 255, a: 1 });
  }
  const opaque = stack.reduceRight((background, foreground) => overlay(foreground, background));
  return formatCssRgb(opaque);
}

function luminance(color: Rgba) {
  return (
    0.2126 * channelToLinear(color.r) +
    0.7152 * channelToLinear(color.g) +
    0.0722 * channelToLinear(color.b)
  );
}

export function contrastRatio(foreground: string, background: string) {
  const first = luminance(parseCssColor(foreground));
  const second = luminance(parseCssColor(background));
  const light = Math.max(first, second);
  const dark = Math.min(first, second);
  return Number(((light + 0.05) / (dark + 0.05)).toFixed(2));
}

export function contrastRatioOrNull(foreground: string, background: string) {
  try {
    return contrastRatio(foreground, background);
  } catch {
    return null;
  }
}

export const TAP_TARGET_MIN_PX = 44;

export function tapTargetPasses(rect: { width: number; height: number }) {
  return rect.width >= TAP_TARGET_MIN_PX && rect.height >= TAP_TARGET_MIN_PX;
}

export function accessibleNamePasses(name: string | null | undefined) {
  return Boolean(name?.trim());
}

export function findingIdentity(viewport: Viewport, rule: FindingRule, auditId: string) {
  return `${viewport}:${rule}:${auditId}`;
}
