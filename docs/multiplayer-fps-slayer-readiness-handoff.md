# Competitive FPS Slayer Multiplayer Readiness Handoff

**Document status:** planning handoff; not an implementation claim  
**Date:** 2026-08-07  
**Target:** browser-based Three.js first-person shooter with authoritative multiplayer  
**Mode:** Slayer, initially one fixed arena and a small player population  
**Readiness:** not ready for competitive play

## 1. Purpose

This document records the work required before the project can be called ready for a
competitive first-person shooter Slayer match. It is intentionally broader than the current
mahjong room prototype. The current multiplayer implementation proves room, ticket, WebSocket,
redaction, persistence, and reconnect patterns for a mahjong game; it does not provide an FPS
simulation, an avatar protocol, server-side combat, or competitive fairness.

The immediate discovery is important: the visible scene has a procedural body for one local
combat simulant, but it does not have a replicated player-avatar system. A camera-attached weapon
viewmodel is not a player model. A player who cannot see their own first-person hands, a remote
player, or a valid third-person body cannot yet be accepted as a competitive player.

This is a handoff and readiness contract. It does not authorize deployment, public matchmaking,
or edits to the separate dirty visual-table worktree.

## 2. Current checkout and ownership boundary

### 2.1 Handoff authoring lane

- Repository: `/Users/nv/repos/0x4007/hk-mahjong-coach`
- Handoff worktree: `.codex-worktrees/multiplayer-spec`
- Branch: `multiplayer-spec-g1aba1b1f8d`
- Base: `2f9e37d4930571e8a0cb061ae302379cc5fe15c1`
- State: intentionally dirty with the experimental mahjong multiplayer slice

### 2.2 FPS presentation lane

- Worktree: `.codex-worktrees/visual-table`
- Branch: `visual-table-gb9d082b587`
- Observed head: `1762f9b`
- State: dirty and user-owned; do not reset, clean, or edit it from this lane

Before implementation starts, the owner of the visual-table lane must reconcile its dirty files,
select the canonical FPS branch, record the base SHA, and decide whether the FPS server belongs in
this repository or a separate game repository. Do not cherry-pick this document's assumptions as
code without that reconciliation.

### 2.3 Evidence from the current visual scene

The following observations are from the visual-table source at handoff time:

- `apps/web/src/scene/mahjong-table.ts:3823-3863` defines `createSimulantBody`. It creates a
  simple head, torso, arms, and legs for one locally simulated combat marker.
- `apps/web/src/scene/mahjong-table.ts:11424-11467` chooses one distant simulant spawn, creates
  `simulantMarker`, and adds it to the scene. This is not a player registry or a network entity.
- The simulant spawn uses `SIMULANT_SPAWN_RADIUS_METERS = EXPLORATION_WORLD_HALF_SIZE` and can
  begin near the 500 m world boundary, while the composed table camera looks at the local room.
  Its existence in the scene graph therefore does not prove that a player model is visible.
- `apps/web/src/scene/mahjong-table.ts:9974-9990` owns one local simulant state, weapon, cooldown,
  and vitals object. It is not authoritative and cannot represent several connected players.
- `apps/web/src/scene/mahjong-table.ts:12710-12810` advances the local simulant and its weapon in
  the render loop. Movement, aiming, firing, damage, and death are therefore presentation-local.
- `apps/web/src/scene/mahjong-table.ts:4703` attaches the weapon model to the camera. This is a
  first-person viewmodel and must remain distinct from a world-space avatar.
- `apps/web/src/scene/player-vitals.ts` and `player-impact.ts` provide useful local presentation
  primitives, but health, shield, O2, impact, and death are not server-authoritative FPS state.
- `packages/protocol/src/multiplayer.ts` describes mahjong rooms. It has no FPS input, snapshot,
  avatar, hit, kill, score, or match-phase messages.
- `apps/server/src/multiplayer.ts` and `apps/server/src/deno-multiplayer.ts` call the mahjong core
  engine. They must not be treated as an FPS simulation merely because they already support rooms
  and WebSockets.

The invisible-model report is therefore a product and architecture gap, not only a missing mesh.
The fix must create an entity lifecycle and a visible acceptance test, not only change a material or
move one object closer to the camera.

## 3. Recommended first competitive slice

The following choices keep the first competitive slice small. They are recommendations, not hidden
requirements. Confirm any different choice before implementation because it changes the protocol,
simulation, map, and acceptance work.

| Decision             | Recommended v1                                       | Why                                                             |
| -------------------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| Mode                 | Free-for-all Slayer                                  | Avoid team ownership and friendly-fire rules in the first slice |
| Population           | 2–8 players                                          | Enough for a real match without solving large-session scaling   |
| Map                  | One authored arena                                   | One collision source, one spawn set, one performance budget     |
| Win condition        | First to 25 kills or 10 minutes                      | Deterministic end state and easy test fixtures                  |
| Respawn              | Fixed safe spawn selection with short protection     | Keeps matches moving and makes spawn tests bounded              |
| Weapons              | One pistol plus one automatic weapon                 | Proves hitscan, ammo, reload, switching, and balance seams      |
| Server tick          | Fixed 60 Hz simulation; 20–30 Hz snapshots initially | Stable authority with reasonable browser bandwidth              |
| Client presentation  | 60 Hz or display rate render; interpolation buffer   | Smooth remote movement without trusting the client              |
| Matchmaking          | Explicit room code only                              | No accounts, ranking, or public discovery in the prototype      |
| Competitive identity | Room ticket plus server-issued player ID             | Temporary local test identity; not a production account system  |

If “Slayer” means team Slayer, add team assignment, friendly-fire policy, team score, team spawn
rules, team color/outline policy, and team reconnect rules to the contracts before coding. Do not
silently add team behavior after the free-for-all protocol is in use.

## 4. Definition of ready

Do not use the words “multiplayer ready” until all of these are true on the same tested build:

1. A player model is visibly rendered in a controlled third-person verification view.
2. The local first-person view has a visible hand/weapon viewmodel and a valid world-space body
   policy for mirrors, shadows, spectators, and other clients.
3. Two or more real browser clients join the same room through the real HTTP and WebSocket path.
4. The server owns movement acceptance, collision, fire cadence, hit detection, damage, death,
   respawn, score, and match completion.
5. Clients can predict local movement and reconcile to server snapshots without divergent state.
6. Remote players interpolate smoothly, show the correct pose/weapon, and never reveal stale or
   impossible state after disconnect, death, or respawn.
7. A shot, hit, kill, assist, death, and respawn are replayable from a durable authoritative log.
8. Duplicate, delayed, reordered, dropped, malformed, oversized, and cross-player messages do not
   create extra damage, kills, ammo, movement, or score.
9. A process restart and a reconnect preserve the match phase and authoritative scoreboard, or the
   match is explicitly cancelled with a clear reason. Silent reset is not acceptable.
10. The same acceptance passes locally and through the intended Cloudflare Tunnel path with HTTPS
    and WebSocket upgrade.
11. Performance, abuse, privacy, and operational gates pass for the agreed player count.
12. The owner has observed the rendered result in a real browser. Build, typecheck, and unit tests
    alone are not visual or gameplay acceptance.

## 5. P0 blocker: create a real player-avatar system

### 5.1 Separate three visual representations

Create explicit, named entities rather than reusing the current simulant marker:

1. **Local viewmodel** — camera-relative arms, hands, weapon, muzzle, and reload presentation.
   It may be camera-attached and can use a dedicated render layer. It must not be the authoritative
   collision body.
2. **Local world avatar** — the player's world-space body, capsule, shadow caster, and optional
   reflection/spectator representation. Hide only the parts that would intersect the first-person
   camera, using a deliberate render-layer or material policy. Do not delete the body from the scene.
3. **Remote avatar** — the same avatar contract driven by server snapshots and interpolated pose,
   weapon, health/death, and spawn state. It must be visible to every other player and to a
   spectator camera.

The first-person camera must not be the parent of the complete networked body. If the body follows
the camera as a child, it will appear correct to one local view but cannot be seen by other clients,
will not cast the correct world shadow, and will inherit viewmodel sway and recoil incorrectly.

### 5.2 Avatar contract

Add a shared, validated avatar representation at the UI/protocol boundary. A minimum shape is:

```ts
type PlayerAvatarSnapshot = {
  readonly playerId: string;
  readonly displayName: string;
  readonly modelId: string;
  readonly teamId: string | null;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly rotation: { readonly yaw: number; readonly pitch: number };
  readonly velocity: { readonly x: number; readonly y: number; readonly z: number };
  readonly locomotion: "idle" | "walk" | "sprint" | "airborne" | "crouch";
  readonly equippedWeaponId: string;
  readonly action: "none" | "fire" | "reload" | "switch" | "melee";
  readonly health: number;
  readonly shield: number;
  readonly alive: boolean;
  readonly spawnProtectionEndsAtTick: number | null;
  readonly stateTick: number;
};
```

Validate every external value at runtime. Keep the complete hitbox and collision shape server-side;
the client receives only the public presentation fields needed to render another player. Do not
send concealed server state, weapon spread seeds, aim assist state, or authoritative hit evidence
to an opponent.

### 5.3 Model implementation requirements

- Create an `AvatarDefinition` registry with stable `modelId`, scale, capsule dimensions, socket
  names, material palette, and animation/pose capabilities.
- Provide one deterministic fallback mannequin. A missing GLTF, texture, animation, or shader must
  produce a visible fallback body, not an empty `Group`.
- Keep world units explicit. The avatar height, capsule height/radius, camera eye height, weapon
  socket, and foot offset must use one measured contract.
- Set and test `visible`, `layers`, `frustumCulled`, `renderOrder`, material opacity, depth write,
  and shadow flags for every mesh. Do not use transparent materials for the base body unless the
  alpha policy is tested.
- Update `matrixWorld` after network pose application and before any shadow, reflection, hit-proxy,
  or screenshot diagnostic pass.
- Use named sockets: `head`, `chest`, `weapon`, `muzzle`, `leftHand`, `rightHand`, and `feet`.
- Keep render geometry separate from the server collision proxy. A visual mesh must not become the
  source of truth for hits or movement.
- Make culling and material diagnostics available under a local debug flag. The diagnostic should
  show entity ID, world position, bounds, mesh count, visible/layer state, and the last snapshot tick.
- Do not rely on a far-away combat marker to prove the player model works. A deterministic test
  scene must place the avatar within the camera frustum at several distances and angles.

### 5.4 First-person visibility acceptance

The P0 fix is accepted only after a real browser check proves all of the following:

- Local hands and the selected weapon are visible while standing, crouching, aiming, reloading,
  switching, dying, and respawning.
- A controlled third-person camera sees the complete local fallback avatar, feet on the floor,
  correct scale, correct facing, and a stable shadow.
- A second browser sees the first browser's avatar moving, crouching, firing, dying, and respawning.
- The local camera does not show the inside of the head, torso clipping, detached hands, or a body
  that inherits weapon recoil.
- A missing asset intentionally renders the fallback mannequin and surfaces a diagnostic warning.
- The avatar remains visible at low, medium, and high quality settings and at the supported DPR.
- The model is visible after a reconnect, not only immediately after the initial join.
- A screenshot and scene diagnostics are recorded. A passing TypeScript test without a rendered
  frame does not close this blocker.

## 6. Authoritative match and simulation model

### 6.1 Match identity and rules

Create a separate FPS match aggregate. Do not overload mahjong `GameState`, room rules, or action
IDs. Persist:

- `matchId`, `roomId`, `mapId`, `modeId`, `rulesVersion`, and a rules hash
- server seed and an RNG algorithm/version for any randomized gameplay decision
- player roster, seat/team assignment, display names, and controller type
- fixed simulation tick and snapshot schema versions
- score target, time limit, respawn delay, spawn-protection duration, and weapon-set hash
- lifecycle timestamps and terminal reason

The server is the only owner of phase transitions: `waiting`, `ready`, `countdown`, `active`,
`ended`, `cancelled`, and `closed`. Clients may request ready/unready and actions, but cannot
declare the match active or ended.

### 6.2 Player lifecycle

Define explicit states and transitions:

```text
joining -> connected -> ready -> spawned -> alive
alive -> dead -> respawning -> spawned
alive -> disconnected -> reconnecting -> alive | dead | spectator
active match -> ended -> scoreboard -> room cleanup
```

Specify what happens when a player disconnects during countdown, alive play, death, or scoreboard.
The server must reserve the player identity for a bounded reconnect period and must never create a
second body for the same identity.

### 6.3 Fixed-step simulation

- Run the authoritative simulation on a monotonic clock at the selected fixed tick.
- Clamp or reject impossible frame deltas; never simulate a client-supplied elapsed time directly.
- Store input sequence, server tick, accepted movement result, and command provenance.
- Apply collision, acceleration, friction, gravity, crouch height, jump, sprint, and traversal in
  one server-owned movement system.
- Use the same authored collision geometry or a versioned server collision map. Render meshes are
  not sufficient evidence of collision parity.
- Never let the browser decide its final position, velocity, damage, ammo, kill, or score.

## 7. Input, replication, and network correctness

### 7.1 Client input commands

Define a compact input envelope with:

- `matchId`, `playerId`, protocol version, and monotonic client input sequence
- client timestamp plus the last acknowledged server tick
- held buttons, edge-triggered buttons, movement axes, look delta, selected weapon, and action nonce
- no client-provided position, health, damage, hit result, kill result, or score

