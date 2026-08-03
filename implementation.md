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

Milestone 5 — Persistence and replay repairs and acceptance.

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

## Blockers

- Full-data deletion and learner reset can retain nullable LLM metadata rows.
- Corrupt-snapshot fallback is not yet proven through continued play plus export/import.
- Export/schema migration and migration-ledger continuity lack required coverage.
- The real process-restart/latest-resumable-game path is not yet composed through a client or server.
- Persistence is not yet included in its required coverage gate.

## Visual table prototype lane — 2026-08-03

- Isolated worktree: `/Users/nv/repos/0x4007/hk-mahjong-coach/.codex-worktrees/visual-table`.
- Branch: `visual-table-gb9d082b587`, based on `7212f3ac98679ea62aedcd9f1d86b3a587c9b17d`.
- Added a browser-only Three.js base for the future Milestone 7 table: a four-sided table, stacked
  walls, face-up human hand, face-down opponent hands, public discards and melds, dice, named presentation
  anchors, and a procedural Manhattan skyline behind a double-height penthouse window wall.
- Tile faces and backs are generated locally from the immutable tile catalog; no hidden opponent tile
  identity is placed in the scene. The scene is deliberately deterministic and does not replace the
  engine, observation, protocol, persistence, or legal-action surfaces.
- The tile treatment is warm ivory with recognizable local face art and an original charcoal/red/cyan
  back. The table uses a charcoal playing field, white lacquer shell, red undercut, and cyan system seam;
  playing-field, center, and shell layers stay separated to avoid WebGL z-fighting.
- The rendering pass now follows the supplied Mirror's Edge-style contract without copying its assets:
  broad white architectural planes, dark recessed voids, a sparse red directional line, pale cyan system
  light, a bright late-afternoon key, original Midtown landmark silhouettes, and limited penthouse props.
- The canvas resize path now coalesces `ResizeObserver` notifications and ignores unchanged
  dimensions; the renderer uses the current `PCFShadowMap` setting instead of the deprecated soft-map
  constant.
- The seat camera is now a centered eye-level first-person preset. Clicking the canvas enters browser
  pointer lock; mouse movement looks around with unrestricted vertical pitch, WASD/arrow keys move through
  the penthouse within room bounds, Escape releases the pointer, and the overhead button switches back to
  orbit controls.
- The first-person lens uses a 90° standing FOV and a smooth 68° seated FOV with 1.8 pointer speed. Shift
  toggles a 1.45 eye-height sit state at half walking speed; directional seat signs hide while seated.
  Space performs a short, snappy jump, movement eases into and out of momentum, the center reticule remains
  visible, and the Bokeh pass follows the nearest non-overlay object under its ray.
- Pointer-lock state fades the instructional intro/footer overlays so the controlled scene stays clear.
- The table now owns the full dynamic viewport (`100dvh`) with title, view buttons, status, and control
  hints as unobtrusive scene overlays rather than a scrolling page card.
- `three@0.185.1` and matching `@types/three@0.185.3` are the only new runtime/development packages.
  Online research checked the official Three.js ecosystem and CC0 texture sources; this prototype uses
  no external asset files so licensing can be reviewed before adding a production asset pack.
- `pnpm build`, `pnpm smoke`, `pnpm format:check`, `pnpm lint`, and `pnpm typecheck` pass.
- The connected browser rejected the local URL while its admin security check was unavailable, so
  rendered-browser acceptance and camera-button smoke evidence remain pending.

## Next action

Add focused Milestone 5 regressions for deletion, snapshot recovery, export/schema migration, hash
tampering, and migration-ledger continuity; make the smallest repository fixes; then prove an exact
restart/resume path before beginning dependent CLI/server integration.
