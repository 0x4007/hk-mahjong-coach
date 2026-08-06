# Architecture and implementation log

## 2026-08-02 — Repository initialization

- The repository was empty, so the existing `main` checkout is the canonical implementation lane.
- The runtime baseline is Node 24 LTS and pnpm 11.
- TypeScript 6.0 is pinned because the current `typescript-eslint` peer range excludes TypeScript 7.
- `better-sqlite3` is selected for stable synchronous transactions and mature Node 24 support.
- Workspace packages follow the dependency direction in `spec.md`; the root TypeScript path map is
  for development and tests, while package production exports point to built ESM artifacts.
- The server binds to `127.0.0.1`; the browser and API share one production origin.
- Compact tile codes are explicit, case-sensitive project display aliases; semantic IDs remain
  authoritative because MPS notation is not universal across mahjong variants.
- The canonical hash format is `sha256:<lowercase hex>`. Ruleset hashes cover validated,
  bonus-resolved, deeply frozen data and include `scoringEvaluatorVersion`.
- `rulesets/ruleset.schema.json` is generated from the runtime Zod schema by
  `pnpm rulesets:generate`; the generator materializes complete alternate profiles and applies the
  repository's formatting rules.

## 2026-08-02 — Versioned Hong Kong rules assumptions

- Seat bonus mapping is East/South/West/North → Plum/Orchid/Chrysanthemum/Bamboo and
  Spring/Summer/Autumn/Winter.
- The Hong Kong mahjong reading for 筒 is stored as Jyutping `tung4`.
- Four Concealed Pungs requires four concealed pungs, no declared kong, and self-draw.
- Nine Gates uses the strict pure nine-sided predecessor and permits no declared meld or kong.
- Thirteen Orphans does not require a thirteen-sided wait.
- Jade/Ruby/Pearl Dragon require three matching-suit pungs or kongs, the matching Dragon pung or
  kong, and a matching-suit pair; chows do not qualify.
- Heavenly Hand permits initial bonus replacements but no opening kong.
- Earthly Hand means a non-dealer win on East's first discard after initial replacements and before
  any kong or other call.
- Limit aggregation caps once while listing all matched limit features and suppresses lower-value
  composition rules.
- In `hk_modern_13f_v1`, unlisted former limit patterns are explicitly stored as 10 faan; only the
  four patterns named as 13/limit in `spec.md` use the 13-faan cap. There is no runtime inheritance.

## 2026-08-02 — Event, scoring, and payment boundaries

- Commands emit immutable authoritative events; reducers validate persisted facts and never invoke
  the scorer or payment settlement during replay.
- Claim windows persist each eligible player's complete scoring assessment. This preserves
  first-discard, last-tile, kong-robbery, bonus-replacement, and opening-kong provenance even after
  later state fields change.
- Legal actions contain only scoring previews. Terminal authoritative events contain full scoring
  and payments; public projection uses an explicit allowlist, converts the winning physical ID to a
  tile type, and removes evaluator evidence.
- Every scoring decomposition is evaluated. Selection prefers legal over illegal, then capped faan,
  raw faan, and canonical decomposition order.
- `stackingGroup` is metadata unless a rule explicitly references it. True limits are only rules
  whose configured value is `limit`; multiple true limits are listed while the cap is aggregated
  once.
- Dealer multipliers are applied once. Co-winners are excluded from payer sets, arithmetic is
  checked as safe integers, and every persisted settlement is exactly zero-sum.

## 2026-08-03 — Observation-only analysis and bot simulation

- The public analysis package exposes observation-derived analyzers and result types, not raw
  physical-tile entry points. Low-level distance, path, and visibility helpers remain package
  internals for focused tests and composition inside the official analyzer.
- Bot construction accepts a resolved ruleset rather than an injected analyzer. The bot package
  creates the official analyzer itself, preventing a composition root from supplying an analyzer
  that closes over authoritative state. Static import restrictions and type tests keep normal
  analysis/bot sources on `@hk-mahjong/core/public`.
- Relative-risk language remains comparative. The heuristic combines visible copies, exposed suit
  and honor direction, publicly established faan, the order of recent public discards, fresh late
  honors/middle tiles, and wall count; prior discards never become a guaranteed-safety claim.
- Adaptive difficulty chooses a fixed ordinary strength from evidence and locks that choice to one
  hand. Only a `hand_ended` or `match_ended` observation may release the lock. Product persistence
  and mode wiring remain part of Milestone 8.
- Basic bot discard ordering keeps distance primary, then uses the already computed
  personality-weighted candidate score. This preserves the basic difficulty boundary while allowing
  fast, value, and balanced policies to diverge deterministically on equal-distance decisions.
- The fast simulation uses normal `BotPolicy` decisions throughout. To remain a practical 500-hand
  gate, it mixes three full seeded shuffled-wall hands (one for each bundled ruleset) with a seeded
  terminal regression wall where South has a thirteen-sided Thirteen Orphans wait and East has no
  initial win. The terminal wall never selects a bot action; it shuffles its unused tail with the
  injected RNG, and every policy must still rank an emitted action. The receipt identifies the wall
  profiles separately so the short corpus cannot be mistaken for 500 natural-length hands.
- Each simulated one-wind match is capped at 32 hands, each hand at 1,024 accepted commands, and the
  runner fails on rejection, conservation error, crash, bound excess, or replay mismatch. The full
  10,000-hand and broader release evidence remain Milestone 10 gates.
- The extended natural-wall gate is prepared in `.github/workflows/natural-simulation.yml` as a
  manual `workflow_dispatch`. It partitions the requested corpus across up to 20 deterministic
  shards, runs unchanged normal policies with `natural_shuffle` walls, uploads redacted shard
  receipts, and verifies one aggregate digest. A one-hand local shard/aggregate smoke passed with
  aggregate digest
  `sha256:fbb7aa9f24c57aa9143a783ef731352df382db7610386c59b7589bd3ae30ad8c`.
  The interrupted local natural run is not 500-hand acceptance evidence; the first accepted
  500-hand receipt must come from the remote workflow after the implementation commit is pushed.

