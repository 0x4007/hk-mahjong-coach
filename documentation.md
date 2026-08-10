# Architecture and implementation log

## 2026-08-07 — Gunless simulant runner

The scene-only simulant is temporarily a runner target: it has no weapon model, weapon state, hitscan firing, muzzle
effects, or AI damage path. It runs toward the player and stops at a 2.4 m standoff. Player weapons and engine rules
remain unchanged.

## 2026-08-07 — Compact 250 m runner map

The streamed exploration world now spans 250 m × 250 m (`±125 m` from the origin) and preloads 5 visible coarse chunks.
The same seeded generation and authored play-area exclusions remain active inside the smaller bounds.

## 2026-08-07 — Omitted corner chunks

The 250 m runner map keeps its square movement and physics bounds, but the four diagonal chunks are not generated or
rendered. The central chunk and four axis-aligned edge chunks remain rectangular, so the visible skyline has a rough
five-block shape without adding an invisible circular gameplay wall. Respawns, restored camera positions, and the
simulant runner continue to use the existing square bounds.

## 2026-08-07 — Compact 500 m runner map

The streamed exploration world now spans 500 m × 500 m (`±250 m` from the origin) and preloads 36 coarse chunks.
The same seeded generation and authored play-area exclusions remain active inside the smaller bounds.

## 2026-08-07 — Correct-base local competitor repair

The local visual-table competitor remains scene-only and is implemented in the existing
`visual-table-gb9d082b587` checkout. It is not the separate server-authoritative multiplayer/FPS
lane. The opponent is now a normal-height visible character with a visible seeded weapon. It uses
the same `PlayerVitalsState`, shield/health damage, O₂ projectile cost, movement-speed/trot, and
camera-motion damper mechanisms as the local player. Its muzzle follows the character, and its
line-of-sight shots call the existing weapon path's target callback so the player's ordinary vitals
can actually be damaged. A shotgun applies its full pellet payload. Defeated opponents hide for the
same three-second respawn interval as the player, then return with reset vitals and ammunition at a
new seeded position. The scene still does not alter mahjong engine rules, hidden tile information,
replays, or multiplayer state.

## 2026-08-06 — Visual-table simulant combat prototype

- In the visual table scene, added a seeded prototype opponent system:
  - random opponent-spawn anchor from existing hand anchors (`north`, `east`, `west`)
  - random weapon selected from `WEAPON_IDS` per room-seed stream
  - optional visible marker at the spawn location for tracking combat state
- Added player respawn behavior in the same scene: on kill, the shared camera death tumble remains
  visible for a three-second transition while movement and fire input are cleared. The final 650 ms
  fades to a full-screen black overlay, then `resetToSpawn` samples a seeded point in `WORLD_BOUNDS`,
  settles to ground by physics, rotates the camera to face the map center, and fades back in.
- Extended `WeaponRuntime` with a reusable `fireFrom` function used by player shots and the simulator.
- Simulant fire now uses seeded per-shot spread and capped distance to the player camera, so each attempt
  applies random aim from the same weapon parameters.
- Prototype is intentionally scene-only and does not affect engine rules or game-state logic.

## 2026-08-06 — Procedural weapon pickup distribution

Weapon pickups are scene-only presentation objects and do not alter the authoritative mahjong engine. The scene calls
`generateWeaponPickups(roomSeed, ...)` with the 250 m world bounds, authored play-area reservations, and known coarse
physics obstacles. The generator requests up to 24 copies of every weapon, but the default spacing rule allows at most
one gun inside any 75 m radius, so compact maps return a smaller deterministic set. A seeded sector/cell pass spreads
the candidates across the world; reserved areas, obstacles, and the spacing contract are rejected. The same room seed
therefore produces the same pickup positions, while a different seed produces a different layout. Pickup meshes are
created once with the scene and remain discoverable by traversal; collecting one still uses the existing walk-over or
`E` interaction.

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
  The outer ring follows that motion at 5x; the center dot is tuned to a 5x total displacement without changing
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
  drops into an unrecoverable position, the scene clears movement state, returns to a seeded randomised
  seat-facing-map-center spawn, and writes that safe snapshot before the next HMR reload.
