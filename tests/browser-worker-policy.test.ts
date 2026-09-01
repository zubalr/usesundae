import assert from "node:assert/strict";
import test from "node:test";

import { requestHasWorkerSecret, secretsMatch } from "../lib/capture/worker-auth";
import { WORKER_SECRET_HEADER } from "../lib/capture/worker-protocol";
import { normalizePublicTarget } from "../lib/capture/url-policy";
import { isBlockedBrowserRequest, publicCaptureUrl } from "../worker/src/policy";

const secret = "test-worker-secret-that-is-long-enough";

test("the Worker secret comparison rejects missing, wrong, and empty values", () => {
  assert.equal(secretsMatch(secret, secret), true);
  assert.equal(secretsMatch("nope", secret), false);
  assert.equal(secretsMatch("", secret), false);
  assert.equal(
    requestHasWorkerSecret(new Request("https://worker.test/", { headers: {} }), secret),
    false,
  );
  assert.equal(
    requestHasWorkerSecret(
      new Request("https://worker.test/", { headers: { [WORKER_SECRET_HEADER]: secret } }),
      secret,
    ),
    true,
  );
  assert.equal(
    requestHasWorkerSecret(
      new Request("https://worker.test/", { headers: { [WORKER_SECRET_HEADER]: secret } }),
      "",
    ),
    false,
  );
});

test("Worker target validation matches url-policy rejects", () => {
  const rejected = [
    "file:///etc/passwd",
    "https://user:secret@example.com",
    "http://localhost:3000",
    "http://127.0.0.1/admin",
    "http://[::1]/admin",
    "http://[::ffff:127.0.0.1]/admin",
    "http://[::ffff:10.0.0.1]/admin",
    "http://[fd00::1]/admin",
    "http://[2001:4860:4860::8888]/admin",
    "http://169.254.169.254/latest/meta-data",
    "https://service.internal/dashboard",
    `https://example.com/${"x".repeat(2100)}`,
  ];

  for (const value of rejected) {
    assert.throws(() => normalizePublicTarget(value), { name: "TargetPolicyError" }, value);
    assert.throws(() => publicCaptureUrl(value), { name: "TargetPolicyError" }, value);
    if (/^https?:/i.test(value) && value.length <= 2048) {
      assert.equal(isBlockedBrowserRequest(value), true, value);
    }
  }

  assert.equal(publicCaptureUrl("https://todoist.com/"), "https://todoist.com/");
  assert.equal(isBlockedBrowserRequest("https://todoist.com/"), false);
  assert.equal(isBlockedBrowserRequest("http://169.254.169.254/latest/meta-data"), true);
  assert.equal(isBlockedBrowserRequest("data:text/plain,hi"), false);
});
