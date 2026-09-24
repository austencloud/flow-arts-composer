"""Build trimmed terminal-stop GLBs and motion/contact metadata.

The source clips are Mixamo walk-to-idle transitions with root translation.
Each runtime clip begins on the preceding support-foot landing and includes
exactly one final placement before settling. The JSON sidecar is the declared
contact and root-distance schedule consumed by LocomotionAnimator.
"""

from __future__ import annotations

import json
import math
import os

import bpy
from mathutils import Matrix


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BLEND_FRAMES = 4
CLIPS = (
    {
        "source": "walk-stop-source.fbx",
        "output": "walk-stop-left.glb",
        "metadata": "walk-stop-left.motion.json",
        "clip_name": "walk-stop-left",
        "terminal_foot": "left",
        "start_frame": 11,
        "step_frames": (31, 48),
        "end_frame": 50,
        "hold_frames": 12,
        "motion_id": "c9c8d966-b96c-11e4-a802-0aaa78deedf9",
        "mirror": False,
    },
    {
        "source": "walk-stop-source.fbx",
        "output": "walk-stop-right.glb",
        "metadata": "walk-stop-right.motion.json",
        "clip_name": "walk-stop-right",
        "terminal_foot": "right",
        "start_frame": 11,
        "step_frames": (31, 48),
        "end_frame": 50,
        "hold_frames": 12,
        "motion_id": "c9c8d966-b96c-11e4-a802-0aaa78deedf9",
        "mirror": True,
    },
)

FOOT_BONES = {
    "left": ("mixamorig:LeftToeBase", "mixamorig:LeftFoot", "LeftToeBase", "LeftFoot"),
    "right": ("mixamorig:RightToeBase", "mixamorig:RightFoot", "RightToeBase", "RightFoot"),
}
HIP_BONES = ("mixamorig:Hips", "Hips")


def find_pose_bone(armature: bpy.types.Object, candidates: tuple[str, ...]):
    for name in candidates:
        bone = armature.pose.bones.get(name)
        if bone is not None:
            return bone
    return None


def world_position(armature: bpy.types.Object, bone) -> tuple[float, float, float]:
    point = (armature.matrix_world @ bone.matrix).to_translation()
    return (float(point.x), float(point.y), float(point.z))


def point_distance(a: tuple[float, float, float], b: tuple[float, float, float]) -> float:
    return math.sqrt(sum((left - right) ** 2 for left, right in zip(a, b)))


def mirrored_bone_name(name: str) -> str:
    if "Left" in name:
        return name.replace("Left", "Right", 1)
    if "Right" in name:
        return name.replace("Right", "Left", 1)
    return name


def bone_depth(bone) -> int:
    depth = 0
    parent = bone.parent
    while parent is not None:
        depth += 1
        parent = parent.parent
    return depth


