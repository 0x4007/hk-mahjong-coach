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
- The follow-up art pass shifts the sky and architectural palette toward white while retaining the warm visible sun
  and saturated wayfinding accents for stronger Mirror's Edge contrast.
- The cinematic material/lighting pass keeps that hierarchy explicit: restrained procedural grain replaces
  repeated scratch noise, white architecture is separated from charcoal reveals by roughness and shadow,
  the floor uses a slate clearcoat epoxy response, and AgX mapping combines a warm key with cyan fill,
  lavender rim, and blue/lavender atmospheric haze. Adaptive exposure targets the high-key baseline while
  retaining headroom for lacquer and tile highlights. Bokeh and depth-of-field focus behavior remain unchanged.
- The play space is expanded to a 17.2 m × 13.4 m shell, with the first-person movement bounds widened to
  match so the room reads larger without changing the table layout.
- The canvas resize path now coalesces `ResizeObserver` notifications and ignores unchanged
  dimensions; the renderer uses the current `PCFShadowMap` setting instead of the deprecated soft-map
  constant.
- The shipping camera starts as a centered 45° composed table view, then supports click-to-capture pointer
  lock, mouse/touch look, and WASD/joystick movement. The overhead/orbit view and advanced visual panel
  are debug-only (`?debug=1`), while the normal mode now exposes a persistent video-quality selector.
- The first-person seat preset commits the camera matrix before pointer lock, so the composed table view is
  visible while the instructional overlay is waiting for interaction.
- Pointer-lock state fades the instructional intro/footer overlays so the controlled scene stays clear.
- The scene now resolves `high`, `medium`, or `low` presentation quality from an explicit option or
  conservative device-memory/core signals. Adaptive selects medium unless the browser reports at least 8 GB
  and 8 logical cores; users can now select any preset in production via the video quality selector, with higher
  settings persisted for reloads. The selected DPR cap, shadow map, and glass mode
  are applied without changing scene/game state; Bokeh is enabled by default only for high, GTAO is an explicit
  debug opt-in, the composer ends with `OutputPass`, and readiness uses a cancellable first-render task without
  forcing a synchronous shader compile on software WebGL.
- The penthouse now includes four restrained integrated player stations and a legible static AI-teacher
  panel, while the skyline and cyan system materials receive only slow, low-amplitude ambient modulation.
  A warm loading treatment covers the first render and the animation loop pauses while the document is hidden.
- The procedural backdrop now uses a local PMREM `RoomEnvironment`, six nearer rooftop masses with parapet
  caps, and a separated final drawn tile in the staged hand so the room, skyline depth, and teaching fixture
  read clearly without external assets.
- The FPS play space and procedural backdrop now span five 100 m chunks per side (a 1 km × 1 km navigable world,
  ±500 m from the origin) and apply a 2× per-chunk feature density multiplier across buildings, props, signs,
  and utility posts. Weapon pickups use the same full-world bounds instead of a smaller legacy spawn square.
- Mobile browsers keep the landscape guidance in shipping and expose motion look, touch swipe, joystick,
  crouch, and jump against the same composed initial camera.
- Development mode now exposes `?debug=1` controls for camera presets, FOV, exposure, tone mapper, fog,
  skyline visibility, and renderer metrics. Skyline windows are batched with `InstancedMesh`, and the
  three hero landmarks have distance-based `LOD` silhouettes. The documented screenshot checkpoint uses
  the existing Playwright CLI at a fixed 1440×900 desktop viewport.
- Normal development mode preloads `/__codex/visual-debug-state` before mounting the Three.js scene, so a
  fresh origin such as a Cloudflare tunnel receives the saved fog and lighting values on its first render;
  debug mode remains the only writer, and a bounded read timeout falls back to the normal defaults.
- The visual preview's Vite and Fastify hosts bind to `0.0.0.0` for same-LAN iPhone testing. Vite now
  serves HTTPS with an ignored, locally generated certificate covering the host's current LAN IPv4
  addresses, while proxying API and WebSocket traffic to the local Fastify HTTP server. This is a
  deliberate local-preview exception to the spec's loopback default and gives Safari a secure origin
  for motion permission.
- The table now owns the full dynamic viewport (`100dvh`) with title, view buttons, status, and control
  hints as unobtrusive scene overlays rather than a scrolling page card.
- The visual review correction keeps the shipping camera at the specified 45° composed initial view while
  retaining the user-facing pointer-lock/touch movement path. Overhead/orbit and the visual panel are debug-only
  (`?debug=1`), while the user-facing quality dropdown stays available in production for adaptive/high/medium/low.
- First-person presentation now adds a small direction-change roll kick for sprinting lateral shifts and a
  damped speed-driven vertical camera bob. The effect is camera-only, resets on blur/view changes, and does
  not alter movement physics or the authoritative game state.
- The scene reticule now reads the same damped first-person roll and head-bob offsets as the camera. Rapid lateral
  direction changes therefore produce a matching lag, while the focus ray remains anchored to the configured
  reticule position. The outer ring is inverted at -1x and the center dot is tuned to a 5x total displacement.
  The current experiment multiplies the underlying camera weight-shift targets by 2x; the reticule still reads
  the raw shared camera output.
- The first-person controller now uses Apache-2.0 Rapier (`@dimforge/rapier3d-compat`) with a kinematic capsule.
  The floor and table remain explicit colliders, while meaningful meshes under the environment, generated room,
  and gateway roots are converted to coarse world-space AABBs. Streamed city buildings, props, and skybridges use
  explicit rotated boxes; the streamed collider set is rebuilt only when a new append-only chunk enters the 3×3
  lookahead window. Upright props are static blockers and become dynamic bodies after a knock, so walking no longer
  passes through the development boxes. Rendering geometry stays separate from collision geometry; decorative
  strips, floor inlays, tiles, and skyline detail stay out of the blocking set. A coarse AABB runtime is active while
  Rapier WASM loads and remains the fallback on failure, so it feeds the same ledge/vault/wall traversal state machine
  instead of falling back to unconstrained movement.
- Parkour-feel movement now checks airborne ledges first and low vaults second. Both use a capsule-centre target on a
  supported surface and animate onto it in a small vertical window, preserving the short Mirror's Edge-inspired climb
  rather than snapping instantly.
