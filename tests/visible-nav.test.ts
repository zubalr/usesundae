import assert from "node:assert/strict";
import test from "node:test";

import {
  extractVisibleNav,
  MAX_VISIBLE_NAV_ROUTES,
  uncapturedVisibleNav,
  visibleNavGap,
  withoutVisibleNavGap,
} from "../lib/capture/visible-nav";

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
