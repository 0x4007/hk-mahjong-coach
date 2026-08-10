import { describe, expect, it } from "vitest";
import { integrateFpsMovement, isSpawnPositionValid, validateFpsArena } from "./arena.js";
import { FpsMatch, FpsSnapshotTracker, reconcileFpsPrediction, verifyFpsReplay } from "./index.js";
import type { FpsArenaDefinition, FpsInputCommand } from "./types.js";

const testArena: FpsArenaDefinition = {
  mapId: "slayer-arena-v1",
  bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
  floorY: 0,
  collisionRadius: 0.38,
  capsuleHeight: 1.8,
  obstacles: [],
  spawnPoints: [
    { id: "left", position: { x: -2, y: 0, z: 0 }, yaw: Math.PI / 2 },
    { id: "right", position: { x: 2, y: 0, z: 0 }, yaw: -Math.PI / 2 },
  ],
};

const input = (
  matchId: string,
  playerId: string,
  sequence: number,
  fire: boolean,
): FpsInputCommand => ({
  protocolVersion: 1,
  matchId,
  playerId,
  inputSequence: sequence,
  clientTimestampMs: sequence * 16,
  acknowledgedServerTick: 121,
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
    fire,
    reload: false,
  },
  selectedWeaponId: "rifle",
  actionNonce: null,
});

const createMatch = (): FpsMatch => {
  const match = new FpsMatch({
    matchId: "match-test",
    roomId: "room-test",
    seed: "seed-test",
    arena: testArena,
    skipCountdown: true,
    rules: { scoreTarget: 25 },
  });
  match.addPlayer({ playerId: "p1", displayName: "One" });
  match.addPlayer({ playerId: "p2", displayName: "Two" });
  match.readyPlayer("p1");
  match.readyPlayer("p2");
  match.startMatch();
  match.advanceTicks(121);
  return match;
};