- Tall-wall traversal is separate from the ledge path. A real side collision with a wall whose top clears the capsule
  head can attach the capsule just outside the approached face; gravity and ordinary movement are suppressed while
  hanging, and forward or Space starts a two-phase lift-and-cross transition. Wall detection runs only after ledge and
  low-vault rejection. The resolver also considers streamed static obstacle boxes, while knocked dynamic props remain
  ineligible. The climbing-gym preset starts close enough to the dedicated wall for a normal walk to reach it without
  a sprint double-tap.
- The Bokeh/focus pass now follows the gaze ray and classifies tile, surface, and far-fallback targets. A tight
  five-ray neighborhood assists tile focus when the reticule falls into a narrow gap, without selecting an
  occluded tile. Accommodation uses separate near/far damping (about 0.4/0.65 seconds), and the blur envelope
  models a 17 mm eye with a 1 arcminute central acuity threshold instead of a fixed cinematic lens. A virtual
  2.5–6.5 mm pupil adapts slowly to the estimated room luminance, changing the hyperfocal distance and blur
  ceiling; ordinary focus stays restrained while close tile focus remains visible. Debug metrics expose focus
  distance, target kind, pupil diameter, and blur intensity, and the debug menu now includes a 0–25× DoF-strength
  slider for visual comparison, with defaults of 12.5× outside zoom and 25× during explicit ADS; higher values remain
  available for stronger cinematic bokeh experiments. The practical distance envelope now uses a smooth eased curve
  calibrated from the focus lab for telemetry. The physical eye-CoC shader experiment is checkpointed separately and
  currently disabled after visual review; the active post-process uses the stock normalized depth response while the
  blur scale and depth-buffer mapping are reassessed.
  The original physical-glass transmission/opacity
  values are restored as well. GTAO remains available as a separately toggled reduced-resolution pass.
- `?debug=1` now exposes adaptive/high/medium/low quality selection plus live Bokeh, GTAO, glass mode,
  ambient animation, weight-shift, and head-bob controls. Selecting a quality mode applies its complete
  runtime defaults (including DPR, shadows, post effects, skyline LOD, and glass); individual controls can
  then be tuned independently on a stronger desktop or phone without a page reload.
- The debug panel now has an accessible disclosure toggle. It starts collapsed on coarse-pointer devices
  so the mobile scene remains usable, while desktop visual tuning remains expanded by default; all controls
  remain available through the keyboard/touch toggle and the panel stays scrollable when expanded.
- The development map now has three authored, non-overlapping ground-level play areas. The penthouse, looking-focus
  room, and climbing gym each occupy a clearly marked 50 m x 50 m square, with 10 m of open ground between them.
  Streamed buildings, props, windows, bridges, and beacons are excluded from every square, while the existing
  penthouse/table collision set remains at the origin. The focus room is a ground-level hallway at the east pad,
  and the Mirror's Edge-style climbing gym is centered on the west pad for repeatable edge-grab tuning.
- The `Focus calibration` preset still starts first-person movement at the beginning of the hallway, but its former
  elevated deck and ramp are disabled so the whole room uses the shared ground plane. The `Climbing gym` preset
  now spawns into a fuller obstacle course at the dedicated west play area, and area HUD text now reports `Penthouse`,
  `Looking focus room`, or `Climbing gym` while the player crosses the three squares.
- Tile body, face-plane, and material resources are cached by size/tile identity, including concealed
  `InstancedMesh` resources. Shader readiness uses a cancellable timer and first-render fallback; it does not
  force a synchronous compile that can block software WebGL or leave Three.js' `compileAsync` polling a removed
  React StrictMode scene.
- The cyan gateway now opens a deterministic streamed city. A chunk is seeded from the room seed and integer
  chunk coordinates, so buildings, windows, skybridges, props, beacons, and zone palette are reproducible while
  the first 3×3 lookahead window can render scenery behind the penthouse glazing. Boundary chunks clip their shared
  ground and paths around the penthouse footprint, and reject buildings, windows, bridges, props, and beacons that
  would enter the room. Movement appends newly encountered chunks and never unloads or regenerates a prior
  coordinate. Shared base geometry/materials and `InstancedMesh` batching keep resident memory bounded by the
  explicit world limits. HUD/debug state exposes South courtyard, West tea garden, East practice court, and North
  skybridge transitions plus the loaded-chunk count.
- The first-person seat loop no longer lets disabled OrbitControls overwrite a restored seat transform while
  waiting for pointer lock; this preserves a development HMR/session snapshot placed just outside the room and
  allows the streaming boundary to be resumed reliably.
- The development scene now captures a versioned, room-seeded session snapshot of the camera transform,
  view, crouch state, and debug orbit target. It throttles writes during rendering and flushes on
  visibility/page-hide and scene disposal, so the existing Vite HMR remount restores the same spot
  without persisting authoritative game state or hidden tile identities. Malformed, stale, below-floor,
  or out-of-bounds storage is ignored, and a live unrecoverable camera/Rapier position resets to the seat
  spawn and immediately persists that safe snapshot. Focused round-trip/rejection tests cover the storage
  contract. The visual debug menu separately persists its validated v1 scene preferences in `localStorage`,
  including skyline/building visibility, quality, lighting, post effects, motion, and camera controls. Its
  expanded/collapsed disclosure state is persisted separately in the same storage so HMR and page reloads keep
  the chosen layout; the `Reset debug defaults` action applies and stores the device-appropriate scene defaults
  in one step.
- The visual debug panel keeps the artifact payload dirty only after an explicit debug-control change and
  sends one `keepalive` request on `pagehide`, adding `savedAt` at that point. The 500 ms telemetry refresh
  never writes the artifact, and the Vite middleware still ignores unchanged scene payloads to prevent
  redundant HMR-triggering writes.
- `three@0.185.1`, matching `@types/three@0.185.3`, and Apache-2.0 `@dimforge/rapier3d-compat@0.19.3`
  are the browser packages used by this lane. Online research checked the official Three.js ecosystem and
  CC0 texture sources; this prototype uses no external asset files so licensing can be reviewed before adding
  a production asset pack.
