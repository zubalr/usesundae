import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { deriveFindings } from "../lib/audit/derive-findings";
import { designSignalFromSamples, type DesignSample } from "../lib/audit/design-signal";
import type { BrowserFacts } from "../lib/audit/dom";
import { deriveCheckpointFindings } from "../lib/audit/remote";
import { collectSiteToolFindings } from "../lib/audit/tools";
import type { Finding } from "../lib/audit/types";
import type { RemoteCheckpoint } from "../lib/capture/types";

const PROHIBITED = [
  /\btoo many\b/i,
  /\bideal\b/i,
  /competing for attention/i,
  /\bvibe\b/i,
  /should be\s+\d/i,
  /\bscore\b/i,
  /\bconversion\b/i,
  /will convert/i,
  /looks bad/i,
  /poor design/i,
  /wrong hierarchy/i,
];

function sample(overrides: Partial<DesignSample> = {}): DesignSample {
  return {
    fontSize: "16px",
    fontWeight: "400",
    color: "rgb(20, 20, 20)",
    backgroundColor: "rgb(255, 255, 255)",
    spacing: ["16px"],
    borderRadius: "4px",
    boxShadow: "none",
    left: 24,
    right: 360,
    clippedArea: 800,
    textChars: 32,
    inFirstViewport: true,
    ...overrides,
  };
}

const demoFacts: BrowserFacts = {
  viewport: "mobile",
  viewportSize: { width: 390, height: 700 },
  tapTargets: [
    {
      auditId: "primary-action",
      identityConfidence: "stable",
      label: "Create report",
      rect: { x: 310, y: 88, width: 36, height: 36 },
    },
  ],
  controls: [
    {
      auditId: "notifications",
      identityConfidence: "stable",
      label: "notification control",
      accessibleName: "",
      rect: { x: 342, y: 18, width: 40, height: 40 },
    },
  ],
  contrastSamples: [
    {
      auditId: "helper-copy",
      identityConfidence: "stable",
      label: "plan helper copy",
      foreground: "rgb(139, 143, 150)",
      background: "rgb(255, 255, 255)",
      rect: { x: 24, y: 310, width: 250, height: 18 },
    },
  ],
  overflow: { scrollWidth: 690, clientWidth: 390 },
  copy: {
    promise: "Find the product issues your team can fix today.",
    primaryAction: "Audit product",
    rect: { x: 24, y: 120, width: 330, height: 116 },
  },
  designSignal: designSignalFromSamples(
    [
      sample(),
      sample({
        fontSize: "12px",
        color: "rgb(80, 80, 80)",
        spacing: ["8px"],
        borderRadius: "0px",
        boxShadow: "0 1px 2px rgb(0, 0, 0)",
        left: 48,
        inFirstViewport: false,
      }),
    ],
    { width: 390, height: 700 },
    { nodesSampled: 2, truncated: false },
  ),
};

function findingCopy(finding: Finding) {
  return [
    finding.title,
    finding.observation,
    finding.whyItMatters,
    finding.recommendation,
    finding.measurement?.value,
    finding.measurement?.threshold,
    finding.measurement?.unit,
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n");
}

function prohibitedIn(text: string) {
  return PROHIBITED.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
}

function assertClean(label: string, text: string) {
  const hits = prohibitedIn(text);
  assert.deepEqual(hits, [], `${label} contains prohibited design claims: ${hits.join(", ")}`);
}

function copyLiterals(source: string) {
  const literals: string[] = [];
  const keyed =
    /(?:title|observation|whyItMatters|recommendation):\s*(?:`([^`]+)`|"((?:\\.|[^"\\])*)")/g;
  for (const match of source.matchAll(keyed)) {
    literals.push(match[1] ?? match[2] ?? "");
  }
  const measurement = /(?:value|threshold|unit):\s*(?:`([^`]+)`|"((?:\\.|[^"\\])*)")/g;
  for (const match of source.matchAll(measurement)) {
    literals.push(match[1] ?? match[2] ?? "");
  }
  return literals;
}

test("deriveFindings copy never makes a prohibited design claim", () => {
  const produced = [
    ...deriveFindings(demoFacts),
    ...deriveFindings({ ...demoFacts, designSignal: undefined }),
    ...collectSiteToolFindings([], "mobile"),
  ];
  for (const finding of produced) {
    assertClean(`${finding.id} ${finding.rule}`, findingCopy(finding));
  }
});

test("checkpoint and source finding copy never makes a prohibited design claim", () => {
  const checkpoint: RemoteCheckpoint = {
    id: "checkpoint_1",
    scopeId: "scope_example_path",
    source: "cloudflare",
    capturedAt: "2030-01-01T10:00:00.000Z",
    target: { displayUrl: "https://example.com/path", origin: "https://example.com" },
    title: "Example product",
    status: 200,
    viewport: "desktop",
    viewportSize: { width: 1440, height: 900 },
    screenshotDataUrl: "data:image/png;base64,c2NyZWVu",
    textExcerpt: "# Example product",
    accessibility: {
      rootName: "Example product",
      nodeCount: 12,
      interactiveCount: 4,
      unnamedInteractiveCount: 2,
      mainLandmarkCount: 1,
      headingOutline: [
        { level: 2, name: "Features" },
        { level: 4, name: "Details" },
      ],
      nodes: [{ role: "main", name: "", states: [] }],
    },
    gaps: [],
    preview: { applied: false },
    capture: { fullPage: false },
    visibleNav: [],
    facts: demoFacts,
  };
  for (const finding of deriveCheckpointFindings(checkpoint)) {
    assertClean(`${finding.id} ${finding.rule}`, findingCopy(finding));
  }

  const auditDir = join(process.cwd(), "lib", "audit");
  for (const fileName of readdirSync(auditDir)) {
    if (!fileName.endsWith(".ts")) continue;
    const source = readFileSync(join(auditDir, fileName), "utf8");
    for (const literal of copyLiterals(source)) {
      assertClean(`lib/audit/${fileName} literal`, literal);
    }
  }
});
