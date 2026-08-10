import { strict as assert } from "node:assert";
import { mkdir, writeFile } from "node:fs/promises";
import { canonicalJsonHash } from "@hk-mahjong/core";
import { FpsMatch, type FpsSnapshot } from "@hk-mahjong/fps";
import {
  fpsRoomCreateResponseSchema,
  fpsRoomJoinResponseSchema,
  fpsSnapshotSchema,
} from "@hk-mahjong/protocol";
import { buildServer } from "../apps/server/src/index.js";
import {
  FpsMatchService,
  FpsServiceError,
  type FpsSocketLike,
} from "../apps/server/src/fps-match.js";

const MAX_FRAME_BYTES = 2048;
const MAX_INPUTS_PER_SECOND = 2;

class AbuseSocket implements FpsSocketLike {
  public readonly sent: string[] = [];
  public readonly listeners = new Map<string, (...arguments_: unknown[]) => void>();
  public closeCode: number | undefined;
  public closeReason: string | undefined;

  public send(data: string): void {
    this.sent.push(data);
  }

  public close(code?: number, reason?: string): void {
    this.closeCode = code;
    this.closeReason = reason;
  }

  public on(event: string, listener: (...arguments_: unknown[]) => void): void {
    this.listeners.set(event, listener);
  }

  public receive(data: string | Uint8Array, isBinary = false): void {
    this.listeners.get("message")?.(data, isBinary);
  }
}

const flush = async (): Promise<void> => {
  await new Promise<void>((resolve) => setImmediate(resolve));
};

const responseBody = (response: { readonly body: string }): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(response.body) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("fps_abuse_non_object_response");
  }
  return parsed as Record<string, unknown>;
};

