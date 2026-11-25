"""Convert one Mixamo archive FBX into a locomotion-pack GLB.

Run from the repository worktree, passing the download path as an argument:

    blender --background --factory-startup \
      --python static/animations/locomotion-pack/build-mixamo-archive-clip.py -- \
      --src <path/to/Clip.fbx> --out static/animations/locomotion-pack/<name>.glb \
      --action <name> [--mirror]

The clip keeps its authored travel, exactly as `convert.py` does for the pack's
other Mixamo clips: the animator reads its native speed from that travel.

`--mirror` swaps the character's left and right side. Each bone takes its
partner's motion relative to the rest pose, reflected through the character's
sagittal plane, so a sidestep to the right becomes the same sidestep to the
left. The source file is only read; nothing inside its folder is executed.
"""

import argparse
import hashlib
import math
import sys

import bpy
from mathutils import Matrix, Vector


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--src", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--action", required=True)
    parser.add_argument("--mirror", action="store_true")
    parser.add_argument(
        "--swing-clearance",
        type=float,
        default=0.0,
        help="Lift each moving foot until its ankle rises at least this many metres above its planted height.",
    )
    return parser.parse_args(argv)


def partner_name(name: str) -> str:
    if "Left" in name:
        return name.replace("Left", "Right")
    if "Right" in name:
        return name.replace("Right", "Left")
    return name


def bone_depth(bone) -> int:
    depth = 0
    while bone.parent is not None:
        bone = bone.parent
        depth += 1
    return depth


def mirror_action(armature: bpy.types.Object, frame_start: int, frame_end: int):
    scene = bpy.context.scene
    # The character's left-right axis, in armature space.
    lateral = (armature.matrix_world.inverted().to_3x3() @ Vector((1.0, 0.0, 0.0))).normalized()
    reflect = Matrix.Identity(4)
    for row in range(3):
        for col in range(3):
            reflect[row][col] -= 2.0 * lateral[row] * lateral[col]

    pose_bones = sorted(armature.pose.bones, key=lambda pb: bone_depth(pb.bone))
    rest = {pb.name: pb.bone.matrix_local.copy() for pb in pose_bones}

    # Sample every frame's armature-space pose first.
    sampled = []
    for frame in range(frame_start, frame_end + 1):
        scene.frame_set(frame)
        sampled.append({pb.name: pb.matrix.copy() for pb in pose_bones})

    source_action = armature.animation_data.action
    mirrored = bpy.data.actions.new(source_action.name + "-mirrored")
    armature.animation_data.action = mirrored
    for pb in pose_bones:
        pb.rotation_mode = "QUATERNION"

    for index, frame in enumerate(range(frame_start, frame_end + 1)):
        poses = sampled[index]
        for depth in sorted({bone_depth(pb.bone) for pb in pose_bones}):
            for pb in pose_bones:
                if bone_depth(pb.bone) != depth:
                    continue
                partner = partner_name(pb.name)
                if partner not in poses:
                    partner = pb.name
                delta = poses[partner] @ rest[partner].inverted()
                target = reflect @ delta @ reflect @ rest[pb.name]
                pb.matrix_basis = armature.convert_space(
                    pose_bone=pb, matrix=target, from_space="POSE", to_space="LOCAL"
                )
            bpy.context.view_layer.update()
        for pb in pose_bones:
            pb.keyframe_insert("location", frame=frame)
            pb.keyframe_insert("rotation_quaternion", frame=frame)
            pb.keyframe_insert("scale", frame=frame)
    bpy.data.actions.remove(source_action)
    return mirrored


def leg_bones(armature, side):
    def find(suffix):
        return next(pb for pb in armature.pose.bones if pb.name.endswith(side + suffix))

    return find("UpLeg"), find("Leg"), find("Foot")


def key_bone(pb, frame):
    pb.keyframe_insert("location", frame=frame)
    if pb.rotation_mode == "QUATERNION":
        pb.keyframe_insert("rotation_quaternion", frame=frame)
    else:
        pb.keyframe_insert("rotation_euler", frame=frame)


