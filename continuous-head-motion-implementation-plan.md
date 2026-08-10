# Mirror's Edge Catalyst-Inspired Movement and Continuous Head Motion

Implementation handoff plan for the `hk-mahjong-coach` visual-table movement prototype.

## Base and constraints

- Start from the clean `main` branch.
- Do not use the dirty `continuous-head-motion` worktree as the implementation base.
- Do not open, control, or validate a browser during implementation.
- Do not run multiple game instances.
- Acceptance for the implementation is deterministic simulation, unit tests, typecheck, build, and lint.
- The user will manually validate the final result in one browser window.
- Keep the normal composed Mahjong table camera as the default presentation unless the existing debug/exploration path explicitly enables first-person movement.

## What “physics remains authoritative” means

The physics runtime is the source of truth for the player's actual body. Rapier or the deterministic fallback resolves the
player capsule's position, velocity, grounded state, and collisions. The camera damper reads those resolved values and adds
temporary presentation offsets after the physics pose is known.

For example, on landing:

1. Physics resolves the capsule's downward velocity, support contact, and final position.
2. The movement controller emits a landing event or resolved velocity delta.
3. The camera damper adds head compression, pitch, or roll as a render-only offset.
4. The offset does not move the physics capsule and cannot change collision, damage, O₂, or future movement.

This prevents a camera-only vault from showing the player over a wall while the collision body is still below it. It also
prevents camera-only landing or climbing animations from desynchronizing collision, raycasts, traversal, or gameplay state.

## What “Mirror's Edge Catalyst” means here

This is not a literal recreation of proprietary code or animation. It is an implementation of the movement principles that
make Mirror's Edge Catalyst feel fluid and traversal-focused.

### Momentum and flow

- Accelerate toward target velocity instead of changing speed instantly.
- Preserve momentum briefly when input is released.
- Apply stronger braking when reversing direction.
- Support responsive but bounded air control.
- Treat sprint as a movement state, not only a scalar speed multiplier.
- Smoothly transition between walking, running, sprinting, crouching, and airborne movement.

### Contextual traversal

Use typed movement states for:

- grounded;
- airborne;
- crouch/slide;
- vault;
- wall contact;
- wall run or wall climb;
- ledge grab;
- landing/recovery.

Traversal starts only when geometry and input are valid. The controller must use wall normals, wall height, top clearance,
landing clearance, capsule dimensions, current velocity, and jump/sprint/crouch input. A nearby wall must not automatically
trigger traversal.

### Verticality

The movement model should support:

- jumping onto low obstacles;
- vaulting over waist-height obstacles;
- climbing or pulling up higher walls;
- grabbing ledges while airborne;
- landing on top support;
- falling when no valid support exists.

All of these actions must resolve through the existing physics runtime. The camera can express the traversal response, but it
must not move the player independently of collision resolution.

### Presentation

First-person presentation should express the body response:

- footfall-shaped gait;
- lateral and depth motion;
- acceleration/deceleration lean;
- take-off and landing compression;
- exertion breathing;
- restrained traversal motion;
- unified camera, weapon, reticle, and aim-ray response.

These are presentation outputs derived from physics, not an alternate movement system.

## Implementation stages

### 1. Establish the movement contract

Create or consolidate a pure movement controller with typed states and deterministic inputs.

Inputs should include:

- movement direction;
- sprint, crouch, and jump input;
- current velocity;
- grounded state;
- collision contacts;
- wall normals and obstacle metadata;
- fixed simulation delta;
- seeded scenario input.

Outputs should include:

- desired movement velocity;
- jump or traversal request;
- posture/state transition;
- traversal progress;
- events for jump, vault, wall contact, ledge grab, landing, and slide start/end.

Game rules must remain outside React and HUD code.

### 2. Implement momentum-based locomotion

Use a fixed-step or bounded-step simulation.

Required behavior:

- accelerate toward target ground velocity;
- preserve momentum briefly after input release;
- brake more strongly when reversing;
- clamp ground and air speeds separately;
- support crouch movement;
- use the existing O₂ model for sprint affordability;
- never make standing impossible because O₂ is empty;
- produce a deterministic full-jump or fallback-jump result when O₂ is insufficient.

