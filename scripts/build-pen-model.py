"""Build the production pen prop, its picker preview, and proof renders.

static/models/props/pen.glb is the same pen pen.svg draws: every station comes
from scripts/pen-stations.json, which scripts/build-pen-svg.py writes from the
reference photo's measurements. Re-run that first if the table is stale.

The stations describe a real 142mm pen, but at that size a pen vanishes
inside a performer's fist. So the model is a giant pen spun like a staff. It
is authored 900mm end to end like the stick and the fire staff, and Prop3D
stretches its long axis to the performer's staff length the same way. Across
the axis it is 3x a real pen: a 30mm barrel, the stick's grip diameter. That
makes it about twice as slender as the real thing, which keeps the hand
around it instead of buried in it.

Authored around the scene-3d hand pivot: long axis local Y, origin at the
pen's middle, cap (thumb end) at +Y, back plug (pinky end) at -Y. The clip
stands off the cap on +X.

Only the cap, the clip and the printed band carry the "Recolor" marker
prop-model-recolor.ts looks for, so only they take blue or red. The plug and
the barrel stay black.

Usage:
  blender --background --factory-startup --python scripts/build-pen-model.py
  blender --background --factory-startup --python scripts/build-pen-model.py -- \
    --render-dir <dir> --preview static/images/props/build-previews/pen.webp
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "static" / "models" / "props" / "pen.glb"
STATIONS = json.loads((ROOT / "scripts" / "pen-stations.json").read_text("utf-8"))

MM = 0.001
LENGTH = STATIONS["length_mm"]
HALF = LENGTH / 2
#: Staff-family models are authored at 900mm and stretched by Prop3D.
STAFF_LENGTH_MM = 900.0
AXIAL_SCALE = STAFF_LENGTH_MM / LENGTH
#: A 30mm barrel, the stick's grip diameter.
RADIAL_SCALE = 3.0
AUTHORED_LENGTH_M = STAFF_LENGTH_MM * MM
#: The pen's two ends are its tracked tips: nothing on it emits from inboard.
TRACKED_TIP_Y = AUTHORED_LENGTH_M / 2

SEGMENTS = 40

#: The build-preview tiles' background, sampled from the shipped
#: static/images/props/build-previews/*.webp.
PREVIEW_TILE_RGB = (8, 9, 17)


def axial(mm_from_back: float) -> float:
    """Millimetres from the back end to metres on local Y, centred."""
    return (mm_from_back - HALF) * MM


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--render-dir", type=Path)
    parser.add_argument("--preview", type=Path)
    return parser.parse_args(argv)


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for datablock in list(datablocks):
            datablocks.remove(datablock)


def activate(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def srgb_to_linear(hex_color: str) -> tuple[float, float, float, float]:
    def channel(value: int) -> float:
        c = value / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    h = hex_color.lstrip("#")
    return (channel(int(h[0:2], 16)), channel(int(h[2:4], 16)), channel(int(h[4:6], 16)), 1.0)


def make_material(name: str, hex_color: str, roughness: float, coat: float = 0.0) -> bpy.types.Material:
    color = srgb_to_linear(hex_color)
    result = bpy.data.materials.new(name)
    result.diffuse_color = color
    result.use_nodes = True
    principled = result.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = 0.0
    if "Coat Weight" in principled.inputs:
        principled.inputs["Coat Weight"].default_value = coat
    return result


def finish_mesh(obj: bpy.types.Object, material: bpy.types.Material) -> bpy.types.Object:
    activate(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.data.materials.clear()
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    try:
        bpy.ops.object.shade_auto_smooth(angle=math.radians(40))
        for modifier in list(obj.modifiers):
            if modifier.type == "NODES":
                bpy.ops.object.modifier_apply(modifier=modifier.name)
    except (AttributeError, RuntimeError, TypeError):
        pass
    # Nothing is textured, but glb-measure.cjs requires UVs on every primitive.
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.015)
    bpy.ops.object.mode_set(mode="OBJECT")
    return obj


def link(name: str, mesh: bpy.types.Mesh) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def lathe(name: str, sections: list[tuple[float, float]], material: bpy.types.Material) -> bpy.types.Object:
    """Closed tube of rings swept along local Y; each section is (y_m, radius_m)."""
    vertices = []
    for y, radius in sections:
        for column in range(SEGMENTS):
            angle = math.tau * column / SEGMENTS
            vertices.append((radius * math.cos(angle), y, radius * math.sin(angle)))
    faces = []
    for ring in range(len(sections) - 1):
        a, b = ring * SEGMENTS, (ring + 1) * SEGMENTS
        for column in range(SEGMENTS):
            nxt = (column + 1) % SEGMENTS
            faces.append((a + column, a + nxt, b + nxt, b + column))
    faces.append(tuple(reversed(range(SEGMENTS))))
    last = (len(sections) - 1) * SEGMENTS
    faces.append(tuple(last + column for column in range(SEGMENTS)))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    return finish_mesh(link(name, mesh), material)


def rounded_end(y_flat: float, y_end: float, radius: float, face_radius: float, steps: int = 8) -> list[tuple[float, float]]:
    """Quarter-round from a cylinder of `radius` to a flat face of `face_radius`."""
    out = []
    span = y_end - y_flat
    for index in range(1, steps + 1):
        t = index / steps
        angle = t * math.pi / 2
        out.append((y_flat + span * math.sin(angle), face_radius + (radius - face_radius) * math.cos(angle)))
    return out


def plug_sections() -> list[tuple[float, float]]:
    r = STATIONS["plug_d_mm"] / 2
    round_mm = STATIONS["plug_round_mm"]
    end = STATIONS["plug_end_mm"]
    # Back face first, rounded into the plug's wall; the groove sits a third of
    # the way along, where the photo shows a step.
    face_r = r - round_mm
    rows = [(0.0, face_r)]
    rows += [(round_mm - y, rr) for y, rr in reversed(rounded_end(0.0, round_mm, r, face_r)[:-1])]
    rows += [(round_mm, r), (3.0, r), (3.1, r - 0.18), (3.5, r - 0.18), (3.6, r), (end + 0.5, r)]
    return [(axial(y), rr * MM) for y, rr in rows]


def body_radius(mm: float) -> float:
    start, end = STATIONS["plug_end_mm"], STATIONS["cap_start_mm"]
    r0, r1 = STATIONS["body_d_mm"] / 2, STATIONS["body_d_at_cap_mm"] / 2
    return r0 + (r1 - r0) * (mm - start) / (end - start)


def body_sections() -> list[tuple[float, float]]:
    start = STATIONS["plug_end_mm"]
    end = STATIONS["cap_start_mm"] + 2.0
    plug_r = STATIONS["plug_d_mm"] / 2
    rows = [(start, plug_r), (start + 0.3, body_radius(start) - 0.15), (start + 0.9, body_radius(start)), (end, body_radius(end))]
    return [(axial(y), rr * MM) for y, rr in rows]


def band_sections() -> list[tuple[float, float]]:
    a, b = STATIONS["band_mm"]
    lift = 0.02
    return [(axial(a), (body_radius(a) + lift) * MM), (axial(b), (body_radius(b) + lift) * MM)]


def cap_sections() -> list[tuple[float, float]]:
    start = STATIONS["cap_start_mm"]
    lip = STATIONS["cap_lip_mm"]
    lip_r = STATIONS["cap_lip_d_mm"] / 2
    r = STATIONS["cap_d_mm"] / 2
    round_mm = STATIONS["cap_end_round_mm"]
    face_r = STATIONS["cap_end_face_d_mm"] / 2
    rows = [
        (start, body_radius(start) + 0.05),
        (start + 0.05, lip_r),
        (start + lip - 0.4, lip_r),
        (start + lip, r),
        (LENGTH - round_mm, r),
    ]
    rows += rounded_end(LENGTH - round_mm, LENGTH, r, face_r)
    # A shallow dome across the end face, as the photo's cap end shows.
    rows += [(LENGTH + 0.25, face_r * 0.5), (LENGTH + 0.32, 0.2)]
    return [(axial(y), rr * MM) for y, rr in rows]


def band_tab(material: bpy.types.Material) -> bpy.types.Object:
    """The gray tab printed on the band: a curved patch a hair proud of it."""
    a, b = STATIONS["band_mm"]
    radius = (body_radius(a) + 0.05) * MM
    arc = (math.radians(70), math.radians(110))
    steps = 6
    vertices = []
    for y in (axial(a), axial(b)):
        for index in range(steps + 1):
            angle = arc[0] + (arc[1] - arc[0]) * index / steps
            vertices.append((radius * math.cos(angle), y, radius * math.sin(angle)))
    faces = [(i, i + 1, steps + 2 + i, steps + 1 + i) for i in range(steps)]
    mesh = bpy.data.meshes.new("TKA_Pen_Tab_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    return finish_mesh(link("TKA_Pen_Tab", mesh), material)


def clip(material: bpy.types.Material) -> bpy.types.Object:
    """The clip in side profile (axial mm, radial mm), extruded across its width.

    Free end curled at the cap's mouth, root sloping into the closed end, three
    grip ridges just before the root: the same outline pen.svg draws.
    """
    free, root = STATIONS["clip_mm"]
    cap_r = STATIONS["cap_d_mm"] / 2
    inner = cap_r + STATIONS["clip_gap_mm"]
    outer = inner + STATIONS["clip_thick_mm"]
    slope = root - 6.0
    pitch = 1.5
    ridge_start = slope - pitch * (STATIONS["clip_ridges"] + 0.5)

    outline: list[tuple[float, float]] = [
        (free + 0.9, cap_r + 0.2),
        (free + 0.1, cap_r + 0.9),
        (free, inner + 0.6),
        (free + 0.3, outer),
        (free + 1.5, outer + 0.15),
        (free + 3.0, outer),
        (ridge_start, outer),
    ]
    x = ridge_start
    for _ in range(STATIONS["clip_ridges"]):
        outline += [(x + pitch * 0.5, outer + 0.3), (x + pitch, outer)]
        x += pitch
    outline += [
        (slope, outer),
        (slope + 2.5, outer - 0.3),
        (root - 1.0, cap_r + 0.9),
        (root + 1.0, cap_r - 0.3),
        (slope + 1.0, cap_r - 0.3),
        (slope - 1.0, inner),
        (free + 2.2, inner),
        (free + 1.4, inner - 0.2),
    ]

    half_width = 1.5
    bm = bmesh.new()
    front = [bm.verts.new((r * MM, axial(y), half_width * MM)) for y, r in outline]
    back = [bm.verts.new((r * MM, axial(y), -half_width * MM)) for y, r in outline]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    count = len(outline)
    for index in range(count):
        nxt = (index + 1) % count
        bm.faces.new((front[index], back[index], back[nxt], front[nxt]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("TKA_Pen_Clip_Mesh")
    bm.to_mesh(mesh)
    bm.free()
    obj = link("TKA_Pen_Clip", mesh)
    activate(obj)
    bevel = obj.modifiers.new("Bevel", "BEVEL")
    bevel.width = 0.25 * MM
    bevel.segments = 2
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    return finish_mesh(obj, material)


def join(name: str, objects: list[bpy.types.Object]) -> bpy.types.Object:
    bpy.ops.object.select_all(action="DESELECT")
    for item in objects:
        item.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = name
    return joined


def build_prop() -> tuple[bpy.types.Object, list[bpy.types.Object]]:
    colors = STATIONS["colors"]
    # Neutral by design: prop-model-recolor.ts REPLACES this color with the
    # hand's, and the name carries the "Recolor" marker that selects it.
    ink = make_material("TKA_Pen_Ink_Recolor", colors["neutral"], roughness=0.32, coat=0.35)
    plug = make_material("TKA_Pen_Plug", colors["plug"], roughness=0.28, coat=0.4)
    body = make_material("TKA_Pen_Body", colors["body"], roughness=0.55)
    tab = make_material("TKA_Pen_Tab", "#B8BCC0", roughness=0.4)

    root = bpy.data.objects.new("TKA_Pen", None)
    bpy.context.collection.objects.link(root)
    root["tka_prop_type"] = "pen"
    root["authored_length_m"] = AUTHORED_LENGTH_M
    root["real_length_m"] = LENGTH * MM
    root["radial_scale"] = RADIAL_SCALE
    root["grip_origin"] = "0,0,0"
    root["local_long_axis"] = "+Y"
    root["thumb_end"] = "+Y (cap)"
    root["recolor_material"] = "TKA_Pen_Ink_Recolor"
    root["tracked_tip_y"] = TRACKED_TIP_Y
    root["reference_form"] = "capped fine-point felt-tip pen, black barrel, ink-colored cap and clip"

    pivot = bpy.data.objects.new("TKA_Hand_Pivot", None)
    bpy.context.collection.objects.link(pivot)
    pivot.parent = root
    pivot["tka_grip"] = True

    barrel = join(
        "TKA_Pen_Barrel",
        [
            lathe("TKA_Pen_Body", body_sections(), body),
            lathe("TKA_Pen_Plug", plug_sections(), plug),
            band_tab(tab),
        ],
    )
    ink_parts = join(
        "TKA_Pen_Ink",
        [
            lathe("TKA_Pen_Cap", cap_sections(), ink),
            lathe("TKA_Pen_Band", band_sections(), ink),
            clip(ink),
        ],
    )
    objects = [barrel, ink_parts]
    from mathutils import Matrix

    # Every station above is the real pen; scale it up to the staff-size giant.
    staff_size = Matrix.Diagonal((RADIAL_SCALE, AXIAL_SCALE, RADIAL_SCALE, 1.0))
    for item in objects:
        item.data.transform(staff_size)
        item.data.update()
    for item in objects:
        item.parent = root
        item["tka_runtime_recolor"] = any("Recolor" in m.name for m in item.data.materials)
    return root, [pivot, *objects]


def export_glb(output_path: Path, root: bpy.types.Object, model_objects: list[bpy.types.Object]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for item in model_objects:
        item.select_set(True)
    bpy.context.view_layer.objects.active = root
    # Built upright along Blender Y; rotated into glTF's Y-up basis only for
    # export so the loaded prop stays long on local Y.
    root.rotation_euler.x = math.pi / 2
    try:
        bpy.ops.export_scene.gltf(
            filepath=str(output_path),
            export_format="GLB",
            use_selection=True,
            export_apply=True,
            export_yup=True,
            export_extras=True,
            export_texcoords=True,
            export_normals=True,
            export_tangents=False,
            export_materials="EXPORT",
            export_cameras=False,
            export_lights=False,
            export_animations=False,
        )
    finally:
        root.rotation_euler.x = 0.0


def point_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    from mathutils import Vector

    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def setup_render(background: tuple[float, float, float]) -> bpy.types.Object:
    world = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (*background, 1.0)
    bg.inputs["Strength"].default_value = 1.0
    for name, location, energy, color in (
        ("QA_Key", (-0.25, 0.15, 0.35), 6.0, (1.0, 0.96, 0.9)),
        ("QA_Fill", (0.3, -0.1, 0.25), 3.0, (0.7, 0.8, 1.0)),
        ("QA_Rim", (0.0, 0.0, -0.35), 4.0, (1.0, 1.0, 1.0)),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.size = 0.25
        light.data.color = color
        point_at(light, (0.0, 0.0, 0.0))
    bpy.ops.object.camera_add(location=(0.0, 0.0, 0.5))
    camera = bpy.context.object
    bpy.context.scene.camera = camera
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast"
    return camera


def tint_ink(hex_color: str) -> None:
    material = bpy.data.materials["TKA_Pen_Ink_Recolor"]
    material.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = srgb_to_linear(hex_color)


def render_preview(path: Path, root: bpy.types.Object) -> None:
    """The picker tile: the pen lying across a 640x240 frame on the tile's navy,
    in the left hand's blue, the way the other build previews are shot."""
    camera = setup_render((0.0018, 0.0024, 0.005))
    scene = bpy.context.scene
    scene.render.resolution_x = 640
    scene.render.resolution_y = 240
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = LENGTH * MM * 1.12
    camera.location = (0.0, 0.0, 0.5)
    camera.rotation_euler = (0.0, 0.0, 0.0)
    # Lay the pen across the frame, cap to the right, clip toward the camera's top.
    # Shrunk uniformly to the real pen's length so the real-size framing holds.
    root.scale = (1 / AXIAL_SCALE,) * 3
    root.rotation_euler = (0.0, 0.0, -math.pi / 2)
    tint_ink("#3575E2")
    # Rendered transparent and laid onto the other previews' exact navy, which
    # a world color cannot hit once the view transform has had its say.
    scene.render.film_transparent = True
    scene.render.image_settings.color_mode = "RGBA"
    png = path.with_suffix(".png")
    scene.render.filepath = str(png)
    bpy.ops.render.render(write_still=True)
    root.rotation_euler = (0.0, 0.0, 0.0)
    root.scale = (1.0, 1.0, 1.0)

    import numpy as np

    image = bpy.data.images.load(str(png))
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(-1, 4)
    tile = np.array(PREVIEW_TILE_RGB, dtype=np.float32) / 255.0
    alpha = pixels[:, 3:4]
    pixels[:, :3] = pixels[:, :3] * alpha + tile * (1.0 - alpha)
    pixels[:, 3] = 1.0
    image.pixels = pixels.ravel().tolist()
    image.filepath_raw = str(path)
    image.file_format = "WEBP"
    image.save()
    png.unlink()
    print(f"PEN_PREVIEW={path}")


