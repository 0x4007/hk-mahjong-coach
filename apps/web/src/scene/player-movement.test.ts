import { describe, expect, it } from "vitest";

import { O2_JUMP_COST, PLAYER_MAX_O2 } from "./player-vitals.js";
import {
  PLAYER_AIR_SPEED_RATIO,
  PLAYER_FALLBACK_JUMP_SPEED_RATIO,
  PLAYER_GROUND_RELEASE_RATE,
  PLAYER_GROUND_REVERSE_BRAKE_RATE,
  PLAYER_SLIDE_END_SPEED_METERS_PER_SECOND,
  createPlayerMovementControllerState,
  resolvePlayerHorizontalVelocity,
  resolvePlayerJumpAction,
  stepPlayerMovementController,
  type PlayerMovementControllerInput,
  type PlayerMovementControllerState,
} from "./player-movement.js";
import {
  PLAYER_JUMP_SPEED,
  PLAYER_SPRINT_SPEED_METERS_PER_SECOND,
  PLAYER_TROT_SPEED_METERS_PER_SECOND,
} from "./world-scale.js";

const baseInput = (
  overrides: Partial<PlayerMovementControllerInput> = {},
): PlayerMovementControllerInput => ({
  deltaSeconds: 1 / 60,
  seed: "movement-test",
  direction: { right: 0, forward: 0 },
  currentVelocity: { right: 0, up: 0, forward: 0 },
  grounded: true,
  sprint: false,
  sprintAffordable: true,
  crouch: false,
  jump: false,
  oxygen: PLAYER_MAX_O2,
  ...overrides,
});

const step = (
  state: PlayerMovementControllerState,
  overrides: Partial<PlayerMovementControllerInput> = {},
) => stepPlayerMovementController(state, baseInput(overrides));

