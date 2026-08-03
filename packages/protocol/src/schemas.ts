import { z } from "zod";
import {
  actionIdSchema,
  branchIdSchema,
  eventIdSchema,
  gameIdSchema,
  gameModeSchema,
  hashSchema,
  identifierSchema,
  nonNegativeIntegerSchema,
  playerControllerSchema,
  playerIdSchema,
  requestIdSchema,
  revisionSchema,
  standardTileTypeIdSchema,
  tileInstanceIdSchema,
  tileTypeIdSchema,
  windSchema,
} from "./common.js";

export const winningFormSchema = z.enum([
  "standard",
  "seven_pairs",
  "thirteen_orphans",
  "nine_gates",
]);
export const winSourceSchema = z.enum([
  "self_draw",
  "discard",
  "robbing_kong",
  "replacement",
  "initial_deal",
]);

export const scoringPreviewSchema = z
  .object({
    shapeComplete: z.boolean(),
    legalWin: z.boolean(),
    rawFaan: nonNegativeIntegerSchema,
    cappedFaan: nonNegativeIntegerSchema,
    minimumRequired: nonNegativeIntegerSchema,
    missingFaan: nonNegativeIntegerSchema,
    appliedRuleIds: z.array(identifierSchema),
    winningForm: winningFormSchema.nullable(),
    reason: z.enum([
      "legal",
      "shape_incomplete",
      "below_minimum_faan",
      "passed_win_restriction",
      "kong_robbery_form_not_allowed",
    ]),
  })
  .strict();

export const legalActionSchema = z.discriminatedUnion("type", [
  z
    .object({
      id: actionIdSchema,
      type: z.literal("discard"),
      tileId: tileInstanceIdSchema,
    })
    .strict(),
  z
    .object({
      id: actionIdSchema,
      type: z.literal("declare_win"),
      source: winSourceSchema,
      preview: scoringPreviewSchema,
    })
    .strict(),
  z
    .object({
      id: actionIdSchema,
      type: z.literal("declare_concealed_kong"),
      tileIds: z.array(tileInstanceIdSchema).min(4).max(4),
    })
    .strict(),
  z
    .object({
      id: actionIdSchema,
      type: z.literal("declare_added_kong"),
      meldId: identifierSchema,
      tileId: tileInstanceIdSchema,
    })
    .strict(),
  z
    .object({
      id: actionIdSchema,
      type: z.literal("claim_chow"),
      discardId: identifierSchema,
      tileIdsFromHand: z.array(tileInstanceIdSchema).length(2),
    })
    .strict(),
  z
    .object({
      id: actionIdSchema,
      type: z.literal("claim_pung"),
      discardId: identifierSchema,
      tileIdsFromHand: z.array(tileInstanceIdSchema).length(2),
    })
    .strict(),
  z
    .object({
      id: actionIdSchema,
      type: z.literal("claim_kong"),
      discardId: identifierSchema,
      tileIdsFromHand: z.array(tileInstanceIdSchema).length(3),
    })
    .strict(),
  z
    .object({
      id: actionIdSchema,
      type: z.literal("claim_win"),
      windowId: identifierSchema,
      source: z.enum(["discard", "robbing_kong"]),
      discardId: identifierSchema.nullable(),
      tileTypeId: tileTypeIdSchema,
      meldId: identifierSchema.nullable(),
      preview: scoringPreviewSchema,
    })
    .strict(),
  z
    .object({
      id: actionIdSchema,
      type: z.literal("pass"),
      windowId: identifierSchema,
    })
    .strict(),
  z
    .object({
      id: actionIdSchema,
      type: z.literal("start_next_hand"),
      completedHandId: identifierSchema,
    })
    .strict(),
]);

const scoringRuleValueSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("faan"), amount: nonNegativeIntegerSchema }).strict(),
  z.object({ type: z.literal("limit") }).strict(),
]);

const winningDecompositionSchema = z
  .object({
    form: winningFormSchema,
    concealedGroups: z.array(
      z
        .object({
          kind: z.enum(["chow", "pung", "pair"]),
          tileTypes: z.array(standardTileTypeIdSchema).min(2).max(3),
        })
        .strict(),
    ),
    declaredMeldIds: z.array(identifierSchema),
  })
  .strict();

const winningDecompositionSummarySchema = z
  .object({
    decomposition: winningDecompositionSchema,
    rawFaan: nonNegativeIntegerSchema,
    cappedFaan: nonNegativeIntegerSchema,
    legalWin: z.boolean(),
    appliedRuleIds: z.array(identifierSchema),
  })
  .strict();

