import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ProtocolSequenceError,
  ProtocolSequenceValidator,
  agentProtocolEnvelopeSchema,
  createProtocolEnvelope,
  hostProtocolEnvelopeSchema,
  parseJsonlEnvelope,
  profilePatchSchema,
  publicGameEventSchema,
  protocolEnvelopeFor,
  protocolEnvelopeSchema,
  protocolTimestampSchema,
  serializeJsonlEnvelope,
} from "./index.js";

const testHash = `sha256:${"a".repeat(64)}`;

const actionRequest = {
  protocolVersion: 1,
  type: "action_request",
  seq: 4,
  timestamp: "2026-08-02T12:00:00.000Z",
  gameId: "game-demo",
  branchId: "main",
  requestId: "request-demo",
  payload: {
    playerId: "player-0",
    branchId: "main",
    expectedRevision: 7,
    requestId: "request-demo",
    deadline: null,
    legalActions: [
      {
        id: "discard-player-0-characters-1-1",
        type: "discard",
        tileId: "characters.1#1",
      },
    ],
  },
} as const;

const redactedObservation = {
  schemaVersion: 1,
  gameId: "game-demo",
  branchId: "main",
  practiceBranch: false,
  revision: 8,
  phase: "awaiting_discard",
  ruleset: {
    id: "hk_nyc_social_v1",
    version: "1.0.0",
    hash: testHash,
    minimumFaan: 3,
    capFaan: 10,
    bonusTilesEnabled: true,
  },
  viewer: { playerId: "player-0", seat: "east", score: 0 },
  round: {
    prevailingWind: "east",
    prevailingWindIndex: 0,
    windHandIndex: 0,
    dealerPlayerId: "player-0",
    handIndex: 0,
    handsCompleted: 0,
    liveWallCount: 70,
    replacementDrawsAvailable: 8,
    activePlayerId: "player-0",
    lastDiscard: null,
    progression: null,
  },
  players: [
    {
      playerId: "player-0",
      displayName: "Player 0",
      seat: "east",
      score: 0,
      concealedTileCount: 14,
      melds: [],
      bonusTiles: [],
      discards: [],
    },
    {
      playerId: "player-1",
      displayName: "Player 1",
      seat: "south",
      score: 0,
      concealedTileCount: 13,
      melds: [],
      bonusTiles: [],
      discards: [],
    },
    {
      playerId: "player-2",
      displayName: "Player 2",
      seat: "west",
      score: 0,
      concealedTileCount: 13,
      melds: [],
      bonusTiles: [],
      discards: [],
    },
    {
      playerId: "player-3",
      displayName: "Player 3",
      seat: "north",
      score: 0,
      concealedTileCount: 13,
      melds: [],
      bonusTiles: [],
      discards: [],
    },
  ],
  pending: null,
  result: null,
  private: {
    concealedTiles: [
      "characters.1#1",
      "characters.2#1",
      "characters.3#1",
      "characters.4#1",
      "characters.5#1",
      "characters.6#1",
      "characters.7#1",
      "characters.8#1",
      "characters.9#1",
      "dots.1#1",
      "dots.2#1",
      "dots.3#1",
      "dots.4#1",
      "bamboo.1#1",
    ],
    drawnTileId: "bamboo.1#1",
    temporaryRestrictions: [],
  },
  legalActions: [
    {
      id: "discard-player-0-bamboo-1-1",
      type: "discard",
      tileId: "bamboo.1#1",
    },
  ],
  winAssessment: null,
  claimWinAssessment: null,
} as const;

const canonicalTileDrawnEvent = {
  schemaVersion: 1,
  type: "tile_drawn",
  eventId: "event:game-demo:main:8",
  gameId: "game-demo",
  branchId: "main",
  practiceBranch: false,
  revision: 8,
  playerId: "player-0",
  concealedTileDrawn: true,
  exposedBonusTileTypes: [],
  outcome: "ready",
  liveWallCount: 70,
} as const;