def bake_trimmed_action(
    armature: bpy.types.Object,
    start_frame: int,
    end_frame: int,
    hold_frames: int,
    clip_name: str,
    mirror: bool,
) -> None:
    source_action = armature.animation_data.action
    source_samples: list[dict[str, Matrix]] = []
    for frame in range(start_frame, end_frame + 1):
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        source_samples.append(
            {bone.name: bone.matrix.copy() for bone in armature.pose.bones}
        )
    for _ in range(hold_frames):
        source_samples.append(
            {name: matrix.copy() for name, matrix in source_samples[-1].items()}
        )

    armature.animation_data.action = None
    bpy.data.actions.remove(source_action)
    target_action = bpy.data.actions.new(clip_name)
    armature.animation_data.action = target_action

    reflection = Matrix.Diagonal((-1.0, 1.0, 1.0, 1.0))
    ordered_bones = sorted(armature.pose.bones, key=bone_depth)
    for output_frame, matrices in enumerate(source_samples):
        # Solve each local transform against the parent's pose on THIS frame.
        # Assigning PoseBone.matrix instead converts against the parent's last
        # evaluated pose, which was the final source frame, and keyed every
        # leg relative to a pelvis already standing at the end of the clip.
        wanted: dict[str, Matrix] = {}
        for target in ordered_bones:
            source_name = mirrored_bone_name(target.name) if mirror else target.name
            source_matrix = matrices.get(source_name)
            if source_matrix is None:
                continue
            wanted[target.name] = (
                reflection @ source_matrix @ reflection if mirror else source_matrix
            )
        # LocomotionAnimator drops every Hips rotation track, because Mixamo
        # exports bake the character's base orientation into it. This capture
        # also pitches its pelvis 10-13 degrees while braking, and dropped with
        # the track that pitch swings both legs back round the hip. Keep the
        # pelvis at rest here and let its children carry the rotation: every
        # other bone's world pose is unchanged.
        for target in ordered_bones:
            pose = wanted.get(target.name)
            if target.parent is None and pose is not None:
                wanted[target.name] = Matrix.LocRotScale(
                    pose.to_translation(),
                    target.bone.matrix_local.to_quaternion(),
                    None,
                )
        for target in ordered_bones:
            pose = wanted.get(target.name)
            if pose is None:
                continue
            rest = target.bone.matrix_local
            parent = target.parent
            if parent is None:
                basis = rest.inverted() @ pose
            else:
                parent_pose = wanted.get(parent.name, parent.matrix)
                offset = parent.bone.matrix_local.inverted() @ rest
                basis = offset.inverted() @ parent_pose.inverted() @ pose
            target.rotation_mode = "QUATERNION"
            target.matrix_basis = basis
        for target in ordered_bones:
            target.keyframe_insert("location", frame=output_frame, group=target.name)
            target.keyframe_insert(
                "rotation_quaternion", frame=output_frame, group=target.name
            )
            target.keyframe_insert("scale", frame=output_frame, group=target.name)

    bpy.context.scene.frame_start = 0
    bpy.context.scene.frame_end = len(source_samples) - 1
    bpy.context.scene.frame_set(0)
    bpy.context.view_layer.update()


def smooth_contacts(raw: list[float]) -> list[float]:
    # Both ramps sit inside the planted span. FootPlanter pins the toe on the
    # first frame that reaches 0.6, so a ramp written ahead of touchdown pinned
    # a foot still swinging in; one written ahead of lift-off only lets go early.
    result = list(raw)
    for index in range(1, len(raw)):
        if raw[index] == raw[index - 1]:
            continue
        entering = raw[index] > raw[index - 1]
        for step in range(BLEND_FRAMES):
            target = index + step if entering else index - BLEND_FRAMES + step
            if target < 0 or target >= len(raw) or raw[target] != 1.0:
                continue
            progress = (step + 1) / (BLEND_FRAMES + 1)
            result[target] = (
                0.5 + 0.5 * progress if entering else 0.5 * (1 - progress)
            )
    return [round(value, 4) for value in result]


def monotonic_root_curve(
    positions: list[tuple[float, float, float]],
    horizontal_axes: list[int],
    landing_indices: list[int],
) -> tuple[list[float], float]:
    start = positions[0]
    landing = positions[landing_indices[-1]]
    delta = [landing[axis] - start[axis] for axis in horizontal_axes]
    travel = math.hypot(*delta)
    if travel <= 1e-6:
        raise RuntimeError("Terminal clip has no root travel before landing")

    direction = [component / travel for component in delta]
    progress: list[float] = []
    furthest = 0.0
    for index, point in enumerate(positions):
        if index >= landing_indices[-1]:
            progress.append(1.0)
            continue
        projected = sum(
            (point[axis] - start[axis]) * direction[offset]
            for offset, axis in enumerate(horizontal_axes)
        )
        furthest = max(furthest, projected)
        progress.append(min(1.0, max(0.0, furthest / travel)))
    progress[landing_indices[-1]] = 1.0
    return [round(value, 6) for value in progress], travel