- The debug panel's best-effort `/__codex/visual-debug-state` endpoint persists only an explicit debug-UI
  change. The panel keeps the latest dirty tuning payload in memory and sends it once with `keepalive` on
  `pagehide`; its 500 ms live telemetry refresh never writes the artifact. The Vite middleware also skips
  unchanged scene payloads, so normal rendering cannot create a self-triggered HMR/write loop.
- Normal development mode reads that endpoint before constructing the 3D scene. This avoids a fresh-origin
  default-fog frame on a tunnel and keeps debug mode as the write path; the read is cache-busted, no-store,
  and bounded so a stalled tunnel still falls back to the normal scene.
- The debug lens uses a 90° standing FOV and transitions to 68° when Shift toggles a seated 1.45 eye height.
  Standing movement starts at a 1.5×-base trot (5.1 m/s, 18.36 km/h). Crouching remains half speed and enables a hidden
  upright walk lock; after standing, movement stays at the 1×-base walk speed until a sprint request clears the
  lock. Space keeps the same quick airtime while doubling the jump apex. Double-tapping any WASD or arrow movement
  key engages a 3× sprint that remains active while any movement key is held, so W→A/D/S direction transfers
  preserve sprint speed. If the player is crouched, that same sprint request first performs the normal stand
  transition and then starts sprinting; the stand still costs 5 O₂, and an unaffordable transition leaves the player
  crouched.
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
- The FPS play space uses three 100 m chunks per axis and omits the four diagonal boundary chunks, leaving the central
  chunk plus four axis-aligned edge chunks in a rough circular/five-block footprint. The square movement envelope
  remains `±125 m`; no invisible circular wall is added. The procedural backdrop now runs a higher per-chunk feature density and taller building bounds, while
  props, signs, and utility posts remain governed by the same seeded stream. Weapon pickups use the same full-world
  bounds. Existing authored-area, world-bound, and focus-ramp exclusion checks still guard every generated placement.
- Skyline tuning uses one shared seeded profile: the current density multiplier is `2.85`, district elevation maps to
  `0.65–3.15` metres, and building height receives `1.15 × elevation + 0.75 × featureNoise` as a derived lift. The
  same continuous inputs drive both density and silhouette height, so dramatic districts remain reproducible per room
  seed without special-case building tables.
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

## Reticule-anchored zoom

The seat camera keeps a smooth FOV transition: 90° in hip fire (standing or crouched) and 45° while
explicit zoom is active. Crouching still lowers the eye height, but it does not enter zoom mode.
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
Standing idle restores 12 points per second, walking restores 8, and crouched stationary recovery restores 10. The
1.5×-base standing trot is 5.1 m/s (18.36 km/h), maps one quarter of the way from walk to sprint, and recovers about
5.17 O₂ points per second while moving. Sprinting drains 3.33 points per second (about 30 seconds from full); crouch
walking keeps the reserve flat and does not recharge it while movement is active. A full jump and each transition from
crouch to standing costs 5 points, so roughly 20 consecutive full jumps empty the reserve.

Sprint recovery waits 1.5 seconds, recovery after crouch walking waits 0.5 seconds, and jump recovery waits 0.25
seconds. These delays are stored in the pure state and recovery is integrated for the exact portion of a frame
after it expires. The browser publishes the rounded reserve as `data-player-o2` and renders it as a third
HUD bar.

O₂ is an action reserve. A full jump and a stand-up transition each require the full 5-point cost. If the reserve
cannot pay a full jump, the controller performs a free mini hop instead: its launch speed uses the same neutral
balance as the trot, `12 / (12 + 5) = 70.6%` of the full launch speed, which produces about half the full apex.
The mini hop does not change O₂ or add the full-jump recovery delay. Crouching has no entry cost. Sprinting is allowed
only when the current frame's drain is affordable. When it is not (including at 0%), the controller falls back to the
same 1.5×-base trot rather than stopping movement. Trot occupies 25% of the walk-to-sprint interval, so it recovers
about 5.17 O₂ points per second at the configured +8/s walking recovery and -3.33/s sprint drain (subject to the
existing recovery delay after sprinting).
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
without threshold states outside explicit hold-breath or wall-brace stabilisation. Camera breathing grows smoothly
as the reserve falls while not holding breath, including while stationary.
Zoom uses the same base sway amplitude as hip fire; only holding breath or wall bracing reduces that shared response.
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
reserve-driven instability so the pose is not perfectly static. The wall brace
does not change or drain the player's O₂ state. The contact probe uses the controller capsule gap, supports
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
Each normalized room seed now places all pistol, shotgun, machine gun, sniper, scoped carbine, and submachine gun
pickups from one shared full-world placement stream. No dedicated table-side set remains; every pickup still honours
reserved play-area rectangles and coarse physics obstacles, so seeded pickups do not appear inside authored rooms or
city blockers.