### 3. Implement Catalyst-style traversal

Implement the smallest coherent traversal set first:

1. jump;
2. low-obstacle vault;
3. airborne ledge grab/pull-up;
4. wall climb;
5. slide/crouch transition;
6. landing response.

For every traversal:

- validate geometry before starting;
- preserve the capsule as the authoritative body;
- resolve movement through physics;
- cancel on lost contact, invalid clearance, or released input;
- prevent repeated retriggering while a key remains held;
- emit deterministic events and progress values;
- never teleport the camera or capsule to the destination.

Wall-scaling clarification: `wall-contact` is a brief, validated catch at the
start of a continuous wall climb. It is not an indefinite hanging mode and it
is not a top-edge ledge grab. After the catch, wall climbing should proceed
smoothly while the traversal input remains held; releasing that input during
the catch or climb releases the capsule back to physics and it falls. A short
catch/settle phase is allowed for physical continuity, but climbing must not
require releasing Jump and pressing it again. `ledge-grab` remains the
separate state for catching a top edge and pulling onto its support surface.

Wall running may follow as a separate state only after wall contact, speed, angle, and clearance tests are stable.

### 4. Implement continuous head motion

In `apps/web/src/scene/camera-motion.ts`:

- consume the physics-resolved world velocity delta;
- project it into yaw-local right, forward, and up axes;
- feed all six signed directions through bounded springs;
- derive gait phase from actual speed;
- suppress footfall gait while airborne;
- apply support-plane/head-clearance constraints;
- compose breathing, gait, acceleration, landing, recoil, and weapon-switch motion in one output.

The output must drive the camera pose, camera-attached weapon/viewmodel, reticle presentation, and aim-ray NDC. No consumer
may append an independent motion oscillator.

#### Follow-up specification — unified three-axis head impulse model

The first prototype is not accepted as the final head-motion model. Its vertical response feels like a separate weight
effect, while horizontal response is a separate roll/pitch path. Replace those separate paths with one coherent local
head-response system. This is a presentation-only change; do not change movement rules, traversal eligibility, damage, O₂,
or the authoritative physics capsule.

##### Required model

- Define one local frame for the player: `right`, `up`, and `forward`. Every resolved body velocity change, contact stop,
  traversal transition, weapon impulse, and melee impulse must enter that frame before it reaches the presentation system.
- Define one `HeadImpulseState` containing at least a three-axis translational offset and velocity in metres, plus a
  three-axis rotational offset and angular velocity in radians. Do not keep separate `weightShift`,
  `accelerationRoll`, or `accelerationPitch` state machines.
- Integrate every axis with the same bounded second-order spring form (natural frequency and damping ratio). Per-axis gain,
  limit, or clearance may be tuned, but the integration algorithm and sign convention must be shared by all three axes.
- Treat body acceleration as head reaction: a resolved body `deltaV` produces the opposite local head impulse. A downward
  velocity removed by a support contact therefore produces a downward head load. Encode this sign once in the shared input
  conversion; do not add a landing-only sign correction in scene code.
- Do not feed constant world gravity into the head spring on every airborne frame. Free fall is not a repeated impact. Use
  the change in resolved velocity and explicit take-off, contact, traversal, weapon, and melee impulses only.
- Gait and breathing may remain deterministic low-frequency target signals, but they must be injected into this same state
  and solver. They must not write camera, reticle, weapon, or aim offsets through a second oscillator or direct additive path.
- Derive rotational response from the same three-axis reaction vector and explicit torque inputs. Forward, up, and right
  impulses must all be able to affect the resulting head pose; the system must not have a side-to-side-only branch.

##### Output and constraints

- Publish one immutable `HeadMotionSnapshot` per render frame with translational offset, rotational offset, and any
  diagnostics needed by tests.
- Apply the snapshot after physics resolves the base pose. The presentation offset must never be written back into physics,
  collision queries, traversal targets, or gameplay state.
- Apply support and ceiling constraints to the translational offset only. If a constraint is reached, remove or damp the
  outward spring velocity so the camera does not chatter or pop against the boundary.
- Camera pose, held viewmodel, reticle, aim ray, and focus ray must consume the same snapshot. A screen-space projection
  scale is allowed only as a documented projection of that snapshot; it must not be a second motion signal.
