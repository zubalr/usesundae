import assert from "node:assert/strict";
import test from "node:test";

import { findingsWithBoardNumbers } from "../lib/workbench/pin-order";

test("a pin carries the number its finding has on the board, not its screen position", () => {
  const pins = findingsWithBoardNumbers([
    { id: "strongest", rect: { x: 40, y: 240, width: 20, height: 20 } },
    { id: "second", rect: { x: 200, y: 10, width: 20, height: 20 } },
    { id: "ghost", rect: null },
    { id: "third", rect: { x: 12, y: 10, width: 20, height: 20 } },
  ]);

  assert.deepEqual(
    pins.map((pin) => [pin.id, pin.boardNumber]),
    [
      ["strongest", 1],
      ["second", 2],
      ["third", 4],
    ],
  );
});

test("a finding without geometry keeps its board number for the list and draws no pin", () => {
  const pins = findingsWithBoardNumbers([
    { id: "no-region", rect: null },
    { id: "pinned", rect: { x: 10, y: 10, width: 20, height: 20 } },
  ]);

  assert.deepEqual(
    pins.map((pin) => pin.id),
    ["pinned"],
  );
  assert.equal(pins[0]?.boardNumber, 2);
});
