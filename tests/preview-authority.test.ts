import assert from "node:assert/strict";
import test from "node:test";

import { evaluatePreviewAuthority } from "../lib/workbench/preview-authority";

const selected = {
  findingId: "mobile:contrast:primary-action",
  decision: "accepted" as const,
  reason: "The person approved this bounded preview.",
};

test("preview requires a reasoned accepted decision", () => {
  assert.equal(
    evaluatePreviewAuthority({ ...selected, decision: "open", previewActive: false }).canPreview,
    false,
  );
  assert.equal(
    evaluatePreviewAuthority({ ...selected, reason: "", previewActive: false }).canPreview,
    false,
  );
  assert.equal(evaluatePreviewAuthority({ ...selected, previewActive: false }).canPreview, true);
});

test("verification requires the active preview for that finding", () => {
  assert.equal(evaluatePreviewAuthority({ ...selected, previewActive: false }).canVerify, false);
  assert.equal(
    evaluatePreviewAuthority({
      ...selected,
      previewActive: true,
      previewFindingId: "mobile:contrast:other-control",
    }).canVerify,
    false,
  );
  assert.equal(
    evaluatePreviewAuthority({
      ...selected,
      previewActive: true,
      previewFindingId: selected.findingId,
    }).canVerify,
    true,
  );
});
