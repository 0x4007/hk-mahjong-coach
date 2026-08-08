# Architecture and implementation log

## 2026-08-08 — Opaque-blinking Warehouse rack indicators

Warehouse server racks now use eight larger boxed status bars around all four vertical faces of each rack. Bars are split
across one steady and three room-seeded blink groups, so a visible bar is available from any aisle direction. Four shared
additive alpha overlays provide a halo, while the bar bases stay opaque and opt out of map fog. This replaces the tiny
single-face pixel planes that were too easy to lose against the black room.

## 2026-08-08 — Warehouse aisle fog

The Warehouse now uses a fixed, map-local `THREE.Fog` haze: dark blue-grey `0x07131c`, starting at 10 m and reaching full
fade at 92 m. This preserves the black background and makes the long crate aisles recede without changing the authored
Penthouse. The old persisted debug fog field remains a compatibility value and cannot tune or disable the Warehouse haze.

## 2026-08-08 — Baked central Warehouse floor pool

The platform keeps its black-room presentation but now carries a small deterministic `warehouse-floor-area-bake-v1-center`
lightmap. It adds only a subdued warm pool around the central spotlight footprint; outside that pool the floor remains near
black. Its diffuse material base is exact black, so the lightmap cannot brighten the floor; the separate emissive LEDs and
spotlight pool remain visible. The platform uses world-aligned `uv1`/`uv2`, a `MeshBasicMaterial` lightmap, and no dynamic
shadow receiver work, while the spotlight remains available for crates and other moving geometry.

## 2026-08-08 — Dim lower-band Warehouse wall bake

The wall bake is now deliberately low and local. `warehouse-wall-area-bake-v2-dim-bottom` fades the centre and perimeter
contributions toward the floor and clamps them to exact black above 4.25 m, including the wall top faces. Emergency wall
fixtures remain emissive red meshes; their baked contribution is only a soft nearby lower-wall halo.

## 2026-08-08 — Warehouse rack pixel LEDs

Warehouse server racks now cover each front face with an 8-by-7 grid of tiny square ice-blue pixels instead of flat
horizontal light bars. The grid stays deterministic, and the existing steady/blinking instanced groups still provide
asynchronous activity without allocating one light per rack. Each pixel's steady/blinking membership and phase-group
assignment are randomized from the room seed, so the face is not a fixed checkerboard while replaying the same seed
still reproduces the same pattern. Rack bodies, LED meshes, and the supported pile physics remain unchanged.

## 2026-08-08 — Baked Warehouse wall area lighting

The Warehouse perimeter walls now use a deterministic static bake instead of dynamic material lighting. Four generated
`DataTexture` lightmaps encode a dark industrial base with a warm centre pool, yellow perimeter spill, and soft red
emergency-fixture tint. Each wall has world-aligned `uv1` coordinates (and an explicit `uv2` alias for diagnostics) and a
`MeshBasicMaterial` with `lightMap`, so the renderer does not evaluate the central spotlight or dynamic shadow receiver for
those surfaces. The central unshadowed spotlight still lights crates and other dynamic geometry. The bake is tagged
`warehouse-wall-area-bake-v1`, returned in the map resource texture list, and disposed with the Warehouse scene.

## 2026-08-08 — Ice-blue data-center rack experiment

The Warehouse presentation now experiments with a data-center look while keeping the supported pile physics unchanged.
Each generated crate plan renders as a dark server-rack cabinet with an 8-by-7 front pixel grid. The dots are split
using a room-seeded random assignment across steady and three phase-offset blinking instanced meshes, so the room has
asynchronous cold-blue activity without allocating one light per server. Rack bodies and LED meshes are
presentation-only and remain ignored by weapon raycasts. The map reports `Ice-blue data center` as its local variant and
uses the `warehouse-data-center-v1` presentation marker.

## 2026-08-08 — Yellow perimeter LED line

The Warehouse now uses one shared instanced mesh for yellow rectangular LEDs around the complete inset perimeter. The line
covers all four edges and corners with yellow-only emissive material, remains at floor height, and creates no runtime area,
point, or shadow light. The central unshadowed spotlight remains the only real Warehouse light.

## 2026-08-08 — Warehouse floor LEDs without runtime area lights

The warehouse keeps its visible colored LED markers but no longer creates the four corner `RectAreaLight` probes or the
sixteen emergency `PointLight` objects. The central spotlight remains unshadowed and supplies the single real warehouse
light. The former 64 hanging bulbs are now shared flat emissive rectangles on the floor in deterministic corner runs, and
the twelve center-lane markers use the same flat floor-LED treatment in red. This keeps the LED appearance while reducing
runtime light allocations; the visible meshes remain presentation-only and ignored by weapon raycasts.

## 2026-08-08 — Warehouse emergency lighting and shadow-map removal

Warehouse lighting no longer allocates a spotlight shadow map. The central spotlight still supplies the warm pool and its
visible shaft, but it is explicitly unshadowed. Four red emergency wall fixtures and twelve red centre-lane markers are
emissive meshes only; they use the deterministic `emergency-fixtures-v2-no-runtime-lights` and `floor-led-lanes-v2`
layouts and add no point, area, or shadow-map work. Their soft wall tint is included in the baked wall lightmaps.

## 2026-08-08 — Warehouse Christmas corner lighting

Warehouse retains deterministic rectangular emissive LED meshes around the floor perimeter and in the two centre lanes.
They replace the earlier corner bulbs, `RectAreaLight` probes, and emergency `PointLight` objects, so the map has one real
unshadowed central spotlight and no runtime area or point lights.

## 2026-08-08 — Warehouse tool roster

The warehouse melee pickups now use a warehouse-specific tool and safety roster: crowbar, steel pipe, fire extinguisher,
pipe wrench, hammer, screwdriver, fireman axe, and box cutter. The eight deterministic perimeter spawns keep their
existing pickup, ragdoll, drop, and shared melee-hit behavior while removing the out-of-place baseball bat, shovel, and
generic steel bar labels.

Each pickup now uses a matching procedural silhouette instead of the old one-size rounded stick: the pipe is cylindrical,
the extinguisher has a wider body and neck, the hammer and fireman axe have broad heads, the crowbar and pipe wrench have
angled jaws, and the screwdriver and box cutter have compact handles with narrow blades. The same geometry is cloned into
the held viewmodel, and physics half-extents are derived from its actual bounds.

## 2026-08-08 — Three-dimensional Warehouse piles

Warehouse crate generation now builds irregular but stable piles instead of upright single-file towers. Each seed-derived
bay chooses a one- to three-crate footprint, jitters the whole pile origin, and lets upper layers use only occupied support
cells below them. Three enclosed crate yards are generated as deterministic perimeter walls before the ordinary piles,
creating blocked-off areas and alternate routes while the centre spawn lane stays open. Crates keep a fixed ground-parallel
orientation with deterministic yaw-only rotation; horizontal and vertical centre pitches leave clear space between
neighbouring crates, so no boxes intersect or float. The rendered instanced cube and its matching Rapier `PhysicsBox`
share the same centre, half-extents, and rotation. The generation marker is `warehouse-boxes-v5`.

## 2026-08-08 — Directional wall cover

Cover is now a directional stance rather than a proximity-only assist. A wall is a valid cover source only when the
horizontal camera direction falls inside its 90° facing cone (45° to either side of the wall-facing direction). The
nearest wall query filters by that cone before choosing a source, so zooming while parallel to a wall or with the back
to it leaves cover disabled. Turning an engaged stance outside the cone clears it before movement projection or snap;
raw wall contact remains the independent physical collision and wall-braced aim signal, but does not by itself engage
cover or its wall snap.

## 2026-08-08 — Bullet stopping power and projectile-driven ragdolls

The visual combat path resolves `stoppingPowerPerBullet` directly from projectile damage: `damage × 0.065 m/s`, capped
at `8 m/s`. This is a per-projectile value, so every shotgun pellet submits its own force. A hit on the local simulant
adds that velocity along the bullet's horizontal travel direction and pauses its charge for a short damage-scaled
stagger. The marker exposes the live `simulantStoppingPower` and `simulantStaggerSeconds` values for diagnostics.

The streamed exploration world's knockable props use the same value. The first bullet activates their existing ragdoll;
subsequent bullets add linear and angular impulses through the active Rapier or fallback physics runtime. This keeps
single bullets, automatic fire, and all shotgun pellets on one visible impact path rather than making props a melee-only
exception. The armory chart and active loadout line display the per-bullet stopping-power value.

