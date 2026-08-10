import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalJsonHash } from "@hk-mahjong/core";
import { FpsMatch, verifyFpsReplay } from "@hk-mahjong/fps";
import {
  fpsReplaySchema,
  fpsRoomCreateResponseSchema,
  fpsRoomJoinResponseSchema,
  fpsSnapshotSchema,
} from "@hk-mahjong/protocol";
import { FpsMatchJournal } from "@hk-mahjong/persistence";
import { FpsMatchService } from "../apps/server/src/fps-match.js";

const RETAINED_ROLLBACK_SEED = "fps-retained-rollback-v1";
const DATABASE_FILE_NAMES = ["fps.sqlite", "fps.sqlite-wal", "fps.sqlite-shm"] as const;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const HASHED_ID_PATTERN = /^sha256:[0-9a-f]{64}$/u;

interface RetainedArtifactFile {
  readonly name: string;
  readonly bytes: number;
  readonly sha256: string;
}

interface RetainedArtifactManifest {
  readonly schemaVersion: 1;
  readonly files: readonly RetainedArtifactFile[];
  readonly match: {
    readonly matchId: string;
    readonly rulesHash: string;
    readonly mapHash: string;
    readonly weaponSetHash: string;
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

const isDatabaseFileName = (value: string): value is (typeof DATABASE_FILE_NAMES)[number] =>
  DATABASE_FILE_NAMES.includes(value as (typeof DATABASE_FILE_NAMES)[number]);

const parseManifest = (value: unknown): RetainedArtifactManifest => {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.files)) {
    throw new Error("fps_retained_artifact_invalid_manifest");
  }
  if (!isRecord(value.match)) throw new Error("fps_retained_artifact_invalid_match");
  const match = value.match;
  if (
    typeof match.matchId !== "string" ||
    typeof match.rulesHash !== "string" ||
    typeof match.mapHash !== "string" ||
    typeof match.weaponSetHash !== "string" ||
    !HASHED_ID_PATTERN.test(match.rulesHash) ||
    !HASHED_ID_PATTERN.test(match.mapHash) ||
    !HASHED_ID_PATTERN.test(match.weaponSetHash)
  ) {
    throw new Error("fps_retained_artifact_invalid_match");
  }
  const seenFileNames = new Set<string>();
  const files = value.files.map((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.name !== "string" ||
      !isDatabaseFileName(entry.name) ||
      seenFileNames.has(entry.name) ||
      typeof entry.bytes !== "number" ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 0 ||
      typeof entry.sha256 !== "string" ||
      !SHA256_PATTERN.test(entry.sha256)
    ) {
      throw new Error("fps_retained_artifact_invalid_file");
    }
    seenFileNames.add(entry.name);
    return {
      name: entry.name,
      bytes: entry.bytes,
      sha256: entry.sha256,
    };
  });
  if (!files.some((file) => file.name === "fps.sqlite")) {
    throw new Error("fps_retained_artifact_missing_database");
  }
  return {
    schemaVersion: 1,
    files,
    match: {
      matchId: match.matchId,
      rulesHash: match.rulesHash,
      mapHash: match.mapHash,
      weaponSetHash: match.weaponSetHash,
    },
  };
};

