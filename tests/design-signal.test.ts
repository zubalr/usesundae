import assert from "node:assert/strict";
import test from "node:test";
import { createContext, runInContext } from "node:vm";

import { deriveFindings } from "../lib/audit/derive-findings";
import type { BrowserFacts } from "../lib/audit/dom";
import {
  DESIGN_SIGNAL_VALUE_CAP,
  designSignalFromSamples,
  freezeHistogram,
  type DesignSample,
} from "../lib/audit/design-signal";
import { MODEL_CONTEXT_OBSERVER_SOURCE } from "../lib/capture/observe-site-tools";
import { hasDefensibleThreshold, NO_DEFENSIBLE_THRESHOLD, type Finding } from "../lib/audit/types";

const baseline: BrowserFacts = {
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
    promise: "Operational intelligence for teams who need visibility across their workflows.",
    primaryAction: "Initialize workspace",
    rect: { x: 24, y: 120, width: 330, height: 116 },
  },
};

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
    clippedArea: 1200,
    textChars: 50,
    inFirstViewport: true,
    ...overrides,
  };
}

function signalFindings(facts: BrowserFacts): Finding[] {
  return deriveFindings(facts).filter((finding) => finding.rule === "design-signal");
}

test("histogram keeps the loudest values and reports omitted distinct counts", () => {
  const counts = new Map<string, number>();
  for (let index = 0; index < DESIGN_SIGNAL_VALUE_CAP + 5; index += 1) {
    counts.set(`${index}px`, index + 1);
  }
  const histogram = freezeHistogram(counts);
  assert.equal(histogram.values.length, DESIGN_SIGNAL_VALUE_CAP);
  assert.equal(histogram.omitted, 5);
  assert.equal(histogram.values[0]?.value, `${DESIGN_SIGNAL_VALUE_CAP + 4}px`);
  assert.equal(
    histogram.values.reduce((sum, entry) => sum + entry.count, 0) +
      [...counts.entries()].slice(0, 5).reduce((sum, [, count]) => sum + count, 0),
    [...counts.values()].reduce((sum, count) => sum + count, 0),
  );
});

test("K_eff uses the full sampled distribution, not the truncated top-40 list", () => {
  const counts = new Map<string, number>();
  for (let index = 0; index < DESIGN_SIGNAL_VALUE_CAP + 5; index += 1) {
    counts.set(`${index}px`, 1);
  }
  const histogram = freezeHistogram(counts);
  assert.equal(histogram.values.length, DESIGN_SIGNAL_VALUE_CAP);
  assert.equal(histogram.omitted, 5);
  assert.equal(histogram.kEff, DESIGN_SIGNAL_VALUE_CAP + 5);
});

test("equal character shares of two font sizes have K_eff 2", () => {
  const signal = designSignalFromSamples(
    [
      sample({ fontSize: "16px", textChars: 40, clippedArea: 800 }),
      sample({ fontSize: "12px", textChars: 40, clippedArea: 400, left: 48, right: 200 }),
    ],
    { width: 390, height: 700 },
    { nodesSampled: 2, truncated: false },
  );
  assert.equal(signal.fullPage.typeScale.values.length + signal.fullPage.typeScale.omitted, 2);
  assert.equal(signal.fullPage.typeScale.kEff, 2);
});

test("character weight, not element count, drives type K_eff", () => {
  const signal = designSignalFromSamples(
    [
      sample({ fontSize: "16px", textChars: 98, clippedArea: 100 }),
      sample({ fontSize: "11px", textChars: 1, clippedArea: 100, left: 80 }),
      sample({ fontSize: "11px", textChars: 1, clippedArea: 100, left: 120 }),
    ],
    { width: 390, height: 700 },
    { nodesSampled: 3, truncated: false },
  );
  // 98:2 character split of two sizes → K_eff ≈ 1.103, not the 2:1 element split ≈ 1.89.
  assert.equal(signal.fullPage.typeScale.values.length + signal.fullPage.typeScale.omitted, 2);
  assert.ok(Math.abs(signal.fullPage.typeScale.kEff - 1.103) < 0.01);
});

