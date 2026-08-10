# Implementation status

## Canonical state

- Repository: `/Users/nv/repos/0x4007/hk-mahjong-coach`
- Canonical worktree: `/Users/nv/repos/0x4007/hk-mahjong-coach/.codex-worktrees/multiplayer-spec`
- Branch: `multiplayer-spec-g1aba1b1f8d`
- Original reconciliation base: `2f9e37d4930571e8a0cb061ae302379cc5fe15c1`.
- Current rebased HEAD: `12f358d3e67a72944af4701c0c2c52508d28f76d`.
- Implementation lane: this canonical worktree, intentionally dirty with no task commit created.

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
  reticule position. The outer ring follows at 5x and the center dot is tuned to a 5x total displacement.
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
  slider for visual comparison, with defaults of 12.5× outside zoom and 25× during explicit zoom; higher values remain
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

## Multiplayer rooms extension — 2026-08-06

- Added versioned room, seat, ticket, lifecycle, and start-response schemas to the protocol package.
- Added a durable SQLite room store for room metadata, seat claims, hashed bearer tickets, and
  multiplayer action receipts. The store uses the same local database path as game persistence;
  the default path is `.data/coach.sqlite` and tests can inject `:memory:`.
- Added the server-authoritative room service in `apps/server/src/multiplayer.ts`. Room creation,
  joining/reconnect, inspection, bot filling, start idempotency, observation, replay, and action
  submission all resolve the historical ruleset and call the existing core engine and persistence
  repository. No server-side game rules or score calculations were added.
- Added `/api/rooms`, room start/inspection, multiplayer game observation/action/replay routes, and
  `/ws/games/:gameId`. WebSocket delivery validates protocol v1 envelopes, keeps independent
  sequence streams, replays public events, sends redacted observations, rejects binary/oversized/
  malformed/cross-player frames, applies origin and rate limits, and supports reconnect catch-up.
- Added deterministic bot-seat advancement using observation-only bot policies for bot-filled rooms.
- Added durable pending-action records, automated timeout fallback with explicit server provenance,
  and a `pause_on_disconnect` policy that preserves the remaining deadline across reconnects.
- Added a Deno `Deno.serve` HTTP/WebSocket handler seam, an async Deno KV game-journal adapter, and
  at-least-once commit-notification records. The adapter validates event, state, command, ruleset,
  and event-chain hashes, survives a fresh repository handle, and exposes core-marker-only practice
  branch creation.
- Added a browser room panel plus an isolated Playwright two-client test covering redacted
  observations, public action fan-out, and reconnect catch-up. Regression coverage includes altered
  duplicate commands after restart, malformed action frames, independent client/host sequence
  streams, practice-marker restart/replay, bounded Deno origins, and terminal replay envelopes. The
  full suite passes 367 tests, and the browser test
  passes on port 4183 without touching the user-owned port 4173 process.
- Wired authenticated observations into the Three.js mount. The live scene replaces staged hands,
  discards, and melds with the viewer's face-up hand and face-down opponent counts, adds a legal-turn
  ring and revision/wall label, and restores the staged presentation when the room is left. A rendered
  browser check on the isolated 4183 server showed a live room and a legal discard advancing the
  visible revision.

This extension remains experimental. Node/Fastify with SQLite is the complete local room runtime;
the Deno entry point now constructs the async `DenoMultiplayerService` over Deno KV, serves the same
room/game/WebSocket routes, and polls durable commit notifications for at-least-once socket fan-out.
Each commit notification also carries the accepted action identity, so a socket on another Deno
instance can deliver one `action_accepted` envelope to the submitting player without exposing
internal state; local delivery records the same request ID to suppress a duplicate notification.
The Deno hub validates origin and ticket before upgrading a socket, installs its message listener
before the first client frame can arrive, and defers only the join sequence until the native Deno
upgrade is open. It catches up each socket from its own durable revision and clears consumed timeout
state for every socket using the same player ticket. The journal's latest-state cache is gated by the
durable branch revision, state hash, and event-chain hash; it is only a performance hint, and a fresh
process reconstructs from KV before accepting a command. Deno KV snapshots are written while they
fit the 64 KiB value limit; an oversized snapshot is skipped because the event journal remains the
authoritative replay source.
The Deno adapter implements authoritative event/replay persistence and core-marker-only practice
branch creation with a minimal persisted decision-identity check; analysis facts, learner/coach
records, snapshot recovery policy, and full import/export remain outside its async subset. Deployment
hardening and multi-instance abuse controls remain separate from this local experimental slice. The
runtime is started with `deno task serve`, which enables Deno KV and the bounded local origin
allowlist configured by the Deno service.

### Lifecycle and boundary audit follow-up

- Waiting rooms can be closed by their authenticated owner before start. Durable room access applies
  the retention period using the injected service clock; expired rooms become `closed` and reject
  new joins or reconnects. `match_ended` rooms are read-only but an existing seat ticket may still
  reconnect for replay or observation until expiry; neither terminal state accepts starts or actions.
- Owner close uses an atomic waiting-room compare-and-set in both SQLite and Deno KV. A close cannot
  overwrite a concurrently claimed `startRequestId`, so a durable game cannot be created behind a
  `closed` room; the losing operation receives the structured lifecycle conflict.
- Retention expiry uses the same atomic transition for stale `waiting` and `ready` rooms, preserving
  a concurrent start reservation rather than overwriting it with `closed`.
- Room starts reserve the caller's `startRequestId` with a durable compare-and-set before bot filling
  and game creation. Concurrent identical starts therefore converge on one game, while a different
  request receives a structured conflict. Bot-seat creation tolerates the same reservation race.
- The public `ready` state is entered only after that owner reservation and complete four-seat
  assignment. Joining the fourth human seat leaves the room `waiting`, aligned with the multiplayer
  specification. The transition is an atomic compare-and-set in both stores and is a no-op if a
  concurrent identical start has already made the room `active`.
- Action deadlines, reconnect pause/resume, and retention checks use the same authoritative service
  clock in both the SQLite and Deno/KV services; ticket expiry is rejected at the exact expiry
  instant, and room joins update durable activity timestamps through that clock. Node, Deno, and
  Deno/KV HTTP adapters parse every successful room, observation, action, replay, ruleset, health,
  and error response through shared protocol schemas before serializing it.
- The authenticated `/api/games/:gameId/branches` and `/api/games/:gameId/hints` routes are explicit
  competitive-room surfaces. They validate the caller and return a structured `409` with
  `unsupported_room_action` rather than falling through to the browser shell. The equivalent
  WebSocket requests are rejected before any engine call, and a payload naming another player is
  rejected as `cross_player_message` in Node and both Deno socket handlers.
- Focused post-audit validation: 43 tests across the multiplayer, Deno/KV handler, Deno service, and
  JSONL protocol files, plus `pnpm typecheck`. The final combined checks now pass: `pnpm format:check`,
  `pnpm lint`, `pnpm typecheck`, `pnpm test` (367 tests), `pnpm test:coverage` (364 tests; 93.09%
  statements, 86.93% branches),
  `pnpm test:sim:fast` (500 hands with zero failures), `pnpm build`, `pnpm test:e2e`,
  `deno check --unstable-sloppy-imports apps/server/deno.ts`, and `git diff --check`. The repository
  `pnpm smoke` wrapper was not run because it hard-codes the occupied user port 4173; the same built
  production artifact passed an isolated health and HTML smoke check on port 4184. A live Deno/KV
  two-socket flow on port 8000 covered bot-filled start, independent redacted hands, public-event
  action fan-out, reconnect catch-up from an earlier revision, duplicate idempotency, stale revision,
  cross-player rejection, malformed close 1008, and oversized close 1009. The same room then survived
  a Deno process restart: observation and replay reconstructed revision 5 with a redacted hand, and a
  reconnect from that revision received `hello` and a fresh observation.

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
- Added pure hold-breath state transitions. Right mouse requests zoom plus hold breath in the scene; the
  model drains -15/s, auto-stops at zero, and prevents reactivation until O₂ is above 25.
- Added `apps/web/src/scene/o2-stability.ts`, a smooth reserve-to-presentation curve shared by camera
  reticle sway and weapon viewmodel calculations. No reserve-percentage accuracy or sway thresholds
  are used; explicit hold-breath and free wall-brace states are the half-strength stabilisation modes. The HUD reports active
  hold-breath and rearm status, while `data-player-o2` remains the numeric reserve.
- Hold-breath presentation leaves half of the rested baseline reticle, weapon, and stationary breathing sway while O₂
  remains above zero, suppressing reserve-driven breathing destabilisation; the normal reserve-driven motion returns as
  soon as the hold ends or O₂ is depleted.
- Focused validation passed: `pnpm exec vitest run apps/web/src/scene/player-vitals.test.ts apps/web/src/scene/camera-motion.test.ts apps/web/src/scene/o2-stability.test.ts apps/web/src/scene/reticle-aim.test.ts apps/web/src/scene/weapons.test.ts` (50 tests), strict
  `pnpm exec tsc --noEmit --pretty false`, the web production build, Prettier, and focused ESLint. The broader
  scene directory is 99/100 because of an unrelated pre-existing wall-hang fixture failure; browser acceptance
  remains intentionally unverified because the repository forbids opening another session for this lane.

## 2026-08-06 — Left Command hold-breath binding

- Bound the physical left Command key (`MetaLeft`) to the same shared zoom/hold-breath state as right mouse.
- While left Command is held, the scene prevents default keyboard shortcuts for every delivered key event so
  `Command+W` continues to move in-game instead of closing the tab. Right Command remains unbound.
- Added pure left-Command detection/capture helpers and regression coverage. Browser acceptance remains unverified
  because this worktree does not open another game session; browsers that reserve a shortcut before dispatch may
  still require a full-screen/app window.

## 2026-08-06 — Right mouse no longer holds breath

- Kept right mouse as zoom-only and made left Command the sole desktop hold-breath binding.
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
  inherent pellet-cone, magazine, and reload profiles. The scene uses a seeded RNG for both pickup placement
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

## 2026-08-06 — Damage-derived clip and round reload timing

- Replaced the four fixed reload durations with a shared damage-based rule. A trigger pull's total damage is
  `damage per projectile × pellets`; profiles at or above 100 damage use round reloads, while lower-damage
  profiles use clip reloads. New weapon definitions inherit this classifier and timing through `defineWeapon`.