The browser mount owns the presentation combat state: walking through 3.5 m of a pickup auto-equips the nearest
gun, and E equips the nearest pickup while stopped; number keys or Q switch
owned weapons, 0 holsters the current weapon, R reloads, and mouse click fires while pointer lock is active. Mobile users have Fire,
Equip, and Reload actions. Held weapons include a procedural right forearm, palm, and thumb. All six procedural gun
models use a shared near-black finish across their bodies, barrels, sights, and accent details. Each weapon has a
distinct firing profile. The pistol, machine gun, sniper, scoped carbine, and submachine gun fire on the live reticule ray with no random
projectile cone; only the shotgun keeps an inherent seeded pellet spread. Tracer lines, impact sparks, floating pickup labels,
recoil, ammo, reload state, and a six-slot HUD make the loop visible. Shot raycasts stay on authored
scene roots rather than traversing the streamed city, and malformed render subtrees fall back to a miss. Hitscan shots
have no weapon-specific distance cap: they continue to the first render surface, while a miss tracer uses only the
camera's finite far plane to keep its presentation geometry finite.
The held model follows the seat-view state separately from the firing-control state, so it remains visible
in the right hand before pointer lock is acquired.
The camera is part of the rendered scene graph so its attached view-model meshes are included in the render.
The live reticule presentation function feeds both the CSS sway and the weapon's aim NDC; the weapon is lowered
on Y and continuously rotates toward the moving reticule dot. Reloading uses one generic snappy pose for every
weapon: the muzzle pitches skyward, pauses for a small clip-change nudge, then returns to the reticule.
Reload duration is not a per-weapon tuning constant. `weapons.ts` derives total trigger-pull damage as
`damage × pellets`; a pull at or above 100 damage uses individual round reloads, while a lower-damage pull uses a
full-clip reload. Clip timing is `0.01 × damage × magazine size`, so the pistol takes `28 × 12 × 0.01 = 3.36 s`
and the machine gun takes `12 × 30 × 0.01 = 3.6 s` for a magazine. Round timing is `0.01 × total trigger-pull
damage` per inserted bullet or shell: the sniper takes `1 s` per 100-damage bullet, and the shotgun's eight
16-damage pellets total 128 damage, so it takes `1.28 s` per shell. Round reloads insert one reserve round at each
interval until the magazine is full; new weapon definitions inherit this classification and formula by default.
The pose lifts during the first 10% of that interval, keeps the gun raised for the middle 80% while the reload work
plays, and recentres during the final 10%. For round reloads, the first lift is held across every shell/bullet interval;
the final 10% recenter only starts after the last round or an interruption. Round reloads are interruptible between
rounds: holding fire shoots as soon as the next bullet or shell is chambered and cancels the pending next insertion.
The final 0.12 seconds of each reload interval gives the held gun a brief upward insertion impulse; the shell/bullet or
full clip is committed when that impulse ends, so the UI and chamber timing finish together. Clip reloads remain atomic.
The shared camera-motion damper also owns the held viewmodel posture: standing uses a right-hand hip-fire offset,
crouching uses an intermediate raised offset, and explicit zoom smoothly centres and raises the weapon fully onto
the optical axis using the original crouched sight height, preserving existing ironsight and sniper-scope alignment.
The weapon continues to aim and fire through the same reticule ray. A double-tap movement sprint clears the persistent
right-mouse zoom toggle before acceleration begins.
Each procedural weapon now carries its own top-rail sight profile: an open two-ear rear notch, a forward post, and
a small black bead make the sight picture readable when crouched and zoomed. Those meshes are camera children
and inherit the same reticule aim quaternion, so the sights do not introduce a second or divergent firing direction.
The receivers now stay low and the sight rails are split to leave a clear center channel. The pistol's rear detail and
machine gun's former full-width top accent sit off-axis, so neither covers the centered reticule.
The sniper now adds a real camera-child scope tube, rings, tinted glass disk, and lens anchor. While the sniper is
equipped and explicit zoom is active, `SniperScopeLensShader` runs after Bokeh and samples a clean world-only render
texture inside the projected glass. A hidden secondary camera aims through the live reticule with a true 5× tighter
FOV and renders only a square 2×-supersampled lens target, so bullet-hole decals receive fresh geometry pixels instead
of a stretched viewport crop. Floating sprites and weapon/UI overlays are excluded while the bullet-hole root remains
visible. Catmull–Rom bicubic reconstruction, a feathered circular mask, restrained glass colour split, and diagonal
cyan X marks keep the optic legible, then `OutputPass` performs normal tone mapping.
Right-mouse zoom remains independent from left-Command hold-breath. Because the mask is projected from the actual scope anchor after
viewmodel transforms, it follows sway, recoil, reload, and reticule-relative aim while the weapon ray remains authoritative.
The scope tube is open-ended at the rear and the glass sits just ahead of its rim; this avoids a capped-cylinder face
covering the lens with a black panel.
The optic assembly is authored at a 0.11979078 m local Y height over the rifle sight axis, so its projected glass centre stays
on the reticle while the shared crouch and zoom viewmodel transforms remain centralized.
Render hits attach a typed `lastWeaponHit` record to the struck object for local experimentation; this is
not an authoritative enemy, damage, replay, or multiplayer system.