Validate axis bounds, look-rate bounds, button transitions, input sequence monotonicity, payload
size, and per-connection rate. Duplicate input must be harmless. An old input must not rewind a
player or apply an old fire command after death.

### 7.2 Server snapshots

Use snapshot messages containing the authoritative tick, match phase, roster public state,
scoreboard, and the recipient's allowed player state. Prefer delta snapshots with a full snapshot
fallback. Include:

- `snapshotId`, `serverTick`, `acknowledgedInputSequence`, and rules/map hash
- public avatar transforms and animation state
- public weapon fire/reload effects and projectile/tracer events
- damage, death, respawn, score, and kill-feed events with event IDs
- `resyncRequired` when a client cannot safely apply a delta

Every snapshot must be idempotent and ordered by server tick. A reconnect starts from a full
snapshot, not from client memory.

### 7.3 Prediction and interpolation

- Predict only the local movement that is safe to predict. Reconcile to authoritative transforms.
- Keep a bounded input history and replay unacknowledged inputs after correction.
- Interpolate remote avatars from two valid server snapshots; do not extrapolate without a strict
  short horizon and a visible correction policy.
- Apply weapon and hit effects from server events, while allowing local muzzle presentation to feel
  immediate and then reconcile if the server rejects the shot.
- Handle duplicate, late, missing, and out-of-order frames without freezing the match.
- Show a small connection/latency indicator. Do not hide a resync or a server correction from the
  player.
- Add deterministic packet-loss and latency simulation to tests before live competitive claims.

## 8. Combat and Slayer rules

### 8.1 Weapon authority

Create one versioned weapon definition shared for display and server validation, including:

- damage, shield interaction, head/body/limb multipliers if used
- fire mode, cadence, burst rules, magazine, reserve ammo, reload duration
- projectile or hitscan behavior, muzzle origin socket, range, falloff, and spread
- recoil presentation versus authoritative aim behavior
- pickup/ammo policy and weapon-switch timing
- deterministic sound, tracer, and impact event identifiers

The client may request a fire action. The server decides whether the weapon was equipped, loaded,
off cooldown, alive, within rate limits, and aimed from a valid player state.

### 8.2 Hit detection

- Hitscan shots are resolved by the server against server collision and hitboxes.
- Projectile shots are spawned and simulated by the server; clients render a prediction only.
- If lag compensation is used, retain a bounded history of validated player hitboxes and document
  the rewind window. Never rewind through a death, spawn protection, or impossible teleport.
- Use explicit hitbox groups and multipliers. Record the hitbox ID and damage calculation version in
  the authoritative event, not in a client claim.
- Do not use the browser render raycaster as competitive hit detection. It is presentation only.
- Do not let the current simulant's local `fireSimulantWeapon` path become the network combat path.

### 8.3 Damage, death, and respawn

Define the complete server state machine:

1. Shield absorbs damage according to the versioned rules.
2. Health receives any remaining damage.
3. A dead player cannot fire, move, jump, claim pickups, or score another kill.
4. The server emits one deterministic death event with killer, assister(s), cause, weapon, and tick.
5. Score and kill-feed entries are committed once using an event ID/idempotency key.
6. The player enters a bounded respawn state and receives a validated spawn point.
7. Spawn protection is explicit, visible, and cannot be used to deal damage unless the rules say so.

Clarify whether O2/breathing belongs in competitive rules. The current visual lane has O2 movement
and aim effects; carrying that system into Slayer without a balance decision would create a hidden
second stamina/accuracy economy. If retained, it must be server-authoritative, surfaced in the HUD,
included in replays, and tested for fairness. Otherwise keep O2 as a noncompetitive sandbox layer.

### 8.4 Slayer scoring

Define and persist:

- kill, assist, death, suicide, environmental death, and disconnect forfeiture values
- tie-break order after the kill target or time limit
- whether a kill is awarded for damage over time, last hit, or credited ownership
- score events and kill-feed ordering when several deaths occur in one server tick
- scoreboard visibility to all players and spectator/read-only clients
- terminal match result and replay hash

No score may be computed in React or from a local player-vitals callback.

## 9. Spawn and map correctness

- Create a versioned collision map separate from decorative render meshes.
- Author spawn points with team/mode tags, visibility checks, minimum enemy distance, occupancy,
  floor support, nav/collision clearance, and deterministic fallback order.
- Validate a spawn on the server immediately before use; revalidate after reconnect.
- Prevent spawn points inside geometry, below the floor, outside world bounds, or within another
  capsule. Test every spawn with every crouch/standing capsule state.
- Add spawn protection and an anti-spawn-camp policy appropriate to the chosen mode.
- Add a map checksum to room/match creation and reject client/map mismatches.
- Expose a local map diagnostic showing collision, player capsules, spawn rays, and visibility tests.
- Keep the current 1 km exploration world out of the first competitive arena unless its streaming,
  collision, occlusion, and network bandwidth are explicitly budgeted. A small authored arena is a
  safer first acceptance surface.

## 10. First-person presentation and HUD

The existing first-person propagation contract remains valuable: camera, reticle, aim ray,
viewmodel, recoil, movement, and HUD must consume compatible shared state. For competitive play,
extend it with network truth:

- camera and local viewmodel respond immediately to input but never change server aim results
- the visible reticle, authoritative aim origin, muzzle socket, and tracer origin agree within a
  documented tolerance
- recoil and breathing sway remain presentation effects separate from server damage and spread
- reload and weapon switch cannot show a ready weapon before the server permits firing
- remote avatars show facing, locomotion, crouch, weapon, fire, reload, damage, death, and respawn
- no local-only staged opponent or simulant is mistaken for a network player
- HUD shows health, shield, ammo, weapon, reticle state, score, match timer, connection state,
  server correction/resync state, kill feed, and match phase
- accessibility settings cover color-blind team/target cues, reduced motion, scale, contrast,
  subtitles for important event audio, and keyboard/controller remapping

The player's own body policy must be explicit: first-person arms and weapon are always visible;
the world body is hidden only where it would intersect the camera; mirrors, shadows, spectator
views, and other clients use the full body. Test this policy with the actual renderer, not a mock
scene graph.

## 11. Protocol and persistence boundary

Create an FPS protocol namespace or version. Do not add FPS fields to mahjong room schemas until a
shared room contract is intentionally designed. Recommended message groups:

- `fps_room_create`, `fps_room_join`, `fps_ready`, `fps_start`
- `fps_input`, `fps_input_ack`, `fps_snapshot`, `fps_full_snapshot`
- `fps_fire_request`, `fps_weapon_event`, `fps_damage_event`
- `fps_player_spawned`, `fps_player_died`, `fps_player_respawned`
- `fps_score_update`, `fps_kill_feed`, `fps_match_ended`
- `fps_ping`, `fps_resync_required`, `fps_error`

Requirements:

- strict discriminated schemas and runtime validation for every external message
- independent transport sequence and authoritative server tick
- request IDs/idempotency for fire and other edge-triggered commands
- player identity bound to the room ticket; cross-player payloads rejected
- public-only roster and event projection; no opponent input history, hidden weapon spread state, or
  server collision internals
- bounded frames, message rate limits, malformed-frame close behavior, and origin checks
- full snapshot recovery after reconnect or missed deltas

Persist enough to audit and replay a match: match metadata, rules/map/weapon hashes, roster,
accepted input receipts, authoritative combat events, snapshots/checkpoints, terminal scoreboard,
and a chain hash. A local prototype may journal fewer high-frequency inputs if it retains a signed
event stream sufficient to explain every kill and score.

## 12. Security and competitive integrity

Before any public Cloudflare URL is used for competitive play:

- use HTTPS at the public edge and verify WebSocket upgrade through the tunnel
- keep origin allowlists bounded; do not enable wildcard browser access by default
- hash room tickets at rest, expire/revoke them, and never log raw tickets or query strings
- rate-limit room creation, joins, inputs, fire requests, reconnects, and malformed frames
- reject impossible movement speed, acceleration, cadence, ammo, reload, and aim-rate claims
- apply damage, kills, score, and match phases only on the server
- keep server secrets, RNG seeds, anti-cheat thresholds, and other players' private diagnostics off
  the client
- protect admin/debug endpoints from the public tunnel or require a separate authenticated path
- record connection, resync, rejection, and terminal-match metrics without recording raw private
  input or ticket material
- define abuse handling: room owner close, kicked player, rate-limit response, server shutdown, and
  match cancellation reason

A Cloudflare Quick Tunnel is suitable for a short friend smoke test, not a production competitive
service. It produces a temporary public URL and has no complete account, matchmaking, DDoS, abuse,
or stable-hostname policy. A named tunnel with Cloudflare Access and a deployment-managed origin is
required for a serious external test. The tunnel must point to the server that serves the browser
UI and WebSocket route. The current Deno KV entry on port 8000 is API/WebSocket-oriented and does
not by itself provide the browser shell.

## 13. Operations and observability

Add structured, privacy-safe metrics:

- connected players, rooms, active matches, phase duration, and reconnect count
- server tick duration, simulation overruns, snapshot size, dropped frames, and resync count
- RTT, jitter, packet loss, input rejection, and client correction magnitude
- fire requests, accepted/rejected shots, hit events, deaths, respawns, and terminal scores
- persistence latency, commit failures, replay/hash failures, and process restarts
- Cloudflare origin health, WebSocket upgrade failures, and tunnel disconnects

Every match should expose a redacted diagnostic summary and an immutable match/replay identifier.
Never use a green health endpoint or a successful tunnel process as proof that a playable match
works. The proof must include two real clients and an observed shot-to-score path.

## 14. Test and acceptance plan

### 14.1 Unit and property tests

- avatar registry validates scale, sockets, fallback, materials, and deterministic model selection
- avatar visibility diagnostics detect missing meshes, zero scale, bad layers, invalid bounds,
  non-finite transforms, and missing fallback assets
- movement stays within collision bounds and rejects impossible acceleration or teleport distance
- weapon cadence, ammo, reload, spread, damage, shield, and hitbox rules are deterministic
- death/respawn/score transitions are idempotent and cannot award duplicate kills
- spawn selection never chooses occupied or invalid geometry in generated fixtures
- snapshot apply, delta ordering, interpolation, reconciliation, and full-resync recovery are
  deterministic under duplicate and out-of-order frames
- event-chain replay reproduces the terminal scoreboard and state hash

### 14.2 Integration tests

- two to eight simulated clients join one room and receive distinct player IDs
- all clients receive the same public roster and event order
- one client's movement and shot update other clients after server commit
- a client cannot submit another player's input, fire, damage, score, or position
- duplicate fire request IDs produce one shot and one possible hit
- stale inputs are rejected or safely ignored without rewinding state
- disconnect/reconnect yields one avatar and one authoritative state
- process restart restores the match or emits an explicit cancellation
- packet loss, delay, reordering, and clock skew remain within the documented correction policy

### 14.3 Browser and rendered acceptance

Use the real built web artifact and real WebSocket path. For the first visibility regression, record:

1. a spawn screenshot with local first-person hands/weapon;
2. a third-person screenshot with the full local fallback avatar and shadow;
3. a two-browser screenshot showing each remote avatar;
4. a death/respawn screenshot with the correct HUD and avatar lifecycle;
5. a scene diagnostic snapshot containing entity ID, position, bounds, mesh count, and snapshot tick.

Then verify with two real browser contexts:

- room creation and join;
- ready/countdown/start;
- movement and remote interpolation;
- one accepted shot, one rejected stale/duplicate shot, and one server-confirmed hit;
- death, kill-feed update, score update, and respawn;
- reconnect from a missed snapshot;
- match end and scoreboard;
- same flow through the Cloudflare Tunnel URL.

Playwright, unit tests, HMR, and a compile result are supporting evidence only. They do not replace
the rendered screenshots and two-client gameplay observation.

### 14.4 Load and abuse checks

At the selected v1 population, hold a match for at least the planned maximum duration while
measuring server tick overruns, bandwidth, memory, draw calls, and browser frame time. Add tests for
rapid input, fire spam, oversized frames, malformed JSON, reconnect storms, room floods, invalid
tickets, and intentionally impossible movement. The server must fail closed without crashing or
leaking another player's state.

## 15. Implementation order

Do not start broad visual polish before each gate closes.

### Phase 0 — Contract and lane reconciliation

- confirm FFA versus team Slayer, player cap, map, score target, time limit, weapons, and O2 policy;
- freeze the canonical visual-table branch and record dirty ownership;
- write versioned FPS schemas and a match state diagram;
- define avatar, collision, weapon, snapshot, replay, and rules hashes.

### Phase 1 — Avatar visibility and local presentation

- implement `AvatarDefinition`, fallback mannequin, sockets, world avatar, remote avatar component,
  and first-person body policy;
- fix the invisible-player report with a deterministic near-camera fixture;
- add visibility diagnostics and a rendered P0 regression;
- keep the current camera/viewmodel propagation and weapon material work intact.

### Phase 2 — Server simulation

- add fixed-step movement, collision, spawn, lifecycle, health/shield, weapon, and match-score
  systems on the server;
- move the current local simulant rules behind server-owned contracts;
- add deterministic event log and terminal replay.

### Phase 3 — Replication and reconciliation

- add input envelopes, acknowledgements, snapshots, delta/full recovery, interpolation, local
  prediction, reconciliation, clock sync, and resync UI;
- bind each browser entity to exactly one server player ID;
- prove two-client movement and reconnect before adding more weapons.

### Phase 4 — Combat and Slayer lifecycle

