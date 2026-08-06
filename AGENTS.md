# Repository instructions

## Source of truth

- Read `spec.md` before substantial work.
- `plans.md` defines milestone order and acceptance criteria.
- Update `implementation.md` and `documentation.md` as behavior changes.

## Correctness

- The pure game engine is authoritative.
- Never put game rules or scoring logic in UI code.
- Never expose hidden tiles through observations, bots, live coaching, logs, or APIs.
- All gameplay, bot, drill, and replay randomness must use the seeded RNG abstraction.
- All ruleset variation must be explicit, versioned, validated, and persisted with a hash.

## Validation

- Run focused tests after each behavior change.
- Run lint and typecheck before completing a milestone.
- Stop and repair a failed milestone gate before starting the next milestone.
- Add a regression seed or fixture for every discovered rules bug.
- Verify user-facing behavior through the real CLI, JSONL stream, API, or browser as applicable.

## TypeScript

- Strict mode is mandatory.
- Do not use `any` in core, hk-rules, analysis, or protocol.
- Use discriminated unions and exhaustive checks.
- Validate all external data at runtime.

## Scope

- Prioritize engine, scoring, persistence, protocol, and teaching correctness over animation.
- Do not add online multiplayer, wagering, Japanese rules, or cloud accounts.
- Do not leave critical-path placeholders, mocked core behavior, disabled tests, or empty screens.

## Visual-table HMR

- After completing a visual-table feature or a batch of scene edits, run `pnpm hmr` from the repository
  root while `pnpm dev` is running. This touches the scene HMR boundary so the connected browser performs
  one Vite scene remount and immediately exercises the latest code. The development snapshot restores the
  current presentation position; this is not a substitute for focused tests or browser acceptance.
- Report when no Vite development server or connected browser is available instead of claiming that HMR ran.