## Penthouse armory chart

The penthouse west wall now carries a readable `WeaponDamageAmmoChartSign`. Its chart is generated from
`WEAPON_CHART_ENTRIES`, which is derived from the six playable weapon definitions, so it stays aligned with the
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

The visual-table overlay uses one compact top status rail for live preview state, round/seat, area, room identity, and
the current movement/combat state. The rail is intentionally segmented so the high-value state is readable without
turning the scene into a dashboard. Shield, health, and O₂ remain in a matching `Player systems` card below it; low
O₂ and critical/down health use a stronger value accent, while the bars retain their existing semantic colours.

The `Loadout` card keeps the active weapon and ammunition readout in the lower-right corner, including on narrow touch
layouts. Its heading and slot treatment now match the vitals card, and reload state uses the same warm warning accent
as the top status chip. The lower-left and centre remain available for movement controls and the scene.

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

## Traversal weapon presentation

The first-person controller sends active ledge vault, wall-hang, and wall-climb state through the same centralized
camera-motion damper that drives weapon put-away. While traversal is active, the held gun rotates muzzle-down and
drops below the frame. The damper holds that exact lowered pose for the traversal, then runs the normal raise phase
when the player returns to ordinary movement. This does not alter physics, weapon inventory, firing, reload, or aim-ray
authority; it only keeps the viewmodel out of the way during parkour movement. Coverage is in
`apps/web/src/scene/camera-motion.test.ts`.

## Reload movement

Reloading caps the speed the player was requesting at the existing 1.5×-base “trot” rather than forcing every
movement input to that speed. The crouch-enabled upright walk lock stays at walk speed; unlocked upright movement
stays at trot, while a sprint request is reduced to trot for the reload sequence and then resumes full sprint only
when the next O₂ drain slice is affordable. If the reserve cannot pay that slice, movement falls back to the neutral
jog. Crouch speed remains the higher-priority posture limit.

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

## Held-breath and wall-brace stability

Holding breath keeps the O₂ reserve drain and zero-reserve release rules, but it does not let the falling reserve feed
back into breathing sway. While the hold is active above zero O₂, reticle and weapon sway use only their baseline
breathing response, and the camera uses the rested breathing amplitude and frequency before applying the 50% hold
factor. This prevents holding breath from causing the heavy breathing and shaking it is intended to control.

Wall bracing still applies its independent 50% factor to the existing reserve-driven response. If the player leans on a
wall while holding breath, the factors compose to 25% for reticle, weapon, and stationary camera breathing motion.

## Damage-driven barrel heat