- implement authoritative fire/hit/damage/death/respawn/score/kill-feed events;
- add match countdown, end conditions, scoreboard, room cleanup, and rematch policy;
- validate spawn protection and anti-spawn-camp behavior.

### Phase 5 — Edge, security, and operations

- add rate limits, anti-cheat validation, ticket expiry/revocation, privacy-safe logs, replay audit,
  metrics, graceful shutdown, restart behavior, and abuse handling;
- validate the origin and WebSocket path through a named Cloudflare Tunnel;
- run packet-loss, load, and public-edge smoke tests.

### Phase 6 — Competitive acceptance

- freeze the exact build and rules hashes;
- run the complete unit, property, integration, browser, rendered, load, security, and replay gates;
- record evidence, rough edges, known exploits, and rollback procedure;
- only then describe the build as competitive prototype ready. Production readiness requires a
  separate explicit release decision.

## 16. Suggested ownership map

These are proposed boundaries for the next implementation writer:

| Surface                                         | Responsibility                                                               |
| ----------------------------------------------- | ---------------------------------------------------------------------------- |
| `apps/web/src/scene/avatar.ts`                  | Avatar registry, fallback model, sockets, visibility policy                  |
| `apps/web/src/scene/remote-players.ts`          | Snapshot interpolation, remote animation, lifecycle rendering                |
| `apps/web/src/scene/mahjong-table.ts`           | Scene integration only; remove staged simulant dependence for network play   |
| `apps/web/src/scene/player-vitals.ts`           | Presentation adapter; authoritative vitals must come from the FPS state      |
| `apps/web/src/scene/weapons.ts`                 | Shared presentation definitions; server validation is a separate authority   |
| `packages/protocol/src/fps.ts`                  | Versioned FPS envelopes, snapshots, events, and errors                       |
| `packages/core` or a new FPS simulation package | Fixed-step movement, combat, match reducer, replay                           |
| `apps/server/src/fps-match.ts`                  | Room-to-match lifecycle, tickets, sockets, rate limits, snapshot publication |
| `packages/persistence`                          | Match metadata, event journal, snapshots, replay, terminal scoreboard        |
| `tests/e2e/fps-slayer.spec.ts`                  | Two-client browser and rendered acceptance                                   |
| `tests/network/fps-simulation.test.ts`          | Delay/loss/reorder, prediction, reconciliation, and resync                   |
| `docs/fps-slayer-rules.md`                      | Human-readable rules, balance assumptions, and version history               |

Names are suggestions. Preserve the ownership rule: core/server decides; web renders and requests.

## 17. Explicit non-goals for this handoff

- No public matchmaking, accounts, ranks, wagering, or persistent identity.
- No claim that the existing mahjong multiplayer service is an FPS server.
- No client-authoritative damage, score, position, or kill path.
- No production deployment or public Cloudflare tunnel started by this document.
- No broad asset replacement before the fallback avatar and visibility acceptance pass.
- No copying of proprietary game assets or exact branded character designs.
- No use of a screenshot, health check, HMR event, build, or focused unit suite as sole gameplay proof.

## 18. Handoff checklist

The successor should update this checklist with commit SHAs and evidence links, not only prose:

- [x] Canonical FPS worktree, branch, base SHA, dirty owner, and active processes are recorded in §23
      and the final local gate evidence.
- [x] FFA/team decision, player cap, arena, weapons, score target, timer, respawn, and O2 policy are
      recorded in code and `docs/fps-slayer-rules.md`.
- [x] `AvatarDefinition` and fallback model exist with validated sockets and scale.
- [x] Local world avatar and remote avatar are distinct from the camera-child viewmodel.
- [x] Invisible-player regression passes in a real rendered browser frame.
- [x] Server-owned movement, collision, inputs, tick, snapshots, reconciliation, and resync exist.
- [x] Server-owned fire, hit, damage, death, respawn, kill, assist, and score events exist.
- [x] Spawn validation, protection, map hash, and collision parity pass locally.
- [x] Match lifecycle, reconnect, restart, terminal scoreboard, and replay pass locally.
- [x] Local protocol, ticket, origin, frame, rate, privacy, and anti-cheat input-boundary checks pass;
      production anti-cheat operations remain open.
- [x] Two-client browser acceptance passes on the local path.
- [ ] The same two-client flow passes through a named Cloudflare Tunnel.
- [x] Local packet-order/resync, load, abuse, and performance budgets are recorded.
- [x] Exact build/rules/map/weapon hashes and the non-destructive rollback procedure are recorded;
      the external rollback drill remains open.
- [ ] Only after all checks: mark the competitive prototype ready; keep production readiness separate.

## 19. Successor implementation status — 2026-08-07

The first experimental authority and visibility slice is implemented in the handoff authoring lane.
This does not close the competitive-readiness contract.

- [x] The FPS lane is additive in `.codex-worktrees/multiplayer-spec`; the dirty `visual-table`
      worktree was not edited.
- [x] FFA, two-to-eight player cap, one arena, 25-kill/10-minute target, two weapons, 60 Hz tick,
      20 Hz snapshot intent, fixed respawn/protection, and disabled O₂ policy are versioned in code and
      `docs/fps-slayer-rules.md`.
- [x] `AvatarDefinition`, fallback mannequin, named sockets, local world avatar, camera-relative
      viewmodel, remote avatar registry, diagnostics, interpolation, and browser third-person fixture
      exist.
- [x] Server-owned movement, collision, input sequence checks, fire cadence, hitscan, damage,
      death, respawn, score, match phase, replay chain, checkpoint journal, and ticket binding exist.
- [x] Local two-client HTTP/WebSocket/browser acceptance passed on the isolated 4183 build. The
      recorded frame shows the fallback mannequin in the third-person verification view.
- [ ] Cloudflare Tunnel / named-edge acceptance, packet-loss and clock-skew recovery through the
      public edge, privacy-safe production operations, and the full public-edge gate remain open.
- [x] The local first-person lifecycle (reload, switch, death, respawn, low/medium/high quality) has
      dedicated rendered evidence in the Playwright suite; no production competitive claim is made.

The current implementation is therefore an experimental competitive prototype slice. Keep the
readiness heading “not ready for competitive play” until every unchecked item above and the complete
definition-of-ready list pass on one frozen build.

## 20. Prior follow-up evidence — 2026-08-07 (superseded by §22)

The canonical dirty worktree remains the only implementation lane. The following local evidence was
recorded before the deterministic-spawn and diagnostics patch in §22; it does not change the
readiness heading.

- [x] Correct xoshiro128** output and lock a deterministic FPS RNG vector.
- [x] Expand the authored map to eight validated spawn points for the eight-player cap.
- [x] Add deterministic input-history reconciliation and snapshot ordering/full-resync tests.
- [x] Add deterministic avatar mesh/bounds/fallback diagnostics and browser data attributes.
- [x] Cover ticket expiry, origin, frame-size, binary-frame, rate, clock-skew, duplicate-input,
      request-idempotency, reconnect-reservation, duplicate-socket, and resync behavior.
- [x] Run the local eight-client gate: 600 ticks, 4,800 accepted inputs, 200 snapshots, 511
      authoritative events, replay verification, max simulation tick 0.405 ms, receipt digest
      `sha256:639ba5744cb70e5e82d7358f0c6ae35e45311677ceedc19a3be312ce1e0fe4ec`.
- [x] Extend the local Playwright flow to assert fallback mesh diagnostics and low/medium/high
      quality transitions alongside the two-client first-/third-person screenshots.
- [x] Run the simulated planned-duration authority gate: eight clients for 36,000 ticks, 288,000
      accepted inputs, 96,000 snapshots, 56,635 events, 604,152,961 serialized snapshot bytes,
      0.626 ms observed maximum simulation tick, receipt digest
      `sha256:a499d481688f6413687e76e52554d028f0ac6b9c95599c298510e96aa2b18424`.
- [ ] Complete a rendered fire-to-hit-to-kill/death/respawn/reload/switch evidence set with a
      deterministic browser scenario.
- [x] Hold the planned-duration 2–8-client local browser/network load budget and record
      server/browser performance (final receipt in §23).
- [ ] Verify the same flow through an explicitly authorized named Cloudflare Tunnel.
- [ ] Complete privacy-safe anti-cheat operations, rollback evidence, and public-edge review.

The local prototype is stronger than the initial slice, but it remains experimental and is not
multiplayer-ready for competitive play.

## 21. Prior local validation and rollback record — 2026-08-07 (superseded by §22)

All evidence in this prior section was run against the pre-§22 dirty worktree. It is local evidence
only; it does not close the named-edge, rendered lifecycle, or operational gates above.

- [x] `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass. The final unit
      suite reports 393 tests in 34 files.
- [x] `pnpm build` passes. The production artifact serves `/api/health` and the browser shell on
      isolated port 4184 (`status=ready`, `schemaVersion=1`, shell marker present). The existing
      user-owned process on port 4173 was not touched.
- [x] `pnpm test:e2e` passes both browser scenarios on isolated port 4183, including FPS avatar
      rendering, reconnect, diagnostics, and low/medium/high quality transitions.
- [x] `pnpm test:fps:gate` passes with the deterministic receipt digest recorded above.
- [x] `pnpm test:fps:load` passes with the deterministic receipt digest recorded above; the final
      observed maximum simulation tick was 0.626 ms and elapsed wall time was 67.627 s.

The final built-output manifest uses sorted relative paths and SHA-256 of each file's
`sha256sum` line, then SHA-256 of that manifest. The aggregate is
`sha256:40591d72b87168138eed091ea881c61e87ccd61fad57406723b9fba7f600d558`. Key component
manifests are:

| Output                      | Manifest SHA-256                                                          |
| --------------------------- | ------------------------------------------------------------------------- |
| `apps/web/dist`             | `sha256:e810cf242b797c6839a8ec83fe308ba468fd4abb9367f2bc8fc7b92219ebba27` |
| `apps/server/dist`          | `sha256:9611d8def672eccfe9315dc96d5908e8b64ddec6e8aed1ff75e4759f996f3275` |
| `packages/fps/dist`         | `sha256:f5df56893f36e0b28cc728fa71cfb58f17787d61d0eb1e6be242479f909dc365` |
| `packages/protocol/dist`    | `sha256:629e2c58e14f8299e38e0bd369990353ba5c8a585be07153f48f134c5535ad3d` |
| `packages/persistence/dist` | `sha256:d057edc2b77e1a8ebfaddf4cdde53c6f0b6e82b17ad139f3f107d37a8ef3bd27` |

Rollback is intentionally a source/build selection, not a destructive reset of this dirty lane:

1. Stop only the FPS service instance being evaluated and preserve its SQLite journal and logs.
2. Select a previously recorded source SHA and artifact manifest from the release record; use a
   clean temporary checkout or retained artifact bundle, never `git reset --hard` in this lane.
3. Install from the matching lockfile, rebuild, and require the recorded aggregate/component
   hashes plus the rules, map, and weapon hashes to match before serving traffic.
4. Run the isolated health/browser smoke and `pnpm test:fps:gate` on the candidate. If any check
   differs, keep the candidate stopped and restore the last accepted artifact.
5. Preserve the journal/replay chain for audit. If the selected code cannot read it exactly, cancel
   the experimental match with an explicit reason; do not silently start a new authoritative match.

No rollback or public deployment was performed for this handoff. The competitive readiness heading
must remain “not ready for competitive play” until the unchecked rendered, tunnel, load-budget,
privacy, anti-cheat, and operational items are independently observed on one frozen build.

## 22. Prior current local validation after deterministic spawn and diagnostics patch — 2026-08-07 (superseded by §23)

This section supersedes the receipts and artifact hashes in §21. The source changed after that
record: spawn selection now uses only the match seed and spawn ordinal, and service diagnostics
expose privacy-safe simulation, resync, and snapshot-failure counters. The canonical worktree is
still intentionally dirty on `multiplayer-spec-g1aba1b1f8d`, based at
`2f9e37d4930571e8a0cb061ae302379cc5fe15c1`; the separate `visual-table` worktree and its port
4173 process were not touched.

- [x] `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass on the current source:
      395 tests in 34 files.
- [x] `pnpm build` passes. A built ESM server on isolated port 4184 returned
      `{"status":"ready","schemaVersion":1}` from `/api/health` and served the
      `Hong Kong Mahjong Coach` shell marker. No public server or tunnel was started.
- [x] The complete Playwright FPS spec passes on isolated port 4183 (`2 passed`). The first test
      records 79 browser frames over about 2 seconds (average 25.53 ms, p95 35.2 ms, max 35.3 ms),
      24 draw calls, 3,950 triangles, and a sampled 33.3 ms frame. The HUD asserts an `RTT N ms`
      value, and low/medium/high quality transitions plus first-/third-person screenshots pass.
      The complete `pnpm test:e2e` suite also passes all 3 tests, including the pre-existing
      mahjong two-client/reconnect flow.
- [x] The second browser scenario proves weapon switch, reload, hit, kill, death, respawn, score,
      kill feed, and the authoritative reload window. Evidence files are
      `test-results/fps-slayer-first-person.png`, `test-results/fps-slayer-third-person.png`,
      `test-results/fps-slayer-reload.png`, `test-results/fps-slayer-death.png`, and
      `test-results/fps-slayer-respawn.png`.
- [x] The browser diagnostics request sees two connected players and one active match with
      `simulationTicks > 0`, `persistenceFailures: 0`, and `snapshotFailures: 0`; the response is
      checked not to contain the player's ticket. The unit privacy test also excludes sessions and
      input receipts.
