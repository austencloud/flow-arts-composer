"""
Blender → PNG avatar thumbnail renderer for the TKA 3D viewer.

Batch-renders every <name>.glb in an input directory to <name>.png in an output
directory: clean front portrait, transparent film, even studio lighting. The
PerformerHubDetail avatar grid consumes the optimized .webp versions from R2.

Renders are square (default 512), figure framed head-near-top so the card's
`object-fit: cover; object-position: center top` crops to a head-and-torso
portrait. Mixamo characters import in T-pose facing -Y in Blender space, so the
camera sits on -Y looking toward +Y (overridable with --front-axis).

Usage (invoked by scripts/characters/character-tools.mjs):
  blender --background --python scripts/render-avatar-thumbnails.py -- \
    --input <glb_dir> --output <png_dir> [--size 512] [--front-axis -y|+y|-x|+x]
"""
import bpy
import os
import sys
import math
from mathutils import Vector

# ── Parse args after "--" ──────────────────────────────────────────────────
argv = sys.argv
argv = argv[argv.index("--") + 1:] if "--" in argv else []

input_dir = None
output_dir = None
size = 512
front_axis = "-y"

i = 0
while i < len(argv):
    if argv[i] == "--input" and i + 1 < len(argv):
        input_dir = argv[i + 1]; i += 2
    elif argv[i] == "--output" and i + 1 < len(argv):
        output_dir = argv[i + 1]; i += 2
    elif argv[i] == "--size" and i + 1 < len(argv):
        size = int(argv[i + 1]); i += 2
    elif argv[i] == "--front-axis" and i + 1 < len(argv):
        front_axis = argv[i + 1]; i += 2
    else:
        i += 1

if not input_dir or not output_dir:
    print("ERROR: --input and --output are required")
    sys.exit(1)

os.makedirs(output_dir, exist_ok=True)

AXIS_DIR = {
    "-y": Vector((0, -1, 0)),
    "+y": Vector((0, 1, 0)),
    "-x": Vector((-1, 0, 0)),
    "+x": Vector((1, 0, 0)),
}


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_glb(path):
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.context.scene.objects if o.type == "MESH"]


def world_bbox(meshes):
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    for o in meshes:
        for corner in o.bound_box:
            wc = o.matrix_world @ Vector(corner)
            for k in range(3):
                mins[k] = min(mins[k], wc[k])
                maxs[k] = max(maxs[k], wc[k])
    return mins, maxs


def setup_camera(mins, maxs):
    center = (mins + maxs) * 0.5
    height = maxs.z - mins.z

    cam_data = bpy.data.cameras.new("ThumbCam")
    cam_data.type = "ORTHO"
    # Head-and-shoulders portrait: most distinguishing at small card sizes, and
    # it crops out the T-pose arm-span. Frame the top ~45% of the figure.
    cam_data.ortho_scale = height * 0.46
    dist = height * 3.0
    cam_data.clip_start = 0.001
    cam_data.clip_end = dist * 3.0
    cam = bpy.data.objects.new("ThumbCam", cam_data)
    bpy.context.scene.collection.objects.link(cam)

    direction = AXIS_DIR[front_axis].normalized()
    # Aim at the face/neck (just below the crown), eye-level (no downward tilt),
    # so the head sits near the top of the square portrait.
    target = Vector((center.x, center.y, maxs.z - height * 0.15))
    cam.location = target + direction * dist

    to_target = (target - cam.location).normalized()
    cam.rotation_euler = to_target.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam


def setup_lighting():
    # Three-point-ish: bright world fill + key + rim, so both untextured robots
    # (x-bot/y-bot) and textured humans read cleanly on transparent film.
    world = bpy.data.worlds.new("ThumbWorld")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (1, 1, 1, 1)
        bg.inputs[1].default_value = 0.7
    bpy.context.scene.world = world

    def add_light(name, loc, energy, kind="AREA", size=4.0):
        ld = bpy.data.lights.new(name, kind)
        ld.energy = energy
        if kind == "AREA":
            ld.size = size
        lo = bpy.data.objects.new(name, ld)
        lo.location = loc
        bpy.context.scene.collection.objects.link(lo)
        # Point lights at origin-ish.
        d = (Vector((0, 0, 1.0)) - Vector(loc)).normalized()
        lo.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        return lo

    add_light("Key", (-2.5, -3.0, 3.0), 800)
    add_light("Fill", (3.0, -2.0, 1.5), 350)
    add_light("Rim", (0.0, 3.5, 3.5), 500)


def setup_render():
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = True
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    try:
        scene.eevee.taa_render_samples = 64
    except Exception:
        pass


def render_one(glb_path, out_path):
    clear_scene()
    meshes = import_glb(glb_path)
    if not meshes:
        print(f"  SKIP (no mesh): {glb_path}")
        return False
    mins, maxs = world_bbox(meshes)
    setup_camera(mins, maxs)
    setup_lighting()
    setup_render()
    bpy.context.scene.render.filepath = out_path
    bpy.ops.render.render(write_still=True)
    print(f"  OK: {out_path}")
    return True


def main():
    glbs = sorted(f for f in os.listdir(input_dir) if f.lower().endswith(".glb"))
    print(f"Rendering {len(glbs)} avatar thumbnails from {input_dir}")
    ok = 0
    for f in glbs:
        name = os.path.splitext(f)[0]
        out_path = os.path.join(output_dir, f"{name}.png")
        try:
            if render_one(os.path.join(input_dir, f), out_path):
                ok += 1
        except Exception as e:
            print(f"  FAIL {f}: {e}")
    print(f"Done: {ok}/{len(glbs)} rendered")


main()
