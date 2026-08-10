import { containsPoint, intersectsBounds, worldBounds } from "../coordinates.js";
import { createSeededRandom } from "../seeded-random.js";
import type {
  Bounds2,
  BuildingFacade,
  BuildingPart,
  BuildingStairFlight,
  BuildingStairLanding,
  BuildingStairwell,
  BuildingWindow,
  Vec2,
  WorldConfig,
} from "../world-types.js";

const WINDOW_PANEL_THICKNESS_M = 0.08;
const WINDOW_ROW_MARGIN_M = 1.05;
const WINDOW_COLUMN_SPACING_M = 3.1;
const STAIR_WIDTH_M = 2.4;
const STAIR_CLEARANCE_M = 0.08;
const STAIR_RUN_MAX_M = 5.6;
const STAIR_RUN_MARGIN_M = 2.4;
const STAIR_STEP_TARGET_HEIGHT_M = 0.24;
const STAIR_LANDING_DEPTH_M = 0.85;
const STAIR_ROOF_ACCESS_OVERLAP_M = 0.12;

/** Bump when the deterministic facade/stair formulas change. */
export const BUILDING_DETAIL_VERSION = 1;

interface StairPlacement {
  readonly facade: BuildingFacade;
  readonly runAxis: "x" | "z";
  readonly center: Vec2;
  readonly runLengthM: number;
  readonly bounds: Bounds2;
}

interface BuildingDetails {
  readonly buildingWindows: readonly BuildingWindow[];
  readonly buildingStairwells: readonly BuildingStairwell[];
}

const centeredBounds = (center: Vec2, widthM: number, depthM: number): Bounds2 => ({
  minX: center.x - widthM / 2,
  maxX: center.x + widthM / 2,
  minZ: center.z - depthM / 2,
  maxZ: center.z + depthM / 2,
});

const unionBounds = (boundsList: readonly Bounds2[]): Bounds2 => {
  const first = boundsList[0];
  if (first === undefined) throw new Error("world_building_details_empty_bounds");
  return boundsList.slice(1).reduce(
    (current, bounds) => ({
      minX: Math.min(current.minX, bounds.minX),
      maxX: Math.max(current.maxX, bounds.maxX),
      minZ: Math.min(current.minZ, bounds.minZ),
      maxZ: Math.max(current.maxZ, bounds.maxZ),
    }),
    first,
  );
};

const sideLength = (building: BuildingPart, facade: BuildingFacade): number =>
  facade === "north" || facade === "south"
    ? building.bounds.maxX - building.bounds.minX
    : building.bounds.maxZ - building.bounds.minZ;

const windowPosition = (
  building: BuildingPart,
  facade: BuildingFacade,
  tangentOffsetM: number,
): Vec2 => {
  const centerX = (building.bounds.minX + building.bounds.maxX) / 2;
  const centerZ = (building.bounds.minZ + building.bounds.maxZ) / 2;
  if (facade === "north") return { x: centerX + tangentOffsetM, z: building.bounds.maxZ };
  if (facade === "south") return { x: centerX + tangentOffsetM, z: building.bounds.minZ };
  if (facade === "east") return { x: building.bounds.maxX, z: centerZ + tangentOffsetM };
  return { x: building.bounds.minX, z: centerZ + tangentOffsetM };
};

const windowBounds = (position: Vec2, facade: BuildingFacade, widthM: number): Bounds2 => {
  const tangentHalf = widthM / 2;
  const normalHalf = WINDOW_PANEL_THICKNESS_M / 2;
  if (facade === "north" || facade === "south") {
    return {
      minX: position.x - tangentHalf,
      maxX: position.x + tangentHalf,
      minZ: position.z + (facade === "north" ? 0 : -normalHalf),
      maxZ: position.z + (facade === "north" ? normalHalf : 0),
    };
  }
  return {
    minX: position.x + (facade === "east" ? 0 : -normalHalf),
    maxX: position.x + (facade === "east" ? normalHalf : 0),
    minZ: position.z - tangentHalf,
    maxZ: position.z + tangentHalf,
  };
};