- [x] `pnpm test:fps:gate` passes with 4,800 accepted inputs, 200 snapshots, 523 authoritative
      events, max simulation tick 2.169 ms, and receipt digest
      `sha256:5e6a6d5eb457e9565d9e51953a753382672ddcd93cfef613af93d8cf6854d482`.
- [x] `pnpm test:fps:load` passes with 288,000 accepted inputs, 96,000 snapshots, 56,591
      authoritative events, 604,659,058 serialized snapshot bytes, max simulation tick 0.677 ms,
      and receipt digest
      `sha256:73d4e94e860e3467bc02896a97448a361267457efb9fa51560bee4b20307cd8e`.
- [x] The seeded-spawn regression proves that room-local random player IDs do not change spawn
      geometry. This removes the prior lifecycle-test race where a valid ray could be blocked by
      center cover for the same requested match seed.

The current output manifest uses sorted repository-relative paths under the top-level `apps/*/dist`
and `packages/*/dist` directories. Each line is the SHA-256 file digest plus its relative path; the
aggregate is the SHA-256 of the newline-terminated manifest:

`sha256:8bd64d0e781ddf68508f003aec73d3df6106283a921ef45519a2b99cf12397ca`

| Output                      | Manifest SHA-256                                                          |
| --------------------------- | ------------------------------------------------------------------------- |
| `apps/web/dist`             | `sha256:69d736deae6d543ed63c22d19220de067ea4580cbad4e888448d1b9d43f295c2` |
| `apps/server/dist`          | `sha256:8dc6a1d9ecba637b5f9099032c8652029a6af6c56b626d732ba50a607848aaa8` |
| `packages/fps/dist`         | `sha256:2143fd0c3d4f925b96e165bb5119d12f8cc496f6d3d66ade8f0660537729a9cc` |
| `packages/protocol/dist`    | `sha256:629e2c58e14f8299e38e0bd369990353ba5c8a585be07153f48f134c5535ad3d` |
| `packages/persistence/dist` | `sha256:d057edc2b77e1a8ebfaddf4cdde53c6f0b6e82b17ad139f3f107d37a8ef3bd27` |

The rules, map, and weapon identities are unchanged:

- rules: `sha256:af61d3c8254e65a350872b956dfc7e80394bff7adebd2c530447077e83b81068`
- map: `sha256:cee4798d193d1ed82ec7b0e0d48f891de54b09dc7c1c82c68524d675cc5f96f1`
- weapons: `sha256:aae225cf0c9fdac72848817488cbf60b7d8c62a0925fc88bf91f22efd841466b`

The prototype was still not ready for competitive play at this point. The final local browser/network
soak and load-budget result is recorded in §23; the named Cloudflare Tunnel, public-edge review,
production anti-cheat/privacy operations, and an operational rollback drill remain open.

## 23. Prior final local browser/network soak after snapshot publication change — 2026-08-07 (superseded by §24)

This is the current local evidence for the intentionally dirty
`multiplayer-spec-g1aba1b1f8d` worktree at base `2f9e37d4930571e8a0cb061ae302379cc5fe15c1`.
It supersedes the local receipts and artifact hashes in §22. The separate `visual-table` worktree
and its port 4173 process were not touched. No public server or Cloudflare Tunnel was started.

The FPS service no longer broadcasts a snapshot for every accepted input. The fixed-step loop now
coalesces publication requests and schedules socket serialization with `setImmediate` at the
configured snapshot cadence or when an authoritative event changes. This keeps network/kernel
writes outside the simulation tick budget while retaining event-triggered updates and full-snapshot
resync behavior.

- [x] `pnpm test:fps:browser-soak` passed with eight real headless browser clients on the local
      HTTP/WebSocket path. The planned 600-second hold was observed for `602.128 s`; all eight
      sockets remained connected and the match remained active.
- [x] Server soak diagnostics: `36,265` ticks; average tick `0.181 ms`; maximum tick `10.575 ms`;
      `0` simulation overruns; `96,029` accepted inputs; `0` rejected inputs; `96,013` snapshots;
      `548,047,275` snapshot bytes; `8` WebSocket upgrades; and `0` resync, snapshot, persistence,
      or replay failures.
- [x] Browser soak samples: `121` frames per client over the two-second sample; p95 frame time
      `16.8–16.9 ms`; maximum frame time `18.3–18.4 ms`; draw calls `96–98`; triangles
      `22,286–22,310`; and maximum sampled heap `20.5 MB`.
- [x] The local planned-duration 2–8-client browser/network load budget is complete for this
      isolated run. Receipt: `test-results/fps-browser-soak.json`; receipt SHA-256
      `sha256:3be1aaebeebbdc7f13db9217e3eeb84da43f4100ae523c13160419150a44281a`.
- [ ] Named Cloudflare Tunnel/public-edge acceptance, packet-loss and clock-skew recovery, abuse
      and anti-cheat operations, privacy review, and an external rollback drill remain open.

The final build artifact manifest covers all 29 files under `apps/*/dist` and `packages/*/dist`.
It is sorted by repository-relative path, uses one `sha256sum` line per file with actual newline
separators, and is hashed as a newline-terminated manifest. Aggregate:
`sha256:f68fe797daeba852cda0e29f1ef34cbc5c42af91656c783c5aaa17876a16e3e6`.

| Output                        | Manifest SHA-256                                                          |
| ----------------------------- | ------------------------------------------------------------------------- |
| `apps/cli/dist`               | `sha256:aaaf377161a6f2379483c0e4ec281ce8439d18d0bea3e2f367e89784c6d34428` |
| `apps/server/dist`            | `sha256:9f116650bfc34281b93288841619348363ca73f06bba9b69096b8daec7b9797a` |
| `apps/web/dist`               | `sha256:9baa0ac4be9070af383cd5f6e6a02ff5626d75624865e9c177123a2e06887c00` |
| `packages/analysis/dist`      | `sha256:a32806e5da81a6994b9273339742455f11d59092f6873234f4944c54f093d991` |
| `packages/bots/dist`          | `sha256:47553652cbdf1c5ee5efb4d61dce03db7b05b44be2b3bfba140fcaa2f042222f` |
| `packages/coach/dist`         | `sha256:57c61db5dd01a4c23926adcef708b257ce6d264e8b1c7c31943a1719c8f7dc12` |
| `packages/core/dist`          | `sha256:e7258a03cdde9bc96cfcb3e892d39ab0cecf307ac9cfcde4085996e1b5ce4bad` |
| `packages/fps/dist`           | `sha256:51ab25bf306c8d72cf299495b836efb4a292add995912b688d36896ec99557e7` |
| `packages/hk-rules/dist`      | `sha256:c352265da8cbc77b1aebf05c01125cc82a85f779bf56d94745cf3e6844952f24` |
| `packages/persistence/dist`   | `sha256:6e3f9fb6ac66f8fcc6331fe4653be9ec6d077441a59bcec04cc4d6154f2966b0` |
| `packages/protocol/dist`      | `sha256:b6b0d69741f2706046a002d2f28429ae12803a830dacccfbff0afbcef199b8c1` |
| `packages/test-fixtures/dist` | `sha256:948503f28bcf4e8dcb878b23084778ada00c634272e4b5df4957e5eb3f539685` |
| `packages/tile-ui/dist`       | `sha256:065bbee975e8ca46253f4419e861b961432fe30e29ebf4d58db3c7dc50b7d6ea` |

The prototype remains an experimental local competitive slice, not ready for competitive play.
The local soak does not prove named-edge behavior, production operations, or the competitive
definition of ready.

## 24. Local abuse and network-boundary gate after input hardening — 2026-08-07

The server now rejects client acknowledgements more than two ticks in the future and keeps
rate-limit, cross-player, stale-clock, and malformed-frame metrics distinct. The no-argument local
gate `pnpm test:fps:abuse` exercises the real Fastify routes and the service WebSocket seam.

- [x] HTTP room creation and join floods hit their bounded limits: one create overflow and one join
      overflow returned `429`.
- [x] Invalid ticket and cross-player input returned `403`; stale-clock and future-acknowledgement
      inputs returned `409`; malformed JSON returned `400`.
- [x] Malformed text produced an FPS error; oversized and binary frames closed with `1009` and
      `1003`; a replacement socket closed the previous socket with `4001`; a resync request returned
      a full snapshot.
- [x] The privacy-safe diagnostics response contained no ticket. The receipt recorded three
      rate-limited requests, one malformed frame, and one oversized frame. Canonical receipt digest:
      `sha256:49361f2876cf47822e1b3a920ae5377ca1e30a2cdd83817179acbec8cc84d34d`. The persisted
      receipt file SHA-256 is `sha256:34295aaf2b4840687d8e6fe313f0fcb66580f815b2f10b93eb959dc27472da76`.

### Fresh post-hardening local browser/network soak

The exact hardened source also passed the planned-duration local browser/network soak. No public
server or Cloudflare Tunnel was started, and the separate `visual-table` worktree and port 4173
process were not touched.

- [x] `pnpm test:fps:browser-soak` held eight real headless browser clients for `602.169 s` against
      the planned 600-second duration. The server recorded `36,286` ticks, average/max tick times
      of `0.029/4.499 ms`, `0` simulation overruns, `96,029` accepted inputs, `0` rejected inputs,
      `96,072` snapshots, `548,384,766` snapshot bytes, and `8` WebSocket upgrades.
- [x] The soak recorded `0` resync requests, snapshot failures, persistence failures, or replay
      failures. Browser samples were `121` frames per client with p95 frame time `17.3–17.4 ms`,
      maximum frame time `17.6–17.7 ms`, `96–98` draw calls, `22,286–22,310` triangles, and a
      maximum sampled heap of `26.0 MB`.
- [x] The local planned-duration 2–8-client browser/network load budget is complete for this
      isolated run. Receipt: `test-results/fps-browser-soak.json`; receipt file SHA-256
      `sha256:155fd93abab3fe73a951597c537e08328e18de644b8c2c4fa3a2f535de5b9813`.

### Deterministic packet-loss, ordering, and clock-skew gate

The no-argument local gate `pnpm test:fps:network` now exercises a deterministic transport fault
policy before any public-edge claim. It drops one delta, delays and reorders later deltas, delivers a
duplicate, and verifies that the client tracker requests recovery without applying an extra state
transition. It also tests the service clock-skew boundary with a fixed `10,000 ms` window.

- [x] One dropped frame and one delayed/reordered frame sequence produced two full-resync requests;
      the missing frames were accepted in order afterward, the duplicate was idempotent, and the
      tracker reached server tick `125`.
- [x] A timestamp exactly on the `10,000 ms` boundary was accepted; a stale timestamp was rejected
      as `stale_input`; and an acknowledgement three ticks ahead was rejected as `invalid_request`.
- [x] The canonical receipt digest is
      `sha256:d6d711644678a498d0ea5815e0ae835564f9a3717e76c915c35992841d40bcdd`; the receipt file
      SHA-256 is `sha256:1be9e4fe6b80122733661ba7d07506492f65fc7e28fc18ff63f337e7734307df`.

The service diagnostics now also expose privacy-safe room/phase duration, dropped-frame,
persistence latency/commit, and fire/shot/hit/death/respawn/terminal-event counters. They remain
redacted: raw tickets, sessions, input receipts, seeds, and private diagnostics are not returned.

Together these close the local input-boundary, abuse, deterministic network-fault, and
planned-duration browser/network load gates only. Packet loss and clock skew through a named edge,
production anti-cheat/privacy operations, external rollback, and competitive readiness remain open.

The current dirty source also contains the server-owned AI competitor. Its focused browser test
passed. An earlier full `pnpm test:e2e` attempt timed out in the two-client switch/reload/kill/death/
respawn lifecycle; that transient result is superseded by the four-test rerun and current soak in
§25. The earlier ten-minute soak above did not include the AI source. The manifest below is the exact
post-AI build identity; current post-AI browser and soak evidence is recorded in §25.

The final build artifact manifest after input hardening and the AI competitor covers all 29 files
under `apps/*/dist` and `packages/*/dist`. It is sorted by repository-relative path with actual
newline separators and has aggregate
`sha256:b1897b9d2e1055feb9f4d0d719fb345fa6c17f29a97f5b36750221894411c701`.

| Output                        | Manifest SHA-256                                                          |
| ----------------------------- | ------------------------------------------------------------------------- |
| `apps/cli/dist`               | `sha256:aaaf377161a6f2379483c0e4ec281ce8439d18d0bea3e2f367e89784c6d34428` |
| `apps/server/dist`            | `sha256:7c44b7e7e8b1a4f54d979ed57d4b7c415cb0195dfd72e15d624634b899cbbf3c` |
| `apps/web/dist`               | `sha256:c96ae09a43dae1077b916fbdbc6177179adcb3f1a92c7aa888c8cf644a87d8df` |
| `packages/analysis/dist`      | `sha256:a32806e5da81a6994b9273339742455f11d59092f6873234f4944c54f093d991` |
| `packages/bots/dist`          | `sha256:47553652cbdf1c5ee5efb4d61dce03db7b05b44be2b3bfba140fcaa2f042222f` |
| `packages/coach/dist`         | `sha256:57c61db5dd01a4c23926adcef708b257ce6d264e8b1c7c31943a1719c8f7dc12` |
| `packages/core/dist`          | `sha256:e7258a03cdde9bc96cfcb3e892d39ab0cecf307ac9cfcde4085996e1b5ce4bad` |
| `packages/fps/dist`           | `sha256:f1ac497d94a7272fe8e11e2a311ff31985f13ab9004f5243a2accd30ac6ec6bf` |
| `packages/hk-rules/dist`      | `sha256:c352265da8cbc77b1aebf05c01125cc82a85f779bf56d94745cf3e6844952f24` |
| `packages/persistence/dist`   | `sha256:6e3f9fb6ac66f8fcc6331fe4653be9ec6d077441a59bcec04cc4d6154f2966b0` |
| `packages/protocol/dist`      | `sha256:e77e7cc27ba84fb3dfdeee093fc511401a43a14cdcc8ba63b5609e17b5d8421e` |
| `packages/test-fixtures/dist` | `sha256:948503f28bcf4e8dcb878b23084778ada00c634272e4b5df4957e5eb3f539685` |
| `packages/tile-ui/dist`       | `sha256:065bbee975e8ca46253f4419e861b961432fe30e29ebf4d58db3c7dc50b7d6ea` |

