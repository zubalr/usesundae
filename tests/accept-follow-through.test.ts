import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptFollowThroughKind,
  acceptFollowThroughReceipt,
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
