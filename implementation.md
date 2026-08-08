# Implementation status

## 2026-08-08 — Warehouse lens-flare sprites

- Added 26 deterministic `THREE.Sprite` elements: halo and horizontal streak pairs for eight high-bay fixtures, the central
  spotlight, and four emergency wall fixtures.
- Generated one 64×64 radial/streak `DataTexture`, using additive, tone-mapped-off materials with depth testing and no depth
  writes. Sprites are presentation-only (`weaponRaycastIgnore`, `dofIgnore`, `physicsIgnore`, and `fog: false`) and the
  texture is included in `DebuggingTwoMapResources.textures` for disposal.
- Kept the fixed Warehouse-only linear fog (`warehouse-linear-fog-v1`) and recorded both presentation generations on the map
  root. Map-catalog coverage locks sprite count, source elements, material flags, texture dimensions, and fog identity.

## 2026-08-08 — Zoomed melee throws

- Starting a gun or held-prop melee action now clears both persistent zoom inputs through the shared aiming path, so the
  camera, reticule, and viewmodel leave zoom together.
- A primary click while a melee-only prop is drawn and zoom is active throws it instead of swinging. Launch speed uses the
  same volume-as-weight proxy as melee damage: smaller props reach up to `34 m/s`, larger props remain useful at a bounded
  `12 m/s` minimum, and the current player velocity is preserved.
- The throw currently launches the recoverable ragdoll only; damage from a high-speed thrown prop is intentionally deferred.
- Validation: strict typecheck, focused melee/weapon lint, web production build, and HMR request pass. The next server-owned
  test-bus snapshot is still required for this latest dirty fingerprint.

## 2026-08-08 — Size-based melee attack for every gun

- Added an `F` key melee action for every fixed gun. The attack reuses the shared melee swing pose, audio, O₂ cost, raycast,
  shield/blood response, momentum damage, and ragdoll stopping-power paths used by picked-up melee objects.
- Added physical volume and longest-axis reach values to each gun definition. The shared resolver therefore makes a larger
  gun swing more slowly, reach farther, and deal more base damage; sprinting, opposing motion, and falling still apply the
  existing bounded momentum multiplier.
- Updated the loadout HUD with the `F melee` control and the active gun's size-derived reach, volume, damage, swing speed,
  and O₂ cost. Focused weapon coverage locks the size-to-damage/speed relationship.
- Validation: strict typecheck passes. The repository test bus, production build, lint, HMR, and rendered browser acceptance
  remain to be checked on this dirty checkpoint state.

## 2026-08-08 — Opaque-blinking Warehouse rack indicators

- Replaced the tiny single-face pixel planes with eight thin horizontal boxed status bars around all four vertical faces of
  each rack.
- Split the bars into one steady and three room-seeded blink groups. Each group has an opaque base plus one shared additive
  alpha glow overlay; all eight bar meshes are fog-exempt so the black Warehouse haze cannot erase them.
- The map regression locks the four-sided bar layout, three opaque blink meshes, four glow overlays, fog exemption, and
  deterministic grouping.

## 2026-08-08 — Warehouse aisle fog

- Added a warehouse-only linear fog pass using a dark blue-grey haze (`near = 10 m`, `far = 92 m`) so long aisles fade
  into the black data-center background while nearby crates, LEDs, and the central spotlight stay readable.
- The legacy debug fog preference remains normalized to zero; scene initialization now reapplies the fixed warehouse haze
  after that compatibility path, and the authored penthouse remains fog-free.
- Added map-catalog coverage for the warehouse fog type and parameters. Rendered browser acceptance still requires a
  connected Vite browser; none is available in this worktree.

## 2026-08-08 — Baked central Warehouse floor pool

- Added `warehouse-floor-area-bake-v1-center`, a deterministic floor lightmap containing only a subdued warm pool around
  the map centre. The static platform now uses a lightmapped `MeshBasicMaterial`, world-aligned second UV channels, and
  no dynamic shadow participation.
- Set the platform diffuse base to exact black (`floorColor: "black"`); the lightmap remains available for the baked-floor
  contract but cannot lift the black base. The separate yellow/red emissive markers and spotlight pool remain visible.
- The central spotlight remains for crates and other dynamic geometry; the floor no longer evaluates that light per
  fragment. The map resource disposes the new floor texture alongside the four wall textures.
- Updated the Warehouse regression for the fifth lightmap and baked platform metadata. Server-owned bus run
  `1786190887339-42883-e07a2107` passes all 553 assertions; the smoke check reports a centre red value of 10, a zero
  corner value, and one runtime spotlight. HMR was requested, but no connected checkpoint browser is available for
  rendered acceptance.

## 2026-08-08 — Dim lower-band Warehouse wall bake

- Retuned `warehouse-wall-area-bake-v2-dim-bottom` so the wall lightmaps fade from a dim floor glow and emergency halo to
  exact black at 4.25 m. The wall tops and top faces therefore disappear into the black warehouse background.
- Reduced the warm centre and yellow spill contributions; emergency fixtures remain visible as emissive meshes with only a
  soft baked red tint on the nearby lower wall.
- Updated the Warehouse regression for the new bake generation. Server-owned bus run
  `1786190287312-42883-205f2208` passes all 553 assertions; the smoke check reports an all-black upper half and one
  central spotlight. HMR was requested, but no connected checkpoint browser is available for rendered acceptance.

## 2026-08-08 — Warehouse rack pixel LEDs

- Replaced each Warehouse rack's five front status bars with an 8-by-7 grid of 0.04 m square emissive pixels. The grid
  keeps deterministic spacing, steady/blinking groups, and the presentation-only raycast contract, so rack faces read as
  dense server indicators instead of flat light rows.
- Randomized each pixel's steady/blinking membership and phase-group assignment from a room-seed-derived RNG. Reopening
  the same seed reproduces the same pattern, while different seeds no longer produce a fixed checkerboard.
- Added a map-catalog regression for the pixel-grid metadata, full per-rack pixel count, and LED geometry dimensions. The server-owned bus and
  visible browser/HMR checks remain separate acceptance steps.

## 2026-08-08 — Dark-room accommodation pacing

- Focus accommodation now receives the live pupil diameter. The reference 4 mm pupil keeps the existing near/far damping,
  while the fully dilated 6.5 mm Warehouse pupil reduces both damping values by 20%, extending focus acquisition to about
  1.1 seconds near and 0.8 seconds far. This is documented as a modest low-contrast/aberration approximation; it does not
  alter the hyperfocal-distance or Bokeh formulas.
- Added a pure regression for the dark-adapted slowdown. Browser/HMR acceptance remains separate from the unit-bus result.

## 2026-08-08 — Baked Warehouse wall area lighting

- Added a deterministic `warehouse-wall-area-bake-v1` lightmap for each of the four perimeter walls. The generated
  `DataTexture` stores warm centre illumination, yellow perimeter spill, and a soft red emergency tint without creating
  any extra runtime light.
- Each wall now has a dedicated second UV set (`uv1`, with an explicit `uv2` alias), a `MeshBasicMaterial` lightmap, and
  `dynamicLightingDisabled` metadata. Walls do not cast or receive dynamic shadows, so the baked contribution replaces
  their per-fragment material lighting and shadow-receiver work while crates retain the real central spotlight.
- The four textures are returned through the map resource texture list for disposal. Map-catalog coverage checks the
  deterministic texture names/dimensions, UV channels, baked material metadata, and unchanged zero
  `RectAreaLight`/`PointLight` counts. The server-owned bus run `1786189687522-42883-55d5eee4` passes all 553 assertions;
  strict typecheck, focused ESLint, Prettier, the web production build, and diff checks pass. HMR was requested with no
  connected checkpoint browser available, so rendered visual acceptance remains pending.

## 2026-08-08 — Yellow perimeter LED line

- Replaced the multicolour corner-only floor LEDs with one deterministic yellow rectangular LED line around the full
  warehouse perimeter. The line uses one shared `InstancedMesh`, stays at floor height, and adds no runtime light.
- The perimeter path is inset from the four walls, includes all four corners, and spans the complete north, east, south,
  and west edges with yellow-only `0xffd42e` emissive material.
- Updated the map-catalog regression for the yellow material, deterministic edge extents, and greater-than-100 LED roster.
- The server-owned bus run `1786188187633-42883-ec845df9` passes all five map-catalog assertions; its two unrelated
  failures are the core-engine property timeout and dirty-lane ragdoll test. Focused ESLint, Prettier, and diff checks pass.
  The web build and strict typecheck remain blocked by unrelated duplicate ragdoll declarations in `mahjong-table.ts`.
  HMR was requested; no browser session was opened.

## 2026-08-08 — Warehouse dark-room eye adaptation

- Kept the warehouse's display-exposure estimate separate from the eye-adaptation estimate. Its isolated pools and black
  background now drive the virtual pupil to the dark-room ceiling (6.5 mm) even when auto exposure is compensating for
  the scene, so close focus uses the larger aperture and stronger depth-of-field blur expected in low light.
- Added a pure regression for the warehouse adaptation split. No browser session was opened; HMR remains the next visible
  check while a connected development server is available.

## 2026-08-08 — Warehouse floor LEDs without runtime area lights

- Removed the four warehouse `RectAreaLight` corner probes and all sixteen emergency `PointLight` objects. The central
  unshadowed spotlight remains the single real warehouse light, so the visible lighting effect no longer allocates the
  removed runtime light resources.
- Replaced the 64 hanging Christmas spheres with shared flat rectangular emissive LEDs at floor height in the same four
  corner runs. The twelve center-lane emergency markers are also flat red floor rectangles, preserving their deterministic
  lane positions and visible guide role without point lights.
- Updated the map-catalog regression to require zero warehouse point or area lights and to lock the floor-level rectangular
  LED geometry. The server-owned bus run `1786187587467-42883-3149cff4` passes all five Warehouse map assertions;
  its aggregate result is 547/548 because the unrelated core-engine property test failed. Strict typecheck, focused ESLint,
  Prettier, `git diff --check`, and the production web build pass. HMR was requested; no browser session was opened.

## 2026-08-08 — Strong melee stopping power

- Added a deterministic melee stopping-power stat derived from resolved prop damage (`0.12 m/s` per damage point,
  capped at `18 m/s`). The stat travels with every melee pickup and is shown beside the melee damage in the HUD/debug
  telemetry.
