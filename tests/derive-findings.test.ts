import assert from "node:assert/strict";
import test from "node:test";

import { deriveFindings } from "../lib/audit/derive-findings";
import type { BrowserFacts } from "../lib/audit/dom";

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

test("browser facts become bounded, evidence-linked findings", () => {
  const findings = deriveFindings(baseline);

  assert.deepEqual(
    findings.map((finding) => finding.rule),
    ["horizontal-overflow", "accessible-name", "tap-target", "contrast", "content-clarity"],
  );
  assert.equal(findings[0]?.truth, "measured");
  assert.equal(findings.at(-1)?.truth, "judged");
  assert.match(findings[0]?.observation ?? "", /300 CSS px/);
  assert.ok(findings.every((finding) => finding.rect));
});

test("passing browser facts produce no findings", () => {
  const findings = deriveFindings({
    ...baseline,
    tapTargets: baseline.tapTargets.map((target) => ({
      ...target,
      rect: { ...target.rect, width: 48, height: 48 },
    })),
    controls: baseline.controls.map((control) => ({
      ...control,
      accessibleName: "Notifications",
    })),
    contrastSamples: baseline.contrastSamples.map((sample) => ({
      ...sample,
      foreground: "rgb(72, 78, 88)",
    })),
    overflow: { scrollWidth: 390, clientWidth: 390 },
    copy: {
      promise: "Find the product issues your team can fix today.",
      primaryAction: "Audit product",
      rect: baseline.copy!.rect,
    },
  });

  assert.deepEqual(findings, []);
});
