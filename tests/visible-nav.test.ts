import assert from "node:assert/strict";
import test from "node:test";

import {
  capturedVisibleNavLabels,
  extractVisibleNav,
  MAX_VISIBLE_NAV_ROUTES,
  reconcileVisibleNavGap,
  uncapturedVisibleNav,
  visibleNavGap,
  withoutVisibleNavGap,
} from "../lib/capture/visible-nav";

test("partial navigation receipts use the attempted routes no longer remaining", () => {
  const attempted = [
    { url: "https://example.com/about", label: "About" },
    { url: "https://example.com/domains", label: "Domains" },
    { url: "https://example.com/domains/root", label: "Root zone" },
    { url: "https://example.com/domains/root/db", label: "TLD database" },
  ];

  assert.deepEqual(capturedVisibleNavLabels(attempted, attempted.slice(-1)), [
    "About",
    "Domains",
    "Root zone",
  ]);
});

test("extracts a bounded set of same-origin nav links from markdown in document order", () => {
  const markdown = [
    "[Pricing](https://example.com/pricing)",
    "[Docs](/docs)",
    "[Logout](https://example.com/logout)",
    "[Guide PDF](https://example.com/guide.pdf)",
    "[External](https://other.example/about)",
    "[Checkout](https://example.com/checkout?ref=nav)",
    "[Blog](https://example.com/blog)",
    "[Careers](https://example.com/careers)",
  ].join("\n");

  assert.deepEqual(extractVisibleNav("https://example.com/", markdown), [
    { url: "https://example.com/pricing", label: "Pricing" },
    { url: "https://example.com/docs", label: "Docs" },
    { url: "https://example.com/checkout", label: "Checkout" },
    { url: "https://example.com/blog", label: "Blog" },
  ]);
  assert.equal(MAX_VISIBLE_NAV_ROUTES, 4);
});

test("fills remaining slots from accessibility link URLs and skips the current page", () => {
  const routes = extractVisibleNav(
    "https://example.com/pricing",
    "[Stay](https://example.com/pricing)",
    {
      role: "RootWebArea",
      children: [
        { role: "link", name: "Docs", url: "https://example.com/docs" },
        { role: "link", name: "Home", url: "https://example.com/" },
      ],
    },
  );

  assert.deepEqual(routes, [
    { url: "https://example.com/docs", label: "Docs" },
    { url: "https://example.com/", label: "Home" },
  ]);
});

test("does not turn accessibility labels into guessed routes", () => {
  const routes = extractVisibleNav("https://example.com/", "", {
    role: "RootWebArea",
    children: [
      { role: "link", name: "Pricing", value: "Pricing" },
      { role: "link", name: "Support", value: "/support" },
    ],
  });

  assert.deepEqual(routes, [{ url: "https://example.com/support", label: "Support" }]);
});

test("skips visible download and media files instead of treating them as product routes", () => {
  const markdown = [
    "[Brand image](/brand.png)",
    "[Product brief](/brief.docx)",
    "[Pitch deck](/pitch.pptx)",
    "[Demo video](/demo.mp4)",
    "[Privacy](/privacy)",
  ].join("\n");

  assert.deepEqual(extractVisibleNav("https://example.com/", markdown), [
    { url: "https://example.com/privacy", label: "Privacy" },
  ]);
});

test("skips favicon resources exposed as accessibility links", () => {
  const routes = extractVisibleNav("https://example.com/", "", {
    role: "RootWebArea",
    children: [
      { role: "link", name: "Icon for example.com", url: "https://example.com/favicon.ico" },
      { role: "link", name: "About", url: "https://example.com/about" },
    ],
  });

  assert.deepEqual(routes, [{ url: "https://example.com/about", label: "About" }]);
});

test("uncapturedVisibleNav compares path identity and the gap helpers stay exact", () => {
  const routes = [
    { url: "https://example.com/docs", label: "Docs" },
    { url: "https://example.com/blog", label: "Blog" },
  ];
  assert.deepEqual(uncapturedVisibleNav(routes, ["https://example.com/docs/"]), [
    { url: "https://example.com/blog", label: "Blog" },
  ]);
  assert.equal(visibleNavGap(2).id, "gap-visible-nav");
  assert.deepEqual(
    withoutVisibleNavGap([{ id: "gap-visible-nav" }, { id: "gap-flow-states" }]).map(
      (gap) => gap.id,
    ),
    ["gap-flow-states"],
  );
});

test("partial visible-nav capture keeps the source checkpoint as gap evidence", () => {
  const gaps = [
    {
      ...visibleNavGap(2),
      checkpointId: "checkpoint-root",
      scopeKey: "scope-root",
    },
    { id: "gap-flow-states", label: "Flow states", detail: "Not observed." },
  ];
  const partial = reconcileVisibleNavGap(gaps, 1, {
    checkpointId: "checkpoint-pricing",
    scopeKey: "scope-pricing",
  });

  assert.deepEqual(
    partial.find(({ id }) => id === "gap-visible-nav"),
    {
      ...visibleNavGap(1),
      checkpointId: "checkpoint-root",
      scopeKey: "scope-root",
    },
  );
  assert.equal(
    reconcileVisibleNavGap(partial, 0, {}).some(({ id }) => id === "gap-visible-nav"),
    false,
  );
});
