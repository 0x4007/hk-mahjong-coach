import { describe, expect, it } from "vitest";

import { createMahjongPhysics, type PhysicsBox } from "./mahjong-physics.js";

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
