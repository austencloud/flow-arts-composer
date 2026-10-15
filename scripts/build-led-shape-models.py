"""Build manufactured triquetra and station-based Triangle review assemblies.

The GLB contains independently switchable day and LED groups for each shape.
Round tubing, nested diffuser/core construction, discrete emitters, connector
housings, and the triquetra's removable centre ring are authored as physical
parts instead of painted onto a flat plate.

Usage:
  blender --background --factory-startup --python scripts/build-led-shape-models.py
  python scripts/build-led-shape-models.py --layout-json
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "static" / "models" / "props" / "led-shapes.glb"

TRIQUETRA_DIAMETER_M = 0.5842  # Published 23-inch build.
STATIONS = json.loads((ROOT / "scripts" / "hoop-family-stations.json").read_text())
TRIANGLE_SIDE_M = STATIONS["triangle_side_mm"]["value"] / 1000
TRIANGLE_SAGITTA_M = STATIONS["triangle_sagitta_mm"]["value"] / 1000
TRIANGLE_TUBE_RADIUS_M = STATIONS["tube_od_mm"]["value"] / 2000
TRIANGLE_SLEEVE_RADIUS_M = TRIANGLE_TUBE_RADIUS_M * STATIONS["hardware_ratio"]["value"]
TRIANGLE_ELBOW_LEG_M = STATIONS["elbow_leg_mm"]["value"] / 1000
TRIQUETRA_LED_COUNT = 60
TRIANGLE_LED_COUNT = 48


def parse_args() -> argparse.Namespace:
    argv = (
        sys.argv[sys.argv.index("--") + 1 :]
        if "--" in sys.argv
        else (
            sys.argv[1:] if Path(sys.argv[0]).name == Path(__file__).name else []
        )
    )
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--blend", type=Path)
    parser.add_argument(
        "--layout-json", action="store_true",
        help="Print geometry without Blender or file writes",
    )
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
    *,
    roughness: float,
    metallic: float = 0.0,
    transmission: float = 0.0,
    emission: tuple[float, float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.diffuse_color = color
    material.use_nodes = True
    material.surface_render_method = "DITHERED"
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = metallic
    if "Transmission Weight" in principled.inputs:
        principled.inputs["Transmission Weight"].default_value = transmission
    if "Alpha" in principled.inputs:
        principled.inputs["Alpha"].default_value = color[3]
    if emission:
        if "Emission Color" in principled.inputs:
            principled.inputs["Emission Color"].default_value = emission
        elif "Emission" in principled.inputs:
            principled.inputs["Emission"].default_value = emission
        if "Emission Strength" in principled.inputs:
            principled.inputs["Emission Strength"].default_value = emission_strength
    return material


def add_empty(name: str, parent: bpy.types.Object | None = None) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    return obj


def add_round_tube(
    name: str,
    points: list[tuple[float, float, float]],
    radius: float,
    material: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    cyclic: bool = True,
    resolution: int = 3,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = radius
    curve.bevel_resolution = resolution
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, (x, y, z) in zip(spline.points, points):
        point.co = (x, y, z, 1.0)
    spline.use_cyclic_u = cyclic
    curve.materials.append(material)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    return obj


def add_torus(
    name: str,
    center: tuple[float, float, float],
    major_radius: float,
    minor_radius: float,
    material: bpy.types.Material,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        align="WORLD",
        location=center,
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=48,
        minor_segments=12,
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.data.name = name
    obj.data.materials.append(material)
    obj.parent = parent
    return obj


def add_emitter(
    name: str,
    point: tuple[float, float, float],
    material: bpy.types.Material,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=10,
        ring_count=6,
        radius=0.0045,
        location=point,
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.data.name = name
    obj.data.materials.append(material)
    obj.parent = parent
    return obj


def add_connector_housing(
    name: str,
    center: tuple[float, float, float],
    material: bpy.types.Material,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    """Low-profile molded junction cap, never an extra performer grip ring."""
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=18,
        ring_count=8,
        radius=1.0,
        location=center,
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.data.name = name
    obj.scale = (0.018, 0.018, 0.010)
    obj.data.materials.append(material)
    obj.parent = parent
    return obj


def triquetra_points(count: int = 120) -> list[tuple[float, float, float]]:
    """Classic projected trefoil with three self-crossings and a depth weave."""
    # sin(t)+2sin(2t), -cos(t)+2cos(2t) is the standard three-lobed trefoil
    # projection. Its x extent is 5.47132 units; leave one tube diameter inside
    # the published 23-inch outside width.
    scale = (TRIQUETRA_DIAMETER_M - 0.028) / 5.47132
    points: list[tuple[float, float, float]] = []
    for index in range(count):
        angle = math.tau * index / count
        x = scale * (math.sin(angle) + 2 * math.sin(2 * angle))
        y = scale * (-math.cos(angle) + 2 * math.cos(2 * angle))
        z = 0.0065 * math.sin(3 * angle)
        points.append((x, y, z))
    return points


def triangle_vertices(grip: str) -> list[tuple[float, float, float]]:
    half = TRIANGLE_SIDE_M / 2
    height = TRIANGLE_SIDE_M * math.sqrt(3) / 2
    if grip == "side":
        return [
            (-half, TRIANGLE_SAGITTA_M, 0),
            (half, TRIANGLE_SAGITTA_M, 0),
            (0, TRIANGLE_SAGITTA_M + height, 0),
        ]
    return [(0, 0, 0), (half, height, 0), (-half, height, 0)]


def triangle_points(grip: str) -> list[tuple[float, float, float]]:
    vertices = triangle_vertices(grip)
    cx = sum(p[0] for p in vertices) / 3
    cy = sum(p[1] for p in vertices) / 3
    radius = TRIANGLE_SIDE_M ** 2 / (8 * TRIANGLE_SAGITTA_M) + TRIANGLE_SAGITTA_M / 2
    arc = 2 * math.asin(TRIANGLE_SIDE_M / (2 * radius))
    points = []
    for index, p in enumerate(vertices):
        q = vertices[(index + 1) % 3]
        mx, my = (p[0] + q[0]) / 2, (p[1] + q[1]) / 2
        nx, ny = mx - cx, my - cy
        length = math.hypot(nx, ny)
        ox = mx - nx / length * (radius - TRIANGLE_SAGITTA_M)
        oy = my - ny / length * (radius - TRIANGLE_SAGITTA_M)
        start = math.atan2(ny, nx) - arc / 2
        for sample in range(96):
            angle = start + arc * sample / 96
            points.append((
                ox + radius * math.cos(angle),
                oy + radius * math.sin(angle), 0,
            ))
    return points


def presented_triquetra_points(grip: str) -> list[tuple[float, float, float]]:
    scale = (TRIQUETRA_DIAMETER_M - 0.028) / 5.47132
    if grip == "tip":
        return [(-x, 3 * scale - y, z) for x, y, z in triquetra_points()]
    return [(x, y + 1.5 * scale, z) for x, y, z in triquetra_points()]


def layout_data() -> dict:
    return {
        "triquetra": sample_path(
            presented_triquetra_points("armpit"), TRIQUETRA_LED_COUNT,
        ),
        "triquetra2": sample_path(
            presented_triquetra_points("tip"), TRIQUETRA_LED_COUNT,
        ),
        "triangle": sample_path(triangle_points("corner"), TRIANGLE_LED_COUNT),
        "triangle_side": sample_path(triangle_points("side"), TRIANGLE_LED_COUNT),
    }


def sample_path(
    points: list[tuple[float, float, float]], count: int
) -> list[tuple[float, float, float]]:
    """Resample a closed path by physical distance, not control-point density."""
    cumulative = [0.0]
    for index, point in enumerate(points):
        next_point = points[(index + 1) % len(points)]
        cumulative.append(cumulative[-1] + math.dist(point, next_point))
    total_length = cumulative[-1]
    sampled: list[tuple[float, float, float]] = []
    for index in range(count):
        target = index * total_length / count
        left = 0
        while left + 1 < len(cumulative) and cumulative[left + 1] < target:
            left += 1
        right = (left + 1) % len(points)
        segment_length = cumulative[left + 1] - cumulative[left]
        t = (target - cumulative[left]) / segment_length if segment_length else 0
        sampled.append(
            tuple(
                points[left][axis] * (1 - t) + points[right][axis] * t
                for axis in range(3)
            )
        )
    return sampled


def build_shape(
    name: str,
    points: list[tuple[float, float, float]],
    day_parent: bpy.types.Object,
    led_parent: bpy.types.Object,
    day_material: bpy.types.Material,
    shell_material: bpy.types.Material,
    light_core_material: bpy.types.Material,
    core_materials: list[bpy.types.Material],
    connector_material: bpy.types.Material,
    emitter_count: int,
    connector_points: list[tuple[float, float, float]],
    tube_radius: float = 0.014,
) -> list[bpy.types.Object]:
    objects = [
        add_round_tube(
            f"{name}_Day_Tube", points, tube_radius, day_material, day_parent
        ),
        add_round_tube(
            f"{name}_LED_LightCore",
            points,
            tube_radius * 0.6,
            light_core_material,
            led_parent,
        ),
        add_round_tube(
            f"{name}_LED_Diffuser", points, tube_radius, shell_material, led_parent
        ),
    ]
    for index, point in enumerate(sample_path(points, emitter_count)):
        objects.append(
            add_emitter(
                f"{name}_LED_Emitter_{index + 1:02d}",
                (point[0], point[1], point[2] + 0.0004),
                core_materials[index % len(core_materials)],
                led_parent,
            )
        )
    for index, point in enumerate(connector_points):
        objects.append(
            add_connector_housing(
                f"{name}_Day_Connector_{index + 1}",
                point,
                connector_material,
                day_parent,
            )
        )
        objects.append(
            add_connector_housing(
                f"{name}_LED_Connector_{index + 1}",
                point,
                connector_material,
                led_parent,
            )
        )
    day_parent["tka_construction"] = "round polymer tube with molded connectors"
    led_parent["tka_construction"] = (
        "addressable LED core inside translucent 360-degree diffuser tube"
    )
    led_parent["tka_led_count"] = emitter_count
    return objects


def build_asset() -> tuple[bpy.types.Object, list[bpy.types.Object]]:
    root = add_empty("TKA_LED_Shapes")
    root["tka_asset"] = "Astral-inspired manufactured shape props"
    root["tka_reference"] = "https://shop.astralhoops.com/collections/shapes"

    groups = {
        "triquetra_day": add_empty("Triquetra_Day", root),
        "triquetra_led": add_empty("Triquetra_LED", root),
        "triangle_day": add_empty("Triangle_Day", root),
        "triangle_led": add_empty("Triangle_LED", root),
    }

    day_triquetra = make_material(
        "TKA_Triquetra_Day_Tube", (0.12, 0.28, 0.95, 1), roughness=0.32
    )
    day_triangle = make_material(
        "TKA_Triangle_Day_Tube", (0.95, 0.08, 0.46, 1), roughness=0.32
    )
    diffuser = make_material(
        "TKA_Shape_LED_Diffuser",
        (0.92, 0.95, 1.0, 0.38),
        roughness=0.16,
        transmission=0.58,
    )
    connector = make_material(
        "TKA_Shape_Connector",
        (0.018, 0.022, 0.032, 1),
        roughness=0.46,
        metallic=0.22,
    )
    light_core = make_material(
        "TKA_Shape_LED_LightCore",
        (0.055, 0.07, 0.11, 1),
        roughness=0.38,
        metallic=0.12,
    )
    led_colors = [
        (1.0, 0.04, 0.14, 1),
        (1.0, 0.28, 0.03, 1),
        (1.0, 0.88, 0.06, 1),
        (0.06, 1.0, 0.34, 1),
        (0.05, 0.48, 1.0, 1),
        (0.52, 0.08, 1.0, 1),
        (1.0, 0.05, 0.68, 1),
    ]
    led_materials = [
        make_material(
            f"TKA_Shape_LED_{index + 1}",
            color,
            roughness=0.18,
            emission=color,
            emission_strength=5.0,
        )
        for index, color in enumerate(led_colors)
    ]

    objects: list[bpy.types.Object] = []
    for shape, grips, count in (
        ("Triquetra", ("armpit", "tip"), TRIQUETRA_LED_COUNT),
        ("Triangle", ("corner", "side"), TRIANGLE_LED_COUNT),
    ):
        for grip in grips:
            is_triangle = shape == "Triangle"
            points = (
                triangle_points(grip) if is_triangle
                else presented_triquetra_points(grip)
            )
            name = f"{shape}_{grip.title()}"
            day = add_empty(
                f"{shape}_Day_{grip.title()}", groups[f"{shape.lower()}_day"],
            )
            led = add_empty(
                f"{shape}_LED_{grip.title()}", groups[f"{shape.lower()}_led"],
            )
            objects.extend([day, led])
            connectors = [] if is_triangle else [points[i] for i in (0, 40, 80)]
            objects.extend(build_shape(
                name, points, day, led,
                day_triangle if is_triangle else day_triquetra,
                diffuser, light_core, led_materials, connector, count, connectors,
                TRIANGLE_TUBE_RADIUS_M if is_triangle else 0.014,
            ))
            for parent in (day, led):
                parent["tka_grip"] = grip
                if is_triangle:
                    parent["tka_side_length_m"] = TRIANGLE_SIDE_M
                    parent["tka_sagitta_m"] = TRIANGLE_SAGITTA_M
                    parent["tka_tube_radius_m"] = TRIANGLE_TUBE_RADIUS_M
                    parent["tka_sleeve_radius_m"] = TRIANGLE_SLEEVE_RADIUS_M
                    parent["tka_elbow_leg_m"] = TRIANGLE_ELBOW_LEG_M
                    # Cover the first/last 50 mm of each bowed side, matching
                    # today's printed elbow sleeves rather than spherical caps.
                    radius = (
                        TRIANGLE_SIDE_M ** 2 / (8 * TRIANGLE_SAGITTA_M)
                        + TRIANGLE_SAGITTA_M / 2
                    )
                    arc_length = (
                        radius * 2 * math.asin(TRIANGLE_SIDE_M / (2 * radius))
                    )
                    steps = math.ceil(TRIANGLE_ELBOW_LEG_M / arc_length * 96)
                    for side in range(3):
                        start = side * 96
                        for end in (0, 1):
                            indices = (
                                range(start, start + steps + 1) if end == 0
                                else range(start + 96 - steps, start + 97)
                            )
                            sleeve = [points[i % len(points)] for i in indices]
                            objects.append(add_round_tube(
                                f"{name}_{parent.name}_Elbow_{side}_{end}", sleeve,
                                TRIANGLE_SLEEVE_RADIUS_M, connector, parent, cyclic=False,
                            ))
                else:
                    scale = (TRIQUETRA_DIAMETER_M - 0.028) / 5.47132
                    offset = 3 * scale if grip == "tip" else 1.5 * scale
                    parent["tka_removable_center_ring"] = True
                    objects.append(add_torus(
                        f"{name}_{parent.name}_CenterRing", (0, offset, 0),
                        0.050, 0.007, connector, parent,
                    ))
                    angles = (math.pi / 2, math.pi * 7 / 6, math.pi * 11 / 6)
                    for index, angle in enumerate(angles):
                        sign = -1 if grip == "tip" else 1
                        inner = (
                            sign * 0.057 * math.cos(angle),
                            offset + sign * 0.057 * math.sin(angle), 0,
                        )
                        outer = (
                            sign * 0.095 * math.cos(angle),
                            offset + sign * 0.095 * math.sin(angle), 0,
                        )
                        objects.append(add_round_tube(
                            f"{name}_{parent.name}_CenterStay_{index}", [inner, outer],
                            0.004, connector, parent, cyclic=False,
                        ))
    for obj in objects:
        obj["tka_runtime_layer"] = obj.parent.name if obj.parent else ""
    return root, [*groups.values(), *objects]


def export_glb(
    output_path: Path,
    root: bpy.types.Object,
    objects: list[bpy.types.Object],
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for item in [root, *objects]:
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
        root.rotation_euler.x = 0


def main() -> None:
    args = parse_args()
    if args.layout_json:
        print(json.dumps(layout_data()))
        return
    global bpy
    import bpy
    reset_scene()
    root, objects = build_asset()
    export_glb(args.output.resolve(), root, objects)
    if args.blend:
        args.blend.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(args.blend.resolve()))
    print(f"Built {args.output.resolve()}")


if __name__ == "__main__":
    main()