## 2026-08-03 — Canonical takeover and Milestone 4 reconciliation

- The canonical continuation lane is
  `.codex-worktrees/implementation-takeover-019fc5b7-g06506cba54` on branch
  `implementation-takeover-019fc5b7-g06506cba54`, based at
  `b3d5946ce9d69efebd361433f00b988ea658a600`.
- The pre-existing dirty `main` checkout and `natural-simulation-ci-g6bdbe4486d` worktree remain
  preserved. Canonical integrated the natural lane's workflow plus its shard/common/aggregate
  helpers. It rejected two unrelated `matchIndexOffset` runner variants because that workflow does
  not consume them and no focused test covers them.
- On the corrected canonical candidate, `pnpm test` passes 274 tests. `pnpm test:sim:fast` completes
  500 hands with zero illegal actions, invariant failures, crashes, command-bound failures, or
  replay mismatches. Its receipt digest is
  `sha256:1073e8769314772f57d8880e11fa710d2889730d7f1eff8db0fedebc79533352`,
  and its hand digest root is
  `sha256:219b345c5c8795d1668f7dc975e03cb26c1cc1e7674c7d9fa67bf188eaa7b284`.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm smoke` also pass.

## 2026-08-03 — Procedural Three.js visual table base

- The isolated `visual-table-gb9d082b587` worktree adds the first visible browser slice for the future
  table milestone. `apps/web/src/scene/mahjong-table.ts` owns the scene graph, camera presets, lights,
  tile meshes, local canvas textures, public discard rivers, and the Midtown window backdrop; the React
  wrapper only mounts and disposes it.
- The scene uses Three.js `0.185.1` directly with Vite. `RoundedBoxGeometry`, `OrbitControls`, local
  `CanvasTexture` generation, `InstancedMesh`, and landmark `LOD` are the main rendering helpers. No
  downloaded model, HDRI, or tile art is bundled. Poly Haven and ambientCG remain possible future
  sources for clearly licensed wood, felt, or window materials, but they are not part of this prototype.
- The static composition follows the supplied visual contract: a bright, double-height penthouse shell
  with broad architectural whites, charcoal recesses, a restrained red floor direction line, pale cyan
  system seams, floor-to-ceiling glazing, and depth-compressed Midtown geometry. The shipping seat view
  starts as a fixed 45° composition, then supports click-to-lock first-person look and movement so the
  preview remains usable; the overhead view and advanced visual panel remain behind `?debug=1`, while normal mode
  now includes a persistent video quality selector for adaptive/high/medium/low.
- The play space uses a larger 17.2 m × 13.4 m shell and matching first-person bounds, preserving the
  4.5–5.5 m double-height feel while giving the player more room around the table.
- Tile bodies are warm ivory with crisp local face artwork; backs use an original charcoal, red, and cyan
  line treatment. Playing-field, shell, center, and seam surfaces are offset by explicit depth layers so
  they do not flicker from coplanar WebGL faces.
- The visual direction is original architectural futurism informed by the supplied Mirror's Edge-style
  principles: pale monolithic planes, dark voids, hard white daylight, and sparse red/cyan signals. No
  game assets, logos, or textures are copied from that title.
- The WebGL mount coalesces resize observations and ignores unchanged canvas dimensions, which avoids
  a resize-notification loop while the view is mounted. Shadows use the current `PCFShadowMap` API.
- The interactive seat view uses familiar first-person conventions: click-to-capture pointer lock,
  unrestricted vertical mouse look, WASD/arrow movement through the penthouse, an Escape unlock, and
  touch look/movement on mobile. Debug mode adds the orbit-controlled overhead lens and visual panel. The
  shipping loop keeps the composed initial camera while its gaze focus follows the visible center-ray surface;
  a tight five-ray neighborhood lets a nearby visible tile win when the reticule falls into a narrow gap,
  without jumping through an opaque object. Accommodation eases toward near focus in roughly 0.4 seconds
  and relaxes toward far focus in roughly 0.65 seconds, so the effect reads as eye focus rather than a
  cinematic snap. Lateral sprint direction changes add a restrained roll kick to suggest shifting weight,
  while movement speed drives a small damped vertical viewport bob that settles when the player stops. The HUD
  reticule follows the same damped first-person roll and head-bob offsets as the camera, so rapid left/right weight
  shifts visibly lag in the aim marker while the focus ray remains anchored to the configured reticule position. The
  The outer ring follows that motion inverted at -1x; the center dot is tuned to a 5x total displacement without changing
  the camera transform. The current experiment multiplies the underlying camera weight-shift targets by 2x; the
  reticule still reads the raw shared camera output.
- First-person movement uses the Apache-2.0 `@dimforge/rapier3d-compat` runtime for a kinematic character
  controller. The first collision slice supplies simplified static colliders for the world floor and table body;
  render meshes remain visual-only, and tile/furniture dynamics are intentionally not inferred from every mesh.
  Rapier loads asynchronously from its inlined WASM; the same coarse fallback controller is active from the first
  frame and remains available if initialization fails, while Rapier replaces it when ready. The scene marks
  `data-physics-ready="fallback"` during that window, so ledge/vault assistance and wall hanging do not silently
  disappear in a restricted or slow browser.
- Collision coverage now expands beyond the table: the environment, generated room fixtures, glass, walls,
  furniture, and gateway are converted from meaningful render meshes into coarse world-space AABB colliders.
  Streamed city buildings, props, and skybridges contribute explicit rotated boxes as chunks enter the 3×3
  lookahead window; Rapier replaces that streamed collider set when new chunks are appended. These boxes are
  solid while props are upright and are replaced by dynamic bodies when a knockable prop is hit, while floors and
  decorative strips stay out of the blocking set. This keeps collision cheap without making every tile or triangle
  a physics body. Appended chunks remain resident for the life of the scene, so returning to a neighborhood does
  not change its collision layout.
- When airborne and moving into a nearby top edge, first-person movement checks ledge grab first, then low vault. A
  valid target is kept on the supported surface, biased a short distance forward, and the controller eases the camera
  and capsule over a brief climb arc rather than snapping dead-center. Ledge grabs retain their collision gate; low
  vaults can be checked on the first upward jump-edge frame as well as while descending, so Rapier does not have to
  report a separate contact first.
- Tall walls use a separate traversal state. When horizontal movement is blocked by a real contact, a wall must be
  above the refined ledge-height window relative to the player's current feet, overlap the player's lateral reach,
  and be within 0.5 m of the capsule front.
  Wall-hang detection runs only after both ledge and low-vault checks have rejected the contact.
  The capsule is placed 0.27 m outside the approached face (radius plus separation), remains attached with gravity
  suppressed, and climbs when forward or Space is pressed. The wall target scan includes streamed static boxes but
  excludes knocked dynamic props, and wall entry requires the same airborne gate as other parkour traversal so low
  vault/ledge movement is not reclassified as a wall hang. The `?debug=1` climbing-gym preset places the player near
  its tall wall; hold W and press Space while approaching to catch the upper face, release movement to hang, then
  hold W or press Space to climb.
- During local development, the visual scene stores a validated v1 snapshot in room-scoped
  `sessionStorage`. HMR disposal, page hide, and tab unload flush the latest camera position/orientation,
  seat/overhead view, crouch state, FOV, and debug orbit target; the next scene mount restores it. This
  is presentation state only and never includes authoritative game state or concealed tile data. Snapshots
  below the fall threshold or outside the world bounds are rejected. If the live camera or Rapier character
  drops into an unrecoverable position, the scene clears movement state, returns to the seat spawn, and
  writes the safe snapshot before the next HMR reload.
- The debug panel's best-effort `/__codex/visual-debug-state` endpoint persists only an explicit debug-UI
  change. The panel keeps the latest dirty tuning payload in memory and sends it once with `keepalive` on
  `pagehide`; its 500 ms live telemetry refresh never writes the artifact. The Vite middleware also skips
  unchanged scene payloads, so normal rendering cannot create a self-triggered HMR/write loop.
- Normal development mode reads that endpoint before constructing the 3D scene. This avoids a fresh-origin
  default-fog frame on a tunnel and keeps debug mode as the write path; the read is cache-busted, no-store,
  and bounded so a stalled tunnel still falls back to the normal scene.
- The debug lens uses a 90° standing FOV and transitions to 68° when Shift toggles a seated 1.45 eye height.
  Seated movement is half speed with slight momentum; Space keeps the same quick airtime while doubling the
  jump apex. Double-tapping any WASD or arrow movement key engages a 3× sprint that remains active while any
  movement key is held, so W→A/D/S direction transfers preserve sprint speed.
- Pointer-lock state fades the instructional overlays while the scene is under direct control.
- The scene resolves an explicit `high`/`medium`/`low` presentation preset or uses conservative device
  memory/core signals for `adaptive`. Adaptive selects medium unless the browser reports at least 8 GB and
  8 logical cores, keeping DPR, shadows, and post-processing bounded on unknown or software-WebGL devices;
  high remains an explicit debug choice. Bokeh is on by default only in high and can be toggled in debug;
  GTAO remains an explicit reduced-resolution opt-in. Focus follows the nearest non-overlay gaze surface,
  with a stable far fallback and a tight tile-neighborhood assist. The pass uses a restrained 17 mm eye
  approximation with a 1 arcminute central acuity threshold: bright rooms settle near a 2.5 mm pupil,
  ordinary indoor light near 4 mm, and dark rooms expand toward 6.5 mm. That pupil drives the aperture and
  hyperfocal distance, so close tiles and near camera-child geometry can soften while the room and skyline stay
  legible. The renderer currently keeps the stock normalized Bokeh depth response; the physical per-sample eye
  circle-of-confusion experiment is checkpointed but paused after visual review. Shader readiness
  uses a cancellable first-render task without forcing a synchronous compile that can block software WebGL;
  the composer ends with `OutputPass`, rendering pauses while the document is hidden, and setup shows a
  warm loading treatment. The debug panel reports focus distance, target kind, pupil size, and current blur
  intensity for visual tuning, with a 0–25× DoF-intensity slider; the defaults are 12.5× outside zoom and 25× during
  explicit ADS, while the slider remains available for stronger cinematic bokeh experiments. The practical blur
  envelope uses a smooth eased focus envelope for the debug telemetry.
- Four restrained player stations and a static, text-safe AI-teacher display now complete the room fixture;
  cyan system and skyline window materials modulate only with a subtle ambient pulse.
- The skyline adds a local PMREM room environment, six depth-compressed near-rooftop masses, and a visible
  separated draw tile in the static human hand; no external assets or hidden opponent identities are introduced.
- Touch first-person controls, motion look, and the virtual joystick remain available in the interactive
  mobile preview. The surface asks iPhone users to rotate to landscape while preserving the fixed initial
  table composition.
- Development mode accepts `?debug=1` and adds a visual panel for the table/room/skyline/asset camera
  presets, adaptive/high/medium/low quality mode, Bokeh/GTAO, physical/simple glass, motion feel, FOV,
  exposure, tone mapper, fog density, skyline visibility, lighting, DPR, and live renderer metrics. The
  quality selector applies its DPR, shadow, post-effect, glass, ambient-animation, and skyline-LOD defaults
  immediately; each individual control can then be overridden without remounting the app. In production, only the
  adaptive/high/medium/low quality selector remains visible for users; this value is persisted in local storage so
  reloads reuse the same video preset. Repeated skyline
  windows are batched with `InstancedMesh`, and the Empire State, One Vanderbilt, and Chrysler silhouettes
  use distance-based `LOD` fallbacks. Every scene debug control is persisted in validated v1 `localStorage`,
  including the all-skyline and per-layer visibility switches. The panel's expanded/collapsed disclosure state
  is persisted separately in the same local storage so HMR and page reloads keep the chosen layout;
  `Reset debug defaults` restores the device-appropriate scene defaults and rewrites those preferences.
- The development map is divided into three independent ground-level play areas: the penthouse at the origin, the
  looking focus room 60 m east, and the climbing gym 60 m west. Each area is marked as a 50 m x 50 m square with a
  10 m open gap to its neighbor. Generated city buildings, props, windows, bridges, and beacons are rejected from
  all three footprints, so the authored rooms remain visually and physically separate.
- The `Focus calibration` debug preset now opens the looking focus room on the shared ground plane. The hallway still
  marks each metre from `0` through `2H` and places the close, halfway, hyperfocal, and double-hyperfocal targets,
  but the former elevated deck/ramp is no longer part of the navigation path.
- The `Climbing gym` debug preset opens the west play area, where an expanded obstacle course now layers
  compact ledges, support columns, and varying-height cross-beams for repeatable Mirror's Edge-style movement and
  edge-grab tuning without sharing collision space with the penthouse or focus room.
- The debug panel header is an accessible disclosure control. It opens by default on desktop and starts
  collapsed for coarse-pointer/mobile devices, preserving a compact scene view; expanding it reveals the
  same scrollable controls without changing their runtime state.
- The cyan gateway opens a seeded city beyond the penthouse. City blocks derive their zone palette, buildings,
  windows, skybridges, beacons, props, and orthogonal paths from `roomSeed + chunkX + chunkZ`; the same seed
  therefore recreates the same walkable neighborhoods without storing a world-sized map. The first 3×3 lookahead
  window is generated immediately, which lets the generated city appear through the penthouse glazing when the
  static skyline layers are hidden. Boundary chunks clip shared ground and paths around the penthouse footprint
  and reject any building, window, bridge, prop, or beacon that would enter it, so city geometry cannot draw
  through the room. Exploration then appends newly encountered chunks to the resident map; it never unloads or
  regenerates a prior coordinate. Base geometry/materials remain shared and repeated forms use `InstancedMesh`,
  keeping the append-only world bounded by the explicit play-space limits. The streamed areas are South courtyard,
  West tea garden, East practice court, and North skybridge; the debug HUD reports the active area and loaded count.
- The FPS play space uses five 100 m chunks from the origin in each direction, for a 1,000 m × 1,000 m navigable
  world. The procedural backdrop doubles the per-chunk feature density for buildings, props, signs, and utility
  posts, and weapon pickups use the same full-world bounds. Existing authored-area, world-bound, and focus-ramp
  exclusion checks still guard every generated placement.
- For a repeatable local screenshot checkpoint, start the preview with `pnpm dev`, create the output
  directory, then run:

  ```bash
  mkdir -p artifacts/visual
  pnpm exec playwright screenshot --browser=chromium --ignore-https-errors --viewport-size="1440,900" --wait-for-timeout=2000 "https://127.0.0.1:5173/?debug=1" artifacts/visual/penthouse-1440.png
  ```

- The Vite development server and Fastify server bind to `0.0.0.0` so a phone on the same LAN can
  open the preview. Run `pnpm dev`, then use the host Mac's LAN address on port `5173` (for example,
  `https://192.168.x.x:5173`). The Vite preview creates a local self-signed certificate in the ignored
  `.data/dev-cert/` directory on first start; accept that certificate in the phone browser before
  requesting motion permission. The Fastify API remains an HTTP-only local proxy target behind Vite.