def lift_swings(armature, frame_start, frame_end, clearance):
    """Raise a foot that slides along the floor into a stepped swing.

    A foot counts as swinging while its ankle moves faster than 0.15 m/s
    across the floor. Over that window the ankle target rises by a sine of the
    distance covered, just enough that the swing peaks `clearance` above the
    foot's lowest height. Hip and knee are re-solved as a two-bone chain in the
    original knee plane; the foot keeps its authored orientation.
    """
    scene = bpy.context.scene
    fps = scene.render.fps
    to_world = armature.matrix_world.copy()
    to_arm = to_world.inverted()
    report = []
    for side in ("Left", "Right"):
        up, low, foot = leg_bones(armature, side)
        frames = list(range(frame_start, frame_end + 1))
        poses = []
        for frame in frames:
            scene.frame_set(frame)
            poses.append((up.matrix.copy(), low.matrix.copy(), foot.matrix.copy()))
        ankle_world = [to_world @ p[2].translation for p in poses]
        floor = min(a.z for a in ankle_world)
        # The clip is a loop whose last frame repeats the first one a cycle
        # further on, so swings are found on the cycle: a swing that runs
        # over the seam is one swing, not two.
        cycle = len(frames) - 1
        travel = to_world @ poses[cycle][0].translation - to_world @ poses[0][0].translation

        def ankle_at(i):
            turns, base = divmod(i, cycle)
            return ankle_world[base] + travel * turns

        def is_moving(i):
            step = ankle_at(i + 1) - ankle_at(i - 1)
            step.z = 0
            return step.length * fps / 2 > 0.15

        moving = [is_moving(i) for i in range(cycle)]
        lifts = [0.0] * len(frames)
        if all(moving) or not any(moving):
            starts = []
        else:
            starts = [i for i in range(cycle) if moving[i] and not moving[i - 1]]
        for first in starts:
            last = first
            while moving[(last + 1) % cycle]:
                last += 1
            path = [0.0]
            for n in range(first + 1, last + 1):
                d = ankle_at(n) - ankle_at(n - 1)
                d.z = 0
                path.append(path[-1] + d.length)
            total = path[-1] or 1.0
            rise = max(ankle_at(n).z for n in range(first, last + 1)) - floor
            amplitude = max(0.0, clearance - rise)
            for n in range(first, last + 1):
                lifts[n % cycle] = amplitude * math.sin(math.pi * path[n - first] / total) ** 0.6
            report.append(f"{side} frames {frames[first % cycle]}-{frames[last % cycle]} +{amplitude:.3f} m")
        lifts[cycle] = lifts[0]
        for index, frame in enumerate(frames):
            if lifts[index] <= 1e-5:
                continue
            # Parents must stand at this frame before a child's pose is set.
            scene.frame_set(frame)
            up_m, low_m, foot_m = poses[index]
            hip = up_m.translation.copy()
            knee = low_m.translation.copy()
            ankle = foot_m.translation.copy()
            target = ankle + to_arm.to_3x3() @ Vector((0.0, 0.0, lifts[index]))
            l1 = (knee - hip).length
            l2 = (ankle - knee).length
            reach = target - hip
            d = min(reach.length, (l1 + l2) * 0.999)
            u = reach.normalized()
            side_vec = (knee - hip) - u * (knee - hip).dot(u)
            if side_vec.length < 1e-6:
                continue
            v = side_vec.normalized()
            cos_a = max(-1.0, min(1.0, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)))
            new_knee = hip + l1 * (cos_a * u + math.sqrt(1 - cos_a * cos_a) * v)
            new_ankle = hip + u * d
            turn_up = (knee - hip).rotation_difference(new_knee - hip).to_matrix().to_4x4()
            m = turn_up @ Matrix.Translation(-hip) @ up_m
            m.translation = hip
            up.matrix = m
            bpy.context.view_layer.update()
            shin_before = (turn_up.to_3x3() @ (ankle - knee))
            turn_low = shin_before.rotation_difference(new_ankle - new_knee).to_matrix().to_4x4()
            m = turn_low @ turn_up @ Matrix.Translation(-knee) @ low_m
            m.translation = new_knee
            low.matrix = m
            bpy.context.view_layer.update()
            m = foot_m.copy()
            m.translation = new_ankle
            foot.matrix = m
            bpy.context.view_layer.update()
            for pb in (up, low, foot):
                key_bone(pb, frame)
    return report


def main():
    args = parse_args()
    with open(args.src, "rb") as handle:
        digest = hashlib.sha256(handle.read()).hexdigest()

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=args.src)
    armature = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
    action = armature.animation_data.action
    frame_start, frame_end = (int(round(v)) for v in action.frame_range)

    if args.mirror:
        action = mirror_action(armature, frame_start, frame_end)
    action.name = args.action
    if args.swing_clearance > 0:
        for line in lift_swings(armature, frame_start, frame_end, args.swing_clearance):
            print("LIFT", line)

    bpy.ops.export_scene.gltf(
        filepath=args.out,
        export_format="GLB",
        export_animations=True,
        export_skins=True,
    )
    print(
        f"BUILT {args.out} from {args.src} sha256 {digest} "
        f"frames {frame_start}-{frame_end} mirror {args.mirror}"
    )


main()
