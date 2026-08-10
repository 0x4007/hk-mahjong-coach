import { z } from "zod";
import {
  actionIdSchema,
  branchIdSchema,
  gameIdSchema,
  hintLevelSchema,
  identifierSchema,
  nonNegativeIntegerSchema,
  playerIdSchema,
  protocolTimestampSchema,
  protocolVersionSchema,
  requestIdSchema,
  revisionSchema,
  windSchema,
} from "./common.js";
import {
  actionSubmissionSchema,
  legalActionSchema,
  playerObservationSchema,
  protocolErrorSchema,
  publicGameEventSchema,
  publicHandResultSchema,
} from "./schemas.js";
import { actionSourceSchema, fallbackActionMetadataSchema } from "./multiplayer.js";

export interface ProtocolClock {
  now(): Date;
}

export const systemProtocolClock: ProtocolClock = {
  now: () => new Date(),
};

const envelopeBaseSchema = z
  .object({
    protocolVersion: protocolVersionSchema,
    seq: nonNegativeIntegerSchema,
    timestamp: protocolTimestampSchema,
    gameId: gameIdSchema.optional(),
    branchId: branchIdSchema.optional(),
    requestId: requestIdSchema.optional(),
  })
  .strict();

export const protocolEnvelopeSchema = envelopeBaseSchema.extend({
  type: identifierSchema,
  payload: z.unknown(),
});

export const protocolEnvelopeFor = <TSchema extends z.ZodType>(payload: TSchema) =>
  envelopeBaseSchema.extend({
    type: identifierSchema,
    payload,
  });

const hostEnvelope = <TSchema extends z.ZodType>(type: string, payload: TSchema) =>
  envelopeBaseSchema
    .extend({
      type: z.literal(type),
      payload,
    })
    .strict();

const agentEnvelope = hostEnvelope;

interface EnvelopeIdentity {
  gameId?: string | undefined;
  branchId?: string | undefined;
  requestId?: string | undefined;
  payload: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const validateEnvelopeIdentity = (envelope: EnvelopeIdentity, context: z.RefinementCtx): void => {
  const payload = isRecord(envelope.payload) ? envelope.payload : null;
  const observation =
    payload !== null && isRecord(payload.observation) ? payload.observation : null;
  const event = payload !== null && isRecord(payload.event) ? payload.event : null;
  const sources = [payload, observation, event];

  for (const field of ["gameId", "branchId", "requestId"] as const) {
    for (const source of sources) {
      const value = source?.[field];
      if (typeof value === "string" && envelope[field] !== value) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: `Envelope ${field} must match its payload identity`,
        });
        break;
      }
    }
  }
};

const helloPayloadSchema = z
  .object({
    seat: windSchema,
    actionTimeoutMs: nonNegativeIntegerSchema,
    malformedResponseLimit: nonNegativeIntegerSchema.min(1),
  })
  .strict();

const actionRequestPayloadSchema = z
  .object({
    playerId: playerIdSchema,
    branchId: branchIdSchema,
    expectedRevision: revisionSchema,
    requestId: requestIdSchema,
    deadline: protocolTimestampSchema.nullable(),
    legalActions: z.array(legalActionSchema).min(1),
  })
  .strict();

const actionAcceptedPayloadSchema = z
  .object({
    playerId: playerIdSchema,
    actionId: actionIdSchema,
    revision: revisionSchema,
    source: actionSourceSchema.default("human"),
    fallback: fallbackActionMetadataSchema.optional(),
    observation: playerObservationSchema,
  })
  .strict();

const actionRejectedPayloadSchema = z
  .object({
    playerId: playerIdSchema,
    error: protocolErrorSchema,
    observation: playerObservationSchema.nullable(),
  })
  .strict();

const coachFeedbackPayloadSchema = z
  .object({
    status: z.enum(["template", "provider", "fallback", "unavailable"]),
    headline: z.string().min(1).max(1000),
    explanation: z.string().min(1).max(5000),
    recommendedActionId: actionIdSchema.nullable(),
    factIds: z.array(identifierSchema),
    conceptIds: z.array(identifierSchema),
  })
  .strict();

