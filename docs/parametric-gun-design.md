# Parametric Gun Design

Status: implemented in the parametric-guns worktree (v1 prototype)

This document defines the data contract and derived relationships for
algorithmically generated guns in the visual-table prototype. The v1 resolver,
generic inventory, seeded pickups, shared geometry/runtime path, generation
receipts, Pareto filter, and playtest telemetry are now implemented in
`apps/web/src/scene/weapons.ts` and `apps/web/src/scene/mahjong-table.ts`.
The exact envelope values remain local prototype tuning.

## Iteration workspace

This draft is isolated from the dirty visual-table checkout.

| Field           | Value                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| Worktree        | /Users/nv/repos/0x4007/hk-mahjong-coach/.codex-worktrees/parametric-guns                               |
| Branch          | parametric-guns-g513f524b51                                                                            |
| Base commit     | 56c6d8d66a2369abe26e1ebaabbfd838f098bce8                                                               |
| Goal identifier | /Users/nv/repos/0x4007/hk-mahjong-coach/.codex-worktrees/parametric-guns/docs/parametric-gun-design.md |
| SHA-256 suffix  | g513f524b51                                                                                            |

The source checkout had pre-existing dirty changes when this worktree was
created. They remain in the original visual-table worktree and are not
overwritten by this draft.

## 1. Goals

The system must:

1. Generate many distinct guns from a small, validated primitive profile.
2. Derive gameplay, handling, reload, audio, heat, smoke, and model geometry
   from shared functions.
3. Keep the pure resolver deterministic for a profile, formula version, and
   seed.
4. Store generated guns as generic instances rather than adding a new code
   branch or inventory slot for every gun.
5. Make generated guns reproducible in playtest reports and replays.
6. Support objective telemetry and subjective fun ratings without optimizing
   only for damage per second.

The system is for local prototype playtesting first. It is not an authoritative
multiplayer weapon or enemy-damage system.

## 2. Design rules

- A gun has primitive inputs and resolved outputs. Resolved outputs are never
  entered by hand in a weapon definition.
- A structural choice, such as clip, round, or belt feeding, is data. It must
  not create a per-gun branch in the resolver.
- Related outputs share canonical inputs. Total damage per projectile group and
  measured hot-barrel length are the canonical inputs for shot effects.
- Every random choice uses a named seeded RNG stream.
- A generated profile includes its formula version and canonical hash.
- Invalid profiles are rejected before they enter the inventory or playtest.
- A high value in one dimension must create a cost in another dimension. The
  generator must not select maximum payload, maximum cadence, maximum capacity,
  and maximum handling at the same time without an explicit budget.
- UI code receives generic slot and gun-instance data. It does not inspect a
  gun type to decide how inventory or firing works.

## 3. Primitive profile

The first resolver version should accept a profile equivalent to:

```ts
interface GunPrimitivesV1 {
  readonly profileId: string;
  readonly displayName: string;

  // Payload.
  readonly damagePerProjectile: number;
  readonly projectilesPerShot: number;

  // Cadence.
  readonly fireIntervalSeconds: number;
  readonly burstSize: number;
  readonly burstCooldownSeconds: number;

  // Ammunition.
  readonly magazineSize: number;
  readonly reserveAmmo: number;
  readonly feedStyle: "clip" | "round" | "belt";

  // Ballistic presentation.
  readonly spreadRadians: number;
  readonly hotBarrelLengthMeters: number;
  readonly barrelRadiusMeters: number;

  // Generated model and handling inputs.
  readonly receiverLengthMeters: number;
  readonly receiverWidthMeters: number;
  readonly receiverHeightMeters: number;
  readonly massKg: number;
  readonly gripAngleRadians: number;
  readonly stockLengthMeters: number;

  // Optional optic. Null means iron sights.
  readonly opticMagnification: number | null;

  // Presentation metadata. These do not affect gameplay.
  readonly accentColor: number;
  readonly generatorSeed: string;
}
```

Profile ID identifies a generated profile, not a hard-coded gameplay branch.
The six current guns can remain named fixture profiles while the generator is
being tested. New generated guns must not require a new union member in the
runtime.

If physical projectiles are added later, velocity, projectile mass, gravity,
range, penetration, and falloff may be added as a versioned ballistic group.
The current prototype is hitscan and has no weapon-specific range cap.

