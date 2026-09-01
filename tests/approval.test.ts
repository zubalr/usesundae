import assert from "node:assert/strict";
import test from "node:test";

import {
  assertApprovedForActor,
  canonicalizeApprovedUrl,
  describeCaptureApproval,
  seedApprovedUrl,
  shouldAutoStartPublicCapture,
} from "../lib/workbench/approval";

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

test("approval normalizes bare public hostnames and rejects local targets", () => {
  assert.equal(canonicalizeApprovedUrl("linear.app"), "https://linear.app/");
  assert.throws(() => canonicalizeApprovedUrl("localhost:3000"), /public|http/i);
});

test("a human-supplied query URL is the session approval for agents", () => {
  assert.equal(seedApprovedUrl("linear.app"), "https://linear.app/");
  assert.equal(seedApprovedUrl("  "), null);
  assert.equal(seedApprovedUrl("localhost"), null);

  const seeded = seedApprovedUrl("linear.app");
  assert.ok(seeded);
  const approved = new Set([seeded]);
  assert.equal(assertApprovedForActor("agent", "linear.app", approved), "https://linear.app/");
  assert.throws(
    () => assertApprovedForActor("agent", "https://todoist.com/", approved),
    /not been explicitly allowed or captured/i,
  );
});

test("a valid public workspace URL auto-starts capture and states the session approval", () => {
  assert.equal(
    shouldAutoStartPublicCapture({
      mode: "remote",
      initialUrl: "linear.app",
      hasCheckpoint: false,
    }),
    true,
  );
  assert.equal(
    shouldAutoStartPublicCapture({
      mode: "remote",
      initialUrl: "linear.app",
      hasCheckpoint: true,
    }),
    false,
  );
  assert.equal(
    shouldAutoStartPublicCapture({
      mode: "sample",
      initialUrl: "linear.app",
      hasCheckpoint: false,
    }),
    false,
  );
  assert.equal(
    describeCaptureApproval({
      mode: "remote",
      hasCheckpoint: false,
      currentUrlApproved: true,
    }),
    "Human-supplied target approved for this session",
  );
  assert.equal(
    describeCaptureApproval({
      mode: "sample",
      hasCheckpoint: false,
      currentUrlApproved: false,
    }),
    "Included target; no public capture grant",
  );
});
