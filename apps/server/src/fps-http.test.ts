import { afterEach, describe, expect, it } from "vitest";
import { FpsMatch } from "@hk-mahjong/fps";
import { FPS_WEBSOCKET_PROTOCOL, fpsSnapshotSchema } from "@hk-mahjong/protocol";
import { FpsMatchService } from "./fps-match.js";
import {
  buildServer,
  fpsWebSocketTicketFromProtocolHeader,
  selectFpsWebSocketProtocol,
} from "./index.js";
import { MultiplayerService } from "./multiplayer.js";

const servers: Awaited<ReturnType<typeof buildServer>>[] = [];
const services: { readonly multiplayer: MultiplayerService; readonly fps: FpsMatchService }[] = [];

interface NativeWebSocketConnection {
  readonly socket: WebSocket;
  readonly opened: Promise<void>;
  readonly closed: Promise<number>;
}

const connectNativeWebSocket = (
  url: string,
  protocols: readonly string[],
): NativeWebSocketConnection => {
  const socket = new WebSocket(url, Array.from(protocols));
  const opened = new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error("FPS WebSocket open failed")), {
      once: true,
    });
  });
  const closed = new Promise<number>((resolve) => {
    socket.addEventListener("close", (event) => resolve(event.code), { once: true });
  });
  return { socket, opened, closed };
};

afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
  for (const service of services.splice(0)) {
    service.multiplayer.close();
    service.fps.close();
  }
});

