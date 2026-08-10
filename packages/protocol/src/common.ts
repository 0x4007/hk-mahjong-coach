import { z } from "zod";

export const PROTOCOL_VERSION = 1 as const;

const isIsoTimestamp = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)) {
    return false;
  }
  return Number.isFinite(Date.parse(value));
};

export const protocolVersionSchema = z.literal(PROTOCOL_VERSION);
export const protocolTimestampSchema = z
  .string()
  .refine(isIsoTimestamp, "Expected an ISO-8601 UTC timestamp");
export const nonEmptyStringSchema = z.string().trim().min(1).max(512);
export const identifierSchema = nonEmptyStringSchema.max(256);
export const gameIdSchema = identifierSchema;
export const branchIdSchema = identifierSchema;
export const playerIdSchema = identifierSchema;
export const requestIdSchema = identifierSchema;
export const eventIdSchema = identifierSchema;
export const actionIdSchema = identifierSchema;
export const handIdSchema = identifierSchema;
export const decisionIdSchema = identifierSchema;
export const factIdSchema = identifierSchema;
export const conceptIdSchema = identifierSchema;
export const safeIntegerSchema = z.number().int();
export const nonNegativeIntegerSchema = safeIntegerSchema.nonnegative();
export const revisionSchema = nonNegativeIntegerSchema;
export const probabilitySchema = z.number().min(0).max(1);
export const hashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u, "Expected a SHA-256 hash");

export const windSchema = z.enum(["east", "south", "west", "north"]);
export const gameModeSchema = z.enum([
  "learn",
  "guided",
  "socratic",
  "competitive",
  "exam",
  "sandbox",
]);
export const matchLengthSchema = z.enum(["one_wind", "full_four_winds"]);
export const playerControllerSchema = z.enum(["human", "bot", "external_llm"]);
export const eventVisibilitySchema = z.enum(["public", "internal"]);
export const hintLevelSchema = z.enum(["none", "nudge", "compare", "reveal"]);
export const narratorProviderSchema = z.enum(["templates", "openai"]);
export const coachVerbositySchema = z.enum(["brief", "normal", "detailed"]);
export const botDifficultySchema = z.enum([
  "novice",
  "basic",
  "intermediate",
  "advanced",
  "adaptive",
]);
export const botPersonalitySchema = z.enum(["fast", "value", "balanced"]);
export const standardTileTypeIdSchema = z
  .string()
  .regex(
    /^(?:characters|dots|bamboo)\.[1-9]$|^(?:wind\.(?:east|south|west|north)|dragon\.(?:red|green|white))$/u,
    "Expected a standard tile type ID",
  );
export const tileTypeIdSchema = z
  .string()
  .regex(
    /^(?:characters|dots|bamboo)\.[1-9]$|^(?:wind\.(?:east|south|west|north)|dragon\.(?:red|green|white)|flower\.(?:plum|orchid|chrysanthemum|bamboo)|season\.(?:spring|summer|autumn|winter))$/u,
    "Expected a tile type ID",
  );
export const tileInstanceIdSchema = z
  .string()
  .regex(
    /^(?:characters|dots|bamboo)\.[1-9]#[1-4]$|^(?:wind\.(?:east|south|west|north)|dragon\.(?:red|green|white))#[1-4]$|^(?:flower\.(?:plum|orchid|chrysanthemum|bamboo)|season\.(?:spring|summer|autumn|winter))#1$/u,
    "Expected a tile instance ID",
  );

export const gameKeySchema = z
  .object({
    gameId: gameIdSchema,
    branchId: branchIdSchema,
  })
  .strict();

export const jsonRecordSchema = z.record(z.string(), z.unknown());

export type GameKey = z.infer<typeof gameKeySchema>;
export type GameMode = z.infer<typeof gameModeSchema>;
export type HintLevel = z.infer<typeof hintLevelSchema>;
export type BotDifficulty = z.infer<typeof botDifficultySchema>;
export type BotPersonality = z.infer<typeof botPersonalitySchema>;
