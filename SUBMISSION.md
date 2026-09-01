# Sundae: WebMCP Challenge submission

AI audits your product's design. It shows its work.

Every finding is a measurement you can check, on a page you can inspect, with fixes proved by fresh evidence. WebMCP is why you can believe it.

Live app: [https://usesundae.vercel.app](https://usesundae.vercel.app)
Guaranteed judge path: [https://usesundae.vercel.app/demo](https://usesundae.vercel.app/demo)
Source: [https://github.com/zubalr/usesundae](https://github.com/zubalr/usesundae)

Sundae did not exist before this challenge. The repository was created on 29 August 2026. Every commit falls inside the submission window.

## WebMCP Leverage

The audit is the value. WebMCP is why you can believe the findings.

A screenshot chat can critique a website, but the image, the conversation, the evidence, and the person's decisions live in different places. A hidden audit API has the same split: the agent acts somewhere the person cannot inspect. Sundae registers page-hosted Site Tools on the open audit page, so ChatGPT records evidence and supported judgment on the board the person is already viewing.

The included `/demo` workspace registers 11 tools:

`audit_current_scope` → `get_board_context` → `record_visual_finding` → `set_finding_decision` → `verify_recapture`, plus `inspect_agent_surface`, `record_audit_brief`, `record_review_result`, `record_coverage_gap`, `focus_finding`, and `preview_fix`.

A public workspace adds four bounded capture commands (`capture_public_page`, `capture_visible_nav`, `capture_below_fold`, `capture_journey_step`) for 15 tools total. Each input is a closed schema. Mutating commands are not marked read-only. Page- or capture-derived output is marked untrusted.

Human authority is visible. ChatGPT cannot start a preview without a reasoned acceptance. `preview_fix` still refuses before accept. `verify_recapture` re-measures the same scope; a reversible preview is not proof. Tool-named receipts stay on the board, and the top bar counts agent tool calls.

Site Tools have been verified on GPT-5.6 Sol and GPT-5.6 Terra in two places: the ChatGPT desktop app's built-in browser, and ChatGPT Work Cloud at chatgpt.com. A real ChatGPT run on GPT-5.6 Sol completed the whole loop. GPT-5.6 Luna has WebMCP disabled and will not discover Site Tools. Site tools are also unavailable in Enterprise and Edu workspaces.

A host may deny an individual tool call. In that Sol run, ChatGPT's auto-review blocked `record_audit_brief` with "Browser Use rejected this action due to browser security policy". Sundae never saw that call. The rest of the audit still completed.

Without WebMCP (an ordinary browser, or an unsupported model), Sundae still provides every deterministic measurement and every human control. The top bar reads "Human controls ready" and the agent tool-call counter stays at 0. It does not pretend an agent is present.

## Execution

Type a public URL and press Enter. Capture starts with zero extra clicks. Measurement happens in one Cloudflare browser session, typically in about 6 to 9 seconds.

On Todoist, a live mobile capture measured the primary call-to-action at 4.09:1 contrast, below the 4.5:1 threshold, on their own brand red, as one of 28 controls under the 44 × 44 touch target guidance.

Contrast is measured against a composited background. Sundae walks the ancestor chain and blends every translucent layer rather than stopping at the first non-transparent colour. Without that, a 4% white veil over a dark surface (a standard treatment in dark design systems) is read as pure white. On `linear.app` that error reported 17.51:1 text as 1.06:1. The bug was found in a real capture, fixed, and kept as a regression.

Measured findings are grouped by the change that would resolve them, then ranked by prominence. Contrast groups by colour pair. Tap targets group by shape class. Controls that are invisible, offscreen, or smaller than 8 × 8 CSS px are not findings.

The included `/demo` is a controlled product with a pre-authored improved variant. Sundae does not claim the agent wrote that fix. What is real is the re-measurement: `verify_recapture` returns `{fixed:1, still_open:0, unverified:0}` after accept. `npm run check` currently passes 205 tests covering the audit engine, WebMCP registration, capture policy, landing contract, and workbench authority.

## Potential Impact

Founders already ask ChatGPT what is wrong with a live page. They get a confident paragraph and no way to check it. Sundae keeps the audit on the page: a measurement you can inspect, a decision you govern, and a fix proved by a fresh capture.

The first useful loop does not require a plugin, a connector, or a hosted auditor model. Open `/demo` in ChatGPT Desktop's built-in browser or in ChatGPT Work Cloud, wait for 11 Site Tools, and ask ChatGPT to audit. Public HTTPS pages follow the same board after a typed URL.

Sundae does not infer conversion, revenue, retention, security, legal compliance, SEO rank, or backend correctness from rendered UI evidence. It says "not seen" until fresh evidence justifies a stronger claim. That limit is the product, not a missing feature.

## Creativity & Ambition

The ambitious move is making the page the control layer.

ChatGPT's built-in browser does not discover tools registered inside iframes. Sundae's 11 tools are registered at the top level so the Site tools count is exact. The audited fixture's own tools live inside the iframe, which is why `inspect_agent_surface` exists: Sundae reads contracts the host itself cannot reach.

The workbench is a shared operating surface, not a report dumped into chat. Findings lead. Pins number by visual reading order. Accept runs preview or an honest re-measure without weakening the authority gate. A cold `/demo` load writes exactly one baseline receipt that no agent produced.

The contest asked for thorough WebMCP use and a high-quality human-agent experience. Sundae treats those as one requirement: the agent has goal-shaped commands with explicit authority, and the person can see every command, every receipt, and every refusal on the same page.

## How to judge

1. Open ChatGPT Desktop's built-in browser, or ChatGPT Work Cloud, at `https://usesundae.vercel.app/demo`.
2. Use GPT-5.6 Sol or GPT-5.6 Terra. Click **Site tools** in the address bar. You should see 11 Sundae tools.
3. Ask: "Audit this page with its Site Tools. Keep measurements, judgment, and what you did not see separate, and ask me before any decision or preview."
4. Watch the board. The **Agent tool calls** counter increments as tools run.
5. Accept a finding with a visible reason, then let it run `preview_fix` and `verify_recapture`.
6. Confirm the board shows the fresh measurement, the verification state, and tool-named receipts.

If you prefer the human path, open [https://usesundae.vercel.app](https://usesundae.vercel.app), type a public URL, and press Enter. The same board appears without Site Tools.