- Player-like simulant contacts now apply that stronger impulse through the existing stagger/knockback seam, including
  momentum-scaled hits. Environmental ragdolls use the same value when available while preserving the old swing-speed
  fallback for direct world tests and callers.
- Added pure stopping-power coverage and a Warehouse ragdoll regression that checks the resolved horizontal impulse.
- Validation: the server-owned bus run `1786187587467-42883-3149cff4` passes all melee and Warehouse assertions and
  547/548 assertions overall; the one failure is the unrelated `packages/test-fixtures` core-engine property test.
  Strict typecheck, targeted ESLint, Prettier, `git diff --check`, and the production build pass. The Vite HMR request
  was accepted with a stopping-power verification note; no connected browser is available for rendered acceptance.

## 2026-08-08 — Warehouse center-lane emergency markers

- Added twelve deterministic, low-level red point-light markers along the two main center lanes (`x = -12` and `x = 12`),
  with six lights per lane at regular `z` intervals. Each marker uses a tiny emissive lens, short falloff, and
  `castShadow = false`, so the lane reads as an emergency guide without adding shadow-map work.
- Added map-catalog regressions for the `lane-emergency-lights-v1` group, exact marker positions, color, count, and
  no-shadow contract. The server-owned bus run `1786186687595-42883-e9d4b3b6` passed all five map-catalog tests;
  its aggregate snapshot was 546/547 because the unrelated core-engine property assertion failed. The web production
  build, focused ESLint, Prettier, diff checks, and strict typecheck pass. HMR was requested for the combined Warehouse
  emergency-light and unshadowed-spotlight change; no connected-browser visual acceptance is claimed.

## 2026-08-08 — Route unshielded melee hits through blood effects

- Melee combat now sends the resolved impact point, direction, damage, and post-hit shield result
  through the existing weapon presentation runtime. Hits on the local simulant with no shield emit the
  same dark-red cloud and nearby-surface stain as projectile hits; shielded or non-damaging contacts do
  not emit blood, while shield absorption still emits the cyan shield spark.
- Added the melee impact point to `MeleeHitContext` so the visual effect is anchored to the actual swing
  contact rather than a guessed camera position. The shared shield-before-health reducer remains the
  authority for the blood gate.
- Validation: strict typecheck, web production build, targeted ESLint for `melee.ts`, Prettier, and
  `git diff --check` pass. The latest server-owned bus confirms the melee, weapon, and table scene
  suites pass; its remaining failures are unrelated dirty-lane core-engine and Warehouse map-catalog
  assertions. HMR was requested, but no connected browser was available for rendered acceptance.

## 2026-08-08 — Warehouse unshadowed lighting and emergency fixtures

- Removed the Warehouse central spotlight shadow-map configuration. The spotlight, visible cone, and floor pool remain,
  but every Warehouse light now has `castShadow = false`, so the map no longer renders a raster shadow pass.
- Added four low-intensity red wall-mounted emergency fixtures at the north, east, south, and west walls. Each fixture
  has an emissive red lens and one short-range unshadowed point light; the generation marker is `emergency-lights-v1`.
- Updated the map-catalog regression to lock the no-shadow lighting contract and the four emergency-light roster.
- Validation: server-owned bus run `1786186687595-42883-e9d4b3b6` passes the full Warehouse map suite, including the
  no-shadow spotlight and emergency-light assertions. The snapshot passes 546/547 assertions; its only failure is the
  unrelated dirty-lane `packages/test-fixtures` core-engine property test. Strict typecheck, focused ESLint, Prettier,
  `git diff --check`, and the production web build pass. No browser or HMR acceptance is claimed.

## 2026-08-08 — Warehouse Christmas corner lighting

- Added deterministic Christmas-light garlands to all four warehouse ceiling corners. Each corner has two sagging
  cable runs along the adjacent walls, with 64 colored bulbs using shared geometry/material resources.
- Added four unshadowed `RectAreaLight` probes and subtle glow panels aimed into the corners. They provide a broad fake
  warm fill without adding shadow-map renders; all Warehouse lights remain unshadowed.
- Added map-catalog regressions for the four corner probes, `christmas-corners-v1` generation marker, eight cable runs,
  and the complete 64-bulb roster. The server-owned bus run `1786185788706-42883-0d22db80` passed all five map-catalog
  tests, including the corner-light assertions; its aggregate snapshot was 535/541 because six unrelated analysis,
  core-engine, and simulation assertions failed. Strict typecheck, focused ESLint, Prettier, diff check, and the web
  production build pass. HMR was requested with a Christmas-light verification note; no connected-browser visual
  acceptance is claimed.

## 2026-08-08 — Warehouse melee tool roster

- Replaced the warehouse's generic bat, shovel, and steel-bar pickups with a steel pipe, fire extinguisher, pipe wrench,
  screwdriver, fireman axe, and box cutter alongside the existing crowbar and hammer.
- Replaced the shared rounded stick mesh with eight deterministic procedural silhouettes. Tool geometry is selected by the
  spawn kind, reused for the held viewmodel, and measured for the matching physics half-extents.
- Kept the eight deterministic perimeter spawn positions and the shared melee pickup, ragdoll, drop, and hit runtime;
  only the warehouse prop identities, scales, and colors changed.
- Added a regression that locks the warehouse display roster to these eight context-appropriate tools.
- Validation: the server-owned bus run `1786189387410-42883-9e721863` passes 553/553 assertions, including the new
  roster and warehouse map tests. Strict typecheck, the production web build, targeted ESLint, Prettier, `git diff
--check`, and the explicit Vite HMR request pass. Full repository lint remains red on the pre-existing dirty
  checkpoint lane; no connected browser was available for rendered acceptance.

## Canonical state

- Common repository: `/Users/nv/repos/0x4007/hk-mahjong-coach`
- Worktree: `/Users/nv/repos/0x4007/hk-mahjong-coach/.codex-worktrees/8-august-checkpoint`
- Branch: `august-8-checkpoint`
- Reconciliation base: `9e52fd01e76ead42dae3ddea102a307a2e4b121e`.
- Implementation lane: one writer in this checkpoint worktree. The pre-existing `main`, `parametric-guns`,
  `visual-table`, and other worktrees remain preserved and are not reset or cleaned.

## 2026-08-08 — Directional wall cover

- Cover eligibility now uses a horizontal 90° cone centered on the selected wall face. The player's view must point
  toward the wall within 45°; a parallel view or a back-to-wall view cannot arm cover.
- Facing-cone filtering happens before nearest-wall selection, so an invalid nearer wall cannot hide a valid cover wall
  ahead. An active stance clears before movement projection when the player turns outside its cone, removing the snap and
  wall-tangent stick on that frame.
- Physical wall contact remains available for collision, diagnostics, and the existing independent wall-braced aim;
  side or rear contact alone cannot select a cover source or apply cover sticking.
- Added pure wall-contact regressions for front-facing, boundary, parallel, and rear-facing directions.
- Validation: the server-owned bus run `1786183087284-42883-7cc9abb1` passed both wall-contact and scene suites
  (536/537 assertions overall; the one failure is an unrelated core-engine property timeout). Strict typecheck,
  web production build, targeted wall-contact ESLint, Prettier, and `git diff --check` pass. The dirty scene file still
  has unrelated repository lint diagnostics. No worktree-local Vite server or connected browser was available for HMR
  or rendered acceptance.

## 2026-08-08 — Warehouse industrial scene

- Replaced the compact authored `debugging-02.json` layout with the independent
  `apps/web/src/scene/debugging-two-map.ts` generator. It now creates a seed-derived warehouse of exact 1 m cubic
  crates: a sparse field of roughly 700–1,200 rendered boxes in varied towers, with a clear centre aisle and cross
  aisles. Adjacent cubes use a 0.01 m visual seam while their geometry remains exactly 1 m on every axis. The
  generator uses one coarse static collider per stack, plus the shared platform floor, so the visible towers and
  movement physics agree without creating one collider per rendered cube.
- `Debugging 01` remains the penthouse document and construction path. Selecting `Warehouse` removes the legacy
  architecture root before construction and skips the focus room, climbing gym, parametric campus, target range,
  gateway, and streamed exploration world. The shared movement, physics, weapon, oxygen, and simulant combat runtime
  remains active against the warehouse platform bounds.
- Map catalog entries now identify authored versus procedural generation. The selector and `?map=debugging-02` route
  still remount the real scene and persist the choice; no compatibility path reads the deleted compact-room asset.
- Warehouse weapon pickups use a dedicated deterministic rectangular perimeter layout: exactly one of each fixed
  weapon is placed at equal intervals around the inset platform edge, with seed-derived pickup rotations. Debugging 01
  keeps the shared dense square sampler and its obstacle-aware filtering.
- The map now has steel perimeter walls, roof trusses, columns, forklift safety lines, dark high-bay fixtures, a deterministic
  yellow rectangular LED line around the full perimeter, four red emergency fixture meshes on the perimeter walls, and
  twelve red floor LEDs along the two main center lanes. The black background is lit by one central unshadowed spotlight;
  no warehouse point or area lights are allocated. The translucent shaft, floor pool, and existing ground-truth ambient-occlusion pass provide
  the remaining beam and ray-style
  contact cues without a shadow-map render.
- Debugging 02 now attaches a one-chunk warehouse-only melee world. Eight deterministic aisle props (crowbar, steel pipe,
  fire extinguisher, pipe wrench, hammer, screwdriver, fireman axe, and box cutter) use the existing pickup, equip, drop,
  ragdoll, projectile, and melee-hit interfaces. No city ground, buildings, paths, bridges, signs, or streamed exploration
  chunks are created.
- Validation for this pass: server-owned bus run `1786185487263-42883-e77bb5af` passes all Warehouse map, blackout
  lighting, spotlight shaft, no-shadow, pile, and isolated-melee regressions (540/541 aggregate); the sole failure is
  the unrelated core-engine property assertion. Focused map/lighting ESLint, Prettier, and the production web build
  pass. No connected-browser visual acceptance or worktree-local HMR is claimed.

## 2026-08-08 — Halo 3 / ODST HUD corner layout

- Reworked the live scene HUD into explicit tactical zones: the O₂/energy, shield, and health display is now three
  full-width dark-grey stacked tracks across the top edge, in that order, with each fill left-anchored so its missing
  portion drains from right to left. The weapon/ammunition inventory stays wider and anchored lower-right.
