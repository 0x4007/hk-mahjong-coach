import { describe, expect, it } from "vitest";

import {
  createFallbackMahjongPhysics,
  createMahjongPhysics,
  type PhysicsBox,
} from "./mahjong-physics.js";
import { PLAYER_CAPSULE_HALF_HEIGHT, PLAYER_CAPSULE_RADIUS, WORLD_GRAVITY } from "./world-scale.js";
import { isPlayerTouchingWall } from "./wall-contact.js";
import {
  resolveWallClimbProgress,
  resolveWallClimbTargetAtContact,
  resolveWallClimbVelocity,
} from "./wall-climb.js";

const TEST_COLLIDERS: readonly PhysicsBox[] = [
  {
    center: { x: 0, y: -0.1, z: 0 },
    halfExtents: { x: 60, y: 0.1, z: 52 },
  },
  {
    center: { x: 0, y: 0.39, z: 0 },
    halfExtents: { x: 0.92, y: 0.39, z: 0.92 },
  },
];

describe("mahjong physics", () => {
  it("keeps obstacle collisions available in the fallback controller", () => {
    const wall: PhysicsBox = {
      center: { x: 0, y: 2, z: -4 },
      halfExtents: { x: 0.5, y: 2, z: 0.5 },
    };
    const physics = createFallbackMahjongPhysics([TEST_COLLIDERS[0]!, wall]);
    try {
      const movement = physics.move({ x: 0, y: 0.86, z: -3.2 }, { x: 0, y: 0, z: -0.2 });
      expect(movement.collisions).toBeGreaterThan(0);
      expect(movement.position.z).toBeGreaterThan(-3.77);
      expect(movement.position.z).toBeLessThan(-3.2);
      expect(movement.grounded).toBe(true);
    } finally {
      physics.dispose();
    }
  });

  it("autosteps a low platform instead of turning it into a hard wall", () => {
    const physics = createFallbackMahjongPhysics([
      TEST_COLLIDERS[0]!,
      {
        center: { x: 0, y: 0.11, z: -1 },
        halfExtents: { x: 0.7, y: 0.11, z: 0.7 },
      },
    ]);
    try {
      const movement = physics.move({ x: 0, y: 0.86, z: -0.3 }, { x: 0, y: 0, z: -0.8 });
      expect(movement.position.y).toBeCloseTo(0.22 + 0.86, 5);
      expect(movement.grounded).toBe(true);
    } finally {
      physics.dispose();
    }
  });

  it("resolves a bounded wall pull through the capsule controller", () => {
    const wall: PhysicsBox = {
      center: { x: 0, y: 1, z: 0 },
      halfExtents: { x: 1.5, y: 1, z: 0.12 },
    };
    const floor = TEST_COLLIDERS[0]!;
    const physics = createFallbackMahjongPhysics([floor, wall]);
    const dimensions = { radius: PLAYER_CAPSULE_RADIUS, halfHeight: PLAYER_CAPSULE_HALF_HEIGHT };
    let position = { x: 0, y: 0.86, z: -0.38 };
    let verticalVelocity = 7;
    const resolution = resolveWallClimbTargetAtContact(position, [floor, wall], dimensions);
    expect(resolution).not.toBeNull();
    const targetY = resolution?.targetCenterY ?? 0;
    const startY = position.y;
    let crossedWall = false;
    let maximumHeight = position.y;
    try {
      expect(isPlayerTouchingWall(position, [floor, wall], dimensions)).toBe(true);
      for (let frame = 0; frame < 120; frame += 1) {
        const delta = 1 / 60;
        verticalVelocity -= WORLD_GRAVITY * delta;
        verticalVelocity = resolveWallClimbVelocity({
          currentVelocity: verticalVelocity,
          progress: resolveWallClimbProgress(position.y, startY, targetY),
          deltaSeconds: delta,
        });
        verticalVelocity = Math.min(verticalVelocity, Math.max(0, targetY - position.y) / delta);
        const movement = physics.move(position, {
          x: 0,
          y: verticalVelocity * delta,
          z: 5 * delta,
        });
        position = movement.position;
        maximumHeight = Math.max(maximumHeight, position.y);
        crossedWall ||= position.z > wall.center.z + wall.halfExtents.z + dimensions.radius;
        if (movement.grounded) {
          verticalVelocity = 0;
        }
      }

      expect(maximumHeight).toBeGreaterThan(wall.center.y + wall.halfExtents.y);
      expect(maximumHeight).toBeLessThanOrEqual(targetY + 0.01);
      expect(crossedWall).toBe(true);
    } finally {
      physics.dispose();
    }
  });

  it("slides a player capsule into the table instead of through it", async () => {
    const physics = await createMahjongPhysics(TEST_COLLIDERS);
    try {
      let position = { x: 0, y: 0.86, z: 4.8 };
      for (let step = 0; step < 120; step += 1) {
        position = physics.move(position, { x: 0, y: 0, z: -3.4 / 60 }).position;
      }

      expect(position.z).toBeGreaterThan(1.15);
      expect(position.z).toBeLessThan(1.25);
      expect(physics.move(position, { x: 0, y: 0, z: 0 }).grounded).toBe(true);
    } finally {
      physics.dispose();
    }
  });

  it("replaces streamed colliders without leaving removed geometry behind", async () => {
    const physics = await createMahjongPhysics([TEST_COLLIDERS[0]!]);
    try {
      physics.setDynamicBoxes([TEST_COLLIDERS[1]!]);
      let position = { x: 0, y: 0.86, z: 4.8 };
      for (let step = 0; step < 120; step += 1) {
        position = physics.move(position, { x: 0, y: 0, z: -3.4 / 60 }).position;
      }
      expect(position.z).toBeGreaterThan(1.15);
      expect(position.z).toBeLessThan(1.25);

      physics.setDynamicBoxes([]);
      position = physics.move(position, { x: 0, y: 0, z: -1.5 }).position;
      expect(position.z).toBeLessThan(0);
    } finally {
      physics.dispose();
    }
  });

  it("walks a player capsule up a sloped ramp collider", async () => {
    const rampHeight = 7.5;
    const rampRun = 24;
    const physics = await createMahjongPhysics([
      TEST_COLLIDERS[0]!,
      {
        center: { x: rampRun / 2, y: rampHeight / 2, z: 0 },
        halfExtents: { x: rampRun / 2, y: 0.09, z: 4 },
        rotationZ: -Math.atan2(rampHeight, rampRun),
      },
    ]);
    try {
      let position = { x: rampRun + 1, y: 0.86, z: 0 };
      for (let step = 0; step < 600; step += 1) {
        position = physics.move(position, { x: -3.4 / 60, y: 0, z: 0 }).position;
      }
      expect(position.y).toBeGreaterThan(rampHeight);
    } finally {
      physics.dispose();
    }
  });
});