const main = async (): Promise<void> => {
  const fps = new FpsMatchService({
    databasePath: ":memory:",
    maxFrameBytes: MAX_FRAME_BYTES,
    maxInputsPerSecond: MAX_INPUTS_PER_SECOND,
    matchFactory: (options) => new FpsMatch({ ...options, skipCountdown: true }),
  });
  const server = await buildServer({
    multiplayerOptions: { databasePath: ":memory:" },
    fps,
  });
  try {
    const created = await server.inject({
      method: "POST",
      url: "/api/fps/rooms",
      payload: { displayName: "Abuse-Owner", seed: "fps-abuse-owner" },
    });
    assert.equal(created.statusCode, 201);
    const owner = fpsRoomCreateResponseSchema.parse(responseBody(created));

    let createRateLimited = 0;
    for (let index = 0; index < 19; index += 1) {
      const response = await server.inject({
        method: "POST",
        url: "/api/fps/rooms",
        payload: {
          displayName: `Flood-${String(index)}`,
          seed: `fps-abuse-flood-${String(index)}`,
        },
      });
      assert.equal(response.statusCode, 201);
    }
    const createOverflow = await server.inject({
      method: "POST",
      url: "/api/fps/rooms",
      payload: { displayName: "Flood-overflow", seed: "fps-abuse-flood-overflow" },
    });
    if (createOverflow.statusCode === 429) createRateLimited += 1;
    assert.equal(createOverflow.statusCode, 429);

    const joined = fpsRoomJoinResponseSchema.parse(
      responseBody(
        await server.inject({
          method: "POST",
          url: `/api/fps/rooms/${encodeURIComponent(owner.matchId)}/join`,
          payload: { displayName: "Abuse-Target" },
        }),
      ),
    );

    let joinRateLimited = 0;
    for (let index = 0; index < 59; index += 1) {
      const response = await server.inject({
        method: "POST",
        url: "/api/fps/rooms/fps-abuse-missing/join",
        payload: { displayName: `Join-flood-${String(index)}` },
      });
      assert.equal(response.statusCode, 404);
    }
    const joinOverflow = await server.inject({
      method: "POST",
      url: "/api/fps/rooms/fps-abuse-missing/join",
      payload: { displayName: "Join-flood-overflow" },
    });
    if (joinOverflow.statusCode === 429) joinRateLimited += 1;
    assert.equal(joinOverflow.statusCode, 429);

    for (const player of [owner, joined]) {
      const ready = await server.inject({
        method: "POST",
        url: `/api/fps/matches/${encodeURIComponent(owner.matchId)}/ready`,
        headers: { authorization: `Bearer ${player.ticket}` },
        payload: { playerId: player.playerId, requestId: `abuse-ready-${player.playerId}` },
      });
      assert.equal(ready.statusCode, 200);
    }
    const started = await server.inject({
      method: "POST",
      url: `/api/fps/matches/${encodeURIComponent(owner.matchId)}/start`,
      headers: { authorization: `Bearer ${owner.ticket}` },
      payload: { playerId: owner.playerId, requestId: "abuse-start" },
    });
    assert.equal(started.statusCode, 200);
    // Freeze the authoritative tick while probing acknowledgement bounds. The abuse
    // receipt must not depend on wall-clock scheduling between the start snapshot
    // and the deliberately-future acknowledgement request.
    fps.stopClock();

    const invalidTicket = await server.inject({
      method: "GET",
      url: `/api/fps/matches/${encodeURIComponent(owner.matchId)}/snapshot?playerId=${encodeURIComponent(owner.playerId)}`,
      headers: { authorization: "Bearer definitely-not-a-ticket" },
    });
    assert.equal(invalidTicket.statusCode, 403);

    const malformedJson = await server.inject({
      method: "POST",
      url: "/api/fps/rooms",
      headers: { "content-type": "application/json" },
      payload: "{malformed",
    });
    assert.equal(malformedJson.statusCode, 400);

    const snapshot = fpsSnapshotSchema.parse(responseBody(started));
    const input = {
      protocolVersion: 1 as const,
      matchId: owner.matchId,
      playerId: owner.playerId,
      inputSequence: 0,
      clientTimestampMs: Date.now(),
      acknowledgedServerTick: snapshot.serverTick,
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
      selectedWeaponId: "pistol" as const,
      actionNonce: null,
    };
    const serviceErrorStatus = (action: () => void): number => {
      try {
        action();
      } catch (caught) {
        assert.ok(caught instanceof FpsServiceError);
        return caught.statusCode;
      }
      return 200;
    };
    const crossPlayerStatus = serviceErrorStatus(() =>
      fps.submitInput(owner.matchId, owner.playerId, joined.ticket, {
        ...input,
        playerId: owner.playerId,
      }),
    );
    const staleClockStatus = serviceErrorStatus(() =>
      fps.submitInput(owner.matchId, owner.playerId, owner.ticket, {
        ...input,
        clientTimestampMs: Date.now() - 100_000,
      }),
    );
    const futureAcknowledgementStatus = serviceErrorStatus(() =>
      fps.submitInput(owner.matchId, owner.playerId, owner.ticket, {
        ...input,
        inputSequence: 1,
        acknowledgedServerTick: snapshot.serverTick + 3,
      }),
    );
    assert.equal(crossPlayerStatus, 403);
    assert.equal(staleClockStatus, 409);
    assert.equal(futureAcknowledgementStatus, 409);

    const httpInputOne = await server.inject({
      method: "POST",
      url: `/api/fps/matches/${encodeURIComponent(owner.matchId)}/input`,
      headers: { authorization: `Bearer ${owner.ticket}` },
      payload: { ...input, inputSequence: 0 },
    });
    const httpInputTwo = await server.inject({
      method: "POST",
      url: `/api/fps/matches/${encodeURIComponent(owner.matchId)}/input`,
      headers: { authorization: `Bearer ${owner.ticket}` },
      payload: { ...input, inputSequence: 1 },
    });
    const httpInputOverflow = await server.inject({
      method: "POST",
      url: `/api/fps/matches/${encodeURIComponent(owner.matchId)}/input`,
      headers: { authorization: `Bearer ${owner.ticket}` },
      payload: { ...input, inputSequence: 2 },
    });
    assert.equal(httpInputOne.statusCode, 200);
    assert.equal(httpInputTwo.statusCode, 200);
    assert.equal(httpInputOverflow.statusCode, 429);

    const malformedSocket = new AbuseSocket();
    fps.attachSocket(malformedSocket, owner.matchId, owner.playerId, owner.ticket);
    malformedSocket.receive("{not-json");
    await flush();
    assert.ok(malformedSocket.sent.some((frame) => frame.includes('"type":"fps_error"')));

    const oversizedSocket = new AbuseSocket();
    fps.attachSocket(oversizedSocket, owner.matchId, owner.playerId, owner.ticket);
    oversizedSocket.receive("x".repeat(MAX_FRAME_BYTES + 1));
    assert.equal(oversizedSocket.closeCode, 1009);
    const oversizedCloseCode = oversizedSocket.closeCode;

    const binarySocket = new AbuseSocket();
    fps.attachSocket(binarySocket, owner.matchId, owner.playerId, owner.ticket);
    binarySocket.receive(new Uint8Array([1, 2, 3]), true);
    assert.equal(binarySocket.closeCode, 1003);
    const binaryCloseCode = binarySocket.closeCode;

    const rateSocket = new AbuseSocket();
    fps.attachSocket(rateSocket, owner.matchId, owner.playerId, owner.ticket);
    const makeEnvelope = (seq: number, inputSequence: number): string =>
      JSON.stringify({
        protocolVersion: 1,
        type: "fps_input",
        seq,
        timestamp: new Date().toISOString(),
        matchId: owner.matchId,
        payload: { ...input, inputSequence, clientTimestampMs: Date.now() },
      });
    rateSocket.receive(makeEnvelope(0, 0));
    rateSocket.receive(makeEnvelope(1, 1));
    rateSocket.receive(makeEnvelope(2, 2));
    await flush();
    assert.ok(rateSocket.sent.some((frame) => frame.includes('"code":"rate_limited"')));

    const replacementSocket = new AbuseSocket();
    fps.attachSocket(replacementSocket, owner.matchId, owner.playerId, owner.ticket);
    assert.equal(rateSocket.closeCode, 4001);
    const resyncEnvelope = JSON.stringify({
      protocolVersion: 1,
      type: "fps_resync_request",
      seq: 0,
      timestamp: new Date().toISOString(),
      matchId: owner.matchId,
      payload: {
        lastServerTick: snapshot.serverTick,
        lastSnapshotId: null,
      },
    });
    replacementSocket.receive(resyncEnvelope);
    await flush();
    assert.ok(
      replacementSocket.sent.some(
        (frame) => frame.includes('"type":"fps_snapshot"') && frame.includes('"full":true'),
      ),
    );

    const kickedSnapshot = fps.kickPlayer(
      owner.matchId,
      owner.playerId,
      owner.ticket,
      joined.playerId,
    );
    expectKickedPlayer(kickedSnapshot, joined.playerId);
    const kickedTicketStatus = serviceErrorStatus(() =>
      fps.getSnapshot(joined.matchId, joined.playerId, joined.ticket),
    );
    assert.equal(kickedTicketStatus, 403);
    assert.equal(fps.getMetrics().kickedPlayers, 1);

    const diagnostics = fps.getDiagnostics(owner.matchId, owner.playerId, owner.ticket);
    const encodedDiagnostics = JSON.stringify(diagnostics);
    assert.equal(encodedDiagnostics.includes(owner.ticket), false);
    assert.equal(fps.getMetrics().rateLimited > 0, true);
    assert.equal(fps.getMetrics().malformedFrames > 0, true);
    assert.equal(fps.getMetrics().oversizedFrames > 0, true);
    const receipt = {
      schemaVersion: 1,
      http: {
        createRateLimited,
        joinRateLimited,
        invalidTicketStatus: invalidTicket.statusCode,
        crossPlayerStatus,
        staleClockStatus,
        futureAcknowledgementStatus,
        httpInputStatuses: [
          httpInputOne.statusCode,
          httpInputTwo.statusCode,
          httpInputOverflow.statusCode,
        ],
        malformedJsonStatus: malformedJson.statusCode,
      },
      kick: {
        publicSpectator: true,
        ticketRevokedStatus: kickedTicketStatus,
      },
      websocket: {
        malformedFrame: true,
        oversizedCloseCode,
        binaryCloseCode,
        replacementCloseCode: rateSocket.closeCode,
        resyncSnapshot: true,
      },
      metrics: {
        rateLimited: fps.getMetrics().rateLimited,
        malformedFrames: fps.getMetrics().malformedFrames,
        oversizedFrames: fps.getMetrics().oversizedFrames,
        websocketUpgradeFailures: fps.getMetrics().websocketUpgradeFailures,
        kickedPlayers: fps.getMetrics().kickedPlayers,
      },
    };
    await mkdir("test-results", { recursive: true });
    await writeFile("test-results/fps-abuse.json", `${JSON.stringify(receipt, null, 2)}\n`);
    process.stdout.write(
      `${JSON.stringify({ ...receipt, receiptDigest: `sha256:${canonicalJsonHash(receipt)}` })}\n`,
    );
  } finally {
    await server.close();
    fps.close();
  }
};

const expectKickedPlayer = (snapshot: FpsSnapshot, playerId: string): void => {
  const player = snapshot.players.find((candidate) => candidate.playerId === playerId);
  assert.deepEqual(player && { lifecycle: player.lifecycle, alive: player.alive }, {
    lifecycle: "spectator",
    alive: false,
  });
};

await main();
