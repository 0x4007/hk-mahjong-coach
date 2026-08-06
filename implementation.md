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
  strips, floor inlays, tiles, and skyline detail stay out of the blocking set. If a browser cannot load the inlined
  WASM, a coarse AABB runtime now feeds the same ledge/vault/wall traversal state machine instead of falling back to
  unconstrained movement.
- Parkour-feel movement now includes a ledge-climb assist in first-person: when airborne and moving toward a top edge,
  the kinematic capsule animates onto nearby walkable surfaces in a small vertical window, emulating a short Mirror's
  Edge-inspired climb rather than snapping instantly.
- Tall-wall traversal is separate from the ledge path. A real side collision with a wall whose top clears the capsule
  head can attach the capsule just outside the approached face; gravity and ordinary movement are suppressed while
  hanging, and forward or Space starts a two-phase lift-and-cross transition. The resolver also considers streamed
  static obstacle boxes, while knocked dynamic props remain ineligible. The climbing-gym preset starts close enough to
  the dedicated wall for a normal walk to reach it without a sprint double-tap.
- The Bokeh/focus pass now follows the gaze ray and classifies tile, surface, and far-fallback targets. A tight
  five-ray neighborhood assists tile focus when the reticule falls into a narrow gap, without selecting an
  occluded tile. Accommodation uses separate near/far damping (about 0.4/0.65 seconds), and the blur envelope
  models a 17 mm eye with a 1 arcminute central acuity threshold instead of a fixed cinematic lens. A virtual
  2.5–6.5 mm pupil adapts slowly to the estimated room luminance, changing the hyperfocal distance and blur
  ceiling; ordinary focus stays restrained while close tile focus remains visible. Debug metrics expose focus
  distance, target kind, pupil diameter, and blur intensity, and the debug menu now includes a 0–25× DoF-strength
  slider for visual comparison, with posture defaults of 12.5× standing and 25× crouching; higher values remain
  available for stronger cinematic bokeh experiments. The practical distance envelope now uses a smooth eased curve
  calibrated from the focus lab: at the reference pupil, near-zero focus is full strength, 2.5 m is roughly one
  quarter, and 6 m is effectively sharp; dilation scales the cutoff in low light.
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
- Added the `pnpm hmr` development command for the visual-table agent loop. It updates the tracked scene
  module timestamp, which gives Vite one explicit scene HMR boundary after a multi-file feature edit;
  the existing session snapshot then restores the browser presentation state on remount.

## 2026-08-06 — Reticule-anchored crouch zoom

- Seat FOV changes now apply a normalized Three.js off-axis projection derived from the lower reticule
  position (`y = 0.6`). The smooth 90° standing to 45° crouched transition therefore keeps the
  reticule's world point fixed instead of pivoting around the viewport center.
- Added focused projection tests for the zero standing offset, the crouched offset, and preservation
  of the reticule ray's screen coordinate.

## 2026-08-05 — Movement simulation wall hang and climb

- `resolveWallHangTarget` now normalizes the horizontal approach, checks relative wall height and vertical
  overlap, selects the approached near face, rejects behind/lateral/out-of-reach boxes, and returns the
  closest valid target offset by the capsule radius plus separation. `resolveWallHangTargetDetails` keeps
  the face normal and wall-top metadata for the simulator.
- The movement CLI now uses explicit `none`, `wall-hanging`, and `wall-climbing` traversal states. A hang
  suppresses gravity and ordinary movement until forward/jump input starts a staged climb; the capsule rises
  clear of the wall before moving onto a validated top target, and grounded is set only after support is found.
- `wallHang` is a frame-local transition event. JSON samples also expose `hanging`, `climbing`, and
  `traversalState`; diagnostics do not contaminate JSON stdout. The wall-hang scenario reaches the wall,
  emits one transition event, and continues climbing without the old one-frame grounded flip.
- Focused wall geometry coverage now includes near-face offset, short/floating walls, lateral and reach
  rejection, behind-player rejection, closest-wall selection, cardinal axes, and diagonal approach.
- `scripts/movement-scenarios/wall-hang-hold-test.json` separately proves that a no-input hold remains attached
  with zero vertical velocity before a later forward input starts climbing; its extended climb reaches a grounded,
  collision-free top position before the held input eventually carries the player off the wall.
- The Rapier initialization warning remains a dependency diagnostic on stderr; redirected simulator stdout
  parses as valid JSON. Full repository typecheck still reports unrelated pre-existing visual-table
  diagnostics and is recorded as incomplete until that dirty lane is repaired.
- The live browser controller now uses the same wall geometry after ledge handling. A valid tall-wall collision
  enters a persistent face-attached state, suppresses gravity, releases on backward input, and starts a two-phase
  lift/cross transition on forward or jump input after a short visible settle beat. The final position is passed back through Rapier for support;
  the browser footer documents the `Climbing gym` debug route and controls. The gym now starts on clear ground
  facing a dedicated tall training wall, and detection probes the safe pre-collision capsule position so a thin
  Rapier contact cannot be rejected after collision correction.

## Next action

Add focused Milestone 5 regressions for deletion, snapshot recovery, export/schema migration, hash
tampering, and migration-ledger continuity; make the smallest repository fixes; then prove an exact
restart/resume path before beginning dependent CLI/server integration.

## Visual penthouse expansion checkpoint

- The penthouse now fills the 50 m x 50 m authored play area with a 5 m interior ceiling and a continuous north floor-to-ceiling glazing wall.
- The mahjong table remains centered on an enlarged presentation inset while fixed furniture is distributed sparsely around the perimeter.
- The authored penthouse map uses a 48 m x 48 m interior floor and five deliberate accent entities; procedural room props are reduced to a low-density fallback.
- Penthouse exploration clipping follows the expanded shell footprint, keeping streamed city geometry outside the room.
