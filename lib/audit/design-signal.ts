export const DESIGN_SIGNAL_NODE_CAP = 1500;
export const DESIGN_SIGNAL_VALUE_CAP = 40;

export type DesignHistogram = {
  values: Array<{ value: string; count: number }>;
  omitted: number;
  kEff: number;
};

export type DesignAlignment = {
  left: DesignHistogram;
  right: DesignHistogram;
  distinctEdges: number;
  reuseFraction: number;
};

export type DesignScopeMetrics = {
  typeScale: DesignHistogram;
  textColors: DesignHistogram;
  surfaceColors: DesignHistogram;
  spacing: DesignHistogram;
  radii: DesignHistogram;
  shadows: DesignHistogram;
  alignment: DesignAlignment;
};

export type DesignSample = {
  fontSize: string;
  fontWeight: string;
  color: string;
  backgroundColor: string;
  spacing: string[];
  borderRadius: string;
  boxShadow: string;
  left: number;
  right: number;
  clippedArea: number;
  textChars: number;
  inFirstViewport: boolean;
  lineLengthChars?: number;
  lineHeightRatio?: number;
};

export type DesignSignal = {
  typeScale?: DesignHistogram;
  weights: DesignHistogram;
  textColors?: DesignHistogram;
  surfaceColors?: DesignHistogram;
  spacing?: DesignHistogram;
  radii?: DesignHistogram;
  shadows?: DesignHistogram;
  alignment?: { left: DesignHistogram; right: DesignHistogram } | DesignAlignment;
  firstViewport: DesignScopeMetrics & { contentArea: number; viewportArea: number };
  fullPage: DesignScopeMetrics;
  bodyText: { medianLineLengthChars: number | null; medianLineHeightRatio: number | null };
  nodesSampled: number;
  truncated: boolean;
};

function addCount(counts: Map<string, number>, value: string, amount = 1) {
  if (!value) return;
  counts.set(value, (counts.get(value) ?? 0) + amount);
}

export function effectiveCount(weights: Map<string, number>) {
  let total = 0;
  for (const weight of weights.values()) total += weight;
  if (total <= 0) return 0;
  let entropy = 0;
  for (const weight of weights.values()) {
    if (weight <= 0) continue;
    const share = weight / total;
    entropy -= share * Math.log(share);
  }
  return Math.round(Math.exp(entropy) * 1e6) / 1e6;
}

function reuseStats(left: Map<string, number>, right: Map<string, number>) {
  let distinctEdges = 0;
  let reused = 0;
  for (const counts of [left, right]) {
    for (const count of counts.values()) {
      distinctEdges += 1;
      if (count > 1) reused += 1;
    }
  }
  return {
    distinctEdges,
    reuseFraction: distinctEdges === 0 ? 0 : reused / distinctEdges,
  };
}

export function freezeHistogram(
  counts: Map<string, number>,
  cap = DESIGN_SIGNAL_VALUE_CAP,
  weights?: Map<string, number>,
): DesignHistogram {
  const ranked = [...counts.entries()].toSorted(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  );
  const mass = weights && [...weights.values()].some((weight) => weight > 0) ? weights : counts;
  return {
    values: ranked.slice(0, cap).map(([value, count]) => ({ value, count })),
    omitted: Math.max(0, ranked.length - cap),
    kEff: effectiveCount(mass),
  };
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const ranked = values.toSorted((left, right) => left - right);
  const mid = Math.floor(ranked.length / 2);
  return ranked.length % 2 === 1 ? ranked[mid]! : (ranked[mid - 1]! + ranked[mid]!) / 2;
}

function addWeighted(
  counts: Map<string, number>,
  weights: Map<string, number>,
  value: string,
  weight: number,
) {
  addCount(counts, value);
  if (weight > 0) addCount(weights, value, weight);
}