const hostProtocolEnvelopeShapeSchema = z.discriminatedUnion("type", [
  hostEnvelope("hello", helloPayloadSchema),
  hostEnvelope("game_started", z.object({ observation: playerObservationSchema }).strict()),
  hostEnvelope("observation", playerObservationSchema),
  hostEnvelope("action_request", actionRequestPayloadSchema),
  hostEnvelope("action_accepted", actionAcceptedPayloadSchema),
  hostEnvelope("action_rejected", actionRejectedPayloadSchema),
  hostEnvelope("public_event", z.object({ event: publicGameEventSchema }).strict()),
  hostEnvelope(
    "hand_ended",
    z.object({ result: publicHandResultSchema, observation: playerObservationSchema }).strict(),
  ),
  hostEnvelope("match_ended", z.object({ observation: playerObservationSchema }).strict()),
  hostEnvelope("coach_feedback", coachFeedbackPayloadSchema),
  hostEnvelope("error", protocolErrorSchema),
  hostEnvelope("goodbye", z.object({ reason: identifierSchema }).strict()),
]);

export const hostProtocolEnvelopeSchema =
  hostProtocolEnvelopeShapeSchema.superRefine(validateEnvelopeIdentity);

const hintRequestPayloadSchema = z
  .object({
    playerId: playerIdSchema,
    branchId: branchIdSchema,
    expectedRevision: revisionSchema,
    level: hintLevelSchema.exclude(["none"]),
  })
  .strict();

const analysisRequestPayloadSchema = z
  .object({
    playerId: playerIdSchema,
    branchId: branchIdSchema,
    expectedRevision: revisionSchema,
  })
  .strict();

const agentProtocolEnvelopeShapeSchema = z.discriminatedUnion("type", [
  agentEnvelope("submit_action", actionSubmissionSchema),
  agentEnvelope("request_hint", hintRequestPayloadSchema),
  agentEnvelope("request_analysis", analysisRequestPayloadSchema),
  agentEnvelope("ping", z.object({ nonce: identifierSchema }).strict()),
  agentEnvelope(
    "resign",
    z
      .object({
        playerId: playerIdSchema,
        branchId: branchIdSchema,
        expectedRevision: revisionSchema,
      })
      .strict(),
  ),
]);

export const agentProtocolEnvelopeSchema =
  agentProtocolEnvelopeShapeSchema.superRefine(validateEnvelopeIdentity);

export interface ProtocolEnvelope<T> {
  protocolVersion: 1;
  type: string;
  seq: number;
  timestamp: string;
  gameId?: string;
  branchId?: string;
  requestId?: string;
  payload: T;
}

export type HostProtocolEnvelope = z.infer<typeof hostProtocolEnvelopeSchema>;
export type AgentProtocolEnvelope = z.infer<typeof agentProtocolEnvelopeSchema>;

export class ProtocolSequenceError extends Error {
  public constructor(
    public readonly received: number,
    public readonly previous: number,
  ) {
    super("Protocol sequence must be strictly monotonic");
    this.name = "ProtocolSequenceError";
  }
}

/** Maintains one independent monotonic sequence for each JSONL direction. */
export class ProtocolSequenceValidator {
  #lastSequence = -1;

  public accept(envelope: Pick<ProtocolEnvelope<unknown>, "seq">): void {
    if (envelope.seq <= this.#lastSequence) {
      throw new ProtocolSequenceError(envelope.seq, this.#lastSequence);
    }
    this.#lastSequence = envelope.seq;
  }

  public get lastSequence(): number {
    return this.#lastSequence;
  }
}

export const parseJsonlEnvelope = <TSchema extends z.ZodType>(
  line: string,
  schema: TSchema,
): z.output<TSchema> => {
  if (line.trim().length === 0) {
    throw new Error("A JSONL line must not be empty");
  }
  let value: unknown;
  try {
    value = JSON.parse(line) as unknown;
  } catch {
    throw new Error("A JSONL line must contain one complete JSON object");
  }
  return schema.parse(value);
};

export const serializeJsonlEnvelope = <T>(envelope: ProtocolEnvelope<T>): string =>
  `${JSON.stringify(protocolEnvelopeSchema.parse(envelope))}\n`;

export const createProtocolEnvelope = <T>(input: {
  type: string;
  seq: number;
  payload: T;
  gameId?: string;
  branchId?: string;
  requestId?: string;
  clock?: ProtocolClock;
}): ProtocolEnvelope<T> => ({
  protocolVersion: 1,
  type: input.type,
  seq: input.seq,
  timestamp: (input.clock ?? systemProtocolClock).now().toISOString(),
  ...(input.gameId === undefined ? {} : { gameId: input.gameId }),
  ...(input.branchId === undefined ? {} : { branchId: input.branchId }),
  ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
  payload: input.payload,
});
