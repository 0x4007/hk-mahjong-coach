import { chunkBounds, chunksPerAxis } from "../coordinates.js";
import type { ChunkCoord, Bounds2, WorldConfig } from "../world-types.js";
import type { SeededRandomService } from "../seeded-random.js";

export interface CombatDistrictPlacement {
  readonly chunkMin: ChunkCoord;
  readonly chunkSpan: number;
  readonly bounds: Bounds2;
}

export const placeCombatDistrict = (
  config: WorldConfig,
  random: SeededRandomService,
  attempt: number,
): CombatDistrictPlacement => {
  const chunkSpan = Math.round(config.combatDistrictSizeM / config.chunkSizeM);
  const count = chunksPerAxis(config);
  const minimum = 2;
  const maximum = count - minimum - chunkSpan;
  if (maximum < minimum) throw new Error("world_combat_district_no_valid_placement");
  const x = minimum + random.randomInt("combat-district-x", 0, 0, maximum - minimum + 1, attempt);
  const z = minimum + random.randomInt("combat-district-z", 0, 0, maximum - minimum + 1, attempt);
  const chunkMin = { x, z };
  const first = chunkBounds(config, chunkMin);
  const last = chunkBounds(config, { x: x + chunkSpan - 1, z: z + chunkSpan - 1 });
  return {
    chunkMin,
    chunkSpan,
    bounds: { minX: first.minX, maxX: last.maxX, minZ: first.minZ, maxZ: last.maxZ },
  };
};
