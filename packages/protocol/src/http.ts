import { z } from "zod";
import {
  botDifficultySchema,
  botPersonalitySchema,
  branchIdSchema,
  coachVerbositySchema,
  conceptIdSchema,
  decisionIdSchema,
  gameKeySchema,
  gameModeSchema,
  handIdSchema,
  hintLevelSchema,
  identifierSchema,
  narratorProviderSchema,
  nonNegativeIntegerSchema,
  playerIdSchema,
  requestIdSchema,
  revisionSchema,
  windSchema,
} from "./common.js";
import {
  actionSubmissionSchema,
  playerObservationSchema,
  protocolErrorSchema,
  publicGameEventSchema,
  publicHandResultSchema,
} from "./schemas.js";

export const rulesetSummarySchema = z
  .object({
    id: identifierSchema,
    version: identifierSchema,
    hash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    displayName: z.string().min(1).max(512),
    description: z.string().min(1).max(4000),
    disclaimer: z.string().min(1).max(4000),
    minimumFaan: nonNegativeIntegerSchema,
    capFaan: nonNegativeIntegerSchema,
    bonusTilesEnabled: z.boolean(),
  })
  .strict();

export const createGameRequestSchema = z
  .object({
    mode: gameModeSchema,
    rulesetId: identifierSchema,
    matchLength: z.enum(["one_wind", "full_four_winds"]),
    seed: identifierSchema.optional(),
    human: z
      .object({
        displayName: z.string().trim().min(1).max(128),
        preferredSeat: windSchema.optional(),
      })
      .strict(),
    opponents: z
      .array(
        z
          .object({
            displayName: z.string().trim().min(1).max(128),
            difficulty: botDifficultySchema,
            personality: botPersonalitySchema,
          })
          .strict(),
      )
      .length(3),
    coach: z
      .object({
        enabled: z.boolean(),
        provider: narratorProviderSchema,
        verbosity: coachVerbositySchema,
      })
      .strict(),
  })
  .strict();

export const createGameResponseSchema = z
  .object({
    game: gameKeySchema,
    observation: playerObservationSchema,
  })
  .strict();

export const observationQuerySchema = z
  .object({
    playerId: playerIdSchema,
    branchId: branchIdSchema,
  })
  .strict();

export const actionRequestSchema = actionSubmissionSchema;

export const actionResponseSchema = z
  .object({
    accepted: z.literal(true),
    observation: playerObservationSchema,
    publicEvents: z.array(publicGameEventSchema),
  })
  .strict();

export const hintRequestSchema = z
  .object({
    playerId: playerIdSchema,
    branchId: branchIdSchema,
    expectedRevision: revisionSchema,
    requestId: requestIdSchema,
    level: hintLevelSchema.exclude(["none"]),
  })
  .strict();

export const hintResponseSchema = z
  .object({
    status: z.enum(["template", "provider", "fallback", "unavailable"]),
    level: hintLevelSchema.exclude(["none"]),
    headline: z.string().min(1).max(1000),
    explanation: z.string().min(1).max(5000),
    recommendedActionId: identifierSchema.nullable(),
    factIds: z.array(identifierSchema),
    conceptIds: z.array(conceptIdSchema),
  })
  .strict();

export const branchRequestSchema = z
  .object({
    playerId: playerIdSchema,
    parentBranchId: branchIdSchema,
    branchId: branchIdSchema,
    decisionId: decisionIdSchema,
    expectedRevision: revisionSchema,
    requestId: requestIdSchema,
  })
  .strict();

export const branchResponseSchema = z
  .object({
    game: gameKeySchema,
    parent: gameKeySchema,
    forkRevision: revisionSchema,
    forkStateHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    observation: playerObservationSchema,
  })
  .strict();

export const profileSchema = z
  .object({
    learnerId: identifierSchema,
    displayName: z.string().min(1).max(128),
    languageOverlays: z.array(z.enum(["zhHant", "zhHans", "jyutping", "pinyin"])),
    highContrast: z.boolean(),
    reducedMotion: z.boolean(),
    narratorStatus: z.enum(["templates", "provider_available", "provider_unavailable"]),
  })
  .strict();

export const profilePatchSchema = z
  .object({
    displayName: z.string().trim().min(1).max(128).optional(),
    languageOverlays: z.array(z.enum(["zhHant", "zhHans", "jyutping", "pinyin"])).optional(),
    highContrast: z.boolean().optional(),
    reducedMotion: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Profile patch must change at least one value");

export const conceptMasterySchema = z
  .object({
    learnerId: identifierSchema,
    conceptId: conceptIdSchema,
    mastery: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    attempts: nonNegativeIntegerSchema,
    independentAttempts: nonNegativeIntegerSchema,
    successfulAttempts: nonNegativeIntegerSchema,
    hintWeightedScore: z.number().nonnegative(),
    lastSeenAt: z.iso.datetime().nullable(),
    nextReviewAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime(),
    algorithmVersion: identifierSchema,
  })
  .strict();

export const drillSessionRequestSchema = z
  .object({
    learnerId: identifierSchema.optional(),
    mode: gameModeSchema.optional(),
    conceptIds: z.array(conceptIdSchema).max(8).optional(),
  })
  .strict();

export const drillAnswerRequestSchema = z
  .object({
    requestId: requestIdSchema,
    answer: z.unknown(),
    hintLevel: hintLevelSchema,
  })
  .strict();

export const reviewSchema = z
  .object({
    handId: handIdSchema,
    result: publicHandResultSchema,
    highImpactDecisionIds: z.array(decisionIdSchema).max(3),
    positiveDecisionId: decisionIdSchema.nullable(),
    nextDrillConceptId: conceptIdSchema.nullable(),
    omniscientAvailable: z.boolean(),
  })
  .strict();

export const replayResponseSchema = z
  .object({
    game: gameKeySchema,
    viewerPlayerId: playerIdSchema,
    events: z.array(publicGameEventSchema),
    terminalObservation: playerObservationSchema,
    omniscientAvailable: z.boolean(),
  })
  .strict();

export const apiErrorResponseSchema = z.object({ error: protocolErrorSchema }).strict();

export const healthResponseSchema = z
  .object({
    status: z.literal("ready"),
    schemaVersion: z.literal(1),
  })
  .strict();

export type CreateGameRequest = z.infer<typeof createGameRequestSchema>;
export type CreateGameResponse = z.infer<typeof createGameResponseSchema>;
export type ActionResponse = z.infer<typeof actionResponseSchema>;
export type HintRequest = z.infer<typeof hintRequestSchema>;
export type BranchRequest = z.infer<typeof branchRequestSchema>;
export type BranchResponse = z.infer<typeof branchResponseSchema>;