The visual weapon prototype tracks a separate Celsius temperature for each gun. Every projectile that hits a render
surface adds `0.25°C × damage` using the weapon's per-bullet damage; a shotgun therefore adds one pellet's damage for each
pellet that hits. Misses do not heat the barrel. Temperature starts at the shared `20°C` ambient value, a very faint
red glow begins at `500°C`, and the maximum bright cherry-red red/emissive blend is reached at `800°C` with material
emissive intensity capped at `1`. Seven consecutive `100`-damage sniper hits reach only `195°C`; twenty hits begin the
glow ramp and thirty-two hits reach the maximum temperature response.
The linear glow map places `650°C` at half brightness and clamps temperatures at or above `800°C` to maximum.

Cooling follows Newton's law rather than a linear timer. Each update applies
`T = 20 + (T - 20) × exp(-0.003 × elapsedSeconds)`, so the barrel cools quickly at first and increasingly slowly as it
approaches ambient. Cooling continues while the weapon is holstered or another weapon is equipped. Both the held view
model and world pickup copies use the same weapon temperature state.

## Pooled barrel smoke

Each held weapon now owns a fixed pool of 192 billboard smoke sprites and one shared 64×64 procedural alpha mask.
Every trigger pull emits a dense gray muzzle puff even when the shot misses. Puff size and count use the round's
total damage (`damage × pellets`), so the shotgun and sniper produce much larger clouds than the machine gun. Each
puff starts at zero opacity, follows a normalized sigmoid fade-in over `0.24 s`, then rapidly expands with an ease-out
logarithmic curve over the first 45% of its five-second life and lingers at maximum size for the remainder. The plume
inherits the nozzle's current world velocity, diffuses outward, then slows while rising. Once its rendered opacity falls
to `0.01` or less, it is hidden and returned to the pool immediately; it no longer occupies a slot invisibly until the
five-second hard lifetime. Thermal steam keeps the five-second lifetime and uses the same clear-out threshold. Opacity
follows that expansion: source-sized smoke is bright, while the max-size linger is transparent. Thermal wisps use the
pale white steam color, scale with a restrained longest-barrel ramp, and emit from one inverse-size equation: smaller
parametric plumes emit more frequently. They use the same logarithmic expansion and inverse-opacity lifecycle as muzzle
smoke, with a square-root damage response to avoid oversized shotgun/sniper steam.
The glow ratio still eases in from 35%; wisps rise with a small deterministic curl, expand, and fade without collision or
shadow work. The pool is attached to the scene world effects root, so smoke remains in place when the player turns,
walks, holsters, or switches weapons.

Smoke is a rendered world effect. The held muzzle samples the centralized camera/viewmodel pose at spawn, then the
particle continues in world space with depth testing and normal Bokeh participation. Smoke variation uses the
room-seeded RNG stream `<room>|weapons|smoke|v1`, separate from shot spread. Pickup copies show barrel glow but do not
emit smoke.

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

## Held-weapon perspective alignment

The held weapon does not add a second breathing oscillator after it aims at the live reticule ray. Camera breathing,
aim sway, head bob, roll, recoil, recovery, and the camera-attached viewmodel therefore remain one unified presentation
path. This prevents the weapon sights from drifting away from the reticule when O₂ is low. The machine gun and other
ordinary weapons still use the deterministic live ray with no random projectile cone; only the shotgun has inherent
seeded pellet spread.

## Per-shot audio

Each accepted trigger pull creates one deterministic procedural shot, including a miss. No recorded gunshot samples are
used. The only sound inputs are `damage` and the generated weapon `barrelLength`; the shot does not use room seed,
pellet count, heat, or any other gameplay state. A fixed-seed `whiteNoise` buffer provides the static source, so equal
parameters resolve to the same profile and noise sequence.

The four layers are mixed at the same shot start time:

| Layer            | Synthesis and processing                                                                                           | Parameter response                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Muzzle blast     | 50 ms white noise, instant attack, exponential decay, low-pass filter, light compressor, and fixed soft saturation | Damage lowers playback pitch and cutoff (1.15→0.75 pitch, 8200→1600 Hz) and raises level (0.8→1.3)                 |
| Crack            | 6 ms white-noise burst through a high-pass filter                                                                  | Short barrels are louder; the base mix is 25%                                                                      |
| Mechanical click | 10 ms square-wave pulse with an exponential envelope                                                               | Fixed 10% mix; damage and barrel length do not change it                                                           |
| Tail             | White noise with exponential decay and low-pass filtering                                                          | Barrel length extends the tail from 80 to 250 ms, lowers its cutoff, and slightly reduces its level (50% base mix) |

