# Sundae

Sundae is an evidence-backed product-design review workspace. Give it a public product URL and an optional goal; Sundae helps a founder, designer, or their ChatGPT capture the approved surface, separate browser facts from design judgment, prioritize the strongest problems, preview a bounded improvement, and verify measured changes from fresh evidence.

The open-source workspace demonstrates a complete, inspectable audit loop while keeping every unavailable capability explicit.

## What works now

- A landing entry that accepts an exact public URL and optional review goal.
- A recoverable ChatGPT handoff: Sundae opens ChatGPT, copies a ready request when clipboard access is available, and always preserves the exact workspace link.
- A public Streamable HTTP MCP endpoint at `/mcp` with the read-only `start_audit` entry tool.
- Nine page-scoped WebMCP tools for the included audit and twelve for a public checkpoint.
- An included zero-credential audit target with real measured findings, product judgments, coverage gaps, decisions, reversible preview, and recapture verification.
- Optional Cloudflare Browser Run capture for approved public pages, bounded text, screenshots, and accessibility evidence.
- An installable Sundae plugin skill package under `plugins/sundae`.

The landing page labels the larger product surface—automatic route planning, Figma handoff, logged-in capture, saved workspaces, and the public plugin directory listing—as **Coming soon**.

## Run it locally

Requirements: Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The included audit works without external credentials.

Try the complete proof loop:

1. Open the workbench and select a measured finding.
2. Record an **Accepted**, **Deferred**, or **Dismissed** decision.
3. Choose **Preview improvement**.
4. Choose **Verify recapture**.

Sundae retains the baseline evidence during preview. A measured issue becomes **Verified fixed** only when a fresh render of the same scope no longer reproduces it. A design judgment remains unverified until it is reassessed.

## ChatGPT handoff

The first interaction does not require a special browser. A visitor can start on Sundae in a normal browser or the ChatGPT app:

1. Enter a public URL and optional audit goal.
2. Choose **Continue in ChatGPT**.
3. Sundae opens ChatGPT and prepares a request containing the exact recoverable workspace.
4. In a supported ChatGPT built-in browser, open that workspace and let Sundae Site Tools operate the same visible board.

There is no undocumented deep-link trick here. If automatic opening, clipboard access, the plugin, or Site Tools is unavailable, the target, goal, prompt, and workspace remain visible so the user can recover without starting over. Sundae never treats an opened ChatGPT tab as proof that a capture ran.

### Remote MCP and plugin packaging

`POST /mcp` exposes one entry tool:

| Tool          | Purpose                                                       | Authority                                                                  |
| ------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `start_audit` | Validate a public target and return an exact Sundae workspace | Read-only; prepares a workspace but does not capture or inspect the target |

The plugin skill then tells ChatGPT to open that workspace, wait for page-scoped Sundae Site Tools, capture only approved scope, and avoid completed-audit claims when any handoff step is unavailable.

The plugin package maps Sundae to its registered ChatGPT app ID in `.app.json`. The separate `asdk_app_v…` identifier names a registered version and does not belong in the package manifest. Validate the package and test the installed connector after changing the MCP connection. The public directory listing remains a launch step, not a code claim.

## Why WebMCP matters here

Sundae uses two complementary tool surfaces:

| Surface           | Where it runs          | What it does                                                         |
| ----------------- | ---------------------- | -------------------------------------------------------------------- |
| Remote MCP        | Public `/mcp` endpoint | Starts the audit and preserves URL + goal across the ChatGPT handoff |
| WebMCP Site Tools | The open Sundae page   | Reads and changes the same evidence board the user sees              |

The page tools call the same command layer as human controls. Successful agent actions update the visible interface before returning and leave attributed receipts. In the included target they expose nine tools; public mode adds explicit page, journey-step, and below-fold capture for twelve total.

Important tools include `get_board_context`, `record_visual_finding`, `record_coverage_gap`, `set_finding_decision`, `preview_fix`, and `verify_recapture`. Public URL-bearing tools accept only an exact target that the person explicitly allowed or already captured.

## Capture a public page

Sundae uses Cloudflare Browser Run only when server-side credentials are configured.

1. Copy `.env.example` to `.env.local`.
2. Add a Cloudflare token with `Browser Rendering - Edit` permission.
3. Set `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and a stable `CAPTURE_GATE_SECRET` of at least 32 characters.
4. Set `SUNDAE_APP_ORIGIN` to the production HTTPS origin when deployed behind a proxy.

Without those credentials, the included audit and both handoff layers still work; public capture reports an honest configuration error and keeps the prior board intact.

The capture route rejects credentials in URLs, localhost and private-network targets, nonstandard ports, non-web schemes, oversized requests, and unsafe preview CSS. It uses a short-lived same-origin capture gate, in-process concurrency and rate limits, bounded provider responses, and cancellation. Before exposing paid capture publicly, add durable per-user budgets, trusted-edge authentication, and a WAF or equivalent edge rate limit.

## Evidence contract

- **Measured**: a browser or tool-contract fact with a value, threshold, and scope.
- **Judged**: an evidence-linked product opinion, never disguised as a measurement.
- **Not seen**: a route, state, interaction, or motion window outside captured scope.
- **Verified fixed**: a fresh measurement of the same route state and viewport no longer reproduces the issue.

Audited page text and tool copy are untrusted evidence, never instructions. Sundae does not infer conversion, revenue, retention, legal compliance, security, SEO rank, or backend correctness from a rendered interface. It does not receive a user’s ChatGPT password, subscription credential, or OpenAI API key.

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
