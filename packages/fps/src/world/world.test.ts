import { describe, expect, it } from "vitest";

import {
  allChunkCoords,
  buildChunkCollision,
  buildChunkGeometry,
  ChunkManager,
  combatRouteBounds,
  createWorldDebugState,
  deriveChunkPlan,
  generateWorldPlan,
  neighboringChunkEdgeSignaturesMatch,
  validateWorldPlan,
  type ChunkCoord,
} from "./index.js";

const chunkKey = (coord: ChunkCoord): string => `${String(coord.x)}:${String(coord.z)}`;

const roadCorridorBounds = (
  road: ReturnType<typeof generateWorldPlan>["roads"][number],
  sidewalkWidthM: number,
) => {
  const halfWidth = road.widthM / 2 + sidewalkWidthM;
  const horizontal = Math.abs(road.start.z - road.end.z) < 1e-9;
  return horizontal
    ? {
        minX: Math.min(road.start.x, road.end.x),
        maxX: Math.max(road.start.x, road.end.x),
        minZ: road.start.z - halfWidth,
        maxZ: road.start.z + halfWidth,
      }
    : {
        minX: road.start.x - halfWidth,
        maxX: road.start.x + halfWidth,
        minZ: Math.min(road.start.z, road.end.z),
        maxZ: Math.max(road.start.z, road.end.z),
      };
};

const intersectsBounds = (
  left: { minX: number; maxX: number; minZ: number; maxZ: number },
  right: { minX: number; maxX: number; minZ: number; maxZ: number },
): boolean =>
  left.minX < right.maxX &&
  left.maxX > right.minX &&
  left.minZ < right.maxZ &&
  left.maxZ > right.minZ;

const overlapArea = (
  left: { minX: number; maxX: number; minZ: number; maxZ: number },
  right: { minX: number; maxX: number; minZ: number; maxZ: number },
): number =>
  Math.max(0, Math.min(left.maxX, right.maxX) - Math.max(left.minX, right.minX)) *
  Math.max(0, Math.min(left.maxZ, right.maxZ) - Math.max(left.minZ, right.minZ));