The damage curve uses configured per-bullet damage, not a shotgun's total pellet payload. The barrel curve uses the
longest generated model barrel as the long-barrel endpoint. A scene-local `AudioContext` is created or resumed from the
firing gesture; stopped source and filter nodes disconnect after their envelopes finish. Every layer routes through the
same camera-following Web Audio listener and a positional output. The spatializer uses HRTF placement with inverse
distance rolloff, while a bounded 1–32 m proximity envelope also protects browsers that expose only the legacy gain
path. Player muzzle audio uses the measured world muzzle position; simulated opponent shots use their world origin.
Browsers without Web Audio or with a blocked autoplay context silently keep the visual shot effects and do not block
gameplay.

## Parametric carbine and burst submachine gun

The visual armory now contains six generated weapon profiles. The two new profiles use only primitive gameplay and optic
inputs; shared functions derive their reload mode, reload duration, recoil, shot sound, heat, smoke, and presentation.

| Weapon         | Primitive profile                                                                                                  | Derived presentation                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Scoped carbine | 36 damage, 1 projectile, 18-round magazine, 0.42 s projectile interval, 3.2× scope                                 | Clip reload from `damage × magazine`, moderate recoil and smoke, reusable projected optic            |
| Submachine gun | 9 damage, 1 projectile, 36-round magazine, 4-round burst, 0.045 s intra-burst interval, 0.24 s next-burst cooldown | Low per-projectile damage, fast four-shot burst, clip reload, per-projectile heat/recoil/smoke/audio |

`burstSize` is the number of projectiles in one trigger burst. `fireIntervalSeconds` spaces projectiles inside that
burst, while `burstCooldownSeconds` controls the pause before a held trigger starts the next burst. A released trigger
does not cancel an active burst. The runtime still decrements one magazine round and emits one authoritative shot/effect
record per projectile, so burst fire does not bypass hit, heat, recoil, smoke, audio, or HUD accounting.

Scope geometry is described by each definition's optic profile (`magnification`, lens radius, tube dimensions, ring
dimensions, sight-line height, and lens colour). The shared scope pass projects the actual camera-child glass and uses
that profile's magnification for its narrow-FOV world feed. Explicit zoom is required; crouching alone does not enable
the carbine or sniper optic. Number-row keys `5` and `6` select the carbine and submachine gun, and `Q` cycles all six
owned weapons.

The armory chart and pickup set are generated from `WEAPON_DEFINITIONS`, so changing a primitive profile
automatically changes its HUD/chart row, pickup model, reload timing, damage-scaled effects, and optic/burst metadata.

## Bullet pass-by audio

Weapon shots may produce a separate bullet-whizz voice when the pellet ray passes near the listener. Its tone is derived from the same resolved gun profile as the muzzle report and uses an 80/20 mix: band-pass white noise provides the air-turbulence "ssshhh" layer, while a sine oscillator provides the whistle layer. Damage selects a high-to-low pitch range from approximately 5 kHz to 2.2 kHz for light rounds and 2.5 kHz to 700 Hz for heavy rounds. Closest approach controls gain, band-pass width, and sweep depth; projectile speed controls the short 28-100 ms duration. The shot's left/right position controls stereo panning. The whizz uses the same positional output and 1–32 m proximity envelope as every muzzle layer, so no weapon sound bypasses distance attenuation. This keeps the pass-by effect coupled to weapon identity while preserving the existing muzzle sound.

Incoming simulant fire uses both the pass-by voice and its muzzle report. The muzzle report is delayed by source distance at 343 m/s; the whizz uses the profile-derived 280-900 m/s projectile timeline plus the final sound path from the pass point, so a distant incoming round is heard as a whizz first and the shot later. Short low-damage weapons trend subsonic; heavy long-barrel weapons trend supersonic. A scope does not change velocity. Timing follows the intended projectile travel distance rather than stopping at the first render-surface impact.

## Simulant movement

The scene-only simulant starts at a seeded random ground azimuth on the 125 m world radius. Each
frame it moves toward the player at the shared 1.5×-base trot speed (5.1 m/s), stops 2.4 m away,
and keeps only its runner body and marker visible. A private instance of the shared perspective damper
drives the body bob and roll during the approach; it has no weapon or AI damage path.