- Clip weapons reload their whole magazine in `0.01 × damage × magazine size` seconds: the 28-damage pistol takes
  `3.36 s` and the 12-damage machine gun takes `3.6 s`. Round weapons load one bullet or shell at a time using
  `0.01 × total damage per trigger pull`: the 100-damage sniper takes `1 s` per bullet and the eight-pellet,
  16-damage shotgun represents `128` damage and takes `1.28 s` per shell.
- Round reloads now insert ammunition progressively and continue until the magazine or reserve is exhausted;
  clip reloads still fill in one operation. `resolveWeaponReloadDuration` exposes the total for a requested number
  of rounds without putting reload rules in the scene UI.
- The server-owned test bus recorded all 15 `apps/web/src/scene/weapons.test.ts` assertions as passing for this
  dirty state. Strict TypeScript, the web production build, focused weapon ESLint, Prettier, and `git diff --check`
  also passed. The latest full server-owned snapshot passed all 420 assertions. An explicit `pnpm hmr` request was
  sent while the existing Vite lane was running; a new browser session was not opened.

## 2026-08-06 — Swift reload pose and round-reload interruption

- Shortened the shared reload lift to the first 10% of the normalized duration and the return to the final 10%.
  The reload hand motion stays at the raised pose for the middle 80%, so the weapon moves up quickly, performs the
  reload work while raised, and recentres quickly without a floaty transition.
- Round reloads now keep that raised pose across every shell/bullet chambering interval. The final recenter phase starts
  only after the last round or when a round reload is interrupted, so the weapon does not dip between shells.
- The final 0.12 seconds of each reload interval now plays the upward insertion impulse; the shell/bullet or clip is
  committed when that pulse ends, keeping the visible animation and UI chamber timing aligned.
- Round-based weapons can now interrupt between inserted bullets or shells. Holding fire cancels the pending next
  round as soon as one is chambered and fires immediately; an empty round-based magazine still waits for the first
  chambered round. Clip-based reloads remain atomic and cannot be interrupted by firing.

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
  presentation stack now queues each recovery in the central damper, crosses back through the reticule rest point before
  the next machine-gun shot, and overshoots to the opposite side instead of hiding the outward jerk in same-frame recovery;
  this remains a common damper response, not a weapon-specific rule.
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
  right-mouse zoom remains independent from left-Command hold-breath. A clean world-only render target feeds the magnified sample, so
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
  near ironsights can blur while the distant world stays comparatively sharp without a zoom-specific state.
- Added focused regressions for near-depth monotonicity, zero blur on the focus plane, and reduced far-depth defocus.
- The experiment was checkpointed at `534f04b` and then disabled after the existing Vite lane showed excessive whole-world
  blur during zoom. The active renderer is back on the prior stock Bokeh depth response; the physical experiment itself
  does not add a separate zoom-specific shader state.

## 2026-08-06 — Presentation-driven projectile spread

- Removed the seeded projectile cone from the pistol, machine gun, and sniper. Their shots now use the live reticule
  ray exactly; movement, breathing, posture, and prior damage-scaled recoil move the shared first-person presentation
  stack and therefore create the natural aim spread before the next shot.
- Kept an inherent seeded pellet cone only for the shotgun. Its radius is a fixed weapon property and is independent
  of O₂ or hold-breath state; those presentation effects move the cone's reticule-centered origin instead.
- Added a weapon regression covering the zero-cone ordinary guns and fixed positive shotgun cone. The runtime also
  avoids consuming shot RNG when a weapon has no inherent spread.

## 2026-08-06 — Explicit zoom toggle and intermediate crouch posture

- Right mouse now toggles persistent zoom state on each secondary-button press; releasing the button no
  longer exits zoom. Left Command remains the hold-breath/aim binding.
- Crouching no longer changes the seat FOV or activates the sniper optic. It keeps the lower eye height but uses an
  intermediate camera-damper weapon pose between standing hip fire and full zoom. Explicit zoom owns the smooth 90° →
  45° reticule-anchored zoom and restores the original crouched sight pose exactly (`x: 0, y: -0.22, z: -0.54`) so
  ironsights and the sniper optic stay aligned.
- A directional movement double-tap clears the persistent right-mouse zoom toggle before sprinting. Focused camera-motion
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
- Wall contact now feeds a separate shared presentation signal. While zoomed, the centralized camera
  damper and camera-attached weapon apply the independent wall-brace stability factor, including at empty O₂, without
  setting the paid holdingBreath state or spending reserve.
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
  sniper scope, now switches the shared Bokeh aperture/maxblur multiplier to 25× through the existing zoom state.
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

## 2026-08-06 — 10× recoil amplitude experiment

- Raised the shared `CAMERA_RECOIL_SHOT_MULTIPLIER` from 2× to 10× for a deliberately strong tuning pass. The
  reticle-following direction, centralized damper, and weapon-agnostic recovery remain unchanged.
- Removed the global 8° presentation clamp so the 10× response remains proportional and the bullet-power difference is
  readable. A future exceptional heavy weapon can opt into its own limit without constraining ordinary weapons.

## 2026-08-06 — Reload locomotion

- Reused the existing oxygen-neutral jog calculation as a standing reload speed cap. Walking remains walking during
  reload; a sprint request is capped to trot and resumes full sprint only when the next O₂ drain slice is affordable.
- Crouch movement keeps its existing lower speed priority. Automatic empty-magazine reloads follow the same temporary
  trot path.
- The fresh server-owned bus passed 407/407 assertions for the revised behavior. Root typecheck, full lint, web build,
  targeted formatting/diff checks, and the final scene HMR request also passed. Browser gameplay interaction was not
  independently observed in this turn.

## 2026-08-06 — Projectile damage O₂ fatigue

- Added the weapon-agnostic firing charge `O₂ cost = 0.25 × projectile damage` to the pure player-vitals helpers.
  The runtime sends the configured projectile count with each shot, so the eight 16-damage shotgun pellets cost
  32 O₂ in total; pistol, machine-gun, and the unchanged 100-damage sniper cost 7, 3, and 25 O₂ respectively.
- Firing consumes the remaining partial reserve instead of rejecting a shot when the full charge is unavailable.
  This keeps O₂ a fatigue resource rather than a second ammunition gate; the shared low-reserve presentation curve
  supplies the resulting aim and weapon sway.
- Added pure regressions for the quarter-damage charges, pellet counting, sniper value, and final-reserve clamp.

## 2026-08-06 — Debug speedometer

- Added a minimal `SPD 0.0 m/s` readout to the bottom-left of the visual-table scene. It is rendered only when
  the existing development debug mode is enabled (`?debug=1`), and it stays above the mobile movement joystick.
- The scene reports its damped horizontal movement speed at a low UI update rate, so the readout reflects walk,
  reload trot, and sprint speeds without driving a React update every render frame. The speed resets on scene disposal.

## 2026-08-06 — HUD hierarchy pass

- Refined the live scene HUD into labeled segments for preview state, round/seat, area, and room identity, with a
  compact status chip that reflects ready, crouched, sprinting, steady aim, and reloading states.
- Added consistent panel headings and glass treatment to player systems and loadout, tightened the bar and slot
  rhythm, and added visible critical-health, low-O₂, and reload accents without changing gameplay state.
- The metadata rail and panels keep their existing responsive placement, so the centre of the scene and mobile
  movement controls remain clear. Typecheck, web build, and targeted formatting passed; browser appearance remains
  tied to the existing connected preview.

## 2026-08-06 — Uncapped hitscan shots

- Removed the per-weapon range fields and raycaster distance limits. Every shot now resolves against the first
  render surface along its aim ray, regardless of weapon type.
- A miss tracer uses the camera's finite far plane only to keep the short-lived presentation line finite; it is not
  a gameplay projectile limit.

## 2026-08-06 — Free mini hop at depleted O₂

- A grounded player who cannot afford the full 5-point jump charge now receives a free mini hop instead of a rejected
  jump. Its launch speed uses the neutral balance of standing recovery and full-jump cost,
  `12 / (12 + 5) = 70.6%` of the full launch speed, for about half the full jump apex.
- The fallback does not change O₂ or add the full-jump recovery delay. Full jumps still pay the complete charge, and
  the existing crouch-to-stand transition applies to both accepted launch paths.
- Added pure regressions for the derived O₂ blend and the reduced launch-speed selection.

## 2026-08-06 — Traversal weapon lower

- Routed ledge vaults, wall hangs, and staged wall climbs into the existing centralized camera-motion viewmodel
  damper. The held gun now uses the same muzzle-down, below-frame pose as a weapon put-away transition while
  traversal is active.
- The pose holds until traversal ends, then reuses the existing raise phase. Physics, weapon ownership, firing, and
  reload state remain unchanged; this is presentation-only.
- Added a camera-motion regression for the lower/hold/raise sequence. The traversal regression passed in the
  server-owned bus; the aggregate snapshot was 412/413 because an unrelated core-engine property test failed. Strict
  typecheck, targeted ESLint/Prettier, the web build, `git diff --check`, and the explicit HMR request also passed.
  Browser interaction remains unverified because this worktree cannot open another browser session.

## 2026-08-06 — Shared breathing destabilisation emphasis

- Applied a shared 2× fatigue emphasis to the O₂ reticle and camera-damper sway outputs, preserving independent
  horizontal/vertical phases so the response remains multi-axis rather than a straight recoil line.
- Left the centralized shot-recoil spring and its recovery/overshoot tuning unchanged.

## 2026-08-06 — O₂ fatigue vision blur

- Routed the shared O₂ response through a lightweight full-screen shader pass after depth of field and the sniper-scope
  composite. The response follows the same continuous fatigue curve as aim sway and stays at zero while rested.
- Capped the exhausted view at 1 CSS pixel normally and 2 CSS pixels while zoomed (scaled to the device pixel ratio),
  keeping the effect bounded while retaining the existing Bokeh treatment. Replaced the contrast lift with a black
  radial vignette that eases continuously from the live reticule point (slightly below screen centre) to the corners,
  with deterministic transition dithering to avoid a hard colour band, and reaches 1.0 strength at zero O₂; contrast
  remains neutral at 1×. The existing auto/manual
  exposure target remains unchanged.
  Added `data-o2-vision-*` diagnostics to the scene container, pure endpoint/intermediate-value coverage, and verified
  the web build.

## 2026-08-06 — Half-strength wall bracing

- Wall-braced zoom keeps 50% of the reserve-driven reticle, weapon, and stationary camera-breathing instability instead
  of forcing a perfectly static presentation. Holding breath keeps 50% of the rested baseline and suppresses its
  reserve-driven breathing destabilisation while O₂ remains above zero.