describe("JSONL protocol", () => {
  it("round-trips one complete host envelope", () => {
    const line = serializeJsonlEnvelope(actionRequest);

    expect(line.endsWith("\n")).toBe(true);
    expect(parseJsonlEnvelope(line, hostProtocolEnvelopeSchema)).toEqual(actionRequest);
  });

  it("rejects free-form moves from an external agent", () => {
    expect(() =>
      agentProtocolEnvelopeSchema.parse({
        protocolVersion: 1,
        type: "submit_action",
        seq: 1,
        timestamp: "2026-08-02T12:00:00.000Z",
        gameId: "game-demo",
        requestId: "request-demo",
        payload: {
          playerId: "player-0",
          branchId: "main",
          expectedRevision: 7,
          requestId: "request-demo",
          move: "discard 1m",
        },
      }),
    ).toThrow();
  });

  it("rejects envelope identities that disagree with a payload", () => {
    expect(() =>
      hostProtocolEnvelopeSchema.parse({
        ...actionRequest,
        branchId: "practice:other",
      }),
    ).toThrow(/Envelope branchId must match its payload identity/u);
  });

  it("rejects public events with a noncanonical branch-qualified event ID", () => {
    expect(() =>
      publicGameEventSchema.parse({
        schemaVersion: 1,
        type: "practice_branch_created",
        eventId: "event:game-demo:main:1",
        gameId: "game-demo",
        branchId: "practice:alternate",
        practiceBranch: true,
        revision: 1,
        parentBranchId: "main",
        parentRevision: 7,
        parentEventId: "event:game-demo:main:7",
        originDecisionId: "decision-alternate",
        originDecisionBranchId: "main",
        requestedByPlayerId: "player-0",
      }),
    ).toThrow(/Public event ID must match its game, branch, and revision/u);
  });

  it("validates each direction's sequence independently", () => {
    const host = new ProtocolSequenceValidator();
    const agent = new ProtocolSequenceValidator();

    host.accept({ seq: 4 });
    agent.accept({ seq: 1 });
    expect(() => host.accept({ seq: 4 })).toThrow(ProtocolSequenceError);
    agent.accept({ seq: 2 });
    expect(host.lastSequence).toBe(4);
    expect(agent.lastSequence).toBe(2);
  });

  it("rejects malformed protocol boundary values and empty profile patches", () => {
    expect(protocolTimestampSchema.safeParse("not-a-timestamp").success).toBe(false);
    expect(() => parseJsonlEnvelope(" \t\n", protocolEnvelopeSchema)).toThrow(/must not be empty/u);
    expect(() => parseJsonlEnvelope("{", protocolEnvelopeSchema)).toThrow(
      /one complete JSON object/u,
    );
    expect(profilePatchSchema.parse({ displayName: "Ada" })).toEqual({ displayName: "Ada" });
    expect(profilePatchSchema.safeParse({}).success).toBe(false);
  });

  it("builds generic envelopes and handles default and explicit identities", () => {
    const probe = protocolEnvelopeFor(z.object({ kind: z.literal("probe") }).strict());
    expect(
      probe.parse({
        protocolVersion: 1,
        type: "probe",
        seq: 1,
        timestamp: "2026-08-03T00:00:00.000Z",
        payload: { kind: "probe" },
      }),
    ).toMatchObject({ type: "probe", payload: { kind: "probe" } });

    const automatic = createProtocolEnvelope({
      type: "ping",
      seq: 2,
      payload: { nonce: "automatic" },
    });
    expect(protocolEnvelopeSchema.parse(automatic)).toEqual(automatic);
    expect(automatic).not.toHaveProperty("gameId");
    expect(automatic).not.toHaveProperty("branchId");
    expect(automatic).not.toHaveProperty("requestId");

    expect(
      createProtocolEnvelope({
        type: "ping",
        seq: 3,
        payload: { nonce: "explicit" },
        gameId: "game-demo",
        branchId: "main",
        requestId: "request-demo",
        clock: { now: () => new Date("2026-08-03T00:00:00.000Z") },
      }),
    ).toEqual({
      protocolVersion: 1,
      type: "ping",
      seq: 3,
      timestamp: "2026-08-03T00:00:00.000Z",
      gameId: "game-demo",
      branchId: "main",
      requestId: "request-demo",
      payload: { nonce: "explicit" },
    });
  });

  it("accepts canonical nested observation and public-event envelopes", () => {
    expect(
      hostProtocolEnvelopeSchema.parse({
        protocolVersion: 1,
        type: "game_started",
        seq: 5,
        timestamp: "2026-08-03T00:00:00.000Z",
        gameId: "game-demo",
        branchId: "main",
        payload: { observation: redactedObservation },
      }),
    ).toMatchObject({ payload: { observation: redactedObservation } });

    expect(
      hostProtocolEnvelopeSchema.parse({
        protocolVersion: 1,
        type: "public_event",
        seq: 6,
        timestamp: "2026-08-03T00:00:00.000Z",
        gameId: "game-demo",
        branchId: "main",
        payload: { event: canonicalTileDrawnEvent },
      }),
    ).toMatchObject({ payload: { event: canonicalTileDrawnEvent } });
  });

  it("restricts the multiplayer hello seat to a concrete wind", () => {
    const hello = {
      protocolVersion: 1,
      type: "hello",
      seq: 0,
      timestamp: "2026-08-03T00:00:00.000Z",
      gameId: "game-demo",
      branchId: "main",
      payload: { seat: "east", actionTimeoutMs: 30_000, malformedResponseLimit: 3 },
    };
    expect(hostProtocolEnvelopeSchema.parse(hello)).toMatchObject({ payload: { seat: "east" } });
    expect(() =>
      hostProtocolEnvelopeSchema.parse({
        ...hello,
        payload: { ...hello.payload, seat: "player-0" },
      }),
    ).toThrow();
  });
});