## 25. Current post-AI local validation and browser soak — 2026-08-07

This section supersedes the stale lifecycle note and the pre-AI soak caveat in §24. The exact
current source is the intentionally dirty `multiplayer-spec-g1aba1b1f8d` worktree at rebased
`12f358d3e67a72944af4701c0c2c52508d28f76d`. A concurrent rebase moved this branch from the prior
`2f9e37d4930571e8a0cb061ae302379cc5fe15c1` base; that state change is recorded rather than hidden.
The separate `visual-table` worktree and its port 4173 process were not touched. No public server,
named Cloudflare Tunnel, or deployment was started.

- [x] `pnpm format:check`, `pnpm typecheck`, and `pnpm build` pass on this rebased source.
- [ ] `pnpm lint` is not green: the rebased visual-table/movement lane reports 86 existing errors,
      including `apps/web/src/main.tsx`, `apps/web/src/scene/mahjong-table.ts`,
      `apps/web/src/scene/mahjong-physics.ts`, and `scripts/movement-simulate.ts`. Those unrelated
      diagnostics were not rewritten during the FPS redaction fix.
- [ ] `pnpm test` is not green on this rebased source: `557/559` tests pass, with failures in the
      visual weapon-temperature fixture and the observation-only bot personality fixture. The
      focused FPS suite remains green with `26` tests across four files.
- [x] Public RNG redaction is covered by the focused protocol/service tests: `fpsSnapshotSchema`
      and `fpsReplaySchema` reject a `seed` field, `FpsMatch.snapshot()` omits it, and
      `FpsMatchService.getReplay()` strips it before parsing. The HTTP, ticket-expiry, WebSocket
      resync, and restart-recovery tests assert that snapshots/replays do not contain the seed.
- [x] `pnpm test:e2e` passes all four tests on this state: the mahjong reconnect flow, two-client
      FPS rendered avatars and reconnectable state, authoritative switch/reload/hit/kill/death/
      respawn, and solo AI rival. The latest two-second FPS sample recorded 74 frames, average
      `27.26 ms`, p95 `34.7 ms`, max `35.2 ms`, `24` draw calls, and `3,950` triangles.
- [x] `pnpm test:fps:abuse` passes with receipt digest
      `sha256:49361f2876cf47822e1b3a920ae5377ca1e30a2cdd83817179acbec8cc84d34d`.
- [x] `pnpm test:fps:network` passes with receipt digest
      `sha256:d6d711644678a498d0ea5815e0ae835564f9a3717e76c915c35992841d40bcdd`.
- [x] `pnpm test:fps:gate` passes with `4,800` accepted inputs, `200` snapshots, `523`
      authoritative events, maximum tick `0.613 ms`, and receipt digest
      `sha256:5e6a6d5eb457e9565d9e51953a753382672ddcd93cfef613af93d8cf6854d482`.
- [x] `pnpm test:fps:load` passes with `288,000` accepted inputs, `96,000` snapshots,
      `56,591` authoritative events, `602,163,058` serialized snapshot bytes, maximum tick
      `0.732 ms`, and receipt digest
      `sha256:3a21f7fc2903871acac74b0408e9971fb309007a6f8192f76204981fa06c9445`.
- [ ] The two ten-minute eight-client browser-soak attempts held for about `602.1 s` with all
      eight clients connected, zero resync/snapshot/persistence/replay failures, and healthy
      browser frames, but each recorded one simulation overrun and exceeded the `20 ms` max-tick
      budget (`48.800625 ms`, then `26.638667 ms`). The latest receipt is
      `test-results/fps-browser-soak.json`, SHA-256
      `sha256:fc868e081348f569a8d0c80caec7ebf39022e5189eddb1397c83c435f51ac6b2`.

These results close the local FPS authority, input-boundary, abuse, deterministic transport, build,
and rendered browser-slice checks only. The full repository lint/test gates and planned-duration
soak remain open on this rebased state. Named Cloudflare Tunnel/public-edge acceptance, public-edge
packet-loss and clock-skew testing, production anti-cheat/privacy operations, and the external rollback
drill also remain open. The readiness heading must remain “not ready for competitive play”.

## 26. Current FPS hot-path optimization and soak closure — 2026-08-07

The fixed-step service was tightened before repeating the planned browser soak. The tick loop now
reads phase and server-tick scalars without allocating a public roster projection on every tick.
Checkpoint persistence checks event/tick thresholds before cloning a checkpoint, so a scheduled
no-op does not serialize the match or write SQLite. These changes preserve the authoritative event,
snapshot, and replay paths; they only remove work that was already known not to be due.

- [x] `pnpm format:check` passes after the hot-path change.
- [x] The focused FPS unit/protocol/service/network set passes: 32 tests in 8 files.
- [x] The full unit suite passes: 559 tests across 46 files.
- [x] `pnpm typecheck` passes.
- [x] `pnpm test:e2e` passes all four real browser scenarios (mahjong reconnect, two-client FPS
      avatars/reconnect, authoritative weapon/death lifecycle, and solo AI rival).
- [x] `pnpm test:fps:abuse` passes with canonical receipt digest
      `sha256:49361f2876cf47822e1b3a920ae5377ca1e30a2cdd83817179acbec8cc84d34d`.
- [x] `pnpm test:fps:network` passes with canonical receipt digest
      `sha256:d6d711644678a498d0ea5815e0ae835564f9a3717e76c915c35992841d40bcdd`.
- [x] `pnpm test:fps:gate` passes with 4,800 accepted inputs, 200 snapshots, 523 authoritative
      events, maximum tick `1.315 ms`, and receipt digest
      `sha256:5e6a6d5eb457e9565d9e51953a753382672ddcd93cfef613af93d8cf6854d482`.
- [x] `pnpm test:fps:load` passes with 288,000 accepted inputs, 96,000 snapshots, 56,591
      authoritative events, 602,163,058 serialized snapshot bytes, maximum tick `0.676 ms`, and
      receipt digest `sha256:3a21f7fc2903871acac74b0408e9971fb309007a6f8192f76204981fa06c9445`.
- [x] `pnpm test:fps:browser-soak` passes with eight real local browser clients for `602.116 s`
      against the planned 600 seconds. Diagnostics recorded 36,259 ticks, average/max tick times
      `0.0201/9.367 ms`, zero simulation overruns, 96,021 accepted inputs, 0 rejected inputs,
      96,008 snapshots, 545,235,329 snapshot bytes, 8 WebSocket upgrades, and zero resync,
      snapshot, persistence, or replay failures.
- [x] Browser samples recorded 121 frames per client, p95 frame times `17.7–17.8 ms`, maximum
      frame times `18.6–18.7 ms`, 96–98 draw calls, 22,286–22,310 triangles, and sampled heaps of
      `16.1–24.5 MB`. Receipt: `test-results/fps-browser-soak.json`; file SHA-256
      `sha256:2793c3e5ae811bf3ef4f3e9f24bb2c9afe82caec6bd4bcc820552a587af7468a`.

The exact post-repair build contains 29 files under `apps/*/dist` and `packages/*/dist`. The
sorted, newline-terminated SHA-256 manifest aggregate is
`sha256:db87ff98cf9c89d7f8c5b2b0e426400bb57ac09a7c7fb5d37d7d212061d8a038`. The rules, map, and
weapon identities remain `sha256:af61d3c8254e65a350872b956dfc7e80394bff7adebd2c530447077e83b81068`,
`sha256:cee4798d193d1ed82ec7b0e0d48f891de54b09dc7c1c82c68524d675cc5f96f1`, and
`sha256:aae225cf0c9fdac72848817488cbf60b7d8c62a0925fc88bf91f22efd841466b` respectively.

The local planned-duration browser/network budget and its previous max-tick blocker are now closed
for this exact dirty source. `pnpm test` passes all 559 tests across 46 files. `pnpm lint` still
reports 86 unrelated rebased visual-table/movement diagnostics; these reproduce against the current
base and were intentionally not rewritten in this FPS lane. Named Cloudflare Tunnel/public-edge
acceptance, public-edge packet-loss and clock-skew testing, production anti-cheat/privacy operations,
and the external rollback drill remain open. The readiness heading must remain “not ready for
competitive play”.

## 27. Current local avatar presentation and validation — 2026-08-07

This section supersedes the previous build identity and test totals for the intentionally dirty
`multiplayer-spec-g1aba1b1f8d` worktree at `12f358d3e67a72944af4701c0c2c52508d28f76d`. The separate
`visual-table` worktree and its user-owned port 4173 process were not touched. No public server,
named Cloudflare Tunnel, or deployment was started.

### Avatar presentation slice

- [x] The fallback avatar is a deterministic seven-mesh mannequin with named head, chest, weapon,
      muzzle, hand, and feet sockets. Missing authored models remain explicit through the
      `missing_avatar_asset_fallback` diagnostic.
- [x] The local presentation keeps a world-space avatar in the scene and mounts a separate
      camera-relative first-person hands/viewmodel. The world avatar remains available for shadows,
      reflections, and third-person/spectator views.
- [x] First-person policy moves only upper-body/weapon occluders to the dedicated body layer while
      keeping the root and lower body visible. Third-person policy restores every body mesh to the
      world layer. The canvas publishes body policy, layer masks, mesh counts, visibility, and the
      authoritative snapshot tick for inspection.
- [x] The world-space `avatar-weapon` follows the authoritative equipped weapon, fire action,
      emissive state, death pose, crouch scale, lifecycle visibility, and snapshot tick. Remote
      avatars use the same fallback body with interpolated public snapshots and redacted diagnostics.

### Current validation

- [x] `pnpm exec vitest run apps/web/src/fps/avatar.test.ts`: 4 tests passed. The full `pnpm test`
      suite passes 561 tests across 46 files.
- [x] `pnpm typecheck` and `pnpm format:check` pass. Focused lint for the avatar module passes.
- [ ] Full `pnpm lint` remains non-green with 86 pre-existing visual-table/movement diagnostics in
      the rebased lane; no new avatar diagnostic remains. Those unrelated errors were not rewritten.
- [x] `pnpm test:e2e` passes all four real browser scenarios: mahjong reconnect, two-client FPS
      avatar/reconnect, authoritative switch/reload/hit/kill/death/respawn, and solo AI rival.
      The current FPS sample recorded 77 frames (average `26.24 ms`, p95 `34.6 ms`, max `35.1 ms`),
      30 draw calls, and 4,806 triangles.
- [x] Rendered evidence is present in `test-results/fps-slayer-first-person.png`,
      `fps-slayer-third-person.png`, `fps-slayer-reload.png`, `fps-slayer-death.png`,
      `fps-slayer-respawn.png`, and `fps-slayer-solo-ai.png`.
- [x] The rebuilt artifact set contains 29 files under `apps/*/dist` and `packages/*/dist`. Its
      sorted, newline-terminated repository-relative `sha256sum` manifest aggregate is
      `sha256:1e1096a4ed418c0ad7c94b0292f580aa9934ebcae6f9344f91d7bc1170eb2340`.

The earlier authority, load, abuse, deterministic-network, and soak receipts remain recorded in
§26; this presentation-only change does not alter their server contracts. Named Cloudflare
Tunnel/public-edge acceptance, public-edge packet-loss and clock-skew testing, production
anti-cheat/privacy operations, and the external rollback drill remain open. The FPS prototype is
still **not ready for competitive play**.

## 28. Current map diagnostic and final local validation — 2026-08-07

The local FPS slice now exposes a deterministic, public-state-only map diagnostic. It reports the
versioned map and collision identity, obstacle IDs, player capsules and overlap checks, spawn-facing
collision rays, and spawn-to-player visibility tests. It never includes private vitals, ammunition,
seeds, tickets, or session data. The browser publishes the diagnostic through canvas attributes so
the rendered acceptance path can inspect the same map facts used by the engine tests.

- [x] `buildFpsMapDiagnostic` has focused regression coverage for collision/capsule/spawn-ray/
      visibility output, overlapping capsules, disconnected targets, and private-state redaction.
      The focused map/avatar set passes 6 tests.
- [x] The complete `pnpm test` suite passes 563 tests across 47 files.
- [x] `pnpm typecheck` and `pnpm format:check` pass. Focused FPS/map lint passes; full `pnpm lint`
      still reports the same 86 unrelated visual-table/movement diagnostics in the rebased lane.
- [x] `pnpm test:e2e` passes all four real browser scenarios. The current FPS sample recorded
      76 frames, 30 draw calls, and 4,806 triangles. The two-client map assertions observe three
      obstacles, two player capsules, eight spawn rays, and 16 spawn-to-player visibility tests.
