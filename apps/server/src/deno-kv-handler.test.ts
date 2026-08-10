import { describe, expect, it } from "vitest";
import { DenoMultiplayerService } from "./deno-multiplayer.js";
import type {
  DenoKvAtomicOperation,
  DenoKvEntry,
  DenoKvLike,
} from "../../../packages/persistence/src/deno-kv.js";
import {
  createDenoKvHandler,
  type DenoKvRuntime,
  type DenoKvRuntimeSocket,
} from "./deno-kv-handler.js";

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
    const prefix = JSON.stringify(selector.prefix).slice(0, -1);
    for (const record of this.records.values()) {
      if (!JSON.stringify(record.key).startsWith(`${prefix},`)) continue;
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
      commit: async () => {
        await Promise.resolve();
        for (const check of checks) {
          const current = this.records.get(JSON.stringify(check.key));
          if ((current?.versionstamp ?? null) !== check.versionstamp) return { ok: false };
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
        return { ok: true };
      },
    };
    return operation;
  }

  public close(): void {
    // Durable records intentionally survive a service restart.
  }
}

const runtimeSocket = (): DenoKvRuntimeSocket => {
  const listeners = new Map<string, (event: { readonly data?: unknown }) => void>();
  return {
    addEventListener: (event, listener) => listeners.set(event, listener),
    send: () => undefined,
    close: () => undefined,
  };
};

const runtime = (): DenoKvRuntime => ({
  serve: () => undefined,
  upgradeWebSocket: () => ({ socket: runtimeSocket(), response: new Response(null) }),
});

const roomRequest = {
  displayName: "Alice",
  rulesetId: "training_relaxed_v1",
  matchLength: "one_wind" as const,
  seed: "handler-seed",
  fillPolicy: "fill_with_bots" as const,
};

describe("Deno KV HTTP handler", () => {
  it("serves room lifecycle, ticket query authentication, observation redaction, and actions", async () => {
    const service = new DenoMultiplayerService({
      kv: new MemoryKv(),
      roomIdFactory: () => "room_handler",
      playerIdFactory: () => "p_handler",
      ticketFactory: () => "v1.handler-ticket-0123456789abcdef",
    });
    const handler = createDenoKvHandler(service, runtime());

    const createdResponse = await handler(
      new Request("https://deno.test/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(roomRequest),
      }),
    );
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as {
      roomId: string;
      playerId: string;
      ticket: string;
    };

    const startedResponse = await handler(
      new Request(
        `https://deno.test/api/rooms/${created.roomId}/start?ticket=${encodeURIComponent(created.ticket)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ requestId: "start:handler" }),
        },
      ),
    );
    expect(startedResponse.status).toBe(200);
    const started = (await startedResponse.json()) as {
      game: { gameId: string; branchId: string };
      observation: { revision: number; legalActions: { id: string }[]; [key: string]: unknown };
    };
    expect(started.game.branchId).toBe("main");
    expect(started.observation).not.toHaveProperty("wall");

    const observationResponse = await handler(
      new Request(
        `https://deno.test/api/games/${started.game.gameId}/observation?playerId=${created.playerId}&branchId=main&ticket=${encodeURIComponent(created.ticket)}`,
      ),
    );
    expect(observationResponse.status).toBe(200);
    const observation = (await observationResponse.json()) as {
      revision: number;
      legalActions: { id: string }[];
    };
    expect(observation.revision).toBe(started.observation.revision);
    expect(observation.legalActions.length).toBeGreaterThan(0);

    const action = observation.legalActions[0];
    if (action === undefined) throw new Error("Expected a legal opening action");
    const actionResponse = await handler(
      new Request(`https://deno.test/api/games/${started.game.gameId}/actions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${created.ticket}`,
        },
        body: JSON.stringify({
          playerId: created.playerId,
          branchId: "main",
          expectedRevision: observation.revision,
          requestId: "action:handler:one",
          actionId: action.id,
        }),
      }),
    );
    expect(actionResponse.status).toBe(200);
    expect((await actionResponse.json()) as { accepted: boolean }).toMatchObject({
      accepted: true,
    });

    const unauthorizedResponse = await handler(
      new Request(
        `https://deno.test/api/games/${started.game.gameId}/observation?playerId=${created.playerId}&ticket=v1.invalid-ticket-0123456789`,
      ),
    );
    expect(unauthorizedResponse.status).toBe(401);
    service.close();
  });

  it("rejects a websocket upgrade without a ticket before invoking the runtime", async () => {
    const service = new DenoMultiplayerService({ kv: new MemoryKv() });
    let upgraded = false;
    const fakeRuntime: DenoKvRuntime = {
      serve: () => undefined,
      upgradeWebSocket: () => {
        upgraded = true;
        return { socket: runtimeSocket(), response: new Response(null) };
      },
    };
    const handler = createDenoKvHandler(service, fakeRuntime);
    const response = await handler(
      new Request("https://deno.test/ws/games/missing?playerId=p_missing&branchId=main", {
        headers: { upgrade: "websocket" },
      }),
    );
    expect(response.status).toBe(401);
    expect(upgraded).toBe(false);
    service.close();
  });

  it("validates the ticket and origin before upgrading a websocket", async () => {
    const service = new DenoMultiplayerService({
      kv: new MemoryKv(),
      roomIdFactory: () => "room_ws_auth",
      playerIdFactory: () => "p_ws_auth",
      ticketFactory: () => "v1.ws-auth-ticket-0123456789abcdef",
    });
    const created = await service.createRoom({
      ...roomRequest,
      fillPolicy: "fill_with_bots",
    });
    const started = await service.startRoom(created.roomId, created.ticket, "start:ws-auth");
    let upgrades = 0;
    const fakeRuntime: DenoKvRuntime = {
      serve: () => undefined,
      upgradeWebSocket: () => {
        upgrades += 1;
        return { socket: runtimeSocket(), response: new Response(null) };
      },
    };
    const handler = createDenoKvHandler(service, fakeRuntime);
    const invalidTicket = await handler(
      new Request(
        `https://deno.test/ws/games/${started.game.gameId}?playerId=${created.playerId}&branchId=main&ticket=v1.invalid-ticket-0123456789`,
        { headers: { upgrade: "websocket" } },
      ),
    );
    expect(invalidTicket.status).toBe(401);
    expect(upgrades).toBe(0);
    const blockedOrigin = await handler(
      new Request(
        `https://deno.test/ws/games/${started.game.gameId}?playerId=${created.playerId}&branchId=main&ticket=${encodeURIComponent(created.ticket)}`,
        { headers: { upgrade: "websocket", origin: "https://blocked.example" } },
      ),
    );
    expect(blockedOrigin.status).toBe(403);
    expect(upgrades).toBe(0);
    service.close();
  });

  it("maps an unknown game to the documented not-found response", async () => {
    const service = new DenoMultiplayerService({ kv: new MemoryKv() });
    const handler = createDenoKvHandler(service, runtime());
    const response = await handler(
      new Request(
        "https://deno.test/api/games/game_missing/observation?playerId=p_missing&branchId=main&ticket=v1.invalid-ticket-0123456789",
      ),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "unknown_game", details: { reason: "unknown_game" } },
    });
    service.close();
  });

  it("keeps unknown API and websocket routes on the structured error boundary", async () => {
    const service = new DenoMultiplayerService({ kv: new MemoryKv() });
    const handler = createDenoKvHandler(service, runtime());
    for (const path of ["/api/missing", "/ws/missing"]) {
      const response = await handler(new Request(`https://deno.test${path}`));
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        error: { code: "invalid_request", details: { reason: "not_found" } },
      });
    }
    service.close();
  });
});