const makeWindowDetails = (
  building: BuildingPart,
  random: ReturnType<typeof createSeededRandom>,
): readonly BuildingWindow[] => {
  const floorCount = Math.max(1, Math.ceil(building.heightM / 3.1));
  const floorHeightM = building.heightM / floorCount;
  const windowHeightM = Math.min(1.2, floorHeightM * 0.45);
  const litPhase = random.randomInt(
    "building-window-phase",
    building.bounds.minX,
    building.bounds.minZ,
    5,
  );
  const windows: BuildingWindow[] = [];
  const facades: readonly BuildingFacade[] = ["north", "east", "south", "west"];
  for (const [facadeIndex, facade] of facades.entries()) {
    const lengthM = sideLength(building, facade);
    const usableLengthM = Math.max(1, lengthM - WINDOW_ROW_MARGIN_M * 2);
    const columnCount = Math.max(1, Math.floor(usableLengthM / WINDOW_COLUMN_SPACING_M));
    const spacingM = usableLengthM / columnCount;
    const windowWidthM = Math.min(1.45, spacingM * 0.56);
    for (let floor = 0; floor < floorCount; floor += 1) {
      const bottomM = floor * floorHeightM + floorHeightM * 0.34;
      for (let column = 0; column < columnCount; column += 1) {
        const tangentOffsetM = -lengthM / 2 + WINDOW_ROW_MARGIN_M + spacingM * (column + 0.5);
        const position = windowPosition(building, facade, tangentOffsetM);
        windows.push({
          id: `${building.id}-window-${facade}-${String(floor)}-${String(column)}`,
          buildingId: building.id,
          facade,
          position,
          bounds: windowBounds(position, facade, windowWidthM),
          bottomM,
          widthM: windowWidthM,
          heightM: windowHeightM,
          lit: (litPhase + facadeIndex + floor + column) % 5 === 0,
        });
      }
    }
  }
  return windows;
};

const stairBounds = (
  facade: BuildingFacade,
  center: Vec2,
  runLengthM: number,
  widthM: number,
): Bounds2 =>
  facade === "north" || facade === "south"
    ? centeredBounds(center, runLengthM, widthM)
    : centeredBounds(center, widthM, runLengthM);

const placementForFacade = (
  building: BuildingPart,
  facade: BuildingFacade,
  runLengthM: number,
): StairPlacement => {
  const centerX = (building.bounds.minX + building.bounds.maxX) / 2;
  const centerZ = (building.bounds.minZ + building.bounds.maxZ) / 2;
  if (facade === "north") {
    const center = {
      x: centerX,
      z: building.bounds.maxZ + STAIR_CLEARANCE_M + STAIR_WIDTH_M / 2,
    };
    return {
      facade,
      runAxis: "x",
      center,
      runLengthM,
      bounds: stairBounds(facade, center, runLengthM, STAIR_WIDTH_M),
    };
  }
  if (facade === "south") {
    const center = {
      x: centerX,
      z: building.bounds.minZ - STAIR_CLEARANCE_M - STAIR_WIDTH_M / 2,
    };
    return {
      facade,
      runAxis: "x",
      center,
      runLengthM,
      bounds: stairBounds(facade, center, runLengthM, STAIR_WIDTH_M),
    };
  }
  if (facade === "east") {
    const center = {
      x: building.bounds.maxX + STAIR_CLEARANCE_M + STAIR_WIDTH_M / 2,
      z: centerZ,
    };
    return {
      facade,
      runAxis: "z",
      center,
      runLengthM,
      bounds: stairBounds(facade, center, runLengthM, STAIR_WIDTH_M),
    };
  }
  const center = {
    x: building.bounds.minX - STAIR_CLEARANCE_M - STAIR_WIDTH_M / 2,
    z: centerZ,
  };
  return {
    facade,
    runAxis: "z",
    center,
    runLengthM,
    bounds: stairBounds(facade, center, runLengthM, STAIR_WIDTH_M),
  };
};

const chooseStairPlacement = (
  building: BuildingPart,
  allBuildings: readonly BuildingPart[],
  config: WorldConfig,
  random: ReturnType<typeof createSeededRandom>,
): StairPlacement => {
  const facades: readonly BuildingFacade[] = ["north", "east", "south", "west"];
  const start = random.randomInt(
    "building-stair-side",
    building.bounds.minX,
    building.bounds.minZ,
    4,
  );
  const runLengthM = Math.min(
    STAIR_RUN_MAX_M,
    Math.max(3.6, sideLength(building, facades[start]!) - STAIR_RUN_MARGIN_M),
  );
  const candidates = facades.map((_, offset) =>
    placementForFacade(building, facades[(start + offset) % facades.length]!, runLengthM),
  );
  const bounds = worldBounds(config);
  const otherBuildings = allBuildings.filter((other) => other.id !== building.id);
  const valid = candidates.find(
    (candidate) =>
      containsPoint(bounds, { x: candidate.bounds.minX, z: candidate.bounds.minZ }) &&
      containsPoint(bounds, { x: candidate.bounds.maxX, z: candidate.bounds.maxZ }) &&
      otherBuildings.every((other) => !intersectsBounds(candidate.bounds, other.bounds)),
  );
  return valid ?? candidates[0]!;
};

