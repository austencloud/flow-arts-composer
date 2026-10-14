"""Extrude the reference-derived, narrow-waisted practice Buugeng.

The trace in scripts/assets/buugeng-reference.svg follows a photo of a Flow DNA
flowgeng (sold at https://flowtoys.com/flowgeng), credited as the design source
in the GLB metadata and the Version 2 picker tile.

Run headless from the repository root:

    blender -b --python scripts/build-buugeng-model.py -- --output static/models/props/buugeng.glb

then node scripts/verify-buugeng-glb.cjs, and re-capture the Version 2 sprite
at /test/prop-3d-studio/sprites?prop=buugeng (and ?prop=bigbuugeng).
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SVG = ROOT / "scripts" / "assets" / "buugeng-reference.svg"
REFERENCE_DATA = ROOT / "scripts" / "assets" / "buugeng-reference.json"
DEFAULT_OUTPUT = ROOT / "static" / "models" / "props" / "buugeng.glb"

# Measured tip to tip, along the chord the two pointed ends share.
MODEL_LENGTH_M = 0.83
BODY_DEPTH_M = 0.0095
GRIP_LENGTH_M = 0.15
DESIGN_CREDIT = "Flow DNA"
DESIGN_SOURCE_URL = "https://flowtoys.com/flowgeng"


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--svg", type=Path, default=DEFAULT_SVG)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--render", type=Path)
    parser.add_argument("--blend", type=Path)
    return parser.parse_args(argv)


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.curves,
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for datablock in list(datablocks):
            datablocks.remove(datablock)


def make_material(
    name: str,
    color: tuple[float, float, float, float],
    roughness: float,
    *,
    metallic: float = 0.0,
    coat: float = 0.0,
) -> bpy.types.Material:
    result = bpy.data.materials.new(name)
    result.diffuse_color = color
    result.use_nodes = True
    principled = result.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = metallic
    if "Coat Weight" in principled.inputs:
        principled.inputs["Coat Weight"].default_value = coat
    return result


def activate(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def apply_modifier(obj: bpy.types.Object, name: str) -> None:
    activate(obj)
    bpy.ops.object.modifier_apply(modifier=name)


def smart_uv(obj: bpy.types.Object) -> None:
    if obj.type != "MESH" or not obj.data.polygons:
        return
    activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(
        angle_limit=math.radians(66),
        island_margin=0.018,
        area_weight=0.25,
        correct_aspect=True,
        scale_to_bounds=True,
    )
    bpy.ops.object.mode_set(mode="OBJECT")


def finish_mesh(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    obj.data.materials.clear()
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = abs(polygon.normal.y) < 0.92
    smart_uv(obj)


def import_body(
    svg_path: Path, body_material: bpy.types.Material
) -> tuple[bpy.types.Object, int, float, float]:
    before = set(bpy.data.objects)
    bpy.ops.import_curve.svg(filepath=str(svg_path))
    imported = [obj for obj in bpy.data.objects if obj not in before]
    if len(imported) != 1:
        raise RuntimeError(
            f"Expected one SVG path object, found {len(imported)} in {svg_path}"
        )

    body = imported[0]
    if body.type != "CURVE" or len(body.data.splines) != 11:
        raise RuntimeError("Buugeng trace must contain one perimeter and ten slots")
    slot_count = len(body.data.splines) - 1
    body.name = "TKA_Buugeng_PerforatedBody_Recolor"
    body.data.dimensions = "2D"
    body.data.fill_mode = "BOTH"
    body.data.resolution_u = 1
    activate(body)
    bpy.ops.object.convert(target="MESH")

    minimum = Vector((math.inf, math.inf, math.inf))
    maximum = Vector((-math.inf, -math.inf, -math.inf))
    for vertex in body.data.vertices:
        minimum.x = min(minimum.x, vertex.co.x)
        minimum.y = min(minimum.y, vertex.co.y)
        minimum.z = min(minimum.z, vertex.co.z)
        maximum.x = max(maximum.x, vertex.co.x)
        maximum.y = max(maximum.y, vertex.co.y)
        maximum.z = max(maximum.z, vertex.co.z)

    center = (minimum + maximum) * 0.5

    # The trace stands upright by its bounding box, but a flowgeng's two
    # pointed tips are not on that axis: they share a chord about 21 degrees
    # off it. Effects emit along the model's local long axis, so author that
    # axis as the tip-to-tip chord. The body is point-symmetric about its
    # centre, so the perimeter point farthest from the centre is one tip and
    # the same point turned a half turn is the other.
    tip = max(
        ((vertex.co - center).xy for vertex in body.data.vertices),
        key=lambda offset: offset.length_squared,
    )
    if tip.length <= 0:
        raise RuntimeError("Buugeng SVG has no measurable length")
    scale = MODEL_LENGTH_M / (tip.length * 2)
    # Turn the trace so the chord lies on +Y (long axis up before the glTF
    # Y-up conversion maps Blender Z to runtime +Y).
    turn = math.pi / 2 - math.atan2(tip.y, tip.x)
    cos_turn, sin_turn = math.cos(turn), math.sin(turn)
    chord_turn_degrees = math.degrees(turn)

    # Author its width on Blender X and its length on Blender Z; glTF's Y-up
    # conversion preserves the prop contract.
    for vertex in body.data.vertices:
        source = vertex.co - center
        along_width = source.x * cos_turn - source.y * sin_turn
        along_length = source.x * sin_turn + source.y * cos_turn
        vertex.co = Vector((along_width * scale, 0.0, along_length * scale))

    body.data.materials.append(body_material)
    solidify = body.modifiers.new("9.5mm body stock", "SOLIDIFY")
    solidify.thickness = BODY_DEPTH_M
    solidify.offset = 0.0
    apply_modifier(body, solidify.name)

    bevel = body.modifiers.new("Hand-routed perimeter", "BEVEL")
    bevel.width = 0.0016
    bevel.segments = 3
    bevel.limit_method = "ANGLE"
    apply_modifier(body, bevel.name)
    finish_mesh(body, body_material)
    reference = json.loads(REFERENCE_DATA.read_text(encoding="utf-8"))
    waist_width_m = reference["waistWidthPx"] / reference["spanPx"] * MODEL_LENGTH_M
    body["reference_trace"] = "scripts/assets/buugeng-reference.svg"
    body["tka_runtime_recolor"] = True
    return body, slot_count, waist_width_m, chord_turn_degrees


def build_prop(svg_path: Path) -> tuple[bpy.types.Object, list[bpy.types.Object]]:
    body_material = make_material(
        "TKA_Buugeng_Recolor",
        (0.025, 0.18, 0.82, 1.0),
        roughness=0.48,
        coat=0.08,
    )
    body, slot_count, waist_width_m, chord_turn_degrees = import_body(
        svg_path, body_material
    )

    root = bpy.data.objects.new("TKA_Buugeng", None)
    bpy.context.collection.objects.link(root)
    root["tka_prop_type"] = "buugeng"
    root["authored_length_m"] = MODEL_LENGTH_M
    root["body_depth_m"] = BODY_DEPTH_M
    root["grip_length_m"] = GRIP_LENGTH_M
    root["cutout_count"] = slot_count
    root["waist_width_m"] = waist_width_m
    root["grip_origin"] = "0,0,0"
    root["local_long_axis"] = "+Y"
    root["long_axis_source"] = "tip-to-tip chord"
    root["trace_to_chord_turn_deg"] = chord_turn_degrees
    root["recolor_material"] = "TKA_Buugeng_Recolor"
    root["reference_form"] = "Flow DNA flowgeng: narrow-waisted ten-slot silhouette"
    root["design_credit"] = DESIGN_CREDIT
    root["design_source_url"] = DESIGN_SOURCE_URL
    root["canonical_source"] = "scripts/assets/buugeng-reference.svg"
    root["symmetry_method"] = "lower reference half rotated 180 degrees"

    pivot = bpy.data.objects.new("TKA_Hand_Pivot", None)
    bpy.context.collection.objects.link(pivot)
    pivot["tka_grip"] = True
    model_objects = [pivot, body]
    for obj in model_objects:
        obj.parent = root
    return root, model_objects


def export_glb(
    output_path: Path,
    root: bpy.types.Object,
    model_objects: list[bpy.types.Object],
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for obj in model_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
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


def point_at(obj: bpy.types.Object, target: Vector) -> None:
    direction = target - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def render_proof(render_path: Path) -> None:
    world = bpy.context.scene.world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.006, 0.009, 0.018, 1.0)
    background.inputs["Strength"].default_value = 0.18

    for name, location, energy, size, color in (
        ("QA_Key", (-0.72, -1.15, 0.82), 170, 1.15, (0.94, 0.86, 0.72)),
        ("QA_Fill", (0.88, -0.34, 0.48), 95, 0.84, (0.35, 0.56, 1.0)),
        ("QA_Rim", (-0.45, 0.72, -0.48), 110, 0.72, (1.0, 0.22, 0.12)),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.shape = "DISK"
        light.data.size = size
        light.data.color = color
        point_at(light, Vector((0.0, 0.0, 0.0)))

    bpy.ops.object.camera_add(location=(0.0, -1.45, 0.0))
    camera = bpy.context.object
    camera.name = "QA_Camera"
    camera.data.lens = 58
    point_at(camera, Vector((0.0, 0.0, 0.0)))
    bpy.context.scene.camera = camera

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1000
    scene.render.resolution_y = 1200
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.filepath = str(render_path)
    render_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True)


def print_summary(
    output_path: Path,
    root: bpy.types.Object,
    model_objects: list[bpy.types.Object],
) -> None:
    meshes = [obj for obj in model_objects if obj.type == "MESH"]
    print(f"BUUGENG_OUTPUT={output_path}")
    print(f"BUUGENG_BYTES={output_path.stat().st_size}")
    print(f"BUUGENG_MESHES={len(meshes)}")
    print(f"BUUGENG_VERTICES={sum(len(obj.data.vertices) for obj in meshes)}")
    print(f"BUUGENG_POLYGONS={sum(len(obj.data.polygons) for obj in meshes)}")
    print(f"BUUGENG_LENGTH_M={MODEL_LENGTH_M}")
    print(f"BUUGENG_TIP_CHORD_TURN_DEG={root['trace_to_chord_turn_deg']:.3f}")
    print(f"BUUGENG_BODY_DEPTH_M={BODY_DEPTH_M}")
    print(f"BUUGENG_GRIP_LENGTH_M={GRIP_LENGTH_M}")
    print("BUUGENG_HAND_PIVOT=0,0,0")


def main() -> None:
    args = parse_args()
    svg_path = args.svg.resolve()
    output_path = args.output.resolve()
    if not svg_path.exists():
        raise FileNotFoundError(svg_path)
    reset_scene()
    root, model_objects = build_prop(svg_path)
    export_glb(output_path, root, model_objects)
    if args.blend:
        blend_path = args.blend.resolve()
        blend_path.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    if args.render:
        render_proof(args.render.resolve())
    print_summary(output_path, root, model_objects)


if __name__ == "__main__":
    main()