- `pnpm build`, `pnpm smoke`, `pnpm format:check`, `pnpm lint`, and `pnpm typecheck` pass.
- Headed Chromium reached `data-scene-ready="true"` and `data-physics-ready="true"` at 1440×900. A
  touch-capable smoke walked through South courtyard, East practice court, and North skybridge while the debug
  HUD stayed at 9 loaded chunks. The connected in-app browser's local-page policy was unavailable during this
  run, and headless Chromium can stall on software WebGL/GPU readback; no browser security control was bypassed.
- The generated penthouse now consumes the checked-in `apps/web/src/scene/maps/penthouse.json` map asset.
  The document is versioned and validated at scene creation, with exact metre positions, Y rotations, and
  scales for named planter/divider/wall-panel/light-bar/sculpture entities. Editing that file is the direct
  level-authoring workflow; Vite HMR remounts the scene and the renderer reconciles the edited entity list.
- The scene material pass now creates a reusable linear detail texture and routes it through the shared
  material factory as roughness and bump data. Penthouse floors, the focus ramp, and generated room floors
  use a high-clearcoat wet epoxy response; neutral architecture, tiles, furniture, skyline masses, and
  streamed-city materials inherit the same restrained micro-relief by default, while red/cyan accents retain
  clean emissive surfaces for Mirror's Edge-style wayfinding.
- The visible sun reference now uses fog-free, un-tonemapped basic materials so the warm disk remains readable
  through the hazy north glazing. Its mirrored elevation is lowered into the seat camera's sky band so the
  complete disk stays visible instead of clipping at the viewport edge.
- The root `dev` task now starts the Fastify and Vite processes directly instead of rebuilding all nine
  workspace packages serially on every startup. The browser's Vite aliases consume package sources in
  development, and the production `pnpm build` path still performs the full package build.
- Added the `pnpm hmr` development command for the visual-table agent loop. Vite no longer broadcasts
  watcher-driven HMR updates; the command writes an ignored worktree-local request marker and touches the
  scene module to permit one explicit scene HMR. When other source modules changed in the batch, the same
  explicit trigger sends a full browser reload so all edited modules are fetched. The existing session
  snapshot then restores the browser presentation state. An optional quoted CLI note is carried through the
  one-shot marker and emitted as a custom HMR payload (with no separate note file); session storage only bridges
  the note across a full browser reload. The marker is consumed only by the Vite watcher with an active HMR
  client, preventing a second disconnected preview in the same worktree from stealing the request.

## 2026-08-06 — Manual HMR routing repair

- Reproduced the failed iron-sight HMR request with two Vite processes watching this worktree. The shared request
  marker could be consumed by the disconnected preview on another port, leaving the connected 5173 browser without
  the custom test note or scene update.
- The Vite watcher now leaves the marker untouched until it has an active WebSocket client. The stale 5173 lane was
  restarted so it loaded the current routing code; the existing Brave tab then received `Test the iron sight redesign.`
  and reported `[vite] hot updated: /src/scene/mahjong-table.ts`.

## 2026-08-06 — Reticule-anchored crouch zoom

- Seat FOV changes now apply a normalized Three.js off-axis projection derived from the lower reticule
  position (`y = 0.6`). The smooth 90° standing to 45° crouched transition therefore keeps the
  reticule's world point fixed instead of pivoting around the viewport center.
- Added focused projection tests for the zero standing offset, the crouched offset, and preservation
  of the reticule ray's screen coordinate.

## 2026-08-05 — Movement simulation wall hang and climb

- `resolveWallHangTarget` now normalizes the horizontal approach, requires an airborne near-top catch
  window (above ordinary ledges and no more than 0.6 m above the capsule top), selects the approached
  near face, rejects behind/lateral/out-of-reach boxes, and returns the closest valid target offset by
  the capsule radius plus separation. `resolveWallHangTargetDetails` keeps the face normal and wall-top
  metadata for the simulator.
- The movement CLI now uses explicit `none`, `wall-hanging`, and `wall-climbing` traversal states. A hang
  suppresses gravity and ordinary movement until forward/jump input starts a staged climb; the capsule rises
  clear of the wall before moving onto a validated top target, and grounded is set only after support is found.
- `wallHang` is a frame-local transition event. JSON samples also expose `hanging`, `climbing`, and
  `traversalState`; diagnostics do not contaminate JSON stdout. The wall-hang scenario reaches the wall,
  emits one transition event, and continues climbing without the old one-frame grounded flip.
- Focused wall geometry coverage now includes near-face offset, short/floating walls, lateral and reach
  rejection, behind-player rejection, closest-wall selection, cardinal axes, and diagonal approach.
- `scripts/movement-scenarios/wall-hang-hold-test.json` separately proves that a jump-induced, no-input hold
  remains attached with zero vertical velocity before a later forward input starts climbing; its extended climb
  reaches a grounded, collision-free top position before the held input eventually carries the player off the wall.
- `scripts/movement-scenarios/wall-hang-ground-reject-test.json` proves that a ground-level collision with a
  reachable-height wall emits no wall-hang event and remains grounded.
- The Rapier initialization warning remains a dependency diagnostic on stderr; redirected simulator stdout
  parses as valid JSON. Full repository typecheck still reports unrelated pre-existing visual-table
  diagnostics and is recorded as incomplete until that dirty lane is repaired.
- The live browser controller now uses the same airborne near-top wall geometry after ledge handling. A valid
  jump collision, including a near-apex upward contact, enters a persistent face-attached state, suppresses gravity,
  releases on backward input, and starts a two-phase lift/cross transition on forward or jump input after a short
  visible settle beat. Wall entry is explicitly airborne-only, so a ground-level collision remains an ordinary
  collision even when the wall top is within the hand-height window. The final position is passed
  back through Rapier for support; the browser footer documents the `Climbing gym` debug route and controls. The gym
  starts on clear ground facing a dedicated training wall, and detection probes Rapier's corrected contact first,
  then the safe pre-collision capsule position for a swept horizontal step.
- The traversal priority now keeps the refined ledge path collision-gated, gives low vaults the same short forward
  landing bias as ledge climbs, and lets the vault probe run on the first upward jump-edge frame as well as during
  descent. Wall entry is airborne-only, may begin during a near-apex upward contact, and uses either a real
  airborne collision or resolved horizontal blockage as the contact proof, avoiding false negatives
  when a controller reports the blocked move without a stable collision count. Thin upper platforms can be caught
  while the capsule is still inside their face slab; the target is always snapped back outside the near face.
