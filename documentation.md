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
  preview remains usable; the debug-only overhead view and visual panel remain behind `?debug=1`.
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
  while movement speed drives a small damped vertical viewport bob that settles when the player stops.
- First-person movement uses the Apache-2.0 `@dimforge/rapier3d-compat` runtime for a kinematic character
  controller. The first collision slice supplies simplified static colliders for the world floor and table body;
  render meshes remain visual-only, and tile/furniture dynamics are intentionally not inferred from every mesh.
  Rapier loads asynchronously from its inlined WASM; if initialization fails, the previous bounded movement path
  remains available and the scene marks `data-physics-ready="fallback"`.
- Collision coverage now expands beyond the table: the environment, generated room fixtures, glass, walls,
  furniture, and gateway are converted from meaningful render meshes into coarse world-space AABB colliders.
  Streamed city buildings, props, and skybridges contribute explicit rotated boxes as chunks enter the 3×3
  lookahead window; Rapier replaces that streamed collider set when new chunks are appended. These boxes are
  solid while props are upright and are replaced by dynamic bodies when a knockable prop is hit, while floors and
  decorative strips stay out of the blocking set. This keeps collision cheap without making every tile or triangle
  a physics body. Appended chunks remain resident for the life of the scene, so returning to a neighborhood does
  not change its collision layout.
- When airborne and moving into a nearby top edge, first-person movement can perform a short edge-grab: if the
  player is within a small height and approach window, the controller snaps the camera to the top of that
  surface instead of stopping dead. This produces the requested parkour edge climb feel while keeping collision
  authoritative through the Rapier capsule.
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
- The debug lens uses a 90° standing FOV and transitions to 68° when Shift toggles a seated 1.45 eye height.
  Seated movement is half speed with slight momentum; Space keeps the same quick airtime while doubling the
  jump apex. Double-tapping W engages a 3× sprint that remains active while any movement key is held, so
  W→A/D/S direction transfers preserve sprint speed.
- Pointer-lock state fades the instructional overlays while the scene is under direct control.
- The scene resolves an explicit `high`/`medium`/`low` presentation preset or uses conservative device
  memory/core signals for `adaptive`. Adaptive selects medium unless the browser reports at least 8 GB and
  8 logical cores, keeping DPR, shadows, and post-processing bounded on unknown or software-WebGL devices;
  high remains an explicit debug choice. Bokeh is on by default only in high and can be toggled in debug;
  GTAO remains an explicit reduced-resolution opt-in. Focus follows the nearest non-overlay gaze surface,
  with a stable far fallback and a tight tile-neighborhood assist. The pass uses a restrained 17 mm eye
  approximation with a 1 arcminute central acuity threshold: bright rooms settle near a 2.5 mm pupil,
  ordinary indoor light near 4 mm, and dark rooms expand toward 6.5 mm. That pupil drives the aperture and
  hyperfocal distance, so close tiles can soften while the room and skyline stay legible. Shader readiness
  uses a cancellable first-render task without forcing a synchronous compile that can block software WebGL;
  the composer ends with `OutputPass`, rendering pauses while the document is hidden, and setup shows a
  warm loading treatment. The debug panel reports focus distance, target kind, pupil size, and current blur
  intensity for visual tuning, with a 0–25× DoF-intensity slider; 1× is the restrained baseline and higher
  values are available for stronger cinematic bokeh experiments. The practical blur envelope uses a smooth
  eased falloff: with the reference pupil, near-zero focus is full strength, 2.5 m is roughly one quarter,
  and 6 m is effectively sharp; pupil dilation scales that cutoff in low light.
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
  immediately; each individual control can then be overridden without remounting the app. Repeated skyline
  windows are batched with `InstancedMesh`, and the Empire State, One Vanderbilt, and Chrysler silhouettes
  use distance-based `LOD` fallbacks. Every debug control is persisted in validated v1 `localStorage`,
  including the all-skyline and per-layer visibility switches, and `Reset debug defaults` restores the
  device-appropriate defaults and rewrites the stored preferences.
- The development map is divided into three independent ground-level play areas: the penthouse at the origin, the
  looking focus room 60 m east, and the climbing gym 60 m west. Each area is marked as a 50 m x 50 m square with a
  10 m open gap to its neighbor. Generated city buildings, props, windows, bridges, and beacons are rejected from
  all three footprints, so the authored rooms remain visually and physically separate.
- The `Focus calibration` debug preset now opens the looking focus room on the shared ground plane. The hallway still
  marks each metre from `0` through `2H` and places the close, halfway, hyperfocal, and double-hyperfocal targets,
  but the former elevated deck/ramp is no longer part of the navigation path.
- The `Climbing gym` debug preset opens the west play area, where the compact ledge field and handrails remain
  available for repeatable Mirror's Edge-style edge-grab tuning without sharing collision space with the penthouse
  or focus room.
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

## Penthouse level pass

The visual penthouse occupies the complete 50 m x 50 m development play space. Its room shell is five metres high, the north side is a continuous floor-to-ceiling window wall, and the table stays centered in a larger inset. Perimeter furniture and map-authored accents are intentionally sparse so the table and skyline remain the focal points. The authored map floor is 48 m x 48 m to leave a clean structural margin inside the shell.

## Known limitations

- Milestones 0–4 are complete. Milestone 5 is in progress; Milestones 6–10 remain pending.
- Persistence, protocol, coach, and tile UI package slices exist but have not yet been accepted as
  complete milestones or wired through the placeholder CLI, server, and browser clients.
- The persistence slice still needs deletion/privacy, recovery/export, migration, restart/resume,
  and coverage repairs before Milestone 5 can close.