const landingBounds = (
  placement: StairPlacement,
  position: Vec2,
  landingDepthM: number,
): Bounds2 =>
  placement.runAxis === "x"
    ? centeredBounds(position, landingDepthM, STAIR_WIDTH_M)
    : centeredBounds(position, STAIR_WIDTH_M, landingDepthM);

/** Extend the final landing through the facade so its top surface joins the roof. */
const roofAccessBounds = (
  building: BuildingPart,
  placement: StairPlacement,
  position: Vec2,
  landingDepthM: number,
): Bounds2 => {
  const tangentHalf = landingDepthM / 2;
  if (placement.facade === "north" || placement.facade === "south") {
    const facadeZ = placement.facade === "north" ? building.bounds.maxZ : building.bounds.minZ;
    return {
      minX: position.x - tangentHalf,
      maxX: position.x + tangentHalf,
      minZ: Math.min(position.z, facadeZ) - STAIR_ROOF_ACCESS_OVERLAP_M,
      maxZ: Math.max(position.z, facadeZ) + STAIR_ROOF_ACCESS_OVERLAP_M,
    };
  }
  const facadeX = placement.facade === "east" ? building.bounds.maxX : building.bounds.minX;
  return {
    minX: Math.min(position.x, facadeX) - STAIR_ROOF_ACCESS_OVERLAP_M,
    maxX: Math.max(position.x, facadeX) + STAIR_ROOF_ACCESS_OVERLAP_M,
    minZ: position.z - tangentHalf,
    maxZ: position.z + tangentHalf,
  };
};

const makeStairwell = (
  building: BuildingPart,
  allBuildings: readonly BuildingPart[],
  config: WorldConfig,
  random: ReturnType<typeof createSeededRandom>,
): BuildingStairwell => {
  const floorCount = Math.max(1, Math.ceil(building.heightM / 3.1));
  const floorHeightM = building.heightM / floorCount;
  const placement = chooseStairPlacement(building, allBuildings, config, random);
  const stepCount = Math.max(6, Math.ceil(floorHeightM / STAIR_STEP_TARGET_HEIGHT_M));
  const stepDepthM = placement.runLengthM / stepCount;
  const flights: BuildingStairFlight[] = [];
  const landings: BuildingStairLanding[] = [];
  for (let floor = 0; floor < floorCount; floor += 1) {
    const lowToHigh = floor % 2 === 0;
    const first =
      placement.runAxis === "x"
        ? { x: placement.center.x - placement.runLengthM / 2, z: placement.center.z }
        : { x: placement.center.x, z: placement.center.z - placement.runLengthM / 2 };
    const last =
      placement.runAxis === "x"
        ? { x: placement.center.x + placement.runLengthM / 2, z: placement.center.z }
        : { x: placement.center.x, z: placement.center.z + placement.runLengthM / 2 };
    const start = lowToHigh ? first : last;
    const end = lowToHigh ? last : first;
    const baseM = floor * floorHeightM;
    const topM = (floor + 1) * floorHeightM;
    flights.push({
      id: `${building.id}-stair-flight-${String(floor)}`,
      buildingId: building.id,
      start,
      end,
      baseM,
      topM,
      widthM: STAIR_WIDTH_M,
      stepCount,
      stepHeightM: floorHeightM / stepCount,
      stepDepthM,
      bounds: placement.bounds,
    });
    const landing = landingBounds(placement, end, STAIR_LANDING_DEPTH_M);
    const roofLanding = floor === floorCount - 1;
    landings.push({
      id: `${building.id}-stair-landing-${String(floor)}`,
      buildingId: building.id,
      position: end,
      heightM: topM,
      bounds: roofLanding
        ? unionBounds([landing, roofAccessBounds(building, placement, end, STAIR_LANDING_DEPTH_M)])
        : landing,
    });
  }
  return {
    id: `${building.id}-stairwell`,
    buildingId: building.id,
    ownerPosition: placement.center,
    bounds: unionBounds([placement.bounds, ...landings.map((landing) => landing.bounds)]),
    floorHeightM,
    roofHeightM: building.heightM,
    flights,
    landings,
  };
};

export const generateBuildingDetails = (
  config: WorldConfig,
  buildings: readonly BuildingPart[],
): BuildingDetails => {
  const random = createSeededRandom(config.seed, config.generatorVersion);
  const buildingWindows: BuildingWindow[] = [];
  const buildingStairwells: BuildingStairwell[] = [];
  for (const building of buildings) {
    if (building.kind !== "building") continue;
    buildingWindows.push(...makeWindowDetails(building, random));
    buildingStairwells.push(makeStairwell(building, buildings, config, random));
  }
  return { buildingWindows, buildingStairwells };
};