## 4. Canonical derived quantities

Use explicit names so a shell, burst, magazine, and inventory are not confused:

```text
groupDamage       = damagePerProjectile × projectilesPerShot
burstDamage       = groupDamage × burstSize
magazineDamage    = groupDamage × magazineSize
inventoryDamage   = groupDamage × (magazineSize + reserveAmmo)
cyclicRate        = 1 / fireIntervalSeconds
```

For a burst:

```text
burstCycleTime = (burstSize - 1) × fireIntervalSeconds
                 + burstCooldownSeconds
burstDPS       = burstDamage / burstCycleTime
```

For a continuous weapon, burstSize is one and the cooldown defaults to the
fire interval.

The resolver must also expose:

- damage per projectile;
- damage per group;
- damage per burst;
- projectiles per second;
- bursts per second;
- magazine damage;
- total inventory damage;
- time to empty a magazine;
- reload time;
- sustained damage per second after reload downtime.

These values are derived telemetry and chart data. They must not become
independent tuning fields.

## 5. Reload relationships

Reload timing must use a continuous workload:

```text
reloadWork = groupDamage × magazineSize
```

The feed style changes how that work is delivered:

- clip: one atomic operation at a loader rate;
- round: one round is inserted at a time and may be interrupted;
- belt: a large magazine is loaded in continuous segments and may expose
  partial capacity while loading.

The first implementation may use:

```text
clipReloadSeconds = baseClipTime + reloadWork / clipLoaderRate
roundInterval     = baseRoundTime + groupDamage / roundLoaderRate
roundReloadSeconds = roundInterval × magazineSize
beltReloadSeconds = baseBeltTime + reloadWork / beltLoaderRate
```

`reloadSeconds` is the full magazine workload. `reloadIntervalSeconds` is the
per-round interval for round feed or the per-segment interval for belt feed.
The constants are global rules, not per-gun values. A very large, high-damage
turret magazine therefore reloads slowly unless its cadence, payload, or feed
style makes a deliberate tradeoff.

Reload presentation remains shared. Lift, work, insertion impulse, and
recentering are normalized by the resolved reload duration.

## 6. Recoil and handling

The current prototype scales camera and viewmodel recoil from per-projectile
damage and follows the live reticle direction. The shared camera damper remains
the presentation authority.

The generated system should add a continuous handling factor:

```text
handling =
  massFactor(massKg)
  × lengthFactor(hotBarrelLengthMeters, stockLengthMeters)
  × postureFactor
```

Then:

```text
recoilKick      = projectileImpulse × damageScale / handling
aimRecoveryTime = baseRecoveryTime × recoilKick / handling
movementPenalty = movementScale × massFactor × lengthFactor
switchTime      = switchScale × massFactor × lengthFactor
```

The exact functions and bounds belong to the resolver version. There must be
no shotgun, sniper, machine-gun, or turret recoil path.

Projectile impulse may initially be approximated from damage. If physical
projectile mass and velocity are introduced, use momentum or kinetic energy
instead and keep damage as the gameplay result.

## 7. Spread, accuracy, and optics

Inherent cone spread is a primitive. The runtime adds shared reticle movement
from movement, breathing, posture, oxygen, and recoil.

For a pellet group, sample a uniform disk:

```text
angle  = random × 2π
radius = sqrt(random) × spreadRadians
```

Derived spread modifiers:

```text
hipSpread      = baseSpread × handlingSpreadFactor × movementFactor
zoomSpread     = hipSpread / opticMagnificationFactor
heatSpread     = hipSpread × heatAccuracyFactor
recoverySpread = hipSpread × unresolvedRecoilFactor
```

An optic changes sight presentation and zoom stability. It must not create a
second firing ray. Sight and scope geometry must be generated from receiver,
barrel, and sight-line dimensions instead of hard-coded weapon-ID branches.

## 8. Heat, smoke, and audio

Heat is hit-conditioned:

```text
Tnext = ambientTemperature
      + (Tcurrent - ambientTemperature) × exp(-coolingCoefficient × dt)
      + heatPerDamage × hitDamage
```

The same formula applies to every profile. A miss contributes no hit damage.

