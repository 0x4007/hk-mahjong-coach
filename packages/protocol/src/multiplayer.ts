import { z } from "zod";
import {
  gameIdSchema,
  hashSchema,
  identifierSchema,
  matchLengthSchema,
  playerIdSchema,
  requestIdSchema,
  windSchema,
} from "./common.js";
import { rulesetSummarySchema } from "./http.js";
import { playerObservationSchema } from "./schemas.js";

export const roomStatusSchema = z.enum([
  "waiting",
  "ready",
  "active",
  "hand_ended",
  "match_ended",
  "closed",
]);

export const roomFillPolicySchema = z.enum(["wait_for_four", "fill_with_bots"]);

/** Controls whether an acting seat's timeout continues while its socket is disconnected. */
export const roomDisconnectPolicySchema = z.enum(["fallback_on_disconnect", "pause_on_disconnect"]);

export const actionSourceSchema = z.enum(["human", "bot", "timeout_fallback"]);
export const fallbackActionMetadataSchema = z
  .object({
    source: z.literal("timeout_fallback"),
    reason: z.enum(["action_timeout", "disconnect_timeout"]),
    deadline: z.iso.datetime(),
    appliedAt: z.iso.datetime(),
  })
  .strict();

export const roomSeatSchema = z.object({
  seat: windSchema,
  playerId: playerIdSchema,
  displayName: z.string().trim().min(1).max(128),
  controller: z.enum(["human", "bot"]),
});

export const roomCreateRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(128),
    rulesetId: identifierSchema,
    matchLength: matchLengthSchema,
    seed: identifierSchema,
    fillPolicy: roomFillPolicySchema,
    disconnectPolicy: roomDisconnectPolicySchema.default("fallback_on_disconnect"),
    preferredSeat: windSchema.optional(),
  })
  .strict();

export const roomJoinRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(128),
    preferredSeat: windSchema.optional(),
  })
  .strict();

export const roomStartRequestSchema = z
  .object({
    requestId: requestIdSchema.optional(),
  })
  .strict();

export const roomRulesetSummarySchema = rulesetSummarySchema;

export const roomRulesetsResponseSchema = z
  .object({
    rulesets: z.array(roomRulesetSummarySchema),
  })
  .strict();

export const roomCreateResponseSchema = z
  .object({
    roomId: identifierSchema,
    status: roomStatusSchema,
    playerId: playerIdSchema,
    seat: windSchema,
    ticket: z.string().min(16).max(512),
    ruleset: roomRulesetSummarySchema,
  })
  .strict();

export const roomJoinResponseSchema = z
  .object({
    roomId: identifierSchema,
    status: roomStatusSchema,
    playerId: playerIdSchema,
    seat: windSchema,
    ticket: z.string().min(16).max(512),
  })
  .strict();

export const roomInspectionResponseSchema = z
  .object({
    roomId: identifierSchema,
    status: roomStatusSchema,
    ruleset: roomRulesetSummarySchema,
    matchLength: matchLengthSchema,
    fillPolicy: roomFillPolicySchema,
    disconnectPolicy: roomDisconnectPolicySchema,
    occupiedSeats: z.array(windSchema),
    acceptingJoins: z.boolean(),
    gameId: gameIdSchema.nullable(),
  })
  .strict();

export const roomStartResponseSchema = z
  .object({
    roomId: identifierSchema,
    status: z.literal("active"),
    game: z.object({ gameId: gameIdSchema, branchId: z.literal("main") }).strict(),
    observation: playerObservationSchema,
  })
  .strict();

export type RoomStatus = z.infer<typeof roomStatusSchema>;
export type RoomFillPolicy = z.infer<typeof roomFillPolicySchema>;
export type RoomDisconnectPolicy = z.infer<typeof roomDisconnectPolicySchema>;
export type ActionSource = z.infer<typeof actionSourceSchema>;
export type FallbackActionMetadata = z.infer<typeof fallbackActionMetadataSchema>;
export type RoomSeat = z.infer<typeof roomSeatSchema>;
/** Input type keeps the defaulted disconnect policy optional for callers. */
export type RoomCreateRequest = z.input<typeof roomCreateRequestSchema>;
export type RoomJoinRequest = z.infer<typeof roomJoinRequestSchema>;
export type RoomStartRequest = z.infer<typeof roomStartRequestSchema>;
export type RoomRulesetSummary = z.infer<typeof roomRulesetSummarySchema>;
export type RoomRulesetsResponse = z.infer<typeof roomRulesetsResponseSchema>;
export type RoomCreateResponse = z.infer<typeof roomCreateResponseSchema>;
export type RoomJoinResponse = z.infer<typeof roomJoinResponseSchema>;
export type RoomInspectionResponse = z.infer<typeof roomInspectionResponseSchema>;
export type RoomStartResponse = z.infer<typeof roomStartResponseSchema>;

/** The multiplayer room protocol uses the same versioned ruleset hash as game persistence. */
export const roomRulesetHashSchema = hashSchema;
