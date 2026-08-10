import { containsPoint } from "../coordinates.js";
import { createSeededRandom } from "../seeded-random.js";
import type { BuildingPart, Bounds2, Parcel, WorldConfig } from "../world-types.js";

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const centeredBounds = (
  centerX: number,
  centerZ: number,
  width: number,
  depth: number,
): Bounds2 => ({
  minX: centerX - width / 2,
  maxX: centerX + width / 2,
  minZ: centerZ - depth / 2,
  maxZ: centerZ + depth / 2,
});

const keepInside = (bounds: Bounds2, outer: Bounds2): Bounds2 => {
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const centerX = clamp(
    (bounds.minX + bounds.maxX) / 2,
    outer.minX + width / 2,
    outer.maxX - width / 2,
  );
  const centerZ = clamp(
    (bounds.minZ + bounds.maxZ) / 2,
    outer.minZ + depth / 2,
    outer.maxZ - depth / 2,
  );
  return centeredBounds(centerX, centerZ, width, depth);
};

export const generateBuildings = (
  config: WorldConfig,
  parcels: readonly Parcel[],
): readonly BuildingPart[] => {
  const random = createSeededRandom(config.seed, config.generatorVersion);
  return parcels.map((parcel, index): BuildingPart => {
    const widthAvailable = parcel.bounds.maxX - parcel.bounds.minX;
    const depthAvailable = parcel.bounds.maxZ - parcel.bounds.minZ;
    const inset = Math.min(3, widthAvailable / 6, depthAvailable / 6);
    const maxWidth = Math.max(1, widthAvailable - inset * 2);
    const maxDepth = Math.max(1, depthAvailable - inset * 2);
    const width = clamp(
      widthAvailable *
        (0.72 +
          random.randomFloat("building-width", parcel.bounds.minX, parcel.bounds.minZ) * 0.18),
      Math.min(15, maxWidth),
      Math.min(40, maxWidth),
    );
    const depth = clamp(
      depthAvailable *
        (0.72 +
          random.randomFloat("building-depth", parcel.bounds.maxX, parcel.bounds.maxZ) * 0.18),
      Math.min(15, maxDepth),
      Math.min(40, maxDepth),
    );
    const center = {
      x:
        (parcel.bounds.minX + parcel.bounds.maxX) / 2 +
        (random.randomFloat("building-offset-x", parcel.bounds.minX, parcel.bounds.minZ) - 0.5) *
          Math.max(0, widthAvailable - width - inset * 2),
      z:
        (parcel.bounds.minZ + parcel.bounds.maxZ) / 2 +
        (random.randomFloat("building-offset-z", parcel.bounds.maxX, parcel.bounds.maxZ) - 0.5) *
          Math.max(0, depthAvailable - depth - inset * 2),
    };
    const bounds = keepInside(centeredBounds(center.x, center.z, width, depth), {
      minX: parcel.bounds.minX + inset,
      maxX: parcel.bounds.maxX - inset,
      minZ: parcel.bounds.minZ + inset,
      maxZ: parcel.bounds.maxZ - inset,
    });
    if (!containsPoint(parcel.bounds, { x: bounds.minX, z: bounds.minZ })) {
      throw new Error("world_building_outside_parcel");
    }
    return {
      id: `${parcel.id}-building-${String(index)}`,
      logicalBuildingId: `${parcel.id}-building`,
      kind: "building",
      bounds,
      heightM:
        10 + random.randomFloat("building-height", parcel.bounds.minX, parcel.bounds.maxZ) * 30,
      districtKind: "dense-urban",
    };
  });
};
