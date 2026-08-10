import { allChunkCoords, isValidChunkCoord } from "../coordinates.js";
import { deriveChunkPlan } from "./derive-chunk-plan.js";
import { DEFAULT_CHUNK_STREAMING_CONFIG, resolveChunkLod } from "./chunk-lod.js";
import type {
  ChunkCoord,
  ChunkGeometry,
  ChunkPlan,
  ChunkRuntimeState,
  ChunkState,
  ChunkStreamingConfig,
  ChunkStreamingMetrics,
  Vec2,
  WorldPlan,
} from "../world-types.js";

const key = (coord: ChunkCoord): string => `${String(coord.x)}:${String(coord.z)}`;

const chebyshevDistance = (left: ChunkCoord, right: ChunkCoord): number =>
  Math.max(Math.abs(left.x - right.x), Math.abs(left.z - right.z));

const inFrontOfVelocity = (origin: ChunkCoord, candidate: ChunkCoord, velocity: Vec2): boolean => {
  const deltaX = candidate.x - origin.x;
  const deltaZ = candidate.z - origin.z;
  return deltaX * velocity.x + deltaZ * velocity.z > 0;
};

export class ChunkManager {
  private readonly states = new Map<string, ChunkRuntimeState>();
  private readonly plans = new Map<string, ChunkPlan>();
  private readonly geometryMetrics = new Map<string, ChunkGeometry["metrics"]>();
  private readonly pinnedCombatChunkKeys = new Set<string>();
  private totalBuilds = 0;
  private lastBuildTimeMs = 0;
  private longestBuildTimeMs = 0;
  private longestGenerationFrameMs = 0;
  private readonly config: ChunkStreamingConfig;

  public constructor(
    private readonly worldPlan: WorldPlan,
    config: ChunkStreamingConfig = DEFAULT_CHUNK_STREAMING_CONFIG,
  ) {
    if (
      config.gameplayRadiusChunks < 0 ||
      config.lowDetailRadiusChunks < config.gameplayRadiusChunks ||
      config.unloadRadiusChunks <= config.lowDetailRadiusChunks ||
      config.buildBudgetMs <= 0
    ) {
      throw new Error("world_chunk_streaming_config_invalid");
    }
    this.config = config;
    for (
      let chunkX = worldPlan.combatDistrict.chunkMin.x;
      chunkX < worldPlan.combatDistrict.chunkMin.x + worldPlan.combatDistrict.chunkSize;
      chunkX += 1
    ) {
      for (
        let chunkZ = worldPlan.combatDistrict.chunkMin.z;
        chunkZ < worldPlan.combatDistrict.chunkMin.z + worldPlan.combatDistrict.chunkSize;
        chunkZ += 1
      ) {
        this.pinnedCombatChunkKeys.add(key({ x: chunkX, z: chunkZ }));
      }
    }
    for (const coord of allChunkCoords(worldPlan.config)) {
      this.states.set(key(coord), {
        coord,
        state: "unloaded",
        lod: "unloaded",
        distanceChunks: Number.POSITIVE_INFINITY,
        priority: Number.POSITIVE_INFINITY,
      });
    }
  }

  public getChunkPlan(coord: ChunkCoord): ChunkPlan {
    const chunkKey = key(coord);
    const cached = this.plans.get(chunkKey);
    if (cached !== undefined) return cached;
    const plan = deriveChunkPlan(this.worldPlan, coord);
    this.plans.set(chunkKey, plan);
    return plan;
  }