## 2026-08-08 — Halo 3 / ODST-inspired HUD layout

The first-person scene now uses a minimal top rail for the live tactical HUD. O₂/energy is the top bar, followed by
shield and health; all three are full-width dark-grey tracks with no visible labels or percentage text. The
loadout/ammunition rail remains wider and anchored to the lower-right edge. The UI is otherwise monochromatic, with flat
HUD surfaces and no gradients; the vitals alone use a high-contrast Halo-style blue accent. The upper-left contains only the
map and video-quality selectors; debug controls are offset below that area and no longer move player vitals.

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
  without jumping through an opaque object. At the reference pupil, accommodation eases toward near focus in roughly
  0.8 seconds and relaxes toward far focus in roughly 0.65 seconds. Dark adaptation modestly slows both responses to
  about 1.1 and 0.8 seconds at the fully dilated pupil, approximating the loss of contrast and increased aberration
  without changing the hyperfocal or Bokeh model. The effect reads as eye focus rather than a cinematic snap. Physics-resolved
  local acceleration drives the restrained pitch and roll response that suggests
  shifting weight, while movement speed drives a small damped vertical viewport bob that settles when the player stops.
  The HUD reticule follows the same damped first-person acceleration and head-bob offsets as the camera, so the aim
  marker and held viewmodel stay on the one presentation path while the focus ray remains anchored to the configured
  reticule position. The outer ring follows that motion at 5x; the center dot is tuned to a 5x total displacement without changing
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
- When airborne and moving into a nearby top edge, first-person movement uses one shared local-box vault resolver. The
  legacy ledge-grab transition is disabled; vaulting owns tops from 0.15 m through 2.0 m above the approach feet for
  authored and generated boxes alike. A valid target is kept on the supported surface, biased a short distance
  forward, and the controller eases the camera and capsule over a continuous climb-over arc rather than snapping
  dead-center. Duration maps from 0.04 s at leg height (0.45 m) to 1.0 s at 2.0 m, with the arc height using the same
  height mapping. Vaults can be checked on the first upward jump-edge frame as well as while descending, so Rapier
  does not have to report a separate contact first.
- Tall walls use a separate traversal state. When horizontal movement is blocked by a real contact, a wall must be
  above the refined ledge-height window relative to the player's current feet, overlap the player's lateral reach,
  and be within 0.5 m of the capsule front. The resolver tests the approached face in each box's local horizontal
  frame, so streamed rotated backdrop buildings use the same face and top that Rapier uses. Wall-hang detection runs
  only after both ledge and low-vault checks have rejected the contact.
  The capsule is placed 0.27 m outside the approached face (radius plus separation), remains attached with gravity
  suppressed, and climbs when forward or Space is pressed. The top target keeps the tangent coordinate where the
  player caught the wall; it does not slide to a skinny wall's centre. The wall target scan includes streamed static
  boxes but excludes knocked dynamic props, and wall entry requires the same airborne gate as other parkour traversal
  so low vault/ledge movement is not reclassified as a wall hang. The live climb uses the same short smooth arc,
  preserved momentum, and landing boost as vaulting, so the gun returns after the brief traversal instead of a long
  staged lift. The `?debug=1` climbing-gym preset places the player near its tall wall; hold W and press Space while
  approaching to catch the upper face, release movement to hang, then hold W or press Space to climb.
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
- The debug lens uses a 90° standing FOV and transitions to 68° when Shift toggles a seated 1.00 m eye height.
  Standing movement starts at the 1.5×-base trot (5.1 m/s, 18.36 km/h) and slowly regenerates O₂. Shift keeps the
  existing half-speed crouch movement and enables an internal walk-mode toggle; that toggle applies only after the
  player is upright, where WASD/arrow input uses the 1×-base walk speed (3.4 m/s). Sprint and an accepted jump
  (including the O₂-free mini hop) clear the hidden toggle, returning upright movement to the default run/trot mode.
  Space keeps the same quick airtime while doubling the jump apex. Double-tapping any WASD
  or arrow movement key
  engages the faster 3× sprint (10.2 m/s, 36.72 km/h) that remains active while any movement key is held, so W→A/D/S direction
  transfers preserve sprint speed. A sprint request from crouch first performs the normal stand transition; the stand
  still costs 5 O₂, and an unaffordable transition leaves the player crouched.
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
  legible. Warehouse uses its isolated pools and black background for eye adaptation even while display exposure
  compensates for the scene, so its dark-room pupil makes close focus visibly harder. The renderer currently keeps the
  stock normalized Bokeh depth response; the physical per-sample eye
  circle-of-confusion experiment is checkpointed but paused after visual review. Shader readiness
  uses a cancellable first-render task without forcing a synchronous compile that can block software WebGL;
  the composer ends with `OutputPass`, rendering pauses while the document is hidden, and setup shows a
  warm loading treatment. The debug panel reports focus distance, target kind, pupil size, and current blur
  intensity for visual tuning, with a 0–25× DoF-intensity slider; the defaults are 12.5× outside zoom and 25× during
  explicit zoom, while the slider remains available for stronger cinematic bokeh experiments. The practical blur
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
  exposure, tone mapper, skyline visibility, lighting, DPR, and live renderer metrics. Fog is intentionally
  absent from the panel; only Warehouse uses its fixed map-local haze. The
  quality selector applies its DPR, shadow, post-effect, glass, ambient-animation, and skyline-LOD defaults
  immediately; each individual control can then be overridden without remounting the app. In production, only the
  adaptive/high/medium/low quality selector remains visible for users; this value is persisted in local storage so
  reloads reuse the same video preset. Repeated skyline
  windows are batched with `InstancedMesh`, and the Empire State, One Vanderbilt, and Chrysler silhouettes
  use distance-based `LOD` fallbacks. Every scene debug control is persisted in validated v1 `localStorage`,
  including the all-skyline and per-layer visibility switches. The panel's expanded/collapsed disclosure state
  is persisted separately in the same local storage so HMR and page reloads keep the chosen layout;
  `Reset debug defaults` restores the device-appropriate scene defaults and rewrites those preferences.
- The debug panel's `Loaded areas` fieldset controls the Focus test zone, Mahjong penthouse, climbing gym,
  parametric barracks, and target range independently. Turning an area off rebuilds the scene without that
  authored root or its static colliders, so the area is unloaded rather than merely hidden. The selection is saved
  in visual-debug settings and restored on reload. Re-enable the checkbox to construct the area again; its camera
  quick action and preset remain disabled while it is unloaded.
- The checkpoint server also accepts the explicit `?debug=1` query for local inspection. In that mode the production
  bundle now reads and writes the same validated local visual-debug preferences, so `Loaded areas` selections persist
  across a refresh on the checkpoint port without enabling debug storage for ordinary production visitors.
- The development map is divided into three independent ground-level play areas: the penthouse at the origin, the
  looking focus room 60 m east, and the climbing gym 60 m west. Each area is marked as a 50 m x 50 m square with a
  10 m open gap to its neighbor. Generated city buildings, props, windows, bridges, and beacons are rejected from
  all three footprints, so the authored rooms remain visually and physically separate.
- The `Focus calibration` debug preset now opens the looking focus room on the shared ground plane. The hallway still
  marks each metre from `0` through `2H` and places the close, halfway, hyperfocal, and double-hyperfocal targets,
  but the former elevated deck/ramp is no longer part of the navigation path.
- The `Climbing gym` debug preset opens the west play area, which is intentionally reduced to one clear row of
  measured vault-test blocks. The former authored runs, holds, columns, rails, and hang wall are neither rendered nor
  collidable, so they cannot intersect or interrupt the block measurements.
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
- The FPS play space uses five 50 m chunks across each axis, for a compact 250 m × 250 m navigable world (±125 m from
  the origin). The procedural backdrop keeps its seeded per-chunk feature-density multiplier for buildings, props,
  signs, and utility posts, and weapon pickups use the same full-world bounds. The target range sits at the compact
  map's southern training pad so every authored area remains reachable. Existing authored-area, world-bound, and
  focus-ramp exclusion checks still guard every generated placement.
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

## Selectable maps

