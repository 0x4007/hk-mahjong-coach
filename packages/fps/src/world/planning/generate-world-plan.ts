import { canonicalJsonHash } from "@hk-mahjong/core";
import { chunksPerAxis, worldBounds } from "../coordinates.js";
import { resolveWorldConfig } from "../world-config.js";
import type { BuildingPart, WorldConfig, WorldPlan } from "../world-types.js";
import { generateBlocks } from "./generate-blocks.js";
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
    .map(
      (obstacle): BuildingPart => ({
        id: obstacle.id,
        logicalBuildingId: obstacle.id,
        kind: "combat-barrier",
        bounds: obstacle.bounds,
        heightM: obstacle.heightM,
        districtKind: "dense-urban",
      }),
    );
};

const hashablePlan = (plan: Omit<WorldPlan, "planHash">): Omit<WorldPlan, "planHash"> => plan;

export const generateWorldPlan = (
  input: Partial<WorldConfig> | string = {},
): WorldPlan => {
  const config = resolveWorldConfig(typeof input === "string" ? { seed: input } : input);
  const streetGrid = generateStreetGrid(config);
  const initialBlocks = generateBlocks(config, streetGrid.roads);
  const parcelPlan = generateParcels(initialBlocks);
  const initialBuildings = generateBuildings(config, parcelPlan.parcels);
  const combat = generateCombatPlan(config, initialBuildings);
  const finalBuildingParts = [
    ...combat.buildingParts,
    ...combatBarrierParts(combat.district, combat.buildingParts),
  ];
  const blocks = parcelPlan.blocks;
  const worldPlanWithoutHash: Omit<WorldPlan, "planHash"> = {
    seed: config.seed,
    generatorVersion: config.generatorVersion,
    config,
    bounds: worldBounds(config),
    chunksPerAxis: chunksPerAxis(config),
    roads: streetGrid.roads,
    sidewalks: streetGrid.sidewalks,
    blocks,
    parcels: parcelPlan.parcels,
    buildingParts: finalBuildingParts,
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
  const expectedChunkCount = plan.chunksPerAxis * plan.chunksPerAxis;
  if (plan.validation.chunkCount !== expectedChunkCount) throw new Error("world_plan_chunk_count_mismatch");
  if (plan.validation.roadCount !== plan.roads.length) throw new Error("world_plan_road_count_mismatch");
  if (plan.validation.blockCount !== plan.blocks.length) throw new Error("world_plan_block_count_mismatch");
  if (plan.validation.buildingCount !== plan.buildingParts.length) throw new Error("world_plan_building_count_mismatch");
  if (plan.combatDistrict.bounds.maxX - plan.combatDistrict.bounds.minX !== plan.config.combatDistrictSizeM) {
    throw new Error("world_plan_combat_district_size_mismatch");
  }
  if (plan.combatDistrict.bounds.maxZ - plan.combatDistrict.bounds.minZ !== plan.config.combatDistrictSizeM) {
    throw new Error("world_plan_combat_district_size_mismatch");
  }
  if (plan.combatDistrict.chunkSize !== plan.config.combatDistrictSizeM / plan.config.chunkSizeM) {
    throw new Error("world_plan_combat_chunk_span_mismatch");
  }
  if (plan.validation.valid !== plan.combatDistrict.validation.valid) throw new Error("world_plan_validation_mismatch");
};
