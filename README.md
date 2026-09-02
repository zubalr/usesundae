# Sundae

A screenshot chat can critique a website, but it separates the live interface from the model, its evidence, and the person's decisions. A hidden audit API has the same problem: the agent acts somewhere the person cannot inspect.

Sundae uses page-hosted WebMCP Site Tools to make the open audit page the shared operating surface. ChatGPT records evidence and supported judgment on the board the person is already viewing; the person governs decisions and previews; Sundae requires a fresh same-scope recapture before a measured issue is called fixed.

**Design reviews shouldn't disappear into chat.** Every finding shows its evidence. Every decision stays yours. ChatGPT records evidence on the board the person is already viewing; the person governs decisions; Sundae requires a fresh same-scope recapture before a measured issue is called fixed.

[Open Sundae](https://usesundae.vercel.app/) to prepare a workspace, or go straight to the guaranteed [published `/demo` workspace](https://usesundae.vercel.app/demo). The demo needs no login, connector, hosted auditor model, capture-provider key, or plugin.

Two ChatGPT routes have been verified with **GPT-5.6 Sol** and **GPT-5.6 Terra**: the desktop app's built-in browser, and ChatGPT **Work Cloud** at chatgpt.com. OpenAI currently documents only the desktop app. **GPT-5.6 Luna has WebMCP disabled** and will not discover Site Tools.

## Challenge work added during the submission period

Sundae did not exist before this challenge. The submission period opened on August 25, 2026; this repository was created on August 29, 2026, and every commit in its history falls inside the submission window. There is no prior work to separate from challenge work — all of it is challenge work.

| Date   | Commit                          | Challenge work                                                               | Scale                   |
| ------ | ------------------------------- | ---------------------------------------------------------------------------- | ----------------------- |
| Aug 29 | `cdb508e`                       | Initial public release: workbench, WebMCP adapter, controlled fixture, tests | 87 files, +17,936       |
| Aug 29 | `a439599`                       | Harden the production WebMCP audit loop                                      | 12 files, +371/−69      |
| Aug 29 | `6ed0675`                       | Guarded public capture: HMAC gate, rate limits, SSRF and DNS policy          | 52 files, +7,404/−715   |
| Aug 30 | `4b6a93a`                       | Refocus the product on the WebMCP contest loop                               | 53 files, +1,403/−6,941 |
| Aug 30 | `5a907ee`                       | Structure audits by visible product job                                      | 20 files, +288/−22      |
| Aug 30 | `e585331`                       | Evidence-derived public navigation capture                                   | 24 files, +776/−96      |
| Aug 30 | `712fdf5`                       | Page-native WebMCP audit workspace                                           | 34 files, +911/−2,128   |
| Aug 30 | `386a1d0`…`926fcff` (7 commits) | Navigation capture atomicity, honest partial reporting, receipt alignment    | 19 files, +203/−58      |
| Aug 31 | `a3040a6`                       | Audit brief, review results, product-job categories                          | 33 files, +2,509/−240   |
| Aug 31 | `0cb3518`                       | Shared WebMCP product review surface                                         | 33 files, +2,401/−797   |
| Aug 31 | `4311342`, `b82c32e`            | Multi-route board context, bounded partial navigation                        | 4 files, +138/−6        |

## Why WebMCP

Sundae is not a report API hidden behind a chat. Its page-hosted tools operate the evidence board the person can see and control:

1. ChatGPT measures the approved scope and reads the visible board.
2. It keeps measured facts, supported design judgment, and what was not seen distinct.
3. The person decides whether to accept, defer, or dismiss a finding and approves any preview.
4. Sundae renders a reversible preview and requires fresh matching evidence before a measured issue is called fixed.
5. Tool-named receipts leave each agent action inspectable on the same page.

Without WebMCP, this workflow collapses into a screenshot conversation, a hidden API report, or brittle click automation. WebMCP gives the user's agent goal-shaped commands with explicit authority while preserving a human-readable operating surface.

## Judge path

Site Tools have been verified on **GPT-5.6 Sol** and **GPT-5.6 Terra** in two places: the ChatGPT desktop app, and ChatGPT **Work Cloud** at chatgpt.com. OpenAI's Site tools documentation currently names only the desktop app. **GPT-5.6 Luna has WebMCP disabled** and will not discover Site Tools. Site Tools are also unavailable in Enterprise and Edu workspaces.

1. Open ChatGPT Desktop's built-in browser, or ChatGPT Work Cloud's browser, at `https://usesundae.vercel.app/demo`.
2. Click **Site tools** in the browser address bar. You should see **11 Sundae tools**. If the panel is empty, check the model first.
3. Ask: _"Audit this page with its Site Tools. Keep measurements, judgment, and what you did not see separate, and ask me before any decision or preview."_
4. Watch the board: measured evidence and receipts appear as tools run, and the **Agent tool calls** counter in the top bar increments.
5. ChatGPT asks before changing a decision or starting a preview.
6. Accept a finding with a visible reason, then let it run `preview_fix` and `verify_recapture`.
7. Confirm the board shows the fresh measurement, the verification state, and tool-named receipts.

A host may deny an individual Site Tool call. In a real run, ChatGPT's auto-review blocked `record_audit_brief` with "Browser Use rejected this action due to browser security policy". Sundae never saw that call. The rest of the audit still completed.

Without WebMCP — an ordinary browser, or an unsupported model — Sundae still provides every deterministic measurement and every human control. It does not pretend an agent is present: the top bar reads **Human controls ready** and the **Agent tool calls** counter stays at 0.

## Evidence contract

Sundae deliberately separates:

- **Measured** — deterministic observations from the rendered page, accessibility tree, or inspected WebMCP contract.
- **Judged** — evidence-linked UI, UX, or Interaction critique for the visible product job.
- **Not seen** — routes, states, or motion windows outside the captured evidence.
- **Decision** — a reversible person-governed workflow state.
- **Preview** — a source-neutral visual proposal, never proof that the product changed.
- **Verification** — a fresh same-scope measurement. A judged finding remains unverified unless it is reassessed.

ChatGPT performs the design critique through Site Tools using visible screenshot and page evidence. Sundae stores the category and product-job tag; it does not auto-classify an industry or call a server-side model.

### One group is one fix

A real product page yields hundreds of measurements, and a list of 91 findings is a census, not an audit. Sundae groups measured findings by the change that would resolve them, then ranks the groups by prominence — severity weighted by rendered area and distance from the fold.

- **Contrast** groups by the exact foreground/background colour pair. One pair is one design-token fix however often it recurs.
- **Tap targets** group by shape class — icon control, inline text link, or button or tile — because each class is one CSS fix.
- Everything else stays per-instance.

Each group reports its instance count and shows the worst instance, so nothing is hidden: `44 instances · worst shown`. Controls that are invisible, offscreen, or smaller than 8 × 8 CSS px are not findings and are dropped before grouping. The demo fixture is grouped by the same rules as a public page — no fixture exception.

Contrast is measured against a **composited** background: Sundae walks the ancestor chain and blends every translucent layer rather than stopping at the first non-transparent colour. Without this, a 4%-opacity white overlay — the standard surface treatment in dark design systems — is read as pure white, and legible text measures as a failure. On one production dark-theme site that error reported 17.51:1 text as 1.06:1. A measured fact has to survive a dark theme.

On `/demo`, `preview_fix` renders a **pre-authored improved variant** of the controlled fixture — Sundae does not claim the agent wrote the fix. What is real is the re-measurement: the improved state genuinely repairs the measured accessible-name, tap-target, contrast, and horizontal-overflow findings, and `verify_recapture` proves it by fresh measurement rather than by assertion. On a public checkpoint the agent supplies bounded CSS itself.

## Page-hosted tool surface

**The five tools a judge will see**

`audit_current_scope` → `get_board_context` → `record_visual_finding` → `set_finding_decision` → `verify_recapture`

**Supporting tools**

The included `/demo` registers eleven Sundae workbench tools:

| Tool                    | Purpose                                                        |
| ----------------------- | -------------------------------------------------------------- |
| `audit_current_scope`   | Measure the live included target; returns the first board page |
| `inspect_agent_surface` | Inspect the controlled target's WebMCP contracts               |
| `get_board_context`     | Read bounded evidence, decisions, gaps, and next work          |
| `record_audit_brief`    | Orient the product before judging the interface                |
| `record_review_result`  | Preserve a strength or an inspected no-issue result            |
| `record_visual_finding` | Add a supported UI, UX, or Interaction judgment                |
| `record_coverage_gap`   | Record an important surface that was not observed              |
| `focus_finding`         | Select evidence on the visible board                           |
| `set_finding_decision`  | Record the person's reversible decision and reason             |
| `preview_fix`           | Render a reversible local preview                              |
| `verify_recapture`      | Re-measure the same scope before calling a fact fixed          |

ChatGPT's built-in browser does not discover tools registered inside iframes. Sundae's 11 tools are registered at the top level, so the count shown in **Site tools** is exact. The audited fixture's own tools live inside the iframe — which is why `inspect_agent_surface` exists: Sundae reads contracts the host itself cannot reach.

A public workspace adds four bounded capture commands, for 15 tools total:

| Tool                   | Boundary                                                          |
| ---------------------- | ----------------------------------------------------------------- |
| `capture_public_page`  | Exact public URL the person allowed or captured                   |
| `capture_visible_nav`  | Up to four evidence-derived same-origin links; no URL argument    |
| `capture_below_fold`   | Active approved route only, when below-fold evidence is missing   |
| `capture_journey_step` | Exact same-origin URL explicitly named and approved by the person |

Each input is a closed, bounded schema. Long-running capture work receives the invocation `AbortSignal`. Mutating commands are not marked read-only; page- or capture-derived output is marked untrusted. Registration uses one abortable transaction, and human controls call the same command implementation as Site Tools.

## Public capture boundary

Sundae audits public HTTPS pages its configured browser provider can render. When a page blocks automated rendering, requires login, or exceeds browser limits, Sundae records what was not seen instead of claiming a complete audit.

**Typing a public URL and pressing Enter** approves that exact target for the current browser session and starts capture. ChatGPT may then call `capture_public_page` on the same URL. Additional same-origin routes still need a human-named journey step.

Public capture opens the approved page in a Cloudflare browser session and runs Sundae's own audit engine inside that page with `page.evaluate()`. Measurement happens in one browser session. A small page settles in under ten seconds; a large one, where the design-signal walk reaches its 1,500-node cap, takes closer to thirty. Sundae never accepts credentials in URLs, private-network targets, nonstandard ports, target-site cookies, silent tabs, login flows, form submission, recursive crawling, or off-origin navigation. Existing board evidence remains intact when the provider fails.

For local public-capture development, configure opaque values outside source control:

```text
SUNDAE_BROWSER_WORKER_URL
SUNDAE_BROWSER_WORKER_SECRET
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
CAPTURE_GATE_SECRET
SUNDAE_APP_ORIGIN
```

## Development

```bash
npm install
npm run dev
npm run check
npm run build
```

`npm run check` runs TypeScript, Oxlint, the product token gate, format checking, the full test suite, and the production build. The interface uses the repository token contract and keeps the cyclomatic-complexity ceiling ratcheted.

Key paths:

- `app/` — landing page, complete `/demo` workspace redirect, controlled fixture, and capture API.
- `components/Workbench.tsx` — shared command implementation and audit state.
- `lib/webmcp/` — page-hosted tool contracts, registration, and bounded results.
- `lib/audit/` — measured findings, structured judgment, contract inspection, and recapture comparison.
- `lib/capture/` — URL policy, Cloudflare snapshot adapter, evidence extraction, and failure boundaries.
- `tests/` and `evals/` — deterministic product, contract, and prompt regressions.

## License

AGPL-3.0-only. See [LICENSE](./LICENSE).
