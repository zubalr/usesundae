import assert from "node:assert/strict";
import test from "node:test";

import { LatestOperation } from "../lib/workbench/latest-operation";

test("only the latest asynchronous mutation may commit", () => {
  const operations = new LatestOperation();
  const first = operations.begin();
  const second = operations.begin();

  assert.throws(() => operations.assertCurrent(first), { name: "AbortError" });
  assert.doesNotThrow(() => operations.assertCurrent(second));
});

test("an invocation abort prevents a current operation from committing", () => {
  const operations = new LatestOperation();
  const current = operations.begin();
  const controller = new AbortController();
  controller.abort(new DOMException("Cancelled", "AbortError"));

  assert.throws(() => operations.assertCurrent(current, controller.signal), { name: "AbortError" });
});

test("one composite action can validate several sequential checkpoints", () => {
  const operations = new LatestOperation();
  const composite = operations.begin();

  assert.doesNotThrow(() => operations.assertCurrent(composite));
  assert.doesNotThrow(() => operations.assertCurrent(composite));

  operations.begin();
  assert.throws(() => operations.assertCurrent(composite), { name: "AbortError" });
});