const makeInput = (
  matchId: string,
  playerId: string,
  inputSequence: number,
  serverTick: number,
) => ({
  protocolVersion: 1 as const,
  matchId,
  playerId,
  inputSequence,
  clientTimestampMs: Date.now(),
  acknowledgedServerTick: serverTick,
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

const stableSnapshot = (snapshot: ReturnType<typeof fpsSnapshotSchema.parse>) => ({
  matchId: snapshot.matchId,
  roomId: snapshot.roomId,
  serverTick: snapshot.serverTick,
  durationTicks: snapshot.durationTicks,
  scoreTarget: snapshot.scoreTarget,
  acknowledgedInputSequence: snapshot.acknowledgedInputSequence,
  rulesHash: snapshot.rulesHash,
  mapHash: snapshot.mapHash,
  weaponSetHash: snapshot.weaponSetHash,
  rngVersion: snapshot.rngVersion,
  phase: snapshot.phase,
  players: snapshot.players,
  scoreboard: snapshot.scoreboard,
  events: snapshot.events,
  privatePlayer: snapshot.privatePlayer,
  full: snapshot.full,
  resyncRequired: snapshot.resyncRequired,
});

const copyRetainedFiles = async (
  sourceDirectory: string,
  retainedDirectory: string,
): Promise<readonly RetainedArtifactFile[]> => {
  const files: RetainedArtifactFile[] = [];
  for (const name of DATABASE_FILE_NAMES) {
    const sourcePath = join(sourceDirectory, name);
    const retainedPath = join(retainedDirectory, name);
    try {
      await copyFile(sourcePath, retainedPath);
    } catch (caught) {
      if (!isRecord(caught) || caught.code !== "ENOENT") throw caught;
      if (name === DATABASE_FILE_NAMES[0]) throw caught;
      continue;
    }
    const bytes = await readFile(retainedPath);
    files.push({ name, bytes: bytes.byteLength, sha256: sha256(bytes) });
  }
  assert.ok(files.some((file) => file.name === "fps.sqlite"));
  return files;
};

const verifyRetainedFiles = async (
  retainedDirectory: string,
  manifest: RetainedArtifactManifest,
): Promise<void> => {
  for (const file of manifest.files) {
    const bytes = await readFile(join(retainedDirectory, file.name));
    assert.equal(bytes.byteLength, file.bytes, `retained file size changed: ${file.name}`);
    assert.equal(sha256(bytes), file.sha256, `retained file hash changed: ${file.name}`);
  }
};

const main = async (): Promise<void> => {
  const sourceDirectory = await mkdtemp(join(tmpdir(), "hk-mahjong-fps-retained-source-"));
  const retainedDirectory = await mkdtemp(join(tmpdir(), "hk-mahjong-fps-retained-artifact-"));
  const sourceDatabasePath = join(sourceDirectory, "fps.sqlite");
  const retainedDatabasePath = join(retainedDirectory, "fps.sqlite");
  let owner: ReturnType<typeof fpsRoomCreateResponseSchema.parse>;
  let beforeSnapshot: ReturnType<typeof fpsSnapshotSchema.parse>;
  let beforeReplay: ReturnType<typeof fpsReplaySchema.parse>;
  try {
    const first = new FpsMatchService({
      databasePath: sourceDatabasePath,
      matchFactory: (options) => new FpsMatch({ ...options, skipCountdown: true }),
    });
    try {
      owner = fpsRoomCreateResponseSchema.parse(
        first.createRoom({
          displayName: "Retained Owner",
          seed: RETAINED_ROLLBACK_SEED,
          scoreTarget: 10,
          durationSeconds: 60,
        }),
      );
      const joined = fpsRoomJoinResponseSchema.parse(
        first.joinRoom(owner.matchId, { displayName: "Retained Rival" }),
      );
      first.ready(owner.matchId, owner.playerId, owner.ticket, "retained-ready-owner");
      first.ready(joined.matchId, joined.playerId, joined.ticket, "retained-ready-rival");
      first.start(owner.matchId, owner.playerId, owner.ticket, "retained-start");
      const accepted = first.submitInput(
        owner.matchId,
        owner.playerId,
        owner.ticket,
        makeInput(owner.matchId, owner.playerId, 0, 0),
      );
      assert.equal(accepted.acknowledgedInputSequence, 0);
      first.advanceTicksForDeterministicGate(25);
      beforeSnapshot = fpsSnapshotSchema.parse(
        first.getSnapshot(owner.matchId, owner.playerId, owner.ticket, true, 0),
      );
      beforeReplay = fpsReplaySchema.parse(
        first.getReplay(owner.matchId, owner.playerId, owner.ticket),
      );
      assert.equal(JSON.stringify(beforeSnapshot).includes(RETAINED_ROLLBACK_SEED), false);
      assert.equal(JSON.stringify(beforeReplay).includes(RETAINED_ROLLBACK_SEED), false);
      assert.ok(beforeReplay.events.length > 0);
    } finally {
      first.close();
    }

    const files = await copyRetainedFiles(sourceDirectory, retainedDirectory);
    const manifest: RetainedArtifactManifest = {
      schemaVersion: 1,
      files,
      match: {
        matchId: beforeSnapshot.matchId,
        rulesHash: beforeSnapshot.rulesHash,
        mapHash: beforeSnapshot.mapHash,
        weaponSetHash: beforeSnapshot.weaponSetHash,
      },
    };
    const manifestBytes = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(join(retainedDirectory, "manifest.json"), manifestBytes);
    const parsedManifest = parseManifest(
      JSON.parse(await readFile(join(retainedDirectory, "manifest.json"), "utf8")) as unknown,
    );
    await verifyRetainedFiles(retainedDirectory, parsedManifest);
    assert.deepEqual(parsedManifest.match, manifest.match);
    const retainedDatabaseBytes = await readFile(retainedDatabasePath);
    const tamperedDatabaseBytes = new Uint8Array(retainedDatabaseBytes);
    tamperedDatabaseBytes[0] = (tamperedDatabaseBytes[0] ?? 0) ^ 1;
    await writeFile(retainedDatabasePath, tamperedDatabaseBytes);
    await assert.rejects(
      () => verifyRetainedFiles(retainedDirectory, parsedManifest),
      /retained file hash changed: fps\.sqlite/u,
    );
    await writeFile(retainedDatabasePath, retainedDatabaseBytes);
    await verifyRetainedFiles(retainedDirectory, parsedManifest);

    const journal = new FpsMatchJournal(retainedDatabasePath);
    try {
      const checkpoints = journal.loadMatches();
      assert.equal(checkpoints.length, 1);
      const checkpoint = checkpoints[0];
      assert.ok(checkpoint !== undefined);
      assert.equal(verifyFpsReplay(FpsMatch.fromCheckpoint(checkpoint).getReplay()), true);
    } finally {
      journal.close();
    }

    const restored = new FpsMatchService({ databasePath: retainedDatabasePath });
    try {
      const afterSnapshot = fpsSnapshotSchema.parse(
        restored.getSnapshot(owner.matchId, owner.playerId, owner.ticket, true, 0),
      );
      const afterReplay = fpsReplaySchema.parse(
        restored.getReplay(owner.matchId, owner.playerId, owner.ticket),
      );
      assert.deepEqual(afterReplay, beforeReplay);
      assert.deepEqual(stableSnapshot(afterSnapshot), stableSnapshot(beforeSnapshot));
      const continued = restored.submitInput(
        owner.matchId,
        owner.playerId,
        owner.ticket,
        makeInput(owner.matchId, owner.playerId, 1, afterSnapshot.serverTick),
      );
      assert.equal(continued.acknowledgedInputSequence, 1);
    } finally {
      restored.close();
    }

    const receipt = {
      schemaVersion: 1,
      policy: {
        retainedArtifactDirectory: true,
        temporarySourceAndArtifactOnly: true,
        sourceResetUsed: false,
        publicEdgeUsed: false,
        seedOrTicketPersistedInReceipt: false,
      },
      artifact: {
        manifestSchemaVersion: parsedManifest.schemaVersion,
        fileNames: parsedManifest.files.map((file) => file.name),
        manifestDigest: `sha256:${canonicalJsonHash(parsedManifest)}`,
        databaseDigest:
          parsedManifest.files.find((file) => file.name === "fps.sqlite")?.sha256 ?? null,
      },
      match: {
        phase: beforeSnapshot.phase,
        serverTick: beforeSnapshot.serverTick,
        publicReplayEvents: beforeReplay.events.length,
        rulesHash: beforeSnapshot.rulesHash,
        mapHash: beforeSnapshot.mapHash,
        weaponSetHash: beforeSnapshot.weaponSetHash,
        replayVerified: true,
        retainedArtifactVerified: true,
        artifactTamperRejected: true,
        continuedInputAccepted: true,
      },
    };
    const serializedReceipt = JSON.stringify(receipt);
    assert.equal(serializedReceipt.includes(RETAINED_ROLLBACK_SEED), false);
    assert.equal(serializedReceipt.includes(owner.ticket), false);
    await mkdir("test-results", { recursive: true });
    await writeFile(
      "test-results/fps-retained-rollback.json",
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    process.stdout.write(
      `${JSON.stringify({ ...receipt, receiptDigest: `sha256:${canonicalJsonHash(receipt)}` })}\n`,
    );
  } finally {
    await Promise.all([
      rm(sourceDirectory, { recursive: true, force: true }),
      rm(retainedDirectory, { recursive: true, force: true }),
    ]);
  }
};

await main();
