import type {
  ChunkCoord,
  ChunkRuntimeState,
  ChunkStreamingMetrics,
  CombatValidation,
  WorldPlan,
} from "../world-types.js";

export type WorldDebugLayer =
  | "chunk-boundaries"
  | "planning-grid"
  | "road-graph"
  | "building-masses"
  | "combat-graph"
  | "walkable-routes"
  | "route-widths"
  | "walkable-cells"
  | "attacker-region"
  | "defender-region"
  | "objective-markers"
  | "choke-points"
  | "visibility-lines"
  | "cover-influence"
  | "validation-failures";

export interface WorldDebugToggles {
  readonly chunkBoundaries: boolean;
  readonly planningGrid: boolean;
  readonly roadGraph: boolean;
  readonly buildingMasses: boolean;
  readonly combatGraph: boolean;
  readonly walkableRoutes: boolean;
  readonly routeWidths: boolean;
  readonly walkableCells: boolean;
  readonly attackerRegion: boolean;
  readonly defenderRegion: boolean;
  readonly objectiveMarkers: boolean;
  readonly chokePoints: boolean;
  readonly visibilityLines: boolean;
  readonly coverInfluence: boolean;
  readonly validationFailures: boolean;
  readonly freezeStreaming: boolean;
}

export interface WorldDebugSnapshot {
  readonly seed: string;
  readonly planHash: string;
  readonly chunksPerAxis: number;
  readonly generationTimeMs: number;
  readonly loadedChunkKeys: readonly string[];
  readonly loadedChunkStates: readonly ChunkRuntimeState[];
  readonly streamingMetrics: ChunkStreamingMetrics;
  readonly validation: CombatValidation;
  readonly toggles: WorldDebugToggles;
  readonly teleportChunk: ChunkCoord | null;
}

export interface WorldDebugState {
  readonly getSnapshot: () => WorldDebugSnapshot;
  readonly setLayerVisible: (layer: WorldDebugLayer, visible: boolean) => void;
  readonly setFreezeStreaming: (frozen: boolean) => void;
  readonly setLoadedChunks: (chunks: readonly ChunkCoord[]) => void;
  readonly setLoadedChunkStates: (states: readonly ChunkRuntimeState[]) => void;
  readonly setStreamingMetrics: (metrics: ChunkStreamingMetrics) => void;
  readonly requestTeleport: (coord: ChunkCoord) => void;
  readonly consumeTeleport: () => ChunkCoord | null;
}

const initialToggles = (): WorldDebugToggles => ({
  chunkBoundaries: true,
  planningGrid: true,
  roadGraph: true,
  buildingMasses: false,
  combatGraph: true,
  walkableRoutes: true,
  routeWidths: true,
  walkableCells: true,
  attackerRegion: true,
  defenderRegion: true,
  objectiveMarkers: true,
  chokePoints: true,
  visibilityLines: true,
  coverInfluence: true,
  validationFailures: true,
  freezeStreaming: false,
});

const layerKey: Record<WorldDebugLayer, keyof WorldDebugToggles> = {
  "chunk-boundaries": "chunkBoundaries",
  "planning-grid": "planningGrid",
  "road-graph": "roadGraph",
  "building-masses": "buildingMasses",
  "combat-graph": "combatGraph",
  "walkable-routes": "walkableRoutes",
  "route-widths": "routeWidths",
  "walkable-cells": "walkableCells",
  "attacker-region": "attackerRegion",
  "defender-region": "defenderRegion",
  "objective-markers": "objectiveMarkers",
  "choke-points": "chokePoints",
  "visibility-lines": "visibilityLines",
  "cover-influence": "coverInfluence",
  "validation-failures": "validationFailures",
};

const chunkKey = (coord: ChunkCoord): string => `${String(coord.x)}:${String(coord.z)}`;

const compareChunkKeys = (left: ChunkCoord, right: ChunkCoord): number => {
  const leftKey = chunkKey(left);
  const rightKey = chunkKey(right);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
};

export const createWorldDebugState = (plan: WorldPlan, generationTimeMs = 0): WorldDebugState => {
  if (!Number.isFinite(generationTimeMs) || generationTimeMs < 0) {
    throw new Error("world_debug_generation_time_invalid");
  }
  let toggles = initialToggles();
  let loadedChunkKeys: readonly string[] = [];
  let loadedChunkStates: readonly ChunkRuntimeState[] = [];
  let streamingMetrics: ChunkStreamingMetrics = {
    activeChunkCount: 0,
    activeGameplayChunkCount: 0,
    activeHighChunkCount: 0,
    activeLowChunkCount: 0,
    queueLength: 0,
    totalBuilds: 0,
    lastBuildTimeMs: 0,
    longestBuildTimeMs: 0,
    longestGenerationFrameMs: 0,
    drawCalls: 0,
    triangles: 0,
    geometryBytes: 0,
    textureBytes: 0,
  };
  let teleportChunk: ChunkCoord | null = null;
  return {
    getSnapshot: () => ({
      seed: plan.seed,
      planHash: plan.planHash,
      chunksPerAxis: plan.chunksPerAxis,
      generationTimeMs,
      loadedChunkKeys,
      loadedChunkStates,
      streamingMetrics,
      validation: plan.combatDistrict.validation,
      toggles,
      teleportChunk,
    }),
    setLayerVisible: (layer, visible) => {
      const key = layerKey[layer];
      toggles = { ...toggles, [key]: visible };
    },
    setFreezeStreaming: (frozen) => {
      toggles = { ...toggles, freezeStreaming: frozen };
    },
    setLoadedChunks: (chunks) => {
      loadedChunkKeys = [...new Set(chunks.map(chunkKey))].sort();
      loadedChunkStates = chunks
        .reduce<ChunkRuntimeState[]>((states, coord) => {
          if (states.some((state) => chunkKey(state.coord) === chunkKey(coord))) return states;
          states.push({
            coord,
            state: "active-high",
            lod: "high",
            distanceChunks: 0,
            priority: 0,
          });
          return states;
        }, [])
        .sort((left, right) => compareChunkKeys(left.coord, right.coord));
    },
    setLoadedChunkStates: (states) => {
      loadedChunkStates = [...states].sort((left, right) => {
        const priority = left.priority - right.priority;
        return priority !== 0 ? priority : compareChunkKeys(left.coord, right.coord);
      });
      loadedChunkKeys = loadedChunkStates.map((state) => chunkKey(state.coord)).sort();
    },
    setStreamingMetrics: (metrics) => {
      streamingMetrics = { ...metrics };
    },
    requestTeleport: (coord) => {
      if (
        !Number.isSafeInteger(coord.x) ||
        !Number.isSafeInteger(coord.z) ||
        coord.x < 0 ||
        coord.z < 0 ||
        coord.x >= plan.chunksPerAxis ||
        coord.z >= plan.chunksPerAxis
      ) {
        throw new Error("world_debug_teleport_chunk_out_of_bounds");
      }
      teleportChunk = { x: coord.x, z: coord.z };
    },
    consumeTeleport: () => {
      const requested = teleportChunk;
      teleportChunk = null;
      return requested;
    },
  };
};
