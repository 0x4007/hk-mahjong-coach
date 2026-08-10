# Continuous Head Motion 3 — Unified Momentum/Impulse Handoff

## Handoff status

This document is the implementation handoff for the next agent. It is an authoritative plan and acceptance contract;
the feature is not implemented in this worktree yet.

- Worktree: `/Users/nv/repos/0x4007/hk-mahjong-coach/.codex-worktrees/continuous-head-motion-3`
- Branch: `continuous-head-motion-3-gfd0622572e`
- Base/checkpoint: `0e698917d1ecc13a70b080bb2fb0be878ee0d3e2` (`fix: add player geometry recovery`)
- Branch mapping: the canonical worktree identifier `/Users/nv/repos/0x4007/hk-mahjong-coach/.codex-worktrees/continuous-head-motion-3`
  maps to suffix `gfd0622572e`.
- Initial state: clean at the base SHA.
- The older `continuous-head-motion-2` worktree contains unrelated dirty Debugging 03/map work. Do not copy, reset,
  overwrite, or commit that lane from this worktree.

Before editing, read `AGENTS.md`, `spec.md`, `plans.md`, this document, and the relevant movement/camera code. Keep one
canonical implementation writer on the shared scene integration. Read-only research agents may audit the current seams;
dependent implementation work must branch only after the shared contract is integrated.

## Objective

Replace the current split movement and presentation model with one authoritative momentum/impulse-based movement
pipeline. The player body, traversal, jump, fall, landing, and first-person head response must be driven by the same
resolved velocity and impulse events.

Rapier or the deterministic fallback remains the collision authority. It resolves the capsule position and contacts, but
it must not become a second movement model. The camera must never move the capsule, and a presentation offset must never
feed back into physics, collision queries, traversal targets, damage, O₂, or action rays.

## Required model

### One movement state and one impulse stream

Create or consolidate a pure, typed movement/impulse contract. The exact module name may be chosen by the implementer,
but it must provide the following concepts without `any`:

- A world-space authoritative capsule pose and resolved velocity supplied by physics.
- A yaw-local `right`, `up`, `forward` frame for all body reaction and presentation impulses.
- Momentum state for desired/resolved body velocity, grounded/airborne state, posture, traversal state, and latching.
- A queued or accumulated impulse input with a typed source, such as `locomotion`, `take-off`, `collision-stop`, `support-stop`,
  `traversal`, `weapon`, or `melee`.
- One immutable per-frame `HeadMotionSnapshot` containing bounded translational and rotational offsets, velocities or
  diagnostics needed by tests, and the resolved viewmodel/reticle projection inputs.

The per-frame order must be explicit:

1. Read input and current authoritative capsule velocity.
2. Resolve target momentum, acceleration/braking, jump action, posture, and traversal request.
3. Submit the requested body delta to physics.
4. Read the resolved position, contacts, grounded state, and resolved velocity delta.
5. Convert that delta-v and explicit action/contact events once into the local impulse stream.
6. Integrate the single head/body response state and publish the immutable snapshot.

Do not retain parallel sources of truth. The refactor must remove or demote the current independent movement and camera
state paths, including the scene-owned `forwardVelocity`, `strafeVelocity`, `verticalVelocity`, `jumpOffset`, and
`maximumFallSpeed` fields where they duplicate unified state, plus camera-owned `weightShift`, `weightVelocity`,
`accelerationRoll`, and `accelerationPitch` state machines. Physics bookkeeping may remain where required by the runtime,
but it must be represented once and exposed through the shared contract.

### One shared second-order head solver

Use one bounded second-order spring/integrator for all three translational axes and one matching algorithm for the three
rotational axes. Per-axis gain, limit, and clearance values may differ; the integration form and sign convention must not.

- Body acceleration is head reaction: a resolved body delta-v produces the opposite local head impulse.
- A downward velocity removed by support produces a downward landing load through that same conversion. Do not add a
  separate landing-only sign patch in scene code.
- Do not feed constant world gravity into the head solver on every airborne frame. Free fall is not repeated impact.
- Take-off, collision stops, traversal transitions, support stops, weapon recoil, and melee impacts enter the same state.
- Gait and breathing may be deterministic low-frequency targets, but they must inject into the same state. No second
  oscillator may write directly to the camera, reticle, weapon, or aim ray.
- At full O₂ while stationary, all translational and rotational motion output must be exactly zero.
- Positive and negative impulses on `right`, `up`, and `forward` must be mirrored, bounded, and free of unintended
  cross-axis response. A rotated camera must produce the same local result for the same local impulse.

### Movement behavior

The same movement contract must cover:

- ground acceleration, release momentum, stronger reverse braking, diagonal movement, and bounded air control;
- walk/run/sprint, crouch, slide, O₂ affordability, and deterministic full/fallback jump behavior;
- gravity and vertical velocity through physics, with no camera-only jump or fall;
- low vault, airborne ledge grab/pull-up, wall contact, held-input wall climb, cancellation, and supported landing;
- collision stops and recovery without repeated wall buzz or input-held retriggering;
- landing/recovery events with downward delta-v preserved for both physics effects and presentation.