- [x] The rebuilt artifact set contains 29 files under `apps/*/dist` and `packages/*/dist`. Its
      sorted, newline-terminated repository-relative `sha256sum` manifest aggregate is
      `sha256:8ab4ed57fa3f04021f71a1f17ee43affb565f32934d716a3bd8cf26fd75aa6ea`.

This is local map and rendered-prototype evidence only. The earlier authority, load, abuse,
deterministic-network, and soak receipts remain recorded in §26. Named Cloudflare Tunnel/
public-edge acceptance, public-edge packet-loss and clock-skew testing, production anti-cheat/
privacy operations, and the external rollback drill remain open. The FPS prototype is still
**not ready for competitive play**.

## 29. Current competitive HUD and viewmodel lifecycle — 2026-08-07

The browser presentation now consumes public match timing and score-target fields from each
authoritative snapshot instead of keeping a hidden duration constant in React. The HUD exposes the
remaining match timer, score target, reticle state, RTT, and prediction/resync state. The reticle is
rendered over the real Three.js canvas and changes state for fire, reload, down, ready, and preview.

The camera-relative first-person viewmodel now applies the authoritative local avatar snapshot. It
updates weapon identity and scale, reload pose, fire emissive state, crouch offset, death pose, and
disconnect/spectator visibility. Canvas diagnostics publish viewmodel action, weapon, and visibility;
the world avatar remains a separate entity for third-person and remote rendering.

- [x] Public FPS snapshots include `durationTicks` and `scoreTarget`; the strict protocol boundary
      validates both fields.
- [x] Focused map/avatar coverage now passes 7 tests, including the viewmodel lifecycle regression.
- [x] The complete `pnpm test` suite passes 564 tests across 47 files. `pnpm typecheck` and focused
      FPS lint pass.
- [x] The FPS Playwright spec passes all three scenarios, including timer/reticle diagnostics,
      authoritative rifle viewmodel state, and first-/third-person visibility. The rendered sample
      recorded 76 frames, 30 draw calls, and 4,806 triangles; the first-person screenshot was
      inspected from `test-results/fps-slayer-first-person.png`.
- [x] The rebuilt artifact set contains 29 files. Its sorted, newline-terminated repository-relative
      `sha256sum` manifest aggregate is
      `sha256:ff890c87711017f7bc89abebae8ce0e62ad3ecb05650c3489fe099c588f52ce3`.

This closes a local HUD/viewmodel presentation gap only. Named Cloudflare Tunnel/public-edge
acceptance, public-edge packet-loss and clock-skew testing, production anti-cheat/privacy operations,
and the external rollback drill remain open. The FPS prototype is still **not ready for competitive
play**.

## 30. Current spawn safety and final local validation — 2026-08-07

The authoritative spawn path now applies the authored arena collision geometry to both initial
spawns and respawns. It requires at least six metres from every alive enemy, and respawns prefer
points whose eye-level line of sight is occluded by an arena obstacle. Spawn ordering remains
seeded by the match seed and a monotonic spawn ordinal, never by room-local player IDs. If every
point is occupied or visible, the first collision-valid point remains a deterministic fallback and
the existing visible spawn-protection window prevents a live match from failing solely because the
arena is saturated.

- [x] `isFpsLineOfSightClear` has obstacle-height regression coverage, and the arena/match/terminal
      set passes 15 tests, including invalid geometry, deterministic ordering, minimum distance,
      respawn safety, and terminal winner tie-breaking.
- [x] The complete `pnpm test` suite passes 567 tests across 47 files on the corrected source.
- [x] `pnpm test:e2e` passes all four real browser scenarios: mahjong reconnect, two-client FPS
      state/reconnect, authoritative weapon/death lifecycle, and solo AI rival. The latest FPS
      sample recorded 77 frames, 30 draw calls, and 4,806 triangles.
- [x] `pnpm typecheck`, `pnpm format:check`, `git diff --check`, staged diff checking, and focused
      FPS ESLint pass. The repository-wide lint command still exits 1 with exactly 86 unrelated
      visual-table/movement diagnostics; no FPS-owned diagnostic remains.
- [x] `pnpm build` succeeds. The final artifact set contains 29 files under `apps/*/dist` and
      `packages/*/dist`; its sorted, newline-terminated manifest aggregate is
      `sha256:4f46bb22076630263d20fa6f52248f92861585eb222b840705b26ec141ea5da6`.

This is local deterministic spawn and rendered-prototype evidence only. No public server, named
Cloudflare Tunnel, deployment, public-edge packet-loss/clock-skew test, production anti-cheat or
privacy operation, or external rollback drill was run. The readiness heading remains **not ready
for competitive play**.

## 31. Current snapshot baseline and identity recovery gate — 2026-08-07

The client-side snapshot tracker now refuses a delta until a full baseline has been accepted and
binds every later frame to the established match, room, rules, map, weapon-set, and RNG identity.
An identity change returns `identity_mismatch` and requests a full resync instead of applying state
from another match or build. This keeps reconnect and packet recovery fail-closed at the renderer
boundary while preserving ordered same-tick deltas and duplicate idempotency.

- [x] The focused network/authority/arena set passes 17 tests, including missing-baseline and
      cross-identity rejection.
- [x] The complete `pnpm test` suite passes 567 tests across 47 files.
- [x] `pnpm test:e2e` passes all four real browser scenarios. The latest FPS sample recorded
      74 frames, 30 draw calls, and 4,806 triangles.
- [x] `pnpm typecheck`, `pnpm format:check`, staged/unstaged diff checks, and focused FPS ESLint
      pass. Full lint exits 1 with exactly 86 unrelated visual-table/movement diagnostics.
- [x] The final 29-artifact build manifest aggregate is
      `sha256:4f46bb22076630263d20fa6f52248f92861585eb222b840705b26ec141ea5da6`.

This closes a local snapshot-integrity gap only. Named Cloudflare Tunnel/public-edge acceptance,
public-edge packet-loss and clock-skew testing, production anti-cheat/privacy operations, and the
external rollback drill remain open; the FPS prototype is still **not ready for competitive play**.

## 32. Current terminal result browser acceptance — 2026-08-07

The browser room controls now expose a validated score-target input (default `25`, range `1–100`)
and send that value through the existing room-create contract. Once the authoritative snapshot
contains `match_ended`, the arena renders a terminal result panel with the reason and winner names
resolved from the public scoreboard. Inputs stop after the match ends, so a late server rejection
cannot replace the terminal HUD state.

- [x] The rendered two-client Playwright scenario creates a score-target-`1` match, reaches one
      authoritative kill, and asserts `phase=ended`, `reason=score_target`, the winner ID, both
      browser panels, and the `fps-slayer-terminal.png` screenshot.
- [x] `pnpm test` passes 567 tests across 47 files. `pnpm test:e2e` passes all five real browser
      scenarios (mahjong reconnect plus four FPS flows); the latest FPS sample recorded 75 frames,
      30 draw calls, and 4,806 triangles.
- [x] `pnpm typecheck`, `pnpm format:check`, staged/unstaged diff checks, and focused FPS ESLint
      pass. Full lint exits 1 with exactly 86 unrelated visual-table/movement diagnostics.
- [x] `pnpm build` passes with 29 output files. The sorted, newline-terminated artifact manifest
      aggregate is `sha256:17276d7d5d27110c65bb252289b0cfaa637824bac652659fd1be8d4fa2f58ef6`.

This is local rendered terminal-result evidence only. Named Cloudflare Tunnel/public-edge
acceptance, public-edge packet-loss and clock-skew testing, production anti-cheat/privacy
operations, and the external rollback drill remain open; the FPS prototype is still **not ready
for competitive play**.

## 33. Current checkpoint-integrity and rollback drill — 2026-08-07

The authoritative checkpoint restore path now verifies persisted event-chain hashes, the event
counter, monotonic event ticks, and non-negative restore counters before loading a match. A
tampered checkpoint is rejected with `fps_checkpoint_event_chain_mismatch`; it is not served as a
live match or replay. This is a local fail-closed integrity check, not a replacement for an
operational backup or release rollback procedure.

- [x] `pnpm exec vitest run packages/fps/src/match.test.ts apps/server/src/fps-match.test.ts`
      passes 24 tests, including the tampered-checkpoint regression.
- [x] `pnpm test:fps:rollback` passes on the dirty source above
      `12f358d3e67a72944af4701c0c2c52508d28f76d`. The temporary SQLite journal was reopened
      through a fresh service handle, the public replay chain and persisted snapshot state matched,
      a post-restore input was accepted, and the temporary directory was removed. Receipt:
      `test-results/fps-rollback.json`; digest
      `sha256:2b8559b29e959dd69536534165fa4720aceddd3849d0247eb02a91ae4fab4b3`.
- [x] The rollback receipt contains no seed or ticket and records `sourceResetUsed=false` and
      `publicEdgeUsed=false`.

This closes a local checkpoint-integrity and replay-continuity gap only. The named Cloudflare
Tunnel/public-edge flow, public-edge packet-loss and clock-skew testing, production anti-cheat /
privacy operations, and an external rollback drill with a retained release artifact remain open.
The FPS prototype remains **not ready for competitive play**.

## 44. Current authority-level rules validation — 2026-08-07

`FpsMatch` now validates versioned rule overrides at construction time. This closes the path where a
restored or server-internal match could bypass the HTTP room schema. Score targets must be safe
integers from 1 through 100, durations must be positive safe integers, and snapshot rates must be
positive divisors of the fixed 60 Hz simulation.

- [x] Regression coverage rejects invalid score target, duration, and snapshot-rate overrides.
- [x] Centralized test-bus run `1786122728149-20120-1d38962b` passes 586 tests across 50 files.
- [x] `pnpm typecheck`, `pnpm format:check`, focused FPS ESLint, diff checks, and `pnpm build` pass.
- [x] The rebuilt 29-file artifact manifest aggregate is
      `sha256:3452938f102b217702684fa69e0c06d8e49bc3f9cef79b25154a6d49494ab9a6`.
- [ ] Browser re-acceptance for the new diagnostics/accessibility assertions remains unauthorized.

This strengthens local authority validation only. Named Cloudflare Tunnel/public-edge acceptance,
public-edge packet-loss and clock-skew testing, production anti-cheat/privacy operations, deployment
evidence, and external retained-artifact rollback remain open. The FPS prototype remains **not ready
for competitive play**.

## 43. Current diagnostics contract and browser-gate preparation — 2026-08-07

The redacted FPS diagnostics response is now a strict protocol contract. The server parses the
diagnostics payload before returning it, so the route cannot accidentally add tickets, seeds, input
receipts, private ammunition, or unvalidated metric fields. Clock-skewed client timestamps are
represented by a finite (possibly negative) transit-age value; jitter and all counters remain
bounded non-negative values.

- [x] `fpsDiagnosticsSchema` validates match identity, public roster, hashes, and all privacy-safe
      operational counters. A protocol regression rejects an added ticket and a non-finite transit
      value.
- [x] The current centralized bus snapshot passes 585 tests across 50 files on the exact dirty
      source after this contract and browser-test preparation.
- [x] Strict typecheck, formatting, and focused FPS ESLint pass. The rebuilt 29-file artifact
      manifest contains 29 files with aggregate
      `sha256:65760e9a97af6f8d4c71bd9d216bc487419b287d4586d2ca3b4c40da02620868`.
- [x] The local Playwright spec now contains assertions for RTT/jitter/loss/correction attributes
      and reduced-motion, high-contrast, color-safe, scale, and caption controls.
- [ ] The new browser assertions have not been executed in this continuation because this worktree
      does not authorize opening another browser.

This closes a local diagnostics-contract gap and prepares, but does not complete, rendered
re-acceptance. Full repository lint, named Cloudflare Tunnel/public-edge flow and fault testing,
production anti-cheat/privacy review, deployment evidence, and external retained-artifact rollback
remain open. The FPS prototype remains **not ready for competitive play**.

## 42. Current local observability diagnostics — 2026-08-07

The FPS service now records privacy-safe server-boundary transport observations alongside the existing
operational counters. `inputTransitMs` is the mean age of valid client timestamps when they reach the
server, `inputTransitJitterMs` is the mean absolute change in that age, and `inputSequenceGaps`
counts gaps in a player's monotonic input sequence on a WebSocket connection. The names deliberately
do not claim RTT or authoritative packet-loss truth.

The browser has a render-only `FpsTransportTelemetry` collector. It measures ping RTT and mean
absolute RTT jitter, counts observed gaps in server envelope sequence numbers, records resync
requests, and summarizes prediction-correction distance. The HUD and `data-fps-*` arena attributes
expose these values for local acceptance. They never enter authoritative movement, combat, score,
persistence, or replay state. Reduced motion is passed to `RemotePlayerRenderer.update`, so the
actual scene path now disables remote interpolation as intended.

- [x] Focused service, telemetry, accessibility, and remote-renderer coverage passes 21 tests.
- [x] `pnpm test` passes 584 tests across 50 files.
- [x] `pnpm typecheck`, `pnpm format:check`, focused FPS ESLint, and `pnpm build` pass.
- [x] The rebuilt output contains 29 files; the sorted, newline-terminated relative-path manifest
      aggregate is `sha256:935564fd2ccf3473737163c207334180c4d431ea676749b9f17b5ad8350bbdd4`.
- [ ] Full repository lint still reports exactly 86 unrelated visual-table/movement diagnostics.
- [ ] Browser re-acceptance was not rerun in this continuation because opening another browser is not
      authorized for this worktree.