The target relationship above is exponential cooling. The v1 visual-table
prototype currently uses a shared linear damage-load cooldown instead: 500
damage units cool to ambient in 30 seconds (`16.67` damage units per second).
This is an explicit prototype deviation retained for the existing rendered
heat and smoke tuning; changing it requires a new formula version and updated
visual regression evidence.

Use total group damage and hot-barrel length for shot effects:

```text
effectPower      = max(minEffectPower, groupDamage / referenceDamage)
muzzleSize       ∝ effectPower
muzzlePuffCount  ∝ groupDamage / referenceDamage
thermalSize      ∝ sqrt(effectPower)
thermalRate      ∝ 1 / (thermalSize × barrelLengthScale)
```

The barrel scale is normalized from measured hot-barrel length. Longer barrels
change the derived smoke and sound response without a long-barrel weapon table.

Audio should derive from effect power and barrel length:

- higher shot energy lowers pitch and increases level;
- a shorter barrel produces a stronger crack;
- a longer barrel produces a longer, lower tail;
- mechanical action timing remains tied to feed and cadence.

The current prototype uses per-projectile damage for part of its audio curve.
That is a migration item; the generated resolver should expose one versioned
audio input mapping.

## 9. Oxygen and resource relationships

The current firing-fatigue law is:

```text
oxygenCostPerGroup = oxygenDamageFactor × groupDamage
oxygenCostPerBurst = oxygenCostPerGroup × burstSize
```

Reserve ammunition remains a capacity primitive. The resolver exposes:

- expected shots from a full inventory;
- expected group damage from a full inventory;
- oxygen cost per magazine;
- damage per reload;
- damage per second of reserve ammunition.

## 10. Generic inventory and dropped guns

Generated guns use generic slots. The inventory must not contain dedicated
fields such as pistol, shotgun, or machineGun.

The default loadout has two slots. The slot count is a single inventory rule,
not a weapon property; it can be changed later without changing gun profiles.

```ts
interface GunInstance {
  readonly instanceId: string;
  readonly profileHash: string;
  readonly primitives: GunPrimitivesV1;
  loadedAmmo: number;
  reserveAmmo: number;
  temperatureC: number;
}

interface GunInventorySlot {
  readonly slotIndex: number;
  readonly gunInstanceId: string | null;
}

interface GunInventorySnapshot {
  readonly slots: readonly GunInventorySlot[]; // exactly two by default
  readonly activeSlotIndex: number | null;
  readonly nearbyPickupId: string | null;
}
```

Slot and input rules:

- Number keys select generic slots by index.
- 0 holsters the active gun but keeps it in its slot.
- Q throws the active gun. It no longer cycles weapons. The throw inherits
  sprint, strafe, and jump velocity; while stationary it ejects at least 1 m
  forward and is protected from walk-over re-pickup until the player leaves
  its pickup radius.
- Dropping cancels reload presentation, clears the active slot, and leaves all
  other slots unchanged.
- The dropped pickup keeps the exact gun instance, profile hash, loaded ammo,
  reserve ammo, temperature, and generator seed.
- The pickup receives a deterministic instance/event ID and a safe world
  position in front of the player.
- Walking over a gun fills the first free slot and leaves the held gun in hand.
  If both slots are full, walk-over pickup does nothing. Pressing E is
  intentional: it equips a nearby pickup when a slot is free, or swaps it with
  the held gun when both slots are full.
- Fire, reload, pickup, and drop are blocked during a switch transition.
- The HUD renders slots from the snapshot and does not branch on weapon type.

The catalog may retain named fixture profiles for current pistol, shotgun,
machine gun, sniper, carbine, and submachine gun tests. Runtime inventory
resolution uses the profile hash and generic instance record.

## 11. Seeded generation and validation

Generation uses a separate RNG stream:

```text
<roomSeed>|weapons|generation|<formulaVersion>|<gunSeed>
```

The generator should:

1. Sample a bounded latent vector.
2. Expand it into primitive inputs.
3. Resolve every derived output.
4. Validate finite values, bounds, and tradeoff constraints.
5. Compute a canonical profile hash.
6. Emit the profile and a redacted generation receipt.

Suggested latent axes:

- payload;
- cadence;
- capacity;
- reach and barrel length;
- handling mass;
- accuracy and optic strength;
- feed style;
- presentation variation.

