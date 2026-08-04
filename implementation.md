# Implementation status

## Canonical state

- Repository: `/Users/nv/repos/0x4007/hk-mahjong-coach`
- Branch: `main`
- Reconciliation base: `b3d5946ce9d69efebd361433f00b988ea658a600`.
- Implementation lane: the existing checkout, with one writer and no task worktrees.

## Current milestone

Milestone 5 — Persistence and replay audit.

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
- Replaced the former forced four-command simulation with normal policy decisions. The 500-hand fast
  gate uses three real shuffled hands across all bundled rulesets plus 497 seeded terminal regression
  hands, exercises all 12 strength/personality combinations, replays all 500 event prefixes, and
  reports zero illegal actions, invariant violations, crashes, bound failures, or replay mismatches.
- Passed the Milestone 4 reconciliation gate with 278 tests, the 500-hand receipt digest
  `sha256:6a9d354a58154b33c966915e8dd5b1a6d56a33a02145a299fdb8e332771ee7bb`,
  `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm smoke`.
- Added the extended natural-wall CI lane: a manually dispatchable `workflow_dispatch` with a
  validated hand count and seed namespace, exactly 128 deterministic matrix shards capped at 20
  concurrent free runners, distinct shard seed namespaces, global hand offsets, allowlisted redacted
  receipts, and fail-closed aggregate digest validation. The aggregator recomputes each shard's
  deterministic run digest and the regression suite rejects extra fields, tampering, and incomplete
  coverage. A focused one-hand natural shard and aggregate validation smoke passed locally. The
  interrupted local 500-hand run remains non-acceptance evidence until the remote workflow completes.

## Blockers

None.

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
  Space performs a quick jump at roughly twice the prior apex while preserving the same airtime. Double-tap
  W engages a 3× sprint until all movement keys are released; sprint carries across a held direction
  transfer such as W→A/D/S, movement eases into and out of momentum, the center reticule remains visible,
  and the Bokeh pass follows the nearest non-overlay object under its ray.
- Pointer-lock state fades the instructional intro/footer overlays so the controlled scene stays clear.
- The scene now resolves `high`, `medium`, or `low` presentation quality from an explicit option or
  conservative hardware signals. The selected DPR cap, shadow map, and glass mode are applied without
  changing scene/game state; the composer ends with `OutputPass`, and shader compilation is warmed after
  the first frame.
- The penthouse now includes four restrained integrated player stations and a legible static AI-teacher
  panel, while the skyline and cyan system materials receive only slow, low-amplitude ambient modulation.
  A warm loading treatment covers the first render and the animation loop pauses while the document is hidden.
- The procedural backdrop now uses a local PMREM `RoomEnvironment`, six nearer rooftop masses with parapet
  caps, and a separated final drawn tile in the staged hand so the room, skyline depth, and teaching fixture
  read clearly without external assets.
- Mobile browsers are detected from coarse pointer/touch capability or mobile user-agent signals. The
  mobile panel recommends landscape orientation, exposes an explicit iOS motion-permission button,
  and reports whether orientation look is ready or denied. Touch movement uses a four-way virtual
  joystick with diagonal movement and continuous 0–100% speed control: center is stopped, forward
  outer edge reaches the existing sprint speed, a forward diagonal reaches 75%, and backward/sideways
  outer edges cap at 50% of sprint with a smooth forward-bias curve between them. A separate touch swipe adjusts the seat
  camera yaw and pitch at a tuned drag sensitivity. Swiping also works when motion look is enabled;
  its new camera heading becomes the gyro calibration reference. Crouch and Jump fire on independent
  touch pointers, so either action can be used while the movement joystick remains held. Mobile text
  selection and iOS touch callouts are disabled for the entire immersive surface. Crouch toggles the
  existing seated camera state and Jump uses the existing bounded first-person arc.
- Development mode now exposes `?debug=1` controls for camera presets, FOV, exposure, tone mapper, fog,
  skyline visibility, and renderer metrics. Skyline windows are batched with `InstancedMesh`, and the
  three hero landmarks have distance-based `LOD` silhouettes. The documented screenshot checkpoint uses
  the existing Playwright CLI at a fixed 1440×900 desktop viewport.
- The visual preview's Vite and Fastify hosts bind to `0.0.0.0` for same-LAN iPhone testing. This is a
  deliberate local-preview exception to the spec's loopback default; motion sensors can still require
  a secure HTTPS origin in Safari.
- The table now owns the full dynamic viewport (`100dvh`) with title, view buttons, status, and control
  hints as unobtrusive scene overlays rather than a scrolling page card.
- `three@0.185.1` and matching `@types/three@0.185.3` are the only new runtime/development packages.
  Online research checked the official Three.js ecosystem and CC0 texture sources; this prototype uses
  no external asset files so licensing can be reviewed before adding a production asset pack.
- `pnpm build`, `pnpm smoke`, `pnpm format:check`, `pnpm lint`, and `pnpm typecheck` pass.
- The connected browser rejected the local URL while its admin security check was unavailable, so
  rendered-browser acceptance and camera-button smoke evidence remain pending.

## Next action

Audit the existing Milestone 5 persistence/replay slice against restart/resume, hash verification,
corrupt-snapshot fallback, nondestructive branching, and export/import acceptance before changing
its status or beginning dependent CLI/server integration.