- The airborne-platform scenario covers a jump that contacts a high, thin platform through its underside and then
  climbs onto the top. The five-metre rejection scenario confirms that a normal jump cannot start a vertical wall
  climb from the base.

## Next action

Add focused Milestone 5 regressions for deletion, snapshot recovery, export/schema migration, hash
tampering, and migration-ledger continuity; make the smallest repository fixes; then prove an exact
restart/resume path before beginning dependent CLI/server integration.

## Visual penthouse expansion checkpoint

- The penthouse now fills the 50 m x 50 m authored play area with a 5 m interior ceiling and a continuous north floor-to-ceiling glazing wall.
- The mahjong table remains centered on an enlarged presentation inset while fixed furniture is distributed sparsely around the perimeter.
- The authored penthouse map uses a 48 m x 48 m interior floor and five deliberate accent entities; procedural room props are reduced to a low-density fallback.
- Penthouse exploration clipping follows the expanded shell footprint, keeping streamed city geometry outside the room.

## 2026-08-06 — Player health and rechargeable shields

- Added the pure `apps/web/src/scene/player-vitals.ts` model. Damage is absorbed by a 100-point shield
  before health, overflow reaches the 100-point health pool, and health does not regenerate during play.
- Shields begin refilling at 35 points per second after 3.5 seconds without damage. The model clamps
  capacities, reports shield breaks/death, ignores invalid damage, and has focused deterministic tests.
- Wired the model into the visual-table scene. Above-sprint-speed wall impacts and hard landings can deal damage;
  the mount exposes `applyDamage`, `getVitals`, and `resetVitals` for controlled debug/runtime use.
- Impact damage now uses collision delta-v: requested horizontal velocity minus the physics-resolved velocity
  at a wall, capped at the velocity carried into contact. Sprint speed (10.2 m/s, about 36.7 km/h) and below
  is harmless. Damage follows a kinetic-energy-shaped km/h curve and reaches the full 200 damage at the
  approximate 200 km/h human terminal velocity; the same curve is used for vertical landing delta-v.
- The scene publishes health/shield state through typed React callbacks and `data-player-health`/
  `data-player-shield` attributes. The browser HUD now shows both bars and the shield recharge status.
- Focused validation passed: the vitals, impact, and existing visual scene tests (45 tests total), plus the
  production web build. Full typecheck remains incomplete because this
  worktree already contains unrelated, unintegrated weapon/traversal diagnostics; those changes were preserved.

## 2026-08-06 — Centralized first-person camera motion damper

- Added `apps/web/src/scene/camera-motion.ts` as the single first-person presentation damper. Lateral weight
  shift, gait bob, jump lift, and landing dip now produce one shared camera offset, and the reticule reads that
  same output for aim feedback.
- Landing response uses the instantaneous downward velocity and the support-stop acceleration. A normal jump and
  a larger fall therefore produce different spring impulses; a harder stop at the same velocity also dips further.
  The response is bounded for readability and resets with the scene motion state.
- The scene keeps Rapier/fallback physics authoritative for the player position. `applyFirstPersonCameraMotion`
  applies the presentation offset once after physics resolves the base camera pose.
- Focused validation passed: `pnpm exec vitest run apps/web/src/scene/camera-motion.test.ts`
  and the combined visual scene tests (38 tests). Full typecheck remains blocked by the pre-existing dirty-lane
  diagnostics recorded above.

## 2026-08-06 — Oxygen vital and exertion breathing

- Extended the pure player-vitals model with exact Breath / O₂ Reserve rates: idle +12/s, walking +8/s,
  crouched stationary +10/s, sprinting -3.33/s, crouch walking -1.67/s, jump -5, and stand from crouch
  -5. Sprint, crouch-walk, and jump recovery delays are stateful and frame-accurate. Focused tests cover
  all rates, delays, twenty-jump depletion, capacity clamping, and post-exhaustion recovery.
- Added pure hold-breath state transitions. Right mouse requests ADS plus hold breath in the scene; the
  model drains -15/s, auto-stops at zero, and prevents reactivation until O₂ is above 25.
- Added `apps/web/src/scene/o2-stability.ts`, a smooth reserve-to-presentation curve shared by camera
  reticle sway and weapon viewmodel calculations. No reserve-percentage accuracy or sway thresholds
  are used; explicit hold-breath and free wall-brace states are the full-stabilisation modes. The HUD reports active
  hold-breath and rearm status, while `data-player-o2` remains the numeric reserve.
- Hold-breath presentation now removes reticle and weapon sway, and pauses the stationary breathing bob
  while O₂ remains above zero; the normal reserve-driven motion returns as soon as the hold ends or O₂ is
  depleted.
- Focused validation passed: `pnpm exec vitest run apps/web/src/scene/player-vitals.test.ts apps/web/src/scene/camera-motion.test.ts apps/web/src/scene/o2-stability.test.ts apps/web/src/scene/reticle-aim.test.ts apps/web/src/scene/weapons.test.ts` (50 tests), strict
  `pnpm exec tsc --noEmit --pretty false`, the web production build, Prettier, and focused ESLint. The broader
  scene directory is 99/100 because of an unrelated pre-existing wall-hang fixture failure; browser acceptance
  remains intentionally unverified because the repository forbids opening another session for this lane.

## 2026-08-06 — Left Command hold-breath binding

- Bound the physical left Command key (`MetaLeft`) to the same shared ADS/hold-breath state as right mouse.
- While left Command is held, the scene prevents default keyboard shortcuts for every delivered key event so
  `Command+W` continues to move in-game instead of closing the tab. Right Command remains unbound.
- Added pure left-Command detection/capture helpers and regression coverage. Browser acceptance remains unverified
  because this worktree does not open another game session; browsers that reserve a shortcut before dispatch may
  still require a full-screen/app window.

## 2026-08-06 — Right mouse no longer holds breath

- Kept right mouse as ADS-only and made left Command the sole desktop hold-breath binding.
- Added a pure input-resolution regression test proving right mouse aims without setting `holdingBreath`.
- Documented that a normal browser page cannot guarantee suppression of browser-reserved `Command+W`; use an app/window
  shell or a browser extension if tab-close protection is required.