The browser map catalog lives in `apps/web/src/scene/map-catalog.ts`. `Debugging 01` (`debugging-01`) remains the
authored penthouse combat sandbox. `Warehouse` (`debugging-02`) is a separate industrial warehouse generated by
`apps/web/src/scene/debugging-two-map.ts`: irregular seed-derived piles of exact 1 m cubic crates arranged through
storage bays, enclosed crate yards, and open forklift aisles on the platform. Each supported pile plan is presented as a
dark server rack with a 4-by-4 grid of tiny ice-blue pixels in one opaque instanced mesh. A few room-seeded pixels use a
brighter ice-blue shade; there are no per-frame blinking groups. Rack meshes stay presentation-only and are ignored by weapon raycasts; their coarse supported physics remains in the pile
colliders. Each rack keeps exact 1 m placement, stays parallel to the ground, uses deterministic yaw-only rotation, and
follows a supported footprint with explicit horizontal and vertical clear pitches. It does not build the penthouse, focus room, climbing gym,
parametric campus, target range, gateway, or streamed exploration city. The warehouse keeps the existing rectangular
bounds and spawn points, and each rendered crate has a matching physics collider. Its isolated one-chunk melee
world adds eight deterministic, named props in the clear warehouse aisles and reuses the existing equip, drop, ragdoll,
melee-hit, and projectile-hit paths. Warehouse places one of each fixed weapon at equal intervals around an inset
rectangular perimeter; Debugging 01 retains the dense obstacle-aware square sampler. The warehouse uses eight warm
dark high-bay fixtures, one deterministic yellow rectangular LED line around the full perimeter, four red emergency wall
fixtures, twelve red center-lane floor LEDs, and one low central unshadowed spotlight. It creates no warehouse `RectAreaLight` or emergency `PointLight`
objects. The warehouse background is black so the explicit spotlight stays isolated. Its translucent shaft, floor pool,
and ground-truth ambient occlusion provide visible beam and ray-style crate contact cues without volumetric ray tracing.

Use the `Map` selector in the upper-left scene controls to switch maps. A change remounts the scene with the selected
map and updates the HUD. The choice is stored under `hk-mahjong-coach:visual-map:v1`; `?map=debugging-01` or
`?map=debugging-02` takes precedence on the first load. Invalid query values fall back to `Debugging 01`.

## Reticule-anchored zoom

The seat camera keeps a smooth FOV transition: 90° in hip fire (standing or crouched) and 45° while
explicit zoom is active. Crouching still lowers the eye height, but it does not enter zoom mode.
Because the on-screen reticule is intentionally at 60% viewport height, the scene applies a matching
off-axis `PerspectiveCamera` view offset as the FOV changes. The world point under the reticule remains
in place during the zoom instead of shifting around the viewport center. The projection helper and its
Three.js ray-preservation regression are covered by `apps/web/src/scene/mahjong-table.test.ts`.

## World scale

The first-person world uses the versioned `world-meters-v1` measurement contract: one Three.js/Rapier world unit is
exactly one metre. Player capsule dimensions, the 1.75 m standing eye height, the 1.00 m crouch eye height, autostep,
ground snap, jump speed, gravity, and collision tolerances come from `apps/web/src/scene/world-scale.ts`. Live Rapier,
fallback physics, the movement simulator, and the debug camera consume the same values. The seated mahjong table camera
is a presentation camera and is explicitly kept separate from the player's physical eye height.

## Wall hang and climb

The movement CLI (`pnpm test:movement:sim`) models wall traversal after the shared vault check. A wall is
eligible only when the player is airborne, its approached local face is in front of the capsule, within 0.5 m of the
capsule front surface, laterally overlapped, above the ordinary ledge threshold, and no more than
0.6 m above the capsule top. A thin platform underside may be just inside that same hand window; swept contact is
snapped back to the near face instead of letting a jump pass through the edge. Wall entry is also gated by an
airborne jump traversal state, so a ground-level run into any wall remains a normal collision; a five-metre wall is
rejected when its top is outside hand reach.
The returned centre is outside the face by the 0.26 m capsule radius plus a 0.01 m separation, so the hang does
not embed the player in the collider. The helper scans all boxes and chooses the closest valid candidate.

The simulator retains the wall face, outward normal, and top height while hanging. Gravity and ordinary movement
are suppressed. Forward or jump starts the same vault-style short climb arc used by the browser controller, keeping
the caught tangent coordinate and preserved momentum before a supported landing query. Samples emit `wallHang` only
on the entry frame and expose `hanging`, `climbing`, and `traversalState` for later frames. JSON mode writes only the
summary to stdout; the current Rapier package warning is emitted on stderr. The rotated-backdrop regression is
`pnpm test:movement:sim scripts/movement-scenarios/wall-hang-generated-rotated-test.json --json`.

The same traversal state is active in the live first-person browser controller. Open the `Climbing gym`
debug preset from `?debug=1`; it starts on clear ground facing the measured block row. Click the scene to capture
pointer lock, hold `W`, and press `Space` while approaching a selected block (or use the touch joystick and Jump
action). The capsule attaches to a valid airborne edge without gravity, remains hanging while forward is released,
and starts a vault-style climb when forward is pressed again or `Space`/the mobile Jump action is used. The row
includes blocks from 0.10 m through 5.00 m in 0.10 m increments, each with a height label. The gym uses a 1.75 m
standing-eye reference (separate from the elevated mahjong table camera), so the 2.00 m block is visibly above the
player's head; blocks above 2.00 m are high-obstacle stress tests beyond the current vault window. The CLI regression for
the full-height timing is
`pnpm test:movement:sim scripts/movement-scenarios/vault-2m-test.json --json`.
Backward input releases the hang. The climb follows the vault arc and asks Rapier for the final supported position
instead of marking the player grounded in midair.

## Centralized camera motion and landing weight

First-person presentation motion lives in `apps/web/src/scene/camera-motion.ts`. The scene sends one
input frame to that damper after physics resolves the base camera position. Lateral weight shift, three-axis
footfall-shaped gait bob, jump lift, and landing response are combined into one camera/viewmodel output. The reticule and
aim ray consume the same lateral, vertical, and acceleration-pitch response.

The running stride uses a smooth lateral sine with a parabolic vertical relationship, producing a U-shaped path
instead of a circular orbit. Breathing and jump/landing responses remain additive.

Gait intensity uses the normalized movement magnitude and speed ratio. The formula is
`magnitude × speedRatio × (1 + 0.6 × sprintBlend)`, where `sprintBlend` maps the walk ratio (1/3) to the
full sprint ratio (1). This keeps walk at 0.33×, raises trot to about 0.87×, and reaches 1.6× at sprint;
the existing 12/s damper returns that amplitude toward zero when movement stops. Crouching applies the existing
0.7 posture factor. Because this is a camera-motion input, the stronger sprint response reaches the camera,
held viewmodel, reticule, and aim ray together.

The gait phase is now measured from speed instead of a fixed oscillator. For the 1.85 m player at the 3.4 m/s
walk speed, the Alexander-style calculation uses a 0.9805 m hip height and produces a 2.376 m same-foot stride,
or a 1.188 m alternating step. That is 2.862 steps/second (0.349 s per step); the U phase advances at `π ×
stepsPerSecond`, so each vertical dip corresponds to one foot contact. Other speeds recompute the stride from the
same relation. The phase stops advancing when movement magnitude is zero.

The damper also receives the physics-resolved support state. Footfall gait is disabled while the player is airborne
or moving through a vault/wall traversal, so the reticule does not keep bouncing as if the legs were running in midair.
Jump lift, landing response, breathing, aim sway, and acceleration responses remain active during airtime.

Jump lift is driven by the launch velocity. Landing dip is driven by the instantaneous downward velocity
and the support-stop acceleration (`velocity / frame delta`), so a building fall produces a deeper response
than a normal jump and a harder stop at the same velocity dips further. Take-off pitches up and landing
deceleration pitches down through the same bounded spring. Gait lateral/depth offsets are composed into the
render matrix only, so Rapier or the deterministic fallback remains authoritative for the player position.
Focused coverage is in `apps/web/src/scene/camera-motion.test.ts`.

The first front/back inertia pass uses the controller's forward velocity change before collision resolution. It feeds
that acceleration into the same damped target/response pair as the local inertial roll: forward acceleration gives a
small upward pitch and braking gives a matching downward pitch. A 60 m/s² reference reaches the current full-sprint
roll magnitude. The damper now receives one local horizontal acceleration vector with right and forward components,
so locomotion and collision corrections use the same coordinate convention. The right component produces the matching
inertial roll, while the forward component produces pitch. The former direction-change roll path has been removed, so
the vector is now the sole source of horizontal roll and cannot double-stack the same strafe reversal. A horizontal
wall stop compares requested and resolved velocity, bounds the correction to the speed the player carried, projects it
onto camera-right and camera-forward, and sends one additional impulse through that same vector input. Holding movement
into the wall does not repeat the impulse every frame. Vertical jump and landing impulses remain explicit until they are
folded into the same vector in the traversal pass.