- The browser shell is a viewport-owned scene rather than a document card. It uses `100dvh` with
  minimal overlay controls so the table remains the primary surface on desktop and mobile.
- Rendered-browser acceptance used headed Chromium at 1440×900 and a touch-capable viewport. The page
  exposed `data-scene-ready="true"` and `data-physics-ready="true"`; the joystick moved from Penthouse
  through South courtyard, East practice court, and North skybridge while the debug HUD grew beyond the initial
  9 chunks instead of evicting them. A reload preserved the hidden skyline/debug settings, and reset returned
  the defaults. The connected in-app browser's local-page policy was unavailable during this run, and headless
  Chromium can stall on its software WebGL/GPU path; no browser security control was bypassed.
- This is a rendering base, not Milestone 7 completion. It has no live WebSocket/game observation,
  legal-action controls, or replay-backed game persistence yet; the session snapshot above only keeps
  the local presentation transform seamless during development. The browser must continue to consume
  public observations when those surfaces are wired in; opponent hands must remain face-down until an
  engine event makes a tile public.
- The generated penthouse is authored in `apps/web/src/scene/maps/penthouse.json`, not in browser state.
  The version-1 document has `floor: { width, depth, rotationDegrees }` plus a complete `entities` array.
  Each entity has a stable lowercase `id`, one of `planter`, `divider`, `wallPanel`, `lightBar`, or
  `sculpture`, a metre-space `position: [x, y, z]`, optional Y `rotationDegrees`, and optional `scale`.
  The array is authoritative: omitting an entity removes it. Runtime validation rejects bad bounds and
  duplicate IDs before rendering, so a coding agent can edit the level directly without naming Three.js
  objects.