The generator should use archetype envelopes as sampling distributions, not
as runtime branches. A generated profile may be labelled after resolution for
debugging, but the label must not control gameplay.

The v1 generator exposes a `submachine` envelope for the playtest catalog. It
uses a compact clip, one projectile per trigger pull, high cadence, moderate
spread, light handling, and a small magazine-damage budget. This is a sampling
choice only; the runtime consumes the same generic resolved profile contract.

### Deterministic memorable names

Generated profiles receive a player-facing name when no explicit
`displayName` override is supplied. The name is composed from the strongest
latent tradeoff, a feed-style noun family, and a six-character stable code:

```text
True Ember · K7M4Q2
```

The words are presentation metadata. The code is derived from the separate
`<roomSeed>|weapons|name|<formulaVersion>|<gunSeed>` stream. Archetype variants
append `|<archetype>` before the gun seed, so the submachine family has its own
stable name stream. Adding a name to the canonical profile payload cannot
create a hash cycle. The generation receipt stores the name and both streams.
Profile hash, formula version, room seed, and gun seed remain the canonical
identity used for replay and telemetry.
Names are designed to be collision-resistant for practical playtest catalogs;
the canonical hash and seed must still be recorded when a tester reports a
favorite. Explicit `displayName` values remain authoritative.

The default test catalog contains 24 indexed profiles (`catalog-001` through
`catalog-024`) per room seed. Twelve entries use the deterministic submachine
envelope and the remaining entries use the general envelope. The scene places
those profiles in the parametric barracks and provides a four-distance target
range. Changing the room seed regenerates both the profile values and their
memorable names while preserving replay determinism.

## 12. Power and sanity constraints

Reject or resample profiles that violate global bounds, such as:

- non-positive or non-finite values;
- impossible reload times;
- excessive sustained damage for the selected playtest tier;
- zero spread combined with maximum payload and maximum cadence;
- a magazine whose reload downtime makes the weapon unusable;
- a heavy profile with no handling or heat cost;
- an optic whose geometry cannot align with the barrel sight line.

Use Pareto filtering instead of one permanent balance score. Keep multiple
profiles that trade burst damage, sustained pressure, accuracy, mobility,
reload safety, and ammunition economy in different ways.

## 13. Playtest telemetry

Every test run records the profile hash, seed, scenario seed, and:

- time to first accepted shot;
- time between visible hit events;
- hit rate by distance and posture;
- damage per second and burst damage;
- recoil displacement and recovery time;
- movement speed and aim penalties;
- heat peak, glow time, and thermal smoke rate;
- reload duration and reload interruption rate;
- ammunition and oxygen consumed;
- target engagement range;
- deaths, misses, and empty-magazine events;
- player rating for power, control, clarity, and fun.

The current player feedback suggests that machine guns and the shotgun are
rewarding because they give clear, frequent, or dramatic feedback; the pistol
and sniper remain valuable because they solve reliable precision problems; the
carbine needs a stronger identity. These are hypotheses for the playtest
harness, not hard-coded balance rules.

## 14. Future heavy turret test family

The heavy turret is a generated test region, not a special implementation:

- high damage per projectile;
- large magazine;
- long hot barrel;
- moderate cadence;
- high mass and handling cost;
- high heat, recoil, audio, smoke, oxygen, and reload work derived from the
  same equations.

Its large magazine must provide sustained pressure without becoming free power.
The automatic costs should emerge from payload, capacity, barrel length, and
handling rather than a turret-specific exception.

## 15. Implementation order

1. Add a pure profile resolver and canonical hashing.
2. Move barrel and receiver dimensions into the profile.
3. Replace weapon-ID geometry branches with generated geometry.
4. Replace dedicated inventory fields with generic slots and gun instances.
5. Change Q to drop the active gun and add deterministic dropped pickups.
6. Add seeded profile generation and validation receipts.
7. Add a profile inspection and playtest surface.
8. Run the existing test bus, typecheck, lint, build, and the permitted
   connected-app HMR workflow after implementation changes.

Open decisions for the next iteration:

- exact global bounds and balance budgets;
- whether feedStyle is explicit or inferred from capacity and payload;
- whether recoil remains damage-based or moves to projectile momentum;
- whether generated profiles need condition, rarity, or attachment primitives;
- whether two slots should be fixed or configurable later.