function accumulateScope(samples: readonly DesignSample[]): DesignScopeMetrics {
  const typeScale = new Map<string, number>();
  const typeWeight = new Map<string, number>();
  const textColors = new Map<string, number>();
  const textColorWeight = new Map<string, number>();
  const surfaceColors = new Map<string, number>();
  const surfaceWeight = new Map<string, number>();
  const spacing = new Map<string, number>();
  const spacingWeight = new Map<string, number>();
  const radii = new Map<string, number>();
  const radiiWeight = new Map<string, number>();
  const shadows = new Map<string, number>();
  const shadowWeight = new Map<string, number>();
  const leftEdges = new Map<string, number>();
  const rightEdges = new Map<string, number>();

  for (const sample of samples) {
    const chars = sample.textChars ?? 0;
    const area = sample.clippedArea;
    addWeighted(typeScale, typeWeight, sample.fontSize, chars);
    addWeighted(textColors, textColorWeight, sample.color, chars);
    addWeighted(surfaceColors, surfaceWeight, sample.backgroundColor, area);
    for (const value of sample.spacing) addWeighted(spacing, spacingWeight, value, area);
    addWeighted(radii, radiiWeight, sample.borderRadius, area);
    addWeighted(shadows, shadowWeight, sample.boxShadow, area);
    addCount(leftEdges, String(Math.round(sample.left)));
    addCount(rightEdges, String(Math.round(sample.right)));
  }

  return {
    typeScale: freezeHistogram(typeScale, DESIGN_SIGNAL_VALUE_CAP, typeWeight),
    textColors: freezeHistogram(textColors, DESIGN_SIGNAL_VALUE_CAP, textColorWeight),
    surfaceColors: freezeHistogram(surfaceColors, DESIGN_SIGNAL_VALUE_CAP, surfaceWeight),
    spacing: freezeHistogram(spacing, DESIGN_SIGNAL_VALUE_CAP, spacingWeight),
    radii: freezeHistogram(radii, DESIGN_SIGNAL_VALUE_CAP, radiiWeight),
    shadows: freezeHistogram(shadows, DESIGN_SIGNAL_VALUE_CAP, shadowWeight),
    alignment: {
      left: freezeHistogram(leftEdges),
      right: freezeHistogram(rightEdges),
      ...reuseStats(leftEdges, rightEdges),
    },
  };
}

export function designSignalFromSamples(
  samples: readonly DesignSample[],
  viewport: { width: number; height: number },
  walk: { nodesSampled: number; truncated: boolean },
): DesignSignal {
  const weights = new Map<string, number>();
  const lineLengths: number[] = [];
  const lineHeights: number[] = [];
  let contentArea = 0;

  for (const sample of samples) {
    addCount(weights, sample.fontWeight);
    contentArea += sample.clippedArea;
    if (sample.lineLengthChars !== undefined) lineLengths.push(sample.lineLengthChars);
    if (sample.lineHeightRatio !== undefined) lineHeights.push(sample.lineHeightRatio);
  }

  const fullPage = accumulateScope(samples);
  const firstViewport = accumulateScope(samples.filter((sample) => sample.inFirstViewport));

  return {
    weights: freezeHistogram(weights),
    firstViewport: {
      ...firstViewport,
      contentArea: Math.round(contentArea),
      viewportArea: Math.max(0, viewport.width * viewport.height),
    },
    fullPage,
    bodyText: {
      medianLineLengthChars: median(lineLengths),
      medianLineHeightRatio: median(lineHeights),
    },
    nodesSampled: walk.nodesSampled,
    truncated: walk.truncated,
  };
}

function clippedArea(rect: DOMRectReadOnly, viewport: { width: number; height: number }) {
  const width = Math.max(0, Math.min(rect.right, viewport.width) - Math.max(rect.left, 0));
  const height = Math.max(0, Math.min(rect.bottom, viewport.height) - Math.max(rect.top, 0));
  return width * height;
}

function ownTextChars(element: Element) {
  let chars = 0;
  for (const node of element.childNodes) {
    if (node.nodeType !== 3) continue;
    chars += (node.textContent ?? "").replace(/\s+/g, " ").trim().length;
  }
  return chars;
}