## Reticule-anchored ADS zoom

The seat camera keeps a smooth FOV transition: 90° in hip fire (standing or crouched) and 45° while
explicit ADS is active. Crouching still lowers the eye height, but it does not enter aim mode.
Because the on-screen reticule is intentionally at 60% viewport height, the scene applies a matching
off-axis `PerspectiveCamera` view offset as the FOV changes. The world point under the reticule remains
in place during the zoom instead of shifting around the viewport center. The projection helper and its
Three.js ray-preservation regression are covered by `apps/web/src/scene/mahjong-table.test.ts`.

## Wall hang and climb

The movement CLI (`pnpm test:movement:sim`) models wall traversal after ledge and vault checks. A wall is
eligible only when the player is airborne, its approached axis-aligned face is in front of the capsule, within
0.5 m of the capsule front surface, laterally overlapped, above the ordinary ledge threshold, and no more than
0.6 m above the capsule top. A thin platform underside may be just inside that same hand window; swept contact is
snapped back to the near face instead of letting a jump pass through the edge. Wall entry is also gated by an
airborne jump traversal state, so a ground-level run into any wall remains a normal collision; a five-metre wall is
rejected when its top is outside hand reach.
The returned centre is outside the face by the 0.26 m capsule radius plus a 0.01 m separation, so the hang does
not embed the player in the collider. The helper scans all boxes and chooses the closest valid candidate.

