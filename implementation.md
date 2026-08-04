# Implementation status

## Canonical state

- Common repository: `/Users/nv/repos/0x4007/hk-mahjong-coach`
- Worktree:
  `/Users/nv/repos/0x4007/hk-mahjong-coach/.codex-worktrees/implementation-takeover-019fc5b7-g06506cba54`
- Branch: `implementation-takeover-019fc5b7-g06506cba54`
- Reconciliation base: `b3d5946ce9d69efebd361433f00b988ea658a600`.
- Implementation lane: this canonical worktree, with one writer.
- The pre-existing dirty `main` and `natural-simulation-ci-g6bdbe4486d` worktrees remain preserved.
  Four coherent natural-simulation workflow files were integrated into canonical. The natural
  lane's two unrelated, inert `matchIndexOffset` runner variants were rejected from canonical
  because the workflow does not use them and they have no focused regression coverage.

## Current milestone

Milestones 6–9 are complete as local vertical slices. Milestone 10 release hardening is validated
locally; the remote natural-wall receipt and live provider attestation remain external evidence.

## Completed

- Read the complete implementation contract in `spec.md`.
- Reconciled the local branch, worktree list, remote refs, and absence of prior implementation.
- Selected a Node 24 LTS, pnpm 11, strict TypeScript 6, React 19, Vite 8, Fastify 5 stack.
- Created workspace/package boundaries, executable root scripts, validation configuration, and CI.
- Installed the pinned dependency graph and generated `pnpm-lock.yaml`.
- Passed `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and the
  production server smoke check.
- Implemented all 42 immutable tile definitions, exact 136/144 physical inventories, compact
  notation, canonical ordering, explicit seat order, seeded xoshiro RNG, deterministic shuffle,
  canonical JSON, and platform-neutral SHA-256.
- Implemented the strict ruleset schema, generated JSON Schema, full bundled profile data, explicit
  ambiguous-pattern semantics, bonus-off resolution, readable validation, eager registry checks,
  deep freezing, and versioned SHA-256 identities.
- Locked exact RNG output, shuffled-wall, and profile hashes in tests.
- Passed the Milestone 1 coverage gate with 31 tests, 99.09% statements, and 97.02% branches.
- Implemented the authoritative event-sourced game engine: exact deal/replacement traces, draws,
  discards, hidden simultaneous claims, chow/pung/kong priority, concealed and added kong robbery,
  passed-win restrictions, exhaustive draws, round progression, stable action/event IDs, redacted
  observations, safe public events, invariants, state hashes, and deterministic replay.
- Implemented neutral core scoring contracts, complete standard/special-form solving, every bundled
  rule, deterministic decomposition choice, implication/suppression/exclusion/limit semantics,
  minimum-faan previews, profile comparisons, pure payment settlement, and terminal score updates.
- Persisted scoring assessments at claim-window creation so replay and resolution consume the
  original provenance rather than re-evaluating changed state.
- Verified real standard-profile engine behavior for an exact two-faan rejection and exact
  three-faan win, including complete persisted scoring, payment deltas, public projection, and
  replay equality.
- Passed the combined Milestone 2–3 gate: 209 tests; 97.01% statements, 95.08% branches, 98.98%
  functions, and 96.86% lines; `pnpm lint` and `pnpm typecheck` exit 0.
- Implemented observation-only distance, visible improving-tile availability, faan paths, relative
  risk, deterministic candidate ranking, information-set rollouts, four fixed bot strengths, three
  personalities, ordinary legal-action policy, and terminally enforced adaptive hand locking.
- Closed the capability boundary: raw physical-tile helpers are internal to analysis, normal bots
  construct their ruleset-bound analyzer internally, negative type tests reject authoritative
  `GameState`, and hidden-state mutation leaves official analysis and bot decisions unchanged.
- Repaired the basic bot boundary so distance remains primary while personality-weighted analysis
  breaks otherwise equal choices; a fixed-seed policy regression proves the three personalities are
  not behaviorally inert.
- Replaced the former forced four-command simulation with normal policy decisions. The 500-hand fast
  gate uses three real shuffled hands across all bundled rulesets plus 497 seeded terminal regression
  hands, exercises all 12 strength/personality combinations, replays all 500 event prefixes, and
  reports zero illegal actions, invariant violations, crashes, bound failures, or replay mismatches.
- Passed the Milestone 4 reconciliation gate with 274 tests, the 500-hand receipt digest
  `sha256:1073e8769314772f57d8880e11fa710d2889730d7f1eff8db0fedebc79533352`,
  `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm smoke`.
- Added the extended natural-wall CI lane: `workflow_dispatch` inputs for hand count, shard count,
  and seed namespace; up to 20 deterministic shards; redacted receipts; and aggregate digest
  validation. A focused one-hand natural shard and aggregate smoke passed locally with digest
  `sha256:fbb7aa9f24c57aa9143a783ef731352df382db7610386c59b7589bd3ae30ad8c`.
  The interrupted local 500-hand run remains non-acceptance evidence until the remote workflow
  completes.

## Milestone 5 evidence

- The full suite passes 24 files and 338 tests. The configured coverage run passes with 336 tests.
  Focused persistence/scoring/protocol coverage passes 181 tests.
- Coverage passes the configured thresholds: core/hk-rules/protocol meet the 95% statement and
  branch gates; analysis/bots/coach/persistence meet the 85% statement gates. The fresh report
  records persistence at 87.97% statements and coach at 95.30%.
- Process restart/resume, abrupt `SIGKILL` recovery, replay hash equality, corrupt-snapshot fallback
  followed by export, migration-ledger continuity, nondestructive practice branching, learner
  evidence, reset/delete, and import/export validation all pass focused tests.
- The exact dirty SHA also passes serialized format, lint, typecheck, full tests, coverage, the
  500-hand fast simulation, build, and production smoke.

## Milestones 6–9 evidence

- The CLI dispatches human, JSONL stdio, replay, analysis, drill, rules, and profile commands. The
  JSONL host validates envelopes and action IDs, keeps stdout machine-clean, reports structured
  rejections, applies a one-second deadline, and reaches a bounded deterministic fallback after
  three malformed or timed-out responses. The isolated subprocess regression passes.
- The Fastify server composes the session controller behind validated HTTP/WebSocket routes. The
  browser now renders the existing first-person Three.js penthouse table over the local game flow,
  with keyboard-safe legal actions, save/resume, replay, hints, drills, profile, and rules views.
- Scene state is observation-derived: the exact learner hand is face-up, opponent concealed hands
  are backs/counts only, and public melds/discards are synchronized on every accepted revision.
- Offline coaching, learner evidence, curriculum progression, spaced drills, and all fourteen drill
  families are wired through the session and web surfaces. The optional Responses narrator is
  server-only, validates grounded structured output, caches by prompt identity, and falls back to
  templates on provider errors or timeouts.
- `pnpm test` passes 338 tests; the seeded Playwright browser flow passes against the isolated
  temporary-database fixture; `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and
  `pnpm smoke` pass on this dirty canonical state.
- The 10,000-hand release simulation completes 10,000/10,000 hands and 2,500/2,500 matches with
  zero failures. Its run digest is
  `sha256:6ffd08d1a4fb79c97e08c1abee1a6d75ec33ce9d01ee728b2e5cecbd2daea19e`.

## Blockers and remaining scope

- The remote natural-wall receipt and live production provider/no-key attestation are not available
  in this local checkout. They are the only remaining release evidence called out by the plan.
- The browser scene uses procedural Three.js geometry and semantic DOM controls; headed WebGL proof
  is browser-dependent, while automation intentionally skips the renderer on SwiftShader.
- This is a validated local prototype, not a production deployment claim.

## Next action

The local Milestone 10 checks are complete on the exact canonical SHA. Preserve the remote/release
evidence boundary and do not claim deployment readiness without the natural-wall receipt and live
provider attestation.
