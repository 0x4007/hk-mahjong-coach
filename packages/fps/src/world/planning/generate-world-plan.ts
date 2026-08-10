import { canonicalJsonHash } from "@hk-mahjong/core";
import { chunksPerAxis, containsPoint, intersectsBounds, worldBounds } from "../coordinates.js";
import { resolveWorldConfig } from "../world-config.js";
import type { Bounds2, BuildingPart, WorldConfig, WorldPlan } from "../world-types.js";
import { generateBlocks } from "./generate-blocks.js";
import { BUILDING_DETAIL_VERSION, generateBuildingDetails } from "./generate-building-details.js";
import { generateBuildings } from "./generate-buildings.js";
import { generateParcels } from "./generate-parcels.js";
import { generateStreetGrid } from "./generate-street-grid.js";
import { generateCombatPlan } from "../combat/generate-combat-plan.js";

const combatBarrierParts = (
  district: WorldPlan["combatDistrict"],
  existing: readonly BuildingPart[],
): readonly BuildingPart[] => {
  const existingIds = new Set(existing.map((part) => part.id));
  const coverIds = new Set(district.coverObjects.map((cover) => cover.id));
  return district.obstacles
    .filter((obstacle) => !existingIds.has(obstacle.id) && !coverIds.has(obstacle.id))
    .map((obstacle): BuildingPart => ({
      id: obstacle.id,
      logicalBuildingId: obstacle.id,
      kind: "combat-barrier",
      bounds: obstacle.bounds,
      heightM: obstacle.heightM,
      districtKind: "dense-urban",
    }));
};

const hashablePlan = (plan: Omit<WorldPlan, "planHash">): Record<string, unknown> => {
  const { buildingWindows, buildingStairwells, ...base } = plan;
  return {
    ...base,
    buildingDetailVersion: BUILDING_DETAIL_VERSION,
    buildingWindowCount: buildingWindows.length,
    buildingStairwellCount: buildingStairwells.length,
  };
};

export const generateWorldPlan = (
  input: (Partial<WorldConfig> & { readonly reservedRects?: readonly Bounds2[] }) | string = {},
): WorldPlan => {
  const reservedRects = typeof input === "string" ? [] : (input.reservedRects ?? []);
  const configInput =
    typeof input === "string"
      ? { seed: input }
      : (() => {
          const { reservedRects: ignoredReservedRects, ...overrides } = input;
          void ignoredReservedRects;
          return overrides;
        })();
  const config = resolveWorldConfig(configInput);
  const streetGrid = generateStreetGrid(config);
  const initialBlocks = generateBlocks(config, streetGrid.roads);
  const parcelPlan = generateParcels(initialBlocks);
  const initialBuildings = generateBuildings(config, parcelPlan.parcels);
  const combat = generateCombatPlan(config, initialBuildings, reservedRects);
  const finalBuildingParts = [
    ...combat.buildingParts,
    ...combatBarrierParts(combat.district, combat.buildingParts),
  ];
  const buildingDetails = generateBuildingDetails(config, finalBuildingParts);
  const blocks = parcelPlan.blocks;
  const worldPlanWithoutHash: Omit<WorldPlan, "planHash"> = {
    seed: config.seed,
    generatorVersion: config.generatorVersion,
    config,
    reservedRects,
    bounds: worldBounds(config),
    chunksPerAxis: chunksPerAxis(config),
    roads: streetGrid.roads,
    sidewalks: streetGrid.sidewalks,
    blocks,
    parcels: parcelPlan.parcels,
    buildingParts: finalBuildingParts,
    buildingWindows: buildingDetails.buildingWindows,
    buildingStairwells: buildingDetails.buildingStairwells,
    combatDistrict: combat.district,
    validation: {
      valid: combat.district.validation.valid,
      chunkCount: chunksPerAxis(config) ** 2,
      roadCount: streetGrid.roads.length,
      blockCount: blocks.length,
      buildingCount: finalBuildingParts.length,
      combat: combat.district.validation,
      failures: combat.district.validation.failures,
    },
  };
  return {
    ...worldPlanWithoutHash,
    planHash: `sha256:${canonicalJsonHash(hashablePlan(worldPlanWithoutHash))}`,
  };
};

