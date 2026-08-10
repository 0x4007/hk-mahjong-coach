import { worldBounds } from "../coordinates.js";
import type { RoadSegment, SurfacePolygon, WorldConfig } from "../world-types.js";

export interface StreetGridPlan {
  readonly roads: readonly RoadSegment[];
  readonly sidewalks: readonly SurfacePolygon[];
}

const coordinateLabel = (value: number): string =>
  value < 0 ? `m${String(Math.abs(value))}` : `p${String(value)}`;

const isMultiple = (value: number, divisor: number): boolean =>
  Math.abs(value / divisor - Math.round(value / divisor)) < 1e-9;

const sidewalkStrips = (road: RoadSegment, sidewalkWidthM: number): readonly SurfacePolygon[] => {
  const halfRoad = road.widthM / 2;
  const minX = Math.min(road.start.x, road.end.x);
  const maxX = Math.max(road.start.x, road.end.x);
  const minZ = Math.min(road.start.z, road.end.z);
  const maxZ = Math.max(road.start.z, road.end.z);
  const horizontal = Math.abs(road.start.z - road.end.z) < 1e-9;
  if (horizontal) {
    const centerZ = road.start.z;
    return [
      {
        id: `${road.id}-sidewalk-north`,
        kind: "sidewalk",
        points: [
          { x: minX, z: centerZ + halfRoad },
          { x: maxX, z: centerZ + halfRoad },
          { x: maxX, z: centerZ + halfRoad + sidewalkWidthM },
          { x: minX, z: centerZ + halfRoad + sidewalkWidthM },
        ],
      },
      {
        id: `${road.id}-sidewalk-south`,
        kind: "sidewalk",
        points: [
          { x: minX, z: centerZ - halfRoad - sidewalkWidthM },
          { x: maxX, z: centerZ - halfRoad - sidewalkWidthM },
          { x: maxX, z: centerZ - halfRoad },
          { x: minX, z: centerZ - halfRoad },
        ],
      },
    ];
  }
  const centerX = road.start.x;
  return [
    {
      id: `${road.id}-sidewalk-east`,
      kind: "sidewalk",
      points: [
        { x: centerX + halfRoad, z: minZ },
        { x: centerX + halfRoad + sidewalkWidthM, z: minZ },
        { x: centerX + halfRoad + sidewalkWidthM, z: maxZ },
        { x: centerX + halfRoad, z: maxZ },
      ],
    },
    {
      id: `${road.id}-sidewalk-west`,
      kind: "sidewalk",
      points: [
        { x: centerX - halfRoad - sidewalkWidthM, z: minZ },
        { x: centerX - halfRoad, z: minZ },
        { x: centerX - halfRoad, z: maxZ },
        { x: centerX - halfRoad - sidewalkWidthM, z: maxZ },
      ],
    },
  ];
};

export const generateStreetGrid = (config: WorldConfig): StreetGridPlan => {
  const bounds = worldBounds(config);
  const centers: number[] = [];
  for (
    let coordinate = bounds.minX + config.streetPitchM;
    coordinate < bounds.maxX - 1e-9;
    coordinate += config.streetPitchM
  ) {
    centers.push(coordinate);
  }
  const roads: RoadSegment[] = [];
  for (const center of centers) {
    const kind = isMultiple(center, config.arterialPitchM) ? "arterial" : "local";
    const widthM = kind === "arterial" ? config.arterialWidthM : config.streetWidthM;
    roads.push({
      id: `road-x-${coordinateLabel(center)}`,
      kind,
      start: { x: center, z: bounds.minZ },
      end: { x: center, z: bounds.maxZ },
      widthM,
    });
    roads.push({
      id: `road-z-${coordinateLabel(center)}`,
      kind,
      start: { x: bounds.minX, z: center },
      end: { x: bounds.maxX, z: center },
      widthM,
    });
  }
  const sidewalks = roads.flatMap((road) => sidewalkStrips(road, config.sidewalkWidthM));
  return { roads, sidewalks };
};