This closes local observability and reduced-motion wiring evidence only. Named Cloudflare
Tunnel/public-edge acceptance, public-edge packet-loss and clock-skew testing, production anti-cheat/
privacy operations and review, deployment evidence, and external retained-artifact rollback remain
open. The FPS prototype remains **not ready for competitive play**.

## 41. Current FPS accessibility controls — 2026-08-07

The local FPS UI now has a validated accessibility surface. Device-local preferences support
reduced motion, high-contrast HUD, color-safe reticle cues, interface scale, event captions, and
movement-key remapping between W/A/S/D and arrow keys. Malformed storage falls back to safe
defaults. Reduced motion disables remote-avatar interpolation and camera smoothing through the
presentation layer only; authoritative movement, inputs, and server snapshots are unchanged.

- [x] Focused accessibility and reduced-motion renderer coverage passes 4 tests.
- [x] The final isolated bus run `1786119700610-6414-3f22579b` passes 581 tests across 47 files.
- [x] Strict typecheck, formatting, focused FPS ESLint, and `pnpm build` pass. The fresh 29-file
      artifact manifest aggregate is
      `sha256:64fb78ced69fdbe1c13e5a8a02b26a1dc242cd73ef09f154b452889aa7be6da7`.
- [ ] Rendered browser acceptance for these new controls was not rerun because this worktree
      prohibits opening another browser without explicit authorization.

This closes a local accessibility requirement only. Named Cloudflare Tunnel/public-edge acceptance,
public-edge packet-loss and clock-skew testing, production anti-cheat/privacy operations, deployment
evidence, and external retained-artifact rollback remain open. The FPS prototype remains **not ready
for competitive play**.

## 40. Current kicked-player abuse handling — 2026-08-07

The FPS abuse boundary now has an explicit owner-authorized kick path. `FpsMatch.kickPlayer`
transitions the target to a permanent spectator state, clears active input and respawn state, and
appends a public `player_kicked` event. `FpsMatchService.kickPlayer` requires the room-owner ticket,
revokes the target session in SQLite, closes the target socket with close code `4003`, publishes the
redacted snapshot, and exposes a privacy-safe `kickedPlayers` metric. Repeated kicks are idempotent;
the owner cannot kick themself. The HTTP route is
`POST /api/fps/matches/:matchId/kick` with Bearer authentication, and the browser event summary
renders the public kick event.

- [x] Focused FPS, service, HTTP, and protocol coverage passes; the refreshed isolated bus run
      `1786118733569-2107-71fe5d27` passes 577 tests across 47 files on the current dirty source.
- [x] `pnpm test:fps:abuse` now covers owner-only kick authorization, spectator transition, ticket
      revocation, and the privacy-safe metric. Receipt digest:
      `sha256:b729f425e76533951c6493aa9b71f1740bee65642b2e811d0d12571b4222c607`.
- [x] Typecheck, formatting, focused FPS ESLint, and package builds pass. The full repository lint
      boundary remains the known 86 unrelated visual-table/movement diagnostics.
- [x] The fresh `pnpm build` emits 29 output files. Its sorted, newline-terminated
      repository-relative `sha256sum` manifest aggregate is
      `sha256:bd9050a3cbffdc8c3b95ed128eafa063cc2bcc112985eba868e14c2444af7f92`.
- [ ] This closes only the local kick/abuse handling gap. Named Cloudflare Tunnel/public-edge
      acceptance, public-edge fault testing, production anti-cheat/privacy operations and review,
      deployment evidence, and external retained-artifact rollback remain open.

The FPS prototype remains **not ready for competitive play**.

## 34. Current post-integrity local validation — 2026-08-07

The checkpoint-integrity change is validated on the exact dirty source above
`12f358d3e67a72944af4701c0c2c52508d28f76d`:

- [x] `pnpm test` passes 568 tests across 47 files.
- [x] `pnpm test:e2e` passes all five real browser scenarios (mahjong reconnect and four FPS
      flows). The latest FPS rendered sample recorded 77 frames, 30 draw calls, and 4,806 triangles.
- [x] `pnpm typecheck`, `pnpm format:check`, whitespace checks, and focused FPS ESLint pass.
- [x] `pnpm build` passes and emits 29 artifacts. The sorted, newline-terminated artifact manifest
      aggregate is `sha256:7f2147a8d4d48c724b297f3f88d62e0cafbaa27d0f3b80c8a3d9fe0220bdc24f`.
- [x] `pnpm test:fps:rollback` remains green with deterministic receipt digest
      `sha256:2b8559b29e959dd69536534165fa4720aceddd3849d0247eb02a91ae4fab4b3a`.
- [ ] Full repository lint remains non-green with exactly 86 unrelated visual-table/movement
      diagnostics.

These are local source/build/replay and rendered receipts only. Named Cloudflare Tunnel/public-edge
acceptance, public-edge packet-loss and clock-skew testing, production anti-cheat/privacy operations,
and an external rollback drill with a retained release artifact remain open. The FPS prototype is
still **not ready for competitive play**.

## 35. Current HTTP input rate-limit parity — 2026-08-07

The HTTP input route now uses the same `maxInputsPerSecond` policy as the WebSocket path. Its bucket
is scoped to the request IP, match, and player identity, so HTTP polling cannot bypass the socket
abuse boundary. This remains an input-boundary control, not a complete production anti-cheat system.

- [x] The real Fastify HTTP regression passes 13 tests, including two accepted inputs followed by a
      `429` response at the configured limit.
- [x] `pnpm test:fps:abuse` passes. The receipt includes HTTP statuses `[200, 200, 429]`, malformed,
      oversized, binary, cross-player, stale-clock, future-acknowledgement, and replacement-socket
      checks. Receipt digest:
      `sha256:3111a7991cbeee28c53189696db57df6c2770e3639c5c15a0c091117ca06c500`.

This closes the local HTTP/WebSocket rate-limit parity gap only. Named-edge/public-edge acceptance,
production anti-cheat/privacy operations and review, packet-loss and clock-skew testing through the
public edge, and an external retained-artifact rollback remain open. The FPS prototype remains
**not ready for competitive play**.

## 36. Current post-rate-limit validation — 2026-08-07

The HTTP rate-limit parity change is validated on the exact dirty source above
`12f358d3e67a72944af4701c0c2c52508d28f76d`:

- [x] `pnpm test` passes 569 tests across 47 files.
- [x] `pnpm test:e2e` passes all five real browser scenarios. The latest FPS sample recorded 75
      frames, 30 draw calls, and 4,806 triangles.
- [x] `pnpm typecheck`, `pnpm format:check`, whitespace checks, and focused FPS ESLint pass.
- [x] `pnpm build` passes with 29 artifacts. The sorted manifest aggregate is
      `sha256:7f2147a8d4d48c724b297f3f88d62e0cafbaa27d0f3b80c8a3d9fe0220bdc24f`.
- [x] The local abuse receipt and temporary rollback/replay receipt remain green with digests
      `sha256:3111a7991cbeee28c53189696db57df6c2770e3639c5c15a0c091117ca06c500` and
      `sha256:2b8559b29e959dd69536534165fa4720aceddd3849d0247eb02a91ae4fab4b3a`.
- [ ] Full repository lint still has exactly 86 unrelated visual-table/movement diagnostics.

Public-edge and production gates remain open: named Cloudflare Tunnel acceptance, public-edge
packet-loss and clock-skew testing, privacy-safe anti-cheat operations/review, and a retained-artifact
external rollback drill. The FPS prototype remains **not ready for competitive play**.

## 37. Current final post-rate-limit validation refresh — 2026-08-07

The exact dirty source above `12f358d3e67a72944af4701c0c2c52508d28f76d` was rebuilt and revalidated
after the HTTP input rate-limit change. The current production build contains 29 output files; its
sorted, newline-terminated relative-path manifest aggregate is
`sha256:587b4b62208127f9e4ee9de275c9c7ecd3f2ece06783e988098a3041050791a2`.

- [x] `pnpm test` passes 569 tests across 47 files.
- [x] `pnpm test:e2e` passes all five real browser scenarios. The latest FPS sample recorded 77
      frames, 30 draw calls, and 4,806 triangles.
- [x] `pnpm typecheck`, `pnpm format:check`, and focused FPS ESLint pass.
- [x] `pnpm test:fps:abuse` passes with HTTP input statuses `[200, 200, 429]` and receipt digest
      `sha256:3111a7991cbeee28c53189696db57df6c2770e3639c5c15a0c091117ca06c500`.
- [x] `pnpm test:fps:rollback` passes with receipt digest
      `sha256:2b8559b29e959dd69536534165fa4720aceddd3849d0247eb02a91ae4fab4b3a`.
- [ ] Full repository lint remains non-green with exactly 86 unrelated visual-table/movement
      diagnostics.

This is local source, build, abuse, replay, and rendered evidence only. Named Cloudflare
Tunnel/public-edge acceptance, public-edge packet-loss and clock-skew testing, production
anti-cheat/privacy operations, and an external retained-artifact rollback remain open. The FPS
prototype remains **not ready for competitive play**.

## 38. Current lifecycle, replay, and deterministic acceptance refresh — 2026-08-07

The authoritative lifecycle now fails closed around disconnects and reconnects. A disconnected or
spectator player cannot be spawned during countdown, submit input, or be revived implicitly. A
countdown with fewer than two eligible players is cancelled explicitly. Reconnects are authenticated
before a per-player storm limit is applied, and shutdown flushes checkpoints before closing the
SQLite journal. FPS HTTP routes require an allowed origin and Bearer authentication; query-string
tickets are rejected.

Replay verification now carries a public roster and derives the terminal scoreboard and deterministic
winner from the chained public events. A tampered terminal scoreboard is rejected. The deterministic
rollback gate advances ticks without wall-clock polling and still restores a temporary checkpoint,
verifies the public replay, and accepts input after restore.

- [x] The focused authority/protocol/service/network set passes 42 tests across 8 files, including
      disconnected-countdown cancellation, explicit reconnect, reconnect-storm limiting, origin and
      Bearer enforcement, shutdown persistence, tampered scoreboard rejection, and replay winner
      derivation.
- [x] `pnpm test` passes 574 tests across 47 files.
- [x] `pnpm test:e2e` passes all five real browser scenarios. The latest rendered diagnostics report
      30 draw calls and 4,806 triangles (the two-second FPS sample recorded 71 frames, p95 34.6 ms,
      and maximum 50 ms).
- [x] `pnpm typecheck`, `pnpm format:check`, `git diff --check`, staged diff checking, and focused
      FPS ESLint pass. Full repository ESLint remains non-green with exactly 86 unrelated
      visual-table/movement diagnostics; no FPS-owned diagnostic remains.
- [x] `pnpm test:fps:abuse` passes with HTTP input statuses `[200, 200, 429]` and receipt digest
      `sha256:3111a7991cbeee28c53189696db57df6c2770e3639c5c15a0c091117ca06c500`.
- [x] `pnpm test:fps:network` passes with one dropped frame, delayed/reordered recovery,
      duplicate idempotency, and clock-boundary checks; receipt digest
      `sha256:d6d711644678a498d0ea5815e0ae835564f9a3717e76c915c35992841d40bcdd`.
- [x] `pnpm test:fps:rollback` passes with replay verification, checkpoint restoration, and a
      continued input; receipt digest
      `sha256:3e209c08e2cc0851a694808b548f320a11060c91ca9bce2e38c2946b23814b7e`.
- [x] `pnpm test:fps:gate` passes with 4,800 accepted inputs, 200 snapshots, and 523 events;
      maximum tick 1.841 ms; receipt digest
      `sha256:5e6a6d5eb457e9565d9e51953a753382672ddcd93cfef613af93d8cf6854d482`.
- [x] `pnpm test:fps:load` passes with 288,000 inputs, 96,000 snapshots, 56,591 events, and
      605,907,058 serialized snapshot bytes; maximum tick 4.55 ms; receipt digest
      `sha256:cf8634b84192bec6889f4c14716f99c48c742cb07796ea30cc68687673681653`.
- [x] The rebuilt output contains 29 files. Its sorted, newline-terminated relative-path
      `sha256sum` manifest aggregate is
      `sha256:2109966de0997a1d495c392ca52de56e03622951a1fd14b31c309c44b022e447`.

These are local source, build, abuse, replay, load, and rendered-prototype receipts only. Named
Cloudflare Tunnel/public-edge acceptance, public-edge packet-loss and clock-skew testing, production
anti-cheat/privacy operations and review, deployment evidence, and an external retained-artifact
rollback remain open. The FPS prototype remains **not ready for competitive play**.

## 39. Current retained-artifact rollback verifier — 2026-08-07

The rollback evidence now includes an independent retained-artifact rehearsal. The new
`scripts/fps-retained-rollback-drill.ts` persists a match to a temporary SQLite source, copies the
database (and any SQLite sidecars) into a separate retained-artifact directory, writes a manifest
with file sizes and SHA-256 digests, and verifies every digest before restore. It deliberately flips
one database byte and confirms the verifier rejects the artifact, then restores the original bytes.
`FpsMatchJournal` and a fresh `FpsMatchService` reopen the retained copy, verify the authoritative
public replay and snapshot identity, and accept a continued input. The receipt contains no seed or
ticket and records `sourceResetUsed=false` and `publicEdgeUsed=false`.

- [x] `pnpm test:fps:retained-rollback` passes with replay verification, retained-file hash checks,
      tamper rejection, checkpoint restore, and continued input. Receipt digest:
      `sha256:70903cf237d7d7edd8d174b982cb5592cd00cf9a3d36222e96b4fc3691f7e811`.
