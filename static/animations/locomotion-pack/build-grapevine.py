"""Build four-step grapevine loops from the shipped Mixamo strafe captures.

Each source contains a captured two-step lateral crossover with root travel and
weight transfer. This offline authoring pass repeats the cycle and changes only
the crossing ankle's fore/aft target while that leg swings, alternating behind
and in front. Blender's visual constraint baker records the resulting joint
rotations. Runtime IK remains a contact-correction layer.

Run with:
  blender --background --python build-grapevine.py
"""

from __future__ import annotations

import hashlib
import json
import math
import os

import bpy
from mathutils import Matrix, Vector


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# Raw FBX sources are kept off the repository. Point ANIMATION_SOURCE_DIR at
# the folder that holds them; without it the script looks beside itself.
SOURCE_DIR = os.environ.get("ANIMATION_SOURCE_DIR", SCRIPT_DIR)
SOURCE_FRAME_RATE = 30
FRAME_RATE = 120
BAKE_SUBSTEPS = FRAME_RATE // SOURCE_FRAME_RATE
PHASE_FRAMES = tuple(range(10, 33)) + tuple(range(1, 10))
MINIMUM_CROSS_DEPTH = 0.12
MINIMUM_FOOT_CLEARANCE = 0.12
MINIMUM_LEG_CLEARANCE = 0.04
CLEARANCE_MARGIN = 0.05
MAXIMUM_EXTRA_FOOT_HEIGHT = 0.08
MAXIMUM_LEG_LENGTH_ERROR = 0.002
CONTACT_BAND = 0.045
OVER_SUPPORT_DISTANCE = 0.06
MINIMUM_OVER_SUPPORT_FRACTION = 0.15
TARGET_PELVIS_SWAY = 0.09
PELVIS_SMOOTHING_PASSES = 6
KNEE_CANDIDATES = 32
POSE_FRAMES = len(PHASE_FRAMES) * 2
OUTPUT_FRAMES = (POSE_FRAMES - 1) * BAKE_SUBSTEPS + 1

HIP_NAMES = ("mixamorig:Hips", "Hips")
LEFT_UP_LEG_NAMES = ("mixamorig:LeftUpLeg", "LeftUpLeg")
LEFT_LEG_NAMES = ("mixamorig:LeftLeg", "LeftLeg")
LEFT_FOOT_NAMES = ("mixamorig:LeftFoot", "LeftFoot")
RIGHT_UP_LEG_NAMES = ("mixamorig:RightUpLeg", "RightUpLeg")
RIGHT_LEG_NAMES = ("mixamorig:RightLeg", "RightLeg")
RIGHT_FOOT_NAMES = ("mixamorig:RightFoot", "RightFoot")

CLIPS = (
    {
        "name": "grapevine-left",
        "source": "left strafe walking.fbx",
        "crossing_side": "right",
    },
    {
        "name": "grapevine-right",
        "source": "right strafe walking.fbx",
        "crossing_side": "left",
    },
)


def find_pose_bone(armature: bpy.types.Object, names: tuple[str, ...]):
    for name in names:
        bone = armature.pose.bones.get(name)
        if bone is not None:
            return bone
    return None


def required_pose_bone(armature: bpy.types.Object, names: tuple[str, ...]):
    bone = find_pose_bone(armature, names)
    if bone is None:
        raise RuntimeError(f"Missing required bone: {names}")
    return bone


def bone_depth(bone) -> int:
    depth = 0
    parent = bone.parent
    while parent is not None:
        depth += 1
        parent = parent.parent
    return depth


def smooth(value: float) -> float:
    clamped = min(1.0, max(0.0, value))
    return clamped * clamped * (3.0 - 2.0 * clamped)


def smooth_loop(values: list[float], passes: int) -> list[float]:
    result = list(values)
    for _ in range(passes):
        source = list(result)
        count = len(source)
        result = [
            0.25 * source[(index - 1) % count]
            + 0.5 * source[index]
            + 0.25 * source[(index + 1) % count]
            for index in range(count)
        ]
    return result


def knee_candidates(hip, ankle, upper_length, lower_length, preferred):
    axis = ankle - hip
    distance = axis.length
    if distance < 1e-6:
        raise RuntimeError("A grapevine leg collapsed to zero length")
    axis /= distance
    reachable = min(distance, upper_length + lower_length - 1e-5)
    along = (
        upper_length * upper_length
        - lower_length * lower_length
        + reachable * reachable
    ) / (2 * reachable)
    radius = math.sqrt(max(0.0, upper_length * upper_length - along * along))
    center = hip + axis * along
    radial = preferred - center
    radial -= axis * radial.dot(axis)
    if radial.length < 1e-6:
        radial = axis.cross(Vector((0.0, 0.0, 1.0)))
    if radial.length < 1e-6:
        radial = axis.cross(Vector((0.0, 1.0, 0.0)))
    radial.normalize()
    tangent = axis.cross(radial).normalized()
    return [
        center
        + radius
        * (
            math.cos(math.tau * index / KNEE_CANDIDATES) * radial
            + math.sin(math.tau * index / KNEE_CANDIDATES) * tangent
        )
        for index in range(KNEE_CANDIDATES)
    ]