- The wall brace remains free and does not change the player's O₂ reserve. Added regressions for the half-strength
  sway and accuracy response in the O₂ model and camera damper.

## 2026-08-06 — Sprint exits crouch

- A successful WASD/arrow double-tap sprint request now uses the existing crouch-to-stand transition before starting
  sprinting, so one sprint input both stands and accelerates.
- The normal 5-point stand O₂ cost remains required. If the reserve cannot pay it, the player stays crouched and
  sprint does not start. Added a focused posture regression.

## 2026-08-06 — Zoom recovery direction feedback

- Kept the existing hip-fire shot-direction feedback, including prior recoil, so the machine-gun's natural spread is
  unchanged.
- While zoomed, the visible recovery pulse still uses the shared camera damper, but its opposite-side overshoot no
  longer selects the next shot direction. This keeps the response deterministic while preserving the actual pulse on
  the camera, reticule, and held weapon.
- Added a pure regression for the hip-fire versus zoom shot-direction input split. Browser gameplay remains dependent on
  the existing connected preview; no additional browser session was opened.

## 2026-08-06 — Restore deterministic zoom recoil feedback

- Restored prior-recoil feedback to zoomed shot-direction selection instead of removing it entirely. Zoom now uses a
  fixed half-strength contribution, while hip fire keeps the full contribution.
- This keeps recovery pulses relevant to the next machine-gun shot without adding random projectile spread or making
  zoom as loose as hip fire.

## 2026-08-06 — Match zoom and hip-fire sway

- Removed the zoom-only 72% sway reduction. Zoom and hip fire now use the same base reticle and weapon sway amplitude.
- Holding breath and wall bracing still apply their existing deterministic stability factors on top of that shared base.

## 2026-08-06 — Penthouse armory chart

- Added a west-wall `WeaponDamageAmmoChartSign` to the authored penthouse. The textured sign lists pistol, shotgun,
  machine gun, and sniper damage per projectile, pellet count, loaded/reserve ammunition, and total starting rounds.
- Chart rows come from `WEAPON_CHART_ENTRIES`, a typed view derived directly from `WEAPON_DEFINITIONS`, so the visual
  reference cannot drift from the gameplay pickup and HUD values. Added a focused regression for that alignment.
- Validation: the chart regression passed in the latest server-owned bus snapshot (418/419 tests; one unrelated
  core-engine property test failed with `STACK_TRACE_ERROR`), strict typecheck passed, weapon-file ESLint passed, the
  web production build passed, and both explicit HMR requests were accepted by the running Vite server. Full repository
  lint remains blocked by existing dirty-lane diagnostics outside this feature; no browser session was opened.

## 2026-08-06 — Held-breath feedback and stacked wall bracing

- Holding breath no longer applies reserve-driven breathing destabilisation to reticle or weapon sway, and its camera
  breathing amplitude and frequency use the rested baseline while O₂ remains above zero. O₂ drain and automatic
  release at zero are unchanged.
- Holding breath and wall bracing each retain 50% instability; when both are active their factors multiply to 25% for
  an ultra-stable aim, weapon, and stationary-breathing presentation. Wall-only behavior remains unchanged.
- Added regressions for high-versus-low O₂ held-breath stability and the combined wall-plus-hold quarter response.
- The latest server-owned bus passed all changed camera/O₂ assertions (418/419 total); an unrelated dirty-lane
  `packages/test-fixtures/src/core-engine.test.ts` property failed. Strict typecheck, targeted ESLint/Prettier, the
  production build, HMR request, and `git diff --check` passed. Full ESLint remains blocked by unrelated dirty-lane
  diagnostics outside these O₂/camera files; browser interaction remains unverified.

## 2026-08-06 — Damage-driven red-hot barrels

- Added a shared barrel temperature model to the visual weapon runtime. Each projectile that resolves against a visible
  surface contributes its configured bullet damage in Celsius; misses add nothing, and shotgun pellets add independently.
- Replaced damage units with Celsius: barrels start at `20°C`, begin with a very faint glow at `500°C`, and reach the
  maximum bright cherry-red material response at `800°C`. Each hit adds `0.25°C × damage`, so seven `100`-damage sniper
  hits reach only `195°C`; twenty hits begin the glow ramp and thirty-two hits reach the maximum response.
- Cooling now follows Newton's law with `k = 0.003 s⁻¹`: `T = 20 + (T - 20) × exp(-k × elapsedSeconds)`. Heat is
  tracked per weapon and continues cooling while the gun is holstered or another weapon is active.
- Every procedural barrel receives its own material clone and uses the shared glow ratio to blend toward red emissive
  steel, capped at `emissiveIntensity = 1`. Pickup and held copies stay visually consistent without changing receiver
  or sight materials.
- Validation on the final dirty fingerprint: the server-owned test bus passed `431/432` assertions, including all weapon
  and Celsius-temperature coverage; one unrelated `packages/test-fixtures/src/core-engine.test.ts` property reports
  `STACK_TRACE_ERROR`. Strict typecheck, production build, targeted Prettier, `git diff --check`, and the explicit Vite
  HMR request passed. Browser interaction was not opened.

## 2026-08-06 — Pooled barrel smoke

- Added a deterministic, fixed-budget smoke presentation to each held weapon. A shared procedural 64×64 alpha mask
  drives 192 pooled billboards; trigger pulls emit dense gray muzzle puffs whose size and count scale from total damage
  per round (`damage × pellets`), while a separate pale-white thermal steam emitter follows the shared barrel glow
  ratio and produces upward-curling wisps only above 35% glow. Thermal steam uses a restrained longest-barrel scale
  ramp from 1× on the handgun to 1.6× on the sniper, while damage still makes high-power rounds larger. Puffs start at
  zero opacity, use a normalized sigmoid fade-in, then rapidly expand with an ease-out logarithmic curve over the first
  45% of the shared five-second lifetime, lingering at maximum size while transparent. Opacity follows the expansion from
  bright source scale to transparent max scale. The plume inherits the muzzle's world velocity, then drags to a stop
  while rising; shotgun and sniper rounds intentionally produce much larger clouds. The particle root lives in the scene
  world-effects root; each spawn captures the muzzle's world position and diffuses upward/outward independent of later
  camera movement or weapon switching.
- Thermal smoke uses the same logarithmic expansion and inverse-opacity lifecycle as muzzle smoke, with one inverse-size
  emission equation: smaller parametric plumes emit more frequently. Its square-root damage response keeps shotgun/sniper
  steam bounded, while glow still eases the rate in from 35% to full at 80%.
  Particles use no shadows, collision, or per-frame allocation, and their RNG stream is isolated from projectile spread.
  Pickup copies keep the red-hot material response but do not create smoke emitters. Thermal temperature decays
  exponentially toward the shared ambient value.
- Validation: the server-owned test bus passed all 20 weapon-file assertions, including the new thermal-smoke curve
  regression; one unrelated dirty-lane `packages/test-fixtures/src/core-engine.test.ts` property failed with
  `STACK_TRACE_ERROR`. Web strict typecheck and production build passed. The explicit HMR request was sent while the
  Vite lane was running; browser interaction remains unverified.

## 2026-08-06 — Reload temporarily leaves zoom

- Reload now suppresses the requested zoom state through the shared first-person input path. The camera FOV, reticule,
  viewmodel, O₂ stability, and breath state therefore leave zoom together while a clip or round reload is active.
- The requested zoom input is retained, so a player who keeps right-mouse zoom or left Command held returns to zoom only
  after the weapon's reload and final recenter presentation reports ready. Releasing zoom during reload leaves the player
  unzoomed.
- Added a pure regression for the unzoom/restore handoff. The server-owned bus passed that assertion and all other web
  assertions; one unrelated dirty-lane core-engine property test failed with `STACK_TRACE_ERROR`. Strict typecheck,
  targeted Prettier, web production build, and the explicit HMR request passed. Browser interaction remains unverified
  because this worktree cannot open another browser session.

## 2026-08-06 — Unify held-weapon breathing pose

- Removed the weapon runtime's second `weaponSwayPhase` oscillator. It was applied after the held model had already
  aimed at the live reticule ray, so low-O₂ breathing could rotate the sights away from the reticule.
- The held model now stays on the camera-attached viewmodel pose and live reticule ray; camera breathing, aim sway,
  recoil, and recovery remain the single perspective-motion path. No random projectile spread was added.
- Web build passed after the change. Browser/HMR acceptance remains pending on the existing connected preview.

## 2026-08-06 — Agent test note follows player vitals

- The HMR agent test note now sits in the same layout stack as Player systems and follows the vitals panel in normal
  child flow. Its position therefore tracks the panel height instead of using an independent top-right overlay, with
  matching responsive and debug-panel placement.

## 2026-08-06 — Crouch walking holds O₂ reserve

- Crouch walking no longer drains or recovers O₂. Its movement contribution is zero, so the reserve stays unchanged
  while the player moves; holding breath and other discrete O₂ costs remain independent.
- The existing 0.5-second recovery delay after crouch walking stops remains in place. Updated the pure vitals
  regression coverage and the visual-table oxygen documentation.
- Validation: the server-owned test bus passed all 427 assertions, strict typecheck, targeted ESLint, Prettier,
  production build, `git diff --check`, and the explicit Vite HMR request. Browser interaction was not opened.

## 2026-08-06 — Damage-pitched per-shot audio

- Added a four-layer procedural shot for every accepted trigger pull, including misses: a low-passed/compressed and
  saturated muzzle-blast noise, a high-passed crack noise, a square-wave mechanical click, and a low-passed decaying
  tail noise. No recorded samples are used.
- The profile has exactly two inputs, per-bullet `damage` and generated `barrelLength`. Damage lowers playback pitch and
  the muzzle cutoff while raising muzzle level; barrel length makes the crack quieter and the tail longer, darker, and
  slightly quieter. The shotgun therefore uses one pellet's damage for its sound rather than its total payload.
- The noise buffer uses a fixed seed independent of the room seed. A scene-local `AudioContext` is created or resumed
  from the firing gesture, all four layers start together, envelopes decay exponentially, and stopped nodes disconnect.
  Unsupported or autoplay-blocked audio fails soft and leaves the visual shot path active.
- Added pure regressions for fixed `whiteNoise`, damage and barrel monotonic mappings, finite-input fallback, and exact
  repeatability for identical parameters. The server-owned test bus passed `432/432` assertions on run
  `1786022381638-32746-a407746c`; strict typecheck, targeted ESLint, the web production build, Prettier, `git diff --check`,
  and the explicit Vite HMR request also passed. Browser audio interaction remains unverified because no new browser
  session was opened.

