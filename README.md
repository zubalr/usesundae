# Sundae

Ordinary AI website audits split the interface, the model conversation, the evidence, and the decision record. Sundae uses WebMCP to make the live audit page the structured operating surface for ChatGPT, so the agent and the person inspect and change the same visible board in the same session.

**A person and their ChatGPT agent audit the same live page together: the agent measures and organizes evidence through WebMCP, the person governs judgment, and Sundae verifies every claimed fix.**

[Open the published `/demo` workspace](https://usesundae.vercel.app/demo). It needs no login, connector, hosted auditor model, capture-provider key, or plugin. In ChatGPT Desktop, open the built-in browser and paste that URL. Sundae's Site Tools are discovered automatically from the page.

## Why WebMCP

Sundae is not a report API hidden behind a chat. Its page-hosted tools operate the evidence board the person can see and control:

1. ChatGPT measures the approved scope and reads the visible board.
2. It keeps measured facts, supported design judgment, and what was not seen distinct.
3. The person decides whether to accept, defer, or dismiss a finding and approves any preview.
4. Sundae renders a reversible preview and requires fresh matching evidence before a measured issue is called fixed.
5. Tool-named receipts leave each agent action inspectable on the same page.

Without WebMCP, this workflow collapses into a screenshot conversation, a hidden API report, or brittle click automation. WebMCP gives the user's agent goal-shaped commands with explicit authority while preserving a human-readable operating surface.

## Judge path

1. Open `https://usesundae.vercel.app/demo` in ChatGPT Desktop's built-in browser.
2. Confirm **9 page tools ready** in the Sundae top bar.
3. Ask ChatGPT to call `audit_current_scope`, then `get_board_context`.
4. Have it inspect the controlled target's agent surface and focus the strongest supported finding.
5. ChatGPT asks before changing the decision or starting a preview.
6. Accept with a visible reason, run `preview_fix`, then `verify_recapture`.
7. Confirm the same board shows the fresh measurement, verification state, and tool-named receipts.

An ordinary browser still provides deterministic measurement and every human control. It does not pretend an agent is present; the UI says **Human controls ready** and explains how to open the exact workspace in ChatGPT Desktop.

## Evidence contract

Sundae deliberately separates:

- **Measured** — deterministic observations from the rendered page, accessibility tree, or inspected WebMCP contract.
- **Judged** — evidence-linked UI, UX, or Interaction critique for the visible product job.
- **Not seen** — routes, states, or motion windows outside the captured evidence.
- **Decision** — a reversible person-governed workflow state.
- **Preview** — a source-neutral visual proposal, never proof that the product changed.
- **Verification** — a fresh same-scope measurement. A judged finding remains unverified unless it is reassessed.

ChatGPT performs the design critique through Site Tools using visible screenshot and page evidence. Sundae stores the category and product-job tag; it does not auto-classify an industry or call a server-side model.

## Page-hosted tool surface

The included `/demo` registers nine Sundae workbench tools:

| Tool                    | Purpose                                               |
| ----------------------- | ----------------------------------------------------- |
| `audit_current_scope`   | Measure the live included target                      |
| `inspect_agent_surface` | Inspect the controlled target's WebMCP contracts      |
| `get_board_context`     | Read bounded evidence, decisions, gaps, and next work |
| `record_visual_finding` | Add a supported UI, UX, or Interaction judgment       |
| `record_coverage_gap`   | Record an important surface that was not observed     |
| `focus_finding`         | Select evidence on the visible board                  |
| `set_finding_decision`  | Record the person's reversible decision and reason    |
| `preview_fix`           | Render a reversible local preview                     |
| `verify_recapture`      | Re-measure the same scope before calling a fact fixed |

A public workspace adds four bounded capture commands, for 13 tools total:

| Tool                   | Boundary                                                          |
| ---------------------- | ----------------------------------------------------------------- |
| `capture_public_page`  | Exact public URL the person allowed or captured                   |
| `capture_visible_nav`  | Up to four evidence-derived same-origin links; no URL argument    |
| `capture_below_fold`   | Active approved route only, when below-fold evidence is missing   |
| `capture_journey_step` | Exact same-origin URL explicitly named and approved by the person |

Each input is a closed, bounded schema. Long-running capture work receives the invocation `AbortSignal`. Mutating commands are not marked read-only; page- or capture-derived output is marked untrusted. Registration uses one abortable transaction, and human controls call the same command implementation as Site Tools.

## Public capture boundary

Sundae audits public HTTPS pages its configured browser provider can render. When a page blocks automated rendering, requires login, or exceeds browser limits, Sundae records what was not seen instead of claiming a complete audit.

**Allow agent to capture** authorizes only the exact displayed URL for the current browser session; it does not start a capture. ChatGPT may then call `capture_public_page`. **Capture myself** is the human alternative and captures immediately. The two choices are not a sequence.

Public capture uses Cloudflare Browser Run Quick Actions and never accepts credentials in URLs, private-network targets, nonstandard ports, target-site cookies, silent tabs, login flows, form submission, recursive crawling, or off-origin navigation. Existing board evidence remains intact when the provider fails.

For local public-capture development, configure opaque values outside source control:

```text
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

`npm run check` runs TypeScript, Oxlint, the product token gate, and the full test suite. The interface uses the repository token contract and keeps the cyclomatic-complexity ceiling ratcheted.

Key paths:

- `app/` — landing page, complete `/demo` workspace redirect, controlled fixture, and capture API.
- `components/Workbench.tsx` — shared command implementation and audit state.
- `lib/webmcp/` — page-hosted tool contracts, registration, and bounded results.
- `lib/audit/` — measured findings, structured judgment, contract inspection, and recapture comparison.
- `lib/capture/` — URL policy, Cloudflare snapshot adapter, evidence extraction, and failure boundaries.
- `tests/` and `evals/` — deterministic product, contract, and prompt regressions.

## License

AGPL-3.0-only. See [LICENSE](./LICENSE).