function textMetrics(element: Element, style: CSSStyleDeclaration) {
  const text = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
  if (text.length < 20 || element.childNodes.length !== 1) return {};
  const fontSize = Number.parseFloat(style.fontSize);
  const lineHeight = Number.parseFloat(style.lineHeight);
  return {
    lineLengthChars: text.length,
    lineHeightRatio: fontSize > 0 && lineHeight > 0 ? lineHeight / fontSize : undefined,
  };
}

export function collectDesignSignal(
  document: Document,
  view: Window,
  visible: (element: Element, view: Window) => boolean,
): DesignSignal {
  const viewport = {
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  };
  const samples: DesignSample[] = [];
  let truncated = false;
  const nodes = document.body ? document.body.querySelectorAll("*") : [];

  for (const element of nodes) {
    if (samples.length === DESIGN_SIGNAL_NODE_CAP) {
      truncated = true;
      break;
    }
    if (!visible(element, view)) continue;
    const style = view.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    samples.push({
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      color: style.color,
      backgroundColor: style.backgroundColor,
      spacing: [style.margin, style.padding, style.gap],
      borderRadius: style.borderRadius,
      boxShadow: style.boxShadow,
      left: rect.left,
      right: rect.right,
      clippedArea: clippedArea(rect, viewport),
      textChars: ownTextChars(element),
      inFirstViewport: rect.bottom > 0 && rect.top < viewport.height,
      ...textMetrics(element, style),
    });
  }

  return designSignalFromSamples(samples, viewport, {
    nodesSampled: samples.length,
    truncated,
  });
}

function asHistogram(value: unknown): DesignHistogram | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<DesignHistogram>;
  if (!Array.isArray(candidate.values)) return null;
  const values = candidate.values.filter(
    (entry): entry is { value: string; count: number } =>
      Boolean(entry) && typeof entry.value === "string" && typeof entry.count === "number",
  );
  const counts = new Map(values.map((entry) => [entry.value, entry.count]));
  return {
    values,
    omitted: typeof candidate.omitted === "number" ? candidate.omitted : 0,
    kEff: typeof candidate.kEff === "number" ? candidate.kEff : effectiveCount(counts),
  };
}

function asAlignment(value: unknown): DesignAlignment | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const left = asHistogram(candidate.left);
  const right = asHistogram(candidate.right);
  if (!left || !right) return null;
  const leftCounts = new Map(left.values.map((entry) => [entry.value, entry.count]));
  const rightCounts = new Map(right.values.map((entry) => [entry.value, entry.count]));
  const computed = reuseStats(leftCounts, rightCounts);
  return {
    left,
    right,
    distinctEdges:
      typeof candidate.distinctEdges === "number"
        ? candidate.distinctEdges
        : computed.distinctEdges,
    reuseFraction:
      typeof candidate.reuseFraction === "number"
        ? candidate.reuseFraction
        : computed.reuseFraction,
  };
}

function asScope(value: unknown): DesignScopeMetrics | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const typeScale = asHistogram(candidate.typeScale);
  const textColors = asHistogram(candidate.textColors);
  const surfaceColors = asHistogram(candidate.surfaceColors);
  const spacing = asHistogram(candidate.spacing);
  const radii = asHistogram(candidate.radii);
  const shadows = asHistogram(candidate.shadows);
  const alignment = asAlignment(candidate.alignment);
  if (!typeScale || !textColors || !surfaceColors || !spacing || !radii || !shadows || !alignment) {
    return null;
  }
  return { typeScale, textColors, surfaceColors, spacing, radii, shadows, alignment };
}

export function readDesignScopes(signal: unknown) {
  if (!signal || typeof signal !== "object") return null;
  const candidate = signal as Record<string, unknown>;
  const nested = asScope(candidate.fullPage);
  const fullPage = nested ?? asScope(candidate);
  if (!fullPage) return null;
  return {
    firstViewport: asScope(candidate.firstViewport),
    fullPage,
    truncated: candidate.truncated === true,
    nodesSampled: typeof candidate.nodesSampled === "number" ? candidate.nodesSampled : 0,
  };
}
