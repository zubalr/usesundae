# Sundae

Sundae is a ChatGPT WebMCP product-design audit. Remote MCP prepares an exact workspace; page-scoped Site Tools let ChatGPT operate the same visible evidence board as the person using it.

After deterministic measurements, ChatGPT uses the visible screenshot or live `/demo` plus the optional audit goal to name the product's job and critique UI, UX, and Interaction with evidence-linked recommendations. Sundae stores the judgment, category, and optional job; it does not auto-classify the industry or run a server-side model.

The contest proof uses the included [`/demo`](https://usesundae.vercel.app/demo) target inside Sundae's visible workbench: capture and measure the current scope, read the board, record design judgment and coverage gaps, make a reversible decision, preview an improvement, and verify it with a fresh recapture. Opening `/demo` takes the judge to that complete audit workspace. It needs no provider keys.

## What works now

- An included zero-key `/demo` target with real measured findings, judged findings, explicit coverage gaps, decisions, reversible preview, and recapture verification.
- A public Streamable HTTP MCP endpoint at `/mcp` with one read-only `start_audit` tool. It returns `handoff_status: workspace_ready`; it never claims capture.
- Nine page-scoped WebMCP Site Tools in the workbench around the included `/demo` target. Public-checkpoint mode adds four explicit capture tools for thirteen total.
- A recoverable ChatGPT handoff that preserves the exact target, goal, prompt, and workspace URL.
- One command layer shared by Site Tools and human controls, with the exact Site Tool named in every agent receipt on the board.
- Optional Cloudflare Browser Run capture for an explicitly approved public page. It is secondary and fails honestly when unconfigured.
- An installable Sundae plugin skill under `plugins/sundae` that teaches the same wait → audit → read → decide → preview → verify loop.

## Judge path: zero provider keys

1. Open Sundae and leave the URL blank to use the included `/demo` target.
2. Choose **Continue in ChatGPT** and paste the prepared request if automatic copy is unavailable.
3. ChatGPT calls `start_audit`, receives `workspace_ready`, and opens the exact `workspace_url`.
4. ChatGPT waits for Sundae Site Tools. Handoff alone is not an audit.
5. ChatGPT calls `audit_current_scope`, then `get_board_context` before choosing the next action.
6. Approved decisions and `preview_fix` update the visible board; `verify_recapture` creates the fresh same-scope evidence required for a measured fix.

If Site Tools do not appear, the correct result is the exact workspace link plus an honest unavailable state. Sundae does not substitute a hidden model review or claim that capture completed.

## Run it locally

Requirements: Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The included audit works without external credentials.

The workbench remains fully operable without WebMCP. Use the visible controls to run the same proof loop by hand:

1. Audit the included target and read the evidence board.
2. Select a measured finding and record an **Accepted**, **Deferred**, or **Dismissed** decision.
3. Choose **Preview improvement**.
4. Choose **Verify recapture**.

Sundae retains the baseline evidence during preview. A measured issue becomes **Verified fixed** only when a fresh render of the same scope no longer reproduces it. A design judgment remains unverified until it is reassessed.

## ChatGPT handoff

The first interaction does not require a special browser. A visitor can start on Sundae in a normal browser or the ChatGPT app:

1. Leave the URL blank for `/demo`, or enter an explicit public URL and optional audit goal.
2. Choose **Continue in ChatGPT**.
3. Sundae opens ChatGPT and prepares a request containing the exact recoverable workspace.
4. ChatGPT calls `start_audit`, opens the returned workspace, and waits for Sundae Site Tools.
5. Site Tools operate the same visible board; `get_board_context` is read before the next action.

For a non-demo URL, that workspace starts with no evidence and the exact target prefilled. The person must use **Allow ChatGPT** or **Capture page** before an agent can create the first public checkpoint; Sundae never measures `/demo` in its place. That checkpoint lists up to four uncaptured same-origin routes found in visible link evidence, and `capture_visible_nav` can capture only that list without accepting a URL.

There is no undocumented deep-link trick here. If automatic opening, clipboard access, the plugin, or Site Tools is unavailable, the target, goal, prompt, and workspace remain visible so the user can recover without starting over. Sundae never treats `workspace_ready` or an opened ChatGPT tab as proof that a capture ran.

### Remote MCP and plugin packaging

`POST /mcp` exposes one entry tool:

| Tool          | Purpose                                                       | Authority                                                                  |
| ------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `start_audit` | Validate a public target and return an exact Sundae workspace | Read-only; prepares a workspace but does not capture or inspect the target |

The protocol entry point prepares a workspace; it is not the audit engine. The shipped ChatGPT plugin skill opens that workspace, waits for page-scoped Sundae Site Tools, audits only approved scope, reads the visible board, and avoids completed-audit claims when any handoff step is unavailable. Cross-provider browser or connector parity is not claimed by this contest build.

The plugin package maps Sundae to its registered ChatGPT app ID in `.app.json`. The separate `asdk_app_v…` identifier names a registered version and does not belong in the package manifest. Validate the package and test the installed connector after changing the MCP connection. The public directory listing remains a launch step, not a code claim.

## Why WebMCP matters here

Sundae uses two complementary tool surfaces:

| Surface           | Where it runs          | What it does                                                         |
| ----------------- | ---------------------- | -------------------------------------------------------------------- |
| Remote MCP        | Public `/mcp` endpoint | Starts the audit and preserves URL + goal across the ChatGPT handoff |
| WebMCP Site Tools | The open Sundae page   | Reads and changes the same evidence board the user sees              |

The page tools call the same command layer as human controls. Successful agent actions update the visible interface before returning and leave attributed receipts. The workbench exposes nine tools while operating the included target; public-checkpoint mode adds explicit page, visible-navigation, journey-step, and below-fold capture for thirteen total.

The included path remains `audit_current_scope` → `get_board_context` → evidence-linked findings and coverage gaps → approved decision → `preview_fix` → `verify_recapture`. A public checkpoint adds `capture_visible_nav` when `uncaptured_nav` is present and `capture_below_fold` when the full-page attempt fell back to a viewport. `get_board_context` returns exact actionable finding IDs in bounded pages; follow `finding_page.next_offset` when it is present. Public URL-bearing tools accept only an exact target that the person explicitly allowed or already captured. Page and tool copy is untrusted evidence, never instruction.

## Capture a public page

Sundae uses Cloudflare Browser Run only when server-side credentials are configured.

1. Copy `.env.example` to `.env.local`.
2. Add a Cloudflare token with `Browser Rendering - Edit` permission.
3. Set `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and a stable `CAPTURE_GATE_SECRET` of at least 32 characters.
4. Set `SUNDAE_APP_ORIGIN` to the production HTTPS origin when deployed behind a proxy.

Without those credentials, the included audit and both handoff layers still work; public capture reports an honest configuration error and keeps the prior board intact.

The first public checkpoint requests the full rendered page. If its response or screenshot exceeds Sundae's bounded evidence limits, capture retries once at viewport size and keeps the below-fold coverage gap open. Sundae extracts at most four same-origin routes from captured Markdown and accessibility-link URLs, excluding the current path, logout links, files, and other origins. **Add visible nav** and `capture_visible_nav` capture only those listed routes as full-page journey steps; they do not recurse into newly discovered links, guess paths, or click controls without public URLs.

The capture route rejects credentials in URLs, localhost and private-network targets, nonstandard ports, non-web schemes, oversized requests, and unsafe preview CSS. It uses a short-lived same-origin capture gate, in-process concurrency and rate limits, bounded provider responses, and cancellation. On [Workers Free](https://developers.cloudflare.com/browser-run/limits/), Quick Actions are limited to one request every 10 seconds and 10 browser minutes per day; Sundae honors one bounded `Retry-After` response instead of retrying without limit. When Cloudflare returns billed browser milliseconds, Sundae includes them in the capture receipt.

Before exposing paid capture publicly, add durable per-user budgets and trusted-edge authentication. Also configure an edge rule that rate-limits only `POST /api/capture`; the in-process limiter is a backstop, not a durable global budget.

## Evidence contract

- **Measured**: a browser or tool-contract fact with a value, threshold, and scope.
- **Judged**: an evidence-linked product opinion, never disguised as a measurement.
- **Not seen**: a route, state, interaction, or motion window outside captured scope.
- **Verified fixed**: a fresh measurement of the same route state and viewport no longer reproduces the issue.

Audited page text and tool copy are untrusted evidence, never instructions. Sundae does not infer conversion, revenue, retention, legal compliance, security, SEO rank, or backend correctness from a rendered interface. It does not receive a user’s ChatGPT password, subscription credential, or OpenAI API key.

## Challenge provenance

The WebMCP Challenge submission window opened on 25 August 2026. This public repository began during that window; it has no pre-challenge code history.

- [`cdb508e`](https://github.com/zubalr/usesundae/commit/cdb508e) on 29 August introduced the public Sundae workbench, included target, remote MCP handoff, page-scoped WebMCP tools, evidence contract, tests, and AGPL license.
- [`a439599`](https://github.com/zubalr/usesundae/commit/a439599) on 29 August hardened the production WebMCP audit loop, bounded board context, tool-contract evidence, and browser-capture behavior.

The judged flow is the zero-key `/demo` loop described above; the repository history and final deployment commit are the provenance record for its challenge-window work.

## Project map

- `app/mcp/` — public Streamable HTTP MCP entry.
- `app/api/capture/` — gated public Browser Run checkpoints.
- `app/demo/` — included reproducible audit target.
- `components/` — landing handoff and shared evidence workbench.
- `lib/mcp/` — `start_audit` tool and HTTP transport.
- `lib/webmcp/` — page-tool registration and bounded result envelopes.
- `lib/audit/`, `lib/capture/`, `lib/workbench/` — evidence, policy, and command contracts.
- `plugins/sundae/` — installable plugin manifest and audit skill.
- `evals/` and `tests/` — tool-routing cases and executable contract checks.

Run the full verification:

```bash
npm run check
npm run build
```

## License

Source code is licensed under [AGPL-3.0-only](LICENSE). The code license does not grant rights to the Sundae name or visual identity; see the [trademark notice](legal/TRADEMARK.md).
