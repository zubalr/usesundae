import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptFollowThroughKind,
  acceptFollowThroughReceipt,
  runAcceptFollowThrough,
} from "../lib/workbench/accept-follow-through";
import { captureProgressLabel } from "../lib/workbench/capture-progress";

test("accepting a finding previews then verifies when a preview payload exists", () => {
  assert.equal(
    acceptFollowThroughKind({ decision: "accepted", mode: "sample", previewCss: "" }),
    "preview_then_verify",
  );
  assert.equal(
    acceptFollowThroughKind({
      decision: "accepted",
      mode: "remote",
      previewCss: ".primary { min-height: 2.75rem; }",
    }),
    "preview_then_verify",
  );
  assert.match(
    acceptFollowThroughReceipt(
      "preview_then_verify",
      "Recorded a reversible accepted decision for mobile:contrast:primary-action.",
    ),
    /Accepted · previewed and verified/,
  );
});

test("accepting a public finding without proposed CSS re-measures and does not fake a preview", () => {
  assert.equal(
    acceptFollowThroughKind({ decision: "accepted", mode: "remote", previewCss: "  " }),
    "remeasure_no_preview",
  );
  assert.match(
    acceptFollowThroughReceipt("remeasure_no_preview", "Recorded a reversible accepted decision."),
    /Accepted · re-measured, no preview/,
  );
});

test("defer and dismiss do not start preview or recapture", () => {
  assert.equal(
    acceptFollowThroughKind({ decision: "deferred", mode: "sample", previewCss: "" }),
    "none",
  );
  assert.equal(
    acceptFollowThroughKind({ decision: "dismissed", mode: "sample", previewCss: "" }),
    "none",
  );
  assert.equal(
    acceptFollowThroughKind({ decision: "open", mode: "sample", previewCss: "" }),
    "none",
  );
  assert.equal(
    acceptFollowThroughReceipt("none", "Recorded a reversible deferred decision."),
    "Recorded a reversible deferred decision.",
  );
});

test("public capture progress names rendering, measuring, then grouping", () => {
  assert.equal(captureProgressLabel("rendering"), "Rendering the page");
  assert.equal(captureProgressLabel("measuring"), "Measuring the page");
  assert.equal(captureProgressLabel("grouping"), "Grouping findings");
});

test("a failed follow-through rejects with an incomplete accepted-decision error", async () => {
  const accept = {
    ok: true,
    receipt: "Recorded a reversible accepted decision for finding-1.",
  };

  await assert.rejects(
    () =>
      runAcceptFollowThrough({
        kind: "preview_then_verify",
        accept,
        findingId: "finding-1",
        actor: "human",
        previewCss: undefined,
        previewFix: async () => {
          throw new Error("The preview provider is unavailable.");
        },
        verifyRecapture: async () => ({ ok: true, receipt: "verified" }),
        auditCurrentScope: async () => ({ ok: true, receipt: "remeasured" }),
      }),
    (cause: unknown) => {
      assert.ok(cause instanceof Error);
      assert.match(cause.message, /accepted decision recorded/i);
      assert.match(cause.message, /follow-through incomplete/i);
      assert.match(cause.message, /preview provider is unavailable/i);
      assert.doesNotMatch(cause.message, /previewed and verified|re-measured, no preview/i);
      return true;
    },
  );
});

test("a failed verification never claims the accepted finding was verified", async () => {
  const steps: string[] = [];

  await assert.rejects(
    () =>
      runAcceptFollowThrough({
        kind: "preview_then_verify",
        accept: { ok: true, receipt: "Recorded a reversible accepted decision for finding-1." },
        findingId: "finding-1",
        actor: "human",
        previewCss: ".primary { min-height: 2.75rem; }",
        previewFix: async () => {
          steps.push("preview");
          return { ok: true, receipt: "previewed" };
        },
        verifyRecapture: async () => {
          steps.push("verify");
          throw new Error("Fresh verification is unavailable.");
        },
        auditCurrentScope: async () => ({ ok: true, receipt: "remeasured" }),
      }),
    (cause: unknown) => {
      assert.ok(cause instanceof Error);
      assert.match(cause.message, /follow-through incomplete/i);
      assert.match(cause.message, /fresh verification is unavailable/i);
      assert.doesNotMatch(cause.message, /previewed and verified/i);
      return true;
    },
  );
  assert.deepEqual(steps, ["preview", "verify"]);
});

test("a failed public re-measure never claims the accepted finding was re-measured", async () => {
  await assert.rejects(
    () =>
      runAcceptFollowThrough({
        kind: "remeasure_no_preview",
        accept: { ok: true, receipt: "Recorded a reversible accepted decision for finding-1." },
        findingId: "finding-1",
        actor: "human",
        previewCss: undefined,
        previewFix: async () => ({ ok: true, receipt: "previewed" }),
        verifyRecapture: async () => ({ ok: true, receipt: "verified" }),
        auditCurrentScope: async () => {
          throw new Error("The public re-measure provider is unavailable.");
        },
      }),
    (cause: unknown) => {
      assert.ok(cause instanceof Error);
      assert.match(cause.message, /follow-through incomplete/i);
      assert.match(cause.message, /public re-measure provider is unavailable/i);
      assert.doesNotMatch(cause.message, /re-measured, no preview/i);
      return true;
    },
  );
});