def render_proofs(render_dir: Path, root: bpy.types.Object) -> None:
    render_dir.mkdir(parents=True, exist_ok=True)
    camera = setup_render((0.012, 0.014, 0.02))
    scene = bpy.context.scene
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 600
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = LENGTH * MM * 1.1
    tint_ink("#ED1C24")
    root.scale = (1 / AXIAL_SCALE,) * 3
    root.rotation_euler = (0.0, 0.0, -math.pi / 2)
    for label, rotation in {
        "side": (0.0, 0.0, -math.pi / 2),
        "turned": (math.radians(-35), 0.0, -math.pi / 2),
        "top": (math.radians(-90), 0.0, -math.pi / 2),
    }.items():
        root.rotation_euler = rotation
        scene.render.filepath = str(render_dir / f"pen-{label}.png")
        bpy.ops.render.render(write_still=True)
    camera.data.ortho_scale = 0.05
    camera.location = (0.045, 0.0, 0.5)
    root.rotation_euler = (math.radians(-25), 0.0, -math.pi / 2)
    scene.render.filepath = str(render_dir / "pen-cap.png")
    bpy.ops.render.render(write_still=True)
    root.rotation_euler = (0.0, 0.0, 0.0)
    root.scale = (1.0, 1.0, 1.0)


def main() -> None:
    args = parse_args()
    reset_scene()
    root, model_objects = build_prop()
    export_glb(args.output.resolve(), root, model_objects)
    if args.render_dir:
        render_proofs(args.render_dir.resolve(), root)
    if args.preview:
        render_preview(args.preview.resolve(), root)
    meshes = [item for item in model_objects if item.type == "MESH"]
    print(f"PEN_OUTPUT={args.output.resolve()}")
    print(f"PEN_BYTES={args.output.resolve().stat().st_size}")
    print(f"PEN_VERTICES={sum(len(m.data.vertices) for m in meshes)}")
    print(f"PEN_LENGTH_M={AUTHORED_LENGTH_M}")
    print(f"PEN_TRACKED_TIP_Y={TRACKED_TIP_Y:.7f}")


if __name__ == "__main__":
    main()