- Removed visible stat labels and percentages so the bars themselves provide the glanceable detail. The session text
  rail is hidden in the minimal mode. The surrounding UI stays flat and low-chrome, while the vitals use a deliberate
  Halo-style blue accent, a darker outlined track, and no gradients so the missing portion remains obvious.
- Removed the debug/mobile cascade that moved vitals to the bottom or narrowed them into a corner card. The remaining
  tracks keep sharp square edges for a restrained Halo 3 / ODST-inspired visor treatment.
- The map and video-quality selectors remain the only normal-mode controls in the upper-left; the development panel is
  offset below them when `?debug=1` so it cannot displace the player HUD.
- Validation: targeted Prettier, `git diff --check`, strict typecheck, and the production web build pass. Full repository
  ESLint remains red with dirty-lane diagnostics outside this focused HUD cleanup. The
  server-owned test-bus snapshot `1786176488517-42883-d452e4ef` records 499/515 passing assertions; its 16 failures
  are unrelated analysis, bot, core, persistence, simulation, and physics assertions, and the run started before this
  CSS edit. No second Vitest run was started. Repository lint was not rerun to completion after the final visual-only
  edits. No worktree-local Vite server or browser session was available, so HMR/rendered acceptance is not claimed.

## 2026-08-08 — 8 August combat checkpoint

- This checkpoint is the isolated worktree `/Users/nv/repos/0x4007/hk-mahjong-coach/.codex-worktrees/8-august-checkpoint`
  on branch `august-8-checkpoint`, based at `9e52fd0` (`parametric-guns-g513f524b51`).
- The selected blend keeps parametric-guns movement, Rapier/fallback traversal, acceleration presentation, and
  wall/vault behavior. It uses visual-table's fixed weapon models, six-weapon combat runtime, pickups, spatial shot
  audio, bullet pass-by audio, scope/recoil presentation, Celsius barrel glow/cooling, and HUD.
- Weapon generation is disabled at the profile/stat level. The roster is exactly six fixed weapons with six persistent
  inventory slots and number-row selection `1`–`6`; `0` holsters. The old parametric drop hook remains a compatibility
  no-op and is not advertised in the HUD.
- All six fixed weapons use the visual-table skinned viewmodels and pickup models. The pistol, shotgun, machine gun,
  sniper, carbine, and submachine gun each have distinct receiver, barrel, and sight details; the sniper and carbine
  retain their scoped optics. The merged weapon module is byte-identical to visual-table's current working copy.
- A deterministic red simulant is spawned at a safe distance, charges the player, takes hits from the weapon ray, deals
  close-range damage, and respawns after defeat. This is a local presentation target, not authoritative game state.
- Player death starts the visual-table camera tumble, black death fade, seeded respawn, and input/fire reset. The
  `?debug=1` panel includes a `Suicide` control for testing this loop.
- The authored scene remains fog-free while Warehouse applies its fixed dark-room haze. The legacy persisted fog
  preference is forced to zero, so saved debug settings cannot tune or disable the Warehouse effect.
- The latest server-owned test-bus run `1786166626340-3683-ed9e9389` recorded 491/495 passing assertions. The four
  failures are the pre-existing `packages/test-fixtures` core-engine and seeded-simulation property cases; all weapon
  and scene suites passed, including the death-tumble regression. The restrained visual-table-style gray gunshot smoke
  was selected over the denser checkpoint experiment; the follow-up strict typecheck and web production build passed.
  The checkpoint server is on port `4174`, but the connected Chrome
  extension timed out while creating a test tab, so rendered weapon, smoke, and audio acceptance still needs a live
  browser tab.

## 2026-08-08 — Glock-style pistol trigger cadence

- The fixed pistol now uses a 45 ms fire interval. Holding the trigger with Caps Lock off is fully automatic and empties
  its 12-round magazine in about 0.54 seconds.
- Caps Lock on changes only the pistol trigger profile: it still has a one-round burst, but the runtime latches that
  profile until `setFireHeld(false)`. The latch also clears on reload, weapon switch, and death. The submachine gun's
  existing automatic/triple-shot behavior remains unchanged.
- Added resolver coverage for both pistol modes and extended the shared trigger-profile assertions with the explicit
  `requiresTriggerRelease` field. Browser firing interaction remains unverified in this worktree because no second
  browser session is allowed.

## 2026-08-08 — Reload insertion impulse restored

- Reload presentation now restarts its short upward load impulse at the exact
  ammo-commit boundary. The lead-in still begins just before the interval ends,
  while the committed shell, bullet, or magazine gets a guaranteed visible kick
  even when one frame crosses the timer boundary.
- Round reloads preserve the pulse for the final recenter phase; interrupted
  reloads cancel only an armed, not-yet-committed insertion. The existing pure
  pose regressions continue to cover clip and round insertion feedback.

## 2026-08-08 — Damage-derived bullet stopping power and projectile ragdolls

- Added `resolveWeaponStoppingPower(damage)` to the fixed weapon profile. It maps each projectile's damage linearly
  to an impact velocity (`0.065 m/s` per damage point, capped at `8 m/s`). The value is stored as
  `stoppingPowerPerBullet`, shown on the armory chart/HUD, and recorded on hit metadata.
- The weapon hit callback now carries the pellet direction, impact point, and instanced-mesh index. Each shotgun pellet
  independently submits its stopping-power impulse, so a full eight-pellet hit accumulates instead of being reduced to
  one trigger-level force.
- The local simulant receives that per-bullet impulse, is briefly staggered, and resumes its charge after the
  damage-derived knockback decays. Its marker exposes `simulantStoppingPower` and `simulantStaggerSeconds` for live
  diagnostics.
- Streamed knockable props now resolve from bullet hits as well as melee hits. A first bullet starts the existing
  ragdoll; later bullets, including the remaining shotgun pellets, add linear and angular impulse through the active
  Rapier/fallback physics seam.
- Added pure stopping-power regressions and an exploration-world regression proving that two projectile impulses start a
  ragdoll and accumulate velocity. Browser/HMR acceptance still needs the existing connected scene; no second browser
  session is opened for this lane.

## 2026-08-08 — Short-lived two-puff gunshot smoke

- Gunshot gas now emits exactly two muzzle sprites per round. Firing the next round immediately recycles only the
  previous gunshot sprites, so thermal barrel wisps can continue independently without allowing shot smoke to stack.
- Each gunshot puff starts at zero scale and full opacity, expands with a normalized logarithmic curve, fades with its
  inverse curve, and returns to the pool after one second. The existing five-second pooled lifecycle remains for
  heat-driven thermal wisps.
- Added pure curve and budget regressions in `apps/web/src/scene/weapons.test.ts`. Runtime/rendered acceptance remains
  pending because this worktree does not open another browser session.

## 2026-08-08 — Procedural melee swing and impact audio

- Added `resolveMeleeAudioProfile` in `apps/web/src/scene/melee.ts`. It maps each held object's volume, reach, swing
  speed, and damage to finite, deterministic controls for a bright band-pass woosh and a heavier low-pass bang.
- Reused the weapon runtime's seeded noise buffer, listener-relative HRTF/proximity path, propagation delay, and
  fail-soft Web Audio setup. A swing schedules a looping woosh for the complete resolved swing duration; both woosh
  layers follow a symmetric exponential envelope that peaks at 50% progress. A resolved ray hit schedules the bang at
  the hit point. Misses do not emit an impact sound.
- Added pure monotonic, envelope-symmetry, and non-finite-input regressions in `apps/web/src/scene/melee.test.ts`.
  Browser listening remains a separate acceptance step and is not claimed by the code or test evidence alone.

## 2026-08-08 — Parametric bullet impact audio

- Added `resolveBulletImpactAudioProfile` in `apps/web/src/scene/weapons.ts`. It maps projectile damage (bullet
  strength, bounded from the 9-damage submachine-gun round through the 100-damage sniper round) and a clamped acute
  impact angle into a compressed impact body, a decaying resonance, and a short high-frequency glancing scrape. A
  direct hit is 0 radians; a grazing hit is π/2 radians.
- The weapon hit path now transforms the struck triangle normal through the same world and instanced-mesh matrices used
  by bullet-hole decals, then derives the angle from the normalized projectile/normal dot product. Each resolved hit
  schedules the impact at the hit point through the existing propagation-delay, HRTF, proximity, seeded-noise, and
  fail-soft Web Audio path.
- Added strength, angle, clamping, and non-finite-input regressions in `apps/web/src/scene/weapons.test.ts`.
  Browser listening remains a separate acceptance step; no new browser session was opened in this lane.

## 2026-08-08 — Unshielded headshot threshold

- Added the explicit `HEADSHOT_DAMAGE_THRESHOLD = 25` rule to the central combat damage seam. A weapon projectile
  must deal strictly more than 25 damage, hit the marked simulant head mesh, and find the target shield at zero;
  that hit resolves as lethal damage to the remaining health pool. A 25-damage projectile is not eligible.
- Shielded head hits continue through the ordinary shield-before-health reducer. Shotgun damage remains per pellet,
  so its 16-damage pellets do not qualify even if several pellets are fired in one shell.
- Under the fixed roster, pistol (28), scoped carbine (36), and sniper (100) meet the threshold; machine gun (12),
  shotgun pellets (16), and submachine gun (9) do not.
- Marked the simulant head as a combat hit zone and make the empty shield flare ignore weapon rays, allowing the
  ray to reach the actual head mesh after the shield has been depleted. Added focused threshold, shield, body-hit,
  shotgun-pellet, and lifecycle-hook regressions in `apps/web/src/scene/combat-damage.test.ts`.

## 2026-08-08 — Central combat damage routing

- Added `apps/web/src/scene/combat-damage.ts` as the single scene damage seam. It registers actor IDs,
  applies the shared shield-before-health reducer, invokes damage/death lifecycle hooks, and throws when a
  damageable actor has not been registered instead of silently dropping the event.
- Registered the local player as `player` and the red simulant as `bot:simulant`. The marker carries the same
  actor ID, so any ray hit can resolve through the router without a simulant-specific damage branch. Future bots
  must register their actor ID and vitals callbacks before their render marker can receive damage.
- Routed weapon hits, melee hits, wall-collision impact, and landing O₂ shortfall damage through the same seam.
  Melee now damages the simulant and still retains the separate exploration-prop ragdoll path.