  public update(playerCoord: ChunkCoord, velocity: Vec2): readonly ChunkRuntimeState[] {
    const nextStates: ChunkRuntimeState[] = [];
    for (const current of this.states.values()) {
      const distanceChunks = chebyshevDistance(playerCoord, current.coord);
      const plan = this.getChunkPlan(current.coord);
      const pinnedCombat = this.pinnedCombatChunkKeys.has(key(current.coord));
      const resolvedLod = pinnedCombat
        ? "gameplay"
        : resolveChunkLod(distanceChunks, plan.isInsideCombatDistrict, this.config);
      // Keep an already materialized visual chunk alive until the wider
      // unload radius is crossed. This hysteresis prevents boundary jitter
      // from repeatedly destroying and rebuilding the same chunk.
      const lod =
        resolvedLod === "unloaded" &&
        current.lod !== "unloaded" &&
        distanceChunks <= this.config.unloadRadiusChunks
          ? "low"
          : resolvedLod;
      const aheadBonus = inFrontOfVelocity(playerCoord, current.coord, velocity) ? -10 : 0;
      const priority =
        distanceChunks * 10 +
        aheadBonus +
        (lod === "gameplay" ? -100 : lod === "high" ? 0 : lod === "low" ? 100 : 1000);
      const state: ChunkState =
        lod === "unloaded"
          ? "cached"
          : lod === "gameplay"
            ? "active-high"
            : lod === "high"
              ? "active-high"
              : "active-low";
      const next = { coord: current.coord, state, lod, distanceChunks, priority };
      this.states.set(key(current.coord), next);
      nextStates.push(next);
    }
    return nextStates.sort((left, right) => left.priority - right.priority);
  }

  public getState(coord: ChunkCoord): ChunkRuntimeState | undefined {
    return this.states.get(key(coord));
  }

  public recordGenerationFrame(elapsedMs: number): void {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
      throw new Error("world_chunk_generation_frame_time_invalid");
    }
    this.longestGenerationFrameMs = Math.max(this.longestGenerationFrameMs, elapsedMs);
  }

  public getLoadedStates(): readonly ChunkRuntimeState[] {
    return [...this.states.values()].filter((state) => state.lod !== "unloaded");
  }

  public getQueue(): readonly ChunkRuntimeState[] {
    return [...this.states.values()]
      .filter((state) => state.lod !== "unloaded")
      .sort((left, right) => left.priority - right.priority);
  }

  /** Record a completed renderer build for the debug/performance surface. */
  public recordBuild(coord: ChunkCoord, geometry: ChunkGeometry, elapsedMs: number): void {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
      throw new Error("world_chunk_build_time_invalid");
    }
    if (!isValidChunkCoord(this.worldPlan.config, coord)) {
      throw new Error("world_chunk_coordinate_out_of_bounds");
    }
    this.geometryMetrics.set(key(coord), geometry.metrics);
    this.totalBuilds += 1;
    this.lastBuildTimeMs = elapsedMs;
    this.longestBuildTimeMs = Math.max(this.longestBuildTimeMs, elapsedMs);
  }

  public getMetrics(): ChunkStreamingMetrics {
    const loaded = new Set(this.getLoadedStates().map((state) => key(state.coord)));
    let drawCalls = 0;
    let triangles = 0;
    let geometryBytes = 0;
    let textureBytes = 0;
    for (const [chunkKey, metrics] of this.geometryMetrics) {
      if (!loaded.has(chunkKey)) continue;
      drawCalls += metrics.drawCalls;
      triangles += metrics.triangles;
      geometryBytes += metrics.geometryBytes;
      textureBytes += metrics.textureBytes;
    }
    const activeStates = this.getLoadedStates();
    return {
      activeChunkCount: loaded.size,
      activeGameplayChunkCount: activeStates.filter((state) => state.lod === "gameplay").length,
      activeHighChunkCount: activeStates.filter((state) => state.lod === "high").length,
      activeLowChunkCount: activeStates.filter((state) => state.lod === "low").length,
      queueLength: this.getQueue().length,
      totalBuilds: this.totalBuilds,
      lastBuildTimeMs: this.lastBuildTimeMs,
      longestBuildTimeMs: this.longestBuildTimeMs,
      longestGenerationFrameMs: this.longestGenerationFrameMs,
      drawCalls,
      triangles,
      geometryBytes,
      textureBytes,
    };
  }
}
