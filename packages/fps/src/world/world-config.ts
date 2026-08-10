import type { WorldConfig } from "./world-types.js";

export const DEFAULT_WORLD_CONFIG: WorldConfig = {
  seed: "fps-city-demo-001",
  generatorVersion: 1,
  worldSizeM: 1000,
  chunkSizeM: 50,
  layoutCellSizeM: 5,
  streetPitchM: 100,
  arterialPitchM: 200,
  streetWidthM: 10,
  arterialWidthM: 15,
  sidewalkWidthM: 3,
  combatDistrictSizeM: 300,
  combatGraphSnapM: 10,
  nominalRunSpeedMps: 6,
  maxGenerationAttempts: 32,
};

const assertPositive = (value: number, name: string): void => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`world_config_invalid_${name}`);
};

export const validateWorldConfig = (config: WorldConfig): void => {
  if (config.seed.trim().length === 0) throw new Error("world_config_invalid_seed");
  if (!Number.isSafeInteger(config.generatorVersion) || config.generatorVersion < 1) {
    throw new Error("world_config_invalid_generator_version");
  }
  assertPositive(config.worldSizeM, "world_size");
  assertPositive(config.chunkSizeM, "chunk_size");
  assertPositive(config.layoutCellSizeM, "layout_cell_size");
  assertPositive(config.streetPitchM, "street_pitch");
  assertPositive(config.arterialPitchM, "arterial_pitch");
  assertPositive(config.streetWidthM, "street_width");
  assertPositive(config.arterialWidthM, "arterial_width");
  assertPositive(config.sidewalkWidthM, "sidewalk_width");
  assertPositive(config.combatDistrictSizeM, "combat_district_size");
  assertPositive(config.combatGraphSnapM, "combat_graph_snap");
  assertPositive(config.nominalRunSpeedMps, "nominal_run_speed");
  if (!Number.isSafeInteger(config.maxGenerationAttempts) || config.maxGenerationAttempts < 1) {
    throw new Error("world_config_invalid_generation_attempts");
  }
  if (!Number.isInteger(config.worldSizeM / config.chunkSizeM)) {
    throw new Error("world_config_chunk_grid_not_integer");
  }
  if (!Number.isInteger(config.chunkSizeM / config.layoutCellSizeM)) {
    throw new Error("world_config_layout_grid_not_integer");
  }
  if (!Number.isInteger(config.combatDistrictSizeM / config.chunkSizeM)) {
    throw new Error("world_config_combat_chunk_grid_not_integer");
  }
  // The v0.1 combat template and its fixed timing/visibility envelopes are
  // authored for one 300 m district. Keep arbitrary city/chunk dimensions
  // configurable, but reject an uncalibrated competitive district instead of
  // silently returning a plan that cannot satisfy the hard gameplay gates.
  if (config.combatDistrictSizeM !== 300) {
    throw new Error("world_config_combat_district_size_unsupported");
  }
  if (config.streetPitchM > config.worldSizeM || config.arterialPitchM > config.worldSizeM) {
    throw new Error("world_config_road_pitch_out_of_bounds");
  }
  if (config.arterialPitchM < config.streetPitchM) {
    throw new Error("world_config_arterial_pitch_too_small");
  }
  if (config.streetWidthM + config.sidewalkWidthM * 2 >= config.streetPitchM) {
    throw new Error("world_config_street_corridor_too_wide");
  }
  if (config.arterialWidthM + config.sidewalkWidthM * 2 >= config.streetPitchM * 2) {
    throw new Error("world_config_arterial_corridor_too_wide");
  }
  const chunksPerAxis = config.worldSizeM / config.chunkSizeM;
  const districtChunks = config.combatDistrictSizeM / config.chunkSizeM;
  if (districtChunks > chunksPerAxis - 4) {
    throw new Error("world_config_combat_district_too_large");
  }
};

export const resolveWorldConfig = (overrides: Partial<WorldConfig> = {}): WorldConfig => {
  const config: WorldConfig = { ...DEFAULT_WORLD_CONFIG, ...overrides };
  validateWorldConfig(config);
  return config;
};
