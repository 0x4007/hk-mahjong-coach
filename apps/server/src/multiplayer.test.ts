import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createProtocolEnvelope,
  hostProtocolEnvelopeSchema,
  type ActionSubmission,
} from "@hk-mahjong/protocol";
import {
  MultiplayerService,
  MultiplayerServiceError,
  MultiplayerSocketHub,
  type MultiplayerSocketLike,
} from "./multiplayer.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const createRoomInput = (fillPolicy: "wait_for_four" | "fill_with_bots") => ({
  displayName: "Alice",
  rulesetId: "training_relaxed_v1",
  matchLength: "one_wind" as const,
  seed: "multiplayer-test-seed",
  fillPolicy,
  preferredSeat: "east" as const,
});

const createPersistentService = (): { service: MultiplayerService; databasePath: string } => {
  const directory = mkdtempSync(join(tmpdir(), "hk-mahjong-multiplayer-"));
  temporaryDirectories.push(directory);
  const databasePath = join(directory, "coach.sqlite");
  return { service: new MultiplayerService({ databasePath }), databasePath };
};

describe("multiplayer room service", () => {
  it("creates, fills, and starts a room without exposing a ticket in inspection", () => {
    const service = new MultiplayerService({ databasePath: ":memory:" });
    const created = service.createRoom(createRoomInput("fill_with_bots"));
    expect(created.ticket).toHaveLength(35);
    expect(service.inspectRoom(created.roomId)).toMatchObject({
      status: "waiting",
      occupiedSeats: ["east"],
      acceptingJoins: true,
    });

    const started = service.startRoom(created.roomId, created.ticket);
    expect(started.status).toBe("active");
    expect(started.game.branchId).toBe("main");
    expect(started.observation).not.toHaveProperty("wall");
    expect(started.observation).not.toHaveProperty("ticket");
    expect(service.inspectRoom(created.roomId)).toMatchObject({
      status: "active",
      occupiedSeats: ["east", "south", "west", "north"],
      acceptingJoins: false,
      gameId: started.game.gameId,
    });
    service.close();
  });

  it("uses one command path with durable idempotency and stale revision errors", () => {
    const service = new MultiplayerService({ databasePath: ":memory:" });
    const created = service.createRoom(createRoomInput("fill_with_bots"));
    const started = service.startRoom(created.roomId, created.ticket);
    const action = started.observation.legalActions[0];
    if (action === undefined) {
      throw new Error("Expected a legal opening action");
    }
    const submission = {
      gameId: started.game.gameId,
      playerId: created.playerId,
      branchId: "main" as const,
      expectedRevision: started.observation.revision,
      requestId: "request:one",
      actionId: action.id,
      ticket: created.ticket,
    };
    const first = service.submitAction(submission);
    const retry = service.submitAction(submission);
    expect(first.endRevision).toBeGreaterThan(first.startRevision - 1);
    expect(retry.idempotent).toBe(true);
    expect(retry.endRevision).toBe(first.endRevision);

    expect(() =>
      service.submitAction({
        ...submission,
        requestId: "request:stale",
      }),
    ).toThrow(MultiplayerServiceError);
    try {
      service.submitAction({ ...submission, requestId: "request:duplicate", actionId: "other" });
    } catch (caught) {
      expect(caught).toBeInstanceOf(MultiplayerServiceError);
    }
    service.close();
  });

  it("reconstructs room and game metadata after a fresh service instance", () => {
    const first = createPersistentService();
    const created = first.service.createRoom(createRoomInput("fill_with_bots"));
    const started = first.service.startRoom(created.roomId, created.ticket);
    first.service.close();

    const resumed = new MultiplayerService({ databasePath: first.databasePath });
    expect(resumed.inspectRoom(created.roomId)).toMatchObject({
      status: "active",
      gameId: started.game.gameId,
    });
    const observation = resumed.getObservation(
      started.game.gameId,
      created.playerId,
      "main",
      created.ticket,
    );
    expect(observation.revision).toBe(started.observation.revision);
    expect(observation.private.concealedTiles.length).toBeGreaterThan(0);
    resumed.close();
  });

  it("keeps observations player-specific while fanning out ordered protocol messages", () => {
    const service = new MultiplayerService({ databasePath: ":memory:" });
    const alice = service.createRoom(createRoomInput("wait_for_four"));
    const bob = service.joinRoom(alice.roomId, { displayName: "Bob", preferredSeat: "south" });
    service.joinRoom(alice.roomId, { displayName: "Carol", preferredSeat: "west" });
    const dan = service.joinRoom(alice.roomId, { displayName: "Dan", preferredSeat: "north" });
    // Filling the seats does not request a start; `ready` is reserved for the
    // owner-started, fully assigned transition immediately before activation.
    expect(dan.status).toBe("waiting");
    expect(service.inspectRoom(alice.roomId).status).toBe("waiting");
    expect(service.inspectRoom(alice.roomId).acceptingJoins).toBe(false);
    const started = service.startRoom(alice.roomId, alice.ticket);
    const bobObservation = service.getObservation(
      started.game.gameId,
      bob.playerId,
      "main",
      bob.ticket,
    );
    expect(bobObservation.private.concealedTiles).not.toEqual(
      started.observation.private.concealedTiles,
    );

    const messages: unknown[] = [];
    const handlers = new Map<string, (...arguments_: unknown[]) => void>();
    const socket: MultiplayerSocketLike = {
      send: (data) => messages.push(hostProtocolEnvelopeSchema.parse(JSON.parse(data) as unknown)),
      close: () => undefined,
      on: (event, handler) => handlers.set(event, handler),
    };
    new MultiplayerSocketHub(service).attach(socket, {
      gameId: started.game.gameId,
      playerId: alice.playerId,
      branchId: "main",
      ticket: alice.ticket,
      fromRevision: 0,
    });
    const hostTypes = messages.map((message) => {
      if (typeof message !== "object" || message === null || !("type" in message)) {
        throw new Error("Malformed captured host message");
      }
      return message.type;
    });
    expect(hostTypes).toEqual([
      "hello",
      "game_started",
      "public_event",
      "public_event",
      "observation",
      "action_request",
    ]);

    const actionRequest = messages[5];
    if (
      typeof actionRequest !== "object" ||
      actionRequest === null ||
      !("payload" in actionRequest)
    ) {
      throw new Error("Missing captured action request");
    }
    const payload = actionRequest.payload as {
      playerId: string;
      branchId: string;
      expectedRevision: number;
      requestId: string;
      legalActions: readonly { id: string }[];
    };
    const action = payload.legalActions[0];
    if (action === undefined) {
      throw new Error("Missing captured legal action");
    }
    const submission: ActionSubmission = {
      playerId: payload.playerId,
      branchId: payload.branchId,
      expectedRevision: payload.expectedRevision,
      requestId: payload.requestId,
      actionId: action.id,
    };
    const handler = handlers.get("message");
    if (handler === undefined) {
      throw new Error("Socket message handler was not registered");
    }
    handler(
      JSON.stringify(
        createProtocolEnvelope({
          type: "submit_action",
          seq: 0,
          gameId: started.game.gameId,
          branchId: "main",
          requestId: submission.requestId,
          payload: submission,
        }),
      ),
      false,
    );
    expect(messages.map((message) => (message as { type: string }).type)).toContain(
      "action_accepted",
    );
    service.close();
  });

  it("rejects disabled socket actions that name another player before engine dispatch", () => {
    const service = new MultiplayerService({ databasePath: ":memory:" });
    const created = service.createRoom(createRoomInput("fill_with_bots"));
    const started = service.startRoom(created.roomId, created.ticket);
    const messages: unknown[] = [];
    const handlers = new Map<string, (...arguments_: unknown[]) => void>();
    const socket: MultiplayerSocketLike = {
      send: (data) => messages.push(hostProtocolEnvelopeSchema.parse(JSON.parse(data) as unknown)),
      close: () => undefined,
      on: (event, handler) => handlers.set(event, handler),
    };
    new MultiplayerSocketHub(service).attach(socket, {
      gameId: started.game.gameId,
      playerId: created.playerId,
      branchId: "main",
      ticket: created.ticket,
      fromRevision: 0,
    });
    const handler = handlers.get("message");
    if (handler === undefined) {
      throw new Error("Socket message handler was not registered");
    }
    handler(
      JSON.stringify(
        createProtocolEnvelope({
          type: "request_hint",
          seq: 0,
          gameId: started.game.gameId,
          branchId: "main",
          requestId: "hint:cross-player",
          payload: {
            playerId: "p_other",
            branchId: "main",
            expectedRevision: started.observation.revision,
            level: "reveal",
          },
        }),
      ),
      false,
    );
    const crossPlayerError = messages.find(
      (message) =>
        typeof message === "object" &&
        message !== null &&
        "type" in message &&
        message.type === "error" &&
        "payload" in message &&
        typeof message.payload === "object" &&
        message.payload !== null &&
        "details" in message.payload &&
        typeof message.payload.details === "object" &&
        message.payload.details !== null &&
        "reason" in message.payload.details &&
        message.payload.details.reason === "cross_player_message",
    );
    expect(crossPlayerError).toBeDefined();
    expect(
      service.getObservation(started.game.gameId, created.playerId, "main", created.ticket)
        .revision,
    ).toBe(started.observation.revision);
    service.close();
  });

  it("contains malformed action payloads without throwing or changing the game", () => {
    const service = new MultiplayerService({ databasePath: ":memory:" });
    const created = service.createRoom(createRoomInput("fill_with_bots"));
    const started = service.startRoom(created.roomId, created.ticket);
    const messages: unknown[] = [];
    const handlers = new Map<string, (...arguments_: unknown[]) => void>();
    const socket: MultiplayerSocketLike = {
      send: (data) => messages.push(hostProtocolEnvelopeSchema.parse(JSON.parse(data) as unknown)),
      close: () => undefined,
      on: (event, handler) => handlers.set(event, handler),
    };
    new MultiplayerSocketHub(service).attach(socket, {
      gameId: started.game.gameId,
      playerId: created.playerId,
      branchId: "main",
      ticket: created.ticket,
      fromRevision: 0,
    });
    const handler = handlers.get("message");
    if (handler === undefined) {
      throw new Error("Socket message handler was not registered");
    }
    expect(() =>
      handler(
        JSON.stringify({
          ...createProtocolEnvelope({
            type: "submit_action",
            seq: 0,
            gameId: started.game.gameId,
            branchId: "main",
            requestId: "malformed:action",
            payload: {
              playerId: created.playerId,
              branchId: "main",
              expectedRevision: started.observation.revision,
              requestId: "malformed:action",
            },
          }),
        }),
        false,
      ),
    ).not.toThrow();
    expect(messages.map((message) => (message as { type: string }).type)).toContain("error");
    expect(
      service.getObservation(started.game.gameId, created.playerId, "main", created.ticket)
        .revision,
    ).toBe(started.observation.revision);
    service.close();
  });

  it("closes waiting rooms on owner request and expires inactive rooms", () => {
    let now = new Date("2026-08-06T00:00:00.000Z");
    const service = new MultiplayerService({
      databasePath: ":memory:",
      retentionMs: 1_000,
      clock: () => new Date(now),
    });
    const created = service.createRoom(createRoomInput("wait_for_four"));
    expect(service.closeRoom(created.roomId, created.ticket)).toMatchObject({
      status: "closed",
      acceptingJoins: false,
    });
    expect(() =>
      service.joinRoom(created.roomId, { displayName: "Reconnect" }, created.ticket),
    ).toThrow(
      expect.objectContaining({
        code: "invalid_request",
        details: { reason: "room_closed" },
        statusCode: 409,
      }),
    );
    const expired = service.createRoom(createRoomInput("wait_for_four"));
    now = new Date("2026-08-06T00:00:01.001Z");
    expect(service.inspectRoom(expired.roomId).status).toBe("closed");
    service.close();
  });

  it("does not close a room after a durable start reservation is claimed", () => {
    const service = new MultiplayerService({ databasePath: ":memory:" });
    const created = service.createRoom(createRoomInput("wait_for_four"));
    expect(service.roomStore.claimStart(created.roomId, "start:claimed")).toBe(false);
    expect(service.roomStore.closeWaitingRoom(created.roomId)).toBe(false);
    expect(service.inspectRoom(created.roomId)).toMatchObject({
      status: "waiting",
      acceptingJoins: false,
    });
    expect(() => service.closeRoom(created.roomId, created.ticket)).toThrow(
      expect.objectContaining({
        code: "invalid_request",
        details: { reason: "room_already_started" },
        statusCode: 409,
      }),
    );
    service.close();
  });

  it("does not let retention close a stale room after a start reservation", () => {
    let now = new Date("2026-08-06T00:00:00.000Z");
    const service = new MultiplayerService({
      databasePath: ":memory:",
      retentionMs: 1_000,
      clock: () => new Date(now),
    });
    const created = service.createRoom(createRoomInput("wait_for_four"));
    expect(service.roomStore.claimStart(created.roomId, "start:retention")).toBe(false);
    now = new Date("2026-08-06T00:00:02.000Z");
    expect(service.inspectRoom(created.roomId)).toMatchObject({
      status: "waiting",
      acceptingJoins: false,
    });
    service.close();
  });

  it("rejects a join after a durable start reservation wins", () => {
    const service = new MultiplayerService({ databasePath: ":memory:" });
    const created = service.createRoom(createRoomInput("wait_for_four"));
    expect(service.roomStore.claimStart(created.roomId, "start:join-race")).toBe(false);
    expect(() =>
      service.joinRoom(created.roomId, { displayName: "Late Bob", preferredSeat: "south" }),
    ).toThrow(
      expect.objectContaining({
        code: "invalid_request",
        details: { reason: "room_already_started" },
        statusCode: 409,
      }),
    );
    expect(service.inspectRoom(created.roomId)).toMatchObject({
      occupiedSeats: ["east"],
      acceptingJoins: false,
    });
    service.close();
  });

  it("rejects game access after a started room is closed", () => {
    const service = new MultiplayerService({ databasePath: ":memory:" });
    const created = service.createRoom(createRoomInput("fill_with_bots"));
    const started = service.startRoom(created.roomId, created.ticket);
    service.roomStore.setStatus(created.roomId, "closed");
    expect(() =>
      service.getObservation(started.game.gameId, created.playerId, "main", created.ticket),
    ).toThrow(
      expect.objectContaining({
        code: "invalid_request",
        details: { reason: "room_closed" },
        statusCode: 409,
      }),
    );
    service.close();
  });

  it("uses the authoritative clock for room writes and ticket expiry boundaries", () => {
    let now = new Date("2026-08-06T00:00:00.000Z");
    const service = new MultiplayerService({
      databasePath: ":memory:",
      retentionMs: 1_000,
      clock: () => new Date(now),
    });
    const created = service.createRoom(createRoomInput("wait_for_four"));
    now = new Date("2026-08-06T00:00:00.500Z");
    service.joinRoom(created.roomId, { displayName: "Bob", preferredSeat: "south" });
    now = new Date("2026-08-06T00:00:01.001Z");
    expect(service.inspectRoom(created.roomId).status).toBe("waiting");
    now = new Date("2026-08-06T00:00:01.500Z");
    expect(service.inspectRoom(created.roomId).status).toBe("closed");
    expect(() =>
      service.authenticateTicket(created.roomId, created.playerId, created.ticket),
    ).toThrow(MultiplayerServiceError);
    service.close();
  });

  it("records a timeout fallback with explicit server provenance", async () => {
    vi.useFakeTimers();
    const service = new MultiplayerService({
      databasePath: ":memory:",
      actionTimeoutMs: 1,
    });
    const created = service.createRoom(createRoomInput("fill_with_bots"));
    const started = service.startRoom(created.roomId, created.ticket);
    const messages: unknown[] = [];
    const handlers = new Map<string, (...arguments_: unknown[]) => void>();
    const socket: MultiplayerSocketLike = {
      send: (data) => messages.push(hostProtocolEnvelopeSchema.parse(JSON.parse(data) as unknown)),
      close: () => undefined,
      on: (event, handler) => handlers.set(event, handler),
    };
    new MultiplayerSocketHub(service).attach(socket, {
      gameId: started.game.gameId,
      playerId: created.playerId,
      branchId: "main",
      ticket: created.ticket,
      fromRevision: 0,
    });
    await vi.advanceTimersByTimeAsync(5);
    const accepted = messages.find(
      (message) =>
        typeof message === "object" &&
        message !== null &&
        "type" in message &&
        message.type === "action_accepted",
    ) as { payload?: { source?: string; fallback?: { reason?: string } } } | undefined;
    expect(accepted?.payload?.source).toBe("timeout_fallback");
    expect(accepted?.payload?.fallback?.reason).toBe("action_timeout");
    const receipt = service.roomStore.getActionReceipt(
      started.game.gameId,
      "main",
      service.actionRequestId(
        started.game.gameId,
        "main",
        started.observation.revision,
        created.playerId,
      ),
    );
    expect(receipt?.source).toBe("timeout_fallback");
    service.close();
    vi.useRealTimers();
    handlers.clear();
  });

  it("pauses a pending deadline across a disconnect when configured", () => {
    vi.useFakeTimers();
    const service = new MultiplayerService({ databasePath: ":memory:", actionTimeoutMs: 1000 });
    const created = service.createRoom({
      ...createRoomInput("fill_with_bots"),
      disconnectPolicy: "pause_on_disconnect",
    });
    const started = service.startRoom(created.roomId, created.ticket);
    const handlers = new Map<string, (...arguments_: unknown[]) => void>();
    const socket: MultiplayerSocketLike = {
      send: () => undefined,
      close: () => undefined,
      on: (event, handler) => handlers.set(event, handler),
    };
    new MultiplayerSocketHub(service).attach(socket, {
      gameId: started.game.gameId,
      playerId: created.playerId,
      branchId: "main",
      ticket: created.ticket,
      fromRevision: 0,
    });
    const before = service.pendingActionFor(started.game.gameId, "main", created.playerId);
    expect(before?.pausedAt).toBeNull();
    handlers.get("close")?.();
    const paused = service.pendingActionFor(started.game.gameId, "main", created.playerId);
    expect(paused?.pausedAt).not.toBeNull();
    expect(paused?.remainingMs).toBeGreaterThan(0);
    service.close();
    vi.useRealTimers();
  });
});