describe("procedural FPS world plan", () => {
  it("creates the bounded kilometer world and competitive district", () => {
    const plan = generateWorldPlan("world-shape");

    expect(plan.config.worldSizeM).toBe(1_000);
    expect(plan.config.chunkSizeM).toBe(50);
    expect(plan.config.layoutCellSizeM).toBe(5);
    expect(plan.bounds).toEqual({ minX: -500, maxX: 500, minZ: -500, maxZ: 500 });
    expect(plan.chunksPerAxis).toBe(20);
    expect(allChunkCoords(plan.config)).toHaveLength(400);
    expect(plan.blocks).toHaveLength(100);
    expect(plan.parcels).toHaveLength(400);
    const authoredBuildings = plan.buildingParts.filter((part) => part.kind === "building");
    const buildingsById = new Map(authoredBuildings.map((building) => [building.id, building]));
    expect(plan.buildingWindows.length).toBeGreaterThan(authoredBuildings.length);
    expect(plan.buildingStairwells).toHaveLength(authoredBuildings.length);
    expect(
      plan.buildingStairwells.every(
        (stairwell) =>
          stairwell.flights.length > 0 &&
          stairwell.landings.length > 0 &&
          stairwell.roofHeightM > stairwell.floorHeightM,
      ),
    ).toBe(true);
    expect(
      plan.buildingStairwells.every((stairwell) => {
        const building = buildingsById.get(stairwell.buildingId);
        const finalLanding = stairwell.landings[stairwell.landings.length - 1];
        return (
          building !== undefined &&
          finalLanding.heightM === stairwell.roofHeightM &&
          overlapArea(finalLanding.bounds, building.bounds) > 0
        );
      }),
    ).toBe(true);
    expect(
      plan.blocks.every((block) =>
        plan.roads.every(
          (road) =>
            !intersectsBounds(block.bounds, roadCorridorBounds(road, plan.config.sidewalkWidthM)),
        ),
      ),
    ).toBe(true);
    expect(
      plan.buildingParts
        .filter((part) => part.kind === "building")
        .every((part) =>
          plan.roads.every(
            (road) =>
              !intersectsBounds(part.bounds, roadCorridorBounds(road, plan.config.sidewalkWidthM)),
          ),
        ),
    ).toBe(true);
    expect(plan.combatDistrict.bounds.maxX - plan.combatDistrict.bounds.minX).toBe(300);
    expect(plan.combatDistrict.bounds.maxZ - plan.combatDistrict.bounds.minZ).toBe(300);
    expect(plan.combatDistrict.chunkSize).toBe(6);
    expect(plan.combatDistrict.chunkMin.x).toBeGreaterThanOrEqual(2);
    expect(plan.combatDistrict.chunkMin.z).toBeGreaterThanOrEqual(2);
    expect(plan.combatDistrict.chunkMin.x + plan.combatDistrict.chunkSize).toBeLessThanOrEqual(18);
    expect(plan.combatDistrict.chunkMin.z + plan.combatDistrict.chunkSize).toBeLessThanOrEqual(18);
    expect(plan.combatDistrict.nodes.filter((node) => node.kind === "objective-a")).toHaveLength(1);
    expect(plan.combatDistrict.nodes.filter((node) => node.kind === "objective-b")).toHaveLength(1);
    expect(plan.combatDistrict.nodes.filter((node) => node.kind === "attacker-spawn")).toHaveLength(
      1,
    );
    expect(plan.combatDistrict.nodes.filter((node) => node.kind === "defender-spawn")).toHaveLength(
      1,
    );
    expect(
      plan.combatDistrict.edges.filter((edge) => edge.routeRole === "a-side"),
    ).not.toHaveLength(0);
    expect(
      plan.combatDistrict.edges.filter((edge) => edge.routeRole === "middle"),
    ).not.toHaveLength(0);
    expect(
      plan.combatDistrict.edges.filter((edge) => edge.routeRole === "b-side"),
    ).not.toHaveLength(0);
    expect(plan.combatDistrict.edges.some((edge) => edge.routeRole === "flank")).toBe(true);
    for (const objectiveId of ["objective-a", "objective-b"]) {
      const degree = plan.combatDistrict.validation.nodeDegrees[objectiveId] ?? 0;
      expect(degree).toBeGreaterThanOrEqual(2);
      expect(degree).toBeLessThanOrEqual(3);
    }
    expect(plan.combatDistrict.validation.valid).toBe(true);
    expect(plan.validation.valid).toBe(true);
    expect(
      plan.combatDistrict.obstacles.every((obstacle) =>
        plan.combatDistrict.edges.every((edge) =>
          combatRouteBounds(edge, 1.5).every((route) => !intersectsBounds(obstacle.bounds, route)),
        ),
      ),
    ).toBe(true);
    expect(plan.combatDistrict.validation.travel.defenderToASeconds).toBeGreaterThanOrEqual(2);
    expect(plan.combatDistrict.validation.travel.attackerToASeconds).toBeGreaterThanOrEqual(
      plan.combatDistrict.validation.travel.defenderToASeconds + 2,
    );
    expect(plan.combatDistrict.validation.travel.attackerToASeconds).toBeLessThanOrEqual(
      plan.combatDistrict.validation.travel.defenderToASeconds + 5,
    );
    expect(plan.combatDistrict.validation.travel.firstContactSeconds).toBeGreaterThanOrEqual(10);
    expect(plan.combatDistrict.validation.travel.firstContactSeconds).toBeLessThanOrEqual(20);
    expect(plan.combatDistrict.validation.travel.siteToSiteSeconds).toBeGreaterThanOrEqual(15);
    expect(plan.combatDistrict.validation.travel.siteToSiteSeconds).toBeLessThanOrEqual(30);
    expect(plan.combatDistrict.validation.visibility.maximumVisibleNodeId).not.toBe(
      "attacker-spawn",
    );
    expect(plan.combatDistrict.validation.visibility.maximumVisibleShare).toBeLessThanOrEqual(0.3);
    validateWorldPlan(plan);
  });

  it("derives a non-default world and chunk grid from the same planner", () => {
    const plan = generateWorldPlan({
      seed: "non-default-world",
      worldSizeM: 800,
      chunkSizeM: 50,
      layoutCellSizeM: 5,
      streetPitchM: 80,
      arterialPitchM: 160,
      streetWidthM: 8,
      arterialWidthM: 12,
      sidewalkWidthM: 2.5,
      combatDistrictSizeM: 300,
      combatGraphSnapM: 10,
    });
    expect(plan.bounds).toEqual({ minX: -400, maxX: 400, minZ: -400, maxZ: 400 });
    expect(plan.chunksPerAxis).toBe(16);
    expect(allChunkCoords(plan.config)).toHaveLength(256);
    expect(plan.combatDistrict.chunkSize).toBe(6);
    expect(plan.validation.valid).toBe(true);
    validateWorldPlan(plan);
  });

  it("rejects an uncalibrated competitive district size", () => {
    expect(() =>
      generateWorldPlan({ seed: "unsupported-district", combatDistrictSizeM: 250 }),
    ).toThrow("world_config_combat_district_size_unsupported");
  });

  it("is byte-stable and independent of chunk access order", () => {
    const first = generateWorldPlan("stable-world");
    const second = generateWorldPlan("stable-world");
    const different = generateWorldPlan("different-world");

    expect(first.planHash).toBe(second.planHash);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.planHash).not.toBe(different.planHash);

    const coords = allChunkCoords(first.config);
    const forward = new Map(
      coords.map((coord) => [chunkKey(coord), deriveChunkPlan(first, coord).planHash]),
    );
    const reverse = new Map(
      [...coords]
        .reverse()
        .map((coord) => [chunkKey(coord), deriveChunkPlan(first, coord).planHash]),
    );
    expect([...coords].map((coord) => reverse.get(chunkKey(coord)))).toEqual(
      [...coords].map((coord) => forward.get(chunkKey(coord))),
    );
  });

  it("keeps every neighbouring chunk edge signature identical", () => {
    const plan = generateWorldPlan("world-seams");
    const nodeOwners = new Map<string, number>();
    for (let z = 0; z < plan.chunksPerAxis; z += 1) {
      for (let x = 0; x < plan.chunksPerAxis; x += 1) {
        const current = deriveChunkPlan(plan, { x, z });
        for (const feature of current.combatFeatures) {
          if (feature.kind !== "node") continue;
          nodeOwners.set(feature.id, (nodeOwners.get(feature.id) ?? 0) + 1);
        }
        if (x < plan.chunksPerAxis - 1) {
          const east = deriveChunkPlan(plan, { x: x + 1, z });
          expect(
            current.buildingParts.every((left) =>
              east.buildingParts.every((right) => overlapArea(left.bounds, right.bounds) === 0),
            ),
          ).toBe(true);
          expect(neighboringChunkEdgeSignaturesMatch(current, east, "east")).toBe(true);
        }
        if (z < plan.chunksPerAxis - 1) {
          const north = deriveChunkPlan(plan, { x, z: z + 1 });
          expect(
            current.buildingParts.every((left) =>
              north.buildingParts.every((right) => overlapArea(left.bounds, right.bounds) === 0),
            ),
          ).toBe(true);
          expect(neighboringChunkEdgeSignaturesMatch(current, north, "north")).toBe(true);
        }
      }
    }
    expect([...nodeOwners.values()].every((count) => count === 1)).toBe(true);
  });

  it("returns a valid deterministic plan for one hundred seeds", { timeout: 120_000 }, () => {
    for (let index = 0; index < 100; index += 1) {
      const plan = generateWorldPlan(`property-${String(index)}`);
      expect(plan.chunksPerAxis ** 2).toBe(400);
      expect(plan.roads.length).toBeGreaterThan(0);
      expect(plan.blocks.length).toBeGreaterThan(0);
      expect(plan.buildingParts.length).toBeGreaterThan(0);
      expect(plan.combatDistrict.validation.valid).toBe(true);
      expect(plan.planHash).toMatch(/^sha256:[0-9a-f]{64}$/u);
    }
  });

  it("reports batched chunk geometry, collision ownership, and debug state", () => {
    const plan = generateWorldPlan("world-telemetry");
    const chunk = deriveChunkPlan(plan, plan.combatDistrict.chunkMin);
    const geometry = buildChunkGeometry(chunk, "gameplay");
    expect(geometry.lod).toBe("gameplay");
    expect(geometry.metrics.drawCalls).toBe(geometry.batches.length);
    expect(geometry.metrics.triangles).toBeGreaterThan(0);
    expect(geometry.metrics.geometryBytes).toBeGreaterThan(0);
    const lowGeometry = buildChunkGeometry(chunk, "low");
    expect(lowGeometry.collisionBoxes).toHaveLength(0);
    expect(lowGeometry.batches.some((batch) => batch.archetype === "combat-edge")).toBe(false);
    expect(geometry.batches.some((batch) => batch.archetype === "building-window")).toBe(true);
    expect(geometry.batches.some((batch) => batch.archetype === "building-stair")).toBe(true);
    expect(lowGeometry.batches.some((batch) => batch.archetype === "building-window")).toBe(false);
    expect(lowGeometry.batches.some((batch) => batch.archetype === "building-stair")).toBe(false);
    const collision = buildChunkCollision(chunk);
    expect(new Set(collision.map((box) => box.id)).size).toBe(collision.length);

    const debug = createWorldDebugState(plan);
    debug.setLayerVisible("combat-graph", true);
    debug.setFreezeStreaming(true);
    debug.setLoadedChunks([
      { x: 0, z: 0 },
      { x: 0, z: 0 },
    ]);
    debug.requestTeleport({ x: 3, z: 4 });
    expect(debug.getSnapshot().toggles.combatGraph).toBe(true);
    expect(debug.getSnapshot().loadedChunkStates[0]?.lod).toBe("high");
    expect(debug.getSnapshot().toggles.freezeStreaming).toBe(true);
    expect(debug.getSnapshot().loadedChunkKeys).toEqual(["0:0"]);
    expect(debug.consumeTeleport()).toEqual({ x: 3, z: 4 });
    expect(debug.consumeTeleport()).toBeNull();
  });

  it("keeps a streamed chunk through the unload hysteresis band", () => {
    const plan = generateWorldPlan("world-hysteresis");
    const manager = new ChunkManager(plan);
    manager.update({ x: 5, z: 5 }, { x: 0, z: 0 });
    expect(manager.getState({ x: 0, z: 0 })?.lod).toBe("low");
    manager.update({ x: 6, z: 6 }, { x: 0, z: 0 });
    expect(manager.getState({ x: 0, z: 0 })?.lod).toBe("low");
    manager.update({ x: 7, z: 7 }, { x: 0, z: 0 });
    expect(manager.getState({ x: 0, z: 0 })?.lod).toBe("unloaded");
  });

  it("pins every combat-district chunk at gameplay LOD", () => {
    const plan = generateWorldPlan("world-combat-pin");
    const manager = new ChunkManager(plan);
    manager.update({ x: 0, z: 0 }, { x: 0, z: 0 });
    for (
      let x = plan.combatDistrict.chunkMin.x;
      x < plan.combatDistrict.chunkMin.x + plan.combatDistrict.chunkSize;
      x += 1
    ) {
      for (
        let z = plan.combatDistrict.chunkMin.z;
        z < plan.combatDistrict.chunkMin.z + plan.combatDistrict.chunkSize;
        z += 1
      ) {
        expect(manager.getState({ x, z })?.lod).toBe("gameplay");
      }
    }
  });
});