- Added central-router regressions for player/bot parity, lethal lifecycle hooks, and unregistered-target failure.
- Targeted Prettier checks for the damage files, `mahjong-table.ts`, and both implementation logs, plus `pnpm lint`,
  `pnpm typecheck`, and `pnpm build` pass. The root format check still reports one pre-existing layout in the dirty
  `apps/web/src/main.tsx` lane. The server-owned test-bus snapshot `1786174387190-42883-a162a078` records 505/507
  passing assertions, including all three central-router tests; the two failed property tests are pre-existing
  `packages/test-fixtures` timeouts.

## Current milestone

Milestone 5 — Persistence and replay repairs and acceptance.

## 2026-08-08 — Caps Lock submachine trigger modes

- The fixed submachine gun now fires full auto at its normal 0.045-second cadence while Caps Lock is off.
- When the browser reticle is enabled by Caps Lock, a new trigger start uses a three-round burst with the existing
  per-round cadence and burst pause. The runtime samples the mode at burst start, so an in-progress burst completes
  even if Caps Lock changes.
- Added `resolveWeaponTriggerProfile` coverage for automatic, triple-shot, and unchanged non-submachine profiles.
- Browser firing acceptance remains separate; no additional browser session was opened in this lane.

## 2026-08-08 — Crouch aim stabilization stacks with wall cover

- Added crouch as a free 0.5 stability factor in the shared O₂ presentation path. It now reduces stationary camera
  breathing, reticle sway, held-weapon sway, and the reserve-driven accuracy penalty while crouched.
- Wall bracing remains an independent 0.5 factor. Crouch plus wall cover therefore composes to 0.25 of normal
  reserve-driven instability; holding breath can add its existing independent factor on top.
- Added focused O₂ and camera-damper regressions for crouch and crouch-plus-wall stacking. The server-owned bus run
  `1786176187171-42883-6656869b` passed both focused suites; its full snapshot passed 510/515 assertions, with five
  unrelated bot/core-fixture/simulation failures. The web production build passed. Repository-wide typecheck and lint
  remain blocked by pre-existing dirty errors in `debugging-two-map.ts`, `main.tsx`, `mahjong-physics.ts`, `mahjong-table.ts`,
  and `movement-simulate.ts`. No Vite/browser HMR acceptance was available in this lane.

## 2026-08-08 — Half-speed near focus accommodation

- Near depth-of-field accommodation now uses damping `3.5`, half of its previous `7` response, so focusing on a
  closer object takes roughly twice as long. Far-focus relaxation remains at damping `4.5`.
- Updated the human-eye focus regression and visual documentation. Browser interaction was not opened in this lane.

## 2026-08-08 — Selectable maps

- Added a validated `VISUAL_MAP_CATALOG` for browser-selectable maps. The existing penthouse document is now presented
  as `Debugging 01`; `Warehouse` (`debugging-02`) is the separate industrial warehouse generator with no authored-room
  document.
- Added a map selector to the live scene controls. A selection remounts the real Three.js scene with that map,
  exposes `data-map-id` on the scene container, and shows the active map in the HUD.
- Map selection accepts the `?map=` query on first load and persists the chosen ID in local storage for the next visit.
  Unknown IDs safely fall back to `Debugging 01`.
- Added catalog regressions for the authored/procedural split. The server-owned test bus remains the required source for
  unit-test results; no browser session was opened in this lane.

## 2026-08-08 — O₂ sprint failure returns to recoverable trot

- An O₂-unaffordable sprint now clears the persistent sprint request instead of retrying on every frame as soon as one
  drain slice becomes available. The player remains at the configured trot, so the existing sprint recovery delay can
  finish and the reserve can replenish while movement continues.
- A fresh movement double-tap starts sprinting again after the fallback; reload-gated sprint requests keep their existing
  reload behavior. Added focused movement and player-vitals regressions for the failed-sprint transition and trot recovery.

## 2026-08-08 — Sprint interrupts reload

- Accepted sprint requests now call the weapon runtime's explicit reload interruption path. Clip reloads stop before their
  atomic magazine commit, while round reloads preserve rounds already inserted; the raised reload presentation and HUD
  `reloading` state clear immediately.
- Interrupted operations record their elapsed reload interval in the existing weapon telemetry. A sprint request rejected
  while standing from crouch leaves the reload active because no sprint was accepted.

## 2026-08-08 — Empty weapon switch auto-reload

- Equipping a stored weapon with an empty magazine now starts its reload immediately when reserve ammunition is available,
  including switching back to a previously emptied gun. The timer runs through the shared lower/raise presentation so the
  incoming hand is not left with `0` loaded rounds while backup rounds exist.
- A same-weapon walk-over pickup also starts the reload when it supplies reserve ammunition to the currently held empty gun.
  The manual reload and sprint-interruption rules remain unchanged.

## 2026-08-08 — Landing exertion spends O₂ before impact damage

- Added a pure landing-energy resolver. A landing at the full-jump downward speed costs 10 O₂ (the proposed 10% leg
  effort), and other falls scale by the square of downward speed so a 2 m fall costs slightly more than a full jump
  landing in the current world-gravity scale.
- Physics and fallback landings now spend the resolved O₂ charge before applying the existing shield-then-health damage
  path. A full reserve therefore absorbs the landing without health or shield loss; when O₂ is insufficient, the unpaid
  remainder becomes ordinary impact damage. The camera landing impulse remains separate and continues to use its own
  deceleration input.
- Added pure regressions for the speed-to-energy mapping and reserve-overflow behavior. The live browser acceptance still
  requires a manual traversal check in the existing session.

## 2026-08-07 — Hidden crouch walk-mode toggle

- Crouching now synchronizes an internal, non-UI walking toggle across keyboard, touch, and traversal speed paths.
  Crouched movement remains on its dedicated slower posture speed; after the player is upright, the toggle selects
  the 1×-base walk speed (3.4 m/s). Accepted sprint transitions clear it before applying the 3× (10.2 m/s) sprint.
  Accepted jumps, including the O₂-free mini hop, also clear it so upright movement resumes the default run/trot mode.
  The toggle is intentionally absent from visual snapshots and HUD state.

## 2026-08-07 — One-and-a-half-times-base trot

- Standing trot now uses 1.5× the 3.4 m/s base: 5.1 m/s (18.36 km/h). The derived walk-to-sprint O₂ blend is 0.25,
  so moving trot recovers about 5.17 O₂ points per second after any sprint recovery delay.
- Crouch walk remains unchanged, and sprint remains 3× base (10.2 m/s).

## 2026-08-07 — Front/back acceleration pitch

- The shared first-person damper now receives the controller's forward velocity change and applies a short,
  bounded pitch response through the same target/response damping used by the existing left/right sprint roll.
  Forward acceleration pitches the view up; braking pitches it down. The response reaches the existing full-sprint
  roll magnitude at a 60 m/s² reference acceleration, so it is intentionally simple and easy to tune.
- The input now also receives one bounded front/back impulse when physics resolves a horizontal wall stop. Requested
  and resolved horizontal velocity are compared, limited to the speed the player carried, projected onto camera-forward,
  and sent through the same damper; repeated contact frames do not retrigger the impact. At this checkpoint, the
  side-impact component was still deferred, while camera, viewmodel, reticule, and aim ray stayed on the centralized
  output.

## 2026-08-08 — Local acceleration vector

- Replaced the camera damper's separate forward-acceleration input with one typed local horizontal acceleration vector.
  The controller derives right and forward components from the actual damped velocity changes before physics resolves
  the requested move.
- The shared damper maps the vector's forward component to pitch and its right component to inertial roll. The legacy
  direction-change sprint roll path is removed; acceleration is now the sole horizontal roll source, preserving the
  accepted response scale without additive double-rolling on strafe reversals.
- Wall delta-v now contributes both local components at contact onset. A side-on stop can therefore roll the view while
  a head-on stop pitches it down, and camera, viewmodel, reticule, and aim ray continue to consume the composed output.
  Vertical jump and landing impulses remain explicit for the next traversal integration pass.

## 2026-08-08 — Airborne reticule gait suppression

- The shared camera damper now receives the physics-resolved grounded state and suppresses footfall gait output
  while the player is airborne or in a vault/wall traversal. This removes running-style vertical, lateral, and depth
  impulses from the reticule while preserving jump lift, landing response, breathing, aim sway, and acceleration.
- Added a camera-motion regression that keeps gait on supported ground, removes it in the air, and confirms the jump
  weight response remains active.

## 2026-08-07 — Two-times-base trot and slow O₂ recovery

- Standing trot is now exactly 2× the 3.4 m/s base: 6.8 m/s (24.48 km/h). Its shared movement telemetry maps halfway
  between walk and sprint, so a moving trot recovers O₂ slowly at about 2.33 points per second after any sprint delay.
- Updated the world-scale, movement-speed, and player-vitals regressions. Sprint remains 3× base (10.2 m/s), crouched
  movement remains half-speed, and the hidden walk toggle affects upright movement only until sprint clears it.
- The final server-owned bus run `1786142660190-25084-d9eaaa01` recorded 456/457 passing assertions; all movement,
  O₂, and world-scale assertions passed, with the one unrelated core-engine property failure preserved. Typecheck,
  production build, smoke, targeted Prettier, and the explicit HMR request passed. No browser session was opened.

## 2026-08-07 — Debug authored-area memory toggles

- Added `Loaded areas` controls to the development debug panel for the Focus test zone, Mahjong penthouse,
  climbing gym, parametric barracks, and target range.
- Area changes remount the scene with disabled authored roots omitted from the render graph and static physics
  collection. This releases their mesh/material resources during the replacement scene and prevents invisible
  colliders from remaining active. Preset buttons and camera options are disabled while their area is unloaded.
- The selected area map is included in both the persisted visual debug snapshot and local visual-debug settings, so
  a reload reconstructs the same disabled areas. Existing settings/snapshots without the new optional field continue
  to load with every area enabled.

## 2026-08-08 — Production debug-area preference persistence

- Fixed the checkpoint server's explicit `?debug=1` path so visual debug preferences use browser `localStorage` in
  the production bundle as well as in Vite development. Area toggles now survive a refresh on port 4174 while normal
  production visitors still receive no debug storage or panel.

## 2026-08-08 — Two-metre cover snap assist

- Cover activation now searches the nearest valid wall within a 2 m capsule-surface range when zoom is toggled on.
- A cover entry moves toward the wall at the configured sprint speed and stops at the normal controller clearance;
  the same wall-braced presentation signal applies during the approach and contact, while O₂ remains unchanged.