## Oxygen vital and breathing response

The visual-table player vitals model exposes a 100-point Breath / O₂ Reserve in
`apps/web/src/scene/player-vitals.ts`. This is a gameplay reserve, not literal blood-oxygen saturation.
Standing idle restores 12 points per second. The normal standing trot is exactly 1.5× the 3.4 m/s base (5.1 m/s,
18.36 km/h), maps one quarter of the way from walk to sprint, and recovers about 5.17 O₂ points per second while moving.
Crouch walking keeps the reserve flat and does not recharge it while movement is active. Sprinting drains 3.33 points
per second (about 30 seconds from full). A full jump and each transition from
crouch to standing costs 5 points, so roughly 20
consecutive full jumps empty the reserve.

Landing is a separate leg-exertion event. A landing at the full-jump downward speed costs 10 O₂, and the charge follows
the square of downward speed as a frame-rate-independent kinetic-energy proxy. With the current 48 m/s² gravity, a
2 m fall is about 13.9 m/s and costs about 11 O₂. The live and fallback controllers use the measured maximum fall speed
for this calculation. Landing O₂ is spent before impact damage: a sufficient reserve prevents shield/health loss, while
any unpaid remainder follows the normal shield-then-health path. Landing exertion also uses the 0.25-second jump
recovery delay. The camera dip is still resolved by the centralized camera damper from its separate landing deceleration
input.

Sprint recovery waits 1.5 seconds, recovery after crouch walking waits 0.5 seconds, and jump recovery waits 0.25
seconds. These delays are stored in the pure state and recovery is integrated for the exact portion of a frame
after it expires. The browser publishes the rounded reserve as `data-player-o2` and renders it as a third
HUD bar.

O₂ is an action reserve. A full jump and a stand-up transition each require the full 5-point cost. If the reserve
cannot pay a full jump, the controller performs a free mini hop instead: its launch speed uses the same neutral
balance as the trot, `12 / (12 + 5) = 70.6%` of the full launch speed, which produces about half the full apex.
The mini hop does not change O₂ or add the full-jump recovery delay. Crouching has no entry cost. The normal standing
speed is the 1.5×-base trot, so ordinary movement slowly regenerates O₂. Sprinting is allowed only when the current
frame's drain is affordable. When it is not (including at 0%), the sprint request is cleared and the controller stays at
the same 1.5×-base trot rather than retrying sprint every frame. The trot's quarter walk-to-sprint blend combines the
configured walking recovery (+8/s) and sprint drain (-3.33/s) into about +5.17 O₂/s while moving, so the reserve can
replenish after the existing sprint recovery delay even while movement input remains held. A fresh movement double-tap
is required to sprint again.
Hold-breath activation similarly requires one affordable 1/60-second drain slice, then drains continuously and
stops when the reserve reaches zero.

Every fired projectile also spends 25% of its configured damage from the same reserve. The current charges are
7 O₂ for a 28-damage pistol round, 3 for a 12-damage machine-gun round, 4 for each 16-damage shotgun pellet
(32 for the eight-pellet shell), and 25 for the 100-damage sniper round. A shot is still allowed when the
remaining reserve is smaller than its full charge; the final partial amount is consumed and the reserve reaches
zero. This is a fatigue cost, not an ammunition gate, so the shared low-O₂ sway makes sustained fire less stable.

The physical left Command key (`MetaLeft`) is the temporary desktop hold-breath input. It also aims, drains
15 points per second, stops automatically at zero, and locks until the reserve is above 25 points. Right
mouse toggles zoom and does not hold breath. While left Command is held, the scene cancels
page-level keyboard defaults for every key event that reaches the page, so ordinary Command-modified keys
are treated as game input; browser-reserved shortcuts such as macOS Command+W may still close the tab before
JavaScript receives an event. While the hold is active and O₂ remains above zero, the shared camera damper
leaves half of the rested baseline reticle, weapon, and stationary-breathing instability and suppresses the
reserve-driven breathing destabilisation. Releasing the hold or reaching zero restores the normal reserve-driven
response. The continuous response in
`apps/web/src/scene/o2-stability.ts` maps the current reserve to the shared reticle/camera sway response
without threshold states outside explicit crouch, hold-breath, or wall-brace stabilisation. Camera breathing grows
smoothly as the reserve falls while not holding breath, including while stationary. Crouching applies a free 50%
stability factor to the shared breathing response, while wall bracing and holding breath apply independent 50% factors.
Zoom uses the same base sway amplitude as hip fire; crouch, holding breath, and wall bracing are the states that reduce
that shared response.
The reserve-driven breathing destabilisation now uses one shared 2× fatigue emphasis for the reticle and camera-damper
response; the held weapon consumes that same perspective output, while shot recoil recovery remains a separate central
spring response.

Pressing Jump while crouched automatically returns the player to standing when either a full jump or the fallback
mini hop is accepted. The automatic posture change is part of the jump action, so a full jump keeps the existing
single 5-point cost while an O₂-insufficient mini hop remains free. The returned jump posture also keeps the mobile
Crouch button's pressed state aligned with the scene controller.

When the first-person capsule is touching the side of any active physics box,
zoom receives reticle, weapon, and stationary-breathing
stabilisation, but leaves one half of the normal
reserve-driven instability so the pose is not perfectly static. Cover has a 2 m area of effect measured from the
capsule surface: toggling zoom while a valid wall is within that range engages cover and moves the capsule toward
the wall at sprint speed until the normal controller gap is reached. The wall brace does not change or drain the
player's O₂ state. Crouch and wall bracing stack multiplicatively, leaving one quarter of normal sway and the
reserve-driven accuracy penalty before any held-breath factor. The contact probe uses the controller capsule gap,
supports yaw-rotated boxes, ignores floors and sloped surfaces, selects the nearest valid wall, and publishes the
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

The scene applies wall damage from collision delta-v rather than raw travel speed. A wall impact compares the
requested horizontal velocity with the velocity Rapier resolves after contact; penetration correction cannot create more
delta-v than the player carried into the wall. Sprint speed (10.2 m/s, exactly 36.72 km/h) and below is always harmless.
Above that limit, a kinetic-energy-shaped km/h curve scales wall damage, reaching 200 damage at an approximate 200 km/h
human terminal velocity. Landings use the separate O₂ energy curve described above, so a fall can be harmless while the
reserve is available and only the unpaid exertion becomes shield/health damage.
In development (`?debug=1`),
the Visual debug panel has `Simulate 25 damage` and `Reset vitals` controls so the recharge
loop can be checked without arranging a traversal impact. The HUD exposes shield and health bars,
recharge status, and the scene renderer carries rounded `data-player-health` and `data-player-shield`
values for local smoke inspection. This is a visual-table prototype surface, not yet authoritative
match combat or persistence state.

All scene damage now goes through `apps/web/src/scene/combat-damage.ts`. The router registers the local player
as `player` and the simulant as `bot:simulant`, applies the shared shield-before-health reducer, and invokes the
registered actor's damage and death callbacks. Weapon rays, melee rays, wall impacts, and landing O₂ shortfall
damage use this same route. A future bot must register its actor ID and vitals callbacks before its render marker
can receive damage; an unregistered target fails loudly rather than losing a hit silently.

### Unshielded headshots

The scene uses a strict per-bullet threshold of greater than 25 damage for headshot kills. A projectile must hit the
simulant's marked head mesh while its shield is already at zero; the damage route then applies lethal damage to the
remaining health pool. A 25-damage bullet is not eligible. Shielded head hits remain ordinary shield-before-health
damage, and the shotgun is evaluated per pellet, so its 16-damage pellets do not qualify on their own. When the shield
reserve is empty, its transparent flare stays visible as a presentation pulse but no longer blocks the weapon ray from
reaching the head mesh. With the fixed roster, pistol (28), scoped carbine (36), and sniper (100) can qualify; machine
gun (12), shotgun pellets (16), and submachine gun (9) cannot.

## Fixed six-weapon combat prototype