## 2026-08-06 — O₂ action affordability and neutral jog

- Restored atomic O₂ affordability for discrete actions. Jumps and standing from crouch require their full
  5-point cost; an insufficient reserve leaves the action and state unchanged, while crouching remains free.
- Sprinting now checks the drain for the current frame. When that slice cannot be paid, desktop, touch, and
  traversal movement fall back to a derived neutral jog instead of sprinting or stopping. The neutral blend is
  `walkingRecovery / (walkingRecovery + sprintDrain) = 70.6%` between walk and sprint, about 80.4% of full sprint
  speed, so the locomotion O₂ delta is zero at the configured +8/s walk and -3.33/s sprint rates.
- Hold-breath activation requires one affordable 1/60-second drain slice. It still drains at 15 points per second,
  auto-stops at zero, and remains locked until the reserve recovers above 25 points.

## 2026-08-06 — Procedural weapons prototype

- Added typed pistol, shotgun, machine gun, and sniper definitions with distinct damage, pellet count,
  inherent pellet-cone, magazine, reload, and range profiles. The scene uses a seeded RNG for both pickup placement
  and shot presentation. Only the shotgun consumes shot RNG for its inherent pellet cone; ordinary-gun
  aim stays on the shared live reticule ray.
- Added a table-side pickup set (starter pistol plus one of each other weapon) and preserved the existing seeded
  outdoor count semantics: three outdoor pistol pickups and two outdoor pickups for each other type by default.
  Outdoor spawns avoid the authored play-area rectangles and coarse static obstacles, and each pickup has an
  emissive model, pad, ring, and label.
- Added first-person weapon models, a procedural right forearm/palm/thumb view model, pickup/equip
  interaction, number-key/Q switching, E interaction, R reload, mouse fire, mobile Fire/Equip/Reload
  actions, deterministic tracer/impact effects, recoil, and a React weapon HUD. Shot raycasts exclude the
  streamed city hot path and fail closed to a tracer miss if a render subtree is malformed. Hits record
  typed `lastWeaponHit` metadata on the struck render object; enemy health and authoritative combat are
  intentionally outside this visual prototype slice.
- Held weapon visibility now follows the active seat view independently from pointer-lock firing input, so
  an equipped model remains rendered in the camera's right hand while the player is entering first-person mode.
- The scene graph now includes the camera, allowing Three.js to traverse and render those camera-attached
  first-person view-model meshes.
- Reticule presentation is now resolved once into both the CSS bob offset and live camera NDC. The held weapon
  sits lower on Y and rotates its forward axis toward that moving reticule dot each frame, so visible sway and
  firing use the same aim direction.
- Focused validation passed: the scene Vitest suite (68 tests), `pnpm typecheck`, weapon-file ESLint,
  `pnpm --filter @hk-mahjong/web build`, `git diff --check`, and one explicit `pnpm hmr` scene remount
  request while the local Vite server was running. Full-repository ESLint remains blocked by shared
  dirty-lane violations, mostly from concurrent scene/vitals/camera work. Browser combat interaction remains unverified; no new
  browser session was opened for this run.

## 2026-08-06 — Snappy generic reload presentation

- Added the shared `resolveWeaponReloadPose` timing helper in `apps/web/src/scene/weapons.ts`. Every weapon now
  snaps its muzzle toward the sky, holds a short clip-change beat with a small side/roll nudge, and snaps back
  to the reticule. The normalized pose uses each weapon's configured reload duration.
- The scene composes the reload pose after the live reticule aim quaternion, so firing direction remains
  reticule-authoritative while the held model performs the presentation animation.
- Focused validation passed: `pnpm exec vitest run apps/web/src/scene/weapons.test.ts` (6 tests),
  `pnpm exec tsc --noEmit --pretty false`, the production web build, Prettier checks, and weapon-file ESLint.
  An explicit `pnpm hmr` request was sent to the running Vite lane with the reload test note. The broader scene
  ESLint command still reports pre-existing dirty-lane violations; browser combat interaction remains unverified
  and no new browser session was opened.

## 2026-08-06 — Crouched iron-sight viewmodel posture

- Extended the centralized first-person camera damper with a smoothed viewmodel pose. Standing keeps the
  weapon in the right-hand hip-fire position; crouching blends it onto the optical axis, raises it by 0.20 m,
  and moves it slightly closer so the view reads like iron-sight aiming.
- The camera-attached weapon runtime consumes that composed pose while preserving the existing shared reticule
  aim ray, camera roll, bob, weight response, recoil, and reload presentation.
- Focused validation passed: `pnpm exec vitest run apps/web/src/scene/camera-motion.test.ts`
  (11 tests), `git diff --check`, and the strict web typecheck/build gates after the patch.

## 2026-08-06 — Clear crouched weapon sight channel

- Flattened the held receivers and removed the pistol's full-width rear orange cap, replacing it with a narrow
  side plate. The machine gun's orange top rail is now a side detail, so neither decorative mass crosses the
  centered crouched sight line.
- Reworked every weapon's procedural iron-sight profile with shorter posts, lower rear ears, and split side rails.
  The rear notch remains readable while the central sight channel stays open across all four weapons.
- Added profile regressions for the separated notch and low sight hardware. Focused weapon tests (10) and the
  production web build pass, with Prettier and `git diff --check` clean. The broader scene suite remains blocked
  by unrelated dirty-lane O₂/vitals test and typecheck failures. Browser visual confirmation remains dependent on
  the existing connected Vite scene; an explicit `pnpm hmr` request was sent with the machine-gun/pistol sight
  note, and no new browser session was opened.

## 2026-08-06 — Explicit iron-sight weapon geometry

- Added weapon-specific sight profiles for the pistol, shotgun, machine gun, and sniper. Each profile places a
  low top rail, an open two-ear rear notch, a forward sight post, and a small weapon-color front bead along the
  model's local barrel axis.
- The sights are part of the existing camera-attached model, so crouched zoom uses the same reticule-authoritative
  orientation and shared camera damper output as hip fire, recoil, and reloads. Pickup models receive the same
  readable sight silhouette at their smaller scale.