test("design signal records raw distinct values without judging them", () => {
  const signal = designSignalFromSamples(
    [
      sample({
        fontWeight: "400",
        spacing: ["0px", "16px", "8px"],
        lineLengthChars: 72,
        lineHeightRatio: 1.5,
      }),
      sample({
        fontWeight: "700",
        backgroundColor: "rgba(0, 0, 0, 0)",
        spacing: ["8px"],
        borderRadius: "0px",
        boxShadow: "0 1px 2px rgb(0, 0, 0)",
        left: 24.4,
        right: 200.8,
        clippedArea: 400,
        textChars: 40,
        lineLengthChars: 40,
        lineHeightRatio: 1.25,
      }),
    ],
    { width: 390, height: 700 },
    { nodesSampled: 2, truncated: false },
  );

  assert.equal(signal.fullPage.typeScale.values.find((entry) => entry.value === "16px")?.count, 2);
  assert.equal(signal.weights.values.length, 2);
  assert.equal(signal.fullPage.alignment.left.values[0]?.value, "24");
  assert.equal(signal.fullPage.alignment.left.values[0]?.count, 2);
  assert.equal(signal.firstViewport.viewportArea, 390 * 700);
  assert.equal(signal.firstViewport.contentArea, 1600);
  assert.equal(signal.bodyText.medianLineLengthChars, 56);
  assert.equal(signal.bodyText.medianLineHeightRatio, 1.375);
  assert.equal(signal.truncated, false);
});

test("alignment reports distinct edges and reuse fraction, not K_eff", () => {
  const signal = designSignalFromSamples(
    [
      sample({ left: 24, right: 360 }),
      sample({ left: 24, right: 360, fontSize: "12px" }),
      sample({ left: 100, right: 200, fontSize: "11px" }),
    ],
    { width: 390, height: 700 },
    { nodesSampled: 3, truncated: false },
  );
  assert.equal(signal.fullPage.alignment.distinctEdges, 4);
  assert.equal(signal.fullPage.alignment.reuseFraction, 0.5);
});

test("first-viewport histograms exclude samples below the fold", () => {
  const signal = designSignalFromSamples(
    [
      sample({ fontSize: "16px", textChars: 20 }),
      sample({
        fontSize: "11px",
        textChars: 20,
        inFirstViewport: false,
        left: 8,
        right: 40,
      }),
    ],
    { width: 390, height: 700 },
    { nodesSampled: 2, truncated: false },
  );
  assert.equal(signal.firstViewport.typeScale.values.length, 1);
  assert.equal(signal.fullPage.typeScale.values.length, 2);
});

test("a truncated walk reports the cap instead of silently dropping the tail", () => {
  const signal = designSignalFromSamples(
    [],
    { width: 1440, height: 900 },
    { nodesSampled: 1500, truncated: true },
  );
  assert.equal(signal.truncated, true);
  assert.equal(signal.nodesSampled, 1500);
});

test("a measurement without a cutoff is descriptive, not a failure", () => {
  assert.equal(
    hasDefensibleThreshold({
      value: "8",
      threshold: NO_DEFENSIBLE_THRESHOLD,
      unit: "font sizes",
      direction: "descriptive",
      provenance: "none",
    }),
    false,
  );
  assert.equal(
    hasDefensibleThreshold({
      value: "3.2:1",
      threshold: "4.5:1",
      unit: "contrast ratio",
      direction: "lower-is-worse",
      provenance: "standard",
    }),
    true,
  );
});

test("missing designSignal still emits no design-signal findings", () => {
  const findings = deriveFindings(baseline);
  assert.equal(findings.filter((finding) => finding.rule === "design-signal").length, 0);
  assert.deepEqual(
    findings.map((finding) => finding.rule),
    ["horizontal-overflow", "accessible-name", "contrast", "tap-target"],
  );
});