The 8 August checkpoint keeps the visual-table combat presentation but removes generated weapon profiles and per-instance
gun stats. `apps/web/src/scene/weapons.ts` defines exactly six fixed weapons: pistol, shotgun, machine gun, sniper,
carbine, and submachine gun. Room seeds still deterministically place fixed-weapon pickups in the world; the seed never
changes a weapon's definition. The loadout always exposes six inventory slots, with `1`–`6` selecting the corresponding
weapon and `0` holstering. Walk-over pickup and `E` equip the nearest fixed weapon.

The combat runtime keeps the visual-table weapon meshes, shared first-person camera/viewmodel/reticule path, recoil,
tracers, impacts, bullet holes, reload poses, and a short insertion impulse at each committed shell, bullet, or magazine,
sniper scope, and spatial Web Audio. Each round emits exactly two gray
gunshot-gas sprites. The previous round's gunshot gas is cleared when the next round fires; each new puff starts at
zero scale, follows a logarithmic expansion and inverse logarithmic opacity curve, and is gone after one second.
Separate thermal wisps remain driven by Celsius barrel glow and use their slower pooled diffusion. Barrels use the
visual-table temperature thresholds and exponential cooling curve. Shot audio includes muzzle, crack, tail, and
listener-relative bullet pass-by layers.

### Parametric bullet impact audio

Bullet impacts use a separate deterministic profile rather than reusing the muzzle sound. The profile takes the
projectile's damage as bullet strength and the acute angle between its path and the struck surface normal. A 0-radian
hit is head-on; π/2 is a grazing strike. Strong square hits produce a lower, louder, longer compressed noise body and
resonance. As the angle becomes more shallow, the body becomes brighter and shorter while a brief high-frequency
band-pass scrape grows in, so grazing strikes have a distinct material response.

The runtime transforms the hit triangle normal through the struck object's world matrix, including an instanced-mesh
matrix when present. It uses the same resolved normal for the bullet-hole decal and the angle calculation. Each hit
schedules the three procedural layers at the impact point with the existing sound-speed delay, HRTF panner, bounded
proximity gain, seeded noise buffer, and fail-soft Web Audio setup. The pure resolver and acute-angle conversion are
covered in `apps/web/src/scene/weapons.test.ts`; listening in the connected browser is still a separate acceptance
step.

### Melee audio

Picked-up ragdoll objects use the same procedural noise buffer, HRTF panner, proximity envelope, and sound-speed delay
as guns. `resolveMeleeAudioProfile` maps the object's measured volume, longest-axis reach, swing speed, and impact
damage into two layers:

- A band-pass white-noise woosh plus a quiet sine tone spans the complete resolved swing duration. Both layers use a
  symmetric exponential volume curve: they start quiet, peak at the swing apex (50%), and return to the same quiet
  level at the end. Smaller, faster objects are brighter; long-reach objects carry a little more air.
- A compressed, lightly saturated low-pass noise body plus a decaying triangle resonance starts at the resolved hit
  point. Larger and higher-damage objects are lower, louder, and longer.

The impact layer is emitted only when the swing ray resolves a world hit; a miss has no bang. The Web Audio path remains
optional and fails soft when a browser blocks or lacks `AudioContext`. The pure profile is covered by
`apps/web/src/scene/melee.test.ts`; actual listening in the connected browser is still a separate acceptance check.

## Recoverable melee drops

Dropping or holstering a held melee prop with `Q` returns it to the world as a dynamic ragdoll and keeps that same
instance available for pickup. The pickup list follows the live instance transform, so re-equipping a prop after it
moves preserves its current position and removes only its dynamic body. Every streamed prop is also a valid melee
weapon after it is toppled by an ordinary melee hit or player collision: the live ragdoll remains in the nearby-pickup
list and `E` can recover it while it is still settling.

The scene adds a deterministic red simulant target. It spawns beyond the initial player position, charges until close,
damages the player's shield/health at contact range, accepts weapon- and melee-ray damage through the central combat
router, hides on defeat, and respawns after a short delay. This target is local presentation state for gun testing; it
is not authoritative game, replay, or multiplayer state. The parametric-guns movement, traversal, acceleration, and
wall/vault physics remain the active movement path.

The authored world fog pass is disabled. Warehouse uses its own fixed map-local haze; existing debug preference snapshots
that contain a fog value are normalized to zero and cannot tune or disable that Warehouse effect.

The fixed roster is covered by `apps/web/src/scene/weapons.test.ts`, including six-key mapping, reload formulas,
spread, pickup placement, audio profiles, Celsius cooling, and smoke-pool clearing. Browser rendering and audio acceptance
remain pending because this checkpoint does not open a second browser session.

## Penthouse armory chart

The penthouse west wall now carries a readable `WeaponDamageAmmoChartSign`. Its chart is generated from
`WEAPON_CHART_ENTRIES`, which is derived from the six fixed weapon definitions, so it stays aligned with the
pickup and loadout data. Each row shows the weapon name, damage per projectile, pellets per shot, loaded magazine,
reserve ammunition, and total starting rounds. The footer defines the ammo order as `loaded / reserve` and calls out
that shotgun damage is per pellet rather than per shell.

Shot recoil is part of the centralized first-person damper. Each fire event passes the weapon's per-projectile
damage and the current visible centre-dot displacement from its resting position into the damper. The damper draws
that vector as a line from the resting dot to the live dot, normalizes it, and nudges the aim farther along the same
direction; there is no fixed centered or upward kick. The outer reticule ring is the 100-point reference radius. The
base 100-damage impulse carries the aim 25% beyond that radius; the current shared 10× shot-jerk tuning carries the
sniper 1250% beyond the centre. Pistol, shotgun, and machine-gun impulses use the same distance algorithm scaled by
their 28/16/12 damage values. That output is applied to the camera matrix, the
reticule's CSS/NDC position, and the camera-child held weapon. Hip fire keeps movement, breathing, posture, and prior
recoil in the next shot's live direction for its existing spread. Zoom keeps half of that prior-recoil feedback: the
recovery pulse still changes the next sighted shot, but zoom remains steadier than hip fire without removing the
deterministic spread source. Each kick holds its outward phase for 60 ms, then releases a shared 1.5×
return-velocity impulse into the same under-damped spring; the spring carries the presentation back through the rest
point and produces the opposite-side overshoot. The recovery queue never reads weapon type, fire interval, or magazine
state. A rapid weapon simply submits more shared impulses before earlier responses settle, while a slow weapon naturally
gets a clean recovery; future weapons use the same path without new cadence branches. There is no global camera-angle clamp,
so the full impulse remains readable instead of being
silently flattened; an exceptional heavy weapon can add its own limit later. Only the existing per-projectile damage
scale changes the kick size. The shotgun uses 16 damage
per pellet rather than multiplying the visual kick by its eight-pellet count. Ordinary guns do not add a second random
projectile offset; the shotgun is the only weapon with an inherent fixed pellet cone. Every pellet cone is centered on
the current live reticule ray; O₂ does not widen or tighten it. O₂-driven sway still moves the reticule and therefore
moves the cone's center. Firing fatigue consumes 0.25 times each projectile's damage, including all shotgun pellets,
so the resulting reserve-driven sway moves both the visible reticule and the live aim ray.
During sprint movement, the reticle centre dot fades out and fades back in when sprinting stops. The outer circle is
kept visible as the persistent movement/aim reference.
During a reload, the browser shell fades only the centre reticle dot to zero opacity from the authoritative weapon
snapshot; the outer circle remains visible and the dot returns when the reload finishes without changing the shared
aim ray or camera motion.
The browser shell also listens for the keyboard Caps Lock modifier: the centre dot is visible only while Caps Lock is
on, while the outer circle remains visible regardless of the lock state. Sprint and reload still hide the same dot.
The submachine gun uses that same state for its trigger: with Caps Lock off it fires continuously at its 0.045-second
cadence while the trigger is held; with Caps Lock on, each trigger start fires a three-round burst at the same per-round
cadence, followed by the configured burst pause. A burst keeps the mode sampled when it starts, so changing Caps Lock
mid-burst does not cut the burst short. The pistol uses a Glock 19-like 0.045-second cadence: with Caps Lock off it is
fully automatic and dumps its 12-round magazine in about 0.54 seconds; with Caps Lock on, the trigger latch permits
exactly one round per press and requires release before the next shot. Reload, weapon switching, and death clear that
latch so the next accepted trigger input starts cleanly.

