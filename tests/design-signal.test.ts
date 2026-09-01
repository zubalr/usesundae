import assert from "node:assert/strict";
import test from "node:test";
import { createContext, runInContext } from "node:vm";

import { deriveFindings } from "../lib/audit/derive-findings";
import type { BrowserFacts } from "../lib/audit/dom";
import {
  DESIGN_SIGNAL_VALUE_CAP,
  designSignalFromSamples,
  freezeHistogram,
} from "../lib/audit/design-signal";
import { MODEL_CONTEXT_OBSERVER_SOURCE } from "../lib/capture/observe-site-tools";

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

test("design signal records raw distinct values without judging them", () => {
  const signal = designSignalFromSamples(
    [
      {
        fontSize: "16px",
        fontWeight: "400",
        color: "rgb(20, 20, 20)",
        backgroundColor: "rgb(255, 255, 255)",
        spacing: ["0px", "16px", "8px"],
        borderRadius: "4px",
        boxShadow: "none",
        left: 24.4,
        right: 360.2,
        clippedArea: 1200,
        lineLengthChars: 72,
        lineHeightRatio: 1.5,
      },
      {
        fontSize: "16px",
        fontWeight: "700",
        color: "rgb(20, 20, 20)",
        backgroundColor: "rgba(0, 0, 0, 0)",
        spacing: ["8px"],
        borderRadius: "0px",
        boxShadow: "0 1px 2px rgb(0, 0, 0)",
        left: 24.4,
        right: 200.8,
        clippedArea: 400,
        lineLengthChars: 40,
        lineHeightRatio: 1.25,
      },
    ],
    { width: 390, height: 700 },
    { nodesSampled: 2, truncated: false },
  );

  assert.equal(signal.typeScale.values.find((entry) => entry.value === "16px")?.count, 2);
  assert.equal(signal.weights.values.length, 2);
  assert.equal(signal.alignment.left.values[0]?.value, "24");
  assert.equal(signal.alignment.left.values[0]?.count, 2);
  assert.equal(signal.firstViewport.viewportArea, 390 * 700);
  assert.equal(signal.firstViewport.contentArea, 1600);
  assert.equal(signal.bodyText.medianLineLengthChars, 56);
  assert.equal(signal.bodyText.medianLineHeightRatio, 1.375);
  assert.equal(signal.truncated, false);
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

test("designSignal never becomes a derived finding", () => {
  const withoutSignal = deriveFindings(baseline);
  const withSignal = deriveFindings({
    ...baseline,
    designSignal: designSignalFromSamples(
      [
        {
          fontSize: "11px",
          fontWeight: "100",
          color: "rgb(200, 200, 200)",
          backgroundColor: "rgb(255, 255, 255)",
          spacing: ["2px", "3px", "5px", "8px", "13px"],
          borderRadius: "99px",
          boxShadow: "0 40px 80px rgb(0, 0, 0)",
          left: 1,
          right: 389,
          clippedArea: 12,
          lineLengthChars: 140,
          lineHeightRatio: 0.9,
        },
      ],
      baseline.viewportSize,
      { nodesSampled: 1, truncated: false },
    ),
  });

  assert.deepEqual(
    withSignal.map((finding) => finding.rule),
    withoutSignal.map((finding) => finding.rule),
  );
  assert.equal(withSignal.length, withoutSignal.length);
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
