import { describe, expect, it } from "vitest";

import {
  clampPlayerPositionToWallTangent,
  isPlayerTouchingWall,
  isPlayerFacingWall,
  PLAYER_WALL_COVER_RANGE_METERS,
  projectPlayerMovementToWallTangent,
  resolvePlayerWallContact,
  resolvePlayerWallContactInFacingCone,
  resolvePlayerWallSnapDelta,
  resolvePlayerWallSnapTarget,
} from "./wall-contact.js";
import type { PhysicsBox } from "./mahjong-physics.js";

const CAPSULE = { radius: 0.26, halfHeight: 0.6 } as const;

const wall: PhysicsBox = {
  center: { x: 0, y: 2, z: -2 },
  halfExtents: { x: 2, y: 2, z: 0.12 },
};

describe("player wall contact", () => {
  it("recognizes the controller gap at an axis-aligned wall", () => {
    expect(isPlayerTouchingWall({ x: 0, y: 0.86, z: -2.39 }, [wall], CAPSULE)).toBe(true);
  });

  it("does not brace while standing on a floor or platform", () => {
    const floor: PhysicsBox = {
      center: { x: 0, y: -0.1, z: 0 },
      halfExtents: { x: 10, y: 0.1, z: 10 },
    };
    const platform: PhysicsBox = {
      center: { x: 0, y: 0.36, z: 0 },
      halfExtents: { x: 2, y: 0.36, z: 2 },
    };
    expect(isPlayerTouchingWall({ x: 0, y: 0.86, z: 0 }, [floor], CAPSULE)).toBe(false);
    expect(isPlayerTouchingWall({ x: 0, y: 1.58, z: 0 }, [platform], CAPSULE)).toBe(false);
  });

  it("supports yaw-rotated walls and rejects sloped surfaces", () => {
    const rotatedWall: PhysicsBox = {
      ...wall,
      center: { x: 2, y: 2, z: 0 },
      rotationY: Math.PI / 4,
    };
    const ramp: PhysicsBox = {
      ...wall,
      rotationZ: 0.2,
    };
    expect(isPlayerTouchingWall({ x: 1.49, y: 0.86, z: -0.51 }, [rotatedWall], CAPSULE)).toBe(true);
    expect(isPlayerTouchingWall({ x: 0, y: 0.86, z: -2.39 }, [ramp], CAPSULE)).toBe(false);
  });

  it("returns false for a nearby but non-contacting wall", () => {
    expect(isPlayerTouchingWall({ x: 0, y: 0.86, z: -2.7 }, [wall], CAPSULE)).toBe(false);
  });

  it("finds a cover wall within the two-metre area of effect", () => {
    const near = resolvePlayerWallContact(
      { x: 0, y: 0.86, z: -4.37 },
      [wall],
      CAPSULE,
      PLAYER_WALL_COVER_RANGE_METERS,
    );
    const far = resolvePlayerWallContact(
      { x: 0, y: 0.86, z: -4.39 },
      [wall],
      CAPSULE,
      PLAYER_WALL_COVER_RANGE_METERS,
    );

    expect(near?.distance).toBeCloseTo(1.99, 8);
    expect(far).toBeNull();
  });

  it("accepts only the 90-degree wall-facing cone", () => {
    const contact = resolvePlayerWallContact({ x: 0, y: 0.86, z: -2.39 }, [wall], CAPSULE);
    expect(contact).not.toBeNull();
    if (contact === null) {
      return;
    }

    expect(isPlayerFacingWall({ x: 0, y: 0, z: 1 }, contact)).toBe(true);
    expect(isPlayerFacingWall({ x: 1, y: 0, z: 0 }, contact)).toBe(false);
    expect(isPlayerFacingWall({ x: 0, y: 0, z: -1 }, contact)).toBe(false);
    expect(isPlayerFacingWall({ x: 0, y: 0, z: 0 }, contact)).toBe(false);
    expect(isPlayerFacingWall({ x: Math.SQRT1_2, y: 0, z: Math.SQRT1_2 }, contact)).toBe(true);
    expect(isPlayerFacingWall({ x: Math.sqrt(3) / 2, y: 0, z: 0.5 }, contact)).toBe(false);
  });

  it("does not select a parallel or rear wall as the cover source", () => {
    const position = { x: 0, y: 0.86, z: -2.39 };
    expect(
      resolvePlayerWallContactInFacingCone(position, { x: 1, y: 0, z: 0 }, [wall], CAPSULE),
    ).toBeNull();
    expect(
      resolvePlayerWallContactInFacingCone(position, { x: 0, y: 0, z: -1 }, [wall], CAPSULE),
    ).toBeNull();
    expect(
      resolvePlayerWallContactInFacingCone(position, { x: 0, y: 0, z: 1 }, [wall], CAPSULE),
    ).not.toBeNull();
  });

  it("snaps the capsule to the wall face and moves no faster than sprint speed", () => {
    const position = { x: 0, y: 0.86, z: -3 };
    const contact = resolvePlayerWallContact(
      position,
      [wall],
      CAPSULE,
      PLAYER_WALL_COVER_RANGE_METERS,
    );
    expect(contact).not.toBeNull();
    if (contact === null) {
      return;
    }

    const target = resolvePlayerWallSnapTarget(position, contact, CAPSULE);
    expect(target.x).toBeCloseTo(0, 8);
    expect(target.z).toBeCloseTo(-2.39, 8);

    const step = resolvePlayerWallSnapDelta(position, target, 10, 0.05);
    expect(Math.hypot(step.x, step.z)).toBeCloseTo(0.5, 8);
    expect(step.z).toBeGreaterThan(0);
  });

  it("limits cover strafe to the wall face while preserving the normal position", () => {
    const contact = resolvePlayerWallContact({ x: 0, y: 0.86, z: -2.39 }, [wall], CAPSULE);
    expect(contact).not.toBeNull();
    if (contact === null) {
      return;
    }

    expect(contact.tangentLimit).toBeCloseTo(1.705, 8);
    const clamped = clampPlayerPositionToWallTangent({ x: 4, y: 0.86, z: -2.39 }, contact);
    expect(clamped.x).toBeCloseTo(contact.tangentLimit, 8);
    expect(clamped.z).toBeCloseTo(-2.39, 8);
  });

  it("uses the rotated wall tangent when limiting cover strafe", () => {
    const rotatedWall: PhysicsBox = {
      ...wall,
      center: { x: 2, y: 2, z: 0 },
      rotationY: Math.PI / 4,
    };
    const contact = resolvePlayerWallContact(
      { x: 1.49, y: 0.86, z: -0.51 },
      [rotatedWall],
      CAPSULE,
    );
    expect(contact).not.toBeNull();
    if (contact === null) {
      return;
    }

    const beyondEnd = {
      x: rotatedWall.center.x + contact.tangent.x * 4 + contact.normal.x * 0.39,
      y: 0.86,
      z: rotatedWall.center.z + contact.tangent.z * 4 + contact.normal.z * 0.39,
    };
    const clamped = clampPlayerPositionToWallTangent(beyondEnd, contact);
    const tangentCoordinate =
      (clamped.x - rotatedWall.center.x) * contact.tangent.x +
      (clamped.z - rotatedWall.center.z) * contact.tangent.z;
    expect(tangentCoordinate).toBeCloseTo(contact.tangentLimit, 8);
    expect(
      (clamped.x - beyondEnd.x) * contact.normal.x + (clamped.z - beyondEnd.z) * contact.normal.z,
    ).toBeCloseTo(0, 8);
  });

  it("projects cover movement onto the wall tangent", () => {
    const contact = resolvePlayerWallContact({ x: 0, y: 0.86, z: -2.39 }, [wall], CAPSULE);
    expect(contact).not.toBeNull();
    if (contact === null) {
      return;
    }

    const projected = projectPlayerMovementToWallTangent({ x: 1.5, y: 0, z: -0.75 }, contact);
    expect(projected.x).toBeCloseTo(1.5, 8);
    expect(projected.z).toBeCloseTo(0, 8);
  });
});