## 2026-08-06 — Parametric scoped carbine and burst submachine gun

- Extended the shared weapon definition table with a scoped carbine and a low-damage submachine gun. The carbine
  uses a 36-damage projectile, 0.42-second cadence, 18-round magazine, and a 3.2× optic. The submachine gun uses
  9-damage projectiles, a 0.045-second intra-burst interval, four rounds per burst, and a 0.24-second next-burst
  cooldown.
- Added generic derived `fireMode`, `burstSize`, and `burstCooldownSeconds` fields. The runtime completes an active
  burst after the trigger is released, then repeats bursts only while the trigger remains held; ammo, heat, recoil,
  smoke, audio, hit effects, and shot counts still resolve per projectile through the existing shared paths.
- Moved scope geometry and projection inputs into a reusable optic profile. Both the existing sniper and the new
  carbine now use the same camera-child lens anchor and projected world feed, with magnification supplied by the
  equipped weapon instead of a sniper-only constant.
- Added deterministic table-side pickups, number-row slots 5 and 6, six-row armory chart output, and HUD guidance for
  all six weapons. New derived chart rows expose fire mode, burst size, cooldown, and optic magnification directly from
  the definitions.
- Validation on the final dirty fingerprint: the server-owned test bus passed all `432/432` assertions, including
  the six-profile, burst, and reusable optic regressions. Strict typecheck, focused weapon/scope ESLint, the web
  production build, `git diff --check`, and the explicit Vite HMR request passed. Broader lint still reports existing
  dirty-lane diagnostics in `main.tsx` and `mahjong-table.ts`; no additional browser session was opened.
  Keep the canonical worktree frozen while reviewing the final diff and validation evidence; any code
  correction requires rerunning the full format, lint, typecheck, unit, build, and browser gates.

## 2026-08-07 — FPS Slayer readiness slice

The competitive FPS handoff is now implemented as an additive authority boundary in this worktree;
the dirty `visual-table` worktree was not edited.

- Added `@hk-mahjong/fps`, a pure fixed-step 60 Hz server simulation for one bounded authored arena.
  It owns movement/collision, spawn validation, input sequence checks, fire cadence, hitscan hitbox
  selection, shield/health damage, assists, death, respawn protection, score, match end, and a
  canonical event-chain replay. The rules, map, and weapon hashes are explicit.
- Added strict `packages/protocol/src/fps.ts` schemas for input, public avatar snapshots, private
  self state, scoreboard, combat events, replay, room HTTP payloads, and the FPS WebSocket envelope.
  Client input has no position, health, ammo, hit, kill, or score fields; opponent ammo is not in a
  public avatar snapshot.
- Added `AvatarDefinition`, a deterministic opaque fallback mannequin with named sockets and
  diagnostics, separate camera-relative hands/weapon viewmodel, local world avatar, and a bounded
  remote-snapshot interpolation registry. The local browser also performs bounded prediction and
  correction against authoritative snapshots.
- Added `/api/fps/rooms`, `/api/fps/rooms/:matchId/join`, ready/start/snapshot/input/replay routes,
  and `/ws/fps/:matchId`. Room tickets are hashed and bound to one player ID. The FPS SQLite journal
  stores match checkpoints, event chains, and ticket bindings; a fresh service reconstructs the
  match and accepts the same ticket.
- Added `/?fps=1` browser mode with a deterministic arena, first-person controls, third-person
  verification camera, fallback-avatar HUD, and explicit authority/replay status.
- The real Fastify `ws` seam now decodes non-binary text frames delivered as `Buffer` values while
  still closing true binary frames with code 1003; the focused socket regression covers that boundary.
- Added focused unit, protocol, persistence, server, and browser tests. The isolated Playwright
  run on port 4183 passed the two-client FPS flow and wrote `test-results/fps-slayer-first-person.png`
  and `test-results/fps-slayer-third-person.png`.

This is an experimental competitive prototype, not competitive-production readiness. Cloudflare
Tunnel validation, packet-loss/load/abuse budgets, named-tunnel operations, anti-cheat telemetry,
full delta-snapshot recovery, and the final public-edge gate remain open. Do not describe this
build as “multiplayer ready” until the handoff checklist is closed on one frozen build.

### FPS follow-up evidence — 2026-08-07

- Corrected the FPS RNG output to standard xoshiro128** and locked its `rng-vector` sequence in
  `packages/fps/src/rng.test.ts`.
- Expanded `slayer-arena-v1` to eight validated, separated spawn points so the declared eight-player
  cap can activate without an invalid-spawn failure.
- Added deterministic prediction reconciliation and snapshot ordering tests, including delayed,
  dropped, duplicated, and out-of-order delta recovery through a full snapshot.
- Added avatar registry/mesh/bounds/fallback diagnostics tests and browser data attributes for local
  entity state, snapshot tick, quality, correction distance, and visible mesh counts.
- Added service abuse/lifecycle tests for ticket expiry, origin allowlists, frame-size and binary-frame
  rejection, input rate limits, stale clocks, durable request idempotency, reconnect reservation expiry,
  full resync, duplicate fire nonces, and replacement of a stale duplicate socket.
- Added `pnpm test:fps:gate`: a no-argument local gate for eight simulated clients over 600 ticks. The
  accepted receipt has 4,800 inputs, 200 snapshots, 511 authoritative events, replay verification, a
  0.405 ms observed maximum simulation tick, and deterministic digest
  `sha256:639ba5744cb70e5e82d7358f0c6ae35e45311677ceedc19a3be312ce1e0fe4ec`.
- Extended the rendered Playwright FPS check to verify fallback mesh diagnostics and low/medium/high
  quality mode transitions. This remains local browser evidence; it does not prove a Cloudflare edge,
  planned-duration load budget, or the complete fire-to-kill/death/respawn lifecycle.
- Added `pnpm test:fps:load`, a no-argument ten-minute simulated eight-client authority/load gate. It
  accepted 288,000 inputs, validated 96,000 snapshots, serialized 604,152,961 snapshot bytes, and
  replay-verified 56,635 events with a 0.626 ms observed maximum simulation tick. Receipt digest:
  `sha256:a499d481688f6413687e76e52554d028f0ac6b9c95599c298510e96aa2b18424`.

- Prior local validation on the pre-deterministic-spawn dirty state passed `pnpm format:check`, `pnpm lint`,
  `pnpm typecheck`, `pnpm test` (393 tests), `pnpm build`, `pnpm test:e2e` (both browser scenarios),
  the isolated production health/browser smoke on port 4184, and both FPS gates. Built-output
  manifests and the non-destructive rollback procedure are recorded in
  `docs/multiplayer-fps-slayer-readiness-handoff.md`.

### Current local validation after deterministic spawn and diagnostics patch — 2026-08-07

- Fixed FPS spawn reproducibility: spawn selection is now derived from the match seed and spawn
  ordinal, not random room-local player IDs. A regression test proves two different credential IDs
  produce the same seeded geometry. This made the `lifecycle-1` browser combat scenario stable when
  center cover would otherwise block a valid aim ray.
- Added privacy-safe `FpsMatchService` counters for simulation ticks and timing, simulation overruns,
  resync requests, and snapshot failures. The two-client browser test reads `/diagnostics`, confirms
  two connected players and one active match, requires simulation ticks, and checks zero persistence
  and snapshot failures without exposing the ticket, sessions, or input receipts.
- Re-ran the full local gates after the source change: 395 unit tests in 34 files, Playwright FPS
  `2 passed`, the complete `pnpm test:e2e` suite (`3 passed`), `pnpm build`, and isolated production
  smoke on port 4184. Browser metrics were 79
  frames in about 2 seconds (average 25.53 ms, p95 35.2 ms, max 35.3 ms), 24 draw calls, 3,950
  triangles, and a sampled 33.3 ms frame.
- Re-ran `pnpm test:fps:gate`: 4,800 accepted inputs, 200 snapshots, 523 events, max tick 2.169 ms,
  receipt digest `sha256:5e6a6d5eb457e9565d9e51953a753382672ddcd93cfef613af93d8cf6854d482`.
- Re-ran `pnpm test:fps:load`: 288,000 accepted inputs, 96,000 snapshots, 56,591 events,
  604,659,058 serialized snapshot bytes, max tick 0.677 ms, receipt digest
  `sha256:73d4e94e860e3467bc02896a97448a361267457efb9fa51560bee4b20307cd8e`.
- Current artifact aggregate is
  `sha256:8bd64d0e781ddf68508f003aec73d3df6106283a921ef45519a2b99cf12397ca`; component manifests
  and the unchanged rules/map/weapon hashes are recorded in the readiness handoff §22.

The FPS lane remains an experimental local prototype. Named-edge acceptance, real browser/network
soak and load budgets, public-edge review, and production anti-cheat/privacy operations remain open;
do not call this build multiplayer-ready.

### Final local browser/network soak — 2026-08-07

- Removed the per-input FPS snapshot broadcast. `FpsMatchService` now coalesces publication requests
  and serializes snapshots asynchronously at the configured snapshot cadence or on authoritative
  events, keeping socket writes outside the fixed-step simulation budget.
- `pnpm test:fps:browser-soak` held eight real local browser clients for `602.128 s` against the
  planned 600-second duration. The server recorded 36,265 ticks, `0` overruns, average/max tick
  times of `0.181/10.575 ms`, 96,029 accepted inputs, 96,013 snapshots, 548,047,275 snapshot
  bytes, eight WebSocket upgrades, and zero rejected inputs, resyncs, snapshot failures,
  persistence failures, or replay failures.
- Browser samples were 121 frames per client with p95 `16.8–16.9 ms`, maximum `18.3–18.4 ms`,
  96–98 draw calls, 22,286–22,310 triangles, and a maximum sampled heap of 20.5 MB. Receipt
  `test-results/fps-browser-soak.json` has digest
  `sha256:3be1aaebeebbdc7f13db9217e3eeb84da43f4100ae523c13160419150a44281a`.
- The post-change deterministic receipts remain stable: `pnpm test:fps:gate` reports 4,800 accepted
  inputs, 200 snapshots, 523 events, and maximum tick `1.787 ms` with digest
  `sha256:5e6a6d5eb457e9565d9e51953a753382672ddcd93cfef613af93d8cf6854d482`; `pnpm test:fps:load`
  reports 288,000 accepted inputs, 96,000 snapshots, 56,591 events, 604,659,058 snapshot bytes,
  maximum tick `0.588 ms`, and digest
  `sha256:73d4e94e860e3467bc02896a97448a361267457efb9fa51560bee4b20307cd8e`.