The simulator retains the wall face, outward normal, and top height while hanging. Gravity and ordinary movement
are suppressed. Forward or jump starts a climb that first raises the capsule until its bottom clears the wall top,
then moves onto a collision-free top target. It becomes grounded only after that target has support. Samples emit
`wallHang` only on the entry frame and expose `hanging`, `climbing`, and `traversalState` for later frames. JSON
mode writes only the summary to stdout; the current Rapier package warning is emitted on stderr.

The same traversal state is active in the live first-person browser controller. Open the `Climbing gym`
debug preset from `?debug=1`; it starts on clear ground facing a dedicated tall training wall. Click the scene to
capture pointer lock, hold `W`, and press `Space` while approaching so the jump reaches the wall's upper face (or
use the touch joystick and Jump action). The capsule attaches to the near face without gravity, remains hanging
while forward is released, and starts a staged climb when forward is pressed again or `Space`/the mobile Jump
action is used. A ground-level collision with the base of a wall does not attach, even when its top is within the
height window; the player must be airborne and near the top. A brief
settle beat prevents the approach input from making the hang invisible; holding forward continues into the climb
after that beat.
Backward input releases the hang. The climb lifts above the obstacle before crossing onto its top and asks Rapier
for the final supported position instead of marking the player grounded in midair.

## Centralized camera motion and landing weight

First-person presentation motion lives in `apps/web/src/scene/camera-motion.ts`. The scene sends one
input frame to that damper after physics resolves the base camera position. Lateral weight shift, gait
bob, jump lift, and landing response are combined into one vertical/roll output, and the reticule uses
the same output for aim feedback.

Jump lift is driven by the launch velocity. Landing dip is driven by the instantaneous downward velocity
and the support-stop acceleration (`velocity / frame delta`), so a building fall produces a deeper response
than a normal jump and a harder stop at the same velocity dips further. The spring is capped to keep the
camera readable; Rapier or the deterministic fallback remains authoritative for the player position.
Focused coverage is in `apps/web/src/scene/camera-motion.test.ts`.

## Oxygen vital and breathing response

The visual-table player vitals model exposes a 100-point Breath / O₂ Reserve in
`apps/web/src/scene/player-vitals.ts`. This is a gameplay reserve, not literal blood-oxygen saturation.
Standing idle restores 12 points per second, walking restores 8, and crouched stationary recovery restores 10. Sprinting drains 3.33 points per second (about 30 seconds from full); crouch walking drains 1.67
(about 60 seconds). Each jump and each transition from crouch to standing costs 5 points, so roughly 20
consecutive jumps empty the reserve.

Sprint recovery waits 1.5 seconds, crouch-walk recovery waits 0.5 seconds, and jump recovery waits 0.25
seconds. The delay is stored in the pure state and recovery is integrated for the exact portion of a frame
after it expires. The browser publishes the rounded reserve as `data-player-o2` and renders it as a third
HUD bar.

O₂ is an action reserve. A jump and a stand-up transition each require the full 5-point cost; if the reserve
cannot pay it, the action is rejected. Crouching has no entry cost. Sprinting is allowed only when the current
frame's drain is affordable. When it is not (including at 0%), the controller falls back to a neutral jog rather
than stopping movement. The neutral blend is derived from the configured walking recovery (+8/s) and sprint drain
(-3.33/s): `8 / (8 + 3.33) = 70.6%` of the walk-to-sprint interval, or about `80.4%` of full sprint speed. At
that speed, movement keeps O₂ at a 0-point-per-second delta (subject to the existing recovery delay after sprinting).
Hold-breath activation similarly requires one affordable 1/60-second drain slice, then drains continuously and
stops when the reserve reaches zero.

The physical left Command key (`MetaLeft`) is the temporary desktop hold-breath input. It also aims, drains
15 points per second, stops automatically at zero, and locks until the reserve is above 25 points. Right
mouse toggles ADS and does not hold breath. While left Command is held, the scene cancels
page-level keyboard defaults for every key event that reaches the page, so ordinary Command-modified keys
are treated as game input; browser-reserved shortcuts such as macOS Command+W may still close the tab before
JavaScript receives an event. While the hold is active and O₂ remains above zero, the shared camera damper
keeps the reticle and weapon aim centred and pauses the stationary breathing bob. Releasing the hold or
reaching zero restores the normal reserve-driven response. The continuous response in
`apps/web/src/scene/o2-stability.ts` maps the current reserve to reticle sway and weapon viewmodel sway
without threshold states outside explicit hold-breath or wall-brace stabilisation. Camera breathing grows
smoothly as the reserve falls, including while stationary.

Pressing Jump while crouched automatically returns the player to standing when the jump is accepted. The
automatic posture change is part of the jump action, so it keeps the existing single 5-point jump cost; an
O₂-insufficient jump is rejected and leaves the crouch state unchanged. The returned jump posture also keeps
the mobile Crouch button's pressed state aligned with the scene controller.

When the first-person capsule is touching the side of any active physics box,
aiming down sights receives the same reticle, weapon, and stationary-breathing
stabilisation as holding breath, but the wall brace does not change or drain the
player's O₂ state. The contact probe uses the controller capsule gap, supports
yaw-rotated boxes, ignores floors and sloped surfaces, and publishes the
data-player-wall-contact and data-player-wall-braced attributes for local diagnostics.
Focused coverage is in
`apps/web/src/scene/player-vitals.test.ts`, `apps/web/src/scene/o2-stability.test.ts`,
`apps/web/src/scene/camera-motion.test.ts`, and `apps/web/src/scene/weapons.test.ts`.
The geometry-specific brace coverage is in apps/web/src/scene/wall-contact.test.ts.

