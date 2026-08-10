import { integrateFpsMovement } from "./arena.js";
import type {
  FpsArenaDefinition,
  FpsInputCommand,
  FpsSnapshot,
  FpsPublicAvatarSnapshot,
  FpsVector3,
} from "./types.js";

export interface FpsPredictionState {
  readonly position: FpsVector3;
  readonly velocity: FpsVector3;
  readonly yaw: number;
  readonly pitch: number;
  readonly grounded: boolean;
}

export interface FpsReconciliationResult {
  readonly state: FpsPredictionState;
  readonly correctionDistance: number;
  readonly replayedInputSequences: readonly number[];
}

const normalizeYaw = (value: number): number => {
  const wrapped = value % (Math.PI * 2);
  return wrapped > Math.PI
    ? wrapped - Math.PI * 2
    : wrapped < -Math.PI
      ? wrapped + Math.PI * 2
      : wrapped;
};

const clampPitch = (value: number): number => Math.min(1.45, Math.max(-1.45, value));

const distance = (left: FpsVector3, right: FpsVector3): number =>
  Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);

/** Applies one client input using the same fixed-step movement contract as the server. */
export const predictFpsInput = (
  arena: FpsArenaDefinition,
  state: FpsPredictionState,
  input: Pick<FpsInputCommand, "moveX" | "moveY" | "lookDeltaX" | "lookDeltaY" | "buttons">,
  deltaSeconds = 1 / 60,
  jumpEdge = input.buttons.jump,
): FpsPredictionState => {
  const yaw = normalizeYaw(state.yaw + input.lookDeltaX);
  const pitch = clampPitch(state.pitch + input.lookDeltaY);
  const movement = integrateFpsMovement(arena, {
    position: state.position,
    velocity: state.velocity,
    moveX: input.moveX,
    moveY: input.moveY,
    yaw,
    sprint: input.buttons.sprint,
    crouch: input.buttons.crouch,
    jump: jumpEdge,
    grounded: state.grounded,
    deltaSeconds,
  });
  return {
    position: movement.position,
    velocity: movement.velocity,
    yaw,
    pitch,
    grounded: movement.grounded,
  };
};

/** Replays unacknowledged inputs after applying an authoritative avatar snapshot. */
export const reconcileFpsPrediction = (
  arena: FpsArenaDefinition,
  authoritative: FpsPublicAvatarSnapshot,
  pendingInputs: readonly FpsInputCommand[],
  deltaSeconds = 1 / 60,
): FpsReconciliationResult => {
  const ordered = [...pendingInputs].sort(
    (left, right) => left.inputSequence - right.inputSequence,
  );
  let state: FpsPredictionState = {
    position: { ...authoritative.position },
    velocity: { ...authoritative.velocity },
    yaw: authoritative.rotation.yaw,
    pitch: authoritative.rotation.pitch,
    grounded: authoritative.position.y <= arena.floorY + 0.001,
  };
  let previousJump = false;
  for (const input of ordered) {
    const jumpEdge = input.buttons.jump && !previousJump;
    state = predictFpsInput(arena, state, input, deltaSeconds, jumpEdge);
    previousJump = input.buttons.jump;
  }
  return {
    state,
    correctionDistance: distance(authoritative.position, state.position),
    replayedInputSequences: ordered.map((input) => input.inputSequence),
  };
};

export type FpsSnapshotApplyResult =
  | { readonly accepted: true; readonly snapshot: FpsSnapshot; readonly resyncRequired: false }
  | {
      readonly accepted: false;
      readonly snapshot: FpsSnapshot | null;
      readonly resyncRequired: true;
      readonly reason: "out_of_order" | "base_mismatch" | "phase_mismatch" | "identity_mismatch";
    };

type FpsSnapshotIdentity = Pick<
  FpsSnapshot,
  "matchId" | "roomId" | "rulesHash" | "mapHash" | "weaponSetHash"
> & { readonly rngVersion: string };

const snapshotIdentity = (snapshot: FpsSnapshot): FpsSnapshotIdentity => ({
  matchId: snapshot.matchId,
  roomId: snapshot.roomId,
  rulesHash: snapshot.rulesHash,
  mapHash: snapshot.mapHash,
  weaponSetHash: snapshot.weaponSetHash,
  rngVersion: snapshot.rngVersion,
});

const sameSnapshotIdentity = (left: FpsSnapshotIdentity, right: FpsSnapshotIdentity): boolean =>
  left.matchId === right.matchId &&
  left.roomId === right.roomId &&
  left.rulesHash === right.rulesHash &&
  left.mapHash === right.mapHash &&
  left.weaponSetHash === right.weaponSetHash &&
  left.rngVersion === right.rngVersion;

/** Deterministic client-side snapshot gate shared by browser and network tests. */
export class FpsSnapshotTracker {
  private lastServerTick = -1;
  private lastSnapshotId: string | null = null;
  private phase: FpsSnapshot["phase"] | null = null;
  private latest: FpsSnapshot | null = null;
  private identity: FpsSnapshotIdentity | null = null;

  public apply(snapshot: FpsSnapshot): FpsSnapshotApplyResult {
    if (
      this.identity !== null &&
      !sameSnapshotIdentity(this.identity, snapshotIdentity(snapshot))
    ) {
      return {
        accepted: false,
        snapshot: this.latest,
        resyncRequired: true,
        reason: "identity_mismatch",
      };
    }
    if (snapshot.full && this.latest !== null && snapshot.serverTick < this.lastServerTick) {
      return {
        accepted: false,
        snapshot: this.latest,
        resyncRequired: true,
        reason: "out_of_order",
      };
    }
    if (snapshot.full) {
      this.accept(snapshot);
      return { accepted: true, snapshot, resyncRequired: false };
    }
    if (this.latest === null) {
      return {
        accepted: false,
        snapshot: null,
        resyncRequired: true,
        reason: "base_mismatch",
      };
    }
    if (snapshot.serverTick < this.lastServerTick) {
      return {
        accepted: false,
        snapshot: this.latest,
        resyncRequired: true,
        reason: "out_of_order",
      };
    }
    // Input acknowledgements and combat events may produce more than one delta in a single
    // fixed simulation tick. Accept those ordered same-tick deltas when their base is the last
    // accepted snapshot; only an exact duplicate is a no-op.
    if (
      snapshot.serverTick === this.lastServerTick &&
      snapshot.snapshotId === this.lastSnapshotId
    ) {
      return { accepted: true, snapshot, resyncRequired: false };
    }
    if (snapshot.baseSnapshotId !== this.lastSnapshotId) {
      return {
        accepted: false,
        snapshot: this.latest,
        resyncRequired: true,
        reason: "base_mismatch",
      };
    }
    if (this.phase !== null && snapshot.phase !== this.phase) {
      this.accept(snapshot);
      return { accepted: true, snapshot, resyncRequired: false };
    }
    this.accept(snapshot);
    return { accepted: true, snapshot, resyncRequired: false };
  }

  public reset(): void {
    this.lastServerTick = -1;
    this.lastSnapshotId = null;
    this.phase = null;
    this.latest = null;
    this.identity = null;
  }

  public getLatest(): FpsSnapshot | null {
    return this.latest;
  }

  private accept(snapshot: FpsSnapshot): void {
    this.lastServerTick = snapshot.serverTick;
    this.lastSnapshotId = snapshot.snapshotId;
    this.phase = snapshot.phase;
    this.latest = snapshot;
    this.identity = snapshotIdentity(snapshot);
  }
}
