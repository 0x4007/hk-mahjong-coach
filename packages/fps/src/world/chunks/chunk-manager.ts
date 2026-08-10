import { allChunkCoords } from "../coordinates.js";
import { deriveChunkPlan } from "./derive-chunk-plan.js";
import { DEFAULT_CHUNK_STREAMING_CONFIG, resolveChunkLod } from "./chunk-lod.js";
import type {
  ChunkCoord,
  ChunkPlan,
  ChunkRuntimeState,
  ChunkState,
  ChunkStreamingConfig,
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
  private readonly config: ChunkStreamingConfig;

  public constructor(
    private readonly worldPlan: WorldPlan,
    config: ChunkStreamingConfig = DEFAULT_CHUNK_STREAMING_CONFIG,
  ) {
    if (config.gameplayRadiusChunks < 0 || config.lowDetailRadiusChunks < config.gameplayRadiusChunks || config.unloadRadiusChunks <= config.lowDetailRadiusChunks || config.buildBudgetMs <= 0) {
      throw new Error("world_chunk_streaming_config_invalid");
    }
    this.config = config;
    for (const coord of allChunkCoords(worldPlan.config)) {
      this.states.set(key(coord), { coord, state: "unloaded", lod: "unloaded", distanceChunks: Number.POSITIVE_INFINITY, priority: Number.POSITIVE_INFINITY });
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
      const lod = resolveChunkLod(distanceChunks, plan.isInsideCombatDistrict, this.config);
      const aheadBonus = inFrontOfVelocity(playerCoord, current.coord, velocity) ? -10 : 0;
      const priority = distanceChunks * 10 + aheadBonus + (lod === "gameplay" ? -100 : lod === "high" ? 0 : lod === "low" ? 100 : 1000);
      const state: ChunkState = lod === "unloaded" ? "cached" : lod === "gameplay" ? "active-high" : lod === "high" ? "active-high" : "active-low";
      const next = { coord: current.coord, state, lod, distanceChunks, priority };
      this.states.set(key(current.coord), next);
      nextStates.push(next);
    }
    return nextStates.sort((left, right) => left.priority - right.priority);
  }

  public getState(coord: ChunkCoord): ChunkRuntimeState | undefined {
    return this.states.get(key(coord));
  }

  public getLoadedStates(): readonly ChunkRuntimeState[] {
    return [...this.states.values()].filter((state) => state.lod !== "unloaded");
  }

  public getQueue(): readonly ChunkRuntimeState[] {
    return [...this.states.values()]
      .filter((state) => state.lod !== "unloaded")
      .sort((left, right) => left.priority - right.priority);
  }
}
