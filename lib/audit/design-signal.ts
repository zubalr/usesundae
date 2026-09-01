export const DESIGN_SIGNAL_NODE_CAP = 1500;
export const DESIGN_SIGNAL_VALUE_CAP = 40;

export type DesignHistogram = {
  values: Array<{ value: string; count: number }>;
  omitted: number;
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
  lineLengthChars?: number;
  lineHeightRatio?: number;
};

export type DesignSignal = {
  typeScale: DesignHistogram;
  weights: DesignHistogram;
  textColors: DesignHistogram;
  surfaceColors: DesignHistogram;
  spacing: DesignHistogram;
  radii: DesignHistogram;
  shadows: DesignHistogram;
  alignment: { left: DesignHistogram; right: DesignHistogram };
  firstViewport: { contentArea: number; viewportArea: number };
  bodyText: { medianLineLengthChars: number | null; medianLineHeightRatio: number | null };
  nodesSampled: number;
  truncated: boolean;
};

function addCount(counts: Map<string, number>, value: string) {
  if (!value) return;
  counts.set(value, (counts.get(value) ?? 0) + 1);
}

export function freezeHistogram(
  counts: Map<string, number>,
  cap = DESIGN_SIGNAL_VALUE_CAP,
): DesignHistogram {
  const ranked = [...counts.entries()].toSorted(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  );
  return {
    values: ranked.slice(0, cap).map(([value, count]) => ({ value, count })),
    omitted: Math.max(0, ranked.length - cap),
  };
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const ranked = values.toSorted((left, right) => left - right);
  const mid = Math.floor(ranked.length / 2);
  return ranked.length % 2 === 1 ? ranked[mid]! : (ranked[mid - 1]! + ranked[mid]!) / 2;
}

export function designSignalFromSamples(
  samples: readonly DesignSample[],
  viewport: { width: number; height: number },
  walk: { nodesSampled: number; truncated: boolean },
): DesignSignal {
  const typeScale = new Map<string, number>();
  const weights = new Map<string, number>();
  const textColors = new Map<string, number>();
  const surfaceColors = new Map<string, number>();
  const spacing = new Map<string, number>();
  const radii = new Map<string, number>();
  const shadows = new Map<string, number>();
  const leftEdges = new Map<string, number>();
  const rightEdges = new Map<string, number>();
  const lineLengths: number[] = [];
  const lineHeights: number[] = [];
  let contentArea = 0;

  for (const sample of samples) {
    addCount(typeScale, sample.fontSize);
    addCount(weights, sample.fontWeight);
    addCount(textColors, sample.color);
    addCount(surfaceColors, sample.backgroundColor);
    for (const value of sample.spacing) addCount(spacing, value);
    addCount(radii, sample.borderRadius);
    addCount(shadows, sample.boxShadow);
    addCount(leftEdges, String(Math.round(sample.left)));
    addCount(rightEdges, String(Math.round(sample.right)));
    contentArea += sample.clippedArea;
    if (sample.lineLengthChars !== undefined) lineLengths.push(sample.lineLengthChars);
    if (sample.lineHeightRatio !== undefined) lineHeights.push(sample.lineHeightRatio);
  }

  return {
    typeScale: freezeHistogram(typeScale),
    weights: freezeHistogram(weights),
    textColors: freezeHistogram(textColors),
    surfaceColors: freezeHistogram(surfaceColors),
    spacing: freezeHistogram(spacing),
    radii: freezeHistogram(radii),
    shadows: freezeHistogram(shadows),
    alignment: {
      left: freezeHistogram(leftEdges),
      right: freezeHistogram(rightEdges),
    },
    firstViewport: {
      contentArea: Math.round(contentArea),
      viewportArea: Math.max(0, viewport.width * viewport.height),
    },
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
      ...textMetrics(element, style),
    });
  }

  return designSignalFromSamples(samples, viewport, {
    nodesSampled: samples.length,
    truncated,
  });
}
