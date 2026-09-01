import assert from "node:assert/strict";
import test from "node:test";

import { findingsInReadingOrder } from "../lib/workbench/pin-order";

test("pin numbers follow top-to-bottom, then left-to-right visual order", () => {
  const ordered = findingsInReadingOrder([
    { id: "late", rect: { x: 40, y: 240, width: 20, height: 20 } },
    { id: "top-right", rect: { x: 200, y: 10, width: 20, height: 20 } },
    { id: "ghost", rect: null },
    { id: "top-left", rect: { x: 12, y: 10, width: 20, height: 20 } },
    { id: "mid", rect: { x: 80, y: 90, width: 20, height: 20 } },
  ]);

  assert.deepEqual(
    ordered.map((finding) => finding.id),
    ["top-left", "top-right", "mid", "late"],
  );
});