const appliedScoringRuleSchema = z
  .object({
    ruleId: identifierSchema,
    name: identifierSchema,
    value: scoringRuleValueSchema,
    occurrences: nonNegativeIntegerSchema,
    faanContribution: nonNegativeIntegerSchema,
    impliedByRuleIds: z.array(identifierSchema),
  })
  .strict();

const suppressedScoringRuleSchema = z
  .object({
    ruleId: identifierSchema,
    name: identifierSchema,
    value: scoringRuleValueSchema,
    occurrences: nonNegativeIntegerSchema,
    wouldAddFaan: nonNegativeIntegerSchema,
    reason: z.enum([
      "suppressed_by_rule",
      "suppressed_by_stacking_group",
      "excluded_by_rule",
      "limit_aggregation",
    ]),
    byRuleIds: z.array(identifierSchema),
  })
  .strict();

const paymentSchema = z
  .object({
    fromPlayerId: playerIdSchema,
    toPlayerId: playerIdSchema,
    points: nonNegativeIntegerSchema,
    basePoints: nonNegativeIntegerSchema,
    multiplier: nonNegativeIntegerSchema,
    reasons: z.array(z.enum(["discarder", "other_loser", "self_draw", "dealer"])),
  })
  .strict();

export const publicScoringResultSchema = z
  .object({
    rulesetId: identifierSchema,
    rulesetVersion: identifierSchema,
    rulesetHash: hashSchema,
    winnerId: playerIdSchema,
    winningTileTypeId: tileTypeIdSchema,
    winSource: winSourceSchema,
    decomposition: winningDecompositionSchema,
    alternatives: z.array(winningDecompositionSummarySchema),
    applied: z.array(appliedScoringRuleSchema),
    suppressed: z.array(suppressedScoringRuleSchema),
    rawFaan: nonNegativeIntegerSchema,
    cappedFaan: nonNegativeIntegerSchema,
    minimumRequired: nonNegativeIntegerSchema,
    missingFaan: nonNegativeIntegerSchema,
    legalWin: z.boolean(),
    basePoints: nonNegativeIntegerSchema,
    payments: z.array(paymentSchema),
    standardComparison: z
      .object({
        rulesetId: identifierSchema,
        rulesetVersion: identifierSchema,
        rulesetHash: hashSchema,
        rawFaan: nonNegativeIntegerSchema,
        cappedFaan: nonNegativeIntegerSchema,
        minimumRequired: nonNegativeIntegerSchema,
        missingFaan: nonNegativeIntegerSchema,
        legalWin: z.boolean(),
        appliedRuleIds: z.array(identifierSchema),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const publicHandResultSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("win"),
      winners: z.array(
        z
          .object({
            playerId: playerIdSchema,
            source: winSourceSchema,
            winningTileTypeId: tileTypeIdSchema,
            fromPlayerId: playerIdSchema.nullable(),
            preview: scoringPreviewSchema,
            scoring: publicScoringResultSchema,
          })
          .strict(),
      ),
      scoreDeltas: z.record(playerIdSchema, z.number().int()),
    })
    .strict(),
  z
    .object({
      kind: z.enum(["exhaustive_draw", "sandbox_end"]),
      winners: z.tuple([]),
      scoreDeltas: z.record(playerIdSchema, z.number().int()),
    })
    .strict(),
]);

export const publicMeldSchema = z
  .object({
    id: identifierSchema,
    kind: z.enum(["chow", "pung", "kong"]),
    kongKind: z.enum(["exposed", "concealed", "added"]).nullable(),
    tileTypes: z.array(tileTypeIdSchema).min(3).max(4),
    exposed: z.boolean(),
    claimedFrom: playerIdSchema.nullable(),
  })
  .strict();

export const publicDiscardSchema = z
  .object({
    id: identifierSchema,
    tileType: tileTypeIdSchema,
    claimedBy: playerIdSchema.nullable(),
    winningPlayerIds: z.array(playerIdSchema),
  })
  .strict();

const publicPendingDecisionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("discard_claim"),
      windowId: identifierSchema,
      sourcePlayerId: playerIdSchema,
      tileTypeId: tileTypeIdSchema,
      discardId: identifierSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("kong_robbery"),
      windowId: identifierSchema,
      sourcePlayerId: playerIdSchema,
      tileTypeId: tileTypeIdSchema,
      kongKind: z.enum(["added", "concealed"]),
      meldId: identifierSchema.nullable(),
    })
    .strict(),
]);

