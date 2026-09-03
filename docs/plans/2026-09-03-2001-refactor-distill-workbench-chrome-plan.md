---
title: Distill Workbench Chrome - Plan
type: refactor
date: 2026-09-03
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Distill Workbench Chrome - Plan

## Goal Capsule

- **Objective:** Make Sundae immediately understandable and keep the reviewed product as the dominant surface.
- **Means:** Remove repeated chrome, turn findings into a compact dock, and keep supporting material collapsed (KTD1, KTD2, KTD3).
- **Authority:** The user's simplification and accessibility requirements override existing presentation choices. `PRODUCT.md` defines product truth and evidence boundaries.
- **Execution profile:** Lightweight UI refactor with focused interaction tests, full repository checks, browser QA, and production verification.
- **Stop condition:** Do not ship if the main task becomes harder to find, findings cannot be operated by keyboard, or the mobile page overflows.
- **Tail ownership:** The release owner commits, pushes, waits for the production deployment, and verifies the deployed landing and demo flows.

## Product Contract

### Summary

Sundae presents one clear review workspace. The product canvas stays large. Findings remain available in a compact dock that can be resized or closed. Supporting signals stay out of the way until requested.

### Problem Frame

The landing page and workbench repeat status, navigation, and explanatory rows. The workbench gives too much height and width to chrome before the user reaches the product or a useful finding. The fixed evidence pane also limits control over the canvas.

### Key Decisions

- **Reduce chrome before adding guidance** (session-settled: user-directed - chosen over preserving the stacked status rows: the existing interface felt heavy and unintuitive). Governs R1 and R2.
- **Make evidence user-controlled** (session-settled: user-directed - chosen over a fixed wide pane: the product needs more room and the user asked for a shorter, draggable, closable sidebar). Governs R3 and R4.
- **Hide secondary material by default** (session-settled: user-directed - chosen over always-visible filters and legends: the first view should contain only the main task). Governs R5.

### Requirements

#### Hierarchy

- R1. The landing page must reach its primary action and product proof without a redundant status strip.
- R2. The workbench must show one compact header and one contextual product toolbar before the canvas.

#### Findings dock

- R3. A user must be able to close and reopen the findings dock without losing the selected finding.
- R4. On desktop, a pointer or keyboard user must be able to resize the findings dock from 288px to 560px, with a 360px default.

#### Progressive disclosure

- R5. Findings, the selected inspector, review results, and the latest action receipt must remain visible. Design signals, Site Tools, coverage, review context, agent authority, and earlier receipts must start collapsed.

#### Accessibility and responsive behavior

- R6. Interactive controls must expose names, state, focus, and keyboard operation.
- R7. The landing page and workbench must avoid page-level horizontal overflow at 320px and 390px widths.
- R8. Reduced-motion users must not receive smooth focus scrolling.

### Acceptance Examples

- AE1. Covers R3 and R6. Given a non-first selected finding, when the user closes and reopens the dock, the same finding and inspector return and focus moves to the restored control path.
- AE2. Covers R4 and R6. Given focus on the desktop resize handle, when the user presses Home or End, the dock reaches 288px or 560px and announces the value.
- AE3. Covers R5. Given the initial review state, findings, the selected inspector, review results, and the latest receipt are visible. Each named supporting section is available through a closed disclosure.
- AE4. Covers R7. Given 320px or 390px viewport width, the document width does not exceed the viewport width.
- AE5. Covers R3, R6, and R7. Given a 320px or 390px viewport, the dock becomes a full-width stacked section, the resize handle is absent, and Show findings remains available.

### Scope Boundaries

- Preserve the audit, decision, preview, and verification workflow.
- Preserve the existing visual language and token system.
- Preserve the ChatGPT Work handoff and its GPT-5.6 Sol medium launch preference.
- Do not add filters, navigation layers, dashboards, or new evidence types.

## Planning Contract

### Key Technical Decisions

- KTD1. Use the existing landing and workbench components as the only hierarchy owners. Remove duplicated rows instead of replacing them with new components. (session-settled: user-directed - chosen over reorganizing the same rows: subtraction creates the required focus and lowers maintenance cost)
- KTD2. Keep the findings pane in the desktop split layout at a 360px default with 288px and 560px bounds. Add a separator control and a persistent reopen action. Below 900px, use a full-width stacked pane without the resize handle. (session-settled: user-directed - chosen over a fixed sidebar: the user needs direct control without changing the audit model)
- KTD3. Use native disclosure semantics for design signals, Site Tools, coverage, review context, agent authority, and earlier receipts. Keep review results and the latest action receipt visible. This keeps keyboard behavior and theming inside established contracts.
- KTD4. Move selected-finding focus to the inspector and use the reduced-motion media query to choose scroll behavior. This keeps the action result visible without overriding user motion preferences.

### Assumptions

