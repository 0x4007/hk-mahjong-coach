import { describe, expect, it } from "vitest";

import {
  resolveWallClimbForce,
  resolveWallClimbProfile,
  resolveWallClimbProgress,
  resolveWallClimbTargetAtContact,
  resolveWallClimbVelocity,
} from "./wall-climb.js";
import type { PhysicsBox } from "./mahjong-physics.js";
import {
  PLAYER_CAPSULE_CENTER_HEIGHT,
  PLAYER_CAPSULE_HALF_HEIGHT,
  PLAYER_CAPSULE_RADIUS,
  PLAYER_WALL_CLIMB_TOP_CLEARANCE,
} from "./world-scale.js";

const CAPSULE = {
  radius: PLAYER_CAPSULE_RADIUS,
  halfHeight: PLAYER_CAPSULE_HALF_HEIGHT,
} as const;

describe("bounded wall-climb profile", () => {
  it("starts and ends slowly with a midpoint peak near four metres per second", () => {
    const samples = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1].map(resolveWallClimbProfile);
    expect(samples[0]).toBeCloseTo(0, 8);
    expect(samples[3]).toBeCloseTo(4, 8);
    expect(samples[6]).toBeCloseTo(0, 8);
    expect(samples[1]).toBeLessThan(samples[2] ?? 0);
    expect(samples[2]).toBeLessThan(samples[3] ?? 0);
    expect(samples[3]).toBeGreaterThan(samples[4] ?? 0);
    expect(samples[4]).toBeGreaterThan(samples[5] ?? 0);
  });

  it("keeps velocity changes continuous and force bounded", () => {
    const delta = 1 / 60;
    let velocity = 0;
    let previous = velocity;
    for (let index = 0; index <= 60; index += 1) {
      const progress = index / 60;
      velocity = resolveWallClimbVelocity({
        currentVelocity: velocity,
        progress,
        deltaSeconds: delta,
      });
      expect(Math.abs(velocity - previous)).toBeLessThanOrEqual(72 * delta + 1e-8);
      previous = velocity;
      const force = resolveWallClimbForce({
        currentVelocity: index === 0 ? 12 : velocity,
        progress,
        deltaSeconds: delta,
      });
      expect(Math.abs(force)).toBeLessThanOrEqual(72 + 1e-8);
    }
  });

  it("absorbs inherited upward speed instead of adding a launch", () => {
    const nextVelocity = resolveWallClimbVelocity({
      currentVelocity: 10,
      progress: 0,
      deltaSeconds: 1 / 60,
    });
    expect(nextVelocity).toBeLessThan(10);
    expect(nextVelocity).toBeGreaterThan(0);
  });

  it("resolves ordinary wall top height and capsule clearance", () => {
    const wall: PhysicsBox = {
      center: { x: 0, y: 1, z: 0 },
      halfExtents: { x: 2, y: 1, z: 0.12 },
    };
    const resolution = resolveWallClimbTargetAtContact(
      { x: 0, y: 0.86, z: -0.38 },
      [wall],
      CAPSULE,
    );
    expect(resolution).not.toBeNull();
    expect(resolution?.wallTopY).toBeCloseTo(2, 8);
    expect(resolution?.targetCenterY).toBeCloseTo(
      2 + PLAYER_CAPSULE_CENTER_HEIGHT + PLAYER_WALL_CLIMB_TOP_CLEARANCE,
      8,
    );
  });

  it("resolves yaw-rotated wall top height in the collider's local frame", () => {
    const wall: PhysicsBox = {
      center: { x: 0, y: 1, z: 0 },
      halfExtents: { x: 2, y: 1, z: 0.12 },
      rotationY: Math.PI / 4,
    };
    const localContact = { x: 0, z: -0.38 };
    const resolution = resolveWallClimbTargetAtContact(
      {
        x: Math.cos(Math.PI / 4) * localContact.x - Math.sin(Math.PI / 4) * localContact.z,
        y: 0.86,
        z: Math.sin(Math.PI / 4) * localContact.x + Math.cos(Math.PI / 4) * localContact.z,
      },
      [wall],
      CAPSULE,
    );
    expect(resolution).not.toBeNull();
    expect(resolution?.wallTopY).toBeCloseTo(2, 8);
    expect(resolution?.target.y).toBeCloseTo(
      2 + PLAYER_CAPSULE_CENTER_HEIGHT + PLAYER_WALL_CLIMB_TOP_CLEARANCE,
      8,
    );
  });

  it("clamps progress to a finite interval", () => {
    expect(resolveWallClimbProgress(-100, 0, 2)).toBe(0);
    expect(resolveWallClimbProgress(100, 0, 2)).toBe(1);
    expect(resolveWallClimbProgress(1, 0, 2)).toBeCloseTo(0.5, 8);
  });
});
