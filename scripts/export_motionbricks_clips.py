#!/usr/bin/env python3
"""Export the pinned MotionBricks G1 playback clips for the browser adapter.

The upstream checkpoint is a Git-LFS artifact and is not a browser dependency.
This one-time exporter keeps only the kinematic joints used by the local
stick-figure rig, preserving the source commit and checkpoint object ID in the
generated JSON metadata.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import torch


CLIP_NAMES = (
    "idle",
    "slow_walk",
    "walk",
    "hand_crawling",
    "walk_boxing",
    "elbow_crawling",
    "stealth_walk",
    "injured_walk",
    "walk_stealth",
    "walk_happy_dance",
    "walk_zombie",
    "walk_gun",
    "walk_scared",
    "walk_left",
    "walk_right",
)

# G1Skeleton34 indexes from the pinned MotionBricks source.
JOINTS = {
    "pelvis": 0,
    "leftHip": 1,
    "leftKnee": 4,
    "leftAnkle": 6,
    "leftShoulder": 18,
    "leftElbow": 21,
    "leftHand": 25,
    "rightHip": 8,
    "rightKnee": 11,
    "rightAnkle": 13,
    "rightShoulder": 26,
    "rightElbow": 29,
    "rightHand": 33,
    "waist": 17,
}

CHECKPOINT_OID = "sha256:84afc7c229473351a24b0a7d79fc47be9dbb81bd12774285f2f60a3c0e9028df"
MOTIONBRICKS_COMMIT = "1983e88888217f6c69283cf3a9d1af01e87f07af"
FPS = 30


def rounded(value: float) -> float:
    return round(float(value), 6)


def export(checkpoint: Path, output: Path) -> None:
    payload: Any = torch.load(checkpoint, map_location="cpu", weights_only=False)
    positions = payload["global_joint_positions"]
    lengths = payload["num_frames_per_clip"].tolist()
    if tuple(positions.shape[2:]) != (34, 3):
        raise ValueError(f"Expected [clips, frames, 34, 3] positions, got {tuple(positions.shape)}")
    if len(lengths) != len(CLIP_NAMES):
        raise ValueError(f"Expected {len(CLIP_NAMES)} clip lengths, got {len(lengths)}")

    clips: dict[str, dict[str, Any]] = {}
    for clip_index, clip_name in enumerate(CLIP_NAMES):
        frame_count = int(lengths[clip_index])
        frames = positions[clip_index, :frame_count]
        clips[clip_name] = {
            "frameCount": frame_count,
            "frames": [
                {
                    joint_name: [rounded(component) for component in frames[frame, joint_index].tolist()]
                    for joint_name, joint_index in JOINTS.items()
                }
                for frame in range(frame_count)
            ],
        }

    result = {
        "source": {
            "repository": "NVlabs/GR00T-WholeBodyControl",
            "subproject": "motionbricks",
            "commit": MOTIONBRICKS_COMMIT,
            "checkpoint": "motionbricks/out/G1-clip.ckpt",
            "checkpointOid": CHECKPOINT_OID,
            "skeleton": "G1Skeleton34",
            "representation": "global_joint_positions",
        },
        "fps": FPS,
        "jointOrder": list(JOINTS),
        "clips": clips,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    export(args.checkpoint, args.output)


if __name__ == "__main__":
    main()