- Added pure wall-range, snap-target, and speed-bound regressions. Rendered browser acceptance remains tied to the
  existing single connected session; no additional browser was opened.

## 2026-08-08 — Ultra-minimal HUD

- Compressed the visual-table status rail into a single transparent line with no card border or shadow, keeping only
  the live preview, round/seat, area, room, and movement/combat state.
- Replaced the tall player-systems panel with one wide top strip: shield, health, and O₂ are now horizontal bars
  stacked vertically. The tracks are right-anchored, so each bar grows from right to left as its value rises. Accessible
  labels and progressbar values remain unchanged; repeated heading and normal-state helper text no longer occupy the scene.
- Widened the loadout panel to use the available horizontal space while keeping its active weapon/ammunition line,
  six number slots, and transient pickup or reload feedback. Persistent controls and melee telemetry remain in the DOM
  for accessibility but are visually hidden during play. Responsive offsets keep the wider HUD clear of touch controls
  and the debug panel.
- Removed the persistent Seat view, New room, and Overhead buttons and shortened the intro/footer tutorial copy to
  concise control strings.

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
- The FPS play space and procedural backdrop now span five 50 m chunks across each axis (a compact 250 m × 250 m
  navigable world, ±125 m from the origin) and apply the existing 2× per-chunk feature-density multiplier across
  buildings, props, signs, and utility posts. Weapon pickups use the same full-world bounds, and the target-range pad
  is repositioned inside the compact boundary instead of being clipped by movement limits.
- Mobile browsers keep the landscape guidance in shipping and expose motion look, touch swipe, joystick,
  crouch, and jump against the same composed initial camera.
- Development mode now exposes `?debug=1` controls for camera presets, FOV, exposure, tone mapper,
  skyline visibility, and renderer metrics. Fog is intentionally absent from the panel; only Warehouse uses its fixed
  map-local haze.
  Skyline windows are batched with `InstancedMesh`, and the
  three hero landmarks have distance-based `LOD` silhouettes. The documented screenshot checkpoint uses
  the existing Playwright CLI at a fixed 1440×900 desktop viewport.
- Normal development mode preloads `/__codex/visual-debug-state` before mounting the Three.js scene, so a
  fresh origin such as a Cloudflare tunnel receives the saved lighting values on its first render;
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
- Parkour-feel movement now uses one shared airborne vault resolver for authored and generated boxes. The legacy
  ledge-grab transition is disabled; vaulting owns tops from 0.15 m through 2.0 m above the approach feet. It uses a
  capsule-centre target on a supported surface and a continuous duration/arc mapping from 0.04 s at 0.45 m to 1.0 s
  at 2.0 m, preserving the short Mirror's Edge-inspired climb rather than snapping instantly.
- Tall-wall traversal is separate from the ledge path. A real side collision with a wall whose top clears the capsule
  head can attach the capsule just outside the approached face; streamed rotated boxes are resolved in their local
  horizontal frame. Gravity and ordinary movement are suppressed while hanging, and forward or Space starts the same
  short smooth arc used by vaulting. The climb preserves the caught tangent coordinate and momentum instead of
  recentering on a skinny wall. Wall detection runs only after ledge and low-vault rejection. The resolver also
  considers streamed static obstacle boxes, while knocked dynamic props remain ineligible. The climbing-gym preset
  starts close enough to the dedicated wall for a normal walk to reach it without a sprint double-tap.
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
  elevated deck and ramp are disabled so the whole room uses the shared ground plane. The `Climbing gym` preset now
  spawns beside the clear measured vault row at the dedicated west play area. The old authored runs, holds, columns,
  rails, and hang wall are dormant in both rendering and collision, so only the test blocks can interrupt traversal.
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
  suppresses gravity and ordinary movement until forward/jump input starts the vault-style climb arc; the capsule
  moves to a validated top target, and grounded is set only after support is found.
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
  releases on backward input, and starts the short vault-style arc on forward or jump input after a short visible
  settle beat. Wall entry is explicitly airborne-only, so a ground-level collision remains an ordinary
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

## 2026-08-07 — Vault-style wall climb and rotated backdrop support

- Added the `world-meters-v1` scale contract. One Three.js/Rapier world unit is one metre, and shared player capsule,
  eye-height, autostep, snap, jump, gravity, and tolerance constants now feed the live controller, Rapier fallback,
  and movement simulator. The physical standing eye height is fixed at 1.75 m and crouch eye height at 1.00 m; the
  elevated table camera remains a presentation-only camera.
- Wall-hang resolution now transforms each candidate `PhysicsBox` into its local horizontal frame before checking
  the approached face, front reach, lateral overlap, and swept-contact recovery. This makes generated backdrop
  buildings and bridges agree with their rotated Rapier cuboids instead of silently using a mismatched world AABB.
- `resolveWallClimbTarget` is shared by the live scene and movement simulator. It keeps the tangent coordinate from
  `wallFacePoint` and chooses the nearest supported top point along the wall normal; a long/skinny wall no longer
  slides the player to its centre. A wall thinner than the capsule falls back only along its normal thickness, where
  no fully inset capsule point exists.
- The live wall climb now uses the vault `ClimbingTransition` shape: the same height-based smooth arc, preserved
  approach momentum, and short landing boost. The old speed-based lift/cross phase no longer leaves the gun lowered
  for the full wall height.
- Added rotated-wall and skinny-wall resolver regressions plus
  `scripts/movement-scenarios/wall-hang-generated-rotated-test.json`, which records a hang at x≈0.8 and completes
  on the rotated top without losing that lateral catch point.
- Added the measured climbing-gym vault row (`0.10 m` through `5.00 m` in `0.10 m` increments) and the
  `scripts/movement-scenarios/vault-2m-test.json` timing regression.
- Corrected the climbing-gym first-person preset to use the 1.75 m standing-eye reference instead of the elevated
  seated mahjong table camera. The labeled 2.00 m block is now physically above the camera while preserving the
  world-floor measurements used by vault resolution.

## 2026-08-07 — Clear climbing-gym vault lane

- Reduced the climbing gym runtime feature set to the side-by-side 0.10 m–5.00 m vault-test blocks. Legacy authored
  runs, ledges, holds, columns, rails, and the hang wall are not rendered or added to the physics boxes, removing the
  geometry that could overlap the measured bounds.
- Kept one shared block definition for rendering and collision, so each visible height label corresponds to the exact
  collider used by the vault resolver.

## 2026-08-08 — Height-matched traversal weapon lowering

- The centralized camera-motion damper now receives the resolved vault or wall-climb duration and advances the gun
  faster-starting 2x curve over the full interval instead of using the fixed 0.18 s weapon-switch timing; it reaches
  the target only at the end of the climb, so there is no mid-traversal bottom clamp.
- Vaults use a shallow 20% of the normal lower pose. Wall climbs scale from a shallow minimum to the full pose at
  a four-metre block, using the block's full collider height rather than only the remaining vertical arc.
- Wall hanging alone leaves the gun raised; the lower phase starts when the climb arc starts and raises from the
  exact pose reached at release. Firing, reload, pickup, and drop remain locked until the shared raise phase is idle;
  weapon switching keeps its existing full lower/raise behavior.
- Added camera-motion regressions for duration matching, shallow vault lowering, and full four-metre wall-climb lowering.

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
  at a wall, capped at the velocity carried into contact. Sprint speed (13.6 m/s, exactly 48.96 km/h) and below
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

## 2026-08-07 — Multi-axis head bob and jump/landing acceleration

- Extended the centralized `camera-motion.ts` output with local lateral and depth gait offsets plus a bounded
  acceleration pitch. Jump take-off uses the launch impulse and landing pitch uses the actual fall velocity and
  support-stop acceleration, so a harder landing is visibly deeper than a normal jump.
- Replaced the sine/cosine running orbit with a footfall-shaped U: lateral stride remains sinusoidal, while
  vertical gait follows a parabolic relationship to lateral stride. Breathing and jump/landing responses remain
  additive instead of being folded into the stride shape.
- Composed the offsets into the camera render matrix after physics resolves the base pose. The camera, held
  viewmodel, reticule, and aim ray therefore stay linked without feeding presentation bob back into fallback
  movement state.
- Added focused regressions for jump/landing pitch direction, lateral/depth gait motion, and the U-shaped stride.
  Typecheck, the production web build, and the server-owned full test bus pass (458/458 assertions).

## 2026-08-07 — Speed-weighted sprint gait intensity

- Added `resolveCameraGaitAmount()` to the centralized camera damper. It combines normalized movement magnitude,
  speed ratio, and the existing crouch posture factor, then adds a 0.6 sprint-blend gain. The resulting gait amount
  is 1/3 at walk, about 0.87 at trot, and 1.6 at full sprint, so sprinting carries the shared reticule, camera,
  viewmodel, and aim-ray motion farther from center.
- The existing gait damper still moves toward zero when movement magnitude falls, so acceleration and deceleration
  are smooth rather than instant reticule jumps. Added regressions for walk/trot/sprint ordering and damped stop
  recovery. In the final server-owned bus run `1786145360317-25084-ff3d4e4e`, all six camera-motion gait tests
  passed and the complete 460/460 assertion snapshot passed.
- Replaced the fixed gait phase-rate range with an Alexander-style step-frequency resolver. At the configured 1.85 m
  player height and 3.4 m/s walk speed it yields a 1.188 m step, 0.349 s per step, and 2.862 steps/s; the phase
  advances by `π` per alternating foot contact and stops advancing when movement stops.

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
  `walkingRecovery / (walkingRecovery + sprintDrain) = 70.6%` between walk and sprint, about 77.9% of the 48.96 km/h
  sprint (10.6 m/s, about 38.16 km/h), so the locomotion O₂ delta is zero at the configured +8/s walk and -3.33/s
  sprint rates.
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
  interaction, number-key slot selection, Q throw, E interaction, R reload, mouse fire, mobile Fire/Equip/Reload
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
  sprint trigger. A second non-repeating tap within the 300 ms window starts the 18 km/h sprint in that
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

- Added a shared barrel heat model to the visual weapon runtime. Each projectile that resolves against a visible
  surface adds its configured bullet damage; misses add nothing, and shotgun pellets add independently.
