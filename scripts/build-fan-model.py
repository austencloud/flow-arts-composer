"""Build the production fan family and optional two-faced cover.

The asset carries six independently switchable groups:

* ``Fan_Fire``: oil-darkened steel frame with five rolled kevlar wicks.
* ``Fan_Lotus``: measured five-petal Russian-grip fire fan.
* ``Fan_Day``: the same reach as a thick HDPE practice frame.
* ``Fan_Moon``: a measured two-zone LED frame beneath diffusion fabric.
* ``Fan_Astral``: a 66-pixel open-frame LED fan with blade/side zones.
* ``Fan_Cover``: a slip-on crescent with a solid front and striped back.

The scene-3d runtime chooses which groups are visible and recolors the day
frame and solid cover face. The hand pivot is the centre of the grip ring and
the fan reaches along local +Y, matching every other prop in scene-3d.

Usage:
  blender --background --factory-startup --python scripts/build-fan-model.py
  blender --background --factory-startup --python scripts/build-fan-model.py -- \
    --output static/models/props/fan.glb \
    --blend scratchpad/fan-review/fan-production.blend \
    --render-dir scratchpad/fan-review/r1
"""

from __future__ import annotations

import argparse
import json
import math
import struct
import sys
import tempfile
import zlib
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.geometry import interpolate_bezier


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "static" / "models" / "props" / "fan.glb"
DOODLEGRIP_CONTOURS = ROOT / "scripts" / "assets" / "doodlegrip-day-contours.json"
DOODLEGRIP_FIRE_REFERENCE = (
    ROOT / "scripts" / "assets" / "doodlegrip-fire-reference.json"
)
LOTUS_FIRE_REFERENCE = ROOT / "scripts" / "assets" / "lotus-fire-reference.json"
LOTUS_FIRE_VECTOR_REFERENCE = (
    ROOT / "scripts" / "assets" / "lotus-fire-reference.svg"
)
MOON_FAN_REFERENCE = ROOT / "scripts" / "assets" / "moon-fan-reference.json"

FIRE_WIDTH_M = 0.4826
FIRE_HEIGHT_M = 0.3302
FIRE_RING_DIAMETER_M = 0.0381
FIRE_WICK_LENGTH_M = 0.0381
FIRE_OUTER_SPINE_RADIUS_M = 0.00238125
FIRE_INNER_SPINE_RADIUS_M = 0.0015875
LOTUS_WIDTH_M = 0.48
LOTUS_HEIGHT_M = 0.35
LOTUS_RING_DIAMETER_M = 0.092075
LOTUS_FRAME_RADIUS_M = 0.002
LOTUS_GRIP_RADIUS_M = 0.0035
LOTUS_BEZIER_SAMPLES_PER_SPAN = 12
DAY_WIDTH_M = 0.51
DAY_HEIGHT_M = 0.35
DAY_DEPTH_M = 0.0095
MOON_WIDTH_M = 0.60
MOON_HEIGHT_M = 0.38
ASTRAL_WIDTH_M = 0.4826
ASTRAL_HEIGHT_M = 0.381
ASTRAL_LED_COUNT = 66


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--blend", type=Path)
    parser.add_argument("--render-dir", type=Path)
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


def activate(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def make_material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    roughness: float,
    metallic: float = 0.0,
    coat: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.diffuse_color = color
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = metallic
    if "Coat Weight" in principled.inputs:
        principled.inputs["Coat Weight"].default_value = coat
    if "Coat Roughness" in principled.inputs:
        principled.inputs["Coat Roughness"].default_value = min(roughness, 0.3)
    return material


def make_led_material(
    name: str,
    color: tuple[float, float, float, float],
) -> bpy.types.Material:
    material = make_material(name, color, roughness=0.18, coat=0.2)
    principled = material.node_tree.nodes.get("Principled BSDF")
    emission = (
        principled.inputs.get("Emission Color")
        or principled.inputs.get("Emission")
    )
    if emission:
        emission.default_value = color
    if "Emission Strength" in principled.inputs:
        principled.inputs["Emission Strength"].default_value = 5.0
    return material


def write_rgba_png(
    path: Path,
    pixels: list[float],
    size: int,
) -> None:
    """Write a tiny dependency-free RGBA texture Blender can embed reliably."""

    def chunk(kind: bytes, payload: bytes) -> bytes:
        return (
            struct.pack(">I", len(payload))
            + kind
            + payload
            + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
        )

    rows = bytearray()
    stride = size * 4
    encoded = bytes(
        max(0, min(255, round(component * 255))) for component in pixels
    )
    for row in range(size):
        rows.append(0)
        start = row * stride
        rows.extend(encoded[start : start + stride])
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(rows), level=9))
        + chunk(b"IEND", b"")
    )


def woven_wick_height(u: float, v: float) -> float:
    """Return one chunky knitted Kevlar row shared by mesh and normal map."""
    row_count = 14
    row_index = math.floor(v * row_count)
    row_v = (v * row_count) % 1.0
    stitch_u = (u * 12 + 0.5 * (row_index % 2)) % 1.0

    def periodic_distance(left: float, right: float) -> float:
        return abs((left - right + 0.5) % 1.0 - 0.5)

    # The product photograph reads as stacked, scalloped crochet rows rather
    # than a diamond net. One broad cord makes the visible wave, while the
    # smaller return cord tucks underneath and joins the next row.
    crest = 0.50 + 0.16 * math.cos(math.tau * stitch_u)
    return_crest = 0.08 - 0.09 * math.cos(math.tau * stitch_u)
    face_yarn = math.exp(-((periodic_distance(row_v, crest) / 0.105) ** 2))
    return_yarn = math.exp(
        -((periodic_distance(row_v, return_crest) / 0.075) ** 2)
    )
    row_body = math.exp(-((periodic_distance(row_v, 0.5) / 0.29) ** 2))
    return min(
        1.0,
        0.06 + face_yarn * 0.72 + return_yarn * 0.18 + row_body * 0.14,
    )


def make_woven_wick_material(name: str) -> bpy.types.Material:
    """Create the pale, row-braided Kevlar used by the photographed Lotus wicks."""
    size = 192
    heights: list[float] = []
    colors: list[float] = []
    for y in range(size):
        v = (y + 0.5) / size
        for x in range(size):
            u = (x + 0.5) / size
            height = woven_wick_height(u, v)
            fibre = 0.006 * math.sin(math.tau * (47 * u + 31 * v))
            shade = 0.88 + 0.12 * height + fibre
            heights.append(height)
            colors.extend((1.0 * shade, 0.95 * shade, 0.72 * shade, 1.0))

    normals: list[float] = []
    strength = 2.15
    for y in range(size):
        for x in range(size):
            left = heights[y * size + ((x - 1) % size)]
            right = heights[y * size + ((x + 1) % size)]
            below = heights[((y - 1) % size) * size + x]
            above = heights[((y + 1) % size) * size + x]
            normal = Vector(
                (
                    -(right - left) * strength,
                    -(above - below) * strength,
                    1.0,
                )
            ).normalized()
            normals.extend(
                (
                    normal.x * 0.5 + 0.5,
                    normal.y * 0.5 + 0.5,
                    normal.z * 0.5 + 0.5,
                    1.0,
                )
            )

    with tempfile.TemporaryDirectory(prefix="tka-lotus-wick-") as texture_dir:
        texture_path = Path(texture_dir)
        color_path = texture_path / "lotus-wick-color.png"
        normal_path = texture_path / "lotus-wick-normal.png"
        write_rgba_png(color_path, colors, size)
        write_rgba_png(normal_path, normals, size)
        color_image = bpy.data.images.load(str(color_path), check_existing=False)
        normal_image = bpy.data.images.load(str(normal_path), check_existing=False)
        color_image.name = f"{name}_Color"
        normal_image.name = f"{name}_Normal"
        color_image.colorspace_settings.name = "sRGB"
        normal_image.colorspace_settings.name = "Non-Color"
        color_image.pack()
        normal_image.pack()

    if max(color_image.pixels[:4]) < 0.2:
        raise RuntimeError("Generated Lotus wick color texture is empty")
    if max(normal_image.pixels[:4]) < 0.5:
        raise RuntimeError("Generated Lotus wick normal texture is empty")

    material = make_material(name, (0.98, 0.9, 0.68, 1), roughness=0.98)
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)

    color_texture = nodes.new("ShaderNodeTexImage")
    color_texture.name = f"{name}_ColorTexture"
    color_texture.image = color_image
    color_texture.interpolation = "Linear"
    color_texture.extension = "REPEAT"
    links.new(color_texture.outputs["Color"], principled.inputs["Base Color"])
    emission_color = principled.inputs.get("Emission Color")
    emission_strength = principled.inputs.get("Emission Strength")
    if emission_color is not None and emission_strength is not None:
        # Kevlar scatters the studio light through a pale, fibrous surface.
        # A restrained self-fill keeps that soft cream body from collapsing
        # to grey in the dark runtime scene without making an unlit wick glow.
        links.new(color_texture.outputs["Color"], emission_color)
        emission_strength.default_value = 0.65

    normal_texture = nodes.new("ShaderNodeTexImage")
    normal_texture.name = f"{name}_NormalTexture"
    normal_texture.image = normal_image
    normal_texture.interpolation = "Linear"
    normal_texture.extension = "REPEAT"
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = 0.5
    links.new(normal_texture.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], principled.inputs["Normal"])
    return material


def set_material_color(
    material: bpy.types.Material,
    color: tuple[float, float, float, float],
) -> None:
    material.diffuse_color = color
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color


def smooth_mesh(obj: bpy.types.Object) -> None:
    if obj.type != "MESH":
        return
    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def smart_uv(obj: bpy.types.Object) -> None:
    if obj.type != "MESH" or len(obj.data.polygons) == 0:
        return
    activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(
        angle_limit=math.radians(66),
        island_margin=0.012,
        area_weight=0.25,
        correct_aspect=True,
        scale_to_bounds=True,
    )
    bpy.ops.object.mode_set(mode="OBJECT")