describe("authoritative FPS match", () => {
  it("validates versioned rule overrides before creating authority", () => {
    const base = {
      matchId: "rules-match",
      roomId: "rules-room",
      seed: "rules-seed",
    } as const;
    expect(() => new FpsMatch({ ...base, rules: { scoreTarget: 0 } })).toThrow(
      "fps_rules_invalid_score_target",
    );
    expect(() => new FpsMatch({ ...base, rules: { durationTicks: 0 } })).toThrow(
      "fps_rules_invalid_duration",
    );
    expect(() => new FpsMatch({ ...base, rules: { snapshotRate: 7 } })).toThrow(
      "fps_rules_invalid_snapshot_rate",
    );
    expect(() => new FpsMatch({ ...base, rules: { snapshotRate: 20 } })).not.toThrow();
  });

  it("rejects cross-match, duplicate, stale, and impossible input without changing position", () => {
    const match = createMatch();
    const before = match.getState().roster.find((player) => player.playerId === "p1")?.position;
    expect(match.submitInput({ ...input("other", "p1", 0, false) }).reason).toBe("wrong_match");
    expect(match.submitInput(input("match-test", "p1", 0, false)).accepted).toBe(true);
    expect(match.submitInput(input("match-test", "p1", 0, false)).reason).toBe("duplicate_input");
    expect(match.submitInput(input("match-test", "p1", -1, false)).reason).toBe("stale_input");
    expect(match.submitInput({ ...input("match-test", "p1", 1, false), moveX: 2 }).reason).toBe(
      "invalid_input",
    );
    expect(
      match.submitInput({
        ...input("match-test", "p1", 1, false),
        acknowledgedServerTick: match.getState().serverTick + 3,
      }).reason,
    ).toBe("invalid_input");
    match.advanceTicks(1);
    const after = match.getState().roster.find((player) => player.playerId === "p1")?.position;
    expect(after).toEqual(before);
  });

  it("revalidates protocol, weapon, and button shape at the authority boundary", () => {
    const match = createMatch();
    expect(
      match.submitInput({
        ...input("match-test", "p1", 30, false),
        protocolVersion: 99 as unknown as 1,
      }).reason,
    ).toBe("invalid_input");
    expect(
      match.submitInput({
        ...input("match-test", "p1", 31, false),
        selectedWeaponId: "railgun" as unknown as "pistol",
      }).reason,
    ).toBe("invalid_input");
    expect(
      match.submitInput({
        ...input("match-test", "p1", 32, false),
        buttons: null as unknown as FpsInputCommand["buttons"],
      }).reason,
    ).toBe("invalid_input");
  });

  it("fails closed for non-object and incomplete direct commands without corrupting checkpoints", () => {
    const match = createMatch();
    const extraField = { ...input("match-test", "p1", 33, false), extra: undefined };
    for (const malformed of [null, [], { protocolVersion: 1 }, extraField]) {
      expect(match.submitInput(malformed as unknown as FpsInputCommand)).toMatchObject({
        accepted: false,
        reason: "invalid_input",
      });
    }
    expect(() => match.exportCheckpoint()).not.toThrow();
    const receipts = match.getInputReceipts();
    expect(receipts.slice(-4, -1)).toHaveLength(3);
    expect(
      receipts
        .slice(-4, -1)
        .every(
          (receipt) =>
            receipt.playerId === "" &&
            receipt.inputSequence === -1 &&
            receipt.acknowledgedServerTick === -1 &&
            !receipt.accepted &&
            receipt.reason === "invalid_input",
        ),
    ).toBe(true);
    expect(receipts.at(-1)).toMatchObject({
      playerId: "p1",
      inputSequence: 33,
      acknowledgedServerTick: 121,
      accepted: false,
      reason: "invalid_input",
    });
  });

  it("records controller provenance and the authoritative applied movement result", () => {
    const match = createMatch();
    const command = { ...input("match-test", "p1", 40, false), moveY: 1 };

    expect(match.submitInput(command)).toMatchObject({ accepted: true });
    const acceptedBeforeApply = match
      .getInputReceipts()
      .find((receipt) => receipt.playerId === "p1" && receipt.inputSequence === 40);
    expect(acceptedBeforeApply).toMatchObject({
      controller: "human",
      appliedServerTick: null,
      appliedPosition: null,
      appliedVelocity: null,
    });

    match.advanceTicks(1);
    const applied = match
      .getInputReceipts()
      .find((receipt) => receipt.playerId === "p1" && receipt.inputSequence === 40);
    expect(applied?.controller).toBe("human");
    expect(applied?.appliedServerTick).toBe(match.getServerTick());
    expect(applied?.appliedPosition).not.toBeNull();
    expect(applied?.appliedVelocity).not.toBeNull();
  });

  it("does not spawn or implicitly revive a disconnected player during countdown", () => {
    const match = new FpsMatch({
      matchId: "countdown-disconnect-match",
      roomId: "countdown-disconnect-room",
      seed: "countdown-disconnect-seed",
    });
    match.addPlayer({ playerId: "p1", displayName: "One" });
    match.addPlayer({ playerId: "p2", displayName: "Two" });
    match.readyPlayer("p1");
    match.readyPlayer("p2");
    match.startMatch();
    match.disconnectPlayer("p2");
    expect(match.submitInput(input("countdown-disconnect-match", "p2", 0, false)).reason).toBe(
      "player_disconnected",
    );
    match.advanceTicks(120);
    expect(match.getState()).toMatchObject({ phase: "cancelled" });
    expect(match.getState().roster.find((player) => player.playerId === "p2")).toMatchObject({
      lifecycle: "disconnected",
      alive: false,
    });
    expect(match.getReplay().events.some((record) => record.event.kind === "player_spawned")).toBe(
      false,
    );
  });

  it("keeps terminal cancellation idempotent", () => {
    const match = new FpsMatch({
      matchId: "cancel-idempotent-match",
      roomId: "cancel-idempotent-room",
      seed: "cancel-idempotent-seed",
    });

    match.cancelMatch();
    const firstEvents = match.getReplay().events;
    match.cancelMatch();

    expect(match.getState().phase).toBe("cancelled");
    expect(match.getReplay().events).toEqual(firstEvents);
    expect(
      match.getReplay().events.filter((record) => record.event.kind === "match_ended"),
    ).toHaveLength(1);
  });

  it("requires an explicit reconnect before a disconnected player can submit input", () => {
    const match = createMatch();
    match.disconnectPlayer("p1");
    expect(match.submitInput(input("match-test", "p1", 0, false)).reason).toBe(
      "player_disconnected",
    );
    const snapshot = match.reconnectPlayer("p1");
    expect(snapshot.privatePlayer.playerId).toBe("p1");
    expect(match.submitInput(input("match-test", "p1", 0, false)).accepted).toBe(true);
  });

  it("permanently spectates a kicked player and records a verifiable public event", () => {
    const match = createMatch();
    match.kickPlayer("p2");
    expect(match.getState().roster.find((player) => player.playerId === "p2")).toMatchObject({
      lifecycle: "spectator",
      alive: false,
    });
    expect(match.submitInput(input("match-test", "p2", 0, false)).reason).toBe(
      "player_disconnected",
    );
    expect(() => match.reconnectPlayer("p2")).toThrow("reconnect_reservation_expired");
    expect(
      match.getReplay().events.filter((record) => record.event.kind === "player_kicked"),
    ).toHaveLength(1);
    expect(verifyFpsReplay(match.getReplay())).toBe(true);
    match.kickPlayer("p2");
    expect(
      match.getReplay().events.filter((record) => record.event.kind === "player_kicked"),
    ).toHaveLength(1);
  });

  it("owns movement, fire cadence, hit detection, score, death, respawn, and replay hashes", () => {
    const match = createMatch();
    expect(match.submitInput(input("match-test", "p1", 0, true)).accepted).toBe(true);
    match.advanceTicks(5 * 8 + 2);
    const stateAfterKill = match.getState();
    const p1 = stateAfterKill.scoreboard.find((player) => player.playerId === "p1");
    const p2 = stateAfterKill.roster.find((player) => player.playerId === "p2");
    expect(p1).toMatchObject({ kills: 1, score: 1 });
    expect(p2).toMatchObject({ alive: false, lifecycle: "dead" });
    expect(match.getReplay().events.some((record) => record.event.kind === "hit_confirmed")).toBe(
      true,
    );
    expect(match.getReplay().events.some((record) => record.event.kind === "player_died")).toBe(
      true,
    );
    expect(verifyFpsReplay(match.getReplay())).toBe(true);
    const replay = match.getReplay();
    expect(
      verifyFpsReplay({
        ...replay,
        terminalScoreboard: replay.terminalScoreboard.map((entry, index) =>
          index === 0 ? { ...entry, score: entry.score + 1 } : entry,
        ),
      }),
    ).toBe(false);
    match.advanceTicks(121);
    expect(match.getState().roster.find((player) => player.playerId === "p2")).toMatchObject({
      alive: true,
      lifecycle: "alive",
      health: 100,
      shield: 50,
    });
  });

  it("does not replay a held input after death and respawn", () => {
    const match = createMatch();
    const victimInput = input("match-test", "p2", 0, true);
    const killerInput = {
      ...input("match-test", "p1", 0, true),
      selectedWeaponId: "pistol" as const,
    };
    expect(match.submitInput(victimInput).accepted).toBe(true);
    expect(match.submitInput(killerInput).accepted).toBe(true);

    // The pistol kills the victim on the third cadence window. Player iteration is deterministic,
    // so the victim is not stepped again after the lethal shot in that tick.
    match.advanceTicks(25);
    const death = match
      .getEventRecords()
      .find(
        (record) => record.event.kind === "player_died" && record.event.playerId === "p2",
      )?.event;
    if (death?.kind !== "player_died") throw new Error("missing death");
    const shotsBeforeRespawn = match
      .getEventRecords()
      .filter(
        (record) => record.event.kind === "shot_fired" && record.event.playerId === "p2",
      ).length;

    match.advanceTicks(match.rules.respawnDelayTicks);
    expect(match.getState().roster.find((player) => player.playerId === "p2")).toMatchObject({
      alive: true,
      lifecycle: "alive",
    });
    match.advanceTicks(1);

    const shotsAfterRespawn = match
      .getEventRecords()
      .filter(
        (record) =>
          record.event.kind === "shot_fired" &&
          record.event.playerId === "p2" &&
          record.event.serverTick > death.respawnAtTick,
      ).length;
    expect(shotsBeforeRespawn).toBeGreaterThan(0);
    expect(shotsAfterRespawn).toBe(0);
  });

  it("fails closed when a persisted event chain is tampered", () => {
    const match = new FpsMatch({
      matchId: "checkpoint-integrity-match",
      roomId: "checkpoint-integrity-room",
      seed: "checkpoint-integrity-seed",
      skipCountdown: true,
    });
    match.addPlayer({ playerId: "p1", displayName: "Alice" });
    match.addPlayer({ playerId: "p2", displayName: "Bob" });
    match.readyPlayer("p1");
    match.readyPlayer("p2");
    match.startMatch();
    const checkpoint = match.exportCheckpoint();
    const tampered = {
      ...checkpoint,
      eventRecords: checkpoint.eventRecords.map((record, index) =>
        index === 0
          ? {
              ...record,
              eventHash: `sha256:${"f".repeat(64)}`,
            }
          : record,
      ),
    };
    expect(() => FpsMatch.fromCheckpoint(tampered)).toThrow("fps_checkpoint_event_chain_mismatch");
  });

  it("fails closed when persisted player state is tampered", () => {
    const match = new FpsMatch({
      matchId: "checkpoint-state-match",
      roomId: "checkpoint-state-room",
      seed: "checkpoint-state-seed",
      skipCountdown: true,
    });
    match.addPlayer({ playerId: "p1", displayName: "Alice" });
    const checkpoint = match.exportCheckpoint();
    const tampered = {
      ...checkpoint,
      players: checkpoint.players.map((player) =>
        player.playerId === "p1" ? { ...player, score: player.score + 1 } : player,
      ),
    };
    expect(() => FpsMatch.fromCheckpoint(tampered)).toThrow("fps_checkpoint_state_hash_mismatch");
  });

  it.each(["rulesHash", "mapHash", "weaponSetHash"] as const)(
    "fails closed when checkpoint %s identity is tampered",
    (field) => {
      const match = new FpsMatch({
        matchId: "checkpoint-rules-identity-match",
        roomId: "checkpoint-rules-identity-room",
        seed: "checkpoint-rules-identity-seed",
        skipCountdown: true,
      });
      match.addPlayer({ playerId: "p1", displayName: "Alice" });
      const checkpoint = match.exportCheckpoint();
      const tampered = {
        ...checkpoint,
        rules: {
          ...checkpoint.rules,
          [field]: `sha256:${"f".repeat(64)}`,
        },
      };
      expect(() => FpsMatch.fromCheckpoint(tampered)).toThrow("fps_checkpoint_rules_hash_mismatch");
    },
  );

  it("returns a full reconnect snapshot with only public opponent state", () => {
    const match = createMatch();
    match.disconnectPlayer("p1");
    const snapshot = match.reconnectPlayer("p1");
    expect(snapshot.full).toBe(true);
    expect(snapshot.privatePlayer.playerId).toBe("p1");
    expect(snapshot.players).toHaveLength(2);
    expect(snapshot.players[1]).not.toHaveProperty("ammoInMagazine");
    expect(snapshot.rulesHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it("rejects stale full snapshots while accepting an equal-tick resync", () => {
    const match = createMatch();
    const tracker = new FpsSnapshotTracker();
    const full = match.getSnapshot("p1", true, 0);
    expect(tracker.apply(full).accepted).toBe(true);
    match.advanceTicks(1);
    const delta = match.getSnapshot("p1", false, 0, full.snapshotId);
    expect(tracker.apply(delta).accepted).toBe(true);
    expect(tracker.apply(delta)).toMatchObject({ accepted: true, resyncRequired: false });
    const equalTickResync = {
      ...delta,
      snapshotId: `${delta.snapshotId}:resync`,
      baseSnapshotId: null,
      full: true,
    };
    expect(tracker.apply(equalTickResync).accepted).toBe(true);
    const older = {
      ...full,
      snapshotId: `${full.snapshotId}:older`,
      serverTick: full.serverTick - 1,
    };
    expect(tracker.apply(older)).toMatchObject({
      accepted: false,
      resyncRequired: true,
      reason: "out_of_order",
    });
  });

  it("reconciles an authoritative transform by replaying ordered pending inputs", () => {
    const match = createMatch();
    const authoritative = match.getState().roster.find((player) => player.playerId === "p1");
    if (authoritative === undefined) throw new Error("missing authoritative player");
    const pending = [
      { ...input("match-test", "p1", 2, false), moveY: 1 },
      { ...input("match-test", "p1", 1, false), moveX: 1 },
    ];
    const result = reconcileFpsPrediction(testArena, authoritative, pending);
    expect(result.replayedInputSequences).toEqual([1, 2]);
    expect(result.state.position).not.toEqual(authoritative.position);
    expect(result.correctionDistance).toBeGreaterThan(0);
  });

  it("selects only valid deterministic spawns and expires disconnected players", () => {
    expect(isSpawnPositionValid(testArena, { x: -2, y: 0, z: 0 })).toBe(true);
    expect(isSpawnPositionValid(testArena, { x: 9.8, y: 0, z: 0 })).toBe(false);
    expect(isSpawnPositionValid(testArena, { x: -2, y: 0, z: 0 }, [{ x: -2.5, y: 0, z: 0 }])).toBe(
      false,
    );
    expect(() =>
      validateFpsArena({
        ...testArena,
        spawnPoints: [{ id: "bad", position: { x: 100, y: 0, z: 0 }, yaw: 0 }],
      }),
    ).toThrow("fps_arena_invalid_spawn");

    const match = createMatch();
    match.disconnectPlayer("p1");
    match.advanceTicks(match.rules.reconnectReservationTicks);
    expect(match.getState().roster.find((player) => player.playerId === "p1")).toMatchObject({
      lifecycle: "spectator",
      alive: false,
    });
    expect(() => match.reconnectPlayer("p1")).toThrow("reconnect_reservation_expired");
  });

  it("keeps seeded spawn geometry independent of room-local player IDs", () => {
    const make = (firstId: string, secondId: string): FpsMatch => {
      const match = new FpsMatch({
        matchId: "match-test",
        roomId: "room-test",
        seed: "lifecycle-1",
        skipCountdown: true,
      });
      match.addPlayer({ playerId: firstId, displayName: "One" });
      match.addPlayer({ playerId: secondId, displayName: "Two" });
      match.readyPlayer(firstId);
      match.readyPlayer(secondId);
      match.startMatch();
      return match;
    };
    const first = make("room-a", "room-b")
      .getState()
      .roster.map((player) => player.position);
    const second = make("random-credential-1", "random-credential-2")
      .getState()
      .roster.map((player) => player.position);
    expect(second).toEqual(first);
  });

  it("uses deterministic scoreboard tie-breaks for a terminal winner", () => {
    const match = new FpsMatch({
      matchId: "tie-match",
      roomId: "tie-room",
      seed: "tie-seed",
      arena: testArena,
      skipCountdown: true,
      rules: { durationTicks: 121 },
    });
    // Add the lexically later player first so insertion order cannot choose the winner.
    match.addPlayer({ playerId: "p2", displayName: "Two" });
    match.addPlayer({ playerId: "p1", displayName: "One" });
    match.readyPlayer("p2");
    match.readyPlayer("p1");
    match.startMatch();
    match.advanceTicks(121);

    const ended = match
      .getEventRecords()
      .find((record) => record.event.kind === "match_ended")?.event;
    expect(ended).toMatchObject({
      kind: "match_ended",
      reason: "time_limit",
      winnerIds: ["p1"],
    });
  });

  it("runs a seeded AI rival through the ordinary player vitals and weapon path", () => {
    const make = (): FpsMatch => {
      const match = new FpsMatch({
        matchId: "bot-match",
        roomId: "bot-room",
        seed: "bot-seed",
        arena: testArena,
        skipCountdown: true,
      });
      match.addPlayer({ playerId: "human", displayName: "Human" });
      match.addPlayer({
        playerId: "fps-bot-1",
        displayName: "Rival Echo",
        controller: "bot",
      });
      match.readyPlayer("human");
      match.readyPlayer("fps-bot-1");
      match.startMatch();
      match.advanceTicks(121);
      return match;
    };

    const first = make();
    const bot = first.getState().roster.find((player) => player.playerId === "fps-bot-1");
    expect(bot).toMatchObject({
      displayName: "Rival Echo",
      health: 100,
      shield: 50,
      alive: true,
      lifecycle: "alive",
    });
    expect(
      first
        .getEventRecords()
        .some(
          (record) => record.event.kind === "shot_fired" && record.event.playerId === "fps-bot-1",
        ),
    ).toBe(true);
    expect(first.getInputReceipts().some((receipt) => receipt.playerId === "fps-bot-1")).toBe(true);

    const second = make();
    expect(second.getReplay().events).toEqual(first.getReplay().events);
    expect(second.getState().roster).toEqual(first.getState().roster);
  });

  it("deduplicates an edge-triggered fire nonce after cadence has elapsed", () => {
    const match = createMatch();
    const first = { ...input("match-test", "p1", 10, true), actionNonce: "edge-fire-1" };
    expect(match.submitInput(first).accepted).toBe(true);
    match.advanceTicks(1);
    const initialShots = match
      .getEventRecords()
      .filter((record) => record.event.kind === "shot_fired");
    expect(initialShots).toHaveLength(1);
    match.advanceTicks(6);
    expect(match.submitInput({ ...first, inputSequence: 11 }).accepted).toBe(true);
    match.advanceTicks(1);
    expect(
      match.getEventRecords().filter((record) => record.event.kind === "shot_fired"),
    ).toHaveLength(1);
  });

  it("authoritatively switches weapons, consumes ammo, and completes reload", () => {
    const match = createMatch();
    expect(
      match.submitInput({
        ...input("match-test", "p1", 20, false),
        selectedWeaponId: "rifle",
      }).accepted,
    ).toBe(true);
    match.advanceTicks(1);
    expect(match.getSnapshot("p1").privatePlayer).toMatchObject({
      equippedWeaponId: "rifle",
      ammoInMagazine: 30,
      reserveAmmo: 120,
    });
    expect(
      match.submitInput({
        ...input("match-test", "p1", 21, true),
        selectedWeaponId: "rifle",
        actionNonce: "rifle-shot-1",
      }).accepted,
    ).toBe(true);
    match.advanceTicks(1);
    expect(match.getSnapshot("p1").privatePlayer.ammoInMagazine).toBe(29);
    const reloadInput = input("match-test", "p1", 22, false);
    expect(
      match.submitInput({
        ...reloadInput,
        selectedWeaponId: "rifle",
        buttons: { ...reloadInput.buttons, reload: true },
      }).accepted,
    ).toBe(true);
    match.advanceTicks(1);
    expect(match.getSnapshot("p1").privatePlayer.reloadEndsAtTick).not.toBeNull();
    match.advanceTicks(105);
    expect(match.getSnapshot("p1").privatePlayer).toMatchObject({
      ammoInMagazine: 30,
      reserveAmmo: 119,
      reloadEndsAtTick: null,
    });
  });
});

describe("shared deterministic movement", () => {
  it("keeps a predicted capsule inside the authored arena", () => {
    const result = integrateFpsMovement(testArena, {
      position: { x: 9.7, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      moveX: 1,
      moveY: 0,
      yaw: Math.PI / 2,
      sprint: true,
      crouch: false,
      jump: false,
      grounded: true,
      deltaSeconds: 1 / 60,
    });
    expect(result.position.x).toBeLessThanOrEqual(10 - testArena.collisionRadius);
    expect(result.blocked).toBe(true);
  });
});