- Focused validation passed: `pnpm exec vitest run apps/web/src/scene/weapons.test.ts` (7 tests), the full scene
  test directory (74 tests), strict typecheck, web production build, weapon-file ESLint, Prettier, and an explicit
  HMR request with the zoomed sight-picture test note. Browser rendering remains unverified because this worktree
  forbids opening another browser session.

## 2026-08-06 — Damage-scaled reticle-following recoil

- Added a damage-normalized shot impulse to the centralized camera damper. A shot follows the signed yaw/pitch vector
  from the resting centre dot to the current visible reticle displacement, so movement, breathing, and low-O2 sway
  are temporarily exaggerated instead of replaced; a centred dot contributes no direction and there is no fixed
  upward kick.
- The same damper output now drives the camera's local view kick, the reticle CSS/NDC aim position, and the
  camera-attached weapon. The held weapon's local slide uses the same per-projectile damage value, including the
  shotgun's individual pellet damage, rather than a sniper-only exception.
- Focused validation passed: 34 recoil/weapon/reticle Vitest tests, strict TypeScript, Prettier, the production web
  build, and an explicit `pnpm hmr "Check shared camera recoil following an off-center reticle"` request. The
  broader scene suite reached 100/101 tests; its remaining swept wall-hang failure is in the pre-existing dirty
  traversal lane. The scene ESLint command still reports dirty-lane diagnostics in `mahjong-table.ts`; browser
  firing interaction remains unverified and no new browser session was opened.

## 2026-08-06 — Reticle-ring-scaled outward recoil

- Replaced the fixed upward camera kick with a normalized vector from the reticle's resting centre dot to its live
  position at the instant of firing. The shared damper now nudges camera, reticle aim, and camera-child weapon away
  from that rest point in any direction; an exactly centred dot produces no directional kick.
- Mapped the outer reticule ring's 27.6 CSS-pixel radius to 100 damage and set the base reference sniper impulse to
  125% of that radius. The shared shot-jerk tuning is now 2×, making the effective sniper kick 250% of the ring;
  pistol, shotgun, and machine-gun impulses use the same outward-distance algorithm scaled by their per-projectile
  damage, while shotgun recoil remains one 16-damage impulse per trigger pull.
- Focused camera-motion assertions passed in the latest server-owned bus snapshot, along with strict typecheck,
  targeted ESLint, Prettier, production web build, and `git diff --check`. The latest full bus snapshot passed all
  403 assertions; no new browser session was opened.
- Added a 60 ms outward phase followed by a 1.5× shared return-velocity impulse for every damage-scaled shot. The
  presentation stack now crosses back through the reticule rest point before the next machine-gun shot and overshoots
  to the opposite side instead of hiding the outward jerk in same-frame recovery; this remains a common damper response,
  not a weapon-specific rule.
- Doubled the shared outward shot impulse for all weapons through `CAMERA_RECOIL_SHOT_MULTIPLIER = 2`; the existing
  proportional return velocity scales with the same impulse instead of introducing a weapon-specific recovery path.

## 2026-08-06 — Table-side weapon staging

- Staged one deterministic pickup for each of the pistol, shotgun, machine gun, and sniper beside the penthouse
  mahjong table. The starter pistol remains closest to the south-seat spawn, with the other three types arranged
  around the opposite table corners.
- Preserved the existing seeded outdoor pickup counts and obstacle/reserved-area filtering. The intentional
  table-side set is marked with `nearTable` so tests and scene diagnostics can distinguish it from outdoor spawns.

## 2026-08-06 — Sniper scope magnification shader

- Added `apps/web/src/scene/sniper-scope.ts`, a post-processing lens shader that samples the rendered scene texture
  inside the projected sniper glass and magnifies the source image by 5× with a feathered circular edge, subtle
  chromatic separation, and fine cyan scope marks.
- Added a real camera-child scope tube, rings, glass disk, and projection anchor to the held sniper model. The lens
  pass follows that anchor after viewmodel sway, recoil, reload, and reticule-relative aiming are applied; it uses
  a separate render camera only for presentation and never creates a divergent firing ray.
- Kept the scope tube open at both ends and placed the glass just beyond the rear rim; the default cylinder cap had
  rendered as a solid black panel over the lens.
- The effect activates in the first-person seat view whenever the sniper is equipped and the player is crouched;
  right-mouse ADS remains independent from left-Command hold-breath. A clean world-only render target feeds the magnified sample, so
  floating sprites and weapon/UI overlays cannot overpower the underlying scene geometry. Existing Bokeh remains
  before the lens pass and `OutputPass` remains last for tone mapping and colour-space conversion.
- Tuned the sniper optic assembly to its measured local sight-line height (0.11979078 m) so the projected glass centre
  follows the reticle without adding a sniper-only shared viewmodel or camera offset.
- Focused validation passed: the sniper-scope and weapon tests (17 tests), strict typecheck, and `git diff --check`.
  Browser rendering remains unverified because this worktree forbids opening another browser session; the normal
  HMR request should be run only when the existing connected Vite lane is available.
- Expanded pickup range to 3.5 m and added walk-over collection while first-person movement is active. Pressing
  `E` still collects the nearest unclaimed pickup in the same range when the player stops beside it.

## 2026-08-06 — Sprint reticle dot fade

- Published the scene's existing sprint activity flag to the browser shell. While sprinting, the reticle centre
  dot fades to zero opacity; stopping sprinting fades it back in. The outer reticle circle remains visible in both
  states.

## 2026-08-06 — Reload reticle fade

- The centre reticle dot now fades to zero opacity for the duration of the authoritative weapon reload state, then
  fades back in when the reload completes. The outer circle remains visible, and sprinting continues to control
  the same centre dot.

## 2026-08-06 — Caps Lock center-dot visibility

- The browser shell now reads the keyboard's Caps Lock modifier state. The center reticle dot is hidden while Caps
  Lock is off and shown while it is on; the outer reticle circle remains visible in both states.

## 2026-08-06 — Top-row HUD placement

- Moved the scene summary and player vitals overlays to the upper portion of the viewport, reserving the lower-right
  corner for weapon and ammunition status.
- Kept the layout responsive: compact and short landscape viewports stack the summary and vitals above the play
  controls, while weapon status remains anchored at the lower right.

## 2026-08-06 — Bottom weapon and instruction stack