Focused coverage lives in `apps/web/src/scene/weapons.test.ts`, `apps/web/src/scene/reticle-aim.test.ts`, and
`apps/web/src/scene/sniper-scope.test.ts`.
The tests cover the six fixed profiles, separated front/rear iron-sight anchors, same-seed placement stability, seed
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

The visual-table HUD is intentionally ultra-minimal. The previous live status rail is hidden during play, leaving the
top bar stack and lower-right loadout as the persistent tactical readout. The intro and footer retain only concise
control guidance when the scene is not active.

Shield, health, and O₂ now use the available horizontal space in one wide top strip, with three flat dark-grey bars
stacked vertically in O₂, shield, then health order. The blue fill is left-anchored, so the missing portion drains from
right to left. A bright Halo-style blue fill sits on a dark outlined track, making the missing portion clear at a glance.
Visible labels, percentages, status prose, and the repeated `Player systems` heading are removed; the progressbar roles
and numeric values remain available to assistive technology.

The lower-right `Loadout` readout keeps the active weapon/ammunition line and six number slots, but uses a wider panel so
the inventory does not compress into a narrow column. Persistent control instructions and long melee telemetry remain
available through the existing accessible markup but do not consume screen space during play. The lower-left and centre
remain available for movement controls and the scene. On narrow touch layouts, the rail and wide vitals strip move
closer to the top edge after pointer lock/control activation, while the wider loadout stays above the touch controls.

The three persistent `Seat view`, `New room`, and `Overhead` buttons are removed. The intro and footer instructions are
also reduced to short control strings so the scene starts with less tutorial copy.

When pointer lock is released, the concise instruction footer occupies the bottom stack above the weapon panel; mobile
layouts keep the panel above the touch controls instead.

## Weapon switch presentation

Selecting a different owned weapon, collecting a pickup, or walking over a pickup uses one first-person transition.
The camera-motion damper first rotates the outgoing weapon muzzle-down and lowers it below the viewport. It then starts
the incoming weapon at that same bottom-of-screen pose and rotates it up into the shared reticle aim. If the player has
no weapon yet, the new weapon starts directly in the raise phase. The outgoing model remains visible until the lower
phase finishes, and the incoming model remains visible until the raise phase settles. Fire and reload inputs are ignored
while this short presentation transition is active; the authoritative weapon state and reticle ray do not change.

If the selected weapon has an empty magazine and reserve ammunition, the runtime starts its reload as part of the equip
operation. Switching back to a gun that was put away empty therefore raises it with a reload already in progress instead
of leaving the player holding `0` loaded rounds. A same-weapon pickup that adds reserve ammunition applies the same rule.

The number-row `0` key explicitly holsters the current weapon. It clears the active weapon and HUD ammunition while
leaving collected weapons in the inventory, and uses the same lower transition as a weapon switch without raising a
replacement model.

## Traversal weapon presentation

The first-person controller sends active ledge-vault and wall-climb state through the same centralized camera-motion
damper that drives weapon put-away. The damper receives the resolved climb duration and uses a faster-starting 2x
lowering curve that reaches its target only at the end of the climb, avoiding a mid-traversal bottom clamp. A vault uses a
shallow 20% lower amount so the gun remains visible as if it is resting on the obstacle. Wall climbs scale by the
block's full height and reach the full lower pose at 4 m. Wall hanging alone does not start the lower animation. This
does not alter physics or aim-ray authority; firing, reload, pickup, and drop remain locked until the shared raise phase
returns to idle. It only composes a traversal-specific viewmodel pose. Coverage is in `apps/web/src/scene/camera-motion.test.ts`.

## Reload movement

Sprinting interrupts an active reload before the sprint speed check. A clip reload leaves its magazine unchanged; a round
reload keeps any shells/bullets already inserted. The reload presentation and HUD state clear immediately, so the accepted sprint
can use full speed on the next movement update. If O₂ cannot pay the sprint drain, the existing neutral jog fallback still applies.
Crouch speed remains the higher-priority posture limit, and a failed crouch-to-stand transition does not interrupt the reload.

When development debug mode is enabled (`?debug=1`), the browser shows a small bottom-left `SPD` readout in metres
per second. It consumes the scene's damped horizontal velocity and is throttled to about 10 updates per second; on
coarse-pointer layouts it sits above the movement joystick. Normal mode does not render this temporary diagnostic.

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

## Physical near-field eye depth of field (checkpointed, currently disabled)

The physical eye-CoC path is preserved in checkpoint commit `534f04b` for later calibration, but it is disabled in the
current runtime because the first visual pass made the whole scene too soft during zoom. The active renderer uses the
previous stock normalized Bokeh response while we reassess the blur scale and depth-buffer mapping. The physical
experiment itself does not add a separate zoom-specific shader state.

## DoF intensity defaults

The active stock Bokeh pass uses a 12.5× multiplier in normal first-person view. Standing and crouching share this
default. The multiplier becomes 25× only while the shared explicit zoom state is active, covering both iron-sight zoom
and the sniper scope; crouching by itself does not increase blur.

## O₂ fatigue vision response

The visual table applies a continuous screen-space blur from the same centralized camera-motion O₂ output that drives
breathing sway. It uses the existing fatigue curve (`(1 - oxygenRatio) ^ 1.25`), so full reserve is sharp and zero
reserve reaches a bounded 1 CSS-pixel radius in normal view or 2 CSS pixels while zoomed. The shader scales that radius
by device pixel ratio and sits after the gaze-driven Bokeh and sniper-scope composite, so it reads as low-O₂ vision
fatigue without changing focus distance or weapon/reticle alignment. The existing auto/manual exposure target remains
unchanged and contrast stays at 1×. The pass applies a black radial vignette that eases continuously from the live
reticule point (50% across and 60% down by default) to the corners, with deterministic transition dithering to avoid
a hard colour band. It reaches 1.0 strength at zero reserve in scene-linear space, before `OutputPass`. The live values are exposed as
`data-o2-vision-blur`, `data-o2-vision-vignette`,
`data-o2-vision-contrast`, and `data-o2-vision-pass` on the scene container for diagnostics. The mapping lives in
`apps/web/src/scene/o2-stability.ts`; the pass is in `apps/web/src/scene/o2-blur.ts`.

## Held-breath, crouch, and wall-brace stability

Holding breath keeps the O₂ reserve drain and zero-reserve release rules, but it does not let the falling reserve feed
back into breathing sway. While the hold is active above zero O₂, reticle and weapon sway use only their baseline
breathing response, and the camera uses the rested breathing amplitude and frequency before applying the 50% hold
factor. This prevents holding breath from causing the heavy breathing and shaking it is intended to control.

Wall bracing still applies its independent 50% factor to the existing reserve-driven response. If the player leans on a
wall while crouched, the factors compose to 25% for reticle, weapon, and stationary camera breathing motion. Holding
breath adds another independent 50% factor, so crouch plus wall brace plus held breath leaves 12.5% of the normal
reserve-driven instability.

## Damage-driven barrel heat

The visual weapon prototype tracks a separate heat load for each gun. Only projectiles that hit a render surface add
heat, using the weapon's per-bullet damage; a shotgun therefore adds one pellet's damage for each pellet that hits.
Misses do not heat the barrel. At 500 accumulated damage units the barrel reaches the full red-hot red/emissive blend,
with the material emissive intensity capped at `1`.

The barrel cools at a constant `16.67` damage units per second. The cooldown is therefore linear: 100 damage units take
6 seconds, while 600 damage units take 36 seconds. The 500-damage red-hot threshold itself takes a maximum of 30
seconds to cool. Cooling continues while the weapon is holstered or another weapon is equipped. Both the held view model
and world pickup copies use the same weapon heat state.

## Pooled barrel smoke

Each held weapon now owns a fixed pool of 192 billboard smoke sprites and one shared 64×64 procedural alpha mask.
Every trigger pull emits exactly two dense gray gunshot puffs even when the shot misses. Firing another round clears
the previous gunshot puffs immediately, so no more than two gunshot sprites are visible at once. These puffs start at
zero scale, use a one-second lifetime, and follow a logarithmic expansion from zero to full scale while their opacity
follows the inverse curve from `1` to `0`. Thermal steam remains a separate five-second effect: it uses the pale white
steam color, scales with a restrained longest-barrel ramp (1× on the handgun to 1.6× on the sniper), and emits at an
inverse rate (about 6.4 wisps/second on the handgun to 4 on the sniper). Thermal wisps use the existing logarithmic
expansion and inverse-opacity lifecycle, with a square-root damage response to avoid oversized shotgun/sniper steam.
Both plume types inherit the nozzle's current world velocity, diffuse outward, then slow while rising before returning
to the pool.
The heat ratio still eases in from 35%; wisps rise with a small deterministic curl, expand, and fade without collision or
shadow work. The pool is attached to the scene world effects root, so smoke remains in place when the player turns,
walks, holsters, or switches weapons.