- The Vercel project at `usesundae.vercel.app` is the production target. Production is ready only when Vercel reports a deployment for the pushed commit as READY.
- The included `/demo` remains the release-critical workbench path.
- No data schema, API contract, or persisted review state changes are required.

### Sequencing

Implement the visual hierarchy first. Add the findings dock interaction next. Update source-contract tests and run browser verification after the layout stabilizes. Ship only after the full repository gate passes.

## Implementation Units

### U1. Compact the landing and workbench hierarchy

- **Goal:** Satisfy R1, R2, and R7 by removing repeated rows and giving the canvas more of the first viewport.
- **Files:** `app/page.tsx`, `app/page.module.css`, `components/workbench/WorkbenchView.tsx`, `components/Workbench.module.css`
- **Approach:** Apply KTD1. Keep one app header and one product toolbar. Move captured-checkpoint navigation into the collapsed What was reviewed panel. Keep responsive navigation within narrow widths.
- **Test scenarios:** Confirm primary landing actions stay reachable at desktop, 390px, and 320px. Confirm the workbench topbar remains visible when opened through `#workbench`.
- **Verification:** Run `npm test` and inspect desktop and mobile screenshots with the browser harness.

### U2. Add the accessible findings dock

- **Goal:** Satisfy R3, R4, R5, R6, and R8 without changing finding data or decisions.
- **Files:** `components/Workbench.tsx`, `components/workbench/WorkbenchView.tsx`, `components/Workbench.module.css`, `lib/workbench/coverage.ts`
- **Approach:** Apply KTD2, KTD3, and KTD4. Bound desktop dock width, expose close and reopen state, support pointer and keyboard resizing, collapse the named supporting sections, and focus the inspector after selection. Use a full-width stacked dock on mobile.
- **Test scenarios:** Select a non-first finding, close and reopen the dock, and confirm the same inspector remains selected. Resize on desktop with drag, arrow keys, Home, and End. Confirm the handle is absent and the reopen control remains available on mobile. Confirm reduced-motion selects instant scrolling.
- **Verification:** Run `npm test`, type checking, and browser interaction checks at desktop and mobile sizes.

### U3. Preserve launch behavior and release the integrated change

- **Goal:** Preserve the ChatGPT Work handoff while proving the simplified interface in the complete product flow.
- **Files:** `components/AuditLauncher.tsx`, `lib/launch.ts`, `tests/landing-contract.test.ts`, `tests/launch.test.ts`, `tests/public-surface.test.ts`, `tests/workbench-flow.test.ts`
- **Approach:** Keep the existing ChatGPT Work routing and model preference. Update source-contract coverage for the simplified interface. Remove stale assertions tied to deleted chrome. Push the verified commit to `main`, require a READY Vercel deployment whose source commit matches it, and use the linked-project deployment fallback only if the Git deployment does not appear.
- **Test scenarios:** Launch the work handoff and verify its encoded destination and model settings. Run the included demo through accept, preview, and verify. Confirm closed, open, and resized dock states do not interrupt that workflow.
- **Verification:** Run `npm run check`, then verify the deployed landing page and `/demo` flow with a logged-in browser.

## Verification Contract

| Gate                | Command or action                                                                                                 | Proves                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Type safety         | `npm run typecheck`                                                                                               | Updated state, refs, and component contracts compile.                                         |
| Static quality      | `npm run lint`                                                                                                    | Code meets repository lint and complexity rules.                                              |
| Design tokens       | `npm run lint:tokens`                                                                                             | UI changes use the product token system.                                                      |
| Formatting          | `npm run format:check`                                                                                            | Changed files match repository formatting.                                                    |
| Behavior            | `npm test`                                                                                                        | Launch, workbench flow, copy, and interaction contracts pass.                                 |
| Production build    | `npm run build`                                                                                                   | Next.js creates the production artifact.                                                      |
| Integrated gate     | `npm run check`                                                                                                   | Every repository release gate passes in sequence.                                             |
| Browser QA          | Desktop, 390px, and 320px interaction run                                                                         | Hierarchy, overflow, focus, close, reopen, and resize work in a rendered browser.             |
| Production identity | Vercel deployment inspection                                                                                      | The READY production deployment names the pushed commit before browser QA starts.             |
| Production behavior | `SUNDAE_GEOMETRY_ORIGIN=https://usesundae.vercel.app npm run verify:production` plus logged-in browser smoke test | The matched deployment serves the new interface and the ChatGPT Work handoff opens correctly. |

## Definition of Done

- U1 is done when the redundant landing strip and stacked workbench rows are absent, the canvas starts earlier, and narrow widths have no page overflow.
- U2 is done when the dock closes, reopens, resizes with pointer and keyboard, and the selected inspector receives visible focus.
- U3 is done when launch behavior, the full audit workflow, the repository gate, the production deployment, and the deployed smoke test pass.
- The final diff contains no debug code, abandoned styling, unrelated changes, secrets, or generated development-only paths.