def finish_mesh(
    obj: bpy.types.Object,
    material: bpy.types.Material,
    *,
    bevel: float = 0.0,
    smooth: bool = True,
) -> bpy.types.Object:
    activate(obj)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        modifier = obj.modifiers.new("Soft prop edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
        modifier.limit_method = "ANGLE"
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.data.materials.clear()
    obj.data.materials.append(material)
    if smooth:
        smooth_mesh(obj)
    smart_uv(obj)
    return obj


def add_empty(name: str, parent: bpy.types.Object | None = None) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    return obj


def add_curve_strip(
    name: str,
    points: list[tuple[float, float, float]],
    width: float,
    depth: float,
    material: bpy.types.Material,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(f"{name}_Curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = width / 2
    curve.bevel_resolution = 3
    curve.resolution_u = 2
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, coordinate in zip(spline.points, points):
        point.co = (*coordinate, 1.0)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.scale.z = depth / width
    activate(obj)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    return finish_mesh(obj, material)


def add_round_rod(
    name: str,
    points: list[tuple[float, float, float]],
    radius: float,
    material: bpy.types.Material,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(f"{name}_Curve", "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, coordinate in zip(spline.points, points):
        point.co = (*coordinate, 1.0)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    activate(obj)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    return finish_mesh(obj, material)


def add_torus(
    name: str,
    centre: tuple[float, float, float],
    inner_radius: float,
    tube_radius: float,
    depth: float,
    material: bpy.types.Material,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_radius=inner_radius + tube_radius,
        minor_radius=tube_radius,
        major_segments=48,
        minor_segments=10,
        location=centre,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale.z = depth / (tube_radius * 2)
    obj.parent = parent
    return finish_mesh(obj, material)


def polygon_area(points: list[tuple[float, float]]) -> float:
    return sum(
        points[index][0] * points[(index + 1) % len(points)][1]
        - points[(index + 1) % len(points)][0] * points[index][1]
        for index in range(len(points))
    ) / 2


def add_cut_sheet(
    name: str,
    outline: list[tuple[float, float]],
    holes: list[list[tuple[float, float]]],
    depth: float,
    material: bpy.types.Material,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    """Extrude one continuous HDPE sheet with real cut-through openings."""
    curve = bpy.data.curves.new(f"{name}_Curve", "CURVE")
    curve.dimensions = "2D"
    curve.resolution_u = 2
    curve.fill_mode = "BOTH"
    curve.extrude = max(0.0, depth / 2 - 0.0012)
    curve.bevel_depth = min(0.0012, depth / 2)
    curve.bevel_resolution = 3
    curve.resolution_u = 2

    # Blender identifies holes by winding. Keep the outside counter-clockwise
    # and every cutout clockwise so the result is one plate, not stacked faces.
    contours = [outline if polygon_area(outline) > 0 else list(reversed(outline))]
    contours.extend(
        hole if polygon_area(hole) < 0 else list(reversed(hole)) for hole in holes
    )
    for contour in contours:
        # The extractor has already resampled and faired each loop. A dense
        # poly spline follows those audited points directly and cannot produce
        # the Bezier overshoot or wavering handles visible in the first pass.
        spline = curve.splines.new("POLY")
        spline.points.add(len(contour) - 1)
        for point, coordinate in zip(spline.points, contour):
            point.co = (coordinate[0], coordinate[1], 0.0, 1.0)
        spline.use_cyclic_u = True

    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    activate(obj)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    return finish_mesh(obj, material)


def add_cylinder_between(
    name: str,
    start: Vector,
    end: Vector,
    radius: float,
    material: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    vertices: int = 20,
) -> bpy.types.Object:
    direction = end - start
    midpoint = (start + end) / 2
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=direction.length,
        location=midpoint,
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    obj.rotation_mode = "XYZ"
    obj.parent = parent
    return finish_mesh(obj, material, bevel=radius * 0.18)


def add_woven_cylinder_between(
    name: str,
    start: Vector,
    end: Vector,
    radius: float,
    material: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    radial_segments: int = 40,
    axial_segments: int = 28,
) -> bpy.types.Object:
    """Build one rolled wick whose crossed Kevlar weave catches real light."""
    direction = end - start
    length = direction.length
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    relief = 0.0003
    for axial_index in range(axial_segments + 1):
        t = axial_index / axial_segments
        edge_fade = min(1.0, t * 8, (1 - t) * 8)
        for radial_index in range(radial_segments):
            angle = math.tau * radial_index / radial_segments
            stitch_height = woven_wick_height(
                radial_index / radial_segments,
                t,
            )
            edge_fray = (1 - edge_fade) * 0.00028 * (
                0.65 * math.sin(7 * angle) + 0.35 * math.sin(17 * angle)
            )
            handmade_roll = 0.00016 * (
                0.6 * math.sin(3 * angle + t * 5.1)
                + 0.4 * math.sin(7 * angle - t * 3.7)
            )
            end_sign = -1.0 if t < 0.5 else 1.0
            axial_fray = (
                end_sign
                * (1 - edge_fade)
                * 0.00055
                * (0.55 * math.sin(5 * angle) + 0.45 * math.sin(13 * angle))
            )
            z = (t - 0.5) * length + axial_fray
            woven_radius = (
                radius
                + relief * edge_fade * (stitch_height - 0.42)
                + edge_fray
                + handmade_roll
            )
            vertices.append(
                (
                    woven_radius * math.cos(angle),
                    woven_radius * math.sin(angle),
                    z,
                )
            )

    for axial_index in range(axial_segments):
        ring = axial_index * radial_segments
        next_ring = (axial_index + 1) * radial_segments
        for radial_index in range(radial_segments):
            following = (radial_index + 1) % radial_segments
            faces.append(
                (
                    ring + radial_index,
                    ring + following,
                    next_ring + following,
                    next_ring + radial_index,
                )
            )

    lower_center = len(vertices)
    upper_center = lower_center + 1
    vertices.extend([(0.0, 0.0, -length / 2), (0.0, 0.0, length / 2)])
    upper_ring = axial_segments * radial_segments
    for radial_index in range(radial_segments):
        following = (radial_index + 1) % radial_segments
        faces.append((lower_center, following, radial_index))
        faces.append(
            (upper_center, upper_ring + radial_index, upper_ring + following)
        )

    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = (start + end) / 2
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    obj.rotation_mode = "XYZ"
    obj.parent = parent
    obj = finish_mesh(obj, material, smooth=True)
    uv_layer = obj.data.uv_layers.active or obj.data.uv_layers.new(name="UVMap")
    for polygon in obj.data.polygons:
        polygon_uvs: list[tuple[float, float]] = []
        is_cap = len(polygon.vertices) == 3
        for loop_index in polygon.loop_indices:
            vertex = obj.data.vertices[obj.data.loops[loop_index].vertex_index].co
            if is_cap:
                polygon_uvs.append(
                    (
                        0.5 + vertex.x / (radius * 2.25),
                        0.5 + vertex.y / (radius * 2.25),
                    )
                )
            else:
                polygon_uvs.append(
                    (
                        (math.atan2(vertex.y, vertex.x) / math.tau) % 1.0,
                        vertex.z / length + 0.5,
                    )
                )
        u_values = [uv[0] for uv in polygon_uvs]
        crosses_seam = max(u_values) - min(u_values) > 0.5
        for loop_index, (u, v) in zip(polygon.loop_indices, polygon_uvs):
            uv_layer.data[loop_index].uv = (u + 1.0 if crosses_seam and u < 0.5 else u, v)
    return obj


def add_weld_bead(
    name: str,
    centre: tuple[float, float, float],
    radius: float,
    material: bpy.types.Material,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=16,
        ring_count=8,
        radius=radius,
        location=centre,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale.z = 0.72
    obj.parent = parent
    return finish_mesh(obj, material)


def add_led_pixel(
    name: str,
    centre: tuple[float, float, float],
    radius: float,
    material: bpy.types.Material,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    """A faceted lens: enough silhouette for a 4mm emitter, no hidden excess."""
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=8,
        ring_count=4,
        radius=radius,
        location=centre,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name
    obj.scale.z = 0.72
    obj.parent = parent
    return finish_mesh(obj, material)


def add_weld_boss(
    name: str,
    centre: tuple[float, float, float],
    half_extents: tuple[float, float, float],
    phase: float,
    material: bpy.types.Material,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    """Build the broad, hand-laid weld where the Lotus frame meets its grip."""
    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=2,
        radius=1.0,
        location=centre,
    )
    obj = bpy.context.object
    obj.name = name
    for vertex in obj.data.vertices:
        direction = vertex.co.normalized()
        angle = math.atan2(direction.y, direction.x)
        silhouette = (
            1.0
            + 0.09 * math.sin(3 * angle + phase)
            + 0.045 * math.sin(7 * angle - phase * 0.7)
        )
        crown = 1.0 + 0.06 * math.sin(5 * angle + phase * 1.3)
        vertex.co.x = direction.x * half_extents[0] * silhouette
        vertex.co.y = direction.y * half_extents[1] * silhouette
        vertex.co.z = direction.z * half_extents[2] * crown
    obj.parent = parent
    obj["tka_weld_half_extents_m"] = list(half_extents)
    obj["tka_weld_phase"] = phase
    return finish_mesh(obj, material)


def ellipse_arc(
    radius_x: float,
    radius_y: float,
    centre_y: float,
    *,
    segments: int = 32,
    z: float = 0.0,
    start_angle: float = 0.0,
    end_angle: float = math.pi,
) -> list[tuple[float, float, float]]:
    return [
        (
            radius_x
            * math.cos(start_angle + (end_angle - start_angle) * index / segments),
            centre_y
            + radius_y
            * math.sin(start_angle + (end_angle - start_angle) * index / segments),
            z,
        )
        for index in range(segments + 1)
    ]


def circle_arc(
    radius: float,
    centre_y: float,
    *,
    start_angle: float,
    end_angle: float,
    segments: int = 72,
) -> list[tuple[float, float, float]]:
    return ellipse_arc(
        radius,
        radius,
        centre_y,
        segments=segments,
        start_angle=start_angle,
        end_angle=end_angle,
    )


def quadratic_curve(
    start: tuple[float, float],
    control: tuple[float, float],
    end: tuple[float, float],
    *,
    segments: int = 16,
) -> list[tuple[float, float, float]]:
    points: list[tuple[float, float, float]] = []
    for index in range(segments + 1):
        t = index / segments
        u = 1 - t
        points.append(
            (
                u * u * start[0] + 2 * u * t * control[0] + t * t * end[0],
                u * u * start[1] + 2 * u * t * control[1] + t * t * end[1],
                0.0,
            )
        )
    return points


def import_svg_centerlines(
    svg_path: Path,
    expected_path_ids: set[str],
) -> dict[str, list[tuple[float, float, float]]]:
    """Import Illustrator paths without turning their handles back into guessed points."""
    before = set(bpy.data.objects)
    bpy.ops.import_curve.svg(filepath=str(svg_path))
    imported = [obj for obj in bpy.data.objects if obj not in before]
    imported_names = {obj.name for obj in imported}
    if imported_names != expected_path_ids:
        missing = sorted(expected_path_ids - imported_names)
        unexpected = sorted(imported_names - expected_path_ids)
        raise ValueError(
            f"Lotus SVG path mismatch; missing={missing}, unexpected={unexpected}"
        )

    # Blender imports the 480 x 350 mm artboard with its lower-left at (0, 0).
    # Moving it by this calibrated offset places the SVG pivot at model origin.
    artboard_offset = Vector((-0.24, -0.08, 0.0))
    centerlines: dict[str, list[tuple[float, float, float]]] = {}
    for obj in imported:
        if obj.type != "CURVE" or len(obj.data.splines) != 1:
            raise ValueError(f"Lotus SVG path {obj.name} is not one curve spline")
        spline = obj.data.splines[0]
        if spline.type != "BEZIER" or spline.use_cyclic_u:
            raise ValueError(f"Lotus SVG path {obj.name} must be an open Bezier")

        points: list[tuple[float, float, float]] = []
        bezier_points = spline.bezier_points
        for index in range(len(bezier_points) - 1):
            start = bezier_points[index]
            end = bezier_points[index + 1]
            segment = interpolate_bezier(
                start.co,
                start.handle_right,
                end.handle_left,
                end.co,
                LOTUS_BEZIER_SAMPLES_PER_SPAN,
            )
            if index > 0:
                segment = segment[1:]
            points.extend(
                tuple(obj.matrix_world @ point + artboard_offset)
                for point in segment
            )
        centerlines[obj.name] = points

    for obj in imported:
        bpy.data.objects.remove(obj, do_unlink=True)

    # Illustrator's source paths are exact reflections, but Blender imports
    # each side through separate 32-bit curve data. Reflecting the authored
    # right paths here removes the resulting micron-scale bilateral drift.
    for right_id in sorted(
        path_id for path_id in expected_path_ids if path_id.endswith("-right")
    ):
        left_id = right_id.removesuffix("-right") + "-left"
        centerlines[left_id] = [(-x, y, z) for x, y, z in centerlines[right_id]]
    return centerlines


def catmull_rom_curve(
    anchors: list[tuple[float, float]], *, segments_per_span: int = 12
) -> list[tuple[float, float, float]]:
    """Interpolate measured landmarks without leaving polygonal corners."""
    points: list[tuple[float, float, float]] = []
    for span in range(len(anchors) - 1):
        p0 = Vector(anchors[max(span - 1, 0)])
        p1 = Vector(anchors[span])
        p2 = Vector(anchors[span + 1])
        p3 = Vector(anchors[min(span + 2, len(anchors) - 1)])
        for index in range(segments_per_span + 1):
            if span > 0 and index == 0:
                continue
            t = index / segments_per_span
            t2 = t * t
            t3 = t2 * t
            point = 0.5 * (
                2 * p1
                + (-p0 + p2) * t
                + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
            )
            points.append((point.x, point.y, 0.0))
    return points


def cubic_bezier_curve(
    start: tuple[float, float],
    control_1: tuple[float, float],
    control_2: tuple[float, float],
    end: tuple[float, float],
    *,
    segments: int = 18,
) -> list[tuple[float, float, float]]:
    points: list[tuple[float, float, float]] = []
    for index in range(segments + 1):
        t = index / segments
        u = 1 - t
        points.append(
            (
                u**3 * start[0]
                + 3 * u * u * t * control_1[0]
                + 3 * u * t * t * control_2[0]
                + t**3 * end[0],
                u**3 * start[1]
                + 3 * u * u * t * control_1[1]
                + 3 * u * t * t * control_2[1]
                + t**3 * end[1],
                0.0,
            )
        )
    return points


def add_cover_surface(
    name: str,
    outer: list[tuple[float, float, float]],
    inner: list[tuple[float, float, float]],
    z: float,
    materials: list[bpy.types.Material],
    parent: bpy.types.Object,
    *,
    striped: bool,
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int, int]] = []
    for index in range(len(outer) - 1):
        base = len(vertices)
        vertices.extend(
            [
                (outer[index][0], outer[index][1], z),
                (outer[index + 1][0], outer[index + 1][1], z),
                (inner[index + 1][0], inner[index + 1][1], z),
                (inner[index][0], inner[index][1], z),
            ]
        )
        faces.append(
            (base, base + 1, base + 2, base + 3)
            if z >= 0
            else (base + 3, base + 2, base + 1, base)
        )
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    for material in materials:
        mesh.materials.append(material)
    if striped:
        stripe_count = 9
        segment_count = len(faces)
        for index, polygon in enumerate(mesh.polygons):
            stripe = min(stripe_count - 1, int(index * stripe_count / segment_count))
            polygon.material_index = stripe % 2
    smart_uv(obj)
    return obj


def build_day_frame(
    parent: bpy.types.Object,
    day_material: bpy.types.Material,
) -> list[bpy.types.Object]:
    # This is not an interpretation of DoodleGrip geometry. The contours are
    # mechanically traced from the upper white fan in the supplied front-on
    # product image: one real outside boundary and all 17 real cut-through
    # openings. The finger opening's centroid is the local hand pivot.
    trace = json.loads(DOODLEGRIP_CONTOURS.read_text(encoding="utf-8"))
    outline = [tuple(point) for point in trace["outline"]]
    holes = [[tuple(point) for point in contour] for contour in trace["holes"]]
    if trace["contour_count"] != 18 or len(holes) != 17:
        raise ValueError("DoodleGrip trace must contain one outline and 17 holes")
    if not math.isclose(trace["width_m"], DAY_WIDTH_M, abs_tol=1e-6):
        raise ValueError("DoodleGrip trace width no longer matches the physical build")
    if not math.isclose(trace["height_m"], DAY_HEIGHT_M, abs_tol=1e-6):
        raise ValueError("DoodleGrip trace height no longer matches the physical build")
    if not math.isclose(trace["ring_diameter_m"], 0.044, abs_tol=1e-6):
        raise ValueError("DoodleGrip trace no longer uses the selected 1.75-inch ring")
    if not trace.get("symmetry"):
        raise ValueError("DoodleGrip trace is missing its symmetry correction")

    draft = add_cut_sheet(
        "Fan_Day_DoodleGripPlate",
        outline,
        holes,
        DAY_DEPTH_M,
        day_material,
        parent,
    )
    # Curve smoothing and the rounded stock edge extend beyond the control
    # contour. Calibrate the finished mesh, after both operations, so its
    # exported envelope matches the manufacturer's 510 x 350 mm dimensions.
    finished_dimensions = draft.dimensions.copy()
    scale_x = DAY_WIDTH_M / finished_dimensions.x
    scale_y = DAY_HEIGHT_M / finished_dimensions.y
    bpy.data.objects.remove(draft, do_unlink=True)

    # The envelope correction is anisotropic by a fraction of a percent. Feed
    # its inverse into the central ring before the final build so the finished
    # control boundary remains a true 44mm circle after calibration.
    corrected_ring = [
        (point[0] / scale_x, point[1] / scale_y) for point in holes[-1]
    ]
    plate = add_cut_sheet(
        "Fan_Day_DoodleGripPlate",
        outline,
        [*holes[:-1], corrected_ring],
        DAY_DEPTH_M,
        day_material,
        parent,
    )
    for vertex in plate.data.vertices:
        vertex.co.x *= scale_x
        vertex.co.y *= scale_y
    plate.data.update()
    plate["tka_build"] = "DoodleGrip practice fan"
    plate["tka_construction"] = "single extruded HDPE cut sheet"
    plate["tka_trace_source"] = trace["source"]
    plate["tka_trace_contours"] = trace["contour_count"]
    plate["tka_trace_holes"] = len(holes)
    plate["tka_trace_points"] = len(outline) + sum(len(hole) for hole in holes)
    plate["tka_trace_pivot_px"] = trace["pivot_px"]
    plate["tka_ring_diameter_m"] = trace["ring_diameter_m"]
    plate["tka_symmetry"] = trace["symmetry"]
    plate["tka_official_dimensions_source"] = trace["official_dimensions_source"]
    plate["tka_finished_dimension_calibration"] = [scale_x, scale_y, 1.0]
    plate["tka_finished_ring_control_diameter_m"] = trace["ring_diameter_m"]
    plate["tka_minimum_web_m"] = trace["minimum_web_m"]
    return [plate]


def build_moon_fan(
    parent: bpy.types.Object,
    fabric: bpy.types.Material,
    frame: bpy.types.Material,
    led_a: bpy.types.Material,
    led_b: bpy.types.Material,
) -> list[bpy.types.Object]:
    """Build the measured two-zone frame beneath the Moon fan's white skin."""
    reference = json.loads(MOON_FAN_REFERENCE.read_text(encoding="utf-8"))
    observed = reference["observed_2026_09_01"]
    geometry = reference["geometry_m"]
    dimensions = observed["dimensions_m"]
    if not math.isclose(dimensions["width"], MOON_WIDTH_M, abs_tol=1e-6):
        raise ValueError("Moon fan reference no longer matches its 600mm width")
    if not math.isclose(dimensions["height"], MOON_HEIGHT_M, abs_tol=1e-6):
        raise ValueError("Moon fan reference no longer matches its 380mm height")
    if observed["led_count"] != 78 or observed["segment_count"] != 2:
        raise ValueError("Moon fan must retain its documented 2 x 39 LED layout")

    centre_y = geometry["outer_arc_center_y"]
    radius_x = geometry["outer_arc_radius_x"]
    radius_y = geometry["outer_arc_radius_y"]
    notch_radius = geometry["fabric_notch_radius"]
    depth = geometry["fabric_depth"]
    frame_radius = geometry["frame_radius"]
    grip_tube = geometry["grip_tube_radius"]
    grip_inner = geometry["grip_inner_radius"]

    notch = [
        (
            notch_radius * math.cos(angle),
            notch_radius * math.sin(angle),
        )
        for angle in (
            math.radians(145 - 110 * index / 16) for index in range(17)
        )
    ]
    outer_arc = ellipse_arc(
        radius_x,
        radius_y,
        centre_y,
        segments=48,
        start_angle=0,
        end_angle=math.pi,
    )
    outline = [
        (-radius_x, centre_y),
        *notch,
        (radius_x, centre_y),
        *((x, y) for x, y, _ in outer_arc[1:]),
    ]
    skin = add_cut_sheet(
        "Fan_Moon_DiffusionSkin",
        outline,
        [],
        depth,
        fabric,
        parent,
    )
    skin["tka_build"] = "Lighttoys Moon LED fan"
    skin["tka_construction"] = "two-zone perimeter LEDs beneath diffusion fabric"
    skin["tka_reference"] = reference["product_url"]
    skin["tka_dimensions_m"] = [MOON_WIDTH_M, MOON_HEIGHT_M, depth]
    skin["tka_led_count"] = observed["led_count"]
    skin["tka_segment_count"] = observed["segment_count"]

    frame_z = -depth / 2 - frame_radius * 0.2
    outer_rod = add_round_rod(
        "Fan_Moon_OuterFrame",
        ellipse_arc(
            radius_x - frame_radius,
            radius_y - frame_radius,
            centre_y,
            segments=48,
            z=frame_z,
        ),
        frame_radius,
        frame,
        parent,
    )
    lower_left = add_round_rod(
        "Fan_Moon_LowerFrame_A",
        [(-radius_x, centre_y, frame_z), (notch[0][0], notch[0][1], frame_z)],
        frame_radius,
        frame,
        parent,
    )
    lower_right = add_round_rod(
        "Fan_Moon_LowerFrame_B",
        [(notch[-1][0], notch[-1][1], frame_z), (radius_x, centre_y, frame_z)],
        frame_radius,
        frame,
        parent,
    )
    centre_support = add_round_rod(
        "Fan_Moon_CentreSupport",
        [(0.0, notch_radius, frame_z), (0.0, centre_y + radius_y, frame_z)],
        frame_radius * 0.82,
        frame,
        parent,
    )
    diagonal_left = add_round_rod(
        "Fan_Moon_DiagonalSupport_A",
        [(0.0, notch_radius * 0.78, frame_z), (-radius_x * 0.72, centre_y + radius_y * 0.7, frame_z)],
        frame_radius * 0.62,
        frame,
        parent,
    )
    diagonal_right = add_round_rod(
        "Fan_Moon_DiagonalSupport_B",
        [(0.0, notch_radius * 0.78, frame_z), (radius_x * 0.72, centre_y + radius_y * 0.7, frame_z)],
        frame_radius * 0.62,
        frame,
        parent,
    )

    # The product's two controllable zones each carry 39 emitters. A narrow
    # continuous strip keeps the GLB light while the live effect renderer draws
    # the individual pattern and fabric falloff every frame.
    led_inset = frame_radius * 2.1
    led_left = add_round_rod(
        "Fan_Moon_LED_Segment_A",
        ellipse_arc(
            radius_x - led_inset,
            radius_y - led_inset,
            centre_y,
            segments=20,
            z=depth / 2 + 0.0007,
            start_angle=math.pi / 2,
            end_angle=math.pi,
        ),
        0.0022,
        led_a,
        parent,
    )
    led_right = add_round_rod(
        "Fan_Moon_LED_Segment_B",
        ellipse_arc(
            radius_x - led_inset,
            radius_y - led_inset,
            centre_y,
            segments=20,
            z=depth / 2 + 0.0007,
            start_angle=0,
            end_angle=math.pi / 2,
        ),
        0.0022,
        led_b,
        parent,
    )

    grip_main = add_torus(
        "Fan_Moon_GripRing",
        (0.0, 0.0, 0.0),
        grip_inner,
        grip_tube,
        grip_tube * 2,
        frame,
        parent,
    )
    grip_guard = add_torus(
        "Fan_Moon_GripGuard",
        (0.0, -0.002, -0.002),
        grip_inner + grip_tube * 2.5,
        grip_tube * 0.72,
        grip_tube * 1.45,
        frame,
        parent,
    )

    parent["tka_led_count"] = observed["led_count"]
    parent["tka_led_segments"] = observed["segment_count"]
    parent["tka_ring_hole_diameter_m"] = dimensions["ring_hole_diameter"]
    parent["tka_reference_images"] = reference["reference_images"]
    return [
        skin,
        outer_rod,
        lower_left,
        lower_right,
        centre_support,
        diagonal_left,
        diagonal_right,
        led_left,
        led_right,
        grip_main,
        grip_guard,
    ]


def build_astral_fan(
    parent: bpy.types.Object,
    frame: bpy.types.Material,
    diffuser: bpy.types.Material,
    led_materials: list[bpy.types.Material],
) -> list[bpy.types.Object]:
    """Build Astral's 19 x 15-inch, 66-pixel open-ring LED fan."""
    radius_x = ASTRAL_WIDTH_M / 2
    radius_y = 0.28
    centre_y = 0.04
    frame_z = -0.0045
    light_z = 0.0055
    outer_points = ellipse_arc(
        radius_x,
        radius_y,
        centre_y,
        segments=60,
        z=frame_z,
    )
    inner_points = ellipse_arc(
        radius_x - 0.014,
        radius_y - 0.014,
        centre_y,
        segments=60,
        z=light_z,
    )
    objects = [
        add_round_rod(
            "Fan_Astral_OuterFrame", outer_points, 0.0032, frame, parent
        ),
        add_round_rod(
            "Fan_Astral_BladeDiffuser", inner_points, 0.0063, diffuser, parent
        ),
        add_torus(
            "Fan_Astral_GripRing",
            (0, 0, 0),
            0.043,
            0.006,
            0.013,
            frame,
            parent,
        ),
        add_torus(
            "Fan_Astral_GripGuard",
            (0, -0.002, -0.002),
            0.057,
            0.0035,
            0.009,
            frame,
            parent,
        ),
    ]

    # Thirty emitters form the independently controllable outer blade.
    for index in range(30):
        angle = math.pi * index / 29
        point = ((radius_x - 0.014) * math.cos(angle),
                 centre_y + (radius_y - 0.014) * math.sin(angle), light_z)
        objects.append(
            add_led_pixel(
                f"Fan_Astral_Blade_LED_{index + 1:02d}",
                (point[0], point[1], light_z + 0.001),
                0.0042,
                led_materials[index % len(led_materials)],
                parent,
            )
        )

    # Six side rails carry six pixels apiece. The two named groups represented
    # by these meshes are the product's separate Blade and Sides controls.
    for rail_index, angle_degrees in enumerate((20, 48, 76, 104, 132, 160)):
        angle = math.radians(angle_degrees)
        target = (
            (radius_x - 0.014) * math.cos(angle),
            centre_y + (radius_y - 0.014) * math.sin(angle),
            frame_z,
        )
        start = (
            0.052 * math.cos(angle),
            0.052 * math.sin(angle),
            frame_z,
        )
        objects.append(
            add_round_rod(
                f"Fan_Astral_SideFrame_{rail_index + 1}",
                [start, target],
                0.003,
                frame,
                parent,
            )
        )
        objects.append(
            add_round_rod(
                f"Fan_Astral_SideDiffuser_{rail_index + 1}",
                [(start[0], start[1], light_z), (target[0], target[1], light_z)],
                0.0055,
                diffuser,
                parent,
            )
        )
        for pixel_index in range(6):
            amount = 0.14 + pixel_index * 0.16
            point = (
                start[0] * (1 - amount) + target[0] * amount,
                start[1] * (1 - amount) + target[1] * amount,
                light_z + 0.001,
            )
            color_index = (30 + rail_index * 6 + pixel_index) % len(led_materials)
            objects.append(
                add_led_pixel(
                    f"Fan_Astral_Sides_LED_{rail_index + 1}_{pixel_index + 1}",
                    point,
                    0.004,
                    led_materials[color_index],
                    parent,
                )
            )

    parent["tka_build"] = "Astral Starlight LED fan"
    parent["tka_construction"] = (
        "66 addressable pixels in open ring frame with blade and sides zones"
    )
    parent["tka_reference"] = "https://shop.astralhoops.com/products/led-fans"
    parent["tka_dimensions_m"] = [ASTRAL_WIDTH_M, ASTRAL_HEIGHT_M]
    parent["tka_led_count"] = ASTRAL_LED_COUNT
    parent["tka_blade_led_count"] = 30
    parent["tka_sides_led_count"] = 36
    parent["tka_led_segments"] = 2
    parent["tka_control_zones"] = ["blade", "sides"]
    return objects


def build_fire_frame(
    parent: bpy.types.Object,
    steel: bpy.types.Material,
    wick: bpy.types.Material,
    wick_band: bpy.types.Material,
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    reference = json.loads(DOODLEGRIP_FIRE_REFERENCE.read_text(encoding="utf-8"))
    geometry = reference["geometry_m"]
    if reference["published_dimensions_m"] != [FIRE_WIDTH_M, FIRE_HEIGHT_M]:
        raise ValueError("Fire DoodleGrip reference no longer matches 19 x 13 inches")
    if reference["lower_fan_excluded_below_px"] != reference[
        "isolated_upper_fan_bbox_px"
    ]["bottom"]:
        raise ValueError("Fire DoodleGrip cutout includes pixels from the lower fan")
    parent["tka_build"] = "Forged Creations five-wick DoodleGrip fire fan"
    parent["tka_dimensions_m"] = [FIRE_WIDTH_M, FIRE_HEIGHT_M]
    parent["tka_spinning_ring_id_m"] = FIRE_RING_DIAMETER_M
    parent["tka_wick_length_m"] = FIRE_WICK_LENGTH_M
    parent["tka_outer_spine_diameter_m"] = FIRE_OUTER_SPINE_RADIUS_M * 2
    parent["tka_inner_spine_diameter_m"] = FIRE_INNER_SPINE_RADIUS_M * 2
    parent["tka_reference_source"] = "https://forgedfans.com/products/doodlegrip-fire-fans"
    parent["tka_reference_bbox_px"] = list(
        reference["isolated_upper_fan_bbox_px"].values()
    )
    parent["tka_reference_pivot_px"] = reference["pivot_px"]
    parent["tka_reference_pixel_scale_m"] = reference["pixel_scale_m"]
    parent["tka_reference_lower_fan_excluded"] = True

    # One 1.5-inch spinning ring sits at the hand pivot. The visible lower U
    # and three welded spokes are the DoodleGrip handle from the supplied
    # five-wick reference, not a Russian grip or a cluster of separate rings.
    objects.append(
        add_torus(
            "Fan_Fire_GripRing",
            (0.0, 0.0, 0.0),
            FIRE_RING_DIAMETER_M / 2,
            FIRE_OUTER_SPINE_RADIUS_M,
            FIRE_OUTER_SPINE_RADIUS_M * 2,
            steel,
            parent,
        )
    )
    # The supplied front-on photo gives two symmetric rail intersections and
    # the cradle's bottom. Those three points determine one circle. The measured
    # lower-side landmark lands on that same circle within the source image's
    # pixel tolerance, so the photographed handle is a constant-radius arc, not
    # a tall ellipse or a landmark-to-landmark spline.
    shell_top = tuple(geometry["handle_shell_top"])
    shell_lower = tuple(geometry["handle_shell_lower"])
    shell_bottom = tuple(geometry["handle_shell_bottom"])
    shell_vertical_span = shell_top[1] - shell_bottom[1]
    shell_center_y = (
        shell_top[0] ** 2 + shell_top[1] ** 2 - shell_bottom[1] ** 2
    ) / (2 * shell_vertical_span)
    shell_radius = shell_center_y - shell_bottom[1]
    shell_left_angle = math.atan2(
        shell_top[1] - shell_center_y,
        shell_top[0],
    )
    shell_right_angle = math.atan2(
        shell_top[1] - shell_center_y,
        -shell_top[0],
    )
    shell_path = circle_arc(
        shell_radius,
        shell_center_y,
        segments=72,
        start_angle=shell_left_angle,
        end_angle=math.tau + shell_right_angle,
    )
    parent["tka_grip_shell_geometry"] = "constant-radius circle"
    parent["tka_grip_shell_radius_m"] = shell_radius
    objects.append(
        add_round_rod(
            "Fan_Fire_GripShell",
            shell_path,
            FIRE_OUTER_SPINE_RADIUS_M,
            steel,
            parent,
        )
    )
    bridge_x = math.sqrt(
        max(0.0, shell_radius**2 - (shell_lower[1] - shell_center_y) ** 2)
    )
    left_bridge_end = (
        -bridge_x,
        shell_lower[1],
        0.0,
    )
    right_bridge_end = (-left_bridge_end[0], left_bridge_end[1], 0.0)
    grip_bridges = (
        [(-0.0155, -0.014, 0.0), left_bridge_end],
        [(0.0, -0.0214, 0.0), (*shell_bottom, 0.0)],
        [(0.0155, -0.014, 0.0), right_bridge_end],
    )
    for index, points in enumerate(grip_bridges, start=1):
        objects.append(
            add_round_rod(
                f"Fan_Fire_GripBridge_{index}",
                points,
                FIRE_INNER_SPINE_RADIUS_M,
                steel,
                parent,
            )
        )

    outer_wick_x, outer_wick_y = geometry["outer_wick_center"]
    diagonal_wick_x, diagonal_wick_y = geometry["diagonal_wick_center"]
    center_wick_y = geometry["center_wick_center_y"]
    tip_centres = [
        Vector((-outer_wick_x, outer_wick_y, 0.0)),
        Vector((-diagonal_wick_x, diagonal_wick_y, 0.0)),
        Vector((0.0, center_wick_y, 0.0)),
        Vector((diagonal_wick_x, diagonal_wick_y, 0.0)),
        Vector((outer_wick_x, outer_wick_y, 0.0)),
    ]
    roots = [
        Vector((-0.021, 0.010, 0.0)),
        Vector((-0.011, 0.020, 0.0)),
        Vector((0.0, 0.0214, 0.0)),
        Vector((0.011, 0.020, 0.0)),
        Vector((0.021, 0.010, 0.0)),
    ]
    shell_joints = [
        Vector((shell_top[0], shell_top[1], 0.0)),
        Vector((-shell_top[0], shell_top[1], 0.0)),
    ]
    root_point = (roots[0].x, roots[0].y)
    shell_point = (shell_joints[0].x, shell_joints[0].y)
    root_to_shell = cubic_bezier_curve(
        root_point,
        (-0.033, 0.016),
        (-0.047, 0.027),
        shell_point,
        segments=10,
    )
    shell_to_wick = cubic_bezier_curve(
        shell_point,
        (
            shell_point[0] + (shell_point[0] - (-0.047)),
            shell_point[1] + (shell_point[1] - 0.027),
        ),
        (-0.165, outer_wick_y),
        (tip_centres[0].x, tip_centres[0].y),
        segments=24,
    )
    left_outer = [*root_to_shell, *shell_to_wick[1:]]
    right_outer = [(-x, y, z) for x, y, z in left_outer]
    spine_paths: list[list[tuple[float, float, float]]] = [
        left_outer,
        [(roots[1].x, roots[1].y, 0.0), (tip_centres[1].x, tip_centres[1].y, 0.0)],
        [(roots[2].x, roots[2].y, 0.0), (tip_centres[2].x, tip_centres[2].y, 0.0)],
        [(roots[3].x, roots[3].y, 0.0), (tip_centres[3].x, tip_centres[3].y, 0.0)],
        right_outer,
    ]

    def path_direction(path: list[tuple[float, float, float]]) -> Vector:
        return (Vector(path[-1]) - Vector(path[-2])).normalized()

    for index, (path, centre) in enumerate(zip(spine_paths, tip_centres), start=1):
        direction = path_direction(path)
        spike_end = centre + direction * 0.008
        extended_path = [*path[:-1], (spike_end.x, spike_end.y, spike_end.z)]
        spine_name = (
            "Fan_Fire_LeftRail"
            if index == 1
            else "Fan_Fire_RightRail"
            if index == 5
            else f"Fan_Fire_Spine_{index}"
        )
        objects.append(
            add_round_rod(
                spine_name,
                extended_path,
                FIRE_OUTER_SPINE_RADIUS_M
                if index in (1, 5)
                else FIRE_INNER_SPINE_RADIUS_M,
                steel,
                parent,
            )
        )
        wick_half = FIRE_WICK_LENGTH_M / 2
        wick_start = centre - direction * wick_half
        wick_end = centre + direction * wick_half
        objects.append(
            add_cylinder_between(
                f"Fan_Fire_Wick_{index}",
                wick_start,
                wick_end,
                0.0135,
                wick,
                parent,
                vertices=32,
            )
        )
        for wrap in (-0.012, 0.0, 0.012):
            band_centre = centre + direction * wrap
            band_start = band_centre - direction * 0.0008
            band_end = band_centre + direction * 0.0008
            objects.append(
                add_cylinder_between(
                    f"Fan_Fire_WickWrap_{index}_{wrap:+.3f}",
                    band_start,
                    band_end,
                    0.0138,
                    wick_band,
                    parent,
                    vertices=32,
                )
            )

    diagonal_cross_x = 0.0676
    outer_wick_y = tip_centres[0].y

    # The reference has one straight horizon through the two outside wick
    # mounts and a four-brace star above it. These endpoints land on the three
    # straight inner spines, so every weld describes a buildable joint.
    webbing = (
        (
            "WickHorizon",
            [
                (tip_centres[0].x, outer_wick_y, 0.0),
                (tip_centres[4].x, outer_wick_y, 0.0),
            ],
        ),
        (
            "UpperLeftStar",
            [
                (tip_centres[2].x, tip_centres[2].y, 0.0),
                (-diagonal_cross_x, outer_wick_y, 0.0),
                (tip_centres[1].x, tip_centres[1].y, 0.0),
                (0.0, outer_wick_y, 0.0),
            ],
        ),
        (
            "UpperRightStar",
            [
                (tip_centres[2].x, tip_centres[2].y, 0.0),
                (diagonal_cross_x, outer_wick_y, 0.0),
                (tip_centres[3].x, tip_centres[3].y, 0.0),
                (0.0, outer_wick_y, 0.0),
            ],
        ),
    )
    for suffix, points in webbing:
        objects.append(
            add_round_rod(
                f"Fan_Fire_{suffix}",
                points,
                FIRE_INNER_SPINE_RADIUS_M,
                steel,
                parent,
            )
        )
    return objects


def build_lotus_frame(
    parent: bpy.types.Object,
    steel: bpy.types.Material,
    wick: bpy.types.Material,
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    reference = json.loads(LOTUS_FIRE_REFERENCE.read_text(encoding="utf-8"))
    published = reference["published_construction"]
    geometry = reference["geometry_m"]
    if reference["published_dimensions_m"] != [LOTUS_WIDTH_M, LOTUS_HEIGHT_M]:
        raise ValueError("Lotus reference no longer matches the 480 x 350 mm fan")
    if published["spinning_ring_inside_diameter_m"] != LOTUS_RING_DIAMETER_M:
        raise ValueError("Lotus spinning ring no longer matches the published 3 5/8 inch ID")
    if published["frame_stock_diameter_m"] != LOTUS_FRAME_RADIUS_M * 2:
        raise ValueError("Lotus frame stock no longer matches the published 4 mm wire")
    if published["grip_stock_diameter_m"] != LOTUS_GRIP_RADIUS_M * 2:
        raise ValueError("Lotus grip stock no longer matches the published 7 mm wire")

    wick_roll_length = geometry["wick_roll_length_m"]
    wick_roll_lengths = geometry["wick_roll_lengths_m"]
    wick_diameters = geometry["wick_diameters_m"]
    if len(wick_roll_lengths) != 5 or len(wick_diameters) != 5:
        raise ValueError("Lotus reference must describe five measured wick rolls")
    wick_halves = [length / 2 for length in wick_roll_lengths]
    wick_centres = [
        Vector((*centre, 0.0)) for centre in geometry["wick_centers_m"]
    ]
    wick_directions = [
        Vector((*direction, 0.0)).normalized()
        for direction in geometry["wick_directions"]
    ]
    tine_insertion_depth = geometry["wick_tine_insertion_depth_m"]

    path_names = (
        "center_petal",
        "upper_outer_petal",
        "upper_inner_petal",
        "lower_outer_petal",
        "lower_inner_petal",
    )
    vector_path_ids = {
        f"{path_name.replace('_', '-')}-{side}"
        for path_name in path_names
        for side in ("left", "right")
    }
    vector_paths = import_svg_centerlines(
        LOTUS_FIRE_VECTOR_REFERENCE,
        vector_path_ids,
    )

    terminal_path_pairs = (
        ("lower-outer-petal-left", "lower-inner-petal-left"),
        ("upper-outer-petal-left", "upper-inner-petal-left"),
        ("center-petal-left", "center-petal-right"),
        ("upper-inner-petal-right", "upper-outer-petal-right"),
        ("lower-inner-petal-right", "lower-outer-petal-right"),
    )
    wick_terminal_pairs = [
        tuple(Vector(vector_paths[path_id][-1]) for path_id in pair)
        for pair in terminal_path_pairs
    ]
    wick_tine_pairs: list[tuple[tuple[Vector, Vector], tuple[Vector, Vector]]] = []
    # Blender's SVG importer resolves millimetre coordinates through 32-bit
    # curve data. Keep its sub-0.1 mm conversion noise from invalidating the
    # exact source endpoints while still rejecting any visible calibration drift.
    svg_import_tolerance = 1e-4
    for index, (centre, direction, wick_half, terminal_pair) in enumerate(
        zip(wick_centres, wick_directions, wick_halves, wick_terminal_pairs)
    ):
        wick_base = centre - direction * wick_half
        traced_base = (terminal_pair[0] + terminal_pair[1]) / 2
        if (traced_base - wick_base).length > svg_import_tolerance:
            raise ValueError(
                f"Lotus wick {index + 1} is not centered on its Illustrator terminal pair: "
                f"traced={tuple(traced_base)}, calibrated={tuple(wick_base)}, "
                f"drift={(traced_base - wick_base).length}"
            )
        for terminal in terminal_pair:
            if abs((terminal - wick_base).dot(direction)) > svg_import_tolerance:
                raise ValueError(
                    f"Lotus wick {index + 1} terminal is not on the inward-facing cap"
                )
        wick_tine_pairs.append(
            tuple(
                (terminal, terminal + direction * tine_insertion_depth)
                for terminal in terminal_pair
            )
        )
    left_path_tines = {
        "center_petal": wick_tine_pairs[2][0],
        "upper_outer_petal": wick_tine_pairs[1][0],
        "upper_inner_petal": wick_tine_pairs[1][1],
        "lower_outer_petal": wick_tine_pairs[0][0],
        "lower_inner_petal": wick_tine_pairs[0][1],
    }
    right_path_tines = {
        "center_petal": wick_tine_pairs[2][1],
        "upper_outer_petal": wick_tine_pairs[3][1],
        "upper_inner_petal": wick_tine_pairs[3][0],
        "lower_outer_petal": wick_tine_pairs[4][1],
        "lower_inner_petal": wick_tine_pairs[4][0],
    }

    parent["tka_build"] = "Home of Poi Medium Lotus five-wick fire fan"
    parent["tka_dimensions_m"] = [LOTUS_WIDTH_M, LOTUS_HEIGHT_M]
    parent["tka_spinning_ring_id_m"] = LOTUS_RING_DIAMETER_M
    parent["tka_finger_ring_id_m"] = geometry["finger_ring_inside_diameter_m"]
    parent["tka_finger_ring_center_m"] = [
        geometry["finger_ring_center_x"],
        geometry["finger_ring_center_y"],
    ]
    parent["tka_grip_ring_center_m"] = [
        geometry["grip_ring_center_x"],
        geometry["grip_ring_center_y"],
    ]
    parent["tka_wick_tape_width_m"] = published["wick_length_m"]
    parent["tka_wick_roll_length_m"] = wick_roll_length
    parent["tka_wick_roll_lengths_m"] = wick_roll_lengths
    parent["tka_wick_diameters_m"] = wick_diameters
    parent["tka_wick_diameter_m"] = reference["calibration"]["wick_diameter_m"]
    parent["tka_wick_mount"] = (
        "intact Illustrator SVG terminals through inward-facing end caps"
    )
    parent["tka_wick_tine_insertion_depth_m"] = tine_insertion_depth
    parent["tka_frame_stock_diameter_m"] = LOTUS_FRAME_RADIUS_M * 2
    parent["tka_grip_stock_diameter_m"] = LOTUS_GRIP_RADIUS_M * 2
    parent["tka_reference_source"] = reference["source"]
    parent["tka_reference_image"] = reference["source_image"]
    parent["tka_reference_bbox_px"] = list(reference["fan_bbox_px"].values())
    parent["tka_reference_pivot_px"] = reference["pivot_px"]
    parent["tka_reference_pixel_scale_m"] = reference["pixel_scale_m"]
    parent["tka_reference_symmetry"] = reference["calibration"]["symmetry"]
    parent["tka_petal_count"] = 5
    parent["tka_frame_path_count"] = 10
    parent["tka_frame_symmetry"] = "mirrored Illustrator SVG centerlines"
    parent["tka_vector_reference"] = str(
        LOTUS_FIRE_VECTOR_REFERENCE.relative_to(ROOT)
    ).replace("\\", "/")
    parent["tka_vector_path_count"] = 10
    parent["tka_side_weld_boss_count"] = len(geometry["side_weld_bosses"])
    parent["tka_finger_ring_brace_count"] = 0
    parent["tka_finger_ring_weld_count"] = 3
    parent["tka_rail_root_weld_count"] = 10
    parent["tka_wick_centers_m"] = [list(centre) for centre in wick_centres]
    parent["tka_wick_directions_m"] = [
        list(direction) for direction in wick_directions
    ]
    parent["tka_wick_tine_pairs_m"] = [
        [[list(neck), list(entry)] for neck, entry in pair]
        for pair in wick_tine_pairs
    ]

    objects.append(
        add_torus(
            "Fan_Lotus_GripRing",
            (
                geometry["grip_ring_center_x"],
                geometry["grip_ring_center_y"],
                0.0,
            ),
            LOTUS_RING_DIAMETER_M / 2,
            LOTUS_GRIP_RADIUS_M,
            LOTUS_GRIP_RADIUS_M * 2,
            steel,
            parent,
        )
    )
    objects.append(
        add_torus(
            "Fan_Lotus_FingerRing",
            (
                geometry["finger_ring_center_x"],
                geometry["finger_ring_center_y"],
                0.0,
            ),
            geometry["finger_ring_inside_diameter_m"] / 2,
            LOTUS_FRAME_RADIUS_M,
            LOTUS_FRAME_RADIUS_M * 2,
            steel,
            parent,
        )
    )
    bottom_weld = geometry["finger_ring_bottom_weld"]
    objects.append(
        add_weld_bead(
            "Fan_Lotus_FingerWeld_Lower",
            tuple(bottom_weld["center"]),
            bottom_weld["radius"],
            steel,
            parent,
        )
    )

    cradle_join_x = abs(geometry["cradle_join"][0])
    cradle_join_y = geometry["cradle_join"][1]
    cradle_bottom_y = geometry["cradle_bottom_y"]
    cradle_centre_y = (
        cradle_join_x**2 + cradle_join_y**2 - cradle_bottom_y**2
    ) / (2 * (cradle_join_y - cradle_bottom_y))
    cradle_radius = cradle_centre_y - cradle_bottom_y
    cradle_left_angle = math.atan2(
        cradle_join_y - cradle_centre_y,
        -cradle_join_x,
    )
    cradle_right_angle = math.atan2(
        cradle_join_y - cradle_centre_y,
        cradle_join_x,
    )
    parent["tka_lower_cradle_geometry"] = "constant-radius circle"
    parent["tka_lower_cradle_radius_m"] = cradle_radius
    objects.append(
        add_round_rod(
            "Fan_Lotus_LowerCradle",
            circle_arc(
                cradle_radius,
                cradle_centre_y,
                start_angle=cradle_left_angle,
                end_angle=math.tau + cradle_right_angle,
            ),
            LOTUS_FRAME_RADIUS_M,
            steel,
            parent,
        )
    )

    def build_frame_rod(
        name: str,
        traced_path: list[tuple[float, float, float]],
        neck: Vector,
        entry: Vector,
    ) -> bpy.types.Object:
        """Keep every visible point authored in Illustrator; extend only inside the wick."""
        if (Vector(traced_path[-1]) - neck).length > 1e-7:
            raise ValueError(f"{name} no longer reaches its Illustrator endpoint")
        path = list(traced_path)
        path.extend(
            tuple(neck.lerp(entry, step / 8))
            for step in range(1, 9)
        )
        rod = add_round_rod(
            name,
            path,
            LOTUS_FRAME_RADIUS_M,
            steel,
            parent,
        )
        rod["tka_wick_tine_neck_m"] = list(neck)
        rod["tka_wick_tine_entry_m"] = list(entry)
        return rod

    for path_name in path_names:
        readable_name = "".join(part.title() for part in path_name.split("_"))
        objects.append(
            build_frame_rod(
                f"Fan_Lotus_{readable_name}_Left",
                vector_paths[f"{path_name.replace('_', '-')}-left"],
                *left_path_tines[path_name],
            )
        )
        objects.append(
            build_frame_rod(
                f"Fan_Lotus_{readable_name}_Right",
                vector_paths[f"{path_name.replace('_', '-')}-right"],
                *right_path_tines[path_name],
            )
        )

    for boss in geometry["side_weld_bosses"]:
        objects.append(
            add_weld_boss(
                f"Fan_Lotus_SideWeld_{boss['name']}",
                tuple(boss["center"]),
                tuple(boss["half_extents"]),
                boss["phase"],
                steel,
                parent,
            )
        )

    weld_points = [
        vector_paths[f"{path_name.replace('_', '-')}-{side}"][0]
        for side in ("left", "right")
        for path_name in (
            "center_petal",
            "upper_outer_petal",
            "upper_inner_petal",
            "lower_outer_petal",
            "lower_inner_petal",
        )
    ]
    for index, point in enumerate(weld_points, start=1):
        objects.append(
            add_weld_bead(
                f"Fan_Lotus_Weld_{index}",
                point,
                0.0025,
                steel,
                parent,
            )
        )

    for index, (centre, direction, wick_half, wick_diameter) in enumerate(
        zip(
            wick_centres,
            wick_directions,
            wick_halves,
            wick_diameters,
        ),
        start=1,
    ):
        objects.append(
            add_woven_cylinder_between(
                f"Fan_Lotus_Wick_{index}",
                centre - direction * wick_half,
                centre + direction * wick_half,
                wick_diameter / 2,
                wick,
                parent,
            )
        )
    return objects


def build_cover(
    parent: bpy.types.Object,
    solid: bpy.types.Material,
    stripe_light: bpy.types.Material,
    stripe_dark: bpy.types.Material,
    seam: bpy.types.Material,
) -> list[bpy.types.Object]:
    # The sleeve follows the actual five-wick crown: its ends close around the
    # two horizontal outside wicks and its top clears the centre wick.
    reference = json.loads(DOODLEGRIP_FIRE_REFERENCE.read_text(encoding="utf-8"))
    geometry = reference["geometry_m"]
    outer_wick_x, outer_wick_y = geometry["outer_wick_center"]
    diagonal_wick_x, diagonal_wick_y = geometry["diagonal_wick_center"]
    centre_wick_top = geometry["center_wick_center_y"] + FIRE_WICK_LENGTH_M / 2
    cover_edge_x = outer_wick_x + FIRE_WICK_LENGTH_M / 2
    outer = ellipse_arc(
        cover_edge_x + 0.0022,
        centre_wick_top - outer_wick_y,
        outer_wick_y,
        segments=48,
    )
    # This is a physical sleeve over the intact fire fan, not a replacement
    # silhouette. Its lower seam follows just inside all five wick rolls, so the
    # fabric occludes them while the complete frame and wicks remain in the GLB.
    seam_clearance = 0.0022
    wick_clearance = 0.0138 + seam_clearance
    inner_edge_y = outer_wick_y - wick_clearance
    inner = catmull_rom_curve(
        [
            (cover_edge_x + seam_clearance, inner_edge_y),
            (outer_wick_x, inner_edge_y),
            (diagonal_wick_x, diagonal_wick_y - wick_clearance),
            (
                0.0,
                geometry["center_wick_center_y"]
                - FIRE_WICK_LENGTH_M / 2
                - seam_clearance,
            ),
            (-diagonal_wick_x, diagonal_wick_y - wick_clearance),
            (-outer_wick_x, inner_edge_y),
            (-cover_edge_x - seam_clearance, inner_edge_y),
        ],
        segments_per_span=8,
    )
    front = add_cover_surface(
        "Fan_Cover_SolidFace",
        outer,
        inner,
        0.0145,
        [solid],
        parent,
        striped=False,
    )
    back = add_cover_surface(
        "Fan_Cover_StripedFace",
        outer,
        inner,
        -0.0145,
        [stripe_dark, stripe_light],
        parent,
        striped=True,
    )
    objects = [front, back]
    for suffix, points in (
        ("OuterSeam", outer),
        ("InnerSeam", inner),
        ("LeftSeam", [outer[-1], inner[-1]]),
        ("RightSeam", [outer[0], inner[0]]),
    ):
        objects.append(
            add_round_rod(
                f"Fan_Cover_{suffix}", points, 0.0022, seam, parent
            )
        )
    return objects


def build_asset() -> tuple[
    bpy.types.Object,
    dict[str, bpy.types.Object],
    list[bpy.types.Object],
    dict[str, bpy.types.Material],
]:
    root = add_empty("TKA_Fan")
    root["tka_asset"] = "doodle-style fan"
    root["tka_hand_pivot"] = "grip ring centre"
    root["tka_day_dimensions_m"] = [DAY_WIDTH_M, DAY_HEIGHT_M, DAY_DEPTH_M]
    root["tka_day_ring_diameter_m"] = 0.044
    root["tka_fire_dimensions_m"] = [FIRE_WIDTH_M, FIRE_HEIGHT_M]
    root["tka_lotus_dimensions_m"] = [LOTUS_WIDTH_M, LOTUS_HEIGHT_M]
    root["tka_moon_dimensions_m"] = [MOON_WIDTH_M, MOON_HEIGHT_M]
    root["tka_astral_dimensions_m"] = [ASTRAL_WIDTH_M, ASTRAL_HEIGHT_M]
    fire_reference = json.loads(DOODLEGRIP_FIRE_REFERENCE.read_text())
    fire_geometry = fire_reference["geometry_m"]
    outer_x, outer_y = fire_geometry["outer_wick_center"]
    diagonal_x, diagonal_y = fire_geometry["diagonal_wick_center"]
    root["tka_wick_centers_m"] = [
        [-outer_x, outer_y, 0.0],
        [-diagonal_x, diagonal_y, 0.0],
        [0.0, fire_geometry["center_wick_center_y"], 0.0],
        [diagonal_x, diagonal_y, 0.0],
        [outer_x, outer_y, 0.0],
    ]
    lotus_reference = json.loads(LOTUS_FIRE_REFERENCE.read_text())
    lotus_geometry = lotus_reference["geometry_m"]
    root["tka_lotus_wick_centers_m"] = [
        [*centre, 0.0] for centre in lotus_geometry["wick_centers_m"]
    ]

    groups = {
        "fire": add_empty("Fan_Fire", root),
        "lotus": add_empty("Fan_Lotus", root),
        "day": add_empty("Fan_Day", root),
        "moon": add_empty("Fan_Moon", root),
        "astral": add_empty("Fan_Astral", root),
        "cover": add_empty("Fan_Cover", root),
    }
    materials = {
        "fire": make_material(
            "TKA_Fan_Fire_Steel", (0.045, 0.038, 0.032, 1), roughness=0.48, metallic=0.76
        ),
        "lotus": make_material(
            "TKA_Fan_Lotus_Powdercoat",
            (0.045, 0.05, 0.06, 1),
            roughness=0.58,
            metallic=0.0,
            coat=0.08,
        ),
        "wick": make_material(
            "TKA_Fan_Wick", (0.72, 0.55, 0.29, 1), roughness=0.96
        ),
        "lotus_wick": make_woven_wick_material("TKA_Fan_Lotus_Wick"),
        "wick_band": make_material(
            "TKA_Fan_Wick_Wrap", (0.34, 0.22, 0.09, 1), roughness=0.82
        ),
        "day": make_material(
            "TKA_Fan_Day_Frame", (0.025, 0.028, 0.034, 1), roughness=0.72, coat=0.08
        ),
        "moon_fabric": make_material(
            "TKA_Fan_Moon_Fabric",
            (0.92, 0.94, 0.98, 0.94),
            roughness=0.88,
            coat=0.04,
        ),
        "moon_frame": make_material(
            "TKA_Fan_Moon_Frame",
            (0.25, 0.08, 0.46, 1.0),
            roughness=0.34,
            metallic=0.58,
            coat=0.18,
        ),
        "moon_led_a": make_material(
            "TKA_Fan_Moon_LED_A", (0.16, 0.22, 0.34, 1.0), roughness=0.24
        ),
        "moon_led_b": make_material(
            "TKA_Fan_Moon_LED_B", (0.28, 0.12, 0.28, 1.0), roughness=0.24
        ),
        "astral_frame": make_material(
            "TKA_Fan_Astral_Frame",
            (0.018, 0.022, 0.03, 1),
            roughness=0.46,
            metallic=0.34,
            coat=0.16,
        ),
        "astral_diffuser": make_material(
            "TKA_Fan_Astral_Diffuser",
            (0.88, 0.92, 0.98, 1),
            roughness=0.26,
            coat=0.24,
        ),
        "cover_solid": make_material(
            "TKA_Fan_Cover_Solid_Recolor", (0.73, 0.08, 0.18, 1), roughness=0.82
        ),
        "cover_dark": make_material(
            "TKA_Fan_Cover_Stripe_Dark", (0.012, 0.014, 0.02, 1), roughness=0.86
        ),
        "cover_light": make_material(
            "TKA_Fan_Cover_Stripe_Light", (0.91, 0.90, 0.84, 1), roughness=0.88
        ),
        "cover_seam": make_material(
            "TKA_Fan_Cover_Seam", (0.35, 0.025, 0.06, 1), roughness=0.78
        ),
    }

    objects: list[bpy.types.Object] = []
    objects.extend(build_day_frame(groups["day"], materials["day"]))
    objects.extend(
        build_moon_fan(
            groups["moon"],
            materials["moon_fabric"],
            materials["moon_frame"],
            materials["moon_led_a"],
            materials["moon_led_b"],
        )
    )
    astral_led_materials = [
        make_led_material("TKA_Fan_Astral_LED_1", (1.0, 0.03, 0.14, 1)),
        make_led_material("TKA_Fan_Astral_LED_2", (1.0, 0.34, 0.03, 1)),
        make_led_material("TKA_Fan_Astral_LED_3", (0.95, 0.92, 0.05, 1)),
        make_led_material("TKA_Fan_Astral_LED_4", (0.05, 1.0, 0.34, 1)),
        make_led_material("TKA_Fan_Astral_LED_5", (0.04, 0.42, 1.0, 1)),
        make_led_material("TKA_Fan_Astral_LED_6", (0.72, 0.05, 1.0, 1)),
    ]
    materials["astral_led_materials"] = astral_led_materials[0]
    objects.extend(
        build_astral_fan(
            groups["astral"],
            materials["astral_frame"],
            materials["astral_diffuser"],
            astral_led_materials,
        )
    )
    objects.extend(
        build_fire_frame(
            groups["fire"], materials["fire"], materials["wick"], materials["wick_band"]
        )
    )
    objects.extend(
        build_lotus_frame(
            groups["lotus"], materials["lotus"], materials["lotus_wick"]
        )
    )
    objects.extend(
        build_cover(
            groups["cover"],
            materials["cover_solid"],
            materials["cover_light"],
            materials["cover_dark"],
            materials["cover_seam"],
        )
    )
    for obj in objects:
        obj["tka_runtime_layer"] = obj.parent.name if obj.parent else ""
    return root, groups, objects, materials


def export_glb(
    output_path: Path,
    root: bpy.types.Object,
    groups: dict[str, bpy.types.Object],
    objects: list[bpy.types.Object],
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for item in [root, *groups.values(), *objects]:
        item.select_set(True)
    bpy.context.view_layer.objects.active = root
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
            export_materials="EXPORT",
            export_cameras=False,
            export_lights=False,
            export_animations=False,
        )
    finally:
        root.rotation_euler.x = 0.0


def point_at(obj: bpy.types.Object, target: Vector) -> None:
    direction = target - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def configure_proof_scene() -> bpy.types.Object:
    world = bpy.context.scene.world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.006, 0.009, 0.018, 1.0)
    background.inputs["Strength"].default_value = 0.25
    for name, location, energy, size, color in (
        ("QA_Key", (-0.65, -0.2, 0.85), 150, 0.72, (1.0, 0.84, 0.68)),
        ("QA_Fill", (0.7, 0.0, 0.55), 90, 0.62, (0.38, 0.62, 1.0)),
        ("QA_Rim", (0.0, 0.55, -0.7), 110, 0.56, (0.95, 0.16, 0.1)),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.shape = "DISK"
        light.data.size = size
        light.data.color = color
        point_at(light, Vector((0.0, 0.11, 0.0)))
    bpy.ops.object.camera_add(location=(0.0, 0.11, 0.82))
    camera = bpy.context.object
    camera.name = "QA_Camera"
    camera.data.lens = 60
    point_at(camera, Vector((0.0, 0.11, 0.0)))
    bpy.context.scene.camera = camera
    return camera


def render_proofs(
    render_dir: Path,
    groups: dict[str, bpy.types.Object],
    materials: dict[str, bpy.types.Material],
) -> None:
    render_dir.mkdir(parents=True, exist_ok=True)
    camera = configure_proof_scene()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1000
    scene.render.resolution_y = 760
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = -1.0

    def show_group(group: bpy.types.Object, show: bool) -> None:
        # Blender does not consistently propagate an Empty's render flag to
        # converted curve meshes. Set every child explicitly so each proof is
        # one real configuration rather than several variants overlaid.
        group.hide_render = not show
        for child in group.children_recursive:
            child.hide_render = not show

    variants = (
        ("fire-bare", True, False, False, False, "black", False),
        ("fire-bare-back", True, False, False, False, "black", True),
        ("fire-covered-solid", True, False, False, True, "black", False),
        ("fire-covered-striped", True, False, False, True, "black", True),
        ("lotus-bare", False, True, False, False, "black", False),
        ("lotus-bare-back", False, True, False, False, "black", True),
        ("lotus-covered-solid", False, True, False, True, "black", False),
        ("lotus-covered-striped", False, True, False, True, "black", True),
        ("day-black-bare", False, False, True, False, "black", False),
        ("day-black-covered-solid", False, False, True, True, "black", False),
        ("day-white-bare", False, False, True, False, "white", False),
        ("day-white-covered-solid", False, False, True, True, "white", False),
        ("day-white-covered-striped", False, False, True, True, "white", True),
    )
    for label, fire, lotus, day, cover, day_color, rear in variants:
        show_group(groups["fire"], fire)
        show_group(groups["lotus"], lotus)
        show_group(groups["day"], day)
        show_group(groups["moon"], False)
        show_group(groups["cover"], cover)
        set_material_color(
            materials["day"],
            (0.84, 0.86, 0.90, 1.0) if day_color == "white" else (0.025, 0.028, 0.034, 1.0),
        )
        camera.location.z = -0.82 if rear else 0.82
        point_at(camera, Vector((0.0, 0.11, 0.0)))
        scene.render.filepath = str(render_dir / f"fan-{label}.png")
        bpy.ops.render.render(write_still=True)

    show_group(groups["fire"], False)
    show_group(groups["lotus"], False)
    show_group(groups["day"], False)
    show_group(groups["cover"], False)
    show_group(groups["moon"], True)
    # Moon is wider than the existing fire/day families. Pull its proof camera
    # back so the full 600mm diffuser and both outer corners stay in frame.
    camera.location.z = 1.08
    point_at(camera, Vector((0.0, 0.11, 0.0)))
    scene.render.film_transparent = True
    scene.render.filepath = str(render_dir / "fan-moon-unlit.png")
    bpy.ops.render.render(write_still=True)
    scene.render.film_transparent = False

    # The handle is too small to judge honestly in the full-fan proof. Keep a
    # straight-on inspection frame that makes a flat spot, changing radius, or
    # left/right mismatch immediately visible.
    show_group(groups["fire"], True)
    show_group(groups["moon"], False)
    show_group(groups["lotus"], False)
    show_group(groups["day"], False)
    show_group(groups["cover"], False)
    camera.location = (0.0, -0.006, 0.23)
    point_at(camera, Vector((0.0, -0.006, 0.0)))
    scene.render.filepath = str(render_dir / "fan-fire-grip-closeup.png")
    bpy.ops.render.render(write_still=True)

    show_group(groups["fire"], False)
    show_group(groups["lotus"], True)
    camera.location = (0.0, 0.0, 0.32)
    point_at(camera, Vector((0.0, 0.0, 0.0)))
    scene.render.filepath = str(render_dir / "fan-lotus-grip-closeup.png")
    bpy.ops.render.render(write_still=True)

    # The wick relief is real geometry, not a flat colour. Keep a macro proof
    # so braided rows, rolled edges, and scale remain reviewable after GLB
    # compression or future material changes.
    centre_y = groups["lotus"]["tka_wick_centers_m"][2][1]
    camera.location = (0.0, centre_y, 0.11)
    point_at(camera, Vector((0.0, centre_y, 0.0)))
    scene.render.filepath = str(render_dir / "fan-lotus-wick-closeup.png")
    bpy.ops.render.render(write_still=True)


def print_summary(output_path: Path, objects: list[bpy.types.Object]) -> None:
    meshes = [obj for obj in objects if obj.type == "MESH"]
    triangles = sum(len(obj.data.loop_triangles) for obj in meshes)
    vertices = sum(len(obj.data.vertices) for obj in meshes)
    print(f"FAN_OUTPUT={output_path}")
    print(f"FAN_BYTES={output_path.stat().st_size}")
    print(f"FAN_MESHES={len(meshes)}")
    print(f"FAN_VERTICES={vertices}")
    print(f"FAN_TRIANGLES={triangles}")
    print(f"FAN_DAY_SIZE_M={DAY_WIDTH_M},{DAY_HEIGHT_M},{DAY_DEPTH_M}")
    print(f"FAN_FIRE_SIZE_M={FIRE_WIDTH_M},{FIRE_HEIGHT_M}")
    print(f"FAN_LOTUS_SIZE_M={LOTUS_WIDTH_M},{LOTUS_HEIGHT_M}")
    print(f"FAN_MOON_SIZE_M={MOON_WIDTH_M},{MOON_HEIGHT_M}")
    print("FAN_HAND_PIVOT=0,0,0")


def main() -> None:
    args = parse_args()
    reset_scene()
    root, groups, objects, materials = build_asset()
    output_path = args.output.resolve()
    export_glb(output_path, root, groups, objects)
    if args.blend:
        blend_path = args.blend.resolve()
        blend_path.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    if args.render_dir:
        render_proofs(args.render_dir.resolve(), groups, materials)
    print_summary(output_path, objects)


if __name__ == "__main__":
    main()