export const validateWorldPlan = (plan: WorldPlan): void => {
  const expectedBounds = worldBounds(plan.config);
  if (JSON.stringify(plan.bounds) !== JSON.stringify(expectedBounds)) {
    throw new Error("world_plan_bounds_mismatch");
  }
  const expectedChunkCount = plan.chunksPerAxis * plan.chunksPerAxis;
  if (plan.validation.chunkCount !== expectedChunkCount)
    throw new Error("world_plan_chunk_count_mismatch");
  if (plan.validation.roadCount !== plan.roads.length)
    throw new Error("world_plan_road_count_mismatch");
  if (plan.validation.blockCount !== plan.blocks.length)
    throw new Error("world_plan_block_count_mismatch");
  if (plan.validation.buildingCount !== plan.buildingParts.length)
    throw new Error("world_plan_building_count_mismatch");
  if (
    plan.combatDistrict.bounds.maxX - plan.combatDistrict.bounds.minX !==
    plan.config.combatDistrictSizeM
  ) {
    throw new Error("world_plan_combat_district_size_mismatch");
  }
  if (
    plan.combatDistrict.bounds.maxZ - plan.combatDistrict.bounds.minZ !==
    plan.config.combatDistrictSizeM
  ) {
    throw new Error("world_plan_combat_district_size_mismatch");
  }
  if (plan.combatDistrict.chunkSize !== plan.config.combatDistrictSizeM / plan.config.chunkSizeM) {
    throw new Error("world_plan_combat_chunk_span_mismatch");
  }
  if (plan.validation.valid !== plan.combatDistrict.validation.valid)
    throw new Error("world_plan_validation_mismatch");
  const roadIds = new Set<string>();
  for (const road of plan.roads) {
    if (roadIds.has(road.id)) throw new Error("world_plan_duplicate_road_id");
    roadIds.add(road.id);
    if (!containsPoint(plan.bounds, road.start) || !containsPoint(plan.bounds, road.end)) {
      throw new Error("world_plan_road_out_of_bounds");
    }
  }
  const buildingIds = new Set<string>();
  for (const building of plan.buildingParts) {
    if (buildingIds.has(building.id)) throw new Error("world_plan_duplicate_building_id");
    buildingIds.add(building.id);
    if (
      building.bounds.minX >= building.bounds.maxX ||
      building.bounds.minZ >= building.bounds.maxZ ||
      !containsPoint(plan.bounds, { x: building.bounds.minX, z: building.bounds.minZ }) ||
      !containsPoint(plan.bounds, { x: building.bounds.maxX, z: building.bounds.maxZ })
    ) {
      throw new Error("world_plan_building_out_of_bounds");
    }
  }
  const windowIds = new Set<string>();
  for (const window of plan.buildingWindows) {
    if (windowIds.has(window.id)) throw new Error("world_plan_duplicate_window_id");
    windowIds.add(window.id);
    if (!buildingIds.has(window.buildingId)) throw new Error("world_plan_window_building_missing");
    if (!containsPoint(plan.bounds, window.position))
      throw new Error("world_plan_window_out_of_bounds");
    if (
      window.widthM <= 0 ||
      window.heightM <= 0 ||
      window.bottomM < 0 ||
      !Number.isFinite(window.bottomM)
    ) {
      throw new Error("world_plan_window_dimensions_invalid");
    }
  }
  const stairwellIds = new Set<string>();
  for (const stairwell of plan.buildingStairwells) {
    if (stairwellIds.has(stairwell.id)) throw new Error("world_plan_duplicate_stairwell_id");
    stairwellIds.add(stairwell.id);
    if (!buildingIds.has(stairwell.buildingId)) {
      throw new Error("world_plan_stairwell_building_missing");
    }
    if (!containsPoint(plan.bounds, stairwell.ownerPosition)) {
      throw new Error("world_plan_stairwell_owner_out_of_bounds");
    }
    if (stairwell.flights.length === 0 || stairwell.landings.length === 0) {
      throw new Error("world_plan_stairwell_empty");
    }
    const building = plan.buildingParts.find((part) => part.id === stairwell.buildingId);
    const finalLanding = stairwell.landings[stairwell.landings.length - 1];
    if (
      building === undefined ||
      finalLanding.heightM !== stairwell.roofHeightM ||
      !intersectsBounds(finalLanding.bounds, building.bounds)
    ) {
      throw new Error("world_plan_stairwell_roof_access_invalid");
    }
    if (
      stairwell.floorHeightM <= 0 ||
      stairwell.roofHeightM <= 0 ||
      !Number.isFinite(stairwell.floorHeightM) ||
      !Number.isFinite(stairwell.roofHeightM)
    ) {
      throw new Error("world_plan_stairwell_dimensions_invalid");
    }
  }
  const district = plan.combatDistrict;
  const chunkSize = plan.config.chunkSizeM;
  const aligned = (value: number): boolean =>
    Math.abs(
      (value - plan.bounds.minX) / chunkSize - Math.round((value - plan.bounds.minX) / chunkSize),
    ) < 1e-9;
  if (
    !aligned(district.bounds.minX) ||
    !aligned(district.bounds.maxX) ||
    !aligned(district.bounds.minZ) ||
    !aligned(district.bounds.maxZ) ||
    district.chunkMin.x < 2 ||
    district.chunkMin.z < 2 ||
    district.chunkMin.x + district.chunkSize > plan.chunksPerAxis - 2 ||
    district.chunkMin.z + district.chunkSize > plan.chunksPerAxis - 2
  ) {
    throw new Error("world_plan_combat_district_alignment_invalid");
  }
};
