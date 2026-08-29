import assert from "node:assert/strict";
import test from "node:test";

import { runReversibleTransition } from "../lib/workbench/transition";

test("aborting a preview rolls its visible state back before rejecting", async () => {
  const controller = new AbortController();
  let state: "baseline" | "improved" = "baseline";

  const transition = runReversibleTransition({
    signal: controller.signal,
    prepare: () =>
      new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener("abort", () => reject(controller.signal.reason), {
          once: true,
        });
      }),
    apply: () => {
      state = "improved";
    },
    rollback: () => {
      state = "baseline";
    },
  });

  assert.equal(state, "improved");
  controller.abort(new DOMException("Cancelled for test.", "AbortError"));
  await assert.rejects(transition, { name: "AbortError" });
  assert.equal(state, "baseline");
});
