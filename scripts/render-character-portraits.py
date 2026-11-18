"""
Blender (headless) portrait renderer for the character picker tiles.

    blender --factory-startup --background --python scripts/render-character-portraits.py -- \
        --input <dir of id.glb> --output <dir for id.png> [--width 600] [--height 800]

One upright bust portrait per body: arms lowered from the T-pose so the
shoulders sit naturally, a perspective lens a little off the front, a warm
key light with a cool edge light behind, on transparent film so the tile
supplies the backdrop. `scripts/build-character-portraits.mjs` drives this and
turns the PNGs into the WebP files the picker loads.
"""

import math
import os
import re
import sys

import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


input_dir = arg("--input")
output_dir = arg("--output")
width = int(arg("--width", "600"))
height = int(arg("--height", "800"))
if not input_dir or not output_dir:
    raise SystemExit("--input and --output are required")
os.makedirs(output_dir, exist_ok=True)

# How far below level the upper arms hang. A full drop to the sides pinches the
# shoulder skin on most of these rigs; this reads as relaxed and stays clean.
ARM_DROP_DEGREES = 58.0
# The bodies face -Y. The camera sits in front, turned a little to one side so
# a face has some shape, level with the eyes.
CAMERA_YAW_DEGREES = 16.0
LENS_MM = 85.0
# The frame, in body heights: from just above the crown down to mid-chest.
FRAME_SPAN = 0.4
FRAME_HEADROOM = 0.035


def import_body(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    objects = list(bpy.context.scene.objects)
    armatures = [o for o in objects if o.type == "ARMATURE"]
    armature = armatures[0] if armatures else None
    # The importer adds an unskinned helper sphere two metres across to draw
    # bones with; it would stretch the measured height and sit in the shot.
    meshes = []
    for o in objects:
        if o.type != "MESH":
            continue
        if armature is None or any(m.type == "ARMATURE" for m in o.modifiers):
            meshes.append(o)
        else:
            bpy.data.objects.remove(o, do_unlink=True)
    # A body exported with a clip plays it at render time and undoes the pose.
    if armature is not None:
        armature.animation_data_clear()
    return meshes, armature


def rest_bounds(meshes):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in meshes:
        for corner in o.bound_box:
            p = o.matrix_world @ Vector(corner)
            for k in range(3):
                lo[k] = min(lo[k], p[k])
                hi[k] = max(hi[k], p[k])
    return lo, hi


def bone_named(armature, pattern):
    for bone in armature.pose.bones:
        if re.search(pattern, bone.name):
            return bone
    return None


def lower_arms(armature):
    """Swing each upper arm down about its shoulder, whatever pose it starts in."""
    world = armature.matrix_world
    for side in ("Left", "Right"):
        bone = bone_named(armature, side + r"Arm$")
        if bone is None:
            continue
        pose = world @ bone.matrix
        head = pose.translation.copy()
        tail = world @ bone.tail
        along = (tail - head).normalized()
        level = Vector((along.x, along.y, 0.0))
        if level.length < 1e-4:
            continue
        level.normalize()
        drop = math.radians(ARM_DROP_DEGREES)
        target = (level * math.cos(drop) + Vector((0, 0, -1)) * math.sin(drop)).normalized()
        swing = along.rotation_difference(target).to_matrix().to_4x4()
        moved = Matrix.Translation(head) @ swing @ Matrix.Translation(-head) @ pose
        bone.matrix = world.inverted() @ moved
        bpy.context.view_layer.update()


def head_point(armature, lo, hi):
    """Where the neck meets the head, in world space; the frame centres on it."""
    body_height = hi.z - lo.z
    if armature is not None:
        bone = bone_named(armature, r"Head$")
        if bone is not None:
            return armature.matrix_world @ bone.head
    return Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, hi.z - body_height * 0.12))


def add_camera(head, lo, hi):
    body_height = hi.z - lo.z
    span = body_height * FRAME_SPAN
    top = hi.z + body_height * FRAME_HEADROOM
    aim = Vector((head.x, head.y, top - span / 2))

    data = bpy.data.cameras.new("PortraitCamera")
    data.lens = LENS_MM
    data.sensor_fit = "VERTICAL"
    data.sensor_height = 36.0
    half_view = math.atan(18.0 / LENS_MM)
    distance = (span / 2) / math.tan(half_view)
    data.clip_start = 0.01
    data.clip_end = distance * 6

    yaw = math.radians(CAMERA_YAW_DEGREES)
    offset = Vector((math.sin(yaw), -math.cos(yaw), 0.0)) * distance
    camera = bpy.data.objects.new("PortraitCamera", data)
    camera.location = aim + offset
    camera.rotation_euler = (aim - camera.location).normalized().to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(camera)
    bpy.context.scene.camera = camera
    return aim, distance


def add_lights(aim, distance):
    world = bpy.data.worlds.new("PortraitWorld")
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background:
        background.inputs[0].default_value = (0.82, 0.88, 1.0, 1.0)
        background.inputs[1].default_value = 0.3
    bpy.context.scene.world = world

    def light(name, offset, watts, colour, size):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = watts
        data.color = colour
        data.size = size
        obj = bpy.data.objects.new(name, data)
        obj.location = aim + Vector(offset) * distance
        obj.rotation_euler = (aim - obj.location).normalized().to_track_quat("-Z", "Y").to_euler()
        bpy.context.scene.collection.objects.link(obj)

    # Offsets are in camera distances from the aim point; the body faces -Y.
    light("Key", (-0.75, -0.95, 0.55), 62, (1.0, 0.95, 0.88), 1.1)
    light("Fill", (0.95, -0.7, 0.05), 16, (0.86, 0.92, 1.0), 1.8)
    light("EdgeLeft", (-0.8, 0.9, 0.5), 90, (0.8, 0.9, 1.0), 0.7)
    light("EdgeRight", (0.85, 0.85, 0.65), 110, (0.86, 0.93, 1.0), 0.7)


def setup_render(out_path):
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = True
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    # The default view transform flattens skin and cloth toward grey.
    scene.view_settings.view_transform = "Standard"
    try:
        scene.eevee.taa_render_samples = 96
    except Exception:
        pass
    scene.render.filepath = out_path


def render_one(glb_path, out_path):
    meshes, armature = import_body(glb_path)
    if not meshes:
        print(f"  SKIP (no mesh): {glb_path}")
        return False
    lo, hi = rest_bounds(meshes)
    if armature is not None:
        lower_arms(armature)
    head = head_point(armature, lo, hi)
    aim, distance = add_camera(head, lo, hi)
    add_lights(aim, distance)
    setup_render(out_path)
    bpy.ops.render.render(write_still=True)
    print(f"  OK: {out_path}")
    return True


def main():
    names = sorted(f for f in os.listdir(input_dir) if f.lower().endswith(".glb"))
    print(f"Rendering {len(names)} character portraits from {input_dir}")
    done = 0
    for name in names:
        out_path = os.path.join(output_dir, os.path.splitext(name)[0] + ".png")
        try:
            if render_one(os.path.join(input_dir, name), out_path):
                done += 1
        except Exception as error:  # one bad body must not stop the batch
            print(f"  FAIL {name}: {error}")
    print(f"Done: {done}/{len(names)} rendered")


main()