- Recoil, melee, traversal, landing, and locomotion must compose through this same state. Preserve action-ray capture so a
  presentation update cannot change the gameplay ray for an already-started action.

##### Acceptance requirements

- At full O₂ while stationary, every translational and rotational output is exactly zero.
- Positive and negative impulses on each of `right`, `up`, and `forward` are mirrored, bounded, and free of unintended
  cross-axis response. A rotated camera produces the same local result for the same local impulse.
- Acceleration, release, braking, wall stop, take-off, traversal, and landing all settle through the same response. Holding
  movement into a wall produces one impulse, not a repeated buzz.
- Landing response is monotonic with the resolved downward delta-v. A severe fall is visibly stronger than a normal jump,
  while free fall does not accumulate an artificial downward bias.
- Gait and breathing settle without a discontinuity when movement stops, the player leaves the ground, or a traversal starts.
- Simulated output is equivalent at 60 Hz and 120 Hz within the existing deterministic tolerance. Scenario traces include
  the three-axis input vector and the complete head-motion snapshot.
- Focused tests prove the shared solver, signs, diagonal composition, clearance behavior, consumer alignment, and absence of
  the old axis-specific state paths. Rendered one-window browser acceptance remains a separate user gate.

### 5. Preserve aim alignment

- Keep one normalized reticle position.
- Use the same NDC for the visible reticle and all aim/focus raycasts.
- Aim the weapon at the live reticle ray.
- Apply shared viewmodel motion only through the central presentation output.
- Do not add reticle-only O₂ spread.
- Do not add a second weapon sway phase.
- Require exact zero motion-derived reticle offset while stationary.

### 6. Reconcile O₂ behavior

Use one explicit contract:

- O₂ changes exertion, breathing, sway, blur, sprint availability, and recovery.
- Standing and crouching always remain possible.
- Jumping has a deterministic full-cost or fallback result.
- Holding breath has deterministic activation and depletion behavior.
- Every action mutation has pure tests at full, partial, and zero reserve.

### 7. Add deterministic simulation coverage

Use the movement simulator instead of browser validation. Add scenarios for:

- walk acceleration;
- sprint acceleration;
- sprint release;
- hard braking;
- direction reversal;
- diagonal movement;
- crouch movement;
- jump;
- jump while holding the key;
- low-obstacle vault;
- invalid vault rejection;
- airborne wall contact;
- wall-climb hold and release;
- ledge grab;
- ledge contact loss;
- top support;
- slide start and stop;
- low-ledge landing;
- normal jump landing;
- severe fall;
- O₂ depletion and recovery.

Each scenario should record position, velocity, grounded state, collision count, traversal state, traversal progress, event
sequence, O₂ state, camera-motion inputs, and camera offsets. Use fixed seeds and compare exact or tolerance-bounded output.

## Tests

### Unit tests

Cover:

- all signed acceleration axes;
- diagonal acceleration;
- frame-rate independence;
- monotonic spring saturation;
- no false vertical response from a pitched camera;
- speed-derived gait frequency;
- U-shaped gait geometry;
- airborne gait suppression;
- acceleration/braking signs;
- low-ledge/full-jump/severe-fall ordering;
- support-plane head constraint;
- reticle zero-at-rest;
- reticle/aim-ray NDC agreement;
- weapon/reticle shared pose;
- no duplicate weapon sway;
- recoil independent of breathing;
- all O₂ reserve states;
- crouch/stand at zero O₂;
- traversal start, cancellation, completion, and held-key latching.

### Repository validation

Run on the clean `main`-based implementation:

- server-owned test-bus snapshot;
- focused movement and camera suites;
- movement simulation scenarios;
- strict typecheck;
- targeted lint;
- production web build;
- formatting check;
- `git diff --check`.

No browser, HMR, Playwright, or computer-use validation is part of this implementation plan.

## Handoff to the user

The implementation agent must report:

- exact base and final SHA;
- changed files;
- simulation commands and results;
- unit-test results;
- typecheck, build, and lint results;
- known limitations;
- an explicit statement that browser behavior was not tested by the coding agent.

The user will perform the final manual browser test in one window.
