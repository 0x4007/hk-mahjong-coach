import { describe, expect, it } from "vitest";

import {
  createFallbackMahjongPhysics,
  createMahjongPhysics,
  createPhysicsBoxSpatialIndex,
  resolvePhysicsBoxGeometrySignature,
  type PhysicsBox,
} from "./mahjong-physics.js";

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
  it("returns nearby colliders in stable source order without scanning distant boxes", () => {
    const near: PhysicsBox = {
      obstacleId: "near",
      center: { x: 3, y: 1, z: 2 },
      halfExtents: { x: 1, y: 1, z: 1 },
    };
    const far: PhysicsBox = {
      obstacleId: "far",
      center: { x: 80, y: 1, z: 80 },
      halfExtents: { x: 1, y: 1, z: 1 },
    };
    const index = createPhysicsBoxSpatialIndex([TEST_COLLIDERS[0]!, near, far]);

    expect(index.query({ x: 0, y: 0, z: 0 }, 4)).toEqual([TEST_COLLIDERS[0]!, near]);
    expect(index.query({ x: 80, y: 0, z: 80 }, 1)).toEqual([far]);
  });

  it("keeps a stable obstacle ID separate from mutable collider geometry", () => {
    const original: PhysicsBox = {
      obstacleId: "streamed-wall",
      center: { x: 1, y: 2, z: 3 },
      halfExtents: { x: 4, y: 5, z: 6 },
      rotationY: Math.PI / 4,
    };
    const moved: PhysicsBox = {
      ...original,
      center: { ...original.center, x: 1.25 },
    };
    const rotated: PhysicsBox = {
      ...original,
      rotationY: Math.PI / 2,
    };

    expect(resolvePhysicsBoxGeometrySignature({ ...original })).toBe(
      resolvePhysicsBoxGeometrySignature(original),
    );
    expect(resolvePhysicsBoxGeometrySignature(moved)).not.toBe(
      resolvePhysicsBoxGeometrySignature(original),
    );
    expect(resolvePhysicsBoxGeometrySignature(rotated)).not.toBe(
      resolvePhysicsBoxGeometrySignature(original),
    );
  });

  it("keeps traversal collisions available in the fallback controller", () => {
    const wall: PhysicsBox = {
      obstacleId: "fallback-wall",
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
      expect(movement.contacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "wall",
            obstacleId: "fallback-wall",
            normal: { x: 0, y: 0, z: 1 },
          }),
          expect.objectContaining({ kind: "support" }),
        ]),
      );
    } finally {
      physics.dispose();
    }
  });

  it("reports ceiling contacts with a normal, point, and obstacle identity", () => {
    const physics = createFallbackMahjongPhysics([
      {
        obstacleId: "ceiling",
        center: { x: 0, y: 2.1, z: 0 },
        halfExtents: { x: 2, y: 0.1, z: 2 },
      },
    ]);
    try {
      const movement = physics.move({ x: 0, y: 1, z: 0 }, { x: 0, y: 0.5, z: 0 });

      expect(movement.contacts).toContainEqual({
        kind: "ceiling",
        normal: { x: 0, y: -1, z: 0 },
        point: { x: 0, y: 2, z: 0 },
        obstacleId: "ceiling",
      });
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