- The final artifact manifest covers all 29 files under `apps/*/dist` and `packages/*/dist`; its
  newline-terminated aggregate is
  `sha256:f68fe797daeba852cda0e29f1ef34cbc5c42af91656c783c5aaa17876a16e3e6`.

This closes only the local planned-duration browser/network load budget. Named-edge acceptance,
packet-loss/clock-skew recovery, public-edge review, production anti-cheat/privacy operations, and
the external rollback drill remain open; the prototype is not competitive-play ready.

### Local abuse and network-boundary gate — 2026-08-07

- Added a future-acknowledgement bound to the authoritative input path. A client acknowledgement
  more than two server ticks ahead is rejected as invalid instead of being treated as authority.
- Corrected service metrics so only malformed or schema-invalid frames increment `malformedFrames`;
  rate-limit, stale-clock, cross-player, and other structured FPS errors remain separately visible.
- Added `pnpm test:fps:abuse`, a no-argument real Fastify/WebSocket boundary gate. It proves room and
  join flood limits, invalid and cross-player tickets, stale and future clocks, malformed JSON,
  1009 oversized-frame and 1003 binary-frame closes, 4001 duplicate-socket replacement, full
  resync, and diagnostics privacy. Receipt digest:
  `sha256:49361f2876cf47822e1b3a920ae5377ca1e30a2cdd83817179acbec8cc84d34d`.

- Re-ran `pnpm test:fps:browser-soak` on the hardened source with eight real local browser clients
  for `602.169 s` against the planned 600 seconds. The server recorded `36,286` ticks, average/max
  tick times of `0.029/4.499 ms`, zero simulation overruns, `96,029` accepted inputs, `0` rejected
  inputs, `96,072` snapshots, `548,384,766` snapshot bytes, `8` WebSocket upgrades, and zero
  resync, snapshot, persistence, or replay failures. Browser samples were `121` frames per client,
  p95 `17.3–17.4 ms`, maximum `17.6–17.7 ms`, `96–98` draw calls, `22,286–22,310` triangles, and
  a maximum sampled heap of `26.0 MB`. Receipt file SHA-256:
  `sha256:155fd93abab3fe73a951597c537e08328e18de644b8c2c4fa3a2f535de5b9813`.

- Added `pnpm test:fps:network`, a deterministic local transport-fault gate. It drops one delta,
  delays and reorders later deltas, verifies two full-resync requests, accepts a missing frame once
  order is restored, and treats a duplicate snapshot as idempotent. It also accepts an exact
  `10,000 ms` clock-skew boundary, rejects a stale timestamp, and rejects a future acknowledgement.
  Canonical receipt digest:
  `sha256:d6d711644678a498d0ea5815e0ae835564f9a3717e76c915c35992841d40bcdd`.
- Expanded `FpsService` diagnostics with room count, phase duration, dropped frames, persistence
  latency and commit failures, fire requests, accepted/rejected shots, hit events, deaths,
  respawns, terminal matches, and score events. The response remains privacy-safe and omits raw
  tickets, sessions, input receipts, seeds, and private diagnostics.

This closes the local input-boundary, abuse, deterministic network-fault, and planned-duration
browser/network load gates only. Named-edge packet-loss/clock-skew tests, production anti-cheat/
privacy operations, external rollback, and competitive readiness remain open.

The pre-AI post-hardening build artifact manifest covered all 29 files under `apps/*/dist` and
`packages/*/dist`; its newline-terminated aggregate was
`sha256:5388b34437f62cb99ad9a4c2656a405bc06c38e56ca48bcd6d5543c315eb4d2c`. The current post-AI
manifest is recorded in the readiness handoff §24.

### Server-owned AI competitor — 2026-08-07

- Added an optional bounded `botCount` to FPS room creation. The service creates deterministic
  `Rival Echo`-style seats, auto-readies them, and persists them inside the existing FPS checkpoint;
  human-only room behavior remains unchanged when `botCount` is omitted.
- Added a `controller` marker to the authoritative player/checkpoint boundary. Bot inputs are
  generated inside `FpsMatch` from the match seed and bot ID, then pass through the same validated
  input, movement, collision, weapon switching, reload, hitscan, health/shield, death, respawn,
  score, and replay paths as human inputs. No bot ticket or hidden client state is exposed.
- Added a browser control and visible note at `/?fps=1`; `Play against AI rival` creates a solo room
  with one normal-vitals rival. Added deterministic core, protocol, service, and browser regression
  coverage.
- Validation on this source: 25 focused FPS tests passed, strict typecheck/lint/format passed,
  production `pnpm build` passed, and the focused solo-AI Playwright test observed a rival shot on
  the live browser path. The full `pnpm test:e2e` suite now passes all four tests, including the
  two-client switch/reload/kill/death/respawn lifecycle.
- The current post-AI build manifest covers all 29 artifacts and has aggregate
  `sha256:b1897b9d2e1055feb9f4d0d719fb345fa6c17f29a97f5b36750221894411c701`. A fresh ten-minute
  browser soak on this exact source also passed; its receipt is recorded below.

### Current post-AI validation and browser soak — 2026-08-07

- `pnpm test` reports `399` tests in `34` files. `pnpm format:check`, `pnpm lint`,
  `pnpm typecheck`, and `pnpm build` pass.
- `pnpm test:coverage` passes with `396` tests and aggregate coverage of `93.10%` statements,
  `86.89%` branches, `97.72%` functions, and `92.95%` lines. `pnpm test:sim:fast` completes
  500 seeded hands with zero illegal actions, invariant violations, crashes, command-bound
  failures, or replay mismatches; run digest
  `sha256:24861c46da16e78c754d507a11c866dd6b14c2e37147488734e387ab6b7c570f`.
- An isolated production smoke equivalent against the fresh build on port `4184` returned HTTP
  `200`, `{"status":"ready","schemaVersion":1}`, and the browser shell marker. The existing
  listener on port `4173` was not touched; the root `pnpm smoke` wrapper remains unsuitable while
  that user-owned listener is active because it is hard-coded to port `4173`.
- `pnpm test:e2e` passes all four tests in `1.2m`: the mahjong reconnect flow, FPS rendered
  avatar flow, authoritative switch/reload/hit/kill/death/respawn lifecycle, and server-owned
  AI-rival flow. The FPS rendered sample recorded 66 frames (average `30.69 ms`, p95 `50 ms`,
  max `50 ms`), 24 draw calls, and 3,950 triangles. Fresh lifecycle and AI screenshots are in
  `test-results/`.
- `pnpm test:fps:abuse` and `pnpm test:fps:network` pass with canonical receipt digests
  `sha256:49361f2876cf47822e1b3a920ae5377ca1e30a2cdd83817179acbec8cc84d34d` and
  `sha256:d6d711644678a498d0ea5815e0ae835564f9a3717e76c915c35992841d40bcdd`.
- `pnpm test:fps:gate` passes with 4,800 accepted inputs, 200 snapshots, 523 authoritative
  events, maximum tick `0.484 ms`, and digest
  `sha256:5e6a6d5eb457e9565d9e51953a753382672ddcd93cfef613af93d8cf6854d482`.
- `pnpm test:fps:load` passes with 288,000 accepted inputs, 96,000 snapshots, 56,591 events,
  604,659,058 serialized snapshot bytes, maximum tick `3.866 ms`, and digest
  `sha256:73d4e94e860e3467bc02896a97448a361267457efb9fa51560bee4b20307cd8e`.
- `pnpm test:fps:browser-soak` passes against the current post-AI build with eight real local
  browser clients for `602.415 s`. Diagnostics recorded 36,046 ticks, average/max tick times
  `0.0458/14.191 ms`, zero overruns, 96,024 accepted inputs, zero rejected inputs, 95,412
  snapshots, 544,616,866 snapshot bytes, eight WebSocket upgrades, and zero resync, snapshot,
  persistence, or replay failures. Browser samples were 121 frames per client with p95
  `17.2–17.3 ms`, max `17.6–17.7 ms`, 96–98 draw calls, 22,286–22,310 triangles, and a maximum
  sampled heap of 24.5 MB. Receipt file SHA-256:
  `sha256:f29026ded4b80498dbf879d7125516186df513e1df332f0a8345c443a2c8534b`.

These are current local receipts for the exact dirty source. Named-edge acceptance, public-edge
packet-loss/clock-skew testing, production anti-cheat/privacy operations, and the external rollback
drill remain open; the FPS prototype is not competitive-play ready.

### Seed-redaction and rebased-gate follow-up — 2026-08-07

- Public `FpsSnapshot` and `FpsReplay` no longer expose the authoritative seed. The protocol schemas
  reject it, the service strips it before public replay parsing, and the focused HTTP/WebSocket/
  restart tests assert that serialized snapshots and replays do not contain it.
- The branch was concurrently rebased to `12f358d3e67a72944af4701c0c2c52508d28f76d`; the prior
  `2f9e37d4930571e8a0cb061ae302379cc5fe15c1` evidence is therefore stale. On the rebased source,
  the focused FPS suite (26 tests), typecheck, build, the complete four-test Playwright suite, abuse/network
  gates, authority gate, and load gate pass. The full lint/test gates and planned-duration soak do
  not: 86 unrelated lint errors, two non-FPS unit failures, and one max-tick overrun in each of two
  browser soak attempts. See the readiness handoff §25 for receipt digests and the remaining gates.

### FPS fixed-step hot-path repair and current soak — 2026-08-07

- The authoritative service no longer allocates a public roster projection inside every fixed-step
  callback. `FpsMatch` exposes scalar phase/tick reads for the scheduler, while public snapshots
  remain unchanged.
- Persistence now checks event/tick thresholds before exporting a checkpoint. A scheduled no-op
  does not clone players, inputs, and event records or serialize an unnecessary SQLite write.
- `pnpm format:check`, `pnpm typecheck`, the focused FPS set (32 tests in 8 files), and all four
  `pnpm test:e2e` browser scenarios pass.
- `pnpm test:fps:gate` passes with maximum tick `1.315 ms` and digest
  `sha256:5e6a6d5eb457e9565d9e51953a753382672ddcd93cfef613af93d8cf6854d482`.
- `pnpm test:fps:load` passes with maximum tick `0.676 ms` and digest
  `sha256:3a21f7fc2903871acac74b0408e9971fb309007a6f8192f76204981fa06c9445`.