- Anchored the weapon and ammunition panel to the lower-right edge during first-person play.
- When pointer lock is released and the instruction footer is visible, the footer now sits above the weapon panel,
  leaving the gun status directly underneath it without overlap. Touch layouts retain their clearance above the
  mobile action controls.

## 2026-08-06 — Lower-and-raise weapon switch presentation

- Added a discard/equip transition to the shared camera-motion damper. The outgoing held weapon rotates muzzle-down
  and drops below the frame, then the newly selected or picked-up weapon starts below the frame and rotates up into
  the reticle. A pickup with no previous weapon skips the empty lowering phase and starts in the raising phase.
- Weapon switching now keeps the outgoing model visible during the lower phase and the incoming model visible during
  the raise phase. Walking over a pickup and explicit `E`, `Q`, or number-key selection use the same transition.
- Firing and reloading are suspended during the transition so the visible model, active weapon, and HUD do not diverge.
- Focused validation passed for the camera-motion and weapon tests (31 tests), strict TypeScript, Prettier, the web
  production build, and `git diff --check`. The scene browser interaction remains unverified because no new browser
  session was opened for this lane.

## 2026-08-06 — Visible tracers and timed bullet-hole decals

- Extended the seeded shot presentation with a bright tracer round group: a full streak and visible tracer head
  now remain on screen for 140 ms, while the existing impact spark remains a separate short-lived effect.
- A surface hit now creates an oriented dark circular bullet-hole decal with a coloured rim. The decal uses the hit
  triangle normal in world space, is offset slightly from the surface to avoid z-fighting, and participates in the
  normal depth-of-field pass.
- Bullet holes remain for exactly five minutes, fade during the final 12 seconds, then dispose their geometry and
  materials. A 256-hole cap evicts the oldest mark during sustained automatic fire so scene memory remains bounded.
- Focused validation passed: the weapon test file (12 tests), web production build, weapon-file ESLint, Prettier,
  strict typecheck, and `git diff --check`. The combined scene run still has an unrelated wall-hang expectation
  failure. An explicit `pnpm hmr "Check visible tracer rounds and five-minute fading bullet holes"` request was
  issued while the existing Vite listener was available; browser firing remains unverified and no new browser
  session was opened.

## 2026-08-06 — Centralized unit-test bus

- Added `apps/server/src/test-bus.ts`, a server-owned scheduler that runs the complete Vitest unit suite on startup
  and checks for source changes every five minutes afterward. An advisory worktree lock prevents concurrent UI server
  processes from launching duplicate full-suite runs, and an in-flight run suppresses overlapping timer ticks.
- Added a content-aware Git gate to the five-minute tick. The bus compares `HEAD`, tracked `git diff HEAD` content,
  and streamed untracked-file content with the last completed pass, skipping Vitest when the repository state is
  unchanged. Git inspection failures fail open to a test run and are retained in the run manifest.
- Each run is stored under ignored `.data/test-bus/runs/<run-id>/`. The Vitest JSON report, stdout, stderr, run
  manifest, and one atomic JSON file per assertion are retained. Filenames contain a normalized source/test name and
  a short SHA-256 suffix; the manifest provides exact paths for collision-free agent readback.
- Updated `AGENTS.md` with the bus contract, stale-snapshot boundary, and guidance to use focused tests instead of
  overlapping full-suite commands. The bus is limited to unit tests; coverage, simulations, builds, lint, typecheck,
  browser, and HMR validation remain explicit gates.

## 2026-08-06 — Explicit empty-hand weapon slot

- Added the number-row `0` hotkey to holster the active weapon. The runtime clears the active weapon and reload state,
  preserves collected inventory and ammunition, and reuses the shared lower weapon transition without raising a new
  model.
- Added a focused hotkey regression covering `Digit0`, weapon slots 1–4, and invalid number keys.

## 2026-08-06 — Bullet-hole visibility repair

- Corrected decal normals for `THREE.InstancedMesh` hits by composing the hit instance matrix with the shared mesh
  transform. This keeps offsets on the camera-facing side of rotated tile walls instead of placing holes inside them.
- Ignored label sprites during shot raycasts, supplied the shot raycaster's camera, refreshed live scene roots for
  streamed geometry, enlarged the decal, and raised the rim contrast so holes remain readable on both the light
  architectural shell and dark table surfaces. The weapon snapshot now exposes hit and live-hole counts for local
  diagnostics without changing the authoritative game state.
- Focused validation passed: weapon tests (13), strict typecheck, web production build, Prettier, and `git diff --check`.
  The existing Vite lane received `pnpm hmr "Verify raycast diagnostics and surface bullet holes after each shot"`.
  In the already open browser tab, a live shot reported `shotsHit=42` and `bulletHoleCount=42`, and the rendered wall
  visibly showed the dark decals. A final HMR request used `pnpm hmr "Verify visible tracers, surface bullet holes,
and five-minute cleanup state"`; a direct wall shot then reported `shotsHit=11` and `bulletHoleCount=11`, with the
  marks visible in the existing tab. No new browser session was opened.

## 2026-08-06 — Directional movement double-tap sprint

- Double-tap sprint now tracks each WASD and arrow movement key independently instead of treating only W as a
  sprint trigger. A second non-repeating tap within the 300 ms window starts the existing 3× sprint in that
  direction, while the active sprint still transfers across held movement directions and stops when movement ends.
- Updated the first-person control hints and documentation to describe the directional double-tap behavior. Added a
  focused regression for all eight movement keys, cross-key isolation, key-repeat suppression, and the timing bounds.

## 2026-08-06 — Physical near-field eye DoF experiment (checkpointed, disabled)

- Added `resolveHumanEyeCircleOfConfusion()`, a pure thin-lens model using the existing 17 mm eye, adaptive pupil,
  gaze focus distance, and per-object depth. The reciprocal object-distance term makes blur increase nonlinearly as
  geometry approaches the eye; the focus plane resolves to zero circle of confusion.
- Replaced the stock linear Bokeh depth delta with the same physical response in the centralized post-process shader.
  The camera-child weapon remains excluded from gaze-target selection but participates in the normal depth pass, so
  near ironsights can blur while the distant world stays comparatively sharp without an ADS-specific state.