## Commands

```bash
corepack enable
pnpm install
pnpm verify
pnpm dev
pnpm build
pnpm start
```

`pnpm dev` starts the Fastify and Vite development processes directly. It does not run the serial
workspace package build first; Vite resolves the browser package sources for development, while
`pnpm build` retains the complete package build for production artifacts.

After a visual-table coding agent finishes a feature or a batch of scene edits, run `pnpm hmr` from
the repository root with `pnpm dev` still running. Ordinary file changes do not reload the connected
browser. The command writes an ignored, worktree-local request marker and touches the scene HMR boundary
for one explicit scene remount. If the batch also changed another source module, the explicit trigger sends
a full browser reload so all edited modules are fetched. The marker keeps the workflow independent of Vite's
port and is consumed only by the watching Vite server with an active HMR client, so a second disconnected preview
cannot steal the request; the development session snapshot restores the current presentation position. Pass a quoted test note,
for example `pnpm hmr "Check the new wall-hang exit"`, to show the instruction in the development UI after
the remount or reload. The note is a CLI argument carried by the one-shot HMR event, not a user-edited file.
Running `pnpm hmr` without a note clears the previous note. This is a development convenience, not browser
acceptance proof.

## Material deviations

- The visual-table scene now uses a shared procedural material detail channel. Neutral surfaces receive
  low-amplitude roughness and bump variation with sparse linear grain, while the penthouse floor, generated
  room panels, and focus ramp use a clearcoat physical epoxy response with a slate anchor color. Neutral
  architecture is separated into warm/cool white, pale structural gray, and charcoal families so the scene
  stays bright without flattening into gray. AgX filmic mapping, a warm directional key, cool cyan fill,
  restrained lavender rim, and a blue/lavender haze establish the cinematic daylight baseline; the existing
  bokeh/focus pass is unchanged. Adaptive exposure targets the high-key daylight baseline without clipping
  the lacquer or tile whites. The same defaults are passed into tiles, furniture, skyline masses, and streamed-
  city batches so new generated geometry inherits the architectural-futurist language without assets.
- Red/cyan wayfinding remains deliberately emissive and comparatively clean; the detail channel is used
  for response variation rather than decorative noise on the scene's command accents.
- The visual-table sky now uses a warm apricot background and matching haze so the daylight palette agrees
  with the warm sun key. A larger additive glow and opaque core make the sun readable through the north glazing;
  the reference materials bypass scene fog and tone mapping, and the mirrored elevation is kept inside the
  seat-camera sky band without changing physical light placement.
- The presentation palette now follows a white Mirror's Edge direction: near-white sky and architecture, pale
  cyan glass, light structural gray, and restrained charcoal framing keep the existing red/cyan wayfinding legible.

## Penthouse level pass

The visual penthouse occupies the complete 50 m x 50 m development play space. Its room shell is five metres high, the north side is a continuous floor-to-ceiling window wall, and the table stays centered in a larger inset. Perimeter furniture and map-authored accents are intentionally sparse so the table and skyline remain the focal points. The authored map floor is 48 m x 48 m to leave a clean structural margin inside the shell.

## Known limitations

## Player health and shields

The visual-table prototype now has a deterministic two-layer player vitals loop. A 100-point energy
shield absorbs incoming damage first. Any overflow reduces the 100-point health pool; health stays lost
until the scene is reset. After 3.5 seconds without a non-zero hit, the shield refills at 35 points per
second. The pure model lives in `apps/web/src/scene/player-vitals.ts` and is covered by focused Vitest
regressions.

The scene applies damage from collision delta-v rather than raw travel speed. A wall impact compares the
requested horizontal velocity with the velocity Rapier resolves after contact; penetration correction cannot
create more delta-v than the player carried into the wall. Sprint speed (10.2 m/s, about 36.7 km/h) and below
is always harmless. Above that limit, a kinetic-energy-shaped km/h curve scales damage, reaching 200 damage
at an approximate 200 km/h human terminal velocity. Landing damage uses the same curve on the downward
velocity lost at impact, so a ledge fall whose downward speed stays at sprint speed or below does no damage.
In development (`?debug=1`),
the Visual debug panel has `Simulate 25 damage` and `Reset vitals` controls so the recharge
loop can be checked without arranging a traversal impact. The HUD exposes shield and health bars,
recharge status, and the scene renderer carries rounded `data-player-health` and `data-player-shield`
values for local smoke inspection. This is a visual-table prototype surface, not yet authoritative
match combat or persistence state.

## Procedural weapons prototype

The visual-table scene now includes a seeded pickup and shooting loop in `apps/web/src/scene/weapons.ts`.
Each normalized room seed produces one starter pistol in the penthouse and a deterministic outdoor spread
of pistol, shotgun, machine gun, and sniper pickups. The penthouse also stages one visible pickup of each type
around the mahjong table; the remaining outdoor placements accept reserved play-area rectangles and coarse
physics obstacles, so seeded pickups do not appear inside authored rooms or city blockers.

