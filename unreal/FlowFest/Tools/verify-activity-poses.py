#!/usr/bin/env python3
"""Measure captured Flow Fest activity poses without imposing visual pass thresholds.

Run launch.ps1 with -PoseEvidence and -Capture to write .pose.json files.
Pass the standing/idle capture as --reference to measure foot floor drift.
All positions are centimetres in the captured performer's local frame.
"""

import argparse
import json
import math
from pathlib import Path


REQUIRED = (
    "Hips", "Head", "LeftFoot", "RightFoot", "LeftHand", "RightHand",
    "LeftUpLeg", "LeftLeg", "RightUpLeg", "RightLeg",
    "LeftArm", "LeftForeArm", "RightArm", "RightForeArm",
)
OPTIONAL_CONTACTS = (
    "RightHandIndex3", "LeftHandMiddle1", "LeftHandMiddle3",
    "LeftHandIndex1", "LeftHandPinky1",
)


def distance(a, b):
    return math.dist(a, b)


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def delta(a, b):
    return tuple(x - y for x, y in zip(a, b))


def read_pose(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    bones = data.get("bones")
    if not isinstance(bones, dict):
        raise ValueError(f"{path}: missing bones object")
    missing = [name for name in REQUIRED if name not in bones]
    if missing:
        raise ValueError(f"{path}: missing bones: {', '.join(missing)}")
    positions = {}
    for name in (*REQUIRED, *(name for name in OPTIONAL_CONTACTS if name in bones)):
        values = bones[name]
        if not isinstance(values, list) or len(values) != 10 or not all(
            isinstance(value, (int, float)) and math.isfinite(value) for value in values
        ):
            raise ValueError(f"{path}: invalid transform for {name}")
        positions[name] = values[:3]
    return data.get("characterId", "?"), positions


def metrics(bones, reference):
    hips, head = bones["Hips"], bones["Head"]
    feet = [bones["LeftFoot"], bones["RightFoot"]]
    hands = [bones["LeftHand"], bones["RightHand"]]
    measured = {
        "hipAboveLowestFootCm": hips[2] - min(foot[2] for foot in feet),
        "hipBehindFootMidpointCm": sum(foot[0] for foot in feet) / 2 - hips[0],
        "footHeightDifferenceCm": abs(feet[0][2] - feet[1][2]),
        "leftHandToHeadCm": distance(hands[0], head),
        "rightHandToHeadCm": distance(hands[1], head),
        "rightHandBelowHeadCm": head[2] - hands[1][2],
        # Head-bone origin is a repeatable trajectory proxy, not a mouth socket.
        "rightHandAheadOfHeadCm": hands[1][0] - head[0],
        "rightHandLateralFromHeadCm": hands[1][1] - head[1],
        "leftHandToHipCm": distance(hands[0], hips),
        "rightHandToHipCm": distance(hands[1], hips),
    }
    for side in ("Left", "Right"):
        measured[f"{side.lower()}ThighLengthCm"] = distance(
            bones[f"{side}UpLeg"], bones[f"{side}Leg"]
        )
        measured[f"{side.lower()}ShinLengthCm"] = distance(
            bones[f"{side}Leg"], bones[f"{side}Foot"]
        )
        measured[f"{side.lower()}UpperArmLengthCm"] = distance(
            bones[f"{side}Arm"], bones[f"{side}ForeArm"]
        )
        measured[f"{side.lower()}ForearmLengthCm"] = distance(
            bones[f"{side}ForeArm"], bones[f"{side}Hand"]
        )
    if "RightHandIndex3" in bones:
        tip = bones["RightHandIndex3"]
        measured["rightIndexTipToHeadCm"] = distance(tip, head)
        measured["rightIndexTipBelowHeadCm"] = head[2] - tip[2]
        measured["rightIndexTipAheadOfHeadCm"] = tip[0] - head[0]
        if "LeftHandMiddle1" in bones:
            measured["rightIndexTipToBowlPalmCm"] = distance(
                tip, bones["LeftHandMiddle1"]
            )
            # Current meal geometry places food top 6.9 cm above the
            # LeftHandMiddle1 anchor, independent of performer body scale.
            food_top = bones["LeftHandMiddle1"][2] + 6.9
            measured["rightIndexTipBelowFoodTopCm"] = food_top - tip[2]
    if all(name in bones for name in (
            "LeftHandMiddle1", "LeftHandMiddle3",
            "LeftHandIndex1", "LeftHandPinky1")):
        palm = bones["LeftHandMiddle1"]
        finger = delta(palm, bones["LeftHand"])
        across = delta(bones["LeftHandIndex1"], bones["LeftHandPinky1"])
        normal = cross(finger, across)
        norm = math.sqrt(dot(normal, normal))
        if norm > 0:
            measured["leftPalmUpDot"] = normal[2] / norm
        measured["leftMiddleTipBelowBowlBottomCm"] = (
            palm[2] + 0.25 - bones["LeftHandMiddle3"][2]
        )
    if reference is not None:
        for side in ("Left", "Right"):
            foot = bones[f"{side}Foot"]
            base = reference[f"{side}Foot"]
            measured[f"{side.lower()}FootFloorDeltaCm"] = foot[2] - base[2]
            measured[f"{side.lower()}FootForwardDeltaCm"] = foot[0] - base[0]
        measured["hipHeightDeltaCm"] = hips[2] - reference["Hips"][2]
    return measured


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("captures", nargs="+", type=Path,
                        help="One or more .pose.json captures, in activity phase order")
    parser.add_argument("--reference", type=Path, help="Standing pose of the same character and placement")
    parser.add_argument("--json", action="store_true", help="Emit machine readable measurements")
    args = parser.parse_args()
    try:
        reference_id, reference = read_pose(args.reference) if args.reference else (None, None)
        result = []
        previous = None
        first_id = None
        for path in args.captures:
            character_id, bones = read_pose(path)
            if reference is not None and character_id != reference_id:
                raise ValueError(f"{path}: character differs from reference ({reference_id})")
            if first_id is not None and character_id != first_id:
                raise ValueError(f"{path}: character differs from first capture ({first_id})")
            first_id = character_id
            measured = metrics(bones, reference)
            if previous is not None:
                for side in ("Left", "Right"):
                    key = f"{side}Hand"
                    measured[f"{side.lower()}HandTravelSincePreviousCm"] = distance(
                        bones[key], previous[key]
                    )
                measured["rightHandToHeadChangeSincePreviousCm"] = (
                    measured["rightHandToHeadCm"] - distance(previous["RightHand"], previous["Head"])
                )
            result.append({"capture": str(path), "characterId": character_id,
                           "measurementsCm": measured})
            previous = bones
    except (OSError, ValueError, json.JSONDecodeError) as error:
        parser.error(str(error))
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        for entry in result:
            print(f"{entry['capture']} ({entry['characterId']})")
            for name, value in entry["measurementsCm"].items():
                print(f"  {name}: {value:.2f}")


if __name__ == "__main__":
    main()