- The planned eight-client browser soak passes for `602.116 s`: 36,259 ticks, average/max tick
  `0.0201/9.367 ms`, zero overruns, 96,021 accepted inputs, 96,008 snapshots, 545,235,329
  snapshot bytes, zero resync/snapshot/persistence/replay failures, and browser p95/max frames
  `17.7–17.8/18.6–18.7 ms`. Receipt SHA-256:
  `sha256:2793c3e5ae811bf3ef4f3e9f24bb2c9afe82caec6bd4bcc820552a587af7468a`.

The post-repair build has 29 output files and newline-terminated manifest aggregate
`sha256:db87ff98cf9c89d7f8c5b2b0e426400bb57ac09a7c7fb5d37d7d212061d8a038`. Rules/map/weapon
hashes are unchanged at `sha256:af61d3c8254e65a350872b956dfc7e80394bff7adebd2c530447077e83b81068`,
`sha256:cee4798d193d1ed82ec7b0e0d48f891de54b09dc7c1c82c68524d675cc5f96f1`, and
`sha256:aae225cf0c9fdac72848817488cbf60b7d8c62a0925fc88bf91f22efd841466b`.

The local FPS load-budget blocker is closed on this exact source. The full unit suite passes 559
tests across 46 files. The full repository lint gate still has 86 unrelated rebased visual-table /
movement diagnostics; these reproduce against the current base and were intentionally not rewritten
in this FPS lane. Named-edge, production anti-cheat/privacy, and rollback evidence remain open; the
prototype is not competitive-play ready.

## 2026-08-07 — Local FPS avatar presentation and final validation

The FPS browser now has an explicit avatar presentation boundary. A deterministic seven-mesh
fallback mannequin supplies named sockets and a visible `missing_avatar_asset_fallback` diagnostic.
The local player keeps a world-space body for shadows, reflections, and third-person/spectator
views while using a separate camera-relative hands/viewmodel in first person. Upper-body and weapon
occluders use a dedicated camera layer only in first person; third person restores the full body.
The authoritative world weapon follows weapon selection, fire emissive state, crouch scale, death
pose, lifecycle visibility, and snapshot tick. Remote bodies are interpolated from public snapshots.

- `pnpm exec vitest run apps/web/src/fps/avatar.test.ts`: 4/4 passed.
- `pnpm test`: 561 tests passed across 46 files.
- `pnpm typecheck` and `pnpm format:check`: passed.
- Focused avatar lint: passed. Full `pnpm lint`: 86 unrelated visual-table/movement diagnostics
  remain; no avatar lint error remains.
- `pnpm test:e2e`: all 4 browser scenarios passed. The FPS sample was 77 frames, average `26.24 ms`,
  p95 `34.6 ms`, maximum `35.1 ms`, 30 draw calls, and 4,806 triangles.
- Screenshots: `test-results/fps-slayer-first-person.png`, `fps-slayer-third-person.png`,
  `fps-slayer-reload.png`, `fps-slayer-death.png`, `fps-slayer-respawn.png`, and
  `fps-slayer-solo-ai.png`.
- Current 29-file build manifest aggregate:
  `sha256:1e1096a4ed418c0ad7c94b0292f580aa9934ebcae6f9344f91d7bc1170eb2340`.

This is rendered local prototype evidence only. Named-edge acceptance, public-edge packet-loss and
clock-skew testing, production anti-cheat/privacy operations, and external rollback remain open;
the FPS prototype remains not ready for competitive play.

### FPS map diagnostic and current validation — 2026-08-07

- Added `buildFpsMapDiagnostic`, a deterministic public-state-only diagnostic for the versioned map
  and collision geometry. It reports obstacle IDs, player capsules and overlap checks, spawn-facing
  rays, and spawn-to-player visibility without exposing vitals, ammunition, seeds, tickets, or
  sessions.
- The web canvas publishes map ID/hash, collision, capsule, spawn-ray, and visibility-test
  attributes. The two-client browser flow asserts three obstacles, two capsules, eight spawn rays,
  and 16 visibility tests; focused map/avatar coverage passes 6 tests.
- `pnpm test` passes 563 tests across 47 files. `pnpm typecheck` and `pnpm format:check` pass.
  Focused FPS/map lint passes; full lint still has the same 86 unrelated visual-table/movement
  diagnostics in the rebased lane.
- `pnpm test:e2e` passes all four real browser scenarios. The current FPS sample recorded 76 frames,
  30 draw calls, and 4,806 triangles.
- The current 29-output build manifest aggregate is
  `sha256:8ab4ed57fa3f04021f71a1f17ee43affb565f32934d716a3bd8cf26fd75aa6ea`.

This remains local rendered prototype evidence. Named-edge/public-edge testing, production
anti-cheat/privacy operations, and external rollback remain open; the prototype is not
competitive-play ready.

### FPS competitive HUD and viewmodel lifecycle — 2026-08-07

- Added public `durationTicks` and `scoreTarget` snapshot fields so the browser HUD reads match
  timing and target values from the authoritative rules instead of a duplicated UI constant.
- Added the rendered reticle with preview/ready/fire/reload/down states plus visible timer, target,
  RTT, and prediction/resync status in the FPS HUD.
- Added authoritative viewmodel application for weapon identity/scale, reload pose, fire emissive
  state, crouch offset, death pose, and disconnect/spectator visibility. Canvas diagnostics expose
  viewmodel weapon, action, and visibility while the world avatar remains separate.
- The focused map/avatar set passes 7 tests; the full suite passes 564 tests across 47 files.
  Typecheck and focused FPS lint pass. The FPS Playwright spec passes all three scenarios; the
  current rendered sample recorded 76 frames, 30 draw calls, and 4,806 triangles.
- The current 29-output build manifest aggregate is
  `sha256:ff890c87711017f7bc89abebae8ce0e62ad3ecb05650c3489fe099c588f52ce3`.

This is local rendered prototype evidence. Named-edge/public-edge testing, production anti-cheat/
privacy operations, and external rollback remain open; the prototype is not competitive-play ready.

## 2026-08-07 — FPS spawn safety and final local validation

The authoritative `FpsMatch` spawn path now validates enemy separation against the six-metre rules
threshold and, for respawns, prefers spawn points with obstacle-occluded eye-level line of sight.
`isFpsLineOfSightClear` uses the authored arena geometry. Selection is deterministic from the match
seed and spawn ordinal, independent of random room-local player IDs, and retains a collision-valid
fallback with spawn protection when the arena has no fully safe point.

- `pnpm exec vitest run packages/fps/src/arena.test.ts packages/fps/src/match.test.ts`: 15 tests
  passed, including deterministic terminal winner tie-breaking.
- `pnpm test`: 567 tests passed across 47 files.
- `pnpm test:e2e`: all four browser scenarios passed. The latest FPS sample recorded 77 frames,
  30 draw calls, and 4,806 triangles.
- `pnpm typecheck`, `pnpm format:check`, both staged/unstaged diff checks, and focused FPS lint
  passed. Full `pnpm lint` still exits with exactly 86 unrelated visual-table/movement errors.
- `pnpm build` passed. The final 29-output manifest aggregate is
  `sha256:4f46bb22076630263d20fa6f52248f92861585eb222b840705b26ec141ea5da6`.

No public server, Cloudflare Tunnel, deployment, public-edge fault test, production anti-cheat /
privacy operation, or rollback drill was started. The FPS prototype remains not competitive-play
ready.

## 2026-08-07 — FPS snapshot baseline and identity recovery gate

`FpsSnapshotTracker` now requires a full snapshot before accepting deltas and records the match,
room, rules, map, weapon-set, and RNG identity established by that baseline. A later frame with a
different identity is rejected with `identity_mismatch` and requests a full resync. Ordered same-tick
deltas and exact duplicates remain accepted without an extra state transition.

- `pnpm exec vitest run tests/network/fps-simulation.test.ts packages/fps/src/match.test.ts packages/fps/src/arena.test.ts`: 17 tests passed.
- `pnpm test`: 567 tests passed across 47 files.
- `pnpm test:e2e`: all four browser scenarios passed; the latest FPS sample recorded 74 frames,
  30 draw calls, and 4,806 triangles.
- `pnpm typecheck`, `pnpm format:check`, both diff checks, and focused FPS lint passed. Full lint
  still reports exactly 86 unrelated visual-table/movement errors.
- `pnpm build` passed; the final 29-output manifest aggregate is
  `sha256:4f46bb22076630263d20fa6f52248f92861585eb222b840705b26ec141ea5da6`.

No public edge, production anti-cheat/privacy operation, deployment, or rollback drill was run;
the FPS prototype remains not competitive-play ready.

## 2026-08-07 — FPS terminal result browser acceptance

The FPS room form now lets the browser choose a score target from 1 to 100, defaulting to 25. The
request uses the existing validated `fpsRoomCreateRequest` contract. When the public event stream
contains the authoritative `match_ended` event, the arena renders a result panel with the terminal
reason and winner names resolved from the public scoreboard. The render loop stops submitting input
outside the active phase, and late `match_not_active` errors cannot replace the terminal HUD state.

- The two-client terminal Playwright flow creates a target-1 match, reaches one kill, and asserts
  the ended phase, score-target reason, winner ID, both rendered result panels, and
  `test-results/fps-slayer-terminal.png`.
- `pnpm test`: 567 tests passed across 47 files. `pnpm test:e2e`: all five browser scenarios passed;
  the latest FPS sample recorded 75 frames, 30 draw calls, and 4,806 triangles.
- `pnpm typecheck`, `pnpm format:check`, both diff checks, and focused FPS ESLint passed. Full lint
  remains exactly 86 unrelated visual-table/movement errors.
- `pnpm build` passed with 29 artifacts. The current manifest aggregate is
  `sha256:17276d7d5d27110c65bb252289b0cfaa637824bac652659fd1be8d4fa2f58ef6`.

This is local browser evidence only. Named-edge/public-edge acceptance, packet-loss and clock-skew
testing, production anti-cheat/privacy operations, and rollback remain open; the prototype is not
competitive-play ready.

## 2026-08-07 — FPS checkpoint integrity and local rollback drill

Checkpoint restore now fails closed when persisted event-chain hashes, event counters, event tick
ordering, or restore counters do not match the checkpoint. The regression test tampers with a saved
event hash and confirms `FpsMatch.fromCheckpoint` rejects it with
`fps_checkpoint_event_chain_mismatch`.