def candidate_leg_clearance(
    left_hip,
    left_knee,
    left_ankle,
    right_hip,
    right_knee,
    right_ankle,
) -> float:
    left_segments = ((left_hip, left_knee), (left_knee, left_ankle))
    right_segments = ((right_hip, right_knee), (right_knee, right_ankle))
    return min(
        segment_separation(left_start, left_end, right_start, right_end)
        for left_start, left_end in left_segments
        for right_start, right_end in right_segments
    )


def collision_safe_knees(frame_kinematics, pelvis_shifts, source_leg_lengths):
    solved = {"left": [], "right": []}
    previous = {"left": None, "right": None}
    for frame, pelvis_shift in zip(frame_kinematics, pelvis_shifts):
        shift = Vector((pelvis_shift, 0.0, 0.0))
        hips = {
            side: frame[side]["hip"] + shift for side in ("left", "right")
        }
        preferred = {
            side: frame[side]["knee"] + shift * 0.5
            for side in ("left", "right")
        }
        candidates = {
            side: knee_candidates(
                hips[side],
                frame[side]["ankle"],
                source_leg_lengths[f"{side}Upper"],
                source_leg_lengths[f"{side}Lower"],
                preferred[side],
            )
            for side in ("left", "right")
        }

        best = None
        for left_knee in candidates["left"]:
            for right_knee in candidates["right"]:
                clearance = candidate_leg_clearance(
                    hips["left"],
                    left_knee,
                    frame["left"]["ankle"],
                    hips["right"],
                    right_knee,
                    frame["right"]["ankle"],
                )
                deviation = (
                    (left_knee - preferred["left"]).length_squared
                    + (right_knee - preferred["right"]).length_squared
                )
                continuity = 0.0
                if previous["left"] is not None:
                    continuity = (
                        (left_knee - previous["left"]).length_squared
                        + (right_knee - previous["right"]).length_squared
                    )
                clears = clearance >= MINIMUM_LEG_CLEARANCE + 0.005
                score = (
                    0 if clears else 1,
                    deviation + 5.0 * continuity
                    if clears
                    else -clearance + 0.05 * deviation + 0.5 * continuity,
                )
                if best is None or score < best[0]:
                    best = (score, left_knee.copy(), right_knee.copy())
        if best is None:
            raise RuntimeError("No collision-safe grapevine knee pair was found")
        solved["left"].append(best[1])
        solved["right"].append(best[2])
        previous["left"] = best[1]
        previous["right"] = best[2]
    return solved


def pole_from_knee(hip, ankle, knee):
    axis = ankle - hip
    axis_length_squared = axis.length_squared
    if axis_length_squared < 1e-9:
        return knee.copy()
    along = (knee - hip).dot(axis) / axis_length_squared
    center = hip + axis * along
    radial = knee - center
    if radial.length < 1e-6:
        return knee.copy()
    return center + radial.normalized() * 2.0


def crossing_swing_window(crossing_side: str) -> tuple[int, int]:
    # PHASE_FRAMES rotates the original capture to begin at frame 10. In the
    # left-travel capture the right foot is already airborne there and lands
    # around source frame 25 (phase 15). In the mirrored right-travel capture,
    # the left foot takes the other half of the cycle. Treating both directions
    # as the latter window rewrites the right foot while it is supporting the
    # body, erasing the captured weight transfer and creating a flight phase.
    return (0, 15) if crossing_side == "right" else (16, len(PHASE_FRAMES) - 1)


def role_at(
    cycle: int,
    phase_index: int,
    base_sign: float,
    swing_start: int,
    swing_end: int,
) -> float:
    start_role = base_sign if cycle == 0 else -base_sign
    end_role = -start_role
    if phase_index <= swing_start:
        return start_role
    if phase_index >= swing_end:
        return end_role
    blend = smooth((phase_index - swing_start) / (swing_end - swing_start))
    return start_role + (end_role - start_role) * blend