- A 500-damage heat load reaches the full red-hot material response. Cooling is linear at `10` damage units per
  second, so 100 damage takes 10 seconds and 600 damage takes 60 seconds to cool. Heat is tracked per weapon and
  continues cooling while the gun is holstered or another weapon is active.
- Every procedural barrel receives its own material clone and uses the shared heat ratio to blend toward red emissive
  steel, capped at `emissiveIntensity = 1`. Pickup and held copies stay visually consistent without changing receiver
  or sight materials.

## 2026-08-06 — Pooled barrel smoke

- Added a deterministic, fixed-budget smoke presentation to each held weapon. A shared procedural 64×64 alpha mask
  drives 192 pooled billboards; trigger pulls emit dense gray muzzle puffs whose size and count scale from total damage
  per round (`damage × pellets`), while a separate pale-white thermal steam emitter follows the existing barrel heat
  ratio and produces upward-curling wisps only above 35% heat. Thermal steam uses a restrained longest-barrel scale
  ramp from 1× on the handgun to 1.6× on the sniper, while damage still makes high-power rounds larger. Puffs start at
  zero opacity, use a normalized sigmoid fade-in, then rapidly expand with an ease-out logarithmic curve over the first
  45% of the shared five-second lifetime, lingering at maximum size while transparent. Opacity follows the expansion from
  bright source scale to transparent max scale. The plume inherits the muzzle's world velocity, then drags to a stop
  while rising; shotgun and sniper rounds intentionally produce much larger clouds. The particle root lives in the scene
  world-effects root; each spawn captures the muzzle's world position and diffuses upward/outward independent of later
  camera movement or weapon switching.
- Thermal smoke uses the same logarithmic expansion and inverse-opacity lifecycle as muzzle smoke, plus an inverse
  barrel-size rate: about 6.4 wisps per second on the handgun down to the base four on the sniper. Its square-root
  damage response keeps shotgun/sniper steam bounded, while heat still eases the rate in from 35% to full at 80%.
  Particles use no shadows, collision, or per-frame allocation, and their RNG stream is isolated from projectile spread.
  Pickup copies keep the red-hot
  material response but do not create smoke emitters. Full red-hot barrel saturation cools completely within 30 seconds.
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

## 2026-08-06 — Generic parametric gun instances

- Added the versioned `v1` profile resolver and seeded generator. Derived payload, cadence, burst, magazine,
  reload, handling, recoil, accuracy, heat, and telemetry values are calculated from one primitive profile and a
  canonical profile hash. Generation uses the exact stream `<roomSeed>|weapons|generation|<formulaVersion>|<gunSeed>`.
- Replaced runtime ownership by weapon-id with two generic `GunInventorySlot` records that reference mutable
  `GunInstance` records. Pickup uses the first free slot and leaves a full inventory unchanged; drop spawns the same
  instance with its profile hash, generator seed, ammo, and temperature intact.
- Held and pickup geometry now derives from receiver, barrel, stock, optic, and sight-line dimensions. The runtime
  has no pistol/shotgun/machine-gun/sniper geometry or inventory branches; named profiles remain fixture data only.
- Fire, reload, pickup, and drop reject input during a switch transition. A valid drop clears reload and switch
  presentation state, while the shared camera-motion path remains authoritative for the held model.
- Dropped pickups now raycast against visible scene geometry and try deterministic angled fallback positions, keeping
  a wall or prop from absorbing the instance immediately in front of the player.
- Preserved barrel heat is applied when a dropped instance becomes a pickup and again when it is collected, so visual
  temperature follows the generic instance state.
- HUD snapshots expose generic slot and nearby-pickup metadata rather than concrete weapon definitions.
- Added deterministic profile, instance, first-free-slot, full-inventory, and drop-preservation regressions.
- Final dirty-state validation: the server-owned test bus passed 436/436 assertions, strict typecheck, production
  build, modified-file Prettier, weapon-file ESLint, and `git diff --check`. Full repository lint remains blocked by
  83 pre-existing diagnostics outside this feature. The production HTTP smoke test passed; no browser or connected HMR
  session was available in this lane.

## 2026-08-06 — Parametric profile receipts and playtest telemetry

- Completed the v1 resolver with sustained damage, handling/zoom/heat/recovery spread factors, oxygen costs,
  reload workload, reserve-pressure rate, and audio inputs derived from group damage and measured barrel length.
- Resolved profiles are now re-derived and hash-checked before instance admission. Instances retain the canonical
  primitive input. Round and belt reloads preserve the full-magazine workload in `reloadSeconds` while exposing a
  derived per-round or segment interval for partial-capacity loading and interruption; sustained DPS uses that full
  workload.
- Generation keeps the canonical `<roomSeed>|weapons|generation|v1|<gunSeed>` stream and now emits a redacted latent
  receipt. Payload and cadence share a bounded budget; global tradeoff validation and Pareto filtering preserve
  multiple objective profiles without a single permanent balance score. A heavy-turret envelope is exposed as a
  generic sampling utility and does not add a runtime weapon branch.
- Added a pure immutable telemetry reducer for accepted shots, hit intervals/rate, damage, recoil/recovery,
  posture/distance hit rates, movement speed/penalty, heat/glow/smoke, reload duration/interruption rate,
  ammunition/O₂ use, range, misses, empty magazines, deaths, and optional power/control/clarity/fun ratings. The scene
  runtime reports the active instance telemetry through the generic weapon snapshot.
- The HUD now includes a collapsed profile-inspection panel showing the active profile hash/seed and derived
  damage, spread, reload, oxygen, and telemetry values. Browser interaction remains unverified in this lane.

## 2026-08-07 — Memorable generated names and weapon test campus

- Added the separate versioned name stream `<roomSeed>|weapons|name|v1|<gunSeed>`. Generated profiles now derive a
  memorable adjective/noun name plus a six-character stable code from latent tradeoffs and feed style. Explicit
  `displayName` overrides remain authoritative, and the generation receipt records both streams and the final name.
- Added a deterministic indexed catalog of 24 generated profiles per room seed (`catalog-001` through `catalog-024`) and
  generic pickup creation for the catalog. The profile hash, formula version, room seed, and gun seed remain the
  canonical favorite-gun identity; names are presentation metadata for playtest recall.
- Added a walkable parametric barracks and four-distance target range to the development map. The debug panel can
  teleport the first-person controller to either space; the default scene contains 24 generated catalog pickups plus
  the existing 13 fixture pickup instances. Targets are ordinary visible meshes, so the existing fire, hit-mark,
  reload, and telemetry path remains the acceptance surface.
- Validation for this entry: the refreshed server-owned test-bus snapshot passed 438/438 assertions; `pnpm typecheck`,
  `pnpm build`, `pnpm smoke`, `git diff --check`, weapon-module ESLint, and Prettier checks passed. The broader scene
  ESLint command still reports the known dirty-lane baseline diagnostics outside this feature. No browser session was
  opened in this lane.

## 2026-08-07 — Ergonomic pickup, swap, and toss controls

- Walk-over pickup now stores a gun in the first free slot and preserves the currently held gun. When both slots are
  full, walk-over pickup is a no-op.
- `E` remains an intentional action: it equips a nearby gun when a slot is available, or swaps the held gun with the
  nearby pickup when the inventory is full. The displaced instance remains a pickup at the swap location and stays
  protected from walk-over re-pickup until the player leaves its range; `E` can still swap back immediately.
- `Q` now throws the active instance with a short gravity arc. The throw inherits world-space sprint, strafe, and jump
  velocity; a stationary throw starts at a 1.05 m forward eject distance. Thrown instances are protected from
  walk-over re-pickup until the player leaves the pickup radius, while `E` remains available immediately.
- Added a pure `resolveGunThrowVelocityV1` regression for forward impulse plus preserved player momentum and updated
  HUD, design, and control documentation.
- Validation: the feature checks passed with `pnpm typecheck`, `pnpm build`, `pnpm smoke`, Prettier, `git diff --check`,
  and the explicit Vite HMR request. The latest code-matched shared bus snapshot (before these documentation-only
  edits) has 440 passing assertions and one unrelated wall-hanging failure from concurrent edits in
  `mahjong-table.test.ts`; no weapon assertions failed. No browser session is opened in this lane.

## 2026-08-07 — High-cadence submachine generation envelope

- Added a deterministic generator-only `submachine` archetype. It produces
  single-projectile, high-cadence, compact clip profiles with lighter geometry
  and a small magazine-damage budget; the generic runtime still has no
  archetype-specific weapon branch.
- Twelve of the 24 default barracks catalog entries now use that envelope. The
  archetype is recorded in the generation receipt and gets a separate seeded
  generation/name stream suffix, so existing general stream identities remain
  stable and favorites remain reproducible.
- Validation: the code-matched server-owned bus snapshot recorded 441 passing
  assertions and one unrelated core-engine property-test failure; all weapon
  assertions passed. Strict typecheck, production build, smoke, targeted ESLint,
  Prettier, `git diff --check`, and the explicit HMR request also passed. No
  browser session was opened in this lane.

## 2026-08-07 — Default trot movement and crouch walk mode

- Standing movement now starts at the existing O₂-neutral trot instead of the
  slower base walk speed. The shared movement-speed resolver remains the source
  for keyboard, touch, reload, and traversal paths, so the normal trot keeps a
  zero O₂ movement delta.
- Crouching preserves the existing half-speed walk mode. Double-tap sprint now
  requests a sprint exactly three times the 3.4 m/s base (10.2 m/s, 36.72 km/h),
  checks the current frame's O₂ affordability, and falls back to the recalculated
  neutral trot when the drain cannot be paid.
- Added focused movement-speed regressions for the default trot, crouch walk,
  three-times-base sprint target, and reload/sprint caps. The final server-owned bus run
  recorded 453/454 passing assertions; every movement, vitals, impact, camera,
  and world-scale assertion passed, while one unrelated core-engine property
  assertion failed. The follow-up patch also clears an active sprint request
  when crouch is enabled, so crouching explicitly enters walk mode. Strict
  typecheck, production build, smoke, Prettier, `git diff --check`, and the
  explicit Vite HMR request passed. The scene ESLint command still reports 31
  known dirty-lane diagnostics outside this movement change. Browser
  interaction was not opened in this lane.

## 2026-08-07 — Outdoor gun spawn density cap

- Procedural outdoor weapon pickups now enforce a 50 m horizontal separation, so each pickup's 50 m-radius circle
  contains no other seeded outdoor gun. The existing `minimumDistance` option can request a wider spacing but cannot
  lower this cap.