export const playerObservationSchema = z
  .object({
    schemaVersion: z.literal(1),
    gameId: gameIdSchema,
    branchId: branchIdSchema,
    practiceBranch: z.boolean(),
    revision: revisionSchema,
    phase: z.enum([
      "setup",
      "initial_replacements",
      "awaiting_discard",
      "awaiting_claims",
      "awaiting_kong_robbery",
      "drawing_replacement",
      "hand_ended",
      "match_ended",
    ]),
    ruleset: z
      .object({
        id: identifierSchema,
        version: identifierSchema,
        hash: hashSchema,
        minimumFaan: nonNegativeIntegerSchema,
        capFaan: nonNegativeIntegerSchema,
        bonusTilesEnabled: z.boolean(),
      })
      .strict(),
    viewer: z
      .object({
        playerId: playerIdSchema,
        seat: windSchema,
        score: z.number().int(),
      })
      .strict(),
    round: z
      .object({
        prevailingWind: windSchema,
        prevailingWindIndex: nonNegativeIntegerSchema,
        windHandIndex: nonNegativeIntegerSchema,
        dealerPlayerId: playerIdSchema,
        handIndex: nonNegativeIntegerSchema,
        handsCompleted: nonNegativeIntegerSchema,
        liveWallCount: nonNegativeIntegerSchema,
        replacementDrawsAvailable: nonNegativeIntegerSchema,
        activePlayerId: playerIdSchema,
        lastDiscard: publicDiscardSchema.nullable(),
        progression: z.enum(["repeat_dealer", "advance_dealer", "match_complete"]).nullable(),
      })
      .strict(),
    players: z.array(
      z
        .object({
          playerId: playerIdSchema,
          displayName: identifierSchema,
          seat: windSchema,
          score: z.number().int(),
          concealedTileCount: nonNegativeIntegerSchema,
          melds: z.array(publicMeldSchema),
          bonusTiles: z.array(tileTypeIdSchema),
          discards: z.array(publicDiscardSchema),
        })
        .strict(),
    ),
    pending: publicPendingDecisionSchema.nullable(),
    result: publicHandResultSchema.nullable(),
    private: z
      .object({
        concealedTiles: z.array(tileInstanceIdSchema),
        drawnTileId: tileInstanceIdSchema.nullable(),
        temporaryRestrictions: z.array(
          z
            .object({
              type: z.literal("same_tile_win_lock"),
              tileTypeId: tileTypeIdSchema,
              until: z.literal("next_draw"),
            })
            .strict(),
        ),
      })
      .strict(),
    legalActions: z.array(legalActionSchema),
    winAssessment: scoringPreviewSchema.nullable(),
    claimWinAssessment: scoringPreviewSchema.nullable(),
  })
  .strict();

const publicEventBaseSchema = z
  .object({
    schemaVersion: z.literal(1),
    eventId: eventIdSchema,
    gameId: gameIdSchema,
    branchId: branchIdSchema,
    practiceBranch: z.boolean(),
    revision: revisionSchema,
  })
  .strict();