The browser mount owns the presentation combat state: walking through 3.5 m of a pickup auto-equips the nearest
gun, and E equips the nearest pickup while stopped; number keys or Q switch
owned weapons, 0 holsters the current weapon, R reloads, and mouse click fires while pointer lock is active. Mobile users have Fire,
Equip, and Reload actions. Held weapons include a procedural right forearm, palm, and thumb. All four procedural gun
models use a shared near-black finish across their bodies, barrels, sights, and accent details. Each weapon has a
distinct firing profile. The pistol, machine gun, and sniper fire on the live reticule ray with no random
projectile cone; only the shotgun keeps an inherent seeded pellet spread. Tracer lines, impact sparks, floating pickup labels,
recoil, ammo, reload state, and a four-slot HUD make the loop visible. Shot raycasts stay on authored
scene roots rather than traversing the streamed city, and malformed render subtrees fall back to a miss.
The held model follows the seat-view state separately from the firing-control state, so it remains visible
in the right hand before pointer lock is acquired.
The camera is part of the rendered scene graph so its attached view-model meshes are included in the render.
The live reticule presentation function feeds both the CSS sway and the weapon's aim NDC; the weapon is lowered
on Y and continuously rotates toward the moving reticule dot. Reloading uses one generic snappy pose for every
weapon: the muzzle pitches skyward, pauses for a small clip-change nudge, then returns to the reticule.
The shared camera-motion damper also owns the held viewmodel posture: standing uses a right-hand hip-fire offset,
crouching uses an intermediate raised offset, and explicit ADS smoothly centres and raises the weapon fully onto
the optical axis using the original crouched sight height, preserving existing ironsight and sniper-scope alignment.
The weapon continues to aim and fire through the same reticule ray. A double-tap movement sprint clears the persistent
right-mouse ADS toggle before acceleration begins.
Each procedural weapon now carries its own top-rail sight profile: an open two-ear rear notch, a forward post, and
a small black bead make the sight picture readable when crouched and zoomed. Those meshes are camera children
and inherit the same reticule aim quaternion, so the sights do not introduce a second or divergent firing direction.
The receivers now stay low and the sight rails are split to leave a clear center channel. The pistol's rear detail and
machine gun's former full-width top accent sit off-axis, so neither covers the centered reticule.
The sniper now adds a real camera-child scope tube, rings, tinted glass disk, and lens anchor. While the sniper is
equipped and explicit ADS is active, `SniperScopeLensShader` runs after Bokeh and samples a clean world-only render
texture inside the projected glass. A hidden secondary camera aims through the live reticule with a true 5× tighter
FOV and renders only a square 2×-supersampled lens target, so bullet-hole decals receive fresh geometry pixels instead
of a stretched viewport crop. Floating sprites and weapon/UI overlays are excluded while the bullet-hole root remains
visible. Catmull–Rom bicubic reconstruction, a feathered circular mask, restrained glass colour split, and diagonal
cyan X marks keep the optic legible, then `OutputPass` performs normal tone mapping.
Right-mouse ADS remains independent from left-Command hold-breath. Because the mask is projected from the actual scope anchor after
viewmodel transforms, it follows sway, recoil, reload, and reticule-relative aim while the weapon ray remains authoritative.
The scope tube is open-ended at the rear and the glass sits just ahead of its rim; this avoids a capped-cylinder face
covering the lens with a black panel.
The optic assembly is authored at a 0.11979078 m local Y height over the rifle sight axis, so its projected glass centre stays
on the reticle while the shared crouch and ADS viewmodel transforms remain centralized.
Render hits attach a typed `lastWeaponHit` record to the struck object for local experimentation; this is
not an authoritative enemy, damage, replay, or multiplayer system.

Shot recoil is part of the centralized first-person damper. Each fire event passes the weapon's per-projectile
damage and the current visible centre-dot displacement from its resting position into the damper. The damper draws
that vector as a line from the resting dot to the live dot, normalizes it, and nudges the aim farther along the same
direction; there is no fixed centered or upward kick. The outer reticule ring is the 100-point reference radius. The
base 100-damage impulse carries the aim 25% beyond that radius; the current shared 2× shot-jerk tuning carries the
sniper 250% beyond the centre. Pistol, shotgun, and machine-gun impulses use the same distance algorithm scaled by
their 28/16/12 damage values. That output is applied to the camera matrix, the
reticule's CSS/NDC position, and the camera-child held weapon, so movement, breathing, posture, and prior recoil all
participate in the next shot's live direction. The kick is an immediate displacement into a shared under-damped
second-order response: the spring pulls it back through the rest point and produces the opposite-side overshoot. The
response never reads weapon type, fire interval, or magazine state. A rapid weapon simply submits impulses before the
previous response settles, while a slow weapon naturally gets a clean recovery; future weapons use the same path without
new cadence branches. Only the existing per-projectile damage scale changes the kick size. The shotgun uses 16 damage
per pellet rather than multiplying the visual kick by its eight-pellet count. Ordinary guns do not add a second random
projectile offset; the shotgun is the only weapon with an inherent fixed pellet cone. Every pellet cone is centered on
the current live reticule ray; O₂ does not widen or tighten it. O₂-driven sway still moves the reticule and therefore
moves the cone's center.
During sprint movement, the reticle centre dot fades out and fades back in when sprinting stops. The outer circle is
kept visible as the persistent movement/aim reference.
During a reload, the browser shell fades only the centre reticle dot to zero opacity from the authoritative weapon
snapshot; the outer circle remains visible and the dot returns when the reload finishes without changing the shared
aim ray or camera motion.
The browser shell also listens for the keyboard Caps Lock modifier: the centre dot is visible only while Caps Lock is
on, while the outer circle remains visible regardless of the lock state. Sprint and reload still hide the same dot.

Focused coverage lives in `apps/web/src/scene/weapons.test.ts`, `apps/web/src/scene/reticle-aim.test.ts`, and
`apps/web/src/scene/sniper-scope.test.ts`.
The tests cover the four profiles, separated front/rear iron-sight anchors, same-seed placement stability, seed
variation, reserved-area exclusion, rotated-obstacle clearance, normalized reload pose timing, damage-scaled recoil,
the signed reticle-following camera impulse, the shared moving-dot NDC projection, and the centralized crouch
viewmodel posture. The current local evidence is the focused recoil/weapon/reticle Vitest set (34 tests), strict
typecheck, Prettier, production web build, `git diff --check`, and one explicit `pnpm hmr` request. The broader
scene suite reached 100/101 tests; its remaining swept wall-hang failure is in the pre-existing dirty traversal
lane. Full-repository ESLint remains blocked by shared dirty-lane violations, mostly from concurrent scene/vitals/
camera work. Browser pickup and firing interaction remains unverified; no new browser session was opened for this run.

- Milestones 0–4 are complete. Milestone 5 is in progress; Milestones 6–10 remain pending.
- Persistence, protocol, coach, and tile UI package slices exist but have not yet been accepted as
  complete milestones or wired through the placeholder CLI, server, and browser clients.