describe("FPS HTTP surface", () => {
  it("rejects an untrusted browser origin before creating an FPS room", async () => {
    const multiplayer = new MultiplayerService({ databasePath: ":memory:" });
    const fps = new FpsMatchService({ allowedOrigins: ["https://allowed.example"] });
    const server = await buildServer({ multiplayer, fps });
    servers.push(server);
    services.push({ multiplayer, fps });
    const response = await server.inject({
      method: "POST",
      url: "/api/fps/rooms",
      headers: { origin: "https://blocked.example" },
      payload: { displayName: "Alice", seed: "origin-http-seed" },
    });
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body)).toMatchObject({ code: "origin_not_allowed" });
  });

  it("creates, joins, readies, starts, and snapshots through the real Fastify routes", async () => {
    const multiplayer = new MultiplayerService({ databasePath: ":memory:" });
    const fps = new FpsMatchService({
      matchFactory: (options) => new FpsMatch({ ...options, skipCountdown: true }),
    });
    const server = await buildServer({ multiplayer, fps });
    servers.push(server);
    services.push({ multiplayer, fps });
    const createdResponse = await server.inject({
      method: "POST",
      url: "/api/fps/rooms",
      payload: { displayName: "Alice", seed: "http-seed" },
    });
    expect(createdResponse.statusCode).toBe(201);
    const created = JSON.parse(createdResponse.body) as {
      readonly matchId: string;
      readonly ticket: string;
      readonly playerId: string;
    };
    const joinedResponse = await server.inject({
      method: "POST",
      url: `/api/fps/rooms/${created.matchId}/join`,
      payload: { displayName: "Bob" },
    });
    expect(joinedResponse.statusCode).toBe(200);
    const joined = JSON.parse(joinedResponse.body) as {
      readonly playerId: string;
      readonly ticket: string;
    };
    for (const player of [created, joined]) {
      const readyResponse = await server.inject({
        method: "POST",
        url: `/api/fps/matches/${created.matchId}/ready`,
        headers: { authorization: `Bearer ${player.ticket}` },
        payload: { playerId: player.playerId, requestId: `ready-${player.playerId}` },
      });
      expect(readyResponse.statusCode).toBe(200);
    }
    const startedResponse = await server.inject({
      method: "POST",
      url: `/api/fps/matches/${created.matchId}/start`,
      headers: { authorization: `Bearer ${created.ticket}` },
      payload: { playerId: created.playerId, requestId: "start-http" },
    });
    expect(startedResponse.statusCode).toBe(200);
    expect(JSON.parse(startedResponse.body)).toMatchObject({
      phase: "active",
      matchId: created.matchId,
    });
    const snapshotResponse = await server.inject({
      method: "GET",
      url: `/api/fps/matches/${created.matchId}/snapshot?playerId=${created.playerId}`,
      headers: { authorization: `Bearer ${created.ticket}` },
    });
    expect(snapshotResponse.statusCode).toBe(200);
    expect(JSON.parse(snapshotResponse.body)).not.toHaveProperty("players.0.ammoInMagazine");
    const queryTicketResponse = await server.inject({
      method: "GET",
      url: `/api/fps/matches/${created.matchId}/snapshot?playerId=${created.playerId}&ticket=${encodeURIComponent(created.ticket)}`,
    });
    expect(queryTicketResponse.statusCode).toBe(401);
  });

  it("authenticates FPS WebSockets through subprotocols and rejects query tickets", async () => {
    const multiplayer = new MultiplayerService({ databasePath: ":memory:" });
    const fps = new FpsMatchService({
      matchFactory: (options) => new FpsMatch({ ...options, skipCountdown: true }),
    });
    const server = await buildServer({ multiplayer, fps });
    servers.push(server);
    services.push({ multiplayer, fps });
    const createdResponse = await server.inject({
      method: "POST",
      url: "/api/fps/rooms",
      payload: { displayName: "Alice", seed: "websocket-subprotocol-seed" },
    });
    const created = JSON.parse(createdResponse.body) as {
      readonly matchId: string;
      readonly playerId: string;
      readonly ticket: string;
    };
    const offeredProtocols = `${FPS_WEBSOCKET_PROTOCOL},${created.ticket}`;
    expect(fpsWebSocketTicketFromProtocolHeader(offeredProtocols)).toBe(created.ticket);
    expect(fpsWebSocketTicketFromProtocolHeader(created.ticket)).toBeUndefined();
    expect(selectFpsWebSocketProtocol(new Set([created.ticket, FPS_WEBSOCKET_PROTOCOL]))).toBe(
      FPS_WEBSOCKET_PROTOCOL,
    );
    expect(selectFpsWebSocketProtocol(new Set([created.ticket]))).toBe("");

    await server.listen({ host: "127.0.0.1", port: 0 });
    const address = server.server.address();
    if (address === null || typeof address === "string") {
      throw new Error("FPS test server did not expose an ephemeral TCP port");
    }
    const websocketOrigin = `ws://127.0.0.1:${String(address.port)}`;
    const socketConnection = connectNativeWebSocket(
      `${websocketOrigin}/ws/fps/${encodeURIComponent(created.matchId)}?playerId=${encodeURIComponent(created.playerId)}`,
      [FPS_WEBSOCKET_PROTOCOL, created.ticket],
    );
    await socketConnection.opened;
    expect(socketConnection.socket.protocol).toBe(FPS_WEBSOCKET_PROTOCOL);
    expect(fps.getMetrics().websocketUpgrades).toBe(1);
    const socketClosed = socketConnection.closed;
    socketConnection.socket.close(1000, "test_done");
    expect(await socketClosed).toBe(1000);

    const queryTicketConnection = connectNativeWebSocket(
      `${websocketOrigin}/ws/fps/${encodeURIComponent(created.matchId)}?playerId=${encodeURIComponent(created.playerId)}&ticket=${encodeURIComponent(created.ticket)}`,
      [FPS_WEBSOCKET_PROTOCOL, created.ticket],
    );
    await queryTicketConnection.opened;
    const closeCode = await queryTicketConnection.closed;
    expect(closeCode).toBe(1008);
    expect(fps.getMetrics().websocketUpgradeFailures).toBe(0);
  });

  it("allows only the room owner to kick through the Bearer route", async () => {
    const multiplayer = new MultiplayerService({ databasePath: ":memory:" });
    const fps = new FpsMatchService({
      matchFactory: (options) => new FpsMatch({ ...options, skipCountdown: true }),
    });
    const server = await buildServer({ multiplayer, fps });
    servers.push(server);
    services.push({ multiplayer, fps });
    const createdResponse = await server.inject({
      method: "POST",
      url: "/api/fps/rooms",
      payload: { displayName: "Owner", seed: "http-kick-seed" },
    });
    const created = JSON.parse(createdResponse.body) as {
      readonly matchId: string;
      readonly playerId: string;
      readonly ticket: string;
    };
    const joinedResponse = await server.inject({
      method: "POST",
      url: `/api/fps/rooms/${created.matchId}/join`,
      payload: { displayName: "Target" },
    });
    const joined = JSON.parse(joinedResponse.body) as {
      readonly playerId: string;
      readonly ticket: string;
    };
    for (const player of [created, joined]) {
      const readyResponse = await server.inject({
        method: "POST",
        url: `/api/fps/matches/${created.matchId}/ready`,
        headers: { authorization: `Bearer ${player.ticket}` },
        payload: { playerId: player.playerId, requestId: `kick-ready-${player.playerId}` },
      });
      expect(readyResponse.statusCode).toBe(200);
    }
    const startResponse = await server.inject({
      method: "POST",
      url: `/api/fps/matches/${created.matchId}/start`,
      headers: { authorization: `Bearer ${created.ticket}` },
      payload: { playerId: created.playerId, requestId: "kick-start" },
    });
    expect(startResponse.statusCode).toBe(200);
    const nonOwner = await server.inject({
      method: "POST",
      url: `/api/fps/matches/${created.matchId}/kick`,
      headers: { authorization: `Bearer ${joined.ticket}` },
      payload: { playerId: joined.playerId, targetPlayerId: created.playerId },
    });
    expect(nonOwner.statusCode).toBe(403);
    expect(JSON.parse(nonOwner.body)).toMatchObject({ code: "invalid_ticket" });
    const selfKick = await server.inject({
      method: "POST",
      url: `/api/fps/matches/${created.matchId}/kick`,
      headers: { authorization: `Bearer ${created.ticket}` },
      payload: { playerId: created.playerId, targetPlayerId: created.playerId },
    });
    expect(selfKick.statusCode).toBe(400);
    const kicked = await server.inject({
      method: "POST",
      url: `/api/fps/matches/${created.matchId}/kick`,
      headers: { authorization: `Bearer ${created.ticket}` },
      payload: { playerId: created.playerId, targetPlayerId: joined.playerId },
    });
    expect(kicked.statusCode).toBe(200);
    const kickedSnapshot = fpsSnapshotSchema.parse(JSON.parse(kicked.body) as unknown);
    expect(kickedSnapshot.phase).toBe("active");
    expect(
      kickedSnapshot.players.find((player) => player.playerId === joined.playerId),
    ).toMatchObject({ lifecycle: "spectator", alive: false });
    const revokedTarget = await server.inject({
      method: "GET",
      url: `/api/fps/matches/${created.matchId}/snapshot?playerId=${joined.playerId}`,
      headers: { authorization: `Bearer ${joined.ticket}` },
    });
    expect(revokedTarget.statusCode).toBe(403);
  });

  it("rate-limits HTTP input per client identity using the same policy as sockets", async () => {
    const multiplayer = new MultiplayerService({ databasePath: ":memory:" });
    const fps = new FpsMatchService({
      maxInputsPerSecond: 1,
      matchFactory: (options) => new FpsMatch({ ...options, skipCountdown: true }),
    });
    const server = await buildServer({ multiplayer, fps });
    servers.push(server);
    services.push({ multiplayer, fps });
    const createdResponse = await server.inject({
      method: "POST",
      url: "/api/fps/rooms",
      payload: { displayName: "Alice", seed: "http-rate-seed" },
    });
    const created = JSON.parse(createdResponse.body) as {
      readonly matchId: string;
      readonly playerId: string;
      readonly ticket: string;
    };
    const joinedResponse = await server.inject({
      method: "POST",
      url: `/api/fps/rooms/${created.matchId}/join`,
      payload: { displayName: "Bob" },
    });
    const joined = JSON.parse(joinedResponse.body) as {
      readonly playerId: string;
      readonly ticket: string;
    };
    for (const player of [created, joined]) {
      const readyResponse = await server.inject({
        method: "POST",
        url: `/api/fps/matches/${created.matchId}/ready`,
        headers: { authorization: `Bearer ${player.ticket}` },
        payload: { playerId: player.playerId, requestId: `http-rate-ready-${player.playerId}` },
      });
      expect(readyResponse.statusCode).toBe(200);
    }
    const startResponse = await server.inject({
      method: "POST",
      url: `/api/fps/matches/${created.matchId}/start`,
      headers: { authorization: `Bearer ${created.ticket}` },
      payload: { playerId: created.playerId, requestId: "http-rate-start" },
    });
    expect(startResponse.statusCode).toBe(200);
    const makeInput = (inputSequence: number) => ({
      protocolVersion: 1,
      matchId: created.matchId,
      playerId: created.playerId,
      inputSequence,
      clientTimestampMs: Date.now(),
      acknowledgedServerTick: 0,
      moveX: 0,
      moveY: 0,
      lookDeltaX: 0,
      lookDeltaY: 0,
      buttons: {
        forward: false,
        backward: false,
        left: false,
        right: false,
        sprint: false,
        crouch: false,
        jump: false,
        fire: false,
        reload: false,
      },
      selectedWeaponId: "pistol",
      actionNonce: null,
    });
    const firstInput = await server.inject({
      method: "POST",
      url: `/api/fps/matches/${created.matchId}/input`,
      headers: { authorization: `Bearer ${created.ticket}` },
      payload: makeInput(0),
    });
    const invalidTicketInput = await server.inject({
      method: "POST",
      url: `/api/fps/matches/${created.matchId}/input`,
      headers: { authorization: "Bearer invalid-http-rate-ticket" },
      payload: makeInput(0),
    });
    const secondInput = await server.inject({
      method: "POST",
      url: `/api/fps/matches/${created.matchId}/input`,
      headers: { authorization: `Bearer ${created.ticket}` },
      payload: makeInput(1),
    });
    expect(firstInput.statusCode).toBe(200);
    expect(invalidTicketInput.statusCode).toBe(403);
    expect(secondInput.statusCode).toBe(429);
    expect(fps.getMetrics().rateLimited).toBe(1);
  });
});
