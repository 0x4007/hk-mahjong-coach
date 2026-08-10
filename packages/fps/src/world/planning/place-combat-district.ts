import { chunkBounds, chunksPerAxis, intersectsBounds } from "../coordinates.js";
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
  reservedRects: readonly Bounds2[] = [],
): CombatDistrictPlacement => {
  const chunkSpan = Math.round(config.combatDistrictSizeM / config.chunkSizeM);
  const count = chunksPerAxis(config);
  const minimum = 2;
  const maximum = count - minimum - chunkSpan;
  if (maximum < minimum) throw new Error("world_combat_district_no_valid_placement");
  const candidateCoords: ChunkCoord[] = [];
  for (let x = minimum; x <= maximum; x += 1) {
    for (let z = minimum; z <= maximum; z += 1) {
      const first = chunkBounds(config, { x, z });
      const last = chunkBounds(config, { x: x + chunkSpan - 1, z: z + chunkSpan - 1 });
      const bounds = { minX: first.minX, maxX: last.maxX, minZ: first.minZ, maxZ: last.maxZ };
      if (reservedRects.some((reserved) => intersectsBounds(bounds, reserved))) continue;
      candidateCoords.push({ x, z });
    }
  }
  if (candidateCoords.length === 0)
    throw new Error("world_combat_district_reserved_all_placements");
  const candidateIndex = random.randomInt(
    "combat-district-placement",
    0,
    0,
    candidateCoords.length,
    attempt,
  );
  const selected = candidateCoords[candidateIndex] ?? candidateCoords[0]!;
  const x = selected.x;
  const z = selected.z;
  const chunkMin = { x, z };
  const first = chunkBounds(config, chunkMin);
  const last = chunkBounds(config, { x: x + chunkSpan - 1, z: z + chunkSpan - 1 });
  return {
    chunkMin,
    chunkSpan,
    bounds: { minX: first.minX, maxX: last.maxX, minZ: first.minZ, maxZ: last.maxZ },
  };
};