- The persistence slice still needs deletion/privacy, recovery/export, migration, restart/resume,
  and coverage repairs before Milestone 5 can close.

## HUD placement

The visual-table overlay keeps the scene summary and shield/health/O₂ bars along the top of the viewport. The weapon
loadout and ammunition readout stays in the lower-right corner, including on narrow touch layouts, so the lower-left
and centre remain available for movement controls and the scene.

When pointer lock is released, the instruction footer occupies the bottom stack above the weapon panel. The gun status
therefore remains visible in the lower-right without covering the paused movement instructions; mobile layouts keep the
panel above the touch controls instead.

## Weapon switch presentation

Selecting a different owned weapon, collecting a pickup, or walking over a pickup uses one first-person transition.
The camera-motion damper first rotates the outgoing weapon muzzle-down and lowers it below the viewport. It then starts
the incoming weapon at that same bottom-of-screen pose and rotates it up into the shared reticle aim. If the player has
no weapon yet, the new weapon starts directly in the raise phase. The outgoing model remains visible until the lower
phase finishes, and the incoming model remains visible until the raise phase settles. Fire and reload inputs are ignored
while this short presentation transition is active; the authoritative weapon state and reticle ray do not change.

The number-row `0` key explicitly holsters the current weapon. It clears the active weapon and HUD ammunition while
leaving collected weapons in the inventory, and uses the same lower transition as a weapon switch without raising a
replacement model.

## Shot tracers and bullet holes

Every seeded shot now renders a visible tracer streak with a small tracer head for 140 ms. A hit also renders the
existing short impact spark and adds a dark, surface-oriented bullet-hole decal. The decal follows the struck triangle's
world normal, is offset from the surface to avoid flicker, uses a depth-disabled presentation layer for readability,
and remains part of the normal Bokeh pass.

Bullet holes have a five-minute lifetime. They stay opaque until the final 12 seconds, fade to zero, and then remove
themselves with their geometry and materials. The runtime retains at most 256 holes; the oldest mark is removed first
if sustained automatic fire reaches that bound. The effect timing and fade curve are pure helpers in
`apps/web/src/scene/weapons.ts`, with focused regressions in `apps/web/src/scene/weapons.test.ts`.

The decal normal path also handles rotated `THREE.InstancedMesh` surfaces, including the visible tile walls. Label
sprites are excluded from shot raycasts so a hit attaches to the room surface behind the label rather than an invisible
text plane. The decal is deliberately large enough to read at normal room distances, with a dark centre and contrasting
rim. The raycaster is camera-aware and resolves the current scene roots per shot, so labels do not emit Three.js sprite
warnings and newly streamed surfaces remain hittable. The weapon snapshot exposes `shotsHit` and `bulletHoleCount`; the
React HUD mirrors those counts as data attributes for local visual diagnostics.

## Centralized unit-test bus

Starting the Fastify server starts `apps/server/src/test-bus.ts`. The bus owns one advisory lock per worktree and
runs `vitest run --reporter=json` immediately. Every five minutes it checks `git rev-parse HEAD`, porcelain dirty
state, a streamed `git diff HEAD` hash, and the contents of untracked files. If the commit hash and content-aware
dirty fingerprint match the last completed pass, the scheduler skips Vitest for that tick, so an unchanged checkout
does not retain another full suite or its per-test snapshots. A changed commit, staged/unstaged content, or untracked
file content triggers the next pass. If Git inspection fails, the bus runs Vitest and records the inspection error.
If another server process starts in the same worktree, it observes the lock and does not launch a second runner.
The scheduler also skips a tick while a previous run is still active, so a slow suite cannot overlap itself.

The ignored `.data/test-bus/` directory contains a root `manifest.json` and immutable run directories:

```text
.data/test-bus/
  manifest.json
  latest-run.txt
  runs/<run-id>/
    manifest.json
    vitest.json
    stdout.log
    stderr.log
    tests/<test-file-and-full-name>-<hash>.json
```

The root manifest is written last. Agents should read it first, then use each `results[].path` entry to open the
exact per-assertion file. A result includes the full test name, source file, status, duration, location, tags, and
failure messages. The manifest also records the run status (`passed`, `failed`, `error`, or `aborted`), timestamps,
exit signal/code, the repository state checked before the run, any Git inspection error, and the aggregate Vitest
summary. A snapshot is evidence for the checked source state; it does not replace a focused test for a change made
afterward.

Agents must wait for a completed bus snapshot for all test validation. A missing manifest, a `finishedAt` older than
the relevant source change, or a `running` status means the agent should wait for the server-owned bus rather than
launching `pnpm test`, `vitest`, or a focused test command. Typecheck, lint, build, and browser checks remain separate
commands and are not included in the bus.

The server bus runs unit tests only. Coverage, simulation, build, lint, typecheck, browser, and HMR checks remain
explicit commands and are not silently run by the scheduler.

## Physical near-field eye depth of field (experiment branch)

The experimental DoF path uses a thin-lens circle-of-confusion calculation for every depth-buffer sample. It keeps
the existing reticule gaze distance and adaptive pupil, then applies the reciprocal object-distance term so any held
viewmodel geometry becomes increasingly soft as it approaches the camera. Geometry near the focus plane remains
sharp, and the viewmodel is excluded only from choosing the gaze target; it still participates in the normal depth
pass. Camera FOV and the existing global posture-strength slider normalize the same response for every object, with
no weapon-name or ADS-specific branch. The screen mapping is intentionally conservative because the stock pass
gathers 41 samples and the sniper compositor can magnify the result; this keeps the distant world readable while a
viewmodel close to the eye still receives continuous blur.

This branch is rebased on the latest source checkpoint and intentionally re-enables the physical shader for isolated
calibration. The source branch keeps the zoom-only intensity rule: 12.5× outside explicit ADS and 25× while aiming,
covering both iron sights and the sniper scope; crouching alone does not increase blur. The physical experiment remains
separate from that state decision and uses the same centralized depth response for every renderable object.
