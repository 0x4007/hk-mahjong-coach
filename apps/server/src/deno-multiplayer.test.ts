import { describe, expect, it } from "vitest";
import {
  DenoMultiplayerService,
  DenoMultiplayerSocketHub,
  type DenoSocketLike,
} from "./deno-multiplayer.js";
import { createProtocolEnvelope, hostProtocolEnvelopeSchema } from "@hk-mahjong/protocol";
import type {
  DenoKvAtomicOperation,
  DenoKvEntry,
  DenoKvLike,
} from "../../../packages/persistence/src/deno-kv.js";

interface MemoryRecord {
  readonly key: readonly unknown[];
  readonly value: unknown;
  readonly versionstamp: string;
}

class MemoryKv implements DenoKvLike {
  private readonly records = new Map<string, MemoryRecord>();
  private nextVersion = 1;

  public get<T>(key: readonly unknown[]): Promise<DenoKvEntry<T>> {
    const record = this.records.get(JSON.stringify(key));
    return Promise.resolve({
      key,
      value: record === undefined ? null : (structuredClone(record.value) as T),
      versionstamp: record?.versionstamp ?? null,
    });
  }

  public async *list<T>(selector: {
    readonly prefix: readonly unknown[];
  }): AsyncIterable<DenoKvEntry<T>> {
    await Promise.resolve();
    const prefix = `${JSON.stringify(selector.prefix).slice(0, -1)},`;
    for (const record of this.records.values()) {
      if (!JSON.stringify(record.key).startsWith(prefix)) {
        continue;
      }
      yield {
        key: record.key,
        value: structuredClone(record.value) as T,
        versionstamp: record.versionstamp,
      };
    }
  }

  public atomic(): DenoKvAtomicOperation {
    const checks: { readonly key: readonly unknown[]; readonly versionstamp: string | null }[] = [];
    const writes: {
      readonly type: "set" | "delete";
      readonly key: readonly unknown[];
      readonly value?: unknown;
    }[] = [];
    const operation: DenoKvAtomicOperation = {
      check: (check) => {
        checks.push(check);
        return operation;
      },
      set: (key, value) => {
        writes.push({ type: "set", key, value });
        return operation;
      },
      delete: (key) => {
        writes.push({ type: "delete", key });
        return operation;
      },
      commit: () => {
        for (const check of checks) {
          const current = this.records.get(JSON.stringify(check.key));
          if ((current?.versionstamp ?? null) !== check.versionstamp) {
            return Promise.resolve({ ok: false });
          }
        }
        for (const write of writes) {
          const key = JSON.stringify(write.key);
          if (write.type === "delete") {
            this.records.delete(key);
          } else {
            this.records.set(key, {
              key: write.key,
              value: structuredClone(write.value),
              versionstamp: String(this.nextVersion++),
            });
          }
        }
        return Promise.resolve({ ok: true });
      },
    };
    return operation;
  }

  public close(): void {
    // Closing a KV handle must not erase its durable records.
  }
}

class TestSocket implements DenoSocketLike {
  public readonly messages: unknown[] = [];
  public readonly handlers = new Map<string, (...arguments_: unknown[]) => void>();
  public closeCode: number | undefined;

  public send(data: string): void {
    this.messages.push(hostProtocolEnvelopeSchema.parse(JSON.parse(data) as unknown));
  }

  public close(code?: number): void {
    this.closeCode = code;
  }

  public on(event: string, listener: (...arguments_: unknown[]) => void): void {
    this.handlers.set(event, listener);
  }