Smoke is a rendered world effect. The held muzzle samples the centralized camera/viewmodel pose at spawn, then the
particle continues in world space with depth testing and normal Bokeh participation. Smoke variation uses the
room-seeded RNG stream `<room>|weapons|smoke|v1`, separate from shot spread. Pickup copies show barrel heat but do not
emit smoke.

## Muzzle-flash point light

Each held weapon model has one local point light at its muzzle. A shot enables the light for the same 55 ms window as
the visible muzzle flash, then eases its intensity to zero from the remaining flash timer. The light uses the weapon's
flash colour, a 32-unit peak intensity, 7.5 m range, and inverse-square decay; it does not cast shadows. Pickup models
do not create a muzzle-flash light.

## Agent test note layout

The development-only agent test note is rendered immediately after the player-vitals panel in the same right-side
layout stack. It remains below the full vitals panel as its message changes, including on mobile and when the debug
panel is open.

## Reload and zoom handoff

Reloading temporarily leaves the player's requested zoom state. The input request is preserved, but the shared camera
presentation receives an unzoomed state while the clip or round reload is active. This keeps the camera FOV, reticule,
held weapon, O₂ stability response, and breath state aligned instead of adding a reticule-only exception.

When the reload operation and its final round-reload recenter phase finish, the preserved request is applied again. A
player who releases zoom during the reload stays unzoomed, and a player who was not zoomed before reload does not gain
zoom automatically. The weapon snapshot stays `reloading` through the final recenter phase so the HUD and movement cap
use the same readiness boundary.

Cover follows the requested zoom input rather than the temporary unzoomed reload presentation. Reloading therefore keeps
an engaged wall stance while the weapon cycles, and cover is cleared only when the player turns zoom off or accepts a
jump. The next zoom-on edge is still required after that explicit exit.

## Held-weapon perspective alignment

The held weapon does not add a second breathing oscillator after it aims at the live reticule ray. Camera breathing,
aim sway, head bob, roll, recoil, recovery, and the camera-attached viewmodel therefore remain one unified presentation
path. This prevents the weapon sights from drifting away from the reticule when O₂ is low. The machine gun and other
ordinary weapons still use the deterministic live ray with no random projectile cone; only the shotgun has inherent
seeded pellet spread.

## Generic parametric gun inventory (historical lane)

The following section records the earlier parametric-guns experiment. It is not active in the 8 August checkpoint:
the runtime now uses the fixed six-weapon roster and six slots described above. The resolver and instance details remain
useful historical context for that discarded experiment only.

Gun profiles are resolved from `GunPrimitivesV1` by the pure `v1` resolver. The resolver exposes canonical group,
burst, magazine, inventory, cadence, reload, handling, recoil, movement, and heat inputs, then hashes the resolved
profile. Generated profiles use the deterministic stream
`<roomSeed>|weapons|generation|<formulaVersion>|<gunSeed>` and carry the formula version, profile hash, and generator
seed into playtest state.

The runtime stores `GunInstance` records in a two-slot generic inventory. A slot contains only a slot index and a gun
instance ID; the instance carries its resolved profile, loaded and reserve ammunition, and temperature. Number keys
select slots, `0` holsters, and `Q` throws the active instance. A thrown pickup inherits the player's sprint, strafe,
and jump velocity, follows a short gravity arc, and ejects at least 1 m forward when stationary. It cannot be
walk-over-collected again until the player leaves its pickup radius. A gun displaced by a full-inventory `E` swap uses
the same walk-over protection, while `E` can still swap back immediately. The exact instance ID, profile hash, generator
seed, ammunition, and temperature remain intact. The drop position raycasts against visible scene geometry and tries
deterministic angled fallbacks so a wall does not absorb the pickup. Walk-over pickup inserts into the first free slot
without displacing the held gun; an explicit `E` equips a nearby pickup, or swaps it with the held gun when both slots
are full. Fire, reload, pickup, and drop are unavailable during a switch transition, and dropping clears
reload/switch presentation state. A dropped gun's current temperature is also applied to both the pickup barrel and
the held model when it changes hands.

The browser HUD consumes only `WeaponStateSnapshot` slot records and the generic nearby-pickup snapshot. It does not
look up a concrete weapon ID to decide inventory or firing behavior. Fixture names remain available for the armory
chart and seeded visual test placements, but they are ordinary profile data rather than runtime branches.

The v1 profile resolver also publishes sustained damage, shared live-reticule spread modifiers for zoom/movement/
posture/heat/recovery, oxygen and reload workload, reserve-pressure rate, and a derived audio profile. Generated
profiles retain the exact versioned generation stream and expose a redacted latent receipt. Bounded tradeoff checks and
Pareto filtering keep several useful damage/accuracy/mobility/reload choices instead of collapsing them into one score;
the heavy-turret envelope is only a generic sampling utility.

Resolved profiles are re-derived and hash-checked before `GunInstance` creation, and each instance retains the exact
primitive input alongside its resolved profile. Round and belt feeding keep the full-magazine reload workload in
`reloadSeconds` while using a derived per-round or segment interval for partial-capacity loading and interruption.
Sustained damage uses the full reload workload for both feed styles.

`GunPlaytestTelemetryV1` is an immutable reducer used by the runtime and local harness. It records first-shot timing,
hit intervals and rate, posture/distance hit-rate summaries, damage/DPS, recoil/recovery, movement speed and aim
penalty, heat/glow/smoke, reload duration and interruption rate, ammunition/O₂ use, engagement range, misses, empty
magazines, deaths, and optional power/control/clarity/fun ratings.
The loadout HUD's profile inspection disclosure renders the active profile hash/seed and a compact subset of these
derived values.

Generated profiles also receive a deterministic memorable name such as
`True Ember · K7M4Q2`. The adjective comes from the strongest latent tradeoff,
the noun reflects the feed style, and the six-character code comes from the
separate name stream `<roomSeed>|weapons|name|v1|<gunSeed>`. Submachine variants
append `|submachine` before the gun seed. Names are safe presentation metadata
and are included in the generation receipt; the profile hash, room seed, gun
seed, and formula version remain the canonical identity to record when a tester
reports a favorite. Passing `displayName` to the generator keeps an explicit
tester label unchanged.

The development scene stages 24 generated profiles (`catalog-001` through
`catalog-024`) in a walkable parametric barracks for each room seed. The debug
panel has direct `Parametric barracks` and `Target range` presets. The target
range provides four labeled live-fire distances (8 m, 16 m, 24 m, and 32 m), so
testers can equip a named profile, use the same reticule/fire/reload path, and
compare the resulting hit marks and telemetry. The existing 13 fixture pickup
instances (four table-side and nine outdoor) remain in the same generic pickup
runtime, for 37 visible pickup instances in the default scene.

Twelve of the 24 generated catalog entries use a deterministic submachine
envelope: compact clip feed, one projectile per trigger pull, high cadence,
moderate spread, and light handling. The archetype is a generator sampling
choice only; the runtime still consumes generic resolved profiles.

## Layered damage vignette

Incoming player damage uses the same post-processing path as the black O₂ vignette. The radial falloff is centred on
the live reticule in screen UV space, normalised against the farthest viewport corner, and applied before
`OutputPass` so the location stays aligned with camera, weapon, and aim presentation. Damage does not add a separate
DOM overlay or a reticule-only offset.

Every decrease creates an independent transient layer. Lost shield points use a saturated blue layer; lost health
points use a saturated red layer. The initial opacity is the exact delta multiplied by `0.01` and capped at `1.0`
(one point equals one percent opacity). Each layer fades over `0.5` seconds. Multiple rapid strikes therefore remain
separate compositor layers and build opacity through normal sequential alpha blending. A strike that crosses the
shield boundary creates both its blue shield layer and red health layer from their separate deltas.