def source_sha256(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def world_head(armature: bpy.types.Object, bone: bpy.types.PoseBone):
    return armature.matrix_world @ bone.head


def world_foot(armature: bpy.types.Object, bone: bpy.types.PoseBone):
    return (armature.matrix_world @ bone.matrix).translation


def leg_lengths(armature: bpy.types.Object) -> dict[str, float]:
    left_upper = required_pose_bone(armature, LEFT_UP_LEG_NAMES)
    left_lower = required_pose_bone(armature, LEFT_LEG_NAMES)
    left_foot = required_pose_bone(armature, LEFT_FOOT_NAMES)
    right_upper = required_pose_bone(armature, RIGHT_UP_LEG_NAMES)
    right_lower = required_pose_bone(armature, RIGHT_LEG_NAMES)
    right_foot = required_pose_bone(armature, RIGHT_FOOT_NAMES)
    return {
        "leftUpper": (world_head(armature, left_upper) - world_head(armature, left_lower)).length,
        "leftLower": (world_head(armature, left_lower) - world_head(armature, left_foot)).length,
        "rightUpper": (world_head(armature, right_upper) - world_head(armature, right_lower)).length,
        "rightLower": (world_head(armature, right_lower) - world_head(armature, right_foot)).length,
    }


def sample_source(armature: bpy.types.Object):
    ordered = sorted(armature.pose.bones, key=bone_depth)
    hips = required_pose_bone(armature, HIP_NAMES)
    left_foot = required_pose_bone(armature, LEFT_FOOT_NAMES)
    right_foot = required_pose_bone(armature, RIGHT_FOOT_NAMES)

    samples = []
    height_ranges = {
        "left": [float("inf"), float("-inf")],
        "right": [float("inf"), float("-inf")],
    }
    length_reference = None
    for frame in PHASE_FRAMES:
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        left_world = world_foot(armature, left_foot)
        right_world = world_foot(armature, right_foot)
        for side, foot in (("left", left_world), ("right", right_world)):
            height_ranges[side][0] = min(height_ranges[side][0], float(foot.z))
            height_ranges[side][1] = max(height_ranges[side][1], float(foot.z))
        if length_reference is None:
            length_reference = leg_lengths(armature)
        samples.append(
            {
                "frame": frame,
                "basis": {bone.name: bone.matrix_basis.copy() for bone in ordered},
                "hips_x": float(hips.location.x),
                "left_world": left_world.copy(),
                "right_world": right_world.copy(),
            }
        )
    return ordered, samples, height_ranges, length_reference


def unwrap_root(samples, armature: bpy.types.Object) -> tuple[list[float], float]:
    action = armature.animation_data.action
    hips = required_pose_bone(armature, HIP_NAMES)
    start_frame, end_frame = map(lambda value: int(round(value)), action.frame_range)
    bpy.context.scene.frame_set(start_frame)
    bpy.context.view_layer.update()
    start_x = float(hips.location.x)
    bpy.context.scene.frame_set(end_frame)
    bpy.context.view_layer.update()
    cycle_travel = float(hips.location.x) - start_x
    if abs(cycle_travel) < 1e-4:
        raise RuntimeError("The source has no lateral root travel")

    unwrapped = []
    offset = 0.0
    previous_frame = PHASE_FRAMES[0]
    for sample in samples:
        sample_frame = int(sample["frame"])
        if sample_frame < previous_frame:
            offset += cycle_travel
        unwrapped.append(float(sample["hips_x"]) + offset)
        previous_frame = sample_frame
    origin = unwrapped[0]
    return [value - origin for value in unwrapped], cycle_travel


def apply_source_basis(ordered, basis: dict[str, Matrix]) -> None:
    for bone in ordered:
        bone.matrix_basis = basis[bone.name].copy()


def output_phase(output_frame: int) -> tuple[int, float, int, int, float]:
    pose_frame = output_frame / BAKE_SUBSTEPS
    cycle = int(pose_frame // len(PHASE_FRAMES))
    phase = pose_frame % len(PHASE_FRAMES)
    first = int(math.floor(phase))
    second = (first + 1) % len(PHASE_FRAMES)
    fraction = phase - first
    return cycle, phase, first, second, fraction


def apply_interpolated_basis(ordered, samples, output_frame: int) -> None:
    _, _, first, second, fraction = output_phase(output_frame)
    if fraction < 1e-6:
        apply_source_basis(ordered, samples[first]["basis"])
        return
    for bone in ordered:
        first_location, first_rotation, first_scale = samples[first]["basis"][
            bone.name
        ].decompose()
        second_location, second_rotation, second_scale = samples[second]["basis"][
            bone.name
        ].decompose()
        location = first_location.lerp(second_location, fraction)
        rotation = first_rotation.slerp(second_rotation, fraction)
        scale = first_scale.lerp(second_scale, fraction)
        bone.matrix_basis = Matrix.LocRotScale(location, rotation, scale)


def output_root_x(
    output_frame: int,
    root_x: list[float],
    cycle_travel: float,
) -> float:
    cycle, _, first, second, fraction = output_phase(output_frame)
    first_root = root_x[first]
    second_root = root_x[second]
    if second == 0:
        second_root += cycle_travel
    return (
        first_root
        + (second_root - first_root) * fraction
        + cycle * cycle_travel
    )


def key_current_basis(ordered, frame: int) -> None:
    for bone in ordered:
        location, rotation, scale = bone.matrix_basis.decompose()
        bone.rotation_mode = "QUATERNION"
        bone.location = location
        bone.rotation_quaternion = rotation
        bone.scale = scale
        bone.keyframe_insert("location", frame=frame, group=bone.name)
        bone.keyframe_insert("rotation_quaternion", frame=frame, group=bone.name)
        bone.keyframe_insert("scale", frame=frame, group=bone.name)


def make_bake_plan(
    armature: bpy.types.Object,
    ordered,
    samples,
    crossing_side: str,
    source_height_ranges: dict[str, list[float]],
    source_leg_lengths: dict[str, float],
) -> tuple[
    dict[str, list[object]],
    dict[str, list[object]],
    list[float],
    list[float],
    list[float],
    float,
]:
    hips = required_pose_bone(armature, HIP_NAMES)
    root_x, cycle_travel = unwrap_root(samples, armature)
    first = samples[0]
    left_depth = float(first["left_world"].y)
    right_depth = float(first["right_world"].y)
    base_depth = left_depth - right_depth
    if crossing_side == "right":
        base_depth *= -1.0
    base_sign = 1.0 if base_depth >= 0 else -1.0

    targets = {"left": [], "right": []}
    frame_kinematics = []
    support_positions = []
    base_pelvis_positions = []
    root_positions = []
    authored_depth = []
    left_foot = required_pose_bone(armature, LEFT_FOOT_NAMES)
    right_foot = required_pose_bone(armature, RIGHT_FOOT_NAMES)
    crossing_lower = required_pose_bone(
        armature,
        LEFT_LEG_NAMES if crossing_side == "left" else RIGHT_LEG_NAMES,
    )
    swing_start, swing_end = crossing_swing_window(crossing_side)
    for output_frame in range(OUTPUT_FRAMES):
        cycle, phase_index, _, _, _ = output_phase(output_frame)
        apply_interpolated_basis(ordered, samples, output_frame)
        root_position = output_root_x(output_frame, root_x, cycle_travel)
        root_positions.append(root_position)
        hips.location.x = root_position
        bpy.context.view_layer.update()

        left_world = world_foot(armature, left_foot)
        right_world = world_foot(armature, right_foot)
        crossing_world = left_world if crossing_side == "left" else right_world
        support_world = right_world if crossing_side == "left" else left_world
        source_depth = abs(crossing_world.y - support_world.y)
        desired_depth = max(MINIMUM_CROSS_DEPTH, source_depth)
        desired_world = crossing_world.copy()
        role = role_at(
            cycle,
            phase_index,
            base_sign,
            swing_start,
            swing_end,
        )
        desired_world.y = support_world.y + desired_depth * role
        if swing_start < phase_index < swing_end:
            # The crossing foot must pass the support foot while changing from
            # front to back (or vice versa). Preserve the captured lateral arc,
            # then add only the vertical separation the current horizontal gap
            # needs. This avoids a fixed high-knee exaggeration on wider rigs.
            horizontal_squared = (
                (desired_world.x - support_world.x) ** 2
                + (desired_world.y - support_world.y) ** 2
            )
            required_vertical = math.sqrt(
                max(0.0, MINIMUM_FOOT_CLEARANCE**2 - horizontal_squared)
            )
            desired_world.z = max(
                desired_world.z,
                support_world.z + required_vertical + CLEARANCE_MARGIN,
            )
        # Mixamo ankle bones are not guaranteed to start exactly on the lower
        # leg's tail. The IK target therefore follows the captured tail plus the
        # desired ankle delta, preserving that authored skeleton offset.
        source_tail_world = armature.matrix_world @ crossing_lower.tail
        desired_tail_world = source_tail_world + (desired_world - crossing_world)
        left_tail_world = armature.matrix_world @ required_pose_bone(
            armature, LEFT_LEG_NAMES
        ).tail
        right_tail_world = armature.matrix_world @ required_pose_bone(
            armature, RIGHT_LEG_NAMES
        ).tail
        if crossing_side == "left":
            left_tail_world = desired_tail_world
        else:
            right_tail_world = desired_tail_world
        inverse_world = armature.matrix_world.inverted()
        targets["left"].append(inverse_world @ left_tail_world)
        targets["right"].append(inverse_world @ right_tail_world)
        frame_kinematics.append(
            {
                "left": {
                    "hip": world_head(
                        armature, required_pose_bone(armature, LEFT_UP_LEG_NAMES)
                    ),
                    "knee": world_head(
                        armature, required_pose_bone(armature, LEFT_LEG_NAMES)
                    ),
                    "ankle": left_tail_world.copy(),
                },
                "right": {
                    "hip": world_head(
                        armature, required_pose_bone(armature, RIGHT_UP_LEG_NAMES)
                    ),
                    "knee": world_head(
                        armature, required_pose_bone(armature, RIGHT_LEG_NAMES)
                    ),
                    "ankle": right_tail_world.copy(),
                },
            }
        )

        left_contact = (
            left_world.z <= source_height_ranges["left"][0] + CONTACT_BAND
        )
        right_contact = (
            right_world.z <= source_height_ranges["right"][0] + CONTACT_BAND
        )
        if left_contact and not right_contact:
            support_x = left_world.x
        elif right_contact and not left_contact:
            support_x = right_world.x
        elif left_contact and right_contact:
            support_x = (left_world.x + right_world.x) * 0.5
        else:
            support_x = left_world.x if left_world.z < right_world.z else right_world.x
        support_positions.append(float(support_x))
        base_pelvis_positions.append(float(world_head(armature, hips).x))
        authored_depth.append(float(desired_depth * role))

    linear_pelvis = [
        base_pelvis_positions[0]
        + (base_pelvis_positions[-1] - base_pelvis_positions[0])
        * index
        / (len(base_pelvis_positions) - 1)
        for index in range(len(base_pelvis_positions))
    ]
    desired_sway = smooth_loop(
        [
            support_x - line_x
            for support_x, line_x in zip(support_positions, linear_pelvis)
        ],
        PELVIS_SMOOTHING_PASSES,
    )
    mean_sway = sum(desired_sway) / len(desired_sway)
    desired_sway = [sway - mean_sway for sway in desired_sway]
    shift_range = max(desired_sway) - min(desired_sway)
    if shift_range < 1e-4:
        raise RuntimeError("The source support schedule produced no pelvis transfer")
    desired_sway = [
        sway * TARGET_PELVIS_SWAY / shift_range for sway in desired_sway
    ]
    pelvis_shifts = [
        line_x + sway_x - base_x
        for line_x, sway_x, base_x in zip(
            linear_pelvis, desired_sway, base_pelvis_positions
        )
    ]
    solved_knees = collision_safe_knees(
        frame_kinematics, pelvis_shifts, source_leg_lengths
    )
    inverse_world = armature.matrix_world.inverted()
    pole_targets = {
        side: [
            inverse_world
            @ pole_from_knee(
                frame[side]["hip"] + Vector((pelvis_shifts[index], 0.0, 0.0)),
                frame[side]["ankle"],
                solved_knees[side][index],
            )
            for index, frame in enumerate(frame_kinematics)
        ]
        for side in ("left", "right")
    }
    return (
        targets,
        pole_targets,
        pelvis_shifts,
        authored_depth,
        root_positions,
        cycle_travel,
    )


def configure_linear_interpolation(action: bpy.types.Action) -> None:
    if hasattr(action, "fcurves"):
        curves = action.fcurves
    else:
        curves = (
            curve
            for layer in action.layers
            for strip in layer.strips
            for channelbag in strip.channelbags
            for curve in channelbag.fcurves
        )
    for curve in curves:
        for keyframe in curve.keyframe_points:
            keyframe.interpolation = "LINEAR"


def segment_separation(a0, a1, b0, b1) -> float:
    u = a1 - a0
    v = b1 - b0
    w = a0 - b0
    a = u.dot(u)
    b = u.dot(v)
    c = v.dot(v)
    d = u.dot(w)
    e = v.dot(w)
    denominator = a * c - b * b
    s_numerator = denominator
    s_denominator = denominator
    t_numerator = denominator
    t_denominator = denominator

    if denominator < 1e-9:
        s_numerator = 0.0
        s_denominator = 1.0
        t_numerator = e
        t_denominator = c
    else:
        s_numerator = b * e - c * d
        t_numerator = a * e - b * d
        if s_numerator < 0.0:
            s_numerator = 0.0
            t_numerator = e
            t_denominator = c
        elif s_numerator > s_denominator:
            s_numerator = s_denominator
            t_numerator = e + b
            t_denominator = c

    if t_numerator < 0.0:
        t_numerator = 0.0
        if -d < 0.0:
            s_numerator = 0.0
        elif -d > a:
            s_numerator = s_denominator
        else:
            s_numerator = -d
            s_denominator = a
    elif t_numerator > t_denominator:
        t_numerator = t_denominator
        if -d + b < 0.0:
            s_numerator = 0.0
        elif -d + b > a:
            s_numerator = s_denominator
        else:
            s_numerator = -d + b
            s_denominator = a

    s = 0.0 if abs(s_numerator) < 1e-9 else s_numerator / s_denominator
    t = 0.0 if abs(t_numerator) < 1e-9 else t_numerator / t_denominator
    return (w + s * u - t * v).length


def leg_segment_separation(armature: bpy.types.Object) -> tuple[float, str]:
    left_upper = required_pose_bone(armature, LEFT_UP_LEG_NAMES)
    left_lower = required_pose_bone(armature, LEFT_LEG_NAMES)
    left_foot = required_pose_bone(armature, LEFT_FOOT_NAMES)
    right_upper = required_pose_bone(armature, RIGHT_UP_LEG_NAMES)
    right_lower = required_pose_bone(armature, RIGHT_LEG_NAMES)
    right_foot = required_pose_bone(armature, RIGHT_FOOT_NAMES)
    left_segments = (
        (world_head(armature, left_upper), world_head(armature, left_lower)),
        (world_head(armature, left_lower), world_head(armature, left_foot)),
    )
    right_segments = (
        (world_head(armature, right_upper), world_head(armature, right_lower)),
        (world_head(armature, right_lower), world_head(armature, right_foot)),
    )
    candidates = [
        (
            segment_separation(left_start, left_end, right_start, right_end),
            f"left {left_index} / right {right_index}",
        )
        for left_index, (left_start, left_end) in enumerate(left_segments)
        for right_index, (right_start, right_end) in enumerate(right_segments)
    ]
    return min(candidates, key=lambda candidate: candidate[0])


def validate_bake(
    armature: bpy.types.Object,
    crossing_side: str,
    source_height_maximum: dict[str, float],
    source_leg_lengths: dict[str, float],
) -> dict[str, object]:
    left_foot = required_pose_bone(armature, LEFT_FOOT_NAMES)
    right_foot = required_pose_bone(armature, RIGHT_FOOT_NAMES)
    depths = []
    clearance = []
    foot_pairs = []
    height_ranges = {
        "left": [float("inf"), float("-inf")],
        "right": [float("inf"), float("-inf")],
    }
    maximum_length_error = 0.0
    minimum_leg_clearance = float("inf")
    minimum_leg_clearance_at = (0.0, "")
    minimum_keyed_leg_clearance = float("inf")
    pelvis_positions = []
    sampled_frames = list(range(OUTPUT_FRAMES))
    for sampled_frame in sampled_frames:
        whole_frame = int(sampled_frame)
        bpy.context.scene.frame_set(
            whole_frame,
            subframe=sampled_frame - whole_frame,
        )
        bpy.context.view_layer.update()
        left_world = world_foot(armature, left_foot)
        right_world = world_foot(armature, right_foot)
        crossing_world = left_world if crossing_side == "left" else right_world
        support_world = right_world if crossing_side == "left" else left_world
        depths.append(float(crossing_world.y - support_world.y))
        clearance.append(float((left_world - right_world).length))
        foot_pairs.append((left_world.copy(), right_world.copy()))
        pelvis_positions.append(float(world_head(armature, required_pose_bone(armature, HIP_NAMES)).x))
        leg_clearance, leg_pair = leg_segment_separation(armature)
        if leg_clearance < minimum_leg_clearance:
            minimum_leg_clearance = leg_clearance
            minimum_leg_clearance_at = (sampled_frame, leg_pair)
        if int(round(sampled_frame)) % BAKE_SUBSTEPS == 0:
            minimum_keyed_leg_clearance = min(
                minimum_keyed_leg_clearance, leg_clearance
            )
        for side, foot in (("left", left_world), ("right", right_world)):
            height_ranges[side][0] = min(height_ranges[side][0], float(foot.z))
            height_ranges[side][1] = max(height_ranges[side][1], float(foot.z))
        current_lengths = leg_lengths(armature)
        for name, reference in source_leg_lengths.items():
            maximum_length_error = max(
                maximum_length_error,
                abs(current_lengths[name] - reference),
            )

    if min(depths) > -MINIMUM_CROSS_DEPTH + 0.005:
        raise RuntimeError(f"{crossing_side} clip never reaches its back crossover")
    if max(depths) < MINIMUM_CROSS_DEPTH - 0.005:
        raise RuntimeError(f"{crossing_side} clip never reaches its front crossover")
    minimum_clearance = min(clearance)
    if minimum_clearance < MINIMUM_FOOT_CLEARANCE:
        minimum_index = clearance.index(minimum_clearance)
        minimum_frame = sampled_frames[minimum_index]
        left_world, right_world = foot_pairs[minimum_index]
        raise RuntimeError(
            f"{crossing_side} foot clearance collapsed to {minimum_clearance:.3f}m "
            f"at frame {minimum_frame:.2f}; depth was {depths[minimum_index]:.3f}m; "
            f"left={tuple(round(value, 3) for value in left_world)}, "
            f"right={tuple(round(value, 3) for value in right_world)}"
        )
    if minimum_leg_clearance < MINIMUM_LEG_CLEARANCE:
        raise RuntimeError(
            f"{crossing_side} leg clearance collapsed to "
            f"{minimum_leg_clearance:.3f}m at frame "
            f"{minimum_leg_clearance_at[0]:.2f} "
            f"({minimum_leg_clearance_at[1]}); keyed minimum was "
            f"{minimum_keyed_leg_clearance:.3f}m"
        )
    for side in ("left", "right"):
        allowed = source_height_maximum[side] + MAXIMUM_EXTRA_FOOT_HEIGHT
        if height_ranges[side][1] > allowed:
            raise RuntimeError(
                f"{side} foot rose to {height_ranges[side][1]:.3f}m; "
                f"source maximum was {source_height_maximum[side]:.3f}m"
            )
    if maximum_length_error > MAXIMUM_LEG_LENGTH_ERROR:
        raise RuntimeError(
            f"Leg length drifted by {maximum_length_error:.6f}m during bake"
        )

    first_pelvis = pelvis_positions[0]
    last_pelvis = pelvis_positions[-1]
    pelvis_sway = [
        position
        - (
            first_pelvis
            + (last_pelvis - first_pelvis) * index / (len(pelvis_positions) - 1)
        )
        for index, position in enumerate(pelvis_positions)
    ]
    pelvis_sway_amplitude = max(pelvis_sway) - min(pelvis_sway)

    floor = min(
        min(left.z, right.z) for left, right in foot_pairs
    )
    over_support = 0
    single_support = 0
    for pelvis_x, (left, right) in zip(pelvis_positions, foot_pairs):
        left_contact = left.z <= floor + CONTACT_BAND
        right_contact = right.z <= floor + CONTACT_BAND
        if left_contact == right_contact:
            continue
        single_support += 1
        support = left if left_contact else right
        if abs(pelvis_x - support.x) <= OVER_SUPPORT_DISTANCE:
            over_support += 1
    over_support_fraction = over_support / single_support if single_support else 0.0
    if over_support_fraction < MINIMUM_OVER_SUPPORT_FRACTION:
        raise RuntimeError(
            f"{crossing_side} pelvis is over its support foot only "
            f"{over_support_fraction:.0%} of single support"
        )
    return {
        "depthMinimum": round(min(depths), 6),
        "depthMaximum": round(max(depths), 6),
        "minimumFootClearance": round(minimum_clearance, 6),
        "minimumLegClearance": round(minimum_leg_clearance, 6),
        "pelvisSwayAmplitude": round(pelvis_sway_amplitude, 6),
        "overSupportFraction": round(over_support_fraction, 6),
        "heightRanges": {
            side: [round(value, 6) for value in height_ranges[side]]
            for side in ("left", "right")
        },
        "maximumLegLengthError": round(maximum_length_error, 9),
    }


def bake_clip(config: dict[str, str]) -> dict[str, object]:
    source_path = os.path.join(SOURCE_DIR, config["source"])
    if not os.path.exists(source_path):
        raise FileNotFoundError(source_path)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FRAME_RATE
    # FBX time modes can leave Blender with a non-unit fps_base. The original
    # grapevine bake inherited 4 here, so 253 keys advertised as 120 Hz were
    # exported as an 8.4-second clip (30 effective samples/second). That made
    # the gait four times too slow and made every target rig solve 1,009 dense
    # retarget samples instead of the authored 253.
    bpy.context.scene.render.fps_base = 1.0
    bpy.context.scene.frame_start = 0
    bpy.context.scene.frame_end = OUTPUT_FRAMES - 1
    bpy.ops.import_scene.fbx(filepath=source_path)
    # The importer may restore the source file's time-base after the scene was
    # configured, so establish the export clock again after import.
    bpy.context.scene.render.fps = FRAME_RATE
    bpy.context.scene.render.fps_base = 1.0
    armature = next(
        (obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"),
        None,
    )
    if armature is None or armature.animation_data is None:
        raise RuntimeError("No animated armature found in the source FBX")

    ordered, samples, source_height_ranges, source_leg_lengths = sample_source(armature)
    (
        targets,
        pole_targets,
        pelvis_shifts,
        authored_depth,
        root_positions,
        cycle_travel,
    ) = make_bake_plan(
        armature,
        ordered,
        samples,
        config["crossing_side"],
        source_height_ranges,
        source_leg_lengths,
    )
    hips = required_pose_bone(armature, HIP_NAMES)
    source_action = armature.animation_data.action
    armature.animation_data.action = None
    if source_action is not None:
        bpy.data.actions.remove(source_action)
    action = bpy.data.actions.new(config["name"])
    armature.animation_data.action = action

    targets_by_side = {}
    poles_by_side = {}
    for side in ("left", "right"):
        target = bpy.data.objects.new(f"{config['name']}-{side}-foot-target", None)
        bpy.context.scene.collection.objects.link(target)
        target.parent = armature
        target.matrix_parent_inverse = Matrix.Identity(4)
        targets_by_side[side] = target
        pole = bpy.data.objects.new(f"{config['name']}-{side}-knee-pole", None)
        bpy.context.scene.collection.objects.link(pole)
        pole.parent = armature
        pole.matrix_parent_inverse = Matrix.Identity(4)
        poles_by_side[side] = pole
    world_scale_x = abs(armature.matrix_world.to_scale().x)
    if world_scale_x < 1e-6:
        raise RuntimeError("The source armature has no usable world scale")
    for output_frame in range(OUTPUT_FRAMES):
        apply_interpolated_basis(ordered, samples, output_frame)
        hips.location.x = (
            root_positions[output_frame]
            + pelvis_shifts[output_frame] / world_scale_x
        )
        key_current_basis(ordered, output_frame)
        for side, target in targets_by_side.items():
            target.location = targets[side][output_frame]
            target.keyframe_insert("location", frame=output_frame)
            pole = poles_by_side[side]
            pole.location = pole_targets[side][output_frame]
            pole.keyframe_insert("location", frame=output_frame)

    for side in ("left", "right"):
        lower = required_pose_bone(
            armature, LEFT_LEG_NAMES if side == "left" else RIGHT_LEG_NAMES
        )
        upper = required_pose_bone(
            armature, LEFT_UP_LEG_NAMES if side == "left" else RIGHT_UP_LEG_NAMES
        )
        constraint = lower.constraints.new("IK")
        constraint.name = "GrapevineBake"
        constraint.target = targets_by_side[side]
        constraint.pole_target = poles_by_side[side]
        constraint.pole_angle = math.pi / 2
        constraint.chain_count = 2
        constraint.use_tail = True
        constraint.use_rotation = False
        if hasattr(constraint, "use_stretch"):
            constraint.use_stretch = False
        upper.ik_stretch = 0.0
        lower.ik_stretch = 0.0

    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.context.scene.frame_set(0)
    bpy.ops.nla.bake(
        frame_start=0,
        frame_end=OUTPUT_FRAMES - 1,
        step=1,
        only_selected=False,
        visual_keying=True,
        clear_constraints=True,
        clear_parents=False,
        use_current_action=True,
        clean_curves=False,
        bake_types={"POSE"},
    )
    configure_linear_interpolation(action)
    for target in targets_by_side.values():
        bpy.data.objects.remove(target, do_unlink=True)
    for pole in poles_by_side.values():
        bpy.data.objects.remove(pole, do_unlink=True)
    bpy.context.scene.frame_set(0)
    bpy.context.view_layer.update()

    measured = validate_bake(
        armature,
        config["crossing_side"],
        {side: values[1] for side, values in source_height_ranges.items()},
        source_leg_lengths,
    )
    output_path = os.path.join(SCRIPT_DIR, f"{config['name']}.glb")
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format="GLB",
        export_animations=True,
        export_skins=True,
    )
    return {
        "asset": {
            "file": os.path.basename(output_path),
            "sha256": source_sha256(output_path),
        },
        "source": {
            "file": config["source"],
            "sha256": source_sha256(source_path),
            "provider": "Adobe Mixamo",
            "motionId": None,
            "motionIdStatus": "not preserved in the original 2026-04-04 import",
            "license": "https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html",
        },
        "crossingSide": config["crossing_side"],
        "cycleTravelMeters": round(cycle_travel / 100, 6),
        "authoredDepthMinimum": round(min(authored_depth), 6),
        "authoredDepthMaximum": round(max(authored_depth), 6),
        "measured": measured,
    }


def write_metadata(clips: dict[str, object]) -> None:
    metadata = {
        "version": 1,
        "clipFamily": "grapevine",
        "authoring": {
            "sourceFrameRate": SOURCE_FRAME_RATE,
            "frameRate": FRAME_RATE,
            "frameCount": OUTPUT_FRAMES,
            "stepsPerLoop": 4,
            "phaseSourceFrames": list(PHASE_FRAMES),
            "crossingRoles": ["back crossover", "front crossover"],
            "minimumCrossDepthMeters": MINIMUM_CROSS_DEPTH,
            "minimumFootClearanceMeters": MINIMUM_FOOT_CLEARANCE,
            "minimumLegClearanceMeters": MINIMUM_LEG_CLEARANCE,
            "targetPelvisSwayMeters": TARGET_PELVIS_SWAY,
            "minimumOverSupportFraction": MINIMUM_OVER_SUPPORT_FRACTION,
            "runtimeOwner": "@austencloud/scene-3d LocomotionAnimator",
            "contactCorrectionOwner": "@austencloud/scene-3d FootPlanter",
            "method": (
                "offline Blender 120Hz visual constraint bake with "
                "collision-safe knee search"
            ),
        },
        "clips": clips,
    }
    with open(
        os.path.join(SCRIPT_DIR, "grapevine.motion.json"),
        "w",
        encoding="utf-8",
    ) as metadata_file:
        json.dump(metadata, metadata_file, indent=2)
        metadata_file.write("\n")


def main() -> None:
    results = {}
    for config in CLIPS:
        results[config["name"]] = bake_clip(config)
    write_metadata(results)
    for name, result in results.items():
        measured = result["measured"]
        print(
            f"Built {name}: {OUTPUT_FRAMES} frames, four steps, "
            f"depth {measured['depthMinimum']:.3f}..{measured['depthMaximum']:.3f}m, "
            f"foot clearance {measured['minimumFootClearance']:.3f}m, "
            f"leg clearance {measured['minimumLegClearance']:.3f}m, "
            f"pelvis sway {measured['pelvisSwayAmplitude']:.3f}m"
        )


if __name__ == "__main__":
    main()