const publicGameEventShapeSchema = z.discriminatedUnion("type", [
  publicEventBaseSchema
    .extend({
      type: z.literal("game_started"),
      mode: gameModeSchema,
      matchLength: z.enum(["one_wind", "full_four_winds"]),
      ruleset: z
        .object({
          id: identifierSchema,
          version: identifierSchema,
          hash: hashSchema,
          minimumFaan: nonNegativeIntegerSchema,
          capFaan: nonNegativeIntegerSchema,
          bonusTilesEnabled: z.boolean(),
        })
        .strict(),
      players: z.array(
        z
          .object({
            playerId: playerIdSchema,
            displayName: identifierSchema,
            controller: playerControllerSchema,
            seat: windSchema,
            score: z.number().int(),
          })
          .strict(),
      ),
      prevailingWind: windSchema,
      dealerPlayerId: playerIdSchema,
    })
    .strict(),
  publicEventBaseSchema
    .extend({
      type: z.literal("initial_deal_completed"),
      handId: identifierSchema,
      players: z.array(
        z
          .object({
            playerId: playerIdSchema,
            concealedTileCount: nonNegativeIntegerSchema,
            bonusTileTypes: z.array(tileTypeIdSchema),
          })
          .strict(),
      ),
      liveWallCount: nonNegativeIntegerSchema,
    })
    .strict(),
  publicEventBaseSchema
    .extend({
      type: z.literal("tile_drawn"),
      playerId: playerIdSchema,
      concealedTileDrawn: z.boolean(),
      exposedBonusTileTypes: z.array(tileTypeIdSchema),
      outcome: z.enum(["ready", "replacement_exhausted"]),
      liveWallCount: nonNegativeIntegerSchema,
    })
    .strict(),
  publicEventBaseSchema
    .extend({
      type: z.literal("tile_discarded"),
      playerId: playerIdSchema,
      discardId: identifierSchema,
      windowId: identifierSchema,
      tileTypeId: tileTypeIdSchema,
      followedFinalLiveDraw: z.boolean(),
    })
    .strict(),
  publicEventBaseSchema
    .extend({
      type: z.literal("meld_claimed"),
      playerId: playerIdSchema,
      discardId: identifierSchema,
      meldId: identifierSchema,
      kind: z.enum(["chow", "pung", "kong"]),
      tileTypes: z.array(tileTypeIdSchema),
    })
    .strict(),
  publicEventBaseSchema
    .extend({
      type: z.literal("kong_proposed"),
      windowId: identifierSchema,
      proposerId: playerIdSchema,
      kongKind: z.enum(["added", "concealed"]),
      tileTypeId: tileTypeIdSchema,
      meldId: identifierSchema.nullable(),
    })
    .strict(),
  publicEventBaseSchema
    .extend({
      type: z.literal("kong_completed"),
      playerId: playerIdSchema,
      kongKind: z.enum(["added", "concealed"]),
      meldId: identifierSchema,
      tileTypes: z.array(tileTypeIdSchema),
    })
    .strict(),
  publicEventBaseSchema
    .extend({
      type: z.literal("hand_ended"),
      handId: identifierSchema,
      result: publicHandResultSchema,
    })
    .strict(),
  publicEventBaseSchema
    .extend({
      type: z.literal("hand_started"),
      previousHandId: identifierSchema,
      handId: identifierSchema,
      dealerRepeated: z.boolean(),
      handIndex: nonNegativeIntegerSchema,
      handsCompleted: nonNegativeIntegerSchema,
      prevailingWindIndex: nonNegativeIntegerSchema,
      prevailingWind: windSchema,
      windHandIndex: nonNegativeIntegerSchema,
      dealerPlayerId: playerIdSchema,
      seatAssignments: z.array(z.object({ playerId: playerIdSchema, seat: windSchema }).strict()),
    })
    .strict(),
  publicEventBaseSchema
    .extend({
      type: z.literal("match_ended"),
      finalHandId: identifierSchema,
      reason: z.literal("schedule_complete"),
      standings: z.array(
        z.object({ playerId: playerIdSchema, seat: windSchema, score: z.number().int() }).strict(),
      ),
    })
    .strict(),
  publicEventBaseSchema
    .extend({
      type: z.literal("practice_branch_created"),
      parentBranchId: branchIdSchema,
      parentRevision: revisionSchema,
      parentEventId: eventIdSchema,
      originDecisionId: identifierSchema,
      originDecisionBranchId: branchIdSchema,
      requestedByPlayerId: playerIdSchema,
    })
    .strict(),
]);

export const publicGameEventSchema = publicGameEventShapeSchema.superRefine((event, context) => {
  const expectedEventId = `event:${event.gameId}:${event.branchId}:${String(event.revision)}`;
  if (event.eventId !== expectedEventId) {
    context.addIssue({
      code: "custom",
      path: ["eventId"],
      message: "Public event ID must match its game, branch, and revision",
    });
  }
});

export const stableErrorCodeSchema = z.enum([
  "invalid_request",
  "unknown_game",
  "unknown_player",
  "stale_revision",
  "duplicate_request",
  "not_players_turn",
  "action_not_legal",
  "claim_window_closed",
  "win_shape_incomplete",
  "win_below_minimum_faan",
  "passed_win_restriction",
  "ruleset_invalid",
  "persistence_failure",
  "external_agent_timeout",
  "llm_provider_unavailable",
  "llm_output_invalid",
]);

export const protocolErrorSchema = z
  .object({
    code: stableErrorCodeSchema,
    message: z.string().min(1).max(1000),
    details: z.record(z.string(), z.unknown()),
  })
  .strict();

export const actionSubmissionSchema = z
  .object({
    playerId: playerIdSchema,
    branchId: branchIdSchema,
    expectedRevision: revisionSchema,
    requestId: requestIdSchema,
    actionId: actionIdSchema,
  })
  .strict();

export type LegalActionDto = z.infer<typeof legalActionSchema>;
export type PlayerObservationDto = z.infer<typeof playerObservationSchema>;
export type PublicGameEventDto = z.infer<typeof publicGameEventSchema>;
export type ProtocolError = z.infer<typeof protocolErrorSchema>;
export type ActionSubmission = z.infer<typeof actionSubmissionSchema>;
