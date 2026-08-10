export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

export interface Bounds2 {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface WorldConfig {
  readonly seed: string;
  readonly generatorVersion: number;
  readonly worldSizeM: number;
  readonly chunkSizeM: number;
  readonly layoutCellSizeM: number;
  readonly streetPitchM: number;
  readonly arterialPitchM: number;
  readonly streetWidthM: number;
  readonly arterialWidthM: number;
  readonly sidewalkWidthM: number;
  readonly combatDistrictSizeM: number;
  readonly combatGraphSnapM: number;
  readonly nominalRunSpeedMps: number;
  readonly maxGenerationAttempts: number;
}

export interface ChunkCoord {
  readonly x: number;
  readonly z: number;
}

export type RoadKind = "arterial" | "local" | "alley";

export interface RoadSegment {
  readonly id: string;
  readonly kind: RoadKind;
  readonly start: Vec2;
  readonly end: Vec2;
  readonly widthM: number;
}

export interface RoadSegmentSlice extends RoadSegment {
  readonly sourceRoadId: string;
}

export type SurfaceKind = "road" | "sidewalk" | "plaza";

export interface SurfacePolygon {
  readonly id: string;
  readonly kind: SurfaceKind;
  readonly points: readonly Vec2[];
}

export type DistrictKind = "dense-urban" | "residential" | "industrial" | "civic" | "park";

export interface CityBlock {
  readonly id: string;
  readonly bounds: Bounds2;
  readonly buildableBounds: Bounds2;
  readonly districtKind: DistrictKind;
  readonly parcelIds: readonly string[];
}

export interface Parcel {
  readonly id: string;
  readonly blockId: string;
  readonly bounds: Bounds2;
}

export type BuildingPartKind = "building" | "combat-barrier";

export interface BuildingPart {
  readonly id: string;
  readonly logicalBuildingId: string;
  readonly kind: BuildingPartKind;
  readonly bounds: Bounds2;
  readonly heightM: number;
  readonly districtKind: DistrictKind;
}

export type BuildingFacade = "north" | "east" | "south" | "west";

export interface BuildingWindow {
  readonly id: string;
  readonly buildingId: string;
  readonly facade: BuildingFacade;
  /** World-space center of the window panel. */
  readonly position: Vec2;
  readonly bounds: Bounds2;
  readonly bottomM: number;
  readonly widthM: number;
  readonly heightM: number;
  readonly lit: boolean;
}

export interface BuildingStairFlight {
  readonly id: string;
  readonly buildingId: string;
  readonly start: Vec2;
  readonly end: Vec2;
  readonly baseM: number;
  readonly topM: number;
  readonly widthM: number;
  readonly stepCount: number;
  readonly stepHeightM: number;
  readonly stepDepthM: number;
  readonly bounds: Bounds2;
}

export interface BuildingStairLanding {
  readonly id: string;
  readonly buildingId: string;
  readonly position: Vec2;
  readonly heightM: number;
  readonly bounds: Bounds2;
}

export interface BuildingStairwell {
  readonly id: string;
  readonly buildingId: string;
  /** The point used to assign the stairwell to exactly one streamed chunk. */
  readonly ownerPosition: Vec2;
  readonly bounds: Bounds2;
  readonly floorHeightM: number;
  readonly roofHeightM: number;
  readonly flights: readonly BuildingStairFlight[];
  readonly landings: readonly BuildingStairLanding[];
}

export interface AxisAlignedSegment {
  readonly start: Vec2;
  readonly end: Vec2;
}

export type CombatNodeKind =
  | "attacker-spawn"
  | "defender-spawn"
  | "objective-a"
  | "objective-b"
  | "junction"
  | "choke"
  | "arena";

export interface CombatNode {
  readonly id: string;
  readonly kind: CombatNodeKind;
  readonly position: Vec2;
}

export type CombatSpaceKind = "street" | "alley" | "courtyard" | "passage";
export type CombatRouteRole = "a-side" | "middle" | "b-side" | "connector" | "defender" | "flank";

export interface CombatEdge {
  readonly id: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly widthM: number;
  readonly spaceKind: CombatSpaceKind;
  readonly routeRole: CombatRouteRole;
  readonly segments: readonly AxisAlignedSegment[];
  readonly lengthM: number;
}

export type CoverKind =
  | "crate-stack"
  | "concrete-barrier"
  | "construction-partition"
  | "parked-vehicle"
  | "kiosk"
  | "low-wall";

export interface CoverPlacement {
  readonly id: string;
  readonly kind: CoverKind;
  readonly bounds: Bounds2;
  readonly heightM: number;
  readonly rotationRadians: number;
  readonly openAreaId: string;
}

export interface CombatOpenArea {
  readonly id: string;
  readonly bounds: Bounds2;
}

export interface CombatObstacle {
  readonly id: string;
  readonly bounds: Bounds2;
  readonly heightM: number;
  readonly kind: "building" | "wall" | "cover";
}

export interface CombatValidationFailure {
  readonly code:
    | "bounds"
    | "unreachable-site"
    | "objective-entrance"
    | "primary-route"
    | "flanking-route"
    | "middle-control"
    | "isolated-connector"
    | "multiple-components"
    | "dead-end"
    | "degree-limit"
    | "route-time"
    | "defender-advantage"
    | "site-rotation"
    | "spawn-to-spawn-visible"
    | "spawn-to-objective-visible"
    | "objective-to-objective-visible"
    | "long-sightline"
    | "visibility-share"
    | "missing-cover"
    | "cover-blocks-route"
    | "obstacle-blocks-route";
  readonly message: string;
  readonly nodeIds: readonly string[];
}

export interface CombatTravelMetrics {
  readonly attackerToASeconds: number;
  readonly attackerToBSeconds: number;
  readonly defenderToASeconds: number;
  readonly defenderToBSeconds: number;
  readonly siteToSiteSeconds: number;
  readonly firstContactSeconds: number;
}

export interface CombatVisibilityMetrics {
  readonly maximumVisibleDistanceM: number;
  readonly maximumVisibleShare: number;
  readonly maximumVisibleNodeId: string | null;
  readonly spawnToSpawnVisible: boolean;
  readonly spawnToObjectiveVisible: readonly {
    readonly spawnId: string;
    readonly objectiveId: string;
    readonly visible: boolean;
  }[];
  readonly objectiveToObjectiveVisible: boolean;
  readonly longSightlines: readonly {
    readonly sourceId: string;
    readonly targetId: string;
    readonly distanceM: number;
    readonly hasIntermittentCover: boolean;
    readonly hasAlternateRoute: boolean;
  }[];
}

export interface CombatValidation {
  readonly valid: boolean;
  readonly failures: readonly CombatValidationFailure[];
  readonly travel: CombatTravelMetrics;
  readonly visibility: CombatVisibilityMetrics;
  readonly connectedComponentCount: number;
  readonly nodeDegrees: Readonly<Record<string, number>>;
  readonly score: number;
}

export interface CombatDistrictPlan {
  readonly id: string;
  readonly bounds: Bounds2;
  readonly chunkMin: ChunkCoord;
  readonly chunkSize: number;
  readonly attempt: number;
  readonly rotationQuarterTurns: number;
  readonly mirrored: boolean;
  readonly nodes: readonly CombatNode[];
  readonly edges: readonly CombatEdge[];
  readonly openAreas: readonly CombatOpenArea[];
  readonly coverObjects: readonly CoverPlacement[];
  readonly obstacles: readonly CombatObstacle[];
  readonly validation: CombatValidation;
}

export type CombatFeature =
  | {
      readonly kind: "node";
      readonly id: string;
      readonly nodeKind: CombatNodeKind;
      readonly position: Vec2;
    }
  | {
      readonly kind: "edge";
      readonly id: string;
      readonly routeRole: CombatRouteRole;
      readonly spaceKind: CombatSpaceKind;
      readonly widthM: number;
      readonly segments: readonly AxisAlignedSegment[];
    }
  | {
      readonly kind: "cover";
      readonly id: string;
      readonly coverKind: CoverKind;
      readonly bounds: Bounds2;
      readonly heightM: number;
    }
  | {
      readonly kind: "objective";
      readonly id: string;
      readonly position: Vec2;
    }
  | {
      readonly kind: "spawn";
      readonly id: string;
      readonly team: "attacker" | "defender";
      readonly position: Vec2;
    };

export interface WorldValidation {
  readonly valid: boolean;
  readonly chunkCount: number;
  readonly roadCount: number;
  readonly blockCount: number;
  readonly buildingCount: number;
  readonly combat: CombatValidation;
  readonly failures: readonly CombatValidationFailure[];
}

export interface WorldPlan {
  readonly seed: string;
  readonly generatorVersion: number;
  readonly config: WorldConfig;
  readonly reservedRects: readonly Bounds2[];
  readonly bounds: Bounds2;
  readonly chunksPerAxis: number;
  readonly roads: readonly RoadSegment[];
  readonly sidewalks: readonly SurfacePolygon[];
  readonly blocks: readonly CityBlock[];
  readonly parcels: readonly Parcel[];
  readonly buildingParts: readonly BuildingPart[];
  readonly buildingWindows: readonly BuildingWindow[];
  readonly buildingStairwells: readonly BuildingStairwell[];
  readonly combatDistrict: CombatDistrictPlan;
  readonly validation: WorldValidation;
  readonly planHash: string;
}

export interface ChunkPlan {
  readonly coord: ChunkCoord;
  readonly bounds: Bounds2;
  /** One layout-cell halo used for adjacency and seam decisions. */
  readonly haloBounds: Bounds2;
  readonly roads: readonly RoadSegmentSlice[];
  readonly sidewalks: readonly SurfacePolygon[];
  readonly buildingParts: readonly BuildingPart[];
  readonly buildingWindows: readonly BuildingWindow[];
  readonly buildingStairwells: readonly BuildingStairwell[];
  readonly coverObjects: readonly CoverPlacement[];
  readonly combatFeatures: readonly CombatFeature[];
  readonly isInsideCombatDistrict: boolean;
  readonly edgeSignatures: {
    readonly north: string;
    readonly east: string;
    readonly south: string;
    readonly west: string;
  };
  readonly planHash: string;
}

export type ChunkState =
  "unloaded" | "planned" | "queued" | "building" | "active-high" | "active-low" | "cached";

export type ChunkLod = "gameplay" | "high" | "low" | "unloaded";

export interface ChunkRuntimeState {
  readonly coord: ChunkCoord;
  readonly state: ChunkState;
  readonly lod: ChunkLod;
  readonly distanceChunks: number;
  readonly priority: number;
}

export interface ChunkStreamingConfig {
  readonly gameplayRadiusChunks: number;
  readonly lowDetailRadiusChunks: number;
  readonly unloadRadiusChunks: number;
  readonly buildBudgetMs: number;
}

export interface ChunkStreamingMetrics {
  readonly activeChunkCount: number;
  readonly activeGameplayChunkCount: number;
  readonly activeHighChunkCount: number;
  readonly activeLowChunkCount: number;
  readonly queueLength: number;
  readonly totalBuilds: number;
  readonly lastBuildTimeMs: number;
  readonly longestBuildTimeMs: number;
  readonly longestGenerationFrameMs: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly geometryBytes: number;
  readonly textureBytes: number;
}

export interface ChunkGeometryBatch {
  readonly archetype:
    | "road"
    | "sidewalk"
    | "building"
    | "building-window"
    | "building-stair"
    | "cover"
    | "combat-edge";
  readonly count: number;
  readonly vertexCount: number;
  readonly indexCount: number;
}

export interface ChunkGeometryMetrics {
  /** Estimated draw calls after one batch/instance group per archetype. */
  readonly drawCalls: number;
  /** Indexed triangle count for the merged/instanced batch estimates. */
  readonly triangles: number;
  /** Approximate GPU buffer bytes for the blockout geometry. */
  readonly geometryBytes: number;
  /** Shared procedural materials use no per-chunk texture allocation in v0.1. */
  readonly textureBytes: number;
}

export interface ChunkGeometry {
  readonly coord: ChunkCoord;
  readonly lod: "gameplay" | "high" | "low";
  readonly batches: readonly ChunkGeometryBatch[];
  readonly metrics: ChunkGeometryMetrics;
  readonly collisionBoxes: readonly {
    readonly id: string;
    readonly bounds: Bounds2;
    readonly heightM: number;
  }[];
}
