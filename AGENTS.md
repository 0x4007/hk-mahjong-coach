# Repository instructions

WARNING: UNLESS I SPECIFICALLY SAY IN MY INSTRUCTIONS YOU ARE NOT ALLOWED TO OPEN ANOTHER BROWSER FOR END TO END TESTING. This is because many agents are running concurrently and this game is too heavy for my computer to run more than a single session.

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

- Use the centralized test bus for test execution; do not launch a test command from an agent unless the user
  explicitly authorizes an exception.
- Run lint and typecheck before completing a milestone.
- Stop and repair a failed milestone gate before starting the next milestone.
- Add a regression seed or fixture for every discovered rules bug.
- Verify user-facing behavior through the real CLI, JSONL stream, API, or browser as applicable.

## Centralized unit-test bus

- Starting the Fastify UI server starts one worktree-local unit-test bus. It runs the complete Vitest unit
  suite once at startup and checks the repository at most every five minutes afterward; a second server process
  uses the existing lock instead of starting another full-suite runner. If the commit hash and content-aware dirty
  fingerprint are unchanged since the last completed pass, the scheduler skips Vitest for that tick.
- Read `.data/test-bus/manifest.json` before launching a full suite yourself. The manifest points to the
  immutable `runDirectory` and lists every assertion in `results`. Each result is a separate JSON file under
  `runDirectory/tests/`, with a readable filename derived from the test file and full test name plus a short
  collision-resistant hash. Use the listed `path` for exact readback, not a guessed filename.
- All test validation must wait for a completed bus snapshot. If `manifest.json` is missing, its `finishedAt`
  predates the relevant source change, or its status is `running`, wait for the server-owned bus to publish the next
  result and then read the exact test file from `results[].path`. Do not launch `pnpm test`, `vitest`, or a focused
  test command yourself. If no server owns the bus, start the normal UI server once and let its startup run create
  the snapshot. Typecheck, lint, build, and browser checks remain separate commands.
- Bus output is ignored local state under `.data/`. A failed or interrupted run still writes its manifest,
  stdout, stderr, and any per-test results that Vitest produced; do not treat an `error` or `aborted` status as
  a passing test result.
- Each completed manifest records the checked commit hash, dirty flag, and dirty-content fingerprint. A Git-state
  inspection failure is fail-open: the bus runs Vitest and records the inspection error instead of silently skipping.

## TypeScript

- Strict mode is mandatory.
- Do not use `any` in core, hk-rules, analysis, or protocol.
- Use discriminated unions and exhaustive checks.
- Validate all external data at runtime.

## Scope

- Prioritize engine, scoring, persistence, protocol, and teaching correctness over animation.
- Do not add online multiplayer, wagering, Japanese rules, or cloud accounts.
- Do not leave critical-path placeholders, mocked core behavior, disabled tests, or empty screens.

## First-person perspective motion

- Treat the centralized camera damper in `apps/web/src/scene/camera-motion.ts` as the single presentation
  path for essentially everything seen from the player's perspective: camera pose, viewmodel, reticule/aim
  feedback, motion, and animation. New first-person effects must be expressed as damper inputs or composed
  outputs; do not add ad hoc camera, weapon, reticule, or other player-perspective offsets in movement,
  weapon, traversal, or UI code.
- Interpret requests about reticle movement or any other attached perspective output as requests to change the
  whole centralized mechanism. Adjust the shared damper input, state, or composition so the camera, weapon hand,
  reticle/aim, and all other dependent systems receive the change and its natural second-order effects; never
  make a reticle-only adjustment that hides or bypasses the underlying camera-motion behavior.
- Route the weapon hand-held model through the same perspective motion output as the camera. This includes
  weapon bob, sway, recoil, and any other viewmodel animation so the hands do not move independently from the
  player's head.
- Include movement acceleration and deceleration, walking and running gait, jump take-off, falling from ledges,
  landing impact, ledge grabs, vaults, and climbs in the shared motion model. Tie weight responses to the actual
  velocity and acceleration so a harder stop or a larger fall produces a correspondingly deeper response.
- Keep physics authoritative for the player's base position and traversal state. The centralized damper owns only
  the presentation offsets applied after physics resolves that base pose, and reticule/aim feedback must consume
  the same offsets.

## Visual-table HMR

- After completing every visual-table feature or batch of scene edits, run
  `pnpm hmr "Describe exactly what to test"` from the repository root while `pnpm dev` is running. The optional
  quoted string appears in the connected app as an agent test note; omit it when no note is needed. Pass the note as
  the CLI argument; do not create or edit a separate note file. This requests one explicit scene HMR through the Vite
  development server; ordinary file changes do not reload connected browsers.
  The development snapshot restores the current presentation position; this is not a substitute for focused tests
  or browser acceptance.
- Report when no Vite development server or connected browser is available instead of claiming that HMR ran.