When a melee prop replaces an active gun, the scene remembers that held gun ID while the gun is holstered. Dropping the
melee prop with `Q` reselects the remembered gun through the shared weapon switch transition after the drop succeeds. If
melee was drawn while unarmed, `Q` instead cycles to the first owned gun, when one exists. Explicit `0` holstering and
failed drops do not re-arm a gun.

When melee is drawn, walking over a gun fills the inventory without drawing or switching the gun viewmodel. `E` and
numeric gun selection remain deliberate handoff actions: the melee viewmodel is stashed first, the gun action must
succeed, and a failed action restores melee. The pure `shouldEquipWalkOverGun` and `shouldStashMeleeForGun` guards are
covered in the scene regression suite.

## Calm melee idle reset

The held melee prop has a right-ready default and alternates to the opposite ready side after each completed swing.
When the prop is left on the left side, the runtime waits five seconds without another swing or viewmodel transition.
Walking or running does not clear this melee-activity timer. It then uses a `0.9`-second smoothstep blend to return the
item to the right, so locomotion can continue while the reset plays.
The pose blend is applied to the camera-child model alongside the centralized camera-damper viewmodel offset; it does
not create a separate camera or reticle path.

## Fallen melee pickup orientation

When a dropped melee prop is picked up, the first-person model preserves its source scale but ignores the transient
ragdoll rotation from the ground. The model is rebuilt from its canonical longest-axis grip, so props that landed on
their side return upright while the shared camera-damper swing path controls their subsequent movement.

## Momentum-scaled melee damage

Melee hits against player-like combat actors use the pure `resolveMeleeDamageWithMomentum` resolver before entering the
shared shield-before-health router. The resolver projects relative velocity onto the attack ray. Player movement toward
the target increases the closing speed, and a target moving toward the player increases it again; a target moving away in
the same direction contributes no positive closing load. Falling attacks add a separate bonus from downward velocity only
while airborne. The multiplier uses full sprint and full jump speeds as references, stays deterministic, and is capped at
`2.5×`.

The local simulant supplies its frame velocity to the resolver. A melee swing still spends O₂ from the base object damage,
and the resolved stopping-power value now drives both player-like knockback and non-actor ragdoll launch force. The HUD's
existing last-hit damage value records the momentum-scaled amount after a player-like target is struck.

## Gun melee attack

Every fixed gun can strike at close range with `F` while it is equipped. The attack uses the same shared melee resolver as
the warehouse props: its base damage comes from the gun's physical occupied volume, its reach comes from the longest gun
axis, and its swing speed is inversely related to volume. Larger guns therefore reach farther and hit harder but take longer
to swing. The six definitions carry explicit size proxies so this remains deterministic and reproducible for every room seed.

The strike is resolved on the live aim ray at the size-derived reach. It does not consume ammunition. A successful actor hit
then applies the existing shield-before-health route, including the bounded sprint/closing/falling momentum multiplier,
stopping power, shield spark, and unshielded blood response. World props use the same melee ragdoll impulse seam as a picked-up
object. `F` also swings a picked-up melee object; primary-click firing remains the gun trigger. Starting either melee path
clears persistent zoom through the shared aiming state. If a melee-only prop is drawn and the player is zoomed, primary click
throws the prop instead of swinging it. Its launch speed is volume-weighted as an inverse square-root mass proxy, bounded
between `12 m/s` and `34 m/s`, and includes the player's current velocity. The thrown prop remains a recoverable ragdoll;
damage from a fast thrown prop is intentionally deferred to a later pass.

## Melee stopping power

Every melee pickup derives a bounded stopping-power value from its resolved damage: `0.12 m/s` per damage point, capped
at `18 m/s`. The value is presented with the pickup and active melee HUD rows. A successful simulant hit applies this
impulse through the same stagger and knockback path used by projectile stopping power, using momentum-scaled damage so
sprinting, opposing motion, and falling strikes carry more force. World ragdolls receive the pickup's stopping-power
impulse as their minimum horizontal launch velocity, while callers without the stat retain the legacy swing-speed
fallback.

## Melee hit telemetry

With the explicit `?debug=1` panel enabled, `Melee telemetry` shows `Previous hit`, `Swings / hits`, and `Current base`,
plus the selected gun's volume/reach and size-derived damage, swing speed, and stopping power.
`Previous hit` is the last resolved damage value after the shield-before-health combat route; player-like actor hits also
include the momentum multiplier. It stays visible while the next swing is charging or misses. `Current base` is the
selected prop's unscaled damage, which lets a tester compare the two values while tuning sprint, opposing-target, and
falling-hit behaviour. The telemetry is local debug state only and does not change the authoritative game engine or
expose hidden information.

## Warehouse weapon layout

Warehouse is a rectangular industrial platform. Its weapon pickups use a deterministic perimeter layout rather than the
normal map-wide sampler: one pistol, shotgun, machine gun, sniper, carbine, and submachine gun are placed at equal
intervals around the inset platform edge, with seed-derived pickup rotations. The pistol remains the starter pickup.
Debugging 01 continues to use the existing dense, obstacle-aware procedural pickup generation.

## Simulant blood impacts

Projectile and melee impacts on the local simulant use a separate presentation path from world-surface impacts. The hit
callbacks classify the simulant and pass its current frame velocity to the weapon runtime, so the moving actor never
receives a persistent world bullet-hole decal. Instead, the runtime emits a short-lived, depth-tested blood cloud whose
scale is derived from the resolved hit damage (light rounds or small melee props stay compact; heavier hits expand the
burst). Each projectile or melee contact emits exactly one dark-red sphere with low opacity. A hit that is absorbed by
the simulant's shield emits a short cyan-white shield spark at the impact point. Blood is gated by the post-hit vitals:
shielded hits emit no blood and no actor bullet-hole, while a hit that deals damage with the victim's shield at zero
emits the sphere. A shield-breaking overflow hit can show both the shield spark and the blood response.

The simulant also receives a transparent shader shell for the shield flare. Its pulse is brightest at the start of the
shield-hit window, shifts toward warm white-orange at peak intensity, and uses a vertical `smoothstep` mask that reaches
zero opacity at the bottom edge of the shield volume.

Each actor hit, including a melee swing, also searches for a nearby static surface from the hit point. It prefers the
target's movement direction, then projectile or melee travel and vertical directions, and projects a seeded blood stain
onto the first floor or wall it finds.
The stain is one low-opacity dark-red splat texture and becomes an elongated smear along the target's velocity once the
running-speed threshold is crossed. Stains are bounded and fade after their presentation lifetime. Ordinary wall, floor,
and prop hits continue to use bullet-hole decals. Blood cloud and stain objects remain visible in the clean sniper-scope
world feed.

## Hip-fire O₂ cost

Weapon shots use the current first-person zoom state when applying the discrete projectile fatigue charge. Shooting from
the hip costs zero O₂, while shooting while zoomed keeps the existing charge of one quarter of total projectile damage.
The shot still fires when O₂ is empty, and movement, breath holding, and other exertion costs are unchanged.

## Warehouse lighting and bullet raycasts

The Warehouse industrial lighting is presentation-only. Its scene group is marked `weaponRaycastIgnore`, and the
hitscan weapon path uses `isWeaponRaycastSurface` to skip that group and all of its descendants. This keeps the central
spotlight shaft and floor pool, high-bay fixtures, and corner Christmas-light decorations from stopping bullets while
leaving structural warehouse walls and crates available as projectile surfaces.

## Death ragdolls

Death animation is a visual layer over the existing combat state. `apps/web/src/scene/ragdoll.ts` owns the deterministic
launch, gravity, drag, bounce, tumble, and joint-pose calculations. The scene applies that state to the robot's named
body parts and to a temporary player death body. A lethal hit's direction and stopping power seed the robot launch; a
player death uses the current facing and movement direction. No hidden game state or rules are added.

The robot remains visible while it ragdolls and is ignored by hitscan rays until its normal respawn. The player body is
shown briefly in front of the camera while the shared camera damper performs the first-person fall/tumble; the existing
black fade then respawns the player and clears the body. This is a prototype presentation effect, not a networked or
authoritative physics body.

## Gun melee during reload

Pressing `F` for gun melee interrupts an active reload and starts the normal shared melee swing immediately. This works
for both clip and round reloads. Any rounds already inserted by a round reload remain loaded; the unfinished reload timer,
return pose, and reload HUD state are discarded. The melee strike still uses the selected gun's size-derived reach,
damage, stopping power, and O₂ cost, and it does not consume ammunition.