def build_clip(spec: dict[str, object]) -> None:
    source_path = os.path.join(SCRIPT_DIR, str(spec["source"]))
    if not os.path.exists(source_path):
        raise FileNotFoundError(source_path)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=source_path)

    armature = next(
        (candidate for candidate in bpy.context.scene.objects if candidate.type == "ARMATURE"),
        None,
    )
    if armature is None or armature.animation_data is None or armature.animation_data.action is None:
        raise RuntimeError(f"No animated armature found in {source_path}")

    hips = find_pose_bone(armature, HIP_BONES)
    feet = {
        side: find_pose_bone(armature, candidates)
        for side, candidates in FOOT_BONES.items()
    }
    if hips is None or any(foot is None for foot in feet.values()):
        raise RuntimeError(f"Missing Mixamo hips/foot bones in {source_path}")

    start_frame = int(spec["start_frame"])
    source_step_frames = [int(frame) for frame in spec["step_frames"]]
    end_frame = int(spec["end_frame"])
    hold_frames = int(spec["hold_frames"])
    source_frames = list(range(start_frame, end_frame + 1))
    frames = list(range(0, end_frame - start_frame + hold_frames + 1))
    landing_indices = [frame - start_frame for frame in source_step_frames]
    fps = float(bpy.context.scene.render.fps)

    source_samples: dict[str, list[tuple[float, float, float]]] = {
        "hips": [],
        "left": [],
        "right": [],
    }
    for frame in source_frames:
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        source_samples["hips"].append(world_position(armature, hips))
        source_samples["left"].append(world_position(armature, feet["left"]))
        source_samples["right"].append(world_position(armature, feet["right"]))
    for sample in source_samples.values():
        sample.extend([sample[-1]] * hold_frames)

    samples = {
        "hips": source_samples["hips"],
        "left": source_samples["right"] if spec["mirror"] else source_samples["left"],
        "right": source_samples["left"] if spec["mirror"] else source_samples["right"],
    }

    all_foot_points = samples["left"] + samples["right"]
    axis_ranges = [
        max(point[axis] for point in all_foot_points)
        - min(point[axis] for point in all_foot_points)
        for axis in range(3)
    ]
    up_axis = min(range(3), key=lambda axis: axis_ranges[axis])
    horizontal_axes = [axis for axis in range(3) if axis != up_axis]

    bpy.context.scene.frame_set(start_frame)
    bpy.context.view_layer.update()
    ground = min(point[up_axis] for point in all_foot_points)
    all_bone_points = [world_position(armature, bone) for bone in armature.pose.bones]
    body_height = max(point[up_axis] for point in all_bone_points) - ground
    height_threshold = ground + body_height * 0.035
    velocity_threshold = body_height * 0.02

    contacts: dict[str, list[float]] = {}
    for side in ("left", "right"):
        positions = samples[side]
        raw = []
        for index, point in enumerate(positions):
            velocity = 0.0 if index == 0 else point_distance(point, positions[index - 1])
            raw.append(
                1.0
                if point[up_axis] <= height_threshold and velocity <= velocity_threshold
                else 0.0
            )
        contacts[side] = smooth_contacts(raw)

    root_distance, native_travel = monotonic_root_curve(
        samples["hips"], horizontal_axes, landing_indices
    )

    bake_trimmed_action(
        armature,
        start_frame,
        end_frame,
        hold_frames,
        str(spec["clip_name"]),
        bool(spec["mirror"]),
    )

    metadata = {
        "version": 1,
        "clipName": spec["clip_name"],
        "terminalFoot": spec["terminal_foot"],
        "sourceMotionId": spec["motion_id"],
        "mirrored": bool(spec["mirror"]),
        "frameRate": fps,
        "frameCount": len(frames),
        "stepFrames": landing_indices,
        "stepPhases": [
            round(frame / (len(frames) - 1), 6) for frame in landing_indices
        ],
        "settlePhase": 1,
        "nativeTravelMeters": round(native_travel, 6),
        "rootDistance": root_distance,
        "leftFoot": contacts["left"],
        "rightFoot": contacts["right"],
    }
    metadata_path = os.path.join(SCRIPT_DIR, str(spec["metadata"]))
    with open(metadata_path, "w", encoding="utf-8") as metadata_file:
        json.dump(metadata, metadata_file, indent=2)
        metadata_file.write("\n")

    output_path = os.path.join(SCRIPT_DIR, str(spec["output"]))
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format="GLB",
        export_animations=True,
        export_skins=True,
    )
    print(
        f"Built {spec['clip_name']}: {len(frames)} frames, "
        f"landings {landing_indices}, native travel {native_travel:.3f}m"
    )


for clip_spec in CLIPS:
    build_clip(clip_spec)
