import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FpsMatch } from "@hk-mahjong/fps";
import { fpsSnapshotSchema } from "@hk-mahjong/protocol";
import { FpsMatchService, FpsServiceError, type FpsSocketLike } from "./fps-match.js";

class FakeSocket implements FpsSocketLike {
  public readonly sent: string[] = [];
  public readonly listeners = new Map<string, (...arguments_: unknown[]) => void>();
  public closed = false;
  public closeCode: number | undefined;
  public closeReason: string | undefined;

  public send(data: string): void {
    this.sent.push(data);
  }

  public close(code?: number, reason?: string): void {
    this.closed = true;
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

const input = (matchId: string, playerId: string) => ({
  protocolVersion: 1 as const,
  matchId,
  playerId,
  inputSequence: 0,
  clientTimestampMs: Date.now(),
  acknowledgedServerTick: 0,
  moveX: 0,
  moveY: 0,
  lookDeltaX: 0,
  lookDeltaY: 0,
  buttons: {
    forward: true,
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
});

const createService = (): FpsMatchService =>
  new FpsMatchService({
    matchFactory: (options) => new FpsMatch({ ...options, skipCountdown: true }),
  });

const startServiceMatch = (service: FpsMatchService) => {
  const owner = service.createRoom({ displayName: "Alice", seed: "abuse-seed" });
  const joined = service.joinRoom(owner.matchId, { displayName: "Bob" });
  service.ready(owner.matchId, owner.playerId, owner.ticket, "ready-owner");
  service.ready(joined.matchId, joined.playerId, joined.ticket, "ready-joined");
  service.start(owner.matchId, owner.playerId, owner.ticket, "start-owner");
  return { owner, joined };
};

const flushSocket = async (): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

describe("FPS match service", () => {
  it("creates a solo room with a server-owned rival using normal player state", () => {
    const service = createService();
    const owner = service.createRoom({
      displayName: "Alice",
      seed: "solo-service-seed",
      botCount: 1,
    });
    expect(owner.snapshot.players).toHaveLength(2);
    expect(owner.snapshot.scoreboard.map((entry) => entry.displayName)).toContain("Rival Echo");
    service.ready(owner.matchId, owner.playerId, owner.ticket, "solo-ready");
    const started = service.start(owner.matchId, owner.playerId, owner.ticket, "solo-start");
    expect(started.phase).toBe("active");
    expect(started.players.find((player) => player.displayName === "Rival Echo")).toMatchObject({
      health: 100,
      shield: 50,
      alive: true,
      lifecycle: "alive",
    });
    service.close();
  });

  it("binds tickets to one player, starts only after both ready, and returns validated snapshots", () => {
    const service = createService();
    const owner = service.createRoom({ displayName: "Alice", seed: "service-seed" });
    const joined = service.joinRoom(owner.matchId, { displayName: "Bob" });
    expect(owner.snapshot.phase).toBe("waiting");
    service.ready(owner.matchId, owner.playerId, owner.ticket);
    service.ready(joined.matchId, joined.playerId, joined.ticket);
    const started = service.start(owner.matchId, owner.playerId, owner.ticket);
    expect(started.phase).toBe("active");
    expect(fpsSnapshotSchema.parse(started).players).toHaveLength(2);
    expect(started).not.toHaveProperty("seed");
    expect(JSON.stringify(started)).not.toContain("service-seed");
    expect(() => service.getSnapshot(owner.matchId, joined.playerId, owner.ticket)).toThrow(
      FpsServiceError,
    );
    const accepted = service.submitInput(
      owner.matchId,
      owner.playerId,
      owner.ticket,
      input(owner.matchId, owner.playerId),
    );
    expect(accepted.acknowledgedInputSequence).toBe(0);
    const replay = service.getReplay(owner.matchId, owner.playerId, owner.ticket);
    expect(replay.events.length).toBeGreaterThan(0);
    expect(replay).not.toHaveProperty("seed");
    expect(JSON.stringify(replay)).not.toContain("service-seed");
    service.close();
  });

  it("sends a full snapshot on the real websocket seam and rejects malformed binary frames", () => {
    const service = createService();
    const owner = service.createRoom({ displayName: "Alice", seed: "socket-seed" });
    const socket = new FakeSocket();
    service.attachSocket(socket, owner.matchId, owner.playerId, owner.ticket);
    expect(socket.sent).toHaveLength(2);
    expect(JSON.parse(socket.sent[1] ?? "{}")).toMatchObject({ type: "fps_snapshot" });
    const message = socket.listeners.get("message");
    expect(message).toBeDefined();
    message?.(new Uint8Array([1, 2, 3]), true);
    expect(socket.closed).toBe(true);
    expect(socket.closeCode).toBe(1003);
    service.close();
  });

  it("enforces ticket expiry, origin checks, and frame-size limits", () => {
    const baseTime = Date.now();
    let now = baseTime;
    const service = new FpsMatchService({
      now: () => now,
      ticketTtlMs: 100,
      maxFrameBytes: 32,
      allowedOrigins: ["https://allowed.example"],
      matchFactory: (options) => new FpsMatch({ ...options, skipCountdown: true }),
    });
    const owner = service.createRoom({ displayName: "Alice", seed: "expiry-seed" });
    expect(() => service.getSnapshot(owner.matchId, owner.playerId, owner.ticket)).not.toThrow();
    now += 101;
    expect(() => service.getSnapshot(owner.matchId, owner.playerId, owner.ticket)).toThrow(
      expect.objectContaining({ code: "ticket_expired" }),
    );
    const fresh = new FpsMatchService({
      allowedOrigins: ["https://allowed.example"],
      maxFrameBytes: 32,
      matchFactory: (options) => new FpsMatch({ ...options, skipCountdown: true }),
    });
    const freshOwner = fresh.createRoom({ displayName: "Alice", seed: "origin-seed" });
    expect(() =>
      fresh.attachSocket(
        new FakeSocket(),
        freshOwner.matchId,
        freshOwner.playerId,
        freshOwner.ticket,
        "https://blocked.example",
      ),
    ).toThrow(expect.objectContaining({ code: "origin_not_allowed" }));
    const socket = new FakeSocket();
    fresh.attachSocket(
      socket,
      freshOwner.matchId,
      freshOwner.playerId,
      freshOwner.ticket,
      "https://allowed.example",
    );
    socket.receive("0123456789012345678901234567890123456789");
    expect(socket.closeCode).toBe(1009);
    service.close();
    fresh.close();
  });

  it("makes ready and start request IDs durable and idempotent", () => {
    const service = createService();
    const owner = service.createRoom({ displayName: "Alice", seed: "idempotency-seed" });
    const joined = service.joinRoom(owner.matchId, { displayName: "Bob" });
    const readyOne = service.ready(owner.matchId, owner.playerId, owner.ticket, "same-ready");
    const eventCount = service.getReplay(owner.matchId, owner.playerId, owner.ticket).events.length;
    const readyTwo = service.ready(owner.matchId, owner.playerId, owner.ticket, "same-ready");
    expect(readyTwo).toEqual(readyOne);
    expect(service.getReplay(owner.matchId, owner.playerId, owner.ticket).events).toHaveLength(
      eventCount,
    );
    service.ready(joined.matchId, joined.playerId, joined.ticket, "joined-ready");
    const startOne = service.start(owner.matchId, owner.playerId, owner.ticket, "same-start");
    const startTwo = service.start(owner.matchId, owner.playerId, owner.ticket, "same-start");
    expect(startTwo).toEqual(startOne);
    service.close();
  });

  it("recovers a missed delta through a full resync and rejects stale clock input", async () => {
    const service = createService();
    const { owner } = startServiceMatch(service);
    const socket = new FakeSocket();
    service.attachSocket(socket, owner.matchId, owner.playerId, owner.ticket);
    const initial = JSON.parse(socket.sent.at(-1) ?? "{}") as { payload?: { snapshotId?: string } };
    socket.receive(
      JSON.stringify({
        protocolVersion: 1,
        type: "fps_resync_request",
        seq: 0,
        timestamp: new Date().toISOString(),
        matchId: owner.matchId,
        payload: { lastServerTick: 0, lastSnapshotId: initial.payload?.snapshotId ?? null },
      }),
    );
    await flushSocket();
    expect(JSON.parse(socket.sent.at(-1) ?? "{}")).toMatchObject({
      type: "fps_snapshot",
      payload: { full: true, resyncRequired: false },
    });
    expect(() =>
      service.submitInput(owner.matchId, owner.playerId, owner.ticket, {
        ...input(owner.matchId, owner.playerId),
        clientTimestampMs: Date.now() - 100_000,
      }),
    ).toThrow(expect.objectContaining({ code: "stale_input" }));
    service.close();
  });

  it("keeps one authoritative socket per player when a reconnect races an old tab", () => {
    const service = createService();
    const { owner } = startServiceMatch(service);
    const first = new FakeSocket();
    const second = new FakeSocket();
    service.attachSocket(first, owner.matchId, owner.playerId, owner.ticket);
    service.attachSocket(second, owner.matchId, owner.playerId, owner.ticket);
    expect(first.closeCode).toBe(4001);
    expect(service.getMetrics().connectedPlayers).toBe(1);
    service.close();
  });

  it("requires the explicit socket reconnect path before accepting input again", async () => {
    const service = createService();
    const { owner } = startServiceMatch(service);
    const socket = new FakeSocket();
    service.attachSocket(socket, owner.matchId, owner.playerId, owner.ticket);
    socket.listeners.get("close")?.();
    await flushSocket();
    expect(
      service
        .getSnapshot(owner.matchId, owner.playerId, owner.ticket)
        .players.find((player) => player.playerId === owner.playerId),
    ).toMatchObject({ lifecycle: "disconnected", alive: true });
    expect(() =>
      service.submitInput(
        owner.matchId,
        owner.playerId,
        owner.ticket,
        input(owner.matchId, owner.playerId),
      ),
    ).toThrow(expect.objectContaining({ code: "player_disconnected" }));
    service.attachSocket(new FakeSocket(), owner.matchId, owner.playerId, owner.ticket);
    expect(
      service.submitInput(
        owner.matchId,
        owner.playerId,
        owner.ticket,
        input(owner.matchId, owner.playerId),
      ),
    ).toMatchObject({ acknowledgedInputSequence: 0 });
    service.close();
  });

  it("lets the room owner kick a player, revoke the ticket, and close the socket", () => {
    const service = createService();
    const { owner, joined } = startServiceMatch(service);
    const socket = new FakeSocket();
    service.attachSocket(socket, joined.matchId, joined.playerId, joined.ticket);
    const beforeEvents = service.getReplay(owner.matchId, owner.playerId, owner.ticket).events
      .length;
    const kicked = service.kickPlayer(owner.matchId, owner.playerId, owner.ticket, joined.playerId);
    expect(kicked.players.find((player) => player.playerId === joined.playerId)).toMatchObject({
      lifecycle: "spectator",
      alive: false,
    });
    expect(socket.closeCode).toBe(4003);
    expect(service.getMetrics().kickedPlayers).toBe(1);
    expect(service.getReplay(owner.matchId, owner.playerId, owner.ticket).events.length).toBe(
      beforeEvents + 1,
    );
    expect(() => service.getSnapshot(joined.matchId, joined.playerId, joined.ticket)).toThrow(
      expect.objectContaining({ code: "invalid_ticket" }),
    );
    expect(() =>
      service.attachSocket(new FakeSocket(), joined.matchId, joined.playerId, joined.ticket),
    ).toThrow(expect.objectContaining({ code: "invalid_ticket" }));
    const repeated = service.kickPlayer(
      owner.matchId,
      owner.playerId,
      owner.ticket,
      joined.playerId,
    );
    expect(repeated.players.find((player) => player.playerId === joined.playerId)?.lifecycle).toBe(
      "spectator",
    );
    expect(service.getReplay(owner.matchId, owner.playerId, owner.ticket).events.length).toBe(
      beforeEvents + 1,
    );
    expect(() =>
      service.kickPlayer(owner.matchId, joined.playerId, joined.ticket, owner.playerId),
    ).toThrow(expect.objectContaining({ code: "invalid_ticket" }));
    service.close();
  });

  it("rate-limits repeated reconnects after authenticating the ticket", () => {
    const service = new FpsMatchService({
      maxReconnectsPerMinute: 1,
      matchFactory: (options) => new FpsMatch({ ...options, skipCountdown: true }),
    });
    const { owner } = startServiceMatch(service);
    const first = new FakeSocket();
    service.attachSocket(first, owner.matchId, owner.playerId, owner.ticket);
    first.listeners.get("close")?.();
    const second = new FakeSocket();
    service.attachSocket(second, owner.matchId, owner.playerId, owner.ticket);
    second.listeners.get("close")?.();
    expect(() =>
      service.attachSocket(new FakeSocket(), owner.matchId, owner.playerId, owner.ticket),
    ).toThrow(expect.objectContaining({ code: "rate_limited" }));
    expect(service.getMetrics().rateLimited).toBe(1);
    service.close();
  });

  it("rate-limits websocket input without mutating the authoritative match", async () => {
    const service = new FpsMatchService({
      maxInputsPerSecond: 1,
      matchFactory: (options) => new FpsMatch({ ...options, skipCountdown: true }),
    });
    const { owner } = startServiceMatch(service);
    const socket = new FakeSocket();
    service.attachSocket(socket, owner.matchId, owner.playerId, owner.ticket);
    const makeEnvelope = (seq: number, inputSequence: number) =>
      JSON.stringify({
        protocolVersion: 1,
        type: "fps_input",
        seq,
        timestamp: new Date().toISOString(),
        matchId: owner.matchId,
        payload: { ...input(owner.matchId, owner.playerId), inputSequence },
      });
    socket.receive(makeEnvelope(0, 0));
    socket.receive(makeEnvelope(1, 1));
    await flushSocket();
    expect(socket.sent.some((frame) => frame.includes('"code":"rate_limited"'))).toBe(true);
    expect(service.getMetrics()).toMatchObject({ inputAccepted: 1, rateLimited: 1 });
    service.close();
  });

  it("advances fixed ticks from monotonic elapsed time with bounded catch-up", () => {
    vi.useFakeTimers();
    let monotonicMs = 0;
    const service = new FpsMatchService({
      tickIntervalMs: 10,
      monotonicNow: () => monotonicMs,
      matchFactory: (options) => new FpsMatch({ ...options, skipCountdown: true }),
    });
    try {
      const { owner } = startServiceMatch(service);
      service.startClock();

      vi.advanceTimersByTime(10);
      expect(service.getSnapshot(owner.matchId, owner.playerId, owner.ticket).serverTick).toBe(0);

      monotonicMs = 35;
      vi.advanceTimersByTime(10);
      expect(service.getSnapshot(owner.matchId, owner.playerId, owner.ticket).serverTick).toBe(3);

      // An impossible 965 ms scheduler gap is clamped to eight ticks, not replayed wholesale.
      monotonicMs = 1_000;
      vi.advanceTimersByTime(10);
      expect(service.getSnapshot(owner.matchId, owner.playerId, owner.ticket).serverTick).toBe(11);
      expect(service.getMetrics().simulationTicks).toBe(11);

      // A backwards monotonic sample is rejected and does not move the authoritative clock.
      monotonicMs = 900;
      vi.advanceTimersByTime(10);
      expect(service.getSnapshot(owner.matchId, owner.playerId, owner.ticket).serverTick).toBe(11);
      monotonicMs = 920;
      vi.advanceTimersByTime(10);
      expect(service.getSnapshot(owner.matchId, owner.playerId, owner.ticket).serverTick).toBe(13);
    } finally {
      service.close();
      vi.useRealTimers();
    }
  });

  it("reconstructs the authoritative checkpoint and ticket binding after a process restart", () => {
    const directory = mkdtempSync(join(tmpdir(), "hk-mahjong-fps-service-"));
    const databasePath = join(directory, "fps.sqlite");
    try {
      const first = new FpsMatchService({
        databasePath,
        matchFactory: (options) => new FpsMatch({ ...options, skipCountdown: true }),
      });
      const owner = first.createRoom({ displayName: "Alice", seed: "restart-seed" });
      const joined = first.joinRoom(owner.matchId, { displayName: "Bob" });
      first.ready(owner.matchId, owner.playerId, owner.ticket);
      first.ready(owner.matchId, joined.playerId, joined.ticket);
      first.start(owner.matchId, owner.playerId, owner.ticket);
      first.submitInput(
        owner.matchId,
        owner.playerId,
        owner.ticket,
        input(owner.matchId, owner.playerId),
      );
      first.close();
      const second = new FpsMatchService({ databasePath });
      const restored = second.getSnapshot(owner.matchId, owner.playerId, owner.ticket);
      expect(restored.matchId).toBe(owner.matchId);
      expect(restored.players).toHaveLength(2);
      expect(restored.privatePlayer.lastAcceptedInputSequence).toBe(0);
      expect(
        second.getReplay(owner.matchId, owner.playerId, owner.ticket).terminalChainHash,
      ).toMatch(/^sha256:/u);
      second.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("exposes only privacy-safe operational diagnostics", () => {
    const service = createService();
    const { owner } = startServiceMatch(service);
    const diagnostics = service.getDiagnostics(owner.matchId, owner.playerId, owner.ticket);
    const encoded = JSON.stringify(diagnostics);
    expect(encoded).not.toContain(owner.ticket);
    expect(diagnostics).toMatchObject({
      matchId: owner.matchId,
      roomId: owner.roomId,
      phase: "active",
    });
    expect(diagnostics.metrics).toMatchObject({
      connectedPlayers: 0,
      activeMatches: 1,
      inputAccepted: 0,
    });
    expect(diagnostics).not.toHaveProperty("inputReceipts");
    expect(diagnostics).not.toHaveProperty("sessions");
    service.close();
  });

  it("reports privacy-safe phase, persistence, and combat counters", () => {
    const service = createService();
    const { owner } = startServiceMatch(service);
    const fireInput = input(owner.matchId, owner.playerId);
    fireInput.buttons.fire = true;
    service.submitInput(owner.matchId, owner.playerId, owner.ticket, fireInput);
    const metrics = service.getMetrics();
    expect(metrics).toMatchObject({
      rooms: 1,
      activeMatches: 1,
      fireRequests: 1,
      persistenceFailures: 0,
      commitFailures: 0,
    });
    expect(metrics.phaseDurationMs).toBeGreaterThanOrEqual(0);
    expect(metrics.persistenceLatencyMs).toBeGreaterThanOrEqual(0);
    expect(metrics.maxPersistenceLatencyMs).toBeGreaterThanOrEqual(0);
    expect(metrics.acceptedShots + metrics.rejectedShots).toBeGreaterThanOrEqual(0);
    expect(metrics.hitEvents).toBeGreaterThanOrEqual(0);
    expect(metrics.deaths).toBeGreaterThanOrEqual(0);
    expect(metrics.respawns).toBeGreaterThanOrEqual(0);
    expect(metrics.terminalMatches).toBeGreaterThanOrEqual(0);
    expect(metrics.terminalScoreEvents).toBeGreaterThanOrEqual(0);
    service.close();
  });

  it("records server-boundary input transit and sequence-gap diagnostics", async () => {
    const baseTime = Date.now();
    let now = baseTime;
    const service = new FpsMatchService({
      now: () => now,
      matchFactory: (options) => new FpsMatch({ ...options, skipCountdown: true }),
    });
    const { owner } = startServiceMatch(service);
    const socket = new FakeSocket();
    service.attachSocket(socket, owner.matchId, owner.playerId, owner.ticket);
    const makeEnvelope = (transportSequence: number, inputSequence: number, ageMs: number) =>
      JSON.stringify({
        protocolVersion: 1,
        type: "fps_input",
        seq: transportSequence,
        timestamp: new Date(now).toISOString(),
        matchId: owner.matchId,
        payload: {
          ...input(owner.matchId, owner.playerId),
          inputSequence,
          clientTimestampMs: now - ageMs,
        },
      });
    socket.receive(makeEnvelope(0, 0, 20));
    now += 5;
    socket.receive(makeEnvelope(1, 2, 30));
    await flushSocket();

    expect(service.getMetrics()).toMatchObject({ inputSequenceGaps: 1 });
    expect(service.getMetrics().inputTransitMs).toBeCloseTo(25, 5);
    expect(service.getMetrics().inputTransitJitterMs).toBeCloseTo(10, 5);
    service.close();
  });
});
