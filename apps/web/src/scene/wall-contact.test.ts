import { describe, expect, it } from "vitest";

import { isPlayerTouchingWall } from "./wall-contact.js";
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
});
