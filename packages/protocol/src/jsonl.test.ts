import { describe, expect, it } from "vitest";
import {
  ProtocolSequenceError,
  ProtocolSequenceValidator,
  agentProtocolEnvelopeSchema,
  hostProtocolEnvelopeSchema,
  parseJsonlEnvelope,
  publicGameEventSchema,
  serializeJsonlEnvelope,
} from "./index.js";

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
});
