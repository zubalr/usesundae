import assert from "node:assert/strict";
import test from "node:test";

import { deriveFindings, isAuditableSurface } from "../lib/audit/derive-findings";
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
    ["horizontal-overflow", "accessible-name", "contrast", "tap-target"],
  );
  assert.ok(findings.every((finding) => finding.truth === "measured"));
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

test("an unparseable contrast sample is skipped without failing the audit", () => {
  const findings = deriveFindings({
    ...baseline,
    tapTargets: [],
    controls: [],
    overflow: { scrollWidth: 390, clientWidth: 390 },
    contrastSamples: [
      {
        auditId: "unparseable-copy",
        identityConfidence: "stable",
        label: "oklch helper",
        foreground: "oklch(0.72 0.12 230)",
        background: "color-mix(in srgb, black 40%, white)",
        rect: { x: 24, y: 200, width: 250, height: 18 },
      },
      baseline.contrastSamples[0]!,
    ],
  });

  assert.deepEqual(
    findings.map((finding) => finding.auditId),
    ["helper-copy"],
  );
  assert.equal(findings[0]?.rule, "contrast");
});

test("invisible rects are not audit surfaces", () => {
  const viewportWidth = 390;
  assert.equal(isAuditableSurface(null, viewportWidth), true);
  assert.equal(isAuditableSurface({ x: 10, y: 10, width: 40, height: 40 }, viewportWidth), true);
  assert.equal(isAuditableSurface({ x: 10, y: 10, width: 1, height: 1 }, viewportWidth), false);
  assert.equal(isAuditableSurface({ x: 10, y: 10, width: 20, height: 7 }, viewportWidth), false);
  assert.equal(isAuditableSurface({ x: 10, y: 10, width: 10, height: 10 }, viewportWidth), false);
  assert.equal(isAuditableSurface({ x: -40, y: 10, width: 40, height: 40 }, viewportWidth), false);
  assert.equal(isAuditableSurface({ x: 390, y: 10, width: 40, height: 40 }, viewportWidth), false);
  assert.equal(isAuditableSurface({ x: 10, y: -1, width: 40, height: 40 }, viewportWidth), false);
  assert.equal(isAuditableSurface({ x: 10, y: 800, width: 40, height: 40 }, viewportWidth), true);
});

test("deriveFindings drops targets that are not a real visible surface", () => {
  const findings = deriveFindings({
    ...baseline,
    controls: [],
    contrastSamples: [],
    overflow: { scrollWidth: 390, clientWidth: 390 },
    tapTargets: [
      {
        auditId: "hidden-input",
        identityConfidence: "unstable",
        label: "hidden input",
        rect: { x: 0, y: 0, width: 1, height: 1 },
      },
      {
        auditId: "offscreen-control",
        identityConfidence: "unstable",
        label: "offscreen control",
        rect: { x: 400, y: 80, width: 40, height: 40 },
      },
      {
        auditId: "icon-button",
        identityConfidence: "stable",
        label: "Create report",
        rect: { x: 310, y: 88, width: 36, height: 36 },
      },
    ],
  });

  assert.deepEqual(
    findings.map((finding) => finding.auditId),
    ["icon-button"],
  );
  assert.ok(findings.every((finding) => finding.rect && finding.rect.width >= 8));
});

function contrastSample(
  auditId: string,
  label: string,
  rect: BrowserFacts["contrastSamples"][number]["rect"],
  colors: { foreground: string; background: string } = {
    foreground: "rgb(139, 143, 150)",
    background: "rgb(255, 255, 255)",
  },
): BrowserFacts["contrastSamples"][number] {
  return { auditId, identityConfidence: "stable", label, rect, ...colors };
}

test("contrast findings group by colour pair and keep the census tail countable", () => {
  const findings = deriveFindings({
    ...baseline,
    tapTargets: [],
    controls: [],
    overflow: { scrollWidth: 390, clientWidth: 390 },
    contrastSamples: [
      contrastSample("muted-nav", "Pricing", { x: 24, y: 400, width: 80, height: 16 }),
      contrastSample("muted-footer", "Privacy", { x: 24, y: 680, width: 52, height: 16 }),
      contrastSample(
        "cta-label",
        "Start for free",
        { x: 24, y: 24, width: 220, height: 48 },
        {
          foreground: "rgb(255, 255, 255)",
          background: "rgb(235, 75, 75)",
        },
      ),
    ],
  });

  assert.equal(findings.length, 2);
  assert.equal(findings[0]?.auditId, "cta-label");
  assert.equal(findings[0]?.instanceCount, 1);
  assert.equal(findings[0]?.aboveTheFold, true);
  assert.match(findings[0]?.groupKey ?? "", /rgb\(255, 255, 255\)/);
  assert.equal(findings[1]?.instanceCount, 2);
  assert.equal(findings[1]?.auditId, "muted-nav");
  assert.match(findings[1]?.observation ?? "", /2 instances · worst shown/);
  assert.equal(findings[1]?.measurement?.value, "3.25:1");
});

test("tap targets group by shape class while other rules stay per instance", () => {
  const findings = deriveFindings({
    ...baseline,
    controls: [
      {
        auditId: "ghost-one",
        identityConfidence: "stable",
        label: "icon one",
        accessibleName: "",
        rect: { x: 10, y: 10, width: 40, height: 40 },
      },
      {
        auditId: "ghost-two",
        identityConfidence: "stable",
        label: "icon two",
        accessibleName: "",
        rect: { x: 60, y: 10, width: 40, height: 40 },
      },
    ],
    contrastSamples: [],
    overflow: { scrollWidth: 390, clientWidth: 390 },
    tapTargets: [
      {
        auditId: "icon-one",
        identityConfidence: "stable",
        label: "Search",
        rect: { x: 12, y: 12, width: 36, height: 36 },
      },
      {
        auditId: "icon-two",
        identityConfidence: "stable",
        label: "Menu",
        rect: { x: 56, y: 12, width: 36, height: 36 },
      },
      {
        auditId: "inline-link",
        identityConfidence: "stable",
        label: "Learn more",
        rect: { x: 12, y: 80, width: 90, height: 18 },
      },
      {
        auditId: "wide-button",
        identityConfidence: "stable",
        label: "Continue",
        rect: { x: 12, y: 140, width: 160, height: 36 },
      },
    ],
  });

  const tapGroups = findings.filter((finding) => finding.rule === "tap-target");
  const nameFindings = findings.filter((finding) => finding.rule === "accessible-name");

  assert.deepEqual(
    tapGroups.map((finding) => [finding.groupKey, finding.instanceCount, finding.auditId]),
    [
      ["button or tile", 1, "wide-button"],
      ["inline text link", 1, "inline-link"],
      ["icon control", 2, "icon-one"],
    ],
  );
  assert.match(tapGroups[2]?.observation ?? "", /2 instances · worst shown/);
  assert.equal(nameFindings.length, 2);
  assert.deepEqual(nameFindings.map((finding) => finding.auditId).toSorted(), [
    "ghost-one",
    "ghost-two",
  ]);
});
