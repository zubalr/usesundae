import assert from "node:assert/strict";
import test from "node:test";

import { summarizeAccessibilityTree } from "../lib/capture/accessibility";

test("summarizes semantic structure and identifies unnamed controls", () => {
  const summary = summarizeAccessibilityTree({
    role: "RootWebArea",
    name: "Launchpad",
    children: [
      { role: "heading", name: "Ship with confidence", level: 1 },
      { role: "button", name: "Start audit" },
      { role: "button", name: "" },
      { role: "link", name: "Documentation" },
      { role: "textbox", name: "Email", required: true },
      { role: "main", name: "Primary content" },
    ],
  });

  assert.equal(summary.rootName, "Launchpad");
  assert.equal(summary.nodeCount, 7);
  assert.equal(summary.interactiveCount, 4);
  assert.equal(summary.unnamedInteractiveCount, 1);
  assert.equal(summary.mainLandmarkCount, 1);
  assert.equal(summary.truncated, false);
  assert.deepEqual(summary.headingOutline, [{ level: 1, name: "Ship with confidence" }]);
  assert.equal(summary.nodes[2]?.role, "button");
  assert.equal(summary.nodes[2]?.name, "Unnamed button");
  assert.equal(summary.nodes[4]?.states.includes("required"), true);
});

test("counts a main landmark even when the exposed semantic-node list is truncated", () => {
  const summary = summarizeAccessibilityTree({
    role: "RootWebArea",
    children: [
      ...Array.from({ length: 90 }, (_, index) => ({
        role: "navigation",
        name: `Section ${index}`,
      })),
      { role: "main", name: "Primary content" },
    ],
  });

  assert.equal(summary.nodes.length, 80);
  assert.equal(summary.truncated, true);
  assert.equal(summary.mainLandmarkCount, 1);
});

test("bounds deeply nested untrusted trees", () => {
  let tree: Record<string, unknown> = { role: "button", name: "Deep action" };
  for (let index = 0; index < 40; index += 1) tree = { role: "group", children: [tree] };

  const summary = summarizeAccessibilityTree(tree);

  assert.ok(summary.nodeCount <= 301);
  assert.ok(summary.nodes.length <= 80);
  assert.equal(summary.truncated, true);
});

test("marks a wide tree truncated when the visited-node budget is reached", () => {
  const summary = summarizeAccessibilityTree({
    role: "RootWebArea",
    children: Array.from({ length: 400 }, (_, index) => ({
      role: "button",
      name: `Action ${index}`,
    })),
  });

  assert.equal(summary.nodeCount, 300);
  assert.equal(summary.truncated, true);
});
