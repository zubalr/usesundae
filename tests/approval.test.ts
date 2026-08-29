import assert from "node:assert/strict";
import test from "node:test";

import { assertApprovedForActor, canonicalizeApprovedUrl } from "../lib/workbench/approval";

test("agents can capture only an exact URL approved by a human", () => {
  const approved = new Set([canonicalizeApprovedUrl("https://example.com/checkout?plan=pro#/pay")]);

  assert.equal(
    assertApprovedForActor("agent", "https://example.com/checkout?plan=pro#/pay", approved),
    "https://example.com/checkout?plan=pro#/pay",
  );
  assert.throws(
    () => assertApprovedForActor("agent", "https://example.com/checkout?plan=free#/pay", approved),
    /not been explicitly allowed or captured/i,
  );
  assert.equal(
    assertApprovedForActor("human", "https://example.com/another-page", approved),
    "https://example.com/another-page",
  );
});