- If a constrained world cannot fit another pickup at that spacing, generation omits that pickup instead of using an
  invalid close fallback. The authored table-side starter set and 24-profile parametric barracks remain deliberate
  test displays and are exempt from the outdoor density rule.
- Added focused regressions for the 50 m cap and deterministic omission when no valid outdoor position exists.

## 2026-08-07 — Five-times-base sprint target

- Changed the shared sprint definition to exactly five times the 3.4 m/s base:
  17 m/s (61.2 km/h). The O₂-neutral trot remains derived from the
  walking-recovery/sprint-drain blend at 13 m/s (46.8 km/h).
- Added regressions for the converted sprint speed and neutral-trot calculation.

## 2026-08-07 — Four-times-base sprint target

- Superseded the five-times-base tuning with a four-times-base sprint: 13.6 m/s
  (48.96 km/h) from the shared 3.4 m/s base movement speed.
- The O₂-neutral trot remains derived from the same walking-recovery/sprint-drain
  blend and now resolves to 10.6 m/s (38.16 km/h). Updated the world-scale and
  movement regressions plus the active documentation and impact-speed description.

## 2026-08-07 — Three-times-base sprint target

- Superseded the four-times-base tuning with a three-times-base sprint: 10.2 m/s
  (36.72 km/h) from the shared 3.4 m/s base movement speed.
- The O₂-neutral trot remains derived from the same walking-recovery/sprint-drain
  blend and now resolves to 8.2 m/s (29.52 km/h). Updated the world-scale and
  movement regressions plus the active documentation and impact-speed description.

## 2026-08-08 — Layered shield and health damage vignettes

- Reused the O₂ post-processing vignette shader, reticule-centred UV origin, aspect-correct radial falloff, and
  scene-linear placement before `OutputPass` for incoming damage feedback.
- Each shield or health delta creates its own short-lived pass. One lost point maps to `0.01` initial opacity; shield
  damage is blue and health damage is red. Independent layers fade over `0.5` seconds, so rapid hits composite
  naturally instead of replacing the previous strike.
- Overflow damage creates both layers when shields and health decrease in the same event. Vignette layers clear on
  vitals reset and dispose cleanly with the scene. The active layer count is exposed as
  `data-player-damage-vignette-layers` for local diagnostics.
- Validation: strict typecheck, production web build, targeted ESLint, Prettier, and `git diff --check` pass. The
  latest server-owned bus snapshot (`1786149860791-25084-75af1ee4`) passed 471/472 assertions, including all three
  damage-vignette tests; the one failure is the unrelated `packages/test-fixtures` core-engine property test.
  Browser interaction is not opened in this lane.

## 2026-08-08 — Re-arm the previous gun after a melee drop

- When a melee prop is equipped while a gun is active, the scene records only that active gun ID before holstering
  its viewmodel. A successful `Q` melee drop now reselects that same owned gun through the normal weapon switch path,
  so the shared lower-and-raise presentation remains intact. If melee was drawn while unarmed, the same drop cycles to
  the first owned gun instead of leaving the player unarmed.
- Failed drops and explicit `0` holstering do not re-arm a gun. Added focused handoff regressions for the successful,
  failed, empty-previous-weapon, and explicit-holster cases.
- Validation: the server-owned snapshot `1786176187171-42883-6656869b` passed the handoff regression and every scene
  melee/weapon assertion; strict typecheck and targeted Prettier passed, and the explicit Vite HMR request succeeded.
  The aggregate snapshot remains red on five unrelated bot/core/simulation assertions from concurrent dirty work.
  Browser interaction was not opened in this lane.

## 2026-08-08 — Preserve melee during walk-over gun pickup

- Walking over a gun while melee is drawn now stores the gun without drawing or switching the viewmodel. Explicit `E`
  and numeric gun selection still run the reversible melee-to-gun handoff, restoring melee if the gun action fails.
- Added pure handoff guards and regression coverage for successful gun actions and walk-over pickup state.
- Validation: the latest completed server-owned bus snapshot includes both handoff tests as passing; its 13 failures are
  unrelated dirty-lane core, analysis, bot, persistence, and simulation assertions. Targeted typecheck, Prettier,
  `git diff --check`, and the Vite HMR request passed before later concurrent validation contention.

## 2026-08-08 — Recoverable melee drops

- A prop dropped with `Q` remains a recoverable melee pickup while its dynamic ragdoll settles. Re-equipping captures
  the prop's current instance transform before removing only that prop's dynamic body, so a moved drop does not snap
  back to its seeded spawn.
- Every streamed prop is also a recoverable melee pickup after a melee hit or player collision topples it. Re-equipping
  captures the live ragdoll transform and removes its dynamic body, so the exact fallen instance can always be used as a
  weapon.
- Added world-level regressions covering moved drops, melee-hit and collision knockdowns, dynamic bodies, sibling
  preservation, re-pickup, and body removal.
- Validation: server-owned bus run `1786178887677-42883-61af9791` passed all 242 scene assertions, including the new
  melee-hit and collision-toppled recovery regression; its three failures are unrelated core-engine/simulation cases.
  The focused test file passes ESLint, Prettier, `git diff --check`, strict typecheck, and the production web build.
  Full `mahjong-table.ts` lint still reports 30 pre-existing dirty-checkpoint errors outside this patch. No Vite dev
  server or connected browser was available for HMR/browser acceptance.

## 2026-08-08 — Calm melee idle reset

- The melee prop still alternates its right-to-left and left-to-right swing poses, but a completed swing that leaves it
  on the left now starts an activity-aware idle timer. After five seconds without another swing, or a
  viewmodel transition, the prop eases back to the default right-ready pose over `0.9` seconds.
- The reset uses pure melee pose resolvers and remains composed with the shared camera-damper viewmodel offset. Walking,
  swinging, stashing, or changing viewmodel state no longer fights the timer; the next swing is reseeded from the right
  side after the reset completes.
- Added regressions for the five-second delay, eased progress, and exact left/right ready-pose endpoints. The fresh
  server-owned bus snapshot `1786177988200-42883-ea222052` passed all 11 melee assertions; the aggregate was 509/522
  because 13 unrelated bots, analysis, persistence, core, and simulation assertions remain red in the dirty lane.
  The melee-only ESLint check, focused web production build, Prettier check, and `git diff --check` passed. The latest
  strict typecheck is blocked by unrelated unused `roomVariant` and `explorationArea` declarations in `main.tsx`.
  Browser interaction and HMR were not run because no Vite server or connected browser belongs to this worktree.

## 2026-08-08 — Let melee idle reset continue while walking

- The five-second melee reset now measures only melee activity. Walking or running with the prop drawn no longer clears
  the timer, so the left-ready pose still returns calmly to the right while locomotion continues.
- Added a pure eligibility regression that documents movement as intentionally outside the reset gate. Swing input,
  stashing, inactive controls, and non-idle viewmodel transitions remain reset blockers.

## 2026-08-08 — Re-arm any owned gun after an unarmed melee drop

- A successful melee drop now cycles to an owned gun even when no gun was active before melee was drawn. The existing
  remembered-gun path still takes priority, and an empty inventory remains unarmed.
- Pressing `0` is an explicit holster choice and suppresses this fallback until another gun is selected. Added a pure
  handoff regression for the fallback, failed-drop, and explicit-holster cases.

## 2026-08-08 — Reorient fallen melee pickups

- A melee viewmodel now discards the dropped prop's transient ragdoll quaternion when it is picked up. It preserves the
  source scale and rebuilds the canonical upright grip, so an object that fell on its side is held upright immediately.
- This keeps the shared camera-child swing pose responsible for the held presentation instead of carrying world ragdoll
  orientation into the first-person model.

## 2026-08-08 — Preserve cover through weapon reload

- Cover resolution now follows the requested zoom input, so the reload-time temporary unzoom does not clear an engaged
  wall stance or its cover wall. Turning zoom off still clears it immediately.
- An accepted full jump or mini-hop explicitly clears cover and its pending wall snap, so the player must activate zoom
  again to re-enter cover after leaving the wall stance.
- Added pure regressions for reload-time cover retention, the requested-zoom edge, and jump exit. The server-owned bus
  snapshot `1786178887677-42883-61af9791` passed all three cover assertions and 519/522 assertions overall; the three
  failures are unrelated dirty-lane core-engine and simulation assertions. The focused web production build, Prettier,
  and `git diff --check` pass. Strict typecheck remains blocked by unrelated unused `roomVariant` and `explorationArea`
  declarations in `main.tsx`; targeted ESLint still reports pre-existing dirty-lane errors in `mahjong-table.ts`.
  Browser interaction and HMR were not run because no Vite server or connected browser belongs to this worktree.

## 2026-08-08 — Momentum-scaled melee hits

- Melee combat now resolves a pure, bounded momentum multiplier at the central combat-damage seam. It projects the
  relative attacker/target velocity onto the attack ray, so a full sprint and an opponent moving toward the strike add
  together while a target fleeing in the same direction returns the hit to its base damage.
- Downward velocity adds a separate airborne falling-impact term. Full sprint speed is the closing-speed reference, full
  jump speed is the falling reference, and the combined multiplier is capped at `2.5×`; standing still remains `1×`.
- The local simulant now publishes its deterministic frame velocity to melee resolution. Swing O₂ cost and ragdoll prop
  knockback remain based on the original swing/object values; player-like targets receive the momentum-scaled damage
  through the existing shield-before-health router.
- Added pure regressions for stationary, opposing-motion, falling, invalid-input, and multiplier-cap cases. The
  server-owned bus snapshot `1786180387154-42883-05fed5a9` passed all 16 melee assertions; its single failure is the
  unrelated dirty-lane core-engine property test. Strict typecheck and targeted ESLint passed. Browser acceptance and
  HMR are still pending for this worktree.

## 2026-08-08 — Edge-only Warehouse weapon layout

- Warehouse now creates exactly one deterministic pickup for each of the six weapon IDs. The six positions are
  evenly spaced along an inset rectangle perimeter, leaving the existing dense procedural pickup population on
  Debugging 01 unchanged.
- Added a pure perimeter-placement regression covering one-per-weapon identity, the pistol starter marker, and equal
  wrapped spacing around the Warehouse bounds.
