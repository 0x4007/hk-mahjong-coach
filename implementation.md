# Implementation status

## Canonical state

- Common repository: `/Users/nv/repos/0x4007/hk-mahjong-coach`
- Worktree:
  `/Users/nv/repos/0x4007/hk-mahjong-coach/.codex-worktrees/implementation-takeover-019fc5b7-g06506cba54`
- Branch: `implementation-takeover-019fc5b7-g06506cba54`
- The release candidate is clean and includes the scripted JSONL acceptance, canonical verification
  receipt documentation, and the registered natural-simulation workflow.
- Reconciliation base: `b3d5946ce9d69efebd361433f00b988ea658a600`.
- Implementation lane: this canonical worktree, with one writer.
- The pre-existing dirty `main` and `natural-simulation-ci-g6bdbe4486d` worktrees remain preserved.
  Four coherent natural-simulation workflow files were integrated into canonical. The natural
  lane's two unrelated, inert `matchIndexOffset` runner variants were rejected from canonical
  because the workflow does not use them and they have no focused regression coverage.

## Current milestone

Milestones 6–10 are complete as local vertical slices plus the accepted remote natural-wall receipt.
The optional live production provider/no-key attestation remains an external deployment check.

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

- The current full suite passes 24 files and 340 tests. The configured coverage run passes with 338
  tests.
  Focused persistence/scoring/protocol coverage passes 181 tests.
- Coverage passes the configured thresholds: core/hk-rules/protocol meet the 95% statement and
  branch gates; analysis/bots/coach/persistence meet the 85% statement gates. The fresh report
  records persistence at 87.97% statements and coach at 95.30%.
- Process restart/resume, abrupt `SIGKILL` recovery, replay hash equality, corrupt-snapshot fallback
  followed by export, migration-ledger continuity, nondestructive practice branching, learner
  evidence, reset/delete, and import/export validation all pass focused tests.
- The exact clean candidate SHA also passes serialized format, lint, typecheck, full tests, coverage,
  the 500-hand fast simulation, build, and production smoke.

## Milestones 6–9 evidence

- The CLI dispatches human, JSONL stdio, replay, analysis, drill, rules, and profile commands. The
  JSONL host validates envelopes and action IDs, keeps stdout machine-clean, reports structured
  rejections, applies a one-second deadline, and reaches a bounded deterministic fallback after
  three malformed or timed-out responses. A real subprocess agent selects emitted legal actions
  through a seeded hand and reaches `hand_ended` without rejection; the timeout fallback regression
  also passes.
- The Fastify server composes the session controller behind validated HTTP/WebSocket routes. The
  browser now renders the existing first-person Three.js penthouse table over the local game flow,
  with keyboard-safe legal actions, save/resume, replay, hints, drills, profile, and rules views.
- Home setup supports one-wind practice and full four-wind matches through the same API. Full-match
  terminal observations render public final standings; the Three.js scene remains the first-person
  presentation layer.
- The home screen exposes ten deterministic seeded rooms; `mahjong demos` lists the same rooms for
  the CLI. Rules now have a fetched scoring glossary and the complete local tile catalog.
- Replay has a real, server-gated post-hand omniscient toggle. It reveals concealed hands only for
  terminal hands or sandbox mode; live non-sandbox replay responses remain observation-redacted.
- Scene state is observation-derived: the exact learner hand is face-up, opponent concealed hands
  are backs/counts only, and public melds/discards are synchronized on every accepted revision.
- Offline coaching, learner evidence, curriculum progression, spaced drills, and all fourteen drill
  families are wired through the session and web surfaces. The optional Responses narrator is
  server-only, validates grounded structured output, caches by prompt identity, and falls back to
  templates on provider errors or timeouts.
- `pnpm test` passes 340 tests and `pnpm test:coverage` passes 338 tests at 93.61% statements and
  87.64% branches; the seeded Playwright browser flows pass against the isolated temporary-
  database fixture. `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm smoke`
  pass on the canonical candidate.
- The 10,000-hand release simulation completes 10,000/10,000 hands and 2,500/2,500 matches with
  zero failures. Its run digest is
  `sha256:6ffd08d1a4fb79c97e08c1abee1a6d75ec33ce9d01ee728b2e5cecbd2daea19e`.
- GitHub Actions verify run `30878077706` is green for the implementation candidate. The workflow annotation
  only reports the hosted runner's Node 20 action deprecation warning. The final documentation candidate
  was also green in verify run `30878719618` at SHA `048e7f54ef25916436dfd301d681c5469dc693b5`.
- GitHub Actions natural-simulation run `30903897249` passed at registered default-branch SHA
  `989c6b6c7bfaee955edbc005207496e12c6e08c2`. All 20 shards and the aggregate job passed for
  500/500 fully natural shuffled-wall hands under seed namespace `m4-natural-ci-v1`; the aggregate
  receipt digest is `sha256:aa7471e49e9e389db568a2557b853817407a6e79631e88e7bb66c003378b6ec2`.
- Final hosted verify run `30907663837` passed on this documentation state at SHA
  `6ca867daa2940ac98cd74a36eeb3e9e8794c8af2`.

## Blockers and remaining scope

- Live production provider/no-key attestation is not available in this local checkout. It remains an
  external deployment check; the offline template path is the supported no-key behavior.
- The browser scene uses procedural Three.js geometry and semantic DOM controls; headed WebGL proof
  is browser-dependent, while automation intentionally skips the renderer on SwiftShader.
- The ten seeded rooms are deterministic named seeds with teaching focus metadata; they are not
  bespoke scripted wall fixtures for every acceptance scenario. Use the core/test-fixture scenarios
  for exact claim, kong, robbery, and scoring setup.
- This is a validated local prototype, not a production deployment claim.

## Next action

The local Milestone 10 checks and the remote natural-wall receipt are complete. Preserve the
deployment evidence boundary and do not claim production deployment readiness without a live
provider/no-key attestation.