  public async receive(data: unknown, isBinary = false): Promise<void> {
    this.handlers.get("message")?.(data, isBinary);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

const roomRequest = {
  displayName: "Alice",
  rulesetId: "training_relaxed_v1",
  matchLength: "one_wind" as const,
  seed: "deno-room-seed",
  fillPolicy: "fill_with_bots" as const,
};

describe("Deno KV multiplayer service", () => {
  it("uses a bounded browser origin allowlist by default", () => {
    const service = new DenoMultiplayerService({ kv: new MemoryKv() });
    expect(service.allowsOrigin("http://127.0.0.1:4173")).toBe(true);
    expect(service.allowsOrigin("https://evil.example")).toBe(false);
    expect(service.allowsOrigin(undefined)).toBe(true);
    service.close();
  });

  it("rejects game access after a started room is closed", async () => {
    const service = new DenoMultiplayerService({ kv: new MemoryKv() });
    const created = await service.createRoom(roomRequest);
    const started = await service.startRoom(created.roomId, created.ticket, "start:closed-game");
    await service.roomStore.setStatus(created.roomId, "closed");
    await expect(
      service.getObservation(started.game.gameId, created.playerId, "main", created.ticket),
    ).rejects.toMatchObject({
      code: "invalid_request",
      details: { reason: "room_closed" },
      statusCode: 409,
    });
    service.close();
  });

  it("creates, starts, acts, retries, and resumes from a fresh service instance", async () => {
    const kv = new MemoryKv();
    const first = new DenoMultiplayerService({
      kv,
      roomIdFactory: () => "room_deno",
      playerIdFactory: () => "player_alice",
      ticketFactory: () => "v1.deno-ticket-0123456789abcdef",
    });
    const created = await first.createRoom(roomRequest);
    const started = await first.startRoom(created.roomId, created.ticket, "start:deno");
    expect(started.observation.private.concealedTiles.length).toBeGreaterThan(0);
    expect(started.observation).not.toHaveProperty("wall");
    const action = started.observation.legalActions[0];
    if (action === undefined) {
      throw new Error("Expected a legal opening action");
    }
    const submission = {
      gameId: started.game.gameId,
      playerId: created.playerId,
      branchId: "main",
      expectedRevision: started.observation.revision,
      requestId: "action:deno:one",
      actionId: action.id,
      ticket: created.ticket,
    } as const;
    const applied = await first.submitAction(submission);
    expect(applied.idempotent).toBe(false);
    await first.advanceBotTurns(started.game.gameId);
    const retry = await first.submitAction(submission);
    expect(retry.idempotent).toBe(true);
    expect(retry.observation.revision).toBe(applied.endRevision);
    first.close();

    const resumed = new DenoMultiplayerService({ kv });
    const inspected = await resumed.inspectRoom(created.roomId);
    expect(inspected.gameId).toBe(started.game.gameId);
    const observation = await resumed.getObservation(
      started.game.gameId,
      created.playerId,
      "main",
      created.ticket,
    );
    expect(observation.revision).toBeGreaterThanOrEqual(applied.endRevision);
    expect(observation.private.concealedTiles).not.toEqual([]);
    await expect(
      resumed.submitAction({
        ...submission,
        actionId: "discard:characters.9#1",
      }),
    ).rejects.toMatchObject({ code: "duplicate_request" });
    await expect(
      resumed.submitAction({
        ...submission,
        expectedRevision: submission.expectedRevision + 1,
      }),
    ).rejects.toMatchObject({ code: "duplicate_request" });
    resumed.close();
  });

  it("does not start a room after it has been closed", async () => {
    const service = new DenoMultiplayerService({ kv: new MemoryKv() });
    const created = await service.createRoom(roomRequest);
    await service.roomStore.setStatus(created.roomId, "closed");
    await expect(
      service.startRoom(created.roomId, created.ticket, "start:closed"),
    ).rejects.toMatchObject({
      code: "invalid_request",
      details: { reason: "room_not_ready" },
      statusCode: 409,
    });
    await expect(
      service.joinRoom(created.roomId, { displayName: "Reconnect" }, created.ticket),
    ).rejects.toMatchObject({
      code: "invalid_request",
      details: { reason: "room_closed" },
      statusCode: 409,
    });
    service.close();
  });

  it("does not close a room after a durable start reservation is claimed", async () => {
    const service = new DenoMultiplayerService({ kv: new MemoryKv() });
    const created = await service.createRoom(roomRequest);
    expect(await service.roomStore.claimStart(created.roomId, "start:claimed")).toBe(false);
    expect(await service.roomStore.closeWaitingRoom(created.roomId)).toBe(false);
    await expect(service.inspectRoom(created.roomId)).resolves.toMatchObject({
      status: "waiting",
      acceptingJoins: false,
    });
    await expect(service.closeRoom(created.roomId, created.ticket)).rejects.toMatchObject({
      code: "invalid_request",
      details: { reason: "room_already_started" },
      statusCode: 409,
    });
    service.close();
  });

  it("does not let retention close a stale room after a start reservation", async () => {
    let now = new Date("2026-08-06T00:00:00.000Z");
    const service = new DenoMultiplayerService({
      kv: new MemoryKv(),
      retentionMs: 1_000,
      clock: () => new Date(now),
    });
    const created = await service.createRoom(roomRequest);
    expect(await service.roomStore.claimStart(created.roomId, "start:retention")).toBe(false);
    now = new Date("2026-08-06T00:00:02.000Z");
    await expect(service.inspectRoom(created.roomId)).resolves.toMatchObject({
      status: "waiting",
      acceptingJoins: false,
    });
    service.close();
  });

  it("serializes concurrent identical start requests to one game", async () => {
    const service = new DenoMultiplayerService({ kv: new MemoryKv() });
    const created = await service.createRoom(roomRequest);
    const outcomes = await Promise.allSettled([
      service.startRoom(created.roomId, created.ticket, "start:concurrent"),
      service.startRoom(created.roomId, created.ticket, "start:concurrent"),
    ]);
    const fulfilled = outcomes.filter(
      (outcome): outcome is PromiseFulfilledResult<Awaited<ReturnType<typeof service.startRoom>>> =>
        outcome.status === "fulfilled",
    );
    expect(fulfilled).toHaveLength(2);
    expect(fulfilled[0]?.value.game.gameId).toBe(fulfilled[1]?.value.game.gameId);
    expect(await service.inspectRoom(created.roomId)).toMatchObject({
      status: "active",
      gameId: fulfilled[0]?.value.game.gameId,
    });
    service.close();
  });

  it("turns a concurrent revision loss into a stale action error", async () => {
    const service = new DenoMultiplayerService({ kv: new MemoryKv() });
    const created = await service.createRoom(roomRequest);
    const started = await service.startRoom(created.roomId, created.ticket, "start:race");
    const action = started.observation.legalActions[0];
    if (action === undefined) throw new Error("Expected a legal opening action");
    const base = {
      gameId: started.game.gameId,
      playerId: created.playerId,
      branchId: "main" as const,
      expectedRevision: started.observation.revision,
      actionId: action.id,
      ticket: created.ticket,
    };
    const outcomes = await Promise.allSettled([
      service.submitAction({ ...base, requestId: "action:race:one" }),
      service.submitAction({ ...base, requestId: "action:race:two" }),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    expect(rejected?.status === "rejected" ? rejected.reason : null).toMatchObject({
      code: "stale_revision",
    });
    service.close();
  });

  it("catches up a remote commit and emits the next action request", async () => {
    const kv = new MemoryKv();
    const writer = new DenoMultiplayerService({ kv });
    const reader = new DenoMultiplayerService({ kv });
    const created = await writer.createRoom(roomRequest);
    const started = await writer.startRoom(created.roomId, created.ticket, "start:fanout");
    const socket = new TestSocket();
    const hub = new DenoMultiplayerSocketHub(reader);
    await hub.attach(socket, {
      gameId: started.game.gameId,
      playerId: created.playerId,
      branchId: "main",
      ticket: created.ticket,
      fromRevision: started.observation.revision,
    });
    const initialActionRequests = socket.messages.filter(
      (message) => (message as { readonly type: string }).type === "action_request",
    ).length;
    hub.startNotificationPump(1);
    const action = started.observation.legalActions[0];
    if (action === undefined) throw new Error("Expected a legal opening action");
    await writer.submitAction({
      gameId: started.game.gameId,
      playerId: created.playerId,
      branchId: "main",
      expectedRevision: started.observation.revision,
      requestId: "action:fanout:one",
      actionId: action.id,
      ticket: created.ticket,
    });
    await writer.advanceBotTurns(started.game.gameId);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const actionRequests = socket.messages.filter(
        (message) => (message as { readonly type: string }).type === "action_request",
      ).length;
      const actionAccepted = socket.messages.some(
        (message) => (message as { readonly type: string }).type === "action_accepted",
      );
      if (actionRequests > initialActionRequests && actionAccepted) break;
      await new Promise<void>((resolve) => setTimeout(resolve, 2));
    }
    expect(
      socket.messages.some(
        (message) => (message as { readonly type: string }).type === "public_event",
      ),
    ).toBe(true);
    expect(
      socket.messages.filter(
        (message) => (message as { readonly type: string }).type === "action_request",
      ).length,
    ).toBeGreaterThan(initialActionRequests);
    expect(
      socket.messages.find(
        (message) => (message as { readonly type: string }).type === "action_accepted",
      ),
    ).toMatchObject({
      type: "action_accepted",
      requestId: "action:fanout:one",
      payload: {
        playerId: created.playerId,
        actionId: action.id,
        source: "human",
      },
    });
    hub.stop();
    writer.close();
    reader.close();
  });

  it("delivers an accepted action to every socket using the same player ticket", async () => {
    const service = new DenoMultiplayerService({ kv: new MemoryKv() });
    const created = await service.createRoom(roomRequest);
    const started = await service.startRoom(created.roomId, created.ticket, "start:multi-socket");
    const first = new TestSocket();
    const second = new TestSocket();
    const hub = new DenoMultiplayerSocketHub(service);
    await hub.attach(first, {
      gameId: started.game.gameId,
      playerId: created.playerId,
      branchId: "main",
      ticket: created.ticket,
      fromRevision: started.observation.revision,
    });
    await hub.attach(second, {
      gameId: started.game.gameId,
      playerId: created.playerId,
      branchId: "main",
      ticket: created.ticket,
      fromRevision: started.observation.revision,
    });
    const action = started.observation.legalActions[0];
    if (action === undefined) throw new Error("Expected a legal opening action");
    await first.receive(
      JSON.stringify(
        createProtocolEnvelope({
          type: "submit_action",
          seq: 0,
          gameId: started.game.gameId,
          branchId: "main",
          requestId: "action:multi-socket",
          payload: {
            playerId: created.playerId,
            branchId: "main",
            expectedRevision: started.observation.revision,
            requestId: "action:multi-socket",
            actionId: action.id,
          },
        }),
      ),
    );
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (
        first.messages.some(
          (message) => (message as { readonly type: string }).type === "action_accepted",
        )
      ) {
        break;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 2));
    }
    expect(
      first.messages.filter(
        (message) => (message as { readonly type: string }).type === "action_accepted",
      ),
    ).toHaveLength(1);
    expect(
      second.messages.filter(
        (message) => (message as { readonly type: string }).type === "action_accepted",
      ),
    ).toHaveLength(1);
    hub.stop();
    service.close();
  });

  it("rejects unauthorized Deno socket connections before sending game data", async () => {
    const kv = new MemoryKv();
    const service = new DenoMultiplayerService({ kv, allowedOrigins: ["https://allowed.example"] });
    const socket: DenoSocketLike = {
      send: () => undefined,
      close: (code) => expect(code).toBe(1008),
      on: () => undefined,
    };
    const hub = new DenoMultiplayerSocketHub(service);
    await hub.attach(socket, {
      gameId: "missing",
      playerId: "missing",
      branchId: "main",
      ticket: "v1.invalid-ticket-0123456789",
      fromRevision: 0,
      origin: "https://blocked.example",
    });
    service.close();
  });

  it("keeps game_started in an out-of-window join sequence", async () => {
    const service = new DenoMultiplayerService({
      kv: new MemoryKv(),
      deliveryWindow: 1,
    });
    const created = await service.createRoom(roomRequest);
    const started = await service.startRoom(created.roomId, created.ticket, "start:window");
    const socket = new TestSocket();
    await new DenoMultiplayerSocketHub(service).attach(socket, {
      gameId: started.game.gameId,
      playerId: created.playerId,
      branchId: "main",
      ticket: created.ticket,
      fromRevision: 0,
    });
    expect(socket.messages.map((message) => (message as { readonly type: string }).type)).toEqual([
      "hello",
      "game_started",
      "observation",
      "error",
      "action_request",
    ]);
    expect(socket.messages[3]).toMatchObject({
      type: "error",
      payload: { details: { resyncRequired: true } },
    });
    service.close();
  });

  it("keeps malformed action payloads isolated and accepts client sequences independently", async () => {
    const kv = new MemoryKv();
    const service = new DenoMultiplayerService({
      kv,
      roomIdFactory: () => "room_socket",
      playerIdFactory: () => "player_socket",
      ticketFactory: () => "v1.socket-ticket-0123456789abcdef",
    });
    const created = await service.createRoom(roomRequest);
    const started = await service.startRoom(created.roomId, created.ticket, "start:socket");
    const socket = new TestSocket();
    const hub = new DenoMultiplayerSocketHub(service);
    await hub.attach(socket, {
      gameId: started.game.gameId,
      playerId: created.playerId,
      branchId: "main",
      ticket: created.ticket,
      fromRevision: 0,
    });
    const hostMessages = (): readonly { readonly type: string; readonly seq: number }[] =>
      socket.messages as { readonly type: string; readonly seq: number }[];
    expect(hostMessages()[0]).toMatchObject({ type: "hello", seq: 0 });

    await socket.receive("not-json");
    expect(hostMessages().filter(({ type }) => type === "error")).toHaveLength(1);
    await socket.receive(
      JSON.stringify(
        createProtocolEnvelope({
          type: "ping",
          seq: 0,
          gameId: started.game.gameId,
          branchId: "main",
          payload: { nonce: "ping:zero" },
        }),
      ),
    );
    await socket.receive(
      JSON.stringify(
        createProtocolEnvelope({
          type: "submit_action",
          seq: 1,
          gameId: started.game.gameId,
          branchId: "main",
          payload: {
            playerId: created.playerId,
            branchId: "main",
            expectedRevision: started.observation.revision,
            requestId: "malformed:action",
          },
        }),
      ),
    );
    expect(hostMessages().filter(({ type }) => type === "error")).toHaveLength(2);
    await socket.receive(
      JSON.stringify(
        createProtocolEnvelope({
          type: "ping",
          seq: 1,
          gameId: started.game.gameId,
          branchId: "main",
          payload: { nonce: "ping:one" },
        }),
      ),
    );
    expect(socket.closeCode).toBeUndefined();
    const sequences = hostMessages().map(({ seq }) => seq);
    expect(sequences).toEqual([...sequences].sort((left, right) => left - right));
    hub.stop();
    service.close();
  });
});