- Validation: the latest server-owned bus snapshot `1786180987514-42883-be240878` includes both the warehouse and
  perimeter regressions; all five map-catalog tests pass. The full snapshot is 528/529 because of one unrelated dirty
  core-engine property failure. Strict typecheck, targeted weapon/map ESLint, Prettier, and the web production build
  pass; repository-wide ESLint remains red on unrelated dirty-checkpoint diagnostics. No Vite server or connected
  browser is available in this worktree for HMR/browser acceptance.

## 2026-08-08 — Expose previous melee hit damage in the debug panel

- The explicit debug panel now shows the previous resolved melee hit, the current weapon's base damage, and a compact
  swings/hits count. For player-like actors, the previous value includes the momentum-scaled damage that reached the
  combat router, so a tester can compare stationary, sprinting, opposing-motion, and falling strikes while tuning the
  resolver.
- Starting another swing no longer replaces the previous-hit value with the weapon's base damage; it changes only the
  swing state and counters. A miss leaves the last resolved hit visible for comparison.
- Validation: the current server-owned bus snapshot has 529 passing assertions and one unrelated dirty-lane
  `packages/test-fixtures` core-engine property failure. Strict typecheck, Prettier, and the web production build pass;
  the targeted ESLint command remains red on pre-existing dirty-checkpoint diagnostics in `main.tsx`. No Vite server or
  connected browser is available in this worktree for HMR/browser acceptance.

## 2026-08-08 — Simple shield-gated simulant blood impacts

- Projectile hits on the local simulant no longer create a world-level bullet-hole decal at the actor's moving body.
  The weapon hit callback now classifies the actor and supplies its current frame velocity to the presentation runtime.
- Simulant hits create an independent, depth-tested blood cloud only after the post-hit shield reaches zero and the hit
  deals damage. Each bullet emits exactly one low-opacity dark-red sphere, scaled by projectile damage; shielded hits
  emit neither blood nor an actor bullet hole. Shield damage gets its own short cyan-white spark; a shield-breaking
  overflow hit can show both the spark and the blood response.
- A transparent `ShaderMaterial` shell covers the simulant during the shield flare. Its pulse is brightest at the start,
  warms toward white-orange at peak intensity, and applies a vertical `smoothstep` mask so opacity is zero at the bottom
  edge of the shield volume.
- The runtime searches from the hit point toward target motion, projectile travel, and nearby vertical surfaces for a
  static floor or wall. When one is found it projects a persistent stain there using one low-opacity dark-red splat
  texture. The stain elongates along the simulant's velocity once the movement crosses the running threshold, so a
  moving target leaves a directional smear.
  Surface hits that are not the simulant keep the existing bullet-hole path.
- Blood effects are capped, disposable, included in the clean scope feed, and the cloud/decal fade uses low-opacity
  multipliers. Added pure regressions for damage-to-cloud scale, speed-to-smear ratio, shield gating, and scope metadata.
- Validation: the final server-owned bus snapshot `1786184887442-42883-e884aace` passed 536/538 assertions, including
  the weapon blood and shield-spark regressions. Its two failures are unrelated dirty-lane core-engine and warehouse
  map-catalog assertions. Strict typecheck, `git diff --check`, targeted weapon ESLint, and the production web build
  pass. Full `mahjong-table.ts` ESLint still reports pre-existing dirty-checkpoint diagnostics. The Vite HMR request was
  accepted with a shield-spark verification note; no connected browser was available for rendered acceptance.

## 2026-08-08 — Free hip-fire O₂ charge

- Weapon projectile O₂ charging now receives the live zoom state. Hip-fire leaves the player's O₂ reserve unchanged;
  zoomed shots retain the existing one-quarter-of-projectile-damage charge and melee swings keep their existing cost.
- Added a player-vitals regression covering both firing modes. Browser interaction and HMR remain pending because this
  worktree has no connected Vite client.
- The server-owned bus snapshot `1786185187219-42883-ee0a8b3f` passed the new regression and 537/538 assertions overall;
  the single failure is the unrelated dirty-lane three-dimensional Warehouse catalog expectation.
  Strict typecheck, the web production build, targeted vitals formatting, and `git diff --check` pass.

## 2026-08-08 — Three-dimensional Warehouse piles

- Reworked Warehouse crate generation into deterministic supported piles. Each bay chooses a one- to three-crate
  footprint, jitters the whole pile origin, and lets upper layers use only occupied support cells below them. Three
  enclosed crate yards are generated first as perimeter walls, creating blocked-off areas and alternate routes while
  the centre spawn lane stays open. The layer and cell pitches leave clear space, so adjacent crates do not intersect
  and every upper crate has a matching lower support.
- Every crate keeps exact one-metre geometry, stays parallel to the ground, and receives yaw-only rotation. Rendered
  instances and `PhysicsBox` entries share centre, half-extents, and rotation. The Warehouse generation marker is now
  `warehouse-boxes-v5`.
- Added deterministic map-catalog coverage for level orientation, support continuity, render/physics alignment, and a
  pairwise no-intersection invariant. The final server-owned bus snapshot `1786187587467-42883-3149cff4` passes the
  Warehouse assertions and 547/548 assertions overall; its one failure is the unrelated dirty-lane
  `packages/test-fixtures` core-engine property. Strict typecheck, targeted Warehouse ESLint, Prettier, `git diff
--check`, and the production web build pass. No Vite server or connected browser is available in this worktree, so
  HMR and rendered browser acceptance remain pending.

## 2026-08-08 — Keep Warehouse lighting out of bullet raycasts

- The industrial lighting group now carries an explicit `weaponRaycastIgnore` marker. Hitscan weapon resolution filters
  presentation-only lighting through the shared `isWeaponRaycastSurface` predicate, so the central spotlight shaft, pool,
  fixtures, and corner decorations no longer catch bullets. Structural warehouse walls remain valid projectile surfaces.
- Added a regression that checks the central spotlight shaft is ignored while `WarehouseWallNorth` remains hittable.
- Validation: formatting, the server-owned test-bus snapshot, typecheck, lint, and the production web build are pending
  for this change. No Vite server or connected browser is available in this worktree for HMR/browser acceptance.

## 2026-08-08 — Held muzzle-flash point lights

- Added one non-shadow-casting `THREE.PointLight` at the muzzle of every held weapon model. Its range, decay, and peak
  intensity are centralized in `weapons.ts`; pickup copies create no light.
- The light follows the existing muzzle-flash timer, with a squared remaining-time fade and an explicit disabled state
  after the 55 ms flash window. A duplicate shield-shell declaration in the dirty scene integration was also reduced
  to the existing assignment so the web bundle can parse.
- Increased the point light to a 32-unit peak and 7.5 m range so its direct contribution is visible against the
  Warehouse high-bay lighting and nearby crate surfaces.
- The server-owned test-bus snapshot `1786187587467-42883-3149cff4` passes the muzzle-light regression and 547/548
  assertions overall; its one failure is the unrelated dirty-lane `packages/test-fixtures` core-engine property.
  Targeted weapon ESLint, targeted weapon/documentation Prettier, `git diff --check`, the web production build, and HMR
  request pass. The latest repository typecheck is blocked by the unrelated dirty `map-catalog.test.ts` geometry type
  error. The large dirty scene file retains unrelated formatting drift outside this patch.
  No connected browser is available in this worktree for rendered acceptance.

## 2026-08-08 — Robot and player death ragdolls

- Added a deterministic presentation-only ragdoll state machine in `apps/web/src/scene/ragdoll.ts`. It applies an
  impact-directed launch, gravity, drag, floor bounce, angular tumble, and loose joint motion without changing the
  authoritative combat/vitals reducer.
- The simulant keeps its body visible for the existing respawn delay after a lethal weapon or melee hit. Its marker is
  removed from weapon raycasts while the body tumbles, then the normal body, ring, shield, and vitals reset on respawn.
- Player death now spawns a short-lived cyan death body ahead of the camera. The existing centralized camera damper still
  supplies the first-person fall/tumble, while the body uses the same deterministic ragdoll pose before the fade/respawn.
- Added pure regressions for launch direction, floor settling/reproducibility, and changing finite joint poses.
- Latest checks: `pnpm typecheck` and the production web build pass. Targeted ESLint and Prettier checks for the new ragdoll
  module and test pass, and `git diff --check` is clean. Full `pnpm lint` remains red on 86 pre-existing dirty-lane findings
  across `main.tsx`, the large scene file, movement tooling, and unrelated tests; no finding points at the new ragdoll module.
  The completed server-owned bus run `1786190287312-42883-205f2208` passes all 553 assertions, including all three ragdoll
  tests and the combined Warehouse scene checks. No Vite client is connected in this worktree, so HMR and rendered browser
  acceptance remain pending.

## 2026-08-08 — Ice-blue data-center rack experiment

- Kept the supported, non-intersecting Warehouse pile physics and replaced its cube presentation with dark data-center
  rack cabinets. Each plan now renders a rack body plus five repeated front status rows, with one tiny square pixel per
  row.
- Most pixels use steady ice-blue emissive material. The remaining pixels are split across three phase-offset blinking
  instanced meshes, producing asynchronous server activity without adding one runtime light per LED. Presentation meshes
  remain outside weapon raycasts. The map variant is `Ice-blue data center` and the presentation marker is
  `warehouse-data-center-v1`.
- Added map-catalog coverage for rack counts, body dimensions, ice-blue metadata, pixel layout dimensions, steady LED rows,
  and three blinking groups. The existing Warehouse scene integration expectation now uses the new `Ice-blue data center`
  variant. The completed server-owned bus run `1786189687522-42883-55d5eee4` passes all 553 assertions, including the
  five map-catalog checks and the Warehouse scene integration check. Strict typecheck, the production web build, targeted
  ESLint, Prettier, and `git diff --check` pass. Browser/HMR acceptance remains separate because this worktree has no
  connected Vite client.

## 2026-08-08 — Gun melee interrupts reload

- `F` gun melee now cancels an active clip or round reload before starting its swing. A round-based reload keeps any
  shells already committed, while the remaining timer, return pose, and reload HUD state are cleared immediately.
- Added a scene regression for the gun-melee interruption guard. The server-owned bus run
  `1786194787697-42883-f8e06ff0` passed all 556 assertions, including the new regression. Strict typecheck, the web
  production build, targeted Prettier, and `git diff --check` pass. The required Vite HMR request was accepted; no
  additional browser session was opened. Repository-wide lint remains red on 85 pre-existing dirty-checkpoint errors.
