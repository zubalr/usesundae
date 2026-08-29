## Product contract

From `~/.agent-kit/product`. Repair with `~/.agent-kit/bin/product-init`.

**Enforced mechanically.** A post-edit hook lints the file you just wrote; the
pre-commit hook and CI run `npm run check`. CI restores the contract files from
the default branch, so a branch cannot weaken its own gates.

- Tokens only. Raw values live in the token file; nowhere else. The baseline may
  only shrink — never re-baseline to make a check pass.
- Complexity ceiling in `.oxlintrc.json` ratchets down, never up.
- Run `npm run check` before claiming done.

**What "done" means for UI here**

- Do not ship the default look. When the visual direction is unset, run
  `design-inspo` and build from its brief. Cream-and-serif, a lone acid accent,
  centred everything and rounded corners on every surface are what a model
  reaches for when it has not looked — a signal you skipped this step.
- Both themes come from the token file. **Never a `prefers-color-scheme` branch
  in a component.**
- Motion is deliberate: a duration token, one property, and a reason. Anything
  slower than the slowest token needs an argument.
- Real content, never lorem. Keyboard focus is visible. Wide content scrolls
  inside its own container, never the page body.

**Anti-slop**

- Smallest coherent change that solves the problem. Subtract before adding.
- Before adding a branch, check whether an existing one covers the case or two
  can merge. Complexity that grows every turn records past debugging, not
  behaviour.
- No speculative abstractions, no options nobody passes, no comments restating
  the code.
- Deleting code is a valid change. Say what you removed and why.
