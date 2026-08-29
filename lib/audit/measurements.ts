import type { FindingRule, Viewport } from "./types";

type Rgb = { r: number; g: number; b: number };

function channelToLinear(channel: number) {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function parseHex(value: string): Rgb | null {
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
  };
}

function parseRgb(value: string): Rgb | null {
  const match = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (!match) return null;
  const [r, g, b] = match.slice(1, 4).map(Number);
  if ([r, g, b].some((channel) => !Number.isFinite(channel))) return null;
  return { r, g, b };
}

export function parseCssColor(value: string): Rgb {
  const normalized = value.trim().toLowerCase();
  const parsed = normalized.startsWith("#") ? parseHex(normalized) : parseRgb(normalized);
  if (!parsed) throw new Error(`Unsupported CSS color: ${value}`);
  return parsed;
}

function luminance(color: Rgb) {
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

export function tapTargetPasses(rect: { width: number; height: number }) {
  return rect.width >= 44 && rect.height >= 44;
}

export function accessibleNamePasses(name: string | null | undefined) {
  return Boolean(name?.trim());
}

export function findingIdentity(viewport: Viewport, rule: FindingRule, auditId: string) {
  return `${viewport}:${rule}:${auditId}`;
}