test("designSignal becomes MEASUREMENT receipts with no defensible threshold", () => {
  const facts: BrowserFacts = {
    ...baseline,
    designSignal: designSignalFromSamples(
      [
        sample({ fontSize: "16px", textChars: 40, color: "rgb(20, 20, 20)" }),
        sample({
          fontSize: "12px",
          textChars: 40,
          color: "rgb(80, 80, 80)",
          backgroundColor: "rgb(250, 250, 250)",
          spacing: ["8px"],
          borderRadius: "0px",
          boxShadow: "0 1px 2px rgb(0, 0, 0)",
          left: 48,
          right: 200,
        }),
      ],
      baseline.viewportSize,
      { nodesSampled: 2, truncated: false },
    ),
  };
  const receipts = signalFindings(facts);
  const thresholded = deriveFindings(facts).filter((finding) => finding.rule !== "design-signal");

  assert.equal(receipts.length, 5);
  assert.ok(receipts.every((finding) => finding.claimType === "MEASUREMENT"));
  assert.ok(receipts.every((finding) => finding.truth === "measured"));
  assert.ok(receipts.every((finding) => finding.severity === undefined));
  assert.ok(
    receipts.every(
      (finding) =>
        finding.measurement?.threshold === NO_DEFENSIBLE_THRESHOLD &&
        finding.measurement.direction === "descriptive" &&
        finding.measurement.provenance === "none" &&
        hasDefensibleThreshold(finding.measurement) === false,
    ),
  );
  assert.ok(
    receipts.every((finding) =>
      finding.observation.includes("No universal quality threshold exists."),
    ),
  );
  assert.ok(
    receipts.every(
      (finding) =>
        finding.observation.includes("The first viewport contains") &&
        finding.observation.includes("The full page contains"),
    ),
  );
  assert.equal(
    receipts.some((finding) =>
      /whitespace|focal|competing for attention/i.test(finding.observation),
    ),
    false,
  );
  assert.deepEqual(
    thresholded.map((finding) => finding.rule),
    ["horizontal-overflow", "accessible-name", "contrast", "tap-target"],
  );
  assert.equal(thresholded[0]?.measurement?.provenance, "standard");
  assert.equal(hasDefensibleThreshold(thresholded[0]?.measurement), true);
});

test("font-size receipts state K and K_eff without a verdict", () => {
  const receipts = signalFindings({
    ...baseline,
    tapTargets: [],
    controls: [],
    contrastSamples: [],
    overflow: { scrollWidth: 390, clientWidth: 390 },
    designSignal: designSignalFromSamples(
      [
        sample({ fontSize: "16px", textChars: 40 }),
        sample({ fontSize: "12px", textChars: 40, left: 80 }),
      ],
      baseline.viewportSize,
      { nodesSampled: 2, truncated: false },
    ),
  });
  const fontSizes = receipts.find((finding) => /font sizes/i.test(finding.title));
  assert.equal(
    fontSizes?.observation,
    "The first viewport contains 2 exact font sizes; character-weighted effective count is 2.0. The full page contains 2 exact font sizes; character-weighted effective count is 2.0. No universal quality threshold exists.",
  );
});

test("the capture host shim records tools and never invokes them", async () => {
  const document: { modelContext?: ModelContext } = {};
  const sandbox = createContext({ document });
  runInContext(MODEL_CONTEXT_OBSERVER_SOURCE, sandbox);

  let invoked = false;
  const tool: WebMcpTool = {
    name: "sundae_lab_archive_workflow",
    description:
      "Archive a workflow in the controlled fixture and remove it from the visible list.",
    inputSchema: { type: "object", additionalProperties: true },
    annotations: { readOnlyHint: true },
    execute: async () => {
      invoked = true;
      return { content: [{ type: "text", text: "mutated" }] };
    },
  };

  await document.modelContext?.registerTool(tool);
  const tools = await document.modelContext?.getTools?.();
  assert.equal(tools?.[0]?.name, "sundae_lab_archive_workflow");
  assert.equal(tools?.[0]?.annotations?.readOnlyHint, true);
  await assert.rejects(
    async () => document.modelContext?.executeTool?.(tools![0]!, "{}"),
    /never invokes|observation only/i,
  );
  assert.equal(invoked, false);
});