- Added focused regressions for near-depth monotonicity, zero blur on the focus plane, and reduced far-depth defocus.
- The experiment was checkpointed at `534f04b` and then disabled after the existing Vite lane showed excessive whole-world
  blur during zoom on the source branch. The source branch keeps the stock renderer; this isolated rebased branch
  re-enables the physical shader without adding a separate ADS-specific state.
- The existing Vite lane received `pnpm hmr "Experiment: compare physical near-field blur at 0.25m, 0.5m, 2m, and distant focus; keep far world sharp"`.
- Recalibrated the same global shader in the isolated experiment lane: physical CoC now maps through the eye focal
  length, camera FOV, and the existing normalized posture-strength slider. Near viewmodel geometry can therefore blur
  strongly while a distant gaze target stays sharp; no weapon-name or sniper/ADS condition was added.
- Focused format, strict typecheck, and the web production build pass in this lane. Browser/HMR proof is pending because
  the only running Vite/browser lane belongs to the separate dirty checkout.

## 2026-08-06 — Presentation-driven projectile spread

- Removed the seeded projectile cone from the pistol, machine gun, and sniper. Their shots now use the live reticule
  ray exactly; movement, breathing, posture, and prior damage-scaled recoil move the shared first-person presentation
  stack and therefore create the natural aim spread before the next shot.
- Kept an inherent seeded pellet cone only for the shotgun. Its radius is a fixed weapon property and is independent
  of O₂ or hold-breath state; those presentation effects move the cone's reticule-centered origin instead.
- Added a weapon regression covering the zero-cone ordinary guns and fixed positive shotgun cone. The runtime also
  avoids consuming shot RNG when a weapon has no inherent spread.

## 2026-08-06 — Explicit ADS toggle and intermediate crouch posture

- Right mouse now toggles persistent aim-down-sights state on each secondary-button press; releasing the button no
  longer exits ADS. Left Command remains the hold-breath/aim binding.
- Crouching no longer changes the seat FOV or activates the sniper optic. It keeps the lower eye height but uses an
  intermediate camera-damper weapon pose between standing hip fire and full ADS. Explicit ADS owns the smooth 90° →
  45° reticule-anchored zoom and restores the original crouched sight pose exactly (`x: 0, y: -0.22, z: -0.54`) so
  ironsights and the sniper optic stay aligned.
- A directional movement double-tap clears the persistent right-mouse ADS toggle before sprinting. Focused camera-motion
  and sniper-scope regressions cover the new separation; browser interaction remains tied to the existing connected Vite
  tab and no additional browser session was opened.

## 2026-08-06 — Supersampled sniper scope world feed

- Replaced the scope's stretched player-viewport crop with a hidden secondary `PerspectiveCamera`. It copies the
  presentation camera pose, aims through the live reticule ray, and uses a tangent-scaled 5× tighter FOV.
- The scope render target is square, sized to the projected glass at 2× supersampling (256–2048 px), so the extra
  render only covers the optic instead of duplicating the full viewport. The fragment shader reconstructs that feed
  with Catmull–Rom bicubic sampling and a guarded lens-only branch.
- The clean world pass now keeps the weapon bullet-hole root and decals while excluding weapon/UI visuals and sprites.
  Scope marks are diagonal cyan X lines rather than horizontal/vertical plus marks.
- Focused validation in this lane: strict `pnpm typecheck` passed; the centralized test bus and existing browser lane
  still need to publish/read evidence for the changed shader/runtime state.

## 2026-08-06 — Free wall-braced aim stabilisation

- Added a capsule-side contact probe over the active physics boxes. It accepts the controller's small separation
  margin, handles yaw-rotated boxes, and excludes floor/platform-only contact and sloped ramps.
- Wall contact now feeds a separate shared presentation signal. While aiming down sights, the centralized camera
  damper and camera-attached weapon use the same sway and breathing suppression as hold-breath, including at empty
  O₂, without setting the paid holdingBreath state or spending reserve.
- Published data-player-wall-contact and data-player-wall-braced for local diagnostics. Added focused contact,
  O₂ stability, and camera regressions; full bus/type/lint/build evidence remains pending for this dirty state.

## 2026-08-06 — Black procedural gun finish

- Applied one shared near-black material to every procedural pistol, shotgun, machine-gun, and sniper body, barrel,
  sight, accent, and camera-held or pickup model. Colored pickup pads, labels, muzzle flashes, tracers, and impact
  effects remain as interaction feedback rather than part of the gun finish.

## 2026-08-06 — Jump exits crouch

- A successful first-person jump now automatically returns the player to standing. The transition is applied only
  after the existing atomic jump O₂ check succeeds, so a rejected jump preserves the crouched posture and reserve.
- The mount returns its current crouch state after a jump, keeping the mobile Crouch button synchronized with the
  scene controller. Added a focused posture regression for accepted and rejected jumps.

## 2026-08-06 — Zoom-only DoF intensity

- Kept the default DoF multiplier at 12.5× while standing or crouching. Explicit zoom, including iron sights and the
  sniper scope, now switches the shared Bokeh aperture/maxblur multiplier to 25× through the existing ADS state.
- Added regressions proving that posture alone never raises the multiplier and that both postures use 25× while zoomed.

## 2026-08-06 — Weapon-agnostic recoil recovery

- Replaced the fire-rate-sensitive recovery phase with one shared under-damped second-order response in
  `apps/web/src/scene/camera-motion.ts`. A shot adds only its damage-scaled directional displacement; the central
  spring pulls every impulse through the reticule rest point and naturally overshoots to the opposite side.
- The camera damper does not receive weapon type, fire interval, magazine, or cadence metadata. A fast weapon submits
  impulses while the response is still moving, so they accumulate and produce spread; a slow weapon lets the same
  response settle. Future weapons use the same event contract without a new recovery branch.
- Updated camera-motion regressions to cover under-damped overshoot for low, medium, and reference shot strengths and
  the machine-gun cadence crossing the rest point. The server-owned bus passed 405/405 assertions on the integrated
  commit, including these recoil checks. Strict typecheck, targeted ESLint, the production web build, targeted
  Prettier, `git diff --check`, and the existing-lane HMR request also passed; no new browser session was opened.
- The repository-wide format gate still reports the pre-existing `artifacts/visual/visual-debug-state.json` mismatch,
  and full ESLint remains blocked by unrelated dirty-lane diagnostics outside the recoil module.