- `pnpm exec vitest run packages/fps/src/match.test.ts apps/server/src/fps-match.test.ts`: 24 tests
  passed.
- `pnpm test:fps:rollback`: passed. A temporary SQLite journal was reopened through a fresh service
  handle; public replay and persisted snapshot state matched; a post-restore input was accepted;
  the temporary directory was removed. Receipt digest:
  `sha256:2b8559b29e959dd69536534165fa4720aceddd3849d0247eb02a91ae4fab4b3`.
- The receipt contains no seed or ticket. This is local integrity evidence only; named-edge,
  production anti-cheat/privacy operations, and an external retained-artifact rollback remain open.

The post-integrity source validation also passes `pnpm test` (569 tests in 47 files), all five
`pnpm test:e2e` scenarios, strict typecheck, formatting, and focused FPS ESLint. `pnpm build`
emits 29 artifacts with sorted manifest aggregate
`sha256:7f2147a8d4d48c724b297f3f88d62e0cafbaa27d0f3b80c8a3d9fe0220bdc24f`. Full repository lint
still reports the same 86 unrelated visual-table/movement diagnostics. Public-edge, production
anti-cheat/privacy, and retained-artifact rollback remain open.

The HTTP FPS input route now shares the WebSocket `maxInputsPerSecond` limit, keyed by request IP,
match, and player. The Fastify regression passes 13 tests, and `pnpm test:fps:abuse` passes with HTTP
input statuses `[200, 200, 429]` and receipt digest
`sha256:3111a7991cbeee28c53189696db57df6c2770e3639c5c15a0c091117ca06c500`. This is local
input-boundary evidence; production anti-cheat operations remain open.

## 2026-08-07 — FPS final post-rate-limit validation refresh

The exact dirty source at `12f358d3e67a72944af4701c0c2c52508d28f76d` was rebuilt and revalidated
after the HTTP input rate-limit change. The current production build contains 29 output files; its
sorted, newline-terminated relative-path manifest aggregate is
`sha256:587b4b62208127f9e4ee9de275c9c7ecd3f2ece06783e988098a3041050791a2`.

- `pnpm test` passes 569 tests across 47 files.
- `pnpm test:e2e` passes all five real browser scenarios. The latest FPS sample recorded 77 frames,
  30 draw calls, and 4,806 triangles.
- `pnpm typecheck`, `pnpm format:check`, and focused FPS ESLint pass.
- `pnpm test:fps:abuse` passes with HTTP input statuses `[200, 200, 429]` and receipt digest
  `sha256:3111a7991cbeee28c53189696db57df6c2770e3639c5c15a0c091117ca06c500`.
- `pnpm test:fps:rollback` passes with receipt digest
  `sha256:2b8559b29e959dd69536534165fa4720aceddd3849d0247eb02a91ae4fab4b3a`.
- Full `pnpm lint` remains non-green with exactly 86 unrelated visual-table/movement diagnostics.

This is local source, build, abuse, replay, and rendered evidence only. Named Cloudflare
Tunnel/public-edge acceptance, public-edge packet-loss and clock-skew testing, production
anti-cheat/privacy operations, and an external retained-artifact rollback remain open. The FPS
prototype remains not competitive-play ready.

## 2026-08-07 — FPS lifecycle, replay verification, and deterministic gate refresh

The FPS authority now treats disconnect and reconnect state as explicit lifecycle transitions.
Disconnected and spectator players cannot be spawned during countdown, submit input, or be revived
implicitly; countdown cancellation is recorded when fewer than two eligible players remain. Ticket
authentication precedes reconnect-storm limiting, HTTP routes enforce the configured origin and
Bearer boundary, query-string tickets are rejected, and shutdown flushes checkpoints before closing
SQLite. Replay records carry a public roster and terminal scoreboard; verification derives the
scoreboard and deterministic winner from chained events and rejects a tampered scoreboard.

- Focused authority/protocol/service/network tests: 42 passed across 8 files.
- Full unit suite: 574 tests passed across 47 files.
- `pnpm test:e2e`: all five real browser scenarios passed; the latest sample recorded 71 frames,
  p95 34.6 ms, maximum 50 ms, 30 draw calls, and 4,806 triangles.
- `pnpm typecheck`, `pnpm format:check`, both diff checks, and focused FPS ESLint passed. Full
  repository ESLint still reports exactly 86 unrelated visual-table/movement diagnostics.
- Abuse receipt: `sha256:3111a7991cbeee28c53189696db57df6c2770e3639c5c15a0c091117ca06c500`.
- Deterministic network receipt: `sha256:d6d711644678a498d0ea5815e0ae835564f9a3717e76c915c35992841d40bcdd`.
- Rollback receipt: `sha256:3e209c08e2cc0851a694808b548f320a11060c91ca9bce2e38c2946b23814b7e`.
- Eight-client gate: 4,800 inputs, 200 snapshots, 523 events, maximum tick 1.841 ms, receipt
  `sha256:5e6a6d5eb457e9565d9e51953a753382672ddcd93cfef613af93d8cf6854d482`.
- Ten-minute simulated load: 288,000 inputs, 96,000 snapshots, 56,591 events, 605,907,058
  snapshot bytes, maximum tick 4.55 ms, receipt
  `sha256:cf8634b84192bec6889f4c14716f99c48c742cb07796ea30cc68687673681653`.
- The rebuilt 29-file output manifest aggregate is
  `sha256:2109966de0997a1d495c392ca52de56e03622951a1fd14b31c309c44b022e447`.

This is local source/build/replay/load and rendered-prototype evidence only. Named Cloudflare
Tunnel/public-edge acceptance, public-edge fault testing, production anti-cheat/privacy operations,
deployment evidence, and an external retained-artifact rollback remain open. The FPS prototype is
not competitive-play ready.

## 2026-08-07 — FPS retained-artifact rollback verifier

Added `scripts/fps-retained-rollback-drill.ts` and the `test:fps:retained-rollback` package command.
The drill copies a closed SQLite journal into a separate temporary retained-artifact directory,
records a manifest with file size and SHA-256 checksums, rejects a deliberate byte tamper, restores
the original artifact, verifies the checkpoint's public event chain and replay, compares the
restored public snapshot, and accepts a post-restore input. The receipt is checked not to contain the
seed or ticket.

- `pnpm test:fps:retained-rollback`: passed; receipt digest
  `sha256:70903cf237d7d7edd8d174b982cb5592cd00cf9a3d36222e96b4fc3691f7e811`.
- Isolated test-bus run `1786117592983-95318-312b0bb3`: 574 tests passed across 47 files.
- `pnpm typecheck`, Prettier, and focused ESLint for the new script passed.

This is local retained-artifact integrity evidence only. External immutable retention, release
provenance, operator rollback, named-edge/public-edge acceptance, and production anti-cheat/privacy
operations remain open; the FPS prototype is not competitive-play ready.

## 2026-08-07 — FPS kicked-player abuse handling

Added owner-authorized kick handling across the authoritative match, service, protocol, HTTP route,
browser event summary, replay verification, and diagnostics. A kick is a permanent spectator
transition with cleared input/respawn state and a chained `player_kicked` public event. The service
requires the owner ticket, revokes the target session in SQLite, closes an attached target socket with
`4003`, publishes the public snapshot, and counts the operation without exposing private data.
Repeated kicks are idempotent and self-kicks are rejected.

- The isolated bus run `1786118311405-98858-f4759354` passes 577 tests across 47 files.
- `pnpm test:fps:abuse` covers the kick path and passes with receipt digest
  `sha256:b729f425e76533951c6493aa9b71f1740bee65642b2e811d0d12571b4222c607`.
- Typecheck, formatting, focused lint, and package builds pass.

This is local abuse-control evidence only. Named-edge/public-edge acceptance, production
anti-cheat/privacy operations, deployment evidence, and external retained-artifact rollback remain
open; the FPS prototype is not competitive-play ready.

## 2026-08-07 — FPS accessibility controls

Added the local FPS accessibility surface in `apps/web/src/fps/accessibility.ts` and the Slayer
panel. Preferences are validated before use and saved automatically in device-local storage. The
panel now supports reduced motion, high-contrast HUD, color-safe reticle cues, interface scale,
event captions, and W/A/S/D or arrow-key movement remapping. Reduced motion reaches the renderer
through refs so it disables remote interpolation and camera smoothing without changing authoritative
movement or network input semantics.

- Focused accessibility and reduced-motion renderer coverage adds 4 tests.
- Isolated test-bus run `1786119700610-6414-3f22579b` passes 581 tests across 47 files.
- `pnpm typecheck`, `pnpm format:check`, focused FPS ESLint, and `pnpm build` pass.
- The fresh 29-artifact build manifest aggregate is
  `sha256:64fb78ced69fdbe1c13e5a8a02b26a1dc242cd73ef09f154b452889aa7be6da7`.

This closes a local accessibility requirement only. Named-edge/public-edge acceptance, public-edge
fault testing, production anti-cheat/privacy operations, deployment evidence, and external retained-
artifact rollback remain open; the FPS prototype is not competitive-play ready.

## 2026-08-07 — FPS local observability diagnostics

The FPS service now records privacy-safe server-boundary input telemetry: mean client-timestamp age,
mean absolute transit-age change, and monotonic input-sequence gaps per WebSocket connection. The
field names deliberately avoid claiming RTT or true packet loss. Existing phase, tick, snapshot,
persistence, combat, rejection, and resync counters remain unchanged.

The browser now owns a render-only `FpsTransportTelemetry` collector. It records measured ping RTT and
jitter, observed server envelope sequence gaps, resync requests, and authoritative prediction
correction distance. The HUD and canvas data attributes expose these diagnostics for local acceptance;
they never affect movement, combat, scoring, persistence, or replay. Reduced motion is now passed to
the remote-avatar renderer, so its presentation interpolation is disabled in the actual scene path.

- Focused service, telemetry, accessibility, and remote-renderer tests: 21 passed.
- Full `pnpm test`: 584 tests passed across 50 files.
- `pnpm typecheck`, focused FPS ESLint, `pnpm format:check`, and `pnpm build` pass.
- Full repository lint still reports exactly 86 unrelated visual-table/movement diagnostics.
- Browser re-acceptance was not rerun in this continuation because opening another browser is not
  authorized for this worktree.

This is local observability and presentation evidence only. Named Cloudflare Tunnel/public-edge
acceptance, public-edge packet-loss and clock-skew testing, production anti-cheat/privacy operations,
deployment evidence, and external retained-artifact rollback remain open; the FPS prototype is not
competitive-play ready.

