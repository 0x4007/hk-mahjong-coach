import type { CityBlock, Parcel } from "../world-types.js";

export interface ParcelPlan {
  readonly blocks: readonly CityBlock[];
  readonly parcels: readonly Parcel[];
}

const splitBounds = (
  min: number,
  max: number,
  count: number,
  gap: number,
): readonly [number, number][] => {
  const totalGap = gap * (count - 1);
  const span = (max - min - totalGap) / count;
  return Array.from({ length: count }, (_, index) => {
    const start = min + index * (span + gap);
    return [start, start + span] as const;
  });
};

export const generateParcels = (blocks: readonly CityBlock[]): ParcelPlan => {
  const parcels: Parcel[] = [];
  const nextBlocks = blocks.map((block) => {
    const width = block.buildableBounds.maxX - block.buildableBounds.minX;
    const depth = block.buildableBounds.maxZ - block.buildableBounds.minZ;
    const columns = width >= 60 ? 2 : 1;
    const rows = depth >= 60 ? 2 : 1;
    const xRanges = splitBounds(block.buildableBounds.minX, block.buildableBounds.maxX, columns, 3);
    const zRanges = splitBounds(block.buildableBounds.minZ, block.buildableBounds.maxZ, rows, 3);
    const parcelIds: string[] = [];
    for (let zIndex = 0; zIndex < zRanges.length; zIndex += 1) {
      for (let xIndex = 0; xIndex < xRanges.length; xIndex += 1) {
        const xRange = xRanges[xIndex]!;
        const zRange = zRanges[zIndex]!;
        const id = `${block.id}-parcel-${String(xIndex)}-${String(zIndex)}`;
        parcels.push({
          id,
          blockId: block.id,
          bounds: {
            minX: xRange[0],
            maxX: xRange[1],
            minZ: zRange[0],
            maxZ: zRange[1],
          },
        });
        parcelIds.push(id);
      }
    }
    return { ...block, parcelIds };
  });
  return { blocks: nextBlocks, parcels };
};