describe("pure player movement controller", () => {
  it("accelerates toward a run target instead of changing speed instantly", () => {
    const output = step(createPlayerMovementControllerState("movement-test"), {
      direction: { right: 0, forward: 1 },
    });

    expect(output.desiredVelocity.forward).toBeGreaterThan(0);
    expect(output.desiredVelocity.forward).toBeLessThan(PLAYER_TROT_SPEED_METERS_PER_SECOND);
    expect(output.state.movement).toMatchObject({ kind: "grounded", pace: "run" });
  });

  it("preserves release momentum more strongly than it brakes a reversal", () => {
    const current = { right: 0, forward: PLAYER_TROT_SPEED_METERS_PER_SECOND };
    const released = resolvePlayerHorizontalVelocity(
      current,
      { right: 0, forward: 0 },
      true,
      1 / 60,
      PLAYER_SPRINT_SPEED_METERS_PER_SECOND,
    );
    const reversed = resolvePlayerHorizontalVelocity(
      current,
      { right: 0, forward: -PLAYER_TROT_SPEED_METERS_PER_SECOND },
      true,
      1 / 60,
      PLAYER_SPRINT_SPEED_METERS_PER_SECOND,
    );

    expect(PLAYER_GROUND_REVERSE_BRAKE_RATE).toBeGreaterThan(PLAYER_GROUND_RELEASE_RATE);
    expect(released.forward).toBeGreaterThan(reversed.forward);
    expect(released.forward).toBeGreaterThan(PLAYER_TROT_SPEED_METERS_PER_SECOND * 0.9);
  });

  it("normalizes diagonal input and clamps ground and air speed separately", () => {
    const grounded = step(createPlayerMovementControllerState("movement-test"), {
      direction: { right: 1, forward: 1 },
      sprint: true,
      targetSpeedMetersPerSecond: PLAYER_SPRINT_SPEED_METERS_PER_SECOND,
    });
    const airborne = step(createPlayerMovementControllerState("movement-test", false), {
      grounded: false,
      direction: { right: 1, forward: 1 },
      sprint: true,
      currentVelocity: {
        right: PLAYER_SPRINT_SPEED_METERS_PER_SECOND,
        up: 0,
        forward: PLAYER_SPRINT_SPEED_METERS_PER_SECOND,
      },
      targetSpeedMetersPerSecond: PLAYER_SPRINT_SPEED_METERS_PER_SECOND,
    });

    expect(grounded.desiredVelocity.right).toBeCloseTo(grounded.desiredVelocity.forward, 12);
    expect(
      Math.hypot(airborne.desiredVelocity.right, airborne.desiredVelocity.forward),
    ).toBeLessThanOrEqual(PLAYER_SPRINT_SPEED_METERS_PER_SECOND * PLAYER_AIR_SPEED_RATIO);
  });

  it("is frame-rate independent for a constant acceleration target", () => {
    const integrate = (deltaSeconds: number, frames: number): number => {
      let velocity = { right: 0, forward: 0 };
      for (let frame = 0; frame < frames; frame += 1) {
        velocity = resolvePlayerHorizontalVelocity(
          velocity,
          { right: 0, forward: PLAYER_TROT_SPEED_METERS_PER_SECOND },
          true,
          deltaSeconds,
          PLAYER_TROT_SPEED_METERS_PER_SECOND,
        );
      }
      return velocity.forward;
    };

    expect(integrate(1 / 60, 60)).toBeCloseTo(integrate(1 / 120, 120), 10);
  });

  it("keeps the whole controller equivalent at 60 and 120 Hz", () => {
    const simulate = (deltaSeconds: number, frames: number): number => {
      let state = createPlayerMovementControllerState("movement-test");
      let velocity = { right: 0, up: 0, forward: 0 };
      for (let frame = 0; frame < frames; frame += 1) {
        const output = step(state, {
          deltaSeconds,
          direction: { right: 0.4, forward: 0.8 },
          currentVelocity: velocity,
          sprint: true,
          targetSpeedMetersPerSecond: PLAYER_SPRINT_SPEED_METERS_PER_SECOND,
        });
        state = output.state;
        velocity = output.desiredVelocity;
      }
      return Math.hypot(velocity.right, velocity.forward);
    };

    expect(simulate(1 / 60, 60)).toBeCloseTo(simulate(1 / 120, 120), 10);
  });

  it("applies partial analogue magnitude once", () => {
    const state = createPlayerMovementControllerState("movement-test");
    const half = step(state, { direction: { right: 0.5, forward: 0 } });
    const full = step(state, { direction: { right: 1, forward: 0 } });

    expect(half.desiredVelocity.right / full.desiredVelocity.right).toBeCloseTo(0.5, 12);
  });

  it("treats a caller target speed as a cap below controller-owned movement limits", () => {
    const state = createPlayerMovementControllerState("movement-test");
    const direction = { right: 0, forward: 1 } as const;
    const oversizedCrouch = step(state, {
      crouch: true,
      direction,
      targetSpeedMetersPerSecond: PLAYER_SPRINT_SPEED_METERS_PER_SECOND,
    });
    const controllerCrouch = step(state, { crouch: true, direction });
    const oversizedWalk = step(state, {
      walking: true,
      direction,
      targetSpeedMetersPerSecond: PLAYER_SPRINT_SPEED_METERS_PER_SECOND,
    });
    const controllerWalk = step(state, { walking: true, direction });
    const unaffordableSprint = step(state, {
      sprint: true,
      sprintAffordable: false,
      direction,
      targetSpeedMetersPerSecond: PLAYER_SPRINT_SPEED_METERS_PER_SECOND,
    });
    const controllerRun = step(state, { direction });
    const lowerCallerCap = step(state, {
      direction,
      targetSpeedMetersPerSecond: 1,
    });

    expect(oversizedCrouch.desiredVelocity.forward).toBe(controllerCrouch.desiredVelocity.forward);
    expect(oversizedWalk.desiredVelocity.forward).toBe(controllerWalk.desiredVelocity.forward);
    expect(unaffordableSprint.desiredVelocity.forward).toBe(controllerRun.desiredVelocity.forward);
    expect(lowerCallerCap.desiredVelocity.forward).toBeLessThan(
      controllerRun.desiredVelocity.forward,
    );
  });

  it("resolves full and fallback jumps deterministically at full, partial, and zero reserve", () => {
    const full = resolvePlayerJumpAction(PLAYER_MAX_O2);
    const partial = resolvePlayerJumpAction(O2_JUMP_COST - 0.001);
    const empty = resolvePlayerJumpAction(0);

    expect(full).toEqual({
      kind: "full",
      launchSpeed: PLAYER_JUMP_SPEED,
      oxygenCost: O2_JUMP_COST,
    });
    expect(partial).toEqual(empty);
    expect(empty).toEqual({
      kind: "fallback",
      launchSpeed: PLAYER_JUMP_SPEED * PLAYER_FALLBACK_JUMP_SPEED_RATIO,
      oxygenCost: 0,
    });
    expect(resolvePlayerJumpAction(O2_JUMP_COST).kind).toBe("full");
    expect(PLAYER_FALLBACK_JUMP_SPEED_RATIO).toBe(12 / 17);
  });

  it("keeps accepted full and fallback launches airborne on their launch frame", () => {
    const full = step(createPlayerMovementControllerState("movement-test"), {
      jump: true,
      oxygen: PLAYER_MAX_O2,
    });
    const fallback = step(createPlayerMovementControllerState("movement-test"), {
      jump: true,
      oxygen: 0,
    });

    expect(full.state.movement).toMatchObject({ kind: "airborne", posture: "standing" });
    expect(fallback.state.movement).toMatchObject({ kind: "airborne", posture: "standing" });
    expect(full.jumpAction?.kind).toBe("full");
    expect(fallback.jumpAction?.kind).toBe("fallback");
  });

  it("always permits standing and crouching at zero O2", () => {
    const crouched = step(createPlayerMovementControllerState("movement-test"), {
      crouch: true,
      oxygen: 0,
    });
    const standing = step(crouched.state, {
      crouch: false,
      oxygen: 0,
    });

    expect(crouched.posture).toBe("crouching");
    expect(standing.posture).toBe("standing");
    expect(standing.state.movement).toMatchObject({ kind: "grounded", posture: "standing" });
  });

  it("latches a held jump through landing and requires another press", () => {
    const initial = createPlayerMovementControllerState("movement-test");
    const launched = step(initial, { jump: true, grounded: true });
    const airborne = step(launched.state, {
      jump: true,
      grounded: false,
      currentVelocity: launched.desiredVelocity,
    });
    const landedWhileHeld = step(airborne.state, {
      jump: true,
      grounded: true,
      currentVelocity: { right: 0, up: -5, forward: 0 },
    });
    const released = step(landedWhileHeld.state, { jump: false, grounded: true });
    const pressedAgain = step(released.state, { jump: true, grounded: true });

    expect(launched.jumpAction?.kind).toBe("full");
    expect(airborne.jumpAction).toBeNull();
    expect(landedWhileHeld.jumpAction).toBeNull();
    expect(pressedAgain.jumpAction?.kind).toBe("full");
  });

  it("starts and ends a sprint slide as a typed state with deterministic events", () => {
    const sprinting: PlayerMovementControllerState = {
      ...createPlayerMovementControllerState("movement-test"),
      movement: { kind: "grounded", posture: "standing", pace: "sprint" },
    };
    const started = step(sprinting, {
      crouch: true,
      sprint: true,
      currentVelocity: {
        right: 0,
        up: 0,
        forward: PLAYER_SPRINT_SPEED_METERS_PER_SECOND,
      },
    });
    const ended = step(started.state, {
      crouch: true,
      currentVelocity: {
        right: 0,
        up: 0,
        forward: PLAYER_SLIDE_END_SPEED_METERS_PER_SECOND * 0.9,
      },
    });

    expect(started.state.movement.kind).toBe("slide");
    expect(started.events).toContainEqual({ kind: "slide-start" });
    expect(ended.events).toContainEqual({ kind: "slide-end" });
    expect(ended.state.movement).toMatchObject({ kind: "grounded", posture: "crouching" });
  });

  it("starts traversal only from validated contextual geometry", () => {
    const airborne = createPlayerMovementControllerState("movement-test", false);
    const invalid = step(airborne, {
      phase: "post-physics",
      grounded: false,
      jump: true,
      direction: { right: 0, forward: 1 },
      contacts: [
        {
          kind: "vault",
          normal: { x: 0, y: 0, z: 1 },
          obstacle: { id: "blocked", topY: 1, clearanceValid: false },
        },
      ],
    });
    const valid = step(airborne, {
      phase: "post-physics",
      grounded: false,
      jump: true,
      direction: { right: 0, forward: 1 },
      contacts: [
        {
          kind: "ledge",
          normal: { x: 0, y: 0, z: 1 },
          obstacle: { id: "ledge-1", topY: 1.5, clearanceValid: true },
          target: { x: 0, y: 2.36, z: -1 },
        },
      ],
    });

    expect(invalid.traversalRequest).toBeNull();
    expect(valid.traversalRequest).toMatchObject({
      kind: "ledge-grab",
      obstacle: { id: "ledge-1" },
    });
    expect(valid.events).toContainEqual({ kind: "ledge-grab", obstacleId: "ledge-1" });
  });

  it("cancels lost traversal contact and completes valid traversal explicitly", () => {
    const traversing: PlayerMovementControllerState = {
      ...createPlayerMovementControllerState("movement-test", false),
      movement: { kind: "vault", progress: 0.5 },
    };
    const cancelled = step(traversing, {
      grounded: false,
      externalTraversal: {
        kind: "vault",
        obstacleId: "vault-1",
        progress: 0.5,
        contactValid: false,
      },
    });
    const completed = step(traversing, {
      grounded: true,
      externalTraversal: {
        kind: "vault",
        obstacleId: "vault-1",
        progress: 1,
        contactValid: true,
        completed: true,
      },
    });

    expect(cancelled.events).toContainEqual({ kind: "traversal-cancel", traversal: "vault" });
    expect(cancelled.state.movement.kind).toBe("airborne");
    expect(completed.events).toContainEqual({
      kind: "traversal-complete",
      traversal: "vault",
    });
    expect(completed.state.movement.kind).toBe("landing-recovery");
  });

  it("keeps a wall hang through release and requests a climb only after a fresh press", () => {
    const initial = createPlayerMovementControllerState("movement-test", false);
    const preContact = step(initial, {
      grounded: false,
      jump: true,
      direction: { right: 0, forward: 1 },
    });
    const contact = stepPlayerMovementController(
      preContact.state,
      baseInput({
        phase: "post-physics",
        grounded: false,
        jump: true,
        direction: { right: 0, forward: 1 },
        contacts: [
          {
            kind: "wall",
            normal: { x: 0, y: 0, z: 1 },
            obstacle: { id: "wall-1", topY: 2.4, clearanceValid: true },
          },
        ],
      }),
    );
    const held = step(contact.state, {
      grounded: false,
      jump: true,
      externalTraversal: {
        kind: "wall-contact",
        obstacleId: "wall-1",
        progress: 0.5,
        contactValid: true,
      },
    });
    const released = step(held.state, {
      grounded: false,
      jump: false,
      externalTraversal: {
        kind: "wall-contact",
        obstacleId: "wall-1",
        progress: 0.6,
        contactValid: true,
      },
    });
    const repressed = step(released.state, {
      grounded: false,
      jump: true,
      externalTraversal: {
        kind: "wall-contact",
        obstacleId: "wall-1",
        progress: 0.7,
        contactValid: true,
      },
    });

    expect(contact.state.movement.kind).toBe("wall-contact");
    expect(held.events).not.toContainEqual({
      kind: "wall-climb-request",
      obstacleId: "wall-1",
    });
    expect(released.state.movement.kind).toBe("wall-contact");
    expect(repressed.events).toContainEqual({
      kind: "wall-climb-request",
      obstacleId: "wall-1",
    });
    expect(repressed.state.movement.kind).toBe("wall-contact");
  });

  it("cancels an external traversal whose obstacle identity changed", () => {
    const traversing: PlayerMovementControllerState = {
      ...createPlayerMovementControllerState("movement-test", false),
      movement: { kind: "vault", progress: 0.5 },
      traversalObstacleId: "vault-1",
    };
    const output = step(traversing, {
      grounded: false,
      externalTraversal: {
        kind: "vault",
        obstacleId: "vault-2",
        progress: 0.6,
        contactValid: true,
      },
    });

    expect(output.events).toContainEqual({ kind: "traversal-cancel", traversal: "vault" });
    expect(output.state.traversalObstacleId).toBeNull();
  });
});