## 2026-08-07 — FPS diagnostics protocol boundary and browser-gate preparation

The redacted FPS diagnostics route now parses a strict `fpsDiagnosticsSchema` before returning its
match identity, public roster, hashes, and privacy-safe metrics. The schema rejects unknown fields
such as tickets and rejects non-finite timestamp-age values while permitting a finite negative age
when a client clock is ahead of the server. This keeps operational telemetry outside authoritative
state and prevents an accidental debug-field leak at the HTTP boundary.

The local Playwright spec now checks the rendered transport data attributes and exercises the
reduced-motion, high-contrast, color-safe, interface-scale, and caption preferences. Those browser
assertions were added for the next authorized rendered run; they were not executed in this
continuation. The final rebuilt 29-file artifact manifest aggregate is
`sha256:65760e9a97af6f8d4c71bd9d216bc487419b287d4586d2ca3b4c40da02620868`. The prototype remains
local-only and not competitive-play ready.

## 2026-08-07 — FPS authority-level rules validation

The FPS authority now validates `scoreTarget`, `durationTicks`, and `snapshotRate` when a
`FpsMatch` is constructed, not only at the HTTP room-creation boundary. This keeps restored,
server-internal, and test-created matches inside the same versioned rules contract. Snapshot rates
must be safe integer divisors of the 60 Hz simulation; score targets remain bounded to 1–100 and
durations must be positive safe integers.

- Added regression coverage for invalid score target, duration, and snapshot-rate overrides.
- The centralized test bus run `1786122728149-20120-1d38962b` passes 586 tests across 50 files.
- `pnpm typecheck`, `pnpm format:check`, focused FPS ESLint, `git diff --check`, and staged diff
  checks pass.
- `pnpm build` passes; the rebuilt 29-file artifact manifest aggregate is
  `sha256:3452938f102b217702684fa69e0c06d8e49bc3f9cef79b25154a6d49494ab9a6`.

This strengthens local authority validation only. Browser re-acceptance, named-edge/public-edge
testing, production anti-cheat/privacy operations, deployment evidence, and external rollback
remain open; the FPS prototype remains not competitive-play ready.

## 2026-08-07 — FPS WebSocket ticket transport

Moved FPS browser ticket authentication out of the URL query. `FpsSlayerApp` now keeps only the
player ID in `/ws/fps/:matchId` and offers `["fps.v1", ticket]` as WebSocket subprotocols. The
Fastify route requires the stable protocol plus exactly one credential token, rejects a `ticket`
query parameter, and uses the WebSocket server protocol selector to echo only `fps.v1`, never the
credential. The pre-existing mahjong `/ws/games/:gameId` ticket flow was not changed.

- Centralized test-bus run `1786124498081-17627-cb90e422`: 587 tests passed across 50 files.
- `pnpm typecheck` and targeted Prettier pass.
- `pnpm build` passes with 29 output files; the sorted, newline-terminated artifact manifest
  aggregate is `sha256:9bbf0f92c1241102e0df46b531ced28213012b768eaf8287981f45c8d1efe093`.
- The regression opens a real ephemeral TCP WebSocket with Node's native client. It covers negotiated
  subprotocol credentials, query-ticket rejection, strict token extraction, protocol selection, and
  the real service upgrade counter.
- The existing Playwright two-client flow now records the FPS WebSocket URL and asserts that it has
  only `playerId` in the query and does not contain the ticket. Browser execution remains unauthorized
  in this continuation.

The subprotocol header remains sensitive and must be redacted by edge/proxy logging. Named-edge,
public-edge, production privacy review, deployment, and external rollback gates remain open; the
FPS prototype is not competitive-play ready.

## 2026-08-07 — FPS cancellation idempotency

Made the authoritative `cancelMatch()` transition idempotent so repeated failure handling cannot
append duplicate cancellation terminal events. Added a regression that compares the event stream
before and after a second cancellation. The centralized test bus passes 588 tests across 50 files;
browser, named-edge/public-edge, production anti-cheat/privacy, deployment, and external rollback
evidence remain open.

## 2026-08-07 — FPS authoritative input audit receipts

Extended internal `FpsInputReceipt` records with controller provenance and authoritative application
results: fixed-step tick, position, and velocity. Unapplied and rejected commands retain explicit
null application values. The focused regression and package build pass; the centralized test bus
passes 589 tests across 50 files. These fields remain checkpoint-only and are not exposed through
public snapshots or diagnostics.

### FPS stale-input lifecycle boundary — 2026-08-07

- `FpsMatch` clears pending input, previous button edges, and transient action state on disconnect,
  death, spectator expiry, and respawn. A command from an earlier connection or life cannot replay a
  held fire/movement edge before a fresh authenticated input arrives.
- Added a deterministic regression covering a held victim fire command through death and respawn.
- Centralized test-bus run `1786126248058-25991-fb42ab87` passes 590 tests across 50 files.
- Targeted Prettier and `git diff --check` pass; `pnpm typecheck` and the full `pnpm build` pass.
- Repository-wide formatting remains blocked by 19 unrelated procedural-world files, and full
  lint reports 88 unrelated visual-table/movement/procedural-world diagnostics. Browser/public-edge
  acceptance remains separate and unauthorized in this worktree.

### FPS checkpoint rules and identity validation — 2026-08-07

- `FpsMatch.fromCheckpoint` now compares the complete canonical rules object reconstructed from the
  stored arena and bounded overrides. Tampered rules, map, weapon-set, or other rules identity
  fields fail closed with `fps_checkpoint_rules_hash_mismatch` before persisted state is admitted.
- Added parameterized regression coverage for `rulesHash`, `mapHash`, and `weaponSetHash` tampering.
- Centralized test-bus run `1786126608702-29029-a7cae5b3` passes 593 tests across 50 files.
- FPS package build, full `pnpm build`, `pnpm typecheck`, focused FPS ESLint, Prettier, and diff
  checks pass. Browser/public-edge acceptance remains separate and unauthorized.

### FPS authoritative input contract revalidation — 2026-08-07

- `FpsMatch.submitInput()` now independently validates protocol version, exact button-object shape,
  selected weapon ID, and action-nonce type. Malformed direct/internal calls fail with
  `invalid_input` before changing authoritative state.
- Added regression coverage for unsupported protocol, unknown weapon, and malformed buttons.
- Centralized test-bus run `1786127017184-33177-8957a103` passes 594 tests across 50 files.
- FPS package build, `pnpm typecheck`, focused FPS ESLint, Prettier, and diff checks pass.

### FPS checkpoint state-integrity digest — 2026-08-07

- Added a canonical `checkpointHash` over every exported FPS checkpoint field except the digest.
  `FpsMatch.fromCheckpoint` verifies the event chain, rules identity, and persisted-state digest
  before admitting player state, receipts, or lifecycle fields.
- Replaced the non-serializable initial `-Infinity` fire tick with a finite sentinel so checkpoint
  JSON preserves cooldown state and remains canonical.
- A regression that changes a persisted player score while leaving the event chain untouched now
  fails closed with `fps_checkpoint_state_hash_mismatch`.
- The FPS and persistence checkpoint tests pass after rebuilding `@hk-mahjong/fps`; shared test-bus
  run `1786128077361-43130-79af07f3` passes 595 tests across 50 files.
- The local rollback drill restores the hashed checkpoint and accepts continued input. Receipt digest:
  `sha256:3e209c08e2cc0851a694808b548f320a11060c91ca9bce2e38c2946b23814b7e`; receipt file SHA-256:
  `sha256:d9055eaa778eb98a5f80d80598183d33698e2f3c157699e7e863cdcf3ebe73c9`. Browser/public-edge
  acceptance and production operations remain separate gates.

### FPS total authoritative input-boundary validation — 2026-08-07

- `FpsMatch.submitInput()` now rejects non-object, array, incomplete, and extra-field direct commands
  before malformed data can be dereferenced or stored. Only the exact validated contract is copied
  into pending state; rejected receipts normalize missing sequence and acknowledgement fields to
  private `-1` sentinels, preserving canonical checkpoint export.
- Added regression coverage for `null`, arrays, incomplete commands, and an extra-field command,
  including checkpoint export after rejection. Focused FPS/persistence tests, typecheck, focused
  lint, formatting, and diff checks pass. Browser/public-edge and production operations remain
  separate gates.

### FPS final local validation after total authoritative input-boundary hardening — 2026-08-07

- The server-owned test bus passes 596 tests across 50 files and 146 suites, including the malformed
  command and checkpoint state-hash regressions.
- `pnpm typecheck`, focused FPS ESLint, targeted Prettier, `git diff --check`, and `pnpm build` pass.
  The 29-file artifact manifest aggregate is
  `sha256:a2a4c59af15c7d27ad15876e90861e264ffe39dfcd449721f11770d7cf8c1895`.
- Refreshed local receipts pass: abuse `sha256:b729f425e76533951c6493aa9b71f1740bee65642b2e811d0d12571b4222c607`,
  network `sha256:d6d711644678a498d0ea5815e0ae835564f9a3717e76c915c35992841d40bcdd`, rollback
  `sha256:3e209c08e2cc0851a694808b548f320a11060c91ca9bce2e38c2946b23814b7e`, and retained rollback
  `sha256:522d62aff381b1daaf07a8cf23e321fd54da821c523237b882b393be8d5d17cb`.
- Full repository lint remains blocked by 86 unrelated diagnostics and full formatting by 19
  unrelated procedural-world files. Browser, public-edge, deployment, production anti-cheat/
  privacy, and external rollback gates remain open.

### FPS monotonic fixed-step scheduler — 2026-08-07

- Replaced one-timer-callback/one-tick scheduling in `FpsMatchService` with a server-owned
  monotonic elapsed-time accumulator. Delayed callbacks catch up only to the configured fixed
  tick and are bounded to eight ticks; negative or non-finite samples reset the accumulator.
- Added a focused fake-clock regression for three-tick catch-up and impossible-delta clamping.
- The refreshed server-owned test bus passes 597 tests across 50 files and 146 suites. Typecheck,
  focused FPS ESLint, targeted Prettier, `git diff --check`, and `pnpm build` pass. The 29-file
  artifact manifest aggregate is `sha256:6e411bd79c59856f945918e646f2c1925a1d0b23b74e3b077b351311412ed1c9`.
- Full repository lint/format, browser re-acceptance, named-edge/public-edge, production
  anti-cheat/privacy, deployment, and external rollback gates remain open; readiness stays
  **not ready for competitive play**.
