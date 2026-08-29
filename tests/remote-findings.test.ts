import assert from "node:assert/strict";
import test from "node:test";

import {
  createJudgedFinding,
  deriveCheckpointFindings,
  snapshotFromCheckpoint,
} from "../lib/audit/remote";
import type { RemoteCheckpoint } from "../lib/capture/types";

function checkpoint(overrides: Partial<RemoteCheckpoint> = {}): RemoteCheckpoint {
  return {
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
    gaps: [
      {
        id: "gap-flow-states",
        label: "Unvisited flow states",
        detail: "Only one page was captured.",
      },
    ],
    preview: { applied: false },
    capture: { fullPage: false },
    ...overrides,
  };
}

test("remote checkpoints become bounded measured findings with checkpoint receipts", () => {
  const current = checkpoint();
  const findings = deriveCheckpointFindings(current);

  assert.deepEqual(
    findings.map((finding) => finding.rule),
    ["accessible-name", "heading-outline"],
  );
  assert.ok(findings.every((finding) => finding.truth === "measured"));
  assert.ok(findings.every((finding) => finding.checkpointId === current.id));
  assert.match(findings[0]!.observation, /2 of 4/);

  const snapshot = snapshotFromCheckpoint(current, findings);
  assert.equal(snapshot.demoState, "baseline");
  assert.deepEqual(snapshot.gaps, current.gaps);
});

test("remote checkpoints report missing document semantics as measured accessibility facts", () => {
  const missingMain = deriveCheckpointFindings(
    checkpoint({
      accessibility: {
        ...checkpoint().accessibility,
        unnamedInteractiveCount: 0,
        mainLandmarkCount: 0,
        headingOutline: [{ level: 1, name: "Example product" }],
        nodes: [{ role: "navigation", name: "Primary", states: [] }],
      },
    }),
  );
  const mainFinding = missingMain.find((finding) => finding.rule === "main-landmark");
  assert.equal(mainFinding?.measurement?.value, "0");
  assert.equal(mainFinding?.measurement?.threshold, "at least 1");
  assert.equal(mainFinding?.measurement?.unit, "main landmarks");

  const unnamedDocument = deriveCheckpointFindings(
    checkpoint({
      accessibility: {
        ...checkpoint().accessibility,
        rootName: "",
        unnamedInteractiveCount: 0,
        headingOutline: [{ level: 1, name: "Example product" }],
        nodes: [{ role: "main", name: "", states: [] }],
      },
    }),
  );
  const documentFinding = unnamedDocument.find((finding) => finding.rule === "document-name");
  assert.equal(documentFinding?.measurement?.value, "empty");
  assert.equal(documentFinding?.measurement?.threshold, "non-empty");
  assert.equal(documentFinding?.measurement?.unit, "accessible document name");
  assert.ok([mainFinding, documentFinding].every((finding) => finding?.truth === "measured"));
});

test("a truncated accessibility tree does not prove that the main landmark is absent", () => {
  const findings = deriveCheckpointFindings(
    checkpoint({
      accessibility: {
        ...checkpoint().accessibility,
        unnamedInteractiveCount: 0,
        mainLandmarkCount: 0,
        truncated: true,
        headingOutline: [{ level: 1, name: "Example product" }],
        nodes: [],
      },
    }),
  );

  assert.equal(
    findings.some((finding) => finding.rule === "main-landmark"),
    false,
  );
});

test("visual judgments are bounded, attributed to a screenshot, and remain judgments", () => {
  const finding = createJudgedFinding(
    checkpoint(),
    {
      title: "The primary action disappears into the card grid",
      observation: "The only emphasized action uses the same weight and color as secondary links.",
      whyItMatters: "A first-time visitor may not know where to begin.",
      recommendation: "Give the primary action a distinct treatment and clearer placement.",
      severity: "high",
    },
    3,
  );

  assert.equal(finding.rule, "visual-judgment");
  assert.equal(finding.truth, "judged");
  assert.equal(finding.measurement, null);
  assert.equal(finding.checkpointId, "checkpoint_1");
  assert.equal(finding.evidence?.kind, "screenshot");
  assert.match(finding.id, /^desktop:visual-judgment:/);
});

test("visual evidence regions cannot extend beyond the captured screenshot", () => {
  const finding = createJudgedFinding(
    checkpoint({ viewportSize: { width: 1440, height: 900 } }),
    {
      title: "The action is crowded against the edge",
      observation: "The action sits at the lower-right edge of the screenshot.",
      whyItMatters: "The boundary makes the control harder to distinguish.",
      recommendation: "Restore deliberate space around the action.",
      severity: "medium",
      rect: { x: 1400, y: 880, width: 300, height: 100 },
    },
    1,
  );

  assert.deepEqual(finding.rect, { x: 1400, y: 880, width: 40, height: 20 });
});

test("redacted URL states remain distinct verification scopes", () => {
  const free = checkpoint({
    id: "checkpoint_free",
    scopeId: "scope_free",
    target: { displayUrl: "https://example.com/checkout", origin: "https://example.com" },
  });
  const pro = checkpoint({
    id: "checkpoint_pro",
    scopeId: "scope_pro",
    target: { displayUrl: "https://example.com/checkout", origin: "https://example.com" },
  });

  const freeFinding = deriveCheckpointFindings(free)[0]!;
  const proFinding = deriveCheckpointFindings(pro)[0]!;
  assert.notEqual(freeFinding.id, proFinding.id);
  assert.equal(freeFinding.scopeKey, "scope_free");
  assert.equal(proFinding.scopeKey, "scope_pro");
});