Traversal geometry resolvers may remain specialized, but they must submit validated trajectory/contact results to the one
movement state. A traversal arc must not directly set a detached camera pose or bypass capsule collision resolution.

## Severe-fall acceptance

The acceptance case is a jump/fall from a roughly 5 m ledge, approximately 6 m of vertical air travel to the lower
support. The body must land through physics. At impact, with no ceiling constraint:

- the landing response must be monotonic with resolved downward delta-v;
- the severe fall must be visibly and measurably stronger than a normal jump landing;
- the first-person camera should compress toward approximately 1.0 m above the support surface at the impact peak
  (use an explicit documented tolerance, recommended ±0.15 m, rather than a vague “small bob”);
- the response must recover smoothly to the standing eye height of 1.75 m, without teleporting the capsule or changing
  its collision height;
- support and ceiling constraints may limit the requested offset, and the snapshot must expose that clamping for tests.

A normal jump must not reach the severe-fall compression target. Free fall must not accumulate a downward bias before
contact. A hard stop at the same speed must produce a correspondingly deeper response than a soft stop.

## Consumer contract

The same immutable `HeadMotionSnapshot` must drive:

- camera pose and orientation after physics resolves the base pose;
- the camera-attached held viewmodel, including gait, traversal, recoil, and melee response;
- reticle presentation and aim-ray NDC;
- focus-ray projection and any attached first-person diagnostics.

The visible reticle, weapon, camera, and gameplay ray must agree. An action ray must be captured before a later
presentation update can change it. No consumer may append a private bob, sway, landing, recoil, or reticle-only offset.

## Implementation order

1. Verify the branch, base SHA, clean state, and preserved scope. Stop if another writer changes this worktree.
2. Add pure types, local-frame conversion, shared spring integration, impulse sources, and immutable snapshots.
3. Refactor the deterministic movement simulator and pure tests to use the new contract first.
4. Adapt the live `mahjong-table.ts` loop so input, physics, contacts, traversal, and landing all use the contract.
5. Replace the existing split `camera-motion.ts` state paths and route every consumer through the snapshot.
6. Remove obsolete parallel state and update `implementation.md` and `documentation.md` only after behavior is proven.
7. Add the severe-fall fixture and all deterministic regression coverage before any visual acceptance claim.

Do not broaden this into multiplayer, rules, persistence, or unrelated map work. Do not open another browser, launch a
second game instance, or claim browser/HMR/Playwright proof. The user will perform the one-window visual acceptance after
the deterministic implementation gates pass.

## Required validation

Use the repository-owned test bus; do not launch Vitest directly. From this worktree, obtain a completed server-owned bus
manifest and read the exact listed result files. Then run the separate gates relevant to this change:

```text
pnpm test:movement:sim
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
git diff --check
```

The movement simulation must include stationary zero, each signed axis, diagonal input, acceleration/release/braking,
air control, jump, normal landing, severe fall, wall stop, traversal start/cancel/complete, frame-rate comparison, and
the complete head-motion snapshot. Tests must prove camera/viewmodel/reticle/aim alignment and support/ceiling clamps.

Finish with the exact tested SHA, a clean worktree, the bus run ID, simulation receipt, and a short list of any remaining
rough edges. A local commit is required before handoff; do not leave accepted movement work uncommitted.

## Handoff prompt

> Read `AGENTS.md`, `spec.md`, `plans.md`, and `continuous-head-motion-3-handoff.md` completely. Implement this unified
> momentum/impulse movement contract on the canonical `continuous-head-motion-3-gfd0622572e` branch. Start by verifying
> the exact base SHA and clean state. Preserve unrelated work, keep physics authoritative, use one shared impulse state
> and one immutable head-motion snapshot, and do not open a browser. Run the required deterministic and repository gates,
> commit the accepted feature, and report the exact SHA plus final clean status.

## Current implementation checkpoint — 2026-08-10

The contract is implemented on this canonical lane in commit `c60dff08f25c` (the follow-up recovery regression is
currently being validated). `apps/web/src/scene/head-motion.ts` integrates bounded local translation and rotation from
physics-resolved impulses, while the live and deterministic movement paths preserve capsule authority and omit repeated
airborne gravity. The severe-fall fixture reaches a minimum shared head/camera offset of `-0.8793 m` from the standing
`1.75 m` eye, which places the eye at about `0.87 m` above the support surface, and the capsule remains at the support
height while the response returns toward zero.

The trace now records `camera.visibleEyeHeight` directly; the severe-fall fixture bounds its minimum to `0.85–1.15 m`
to make the one-metre acceptance observable without converting an offset by hand.

The server-owned bus run `1786340058047-43196-d49e1c72` recorded the new smooth-recovery assertion as passed. Its six
other failures are pre-existing dirty-lane core-engine, simulation, Warehouse, and map-catalog failures; their exact
result files are listed in that manifest. Browser, HMR, Playwright, and rendered one-window acceptance remain pending
for the user by the contract above.
