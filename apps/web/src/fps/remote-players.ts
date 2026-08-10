import * as THREE from "three";
import type { FpsPublicAvatarSnapshot } from "@hk-mahjong/fps";
import {
  applyAvatarSnapshot,
  avatarDiagnostic,
  createFallbackAvatar,
  type AvatarDiagnostic,
} from "./avatar.js";

interface BufferedSnapshot {
  readonly receivedAtMs: number;
  readonly snapshot: FpsPublicAvatarSnapshot;
}

interface RemoteAvatarEntry {
  readonly root: THREE.Group;
  readonly snapshots: BufferedSnapshot[];
  latestTick: number;
  lastReceivedTick: number;
}

const BUFFER_MS = 100;
const MAX_BUFFERED_SNAPSHOTS = 8;

const interpolate = (left: number, right: number, amount: number): number =>
  left + (right - left) * amount;

const interpolateAngle = (left: number, right: number, amount: number): number => {
  let delta = (right - left) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return left + delta * amount;
};

const interpolateSnapshot = (
  left: FpsPublicAvatarSnapshot,
  right: FpsPublicAvatarSnapshot,
  amount: number,
): FpsPublicAvatarSnapshot => ({
  ...right,
  position: {
    x: interpolate(left.position.x, right.position.x, amount),
    y: interpolate(left.position.y, right.position.y, amount),
    z: interpolate(left.position.z, right.position.z, amount),
  },
  velocity: {
    x: interpolate(left.velocity.x, right.velocity.x, amount),
    y: interpolate(left.velocity.y, right.velocity.y, amount),
    z: interpolate(left.velocity.z, right.velocity.z, amount),
  },
  rotation: {
    yaw: interpolateAngle(left.rotation.yaw, right.rotation.yaw, amount),
    pitch: interpolate(left.rotation.pitch, right.rotation.pitch, amount),
  },
});

/** Render-only registry for server snapshots. It never stores private weapon/ammo data. */
export class RemotePlayerRenderer {
  private readonly entries = new Map<string, RemoteAvatarEntry>();

  public constructor(
    private readonly scene: THREE.Scene,
    private readonly localPlayerId: string,
  ) {}

  public applySnapshots(
    players: readonly FpsPublicAvatarSnapshot[],
    receivedAtMs: number,
    forceFull = false,
  ): void {
    const seen = new Set<string>();
    for (const snapshot of players) {
      seen.add(snapshot.playerId);
      if (snapshot.playerId === this.localPlayerId) continue;
      let entry = this.entries.get(snapshot.playerId);
      if (entry === undefined) {
        const root = createFallbackAvatar(snapshot);
        root.userData.renderRole =
          snapshot.playerId === this.localPlayerId ? "local-world-avatar" : "remote-avatar";
        this.scene.add(root);
        entry = { root, snapshots: [], latestTick: snapshot.stateTick, lastReceivedTick: -1 };
        this.entries.set(snapshot.playerId, entry);
      }
      if (forceFull) {
        entry.snapshots.length = 0;
        entry.lastReceivedTick = -1;
      }
      if (snapshot.stateTick <= entry.lastReceivedTick) continue;
      entry.lastReceivedTick = snapshot.stateTick;
      entry.snapshots.push({ receivedAtMs, snapshot });
      while (entry.snapshots.length > MAX_BUFFERED_SNAPSHOTS) entry.snapshots.shift();
      entry.latestTick = snapshot.stateTick;
      if (snapshot.lifecycle === "spectator" || snapshot.lifecycle === "disconnected") {
        entry.root.visible = false;
      }
    }
    for (const [playerId, entry] of this.entries) {
      if (!seen.has(playerId)) {
        entry.root.visible = false;
      }
    }
  }

  public update(nowMs: number, reducedMotion = false): void {
    const targetTime = nowMs - BUFFER_MS;
    for (const entry of this.entries.values()) {
      const frames = entry.snapshots;
      if (frames.length === 0) continue;
      let rendered = frames[0]?.snapshot;
      const last = frames[frames.length - 1];
      if (reducedMotion && last !== undefined) {
        rendered = last.snapshot;
      } else if (last !== undefined && targetTime >= last.receivedAtMs) {
        rendered = last.snapshot;
      } else {
        for (let index = 1; index < frames.length; index += 1) {
          const current = frames[index];
          const previous = frames[index - 1];
          if (current === undefined || previous === undefined || targetTime > current.receivedAtMs)
            continue;
          const span = Math.max(1, current.receivedAtMs - previous.receivedAtMs);
          const amount = Math.min(1, Math.max(0, (targetTime - previous.receivedAtMs) / span));
          rendered = interpolateSnapshot(previous.snapshot, current.snapshot, amount);
          break;
        }
      }
      if (rendered !== undefined) applyAvatarSnapshot(entry.root, rendered);
    }
  }

  public getDiagnostics(): readonly AvatarDiagnostic[] {
    return [...this.entries.values()].map((entry) =>
      avatarDiagnostic(entry.root, entry.latestTick),
    );
  }

  public getRoot(playerId: string): THREE.Group | null {
    return this.entries.get(playerId)?.root ?? null;
  }

  public dispose(): void {
    for (const entry of this.entries.values()) {
      this.scene.remove(entry.root);
      entry.root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const mesh = object as unknown as {
          readonly geometry: THREE.BufferGeometry;
          readonly material: THREE.Material | THREE.Material[];
        };
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          for (const material of mesh.material) material.dispose();
        } else {
          mesh.material.dispose();
        }
      });
    }
    this.entries.clear();
  }
}
