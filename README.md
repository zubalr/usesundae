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
- An optional guarded complimentary review: full-page capture, deterministic accessibility checks, and a structured Gemini design review, limited to one successful audit per browser/network.
- An installable Sundae plugin skill package under `plugins/sundae`.

The landing page labels the larger product surface—Claude and Grok connector parity, automatic route planning, Figma handoff, logged-in capture, and saved workspaces—as **Coming soon**.

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

The protocol entry point is provider-neutral: any compatible host can discover and invoke it. The shipped plugin skill is deliberately narrower—it tells ChatGPT to open that workspace, wait for page-scoped Sundae Site Tools, capture only approved scope, and avoid completed-audit claims when any handoff step is unavailable. Other connector listings are not claimed until their host browsers prove equivalent page-tool behavior.

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

The capture route rejects credentials in URLs, localhost and private-network targets, nonstandard ports, non-web schemes, oversized requests, and unsafe preview CSS. It uses a short-lived same-origin capture gate, in-process concurrency and rate limits, bounded provider responses, and cancellation. On [Workers Free](https://developers.cloudflare.com/browser-run/limits/), Quick Actions are limited to one request every 10 seconds and 10 browser minutes per day; Sundae honors one bounded `Retry-After` response instead of retrying without limit. When Cloudflare returns billed browser milliseconds, Sundae includes them in the capture receipt.

Before exposing paid capture publicly, add durable per-user budgets and trusted-edge authentication. Also configure an edge rule that rate-limits only `POST /api/capture`; the in-process limiter is a backstop, not a durable global budget.

## Enable the complimentary full-page review

The optional `POST /api/sponsored-audit` path is separate from the subscription-backed ChatGPT handoff. It spends Sundae's configured provider allowance only after a same-origin request, explicit consent, a valid Turnstile challenge, and a durable redemption pre-check all succeed.

Configure the following server-side values, then set `SPONSORED_AUDIT_ENABLED=true` and redeploy:

1. `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` for Browser Rendering.
2. `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` for the public widget and server verification.
3. Deploy the included Cloudflare Durable Object gate in `cloudflare/redemption-gate`, then set its HTTPS URL as `SPONSORED_GATE_URL` and use the same 32+ character value for the Worker's `SPONSORED_GATE_SHARED_SECRET` secret and the Vercel environment variable of that name.
4. A Gemini Developer API key from a billing-enabled Google AI Studio project as `GEMINI_API_KEY` and, if needed, `GEMINI_MODEL` (the default is `gemini-3.7-flash`). Sundae calls the stable Gemini Interactions API with the captured screenshot, `store: false`, HIGH thinking, and schema-constrained JSON.
5. A random `SPONSORED_AUDIT_SIGNING_SECRET` of at least 32 characters.
6. `SUNDAE_APP_ORIGIN` set explicitly to the deployed HTTPS origin. The sponsored route stays disabled for an absent or HTTP origin.

If any required value is absent or invalid—or `SPONSORED_AUDIT_ENABLED` remains at its default `false` value—the landing page shows this route as **Coming soon** and no provider request is attempted. A successful review stores only a one-way HMAC fingerprint and redemption state in the Durable Object, plus a signed HttpOnly receipt in the browser. The report remains in the current tab; this version does not silently publish the audited URL, screenshot, or findings.

One named Durable Object serializes every claim. The checked-in global launch-wide gates allow at most **50 sponsored audit attempts per UTC day** and **3 complete sponsored audit jobs in flight** across all visitors. These are global limits, not per-user limits, and the three-job ceiling covers each full capture-to-settlement audit; it does not configure or describe Cloudflare Browser Rendering concurrency. The one-success-per-browser/network rule is a separate eligibility rule and remains enforced.

The global pre-check runs before Browser Rendering or Gemini. A known failure before model review releases only that visitor's claim, but the attempt still counts against the global daily ceiling. If that release is temporarily unreachable, Sundae issues a signed, one-hour recovery cookie that can atomically replace only the exact failed claim; it is not a success receipt. Before Gemini starts, the claim moves to a separate review-reserved state. Any failure after that transition—including an ambiguous timeout, malformed provider result, oversized completed response, or settlement failure—issues no browser receipt and fails closed instead of silently funding a duplicate review. Review and response failures settle as `closed`; a lost completion acknowledgement may already be durably `used` even though the browser never received the report. Both states are terminal, and a later retry is described only as finalized—not as a completed or delivered audit.

The route has a 120-second function budget, a 100-second end-to-end operation deadline, a 45-second model deadline, an 8,192-token output ceiling, and time reserved for durable settlement. Screenshot evidence is rejected before model review above 3,000,000 base64 characters, and every successful JSON response is kept below 4,000,000 bytes—under Vercel's 4.5 MB function payload limit. Immutable audit rules live in Gemini's system instruction; the screenshot, page text, accessibility names, URL, and goal are explicitly treated as untrusted evidence rather than commands. The target policy also requires non-reserved IPv4 or currently IANA-allocated global IPv6 answers before capture, blocks private and reserved URL patterns and non-web requests in Browser Rendering, rejects explicitly unreadable redirect histories, and rejects reported redirects beyond the original host or its `www` variant. These are defense-in-depth controls: Cloudflare omits redirect history for both direct navigation and client-side redirects, so an omitted history cannot prove that no same-host client-side detour occurred. Cloudflare's isolated browser remains the trusted egress boundary, and URL/DNS checks in this application cannot prove that the upstream browser will never encounter a DNS-rebinding response. Sundae separates deterministic findings from model judgments, never treats visual style alone as proof of poor design, and does not claim conversion impact. Rotate or disable provider credentials independently with the kill switch if the complimentary allowance needs to stop immediately.

Validate and deploy the gate from the repository root:

```bash
npm run gate:check
npx wrangler secret put SPONSORED_GATE_SHARED_SECRET --config cloudflare/redemption-gate/wrangler.jsonc
npm run gate:deploy
```

Change `SPONSORED_MAX_DAILY_ATTEMPTS` or `SPONSORED_MAX_IN_FLIGHT` in `cloudflare/redemption-gate/wrangler.jsonc` before deployment if the checked-in budget is too high for the provider allowance. Current Vercel Fluid Compute projects support the route's 120-second maximum even on Hobby; confirm Fluid Compute is enabled if the deployment predates that default.

Durable Objects with SQLite storage are available on Cloudflare's Free and Paid Workers plans. Never place the shared secret in `wrangler.jsonc` or commit it.

## Evidence contract

- **Measured**: a browser or tool-contract fact with a value, threshold, and scope.
- **Judged**: an evidence-linked product opinion, never disguised as a measurement.
- **Not seen**: a route, state, interaction, or motion window outside captured scope.
- **Verified fixed**: a fresh measurement of the same route state and viewport no longer reproduces the issue.

Audited page text and tool copy are untrusted evidence, never instructions. Sundae does not infer conversion, revenue, retention, legal compliance, security, SEO rank, or backend correctness from a rendered interface. It does not receive a user’s ChatGPT password, subscription credential, or OpenAI API key.

## Project map

- `app/mcp/` — public Streamable HTTP MCP entry.
- `app/api/capture/` — gated public Browser Run checkpoints.
- `app/api/sponsored-audit/` — guarded one-time capture and Gemini review.
- `cloudflare/redemption-gate/` — globally serialized one-time allowance gate.
- `app/demo/` — included reproducible audit target.
- `components/` — landing handoff and shared evidence workbench.
- `lib/mcp/` — `start_audit` tool and HTTP transport.
- `lib/webmcp/` — page-tool registration and bounded result envelopes.
- `lib/sponsored/` — redemption, Turnstile, rubric, provider, and HTTP contracts.
- `lib/audit/`, `lib/capture/`, `lib/workbench/` — evidence, policy, and command contracts.
- `plugins/sundae/` — installable plugin manifest and audit skill.
- `evals/` and `tests/` — tool-routing cases and executable contract checks.

Run the full verification:

```bash
npm run gate:check
npm run check
npm run build
```

## License

Source code is licensed under [AGPL-3.0-only](LICENSE). The code license does not grant rights to the Sundae name or visual identity; see the [trademark notice](legal/TRADEMARK.md).