- [x] The isolated test bus was restarted after the source edit and passes 574 tests across 47
      files (run `1786117592983-95318-312b0bb3`). Strict typecheck, formatting, and focused lint for
      the new drill pass.
- [ ] This is still a local temporary artifact rehearsal. It does not prove external immutable
      retention, release provenance, operator access control, or a production rollback. Named
      Cloudflare Tunnel/public-edge acceptance, public-edge packet-loss and clock-skew testing,
      production anti-cheat/privacy operations and review, deployment evidence, and an external
      retained-artifact rollback remain open.

The FPS prototype remains **not ready for competitive play**.

## 40. FPS WebSocket ticket transport — 2026-08-07

The browser no longer places an FPS room ticket in the WebSocket URL. It sends `playerId` as the
only FPS URL query value and offers the ticket as the second `Sec-WebSocket-Protocol` token beside
the stable `fps.v1` protocol. The Fastify adapter extracts exactly one non-`fps.v1` token, rejects
any `ticket` query value, and selects only `fps.v1` for the `101` response, so the raw credential is
not echoed as the negotiated protocol. The existing mahjong room WebSocket route is unchanged.

- [x] The browser FPS client uses `new WebSocket(url, ["fps.v1", ticket])`.
- [x] The FPS route rejects missing or malformed subprotocol credentials and all query-string tickets.
- [x] A real ephemeral Fastify TCP WebSocket regression verifies the negotiated `fps.v1` protocol,
      authenticated upgrade, ticket extraction, query-ticket rejection, and no service upgrade for
      the rejected request.
- [x] The Playwright two-client flow now asserts that the observed FPS WebSocket URL contains only
      `playerId` and never the ticket; this assertion is prepared for rendered acceptance.
- [x] The centralized test bus run `1786124498081-17627-cb90e422` passes 587 tests across 50 files;
      strict typecheck and formatting pass.
- [x] `pnpm build` passes with 29 output files. The sorted, newline-terminated artifact manifest
      aggregate is `sha256:9bbf0f92c1241102e0df46b531ced28213012b768eaf8287981f45c8d1efe093`.

This removes the local FPS URL-query credential exposure. Subprotocol headers still carry a secret;
the named edge and any reverse-proxy logging policy must redact `Sec-WebSocket-Protocol` values
before public-edge acceptance can close the privacy gate. Browser execution of the new assertion
remains unauthorized in this worktree. The FPS prototype remains **not ready for competitive play**.

## 41. Current lifecycle idempotency repair — 2026-08-07

The authoritative `cancelMatch()` transition is now idempotent. Repeated scheduler or persistence
failure handling cannot append duplicate `match_phase_changed` or `match_ended` cancellation events,
so the terminal replay chain remains deterministic.

- [x] A focused regression proves repeated cancellation preserves the event stream and emits one
      terminal event.
- [x] The centralized test bus passes on the modified authority and protocol surface.
- [ ] Browser re-acceptance remains unauthorized in this worktree.

This closes a local lifecycle-integrity gap only. Named Cloudflare Tunnel/public-edge acceptance,
production anti-cheat/privacy operations, deployment evidence, and external retained-artifact
rollback remain open. The FPS prototype remains **not ready for competitive play**.

## 42. Current authoritative input audit receipts — 2026-08-07

Durable FPS input receipts now retain the server-side controller provenance and, for accepted
commands, the last fixed-step application tick, position, and velocity. Rejected or never-applied
commands retain explicit null application fields. These fields stay inside checkpoints and replay
audit data; public snapshots and diagnostics remain redacted.

- [x] A regression proves human controller provenance and the transition from an unapplied receipt
      to an authoritative movement result.
- [x] The FPS package build and centralized test bus pass on the new receipt contract.
- [ ] Browser re-acceptance and public-edge evidence remain separate gates.

This closes the local input-auditability gap in §6.3 only. Named Cloudflare Tunnel/public-edge
acceptance, production anti-cheat/privacy operations, deployment evidence, and external rollback
remain open. The FPS prototype remains **not ready for competitive play**.

## 45. Current stale-input lifecycle boundary — 2026-08-07

The authoritative match now clears pending input and edge state when a player disconnects, dies,
is moved to spectator, or respawns. A held command from a previous life or connection therefore
cannot move or fire the player before a fresh authenticated input arrives. Existing input receipts
remain available as private audit data, but no pending command is carried into the new lifecycle.

- [x] A deterministic regression proves a victim's held fire input produces no shot after death and
      respawn.
- [x] The centralized test bus run `1786126248058-25991-fb42ab87` passes 590 tests across 50 files.
- [x] Targeted Prettier and `git diff --check` pass.
- [x] `pnpm typecheck` and the full `pnpm build` pass, including the FPS package declaration build.
- [ ] Repository-wide `pnpm format:check` still reports 19 unrelated procedural-world files, and
      `pnpm lint` reports 88 unrelated visual-table/movement/procedural-world diagnostics.
- [ ] Browser re-acceptance remains unauthorized in this worktree.

This closes the stale-input lifecycle gap in §7.1 only. Named Cloudflare Tunnel/public-edge
acceptance, public-edge fault testing, production anti-cheat/privacy operations, deployment
evidence, and external retained-artifact rollback remain open. The FPS prototype remains **not
ready for competitive play**.

## 46. Current checkpoint rules and identity validation — 2026-08-07

Checkpoint restore now compares the complete canonical versioned rules object reconstructed from
the stored arena and bounded rule overrides. A persisted change to `rulesHash`, `mapHash`,
`weaponSetHash`, or any other rules identity field is rejected before the match is admitted to the
service. The event-chain verification remains an additional independent check.

- [x] Parameterized regression coverage rejects tampered rules, map, and weapon-set identities.
- [x] The centralized test bus run `1786126608702-29029-a7cae5b3` passes 593 tests across 50 files.
- [x] FPS package build, full `pnpm build`, `pnpm typecheck`, focused FPS ESLint, Prettier, and
      `git diff --check` pass.
- [ ] Browser re-acceptance, named Cloudflare Tunnel/public-edge testing, production anti-cheat/
      privacy operations, deployment evidence, and external retained-artifact rollback remain open.

This closes a local checkpoint identity-integrity gap in §§6.1 and 11 only. The FPS prototype
remains **not ready for competitive play**.

## 47. Current authoritative input contract revalidation — 2026-08-07

The FPS match authority now revalidates the protocol version, exact button-object shape, selected
weapon ID, and action-nonce type inside `submitInput()`. HTTP and WebSocket schemas remain the first
boundary, but malformed direct or internal calls now fail with `invalid_input` before they can alter
movement, fire cadence, or weapon state.

- [x] Regression coverage rejects an unsupported protocol version, unknown weapon, and malformed
      button payload at the authority boundary.
- [x] The centralized test bus run `1786127017184-33177-8957a103` passes 594 tests across 50 files.
- [x] FPS package build, `pnpm typecheck`, focused FPS ESLint, Prettier, and `git diff --check` pass.
- [ ] Browser re-acceptance, named Cloudflare Tunnel/public-edge testing, production anti-cheat/
      privacy operations, deployment evidence, and external retained-artifact rollback remain open.

This closes a local input-contract gap in §7.1 only. The FPS prototype remains **not ready for
competitive play**.

## 48. Current checkpoint state-integrity digest — 2026-08-07

Every exported FPS checkpoint now carries a canonical `checkpointHash` over all persisted
checkpoint fields except the digest itself. Restore verifies the event chain first, then compares
the digest before admitting player state, input receipts, or lifecycle fields. A changed score,
position, ammo value, or other checkpoint field therefore fails closed with
`fps_checkpoint_state_hash_mismatch`; the existing event-chain and rules-identity checks remain
independent safeguards. The initial last-fire tick uses a finite sentinel so JSON persistence does
not turn the cooldown state into `null` before hashing.

- [x] A regression changes persisted player score while leaving the event chain untouched and is
      rejected by checkpoint state-hash validation.
- [x] The FPS and persistence checkpoint tests pass after rebuilding `@hk-mahjong/fps`; the shared
      test bus run `1786128077361-43130-79af07f3` passes 595 tests across 50 files.
- [x] The local rollback drill restores the hashed checkpoint and accepts continued input. Its
      receipt digest is `sha256:3e209c08e2cc0851a694808b548f320a11060c91ca9bce2e38c2946b23814b7e`;
      the receipt file SHA-256 is `sha256:d9055eaa778eb98a5f80d80598183d33698e2f3c157699e7e863cdcf3ebe73c9`.
- [x] The checkpoint journal requires the digest field before loading persisted matches.
- [ ] Browser re-acceptance, named Cloudflare Tunnel/public-edge testing, production anti-cheat/
      privacy operations, deployment evidence, and external retained-artifact rollback remain open.

This closes a local persisted-state integrity gap in §§6.1 and 11 only. The FPS prototype remains
**not ready for competitive play**.

## 49. Current total authoritative input-boundary validation — 2026-08-07

The FPS authority now treats `submitInput()` as a total runtime boundary. Non-object, array,
incomplete, and extra-field direct calls return `invalid_input` without dereferencing malformed data;
only the exact validated input contract is copied into pending state. Rejected receipts normalize
missing sequence fields to private sentinel values, so malformed commands cannot introduce
`undefined` or non-canonical values that break checkpoint hashing or later restore.

- [x] Regression coverage rejects `null`, arrays, incomplete commands, and an extra-field command.
- [x] Exporting a checkpoint after those rejections remains canonical and succeeds.
- [x] Focused FPS and persistence tests, typecheck, focused lint, Prettier, and diff checks pass.
- [ ] Browser re-acceptance, named Cloudflare Tunnel/public-edge testing, production anti-cheat/
      privacy operations, deployment evidence, and external retained-artifact rollback remain open.

This closes a local malformed-authority-input gap in §7.1 only. The FPS prototype remains **not
ready for competitive play**.

## 50. Final local validation after total authoritative input-boundary hardening — 2026-08-07

The final dirty source was rebuilt and validated after the total `submitInput()` boundary and its
regression expectation were finalized. The local authority, persistence, and deterministic recovery
receipts below all run against this source state; they do not establish competitive readiness.

- [x] The server-owned test bus passes 596 tests across 50 files and 146 suites, including the
      malformed-command regression and checkpoint-state-hash coverage.
- [x] `pnpm typecheck`, focused FPS ESLint, targeted Prettier, `git diff --check`, and `pnpm build`
      pass. The build emits 29 files; the sorted, newline-terminated artifact manifest aggregate is
      `sha256:a2a4c59af15c7d27ad15876e90861e264ffe39dfcd449721f11770d7cf8c1895`.
- [x] `pnpm test:fps:abuse` passes with HTTP statuses `[200, 200, 429]` and receipt digest
      `sha256:b729f425e76533951c6493aa9b71f1740bee65642b2e811d0d12571b4222c607`.
- [x] `pnpm test:fps:network` passes dropped, delayed, reordered, duplicate, resync, and clock
      boundary checks with receipt digest
      `sha256:d6d711644678a498d0ea5815e0ae835564f9a3717e76c915c35992841d40bcdd`.
- [x] `pnpm test:fps:rollback` passes replay verification, hashed checkpoint restoration, and a
      continued input with receipt digest
      `sha256:3e209c08e2cc0851a694808b548f320a11060c91ca9bce2e38c2946b23814b7e`.
- [x] `pnpm test:fps:retained-rollback` passes retained-file hash verification, deliberate tamper
      rejection, checkpoint restore, and continued input with receipt digest
      `sha256:522d62aff381b1daaf07a8cf23e321fd54da821c523237b882b393be8d5d17cb`.
- [ ] Full repository lint remains non-green with 86 unrelated visual-table/movement/procedural-
      world diagnostics, and full formatting remains non-green for 19 unrelated procedural-world
      files.
- [ ] Browser re-acceptance, named Cloudflare Tunnel/public-edge testing, production anti-cheat/
      privacy operations, deployment evidence, and external retained-artifact rollback remain open.

This is the final local source/build/test/replay evidence for this continuation. The FPS prototype
remains **not ready for competitive play**.

## 51. Monotonic fixed-step scheduler audit and final local validation — 2026-08-07

`FpsMatchService.startClock()` now drives the authoritative match with a server-owned monotonic
clock (`performance.now()` by default). It accumulates elapsed time and advances the configured
fixed tick as many times as the elapsed budget requires, while bounding one delayed callback to
eight catch-up ticks. Negative or non-finite samples discard the accumulator; client timestamps
remain telemetry only and never supply simulation elapsed time. The deterministic gate still stops
the realtime clock before advancing an explicit tick count.

- [x] A focused service regression proves that a delayed monotonic sample advances three fixed
      ticks and that an impossible `965 ms` gap is clamped to eight additional ticks rather than
      replayed wholesale.
- [x] The refreshed server-owned test bus passes 597 tests across 50 files and 146 suites.
- [x] `pnpm typecheck`, focused FPS ESLint, targeted Prettier, `git diff --check`, and `pnpm build`
      pass. The build emits 29 files; the sorted, newline-terminated artifact manifest aggregate is
      `sha256:6e411bd79c59856f945918e646f2c1925a1d0b23b74e3b077b351311412ed1c9`.
- [ ] Full repository lint and formatting remain non-green for unrelated visual-table/movement/
      procedural-world files. Browser re-acceptance, named Cloudflare Tunnel/public-edge testing,
      production anti-cheat/privacy operations, deployment evidence, and external retained-artifact
      rollback remain open.

This closes the local §6.3 fixed-step clock gap only. The FPS prototype remains **not ready for
competitive play**.
