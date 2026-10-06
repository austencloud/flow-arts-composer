"""Build the production stick props and multi-angle proof renders.

Two sticks, one per hand: static/models/props/stick.glb (left) and
stick-right.glb (right), the same pair of branches the pictographs draw.

Geometry is driven by scripts/stick-stations.json, which
scripts/build-stick-svg.py emits from the same measurement table the pictograph
drawings are generated from: the same taper, the same kinks at the same nodes,
the same knobs, fork stub and saw cuts. The drawing can only show a branch
side-on; the table also carries the bends toward and away from the viewer,
which only the 3D uses.

The one standing divergence is scale: the drawing exaggerates its cross-section
1.15x so the branch reads on a pictograph cell. The generator publishes the
unexaggerated millimetres alongside, and this script reads only those.

The branch is one swept surface, not a lathe plus stuck-on lumps. Every ring is
centred on the bent centreline, every knob is a swelling of that surface, and
both saw cuts are planes through it, so it shades as one piece of wood.

The bark is scripts/stick_bark.py's painting, the same one the drawing samples:
stipple, lenticels, buds, scars and rubbed patches all live in it, so the model
and the drawing show the same bark. It stays bark on both hands. Only the tape
carries the "Recolor" marker prop-model-recolor.ts looks for, so only the tape
takes blue or red.

Each model is authored around the scene-3d hand pivot: long axis local Y,
origin at the drawing's viewBox centre, which sits on the centreline. Thick end
(thumb) at +Y. It is authored at 0.9m and Prop3D stretches it to the
performer's staff length, as it does the Fire Staff.

Usage:
  blender --background --factory-startup --python scripts/build-stick-model.py
  blender --background --factory-startup --python scripts/build-stick-model.py -- \
    --output-dir static/models/props \
    --render-dir scratchpad/stick-review/r1 \
    --blend-dir scratchpad/stick-review
"""

from __future__ import annotations

import argparse
import bisect
import json
import math
import sys
import tempfile
from pathlib import Path

import bpy
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import stick_bark  # noqa: E402

DEFAULT_OUTPUT_DIR = ROOT / "static" / "models" / "props"

# The station table is NOT repeated here. Re-run the SVG generator first if the
# JSON is stale; it is the single source both renderings read.
STATIONS = json.loads((ROOT / "scripts" / "stick-stations.json").read_text("utf-8"))

#: Everything is built in millimetres and scaled to metres once, on the root.
MM = 0.001

HALF = STATIONS["half_length_mm"]
AUTHORED_LENGTH_M = STATIONS["length_mm"] * MM
SIDE = {name: math.radians(deg) for name, deg in STATIONS["side_angle_deg"].items()}
NODE_SIGMA = STATIONS["node_sigma_mm"]
GRIP_HALF = STATIONS["grip_half_mm"]
TAPE = STATIONS["tape_mm"]
TAPE_PITCH = STATIONS["tape_pitch_mm"]
TAPE_SLANT = STATIONS["tape_slant_mm"]
TRACKED_TIP_Y = STATIONS["tracked_tip_mm"] * MM

#: Round the branch. Enough that a knob, which is about a fifth of the way
#: round, is a dome and not a facet.
COLUMNS = 40


def side_vector(theta: float) -> tuple[float, float]:
    """A direction round the long axis, as (x, z)."""
    return math.cos(theta), math.sin(theta)


TOP_X, TOP_Z = side_vector(SIDE["top"])
FACE_X, FACE_Z = side_vector(SIDE["face"])


def angle_between(a: float, b: float) -> float:
    return abs((a - b + math.pi) % math.tau - math.pi)


class Stick:
    """One branch of the pair, as the station table describes it."""

    def __init__(self, hand: str):
        self.hand = hand
        self.data = STATIONS["sticks"][hand]
        self.profile = self.data["profile"]
        self.profile_y = [row[0] for row in self.profile]
        self.nodes = self.data["nodes"]
        self.fork = self.data["fork"]
        d = self.data
        self.pinky_run = d["tip_d_mm"] * math.tan(math.radians(d["pinky_cut_deg"]))
        self.thumb_run = d["butt_d_mm"] * math.tan(math.radians(d["thumb_cut_deg"]))
        self.pinky_long = SIDE[d["pinky_cut_long_side"]]
        self.thumb_long = SIDE[d["thumb_cut_long_side"]]
        self.pinky_zone = -HALF + self.pinky_run + 6.0
        self.thumb_zone = HALF - self.thumb_run - 6.0

    # --- the bent centreline ------------------------------------------------

    def sample(self, y: float) -> tuple[float, float, float]:
        """(diameter, offset toward top, offset toward face) at y, in mm."""
        i = bisect.bisect_right(self.profile_y, y) - 1
        i = min(len(self.profile) - 2, max(0, i))
        a, b = self.profile[i], self.profile[i + 1]
        t = min(1.0, max(0.0, (y - a[0]) / (b[0] - a[0])))
        return tuple(a[k] + (b[k] - a[k]) * t for k in (1, 2, 3))

    def centre(self, y: float) -> tuple[float, float]:
        _d, top, face = self.sample(y)
        return top * TOP_X + face * FACE_X, top * TOP_Z + face * FACE_Z

    def knob(self, y: float, theta: float, radius: float) -> float:
        """Height of every knob at this point: the drawing's axial bump, made
        round by measuring the same sigma round the stem as along it."""
        height = 0.0
        for node in self.nodes:
            along = (y - node["y_mm"]) / NODE_SIGMA
            if abs(along) > 4:
                continue
            around = angle_between(theta, SIDE[node["side"]]) * radius / NODE_SIGMA
            height += node["crown_mm"] * math.exp(-along * along - around * around)
        return height

    def bark_radius(self, y: float, theta: float) -> float:
        r = self.sample(y)[0] / 2
        return r + self.knob(y, theta, r)

    def surface_point(self, y: float, theta: float, lift: float = 0.0):
        cx, cz = self.centre(y)
        sx, sz = side_vector(theta)
        r = self.bark_radius(y, theta) + lift
        return (cx + r * sx, y, cz + r * sz)

    # --- rings and cuts -----------------------------------------------------

    def branch_stations(self) -> list[float]:
        """Rings close together where the surface changes and far apart where
        it does not: at every knob and the fork, and through both cuts."""
        ys: set[float] = set()
        dense(ys, 0.0, HALF, 6.0)
        for node in self.nodes:
            dense(ys, node["y_mm"], NODE_SIGMA * 3, 1.5)
        dense(ys, self.fork["y_mm"], self.fork["base_d_mm"] * 1.5, 2.0)
        dense(ys, (-HALF + self.pinky_zone) / 2, (self.pinky_zone + HALF) / 2, 1.2)
        dense(ys, (HALF + self.thumb_zone) / 2, (HALF - self.thumb_zone) / 2, 1.2)
        return sorted(ys)

    def branch_y(self, station: float, theta: float) -> float:
        """Pull the end rings onto the two saw-cut planes."""
        if station < self.pinky_zone:
            start = -HALF + self.pinky_run / 2 * (1 - math.cos(theta - self.pinky_long))
            t = (station + HALF) / (self.pinky_zone + HALF)
            return start + (self.pinky_zone - start) * t
        if station > self.thumb_zone:
            end = HALF - self.thumb_run / 2 * (1 - math.cos(theta - self.thumb_long))
            t = (station - self.thumb_zone) / (HALF - self.thumb_zone)
            return self.thumb_zone + (end - self.thumb_zone) * t
        return station

    def tape_radius(self, y: float, theta: float) -> float:
        """Cloth tape wound in a spiral: each wrap rides up over the one before
        it and drops at the seam, so the surface steps once per turn."""
        phase = (y / TAPE_PITCH - theta / math.tau) % 1.0
        ramp = min(phase / 0.88, (1.0 - phase) / 0.12)
        return self.bark_radius(y, theta) + TAPE * (0.6 + 0.4 * ramp)

    @staticmethod
    def tape_y(station: float, theta: float) -> float:
        """A spiral wrap starts and finishes on a diagonal, long side as drawn."""
        start = -GRIP_HALF + TAPE_SLANT / 2 * (1 - math.cos(theta - SIDE["top"]))
        end = GRIP_HALF - TAPE_SLANT / 2 * (1 - math.cos(theta - SIDE["bottom"]))
        t = (station + GRIP_HALF) / (2 * GRIP_HALF)
        return start + (end - start) * t

    def bark_input(self) -> dict:
        return {
            "length_mm": STATIONS["length_mm"],
            "profile": self.profile,
            "side_angle_deg": STATIONS["side_angle_deg"],
            "nodes": self.nodes,
            "scars": self.data["scars"],
            "peels": self.data["peels"],
        }


# --- Mesh building ----------------------------------------------------------


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--render-dir", type=Path)
    parser.add_argument("--blend-dir", type=Path)
    return parser.parse_args(argv)


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.curves,
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for datablock in list(datablocks):
            datablocks.remove(datablock)


def activate(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def build_mesh(
    name: str,
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    face_uvs: list[list[tuple[float, float]]],
    face_materials: list[int],
    materials: list[bpy.types.Material],
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon, uvs, material_index in zip(mesh.polygons, face_uvs, face_materials):
        polygon.material_index = material_index
        polygon.use_smooth = True
        for loop_index, uv in zip(polygon.loop_indices, uvs):
            uv_layer.data[loop_index].uv = uv
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for material in materials:
        obj.data.materials.append(material)
    return obj


def tube(
    name: str,
    stations: list[float],
    *,
    y_of,
    radius_of,
    centre_of,
    materials: list[bpy.types.Material],
    columns: int = COLUMNS,
    side_material: int = 0,
    cap_material: int = 1,
    v_of=lambda y: (y + HALF) / (2 * HALF),
) -> bpy.types.Object:
    """A closed tube swept along local Y.

    `y_of(station, theta)` places each ring point, which is how a saw cut
    becomes a plane: the rings near a cut are pulled onto it column by column.
    Vertices are shared round the seam; only the UVs split there, so shading is
    continuous all the way round. u runs round the tube and v along it, the
    layout stick_bark paints in.
    """
    vertices: list[tuple[float, float, float]] = []
    vs: list[float] = []
    for station in stations:
        for column in range(columns):
            theta = math.tau * column / columns
            y = y_of(station, theta)
            cx, cz = centre_of(y)
            r = radius_of(y, theta)
            vertices.append((cx + r * math.cos(theta), y, cz + r * math.sin(theta)))
            vs.append(v_of(y))

    def index(ring: int, column: int) -> int:
        return ring * columns + column % columns

    faces: list[tuple[int, ...]] = []
    face_uvs: list[list[tuple[float, float]]] = []
    face_materials: list[int] = []
    for ring in range(len(stations) - 1):
        for column in range(columns):
            corners = (
                (ring, column),
                (ring + 1, column),
                (ring + 1, column + 1),
                (ring, column + 1),
            )
            faces.append(tuple(index(r, c) for r, c in corners))
            face_uvs.append([(c / columns, vs[index(r, c)]) for r, c in corners])
            face_materials.append(side_material)

    def cap_uv(column: int) -> tuple[float, float]:
        theta = math.tau * column / columns
        return 0.5 + 0.48 * math.cos(theta), 0.5 + 0.48 * math.sin(theta)

    first = list(range(columns))
    faces.append(tuple(index(0, c) for c in first))
    face_uvs.append([cap_uv(c) for c in first])
    face_materials.append(cap_material)
    last_ring = len(stations) - 1
    last = list(reversed(range(columns)))
    faces.append(tuple(index(last_ring, c) for c in last))
    face_uvs.append([cap_uv(c) for c in last])
    face_materials.append(cap_material)
    return build_mesh(name, vertices, faces, face_uvs, face_materials, materials)


def dense(ys: set[float], centre_y: float, half_width: float, step: float) -> None:
    n = max(1, round(2 * half_width / step))
    for i in range(n + 1):
        y = centre_y - half_width + 2 * half_width * i / n
        if -HALF <= y <= HALF:
            ys.add(round(y, 3))


def orient(obj: bpy.types.Object, direction, location) -> None:
    from mathutils import Matrix, Vector

    rotation = Vector((0.0, 1.0, 0.0)).rotation_difference(Vector(direction))
    obj.matrix_world = Matrix.Translation(Vector(location)) @ rotation.to_matrix().to_4x4()
    activate(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def fork_stub(stick: Stick, materials) -> bpy.types.Object:
    """A short tapered twig leaving the branch, buried at its root and cut
    square at its end, at the angle and length the drawing uses. Its bark is
    the stretch the tape hides on the branch, as in the drawing."""
    fork = stick.fork
    y = fork["y_mm"]
    d = stick.sample(y)[0]
    reach = fork["length_mm"] + d / 2 * 0.65
    base_r, tip_r = fork["base_d_mm"] / 2, fork["tip_d_mm"] / 2
    stations = [reach * i / 14 for i in range(15)]
    stub = tube(
        f"TKA_Stick_Fork_{stick.hand}",
        stations,
        y_of=lambda s, _t: s,
        radius_of=lambda s, _t: base_r + (tip_r - base_r) * (s / reach),
        centre_of=lambda _s: (0.0, 0.0),
        materials=materials,
        columns=20,
        v_of=lambda s: (-45.0 + s * fork["length_mm"] / reach + HALF) / (2 * HALF),
    )
    sx, sz = side_vector(SIDE[fork["side"]])
    angle = math.radians(fork["angle_deg"])
    direction = (math.sin(angle) * sx, math.cos(angle), math.sin(angle) * sz)
    cx, cz = stick.centre(y)
    root = (cx + 0.15 * d * sx, y, cz + 0.15 * d * sz)
    orient(stub, direction, root)
    return stub


def uv_sphere(name, material, *, centre_point, r, stretch_y=1.0) -> bpy.types.Object:
    rings, segments = 8, 14
    vertices = []
    for i in range(rings + 1):
        phi = math.pi * i / rings
        for j in range(segments):
            theta = math.tau * j / segments
            vertices.append(
                (
                    centre_point[0] + r * math.sin(phi) * math.cos(theta),
                    centre_point[1] + r * stretch_y * math.cos(phi),
                    centre_point[2] + r * math.sin(phi) * math.sin(theta),
                )
            )
    faces, face_uvs = [], []
    for i in range(rings):
        for j in range(segments):
            nj = j + 1
            corners = ((i, j), (i, nj), (i + 1, nj), (i + 1, j))
            faces.append(tuple(r_ * segments + c % segments for r_, c in corners))
            face_uvs.append([(c / segments, r_ / rings) for r_, c in corners])
    return build_mesh(name, vertices, faces, face_uvs, [0] * len(faces), [material])


def bud(stick: Stick, node, material) -> bpy.types.Object:
    """The dark bud on a knob's crown, half sunk into it, over the bud the
    bark painting puts in the same place."""
    theta = SIDE[node["side"]]
    return uv_sphere(
        f"TKA_Stick_Bud_{stick.hand}_{node['y_mm']:+.0f}",
        material,
        centre_point=stick.surface_point(node["y_mm"], theta, -0.9),
        r=1.6,
        stretch_y=1.3,
    )


def join_objects(name: str, objects: list[bpy.types.Object]) -> bpy.types.Object:
    bpy.ops.object.select_all(action="DESELECT")
    for item in objects:
        item.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = name
    return joined


def finish_shading(obj: bpy.types.Object, degrees: float = 40.0) -> None:
    """Outward normals, smooth along the wood, hard at the saw cuts."""
    activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    try:
        bpy.ops.object.shade_auto_smooth(angle=math.radians(degrees))
    except (AttributeError, RuntimeError, TypeError):
        return
    for modifier in list(obj.modifiers):
        if modifier.type == "NODES":
            bpy.ops.object.modifier_apply(modifier=modifier.name)


# --- Textures ---------------------------------------------------------------


def srgb(hex_colour: str) -> np.ndarray:
    return np.array([int(hex_colour[i : i + 2], 16) / 255 for i in (1, 3, 5)])


RINGS_SIZE = 256


def heartwood_pixels() -> np.ndarray:
    """The face of a saw cut: pale wood, growth rings, a dark pith, the thin
    cambium line and the bark round the rim. Mapped so radius 0.48 of the UV
    square is the outside of the branch."""
    rng = np.random.default_rng(1006)
    n = RINGS_SIZE
    yy, xx = np.mgrid[0:n, 0:n]
    u = (xx + 0.5) / n - 0.5
    v = (yy + 0.5) / n - 0.5
    radius = np.sqrt(u * u + v * v) / 0.48
    angle = np.arctan2(v, u)
    wobble = 0.012 * np.sin(2 * angle + 0.7) + 0.006 * np.sin(5 * angle + 2.1)
    r = radius + wobble
    # A cut that has weathered a while: paler and greyer than fresh wood,
    # rings faint, a little grain.
    light, dark = srgb("#CDB494"), srgb("#B89A76")
    colour = light * (1 - r[..., None] * 0.6) + dark * (r[..., None] * 0.6)
    rings = np.abs(np.sin(np.pi * r * 7.5)) ** 6
    colour = colour * (1 - 0.09 * rings[..., None])
    colour = colour * (1 + 0.035 * rng.standard_normal((n, n)))[..., None]
    pith = np.clip(1 - radius / 0.06, 0, 1)[..., None]
    colour = colour * (1 - pith) + srgb("#8E6A44") * pith
    cambium = ((radius > 0.86) & (radius <= 0.93))[..., None]
    colour = np.where(cambium, srgb("#7A5C40"), colour)
    colour = np.where((radius > 0.93)[..., None], srgb("#857868"), colour)
    rgba = np.ones((n, n, 4), dtype=np.float32)
    rgba[..., :3] = np.clip(colour, 0, 1)
    return rgba


#: The grain is a fraction of a millimetre deep. Its slope is drawn a little
#: steeper than true so the crust still reads under soft scene light.
RELIEF_GAIN = 1.6


def bark_pixels(stick: Stick) -> tuple[np.ndarray, np.ndarray]:
    """The bark painting as albedo, and its relief as a tangent-space normal
    map: u (the tangent) runs round the stem, v along it. The knobs are in the
    mesh, so only the grain, lenticels, scars and peels are in the map."""
    albedo, relief = stick_bark.paint(stick.bark_input(), stick.data["bark_seed"], stick.data["tone"])
    rgba = np.ones((stick_bark.HEIGHT, stick_bark.WIDTH, 4), dtype=np.float32)
    rgba[..., :3] = albedo

    mm_row = STATIONS["length_mm"] / stick_bark.HEIGHT
    y = (np.arange(stick_bark.HEIGHT) + 0.5) * mm_row - HALF
    radius = np.interp(y, stick.profile_y, [row[1] / 2 for row in stick.profile])
    mm_column = (math.tau * radius / stick_bark.WIDTH)[:, None]
    height = relief * RELIEF_GAIN
    slope_v = np.gradient(height, mm_row, axis=0)
    slope_u = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * mm_column)
    normal = np.stack([-slope_u, -slope_v, np.ones_like(height)], axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    normals = np.ones_like(rgba)
    normals[..., :3] = normal * 0.5 + 0.5
    return rgba, normals


def make_image(name: str, pixels: np.ndarray, *, data: bool = False) -> bpy.types.Image:
    h, w = pixels.shape[:2]
    image = bpy.data.images.new(name, w, h, alpha=False)
    if data:
        image.colorspace_settings.name = "Non-Color"
    image.pixels.foreach_set(pixels.ravel())
    path = Path(tempfile.gettempdir()) / f"{name}.png"
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    image.pack()
    return image


def make_material(
    name: str,
    colour: tuple[float, float, float, float],
    roughness: float,
    image: bpy.types.Image | None = None,
    normal_image: bpy.types.Image | None = None,
) -> bpy.types.Material:
    result = bpy.data.materials.new(name)
    result.diffuse_color = colour
    result.use_nodes = True
    nodes = result.node_tree.nodes
    principled = nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = colour
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = 0.0
    if image is not None:
        texture = nodes.new("ShaderNodeTexImage")
        texture.image = image
        texture.interpolation = "Linear"
        result.node_tree.links.new(texture.outputs["Color"], principled.inputs["Base Color"])
    if normal_image is not None:
        texture = nodes.new("ShaderNodeTexImage")
        texture.image = normal_image
        texture.interpolation = "Linear"
        normal_map = nodes.new("ShaderNodeNormalMap")
        result.node_tree.links.new(texture.outputs["Color"], normal_map.inputs["Color"])
        result.node_tree.links.new(normal_map.outputs["Normal"], principled.inputs["Normal"])
    return result


# --- Assembly ---------------------------------------------------------------


def build_prop(stick: Stick) -> tuple[bpy.types.Object, list[bpy.types.Object]]:
    albedo, normals = bark_pixels(stick)
    bark = make_material(
        "TKA_Stick_Bark",
        (1, 1, 1, 1),
        roughness=0.88,
        image=make_image(f"stick-bark-{stick.hand}", albedo),
        normal_image=make_image(f"stick-bark-normal-{stick.hand}", normals, data=True),
    )
    heartwood = make_material(
        "TKA_Stick_Heartwood",
        (1, 1, 1, 1),
        roughness=0.8,
        image=make_image("stick-heartwood", heartwood_pixels()),
    )
    # #3B2D22, the bark painting's bud colour: a bud is darker and a little
    # glossier than the bark it sits in.
    bud_material = make_material("TKA_Stick_Bud", (0.044, 0.026, 0.016, 1.0), roughness=0.55)
    # Neutral by design, because prop-model-recolor.ts REPLACES this colour; the
    # name carries the "Recolor" marker that selects it. Cloth, so rough.
    tape_material = make_material("TKA_Stick_Tape_Recolor", (0.4508, 0.4508, 0.4508, 1.0), roughness=0.85)

    root = bpy.data.objects.new("TKA_Stick", None)
    bpy.context.collection.objects.link(root)
    root["tka_prop_type"] = "stick"
    root["tka_hand"] = stick.hand
    root["authored_length_m"] = AUTHORED_LENGTH_M
    root["grip_origin"] = "0,0,0"
    root["local_long_axis"] = "+Y"
    root["recolor_material"] = "TKA_Stick_Tape_Recolor"
    root["preserved_material"] = "TKA_Stick_Bark"
    root["tracked_tip_y"] = TRACKED_TIP_Y
    root["reference_form"] = "found branch, smooth bark, bud knobs, saw-cut ends, tape at the middle"

    pivot = bpy.data.objects.new("TKA_Hand_Pivot", None)
    bpy.context.collection.objects.link(pivot)
    pivot.parent = root
    pivot["tka_grip"] = True

    wood = [bark, heartwood]
    branch = tube(
        "TKA_Stick_Body",
        stick.branch_stations(),
        y_of=stick.branch_y,
        radius_of=stick.bark_radius,
        centre_of=stick.centre,
        materials=wood,
    )
    parts = [branch, fork_stub(stick, wood)]
    parts += [bud(stick, node, bud_material) for node in stick.nodes]
    branch_group = join_objects("TKA_Stick_Branch", parts)
    finish_shading(branch_group)

    tape_stations = [-GRIP_HALF + 2 * GRIP_HALF * i / 70 for i in range(71)]
    tape = tube(
        "TKA_Stick_Tape",
        tape_stations,
        y_of=Stick.tape_y,
        radius_of=stick.tape_radius,
        centre_of=stick.centre,
        materials=[tape_material],
        columns=48,
        cap_material=0,
    )
    finish_shading(tape, degrees=60.0)

    objects = [branch_group, tape]
    for item in objects:
        item.parent = root
        item["tka_runtime_recolor"] = any(
            "Recolor" in material.name for material in item.data.materials
        )
    # Built in millimetres; the root carries the one conversion.
    root.scale = (MM, MM, MM)
    return root, [pivot, *objects]


def export_glb(output_path: Path, root, model_objects) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Bake the millimetre scale into the meshes so the GLB carries metres in
    # its vertex data, the way every other prop does.
    for item in model_objects:
        if item.type == "MESH":
            activate(item)
            matrix = item.matrix_world.copy()
            item.parent = None
            item.matrix_world = matrix
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            item.parent = root
    root.scale = (1.0, 1.0, 1.0)

    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for item in model_objects:
        item.select_set(True)
    bpy.context.view_layer.objects.active = root

    # Blender exports its Z-up basis to glTF's Y-up basis. The stick is kept
    # upright along Blender Y for readable proof renders, then rotated into the
    # runtime basis only for export so the loaded prop stays long on local Y.
    root.rotation_euler.x = math.pi / 2
    options = dict(
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
        export_image_format="JPEG",
        export_jpeg_quality=86,
    )
    available = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    try:
        bpy.ops.export_scene.gltf(**{k: v for k, v in options.items() if k in available})
    finally:
        root.rotation_euler.x = 0.0


def point_at(obj, target) -> None:
    from mathutils import Vector

    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_proof_lighting():
    world = bpy.context.scene.world
    if world is None:
        world = bpy.data.worlds.new("World")
        bpy.context.scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.012, 0.014, 0.02, 1.0)
    background.inputs["Strength"].default_value = 0.35

    for name, location, energy, size, colour in (
        ("QA_Key", (-0.70, 0.50, 1.00), 40, 0.25, (1.0, 0.95, 0.88)),
        ("QA_Fill", (0.90, -0.18, 0.65), 22, 0.90, (0.78, 0.84, 1.0)),
        ("QA_Rim", (-0.60, -0.38, -0.80), 24, 0.60, (1.0, 0.9, 0.8)),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.shape = "DISK"
        light.data.size = size
        light.data.color = colour
        point_at(light, (0.0, 0.0, 0.0))

    bpy.ops.object.camera_add(location=(0.0, 0.0, 1.70))
    camera = bpy.context.object
    camera.name = "QA_Camera"
    camera.data.lens = 63
    camera.data.sensor_width = 36
    bpy.context.scene.camera = camera
    return camera


def render_proofs(render_dir: Path, stick: Stick, tape_material) -> None:
    hand = stick.hand
    render_dir.mkdir(parents=True, exist_ok=True)
    camera = add_proof_lighting()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 700
    scene.render.resolution_y = 1300
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = -1.6

    # The tape in its hand's colour, as the runtime recolour paints it.
    principled = tape_material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (
        (0.0356, 0.177, 0.761, 1.0) if hand == "left" else (0.83, 0.016, 0.022, 1.0)
    )

    def shoot(label, location, rotation=None, target=None):
        camera.location = location
        if target is None:
            camera.rotation_euler = rotation
        else:
            point_at(camera, target)
        scene.render.filepath = str(render_dir / f"stick-{hand}-{label}.png")
        bpy.ops.render.render(write_still=True)

    shoot("front", (0.0, 0.0, 1.70), (0.0, 0.0, 0.0))
    shoot("three-quarter", (0.98, 0.0, 1.38), (0.0, math.radians(35), 0.0))
    shoot("profile", (1.70, 0.0, 0.0), (0.0, math.radians(90), 0.0))

    camera.data.lens = 85
    scene.render.resolution_x = 1100
    scene.render.resolution_y = 900
    def axis_point(y_mm):
        cx, cz = stick.centre(y_mm)
        return (cx * MM, y_mm * MM, cz * MM)

    for label, y_mm, toward in (("pinky-end", -HALF + 25, -1), ("thumb-end", HALF - 25, 1)):
        x, y, z = axis_point(y_mm)
        shoot(label, (x + 0.06, y + toward * 0.16, z + 0.13), target=(x, y, z))
    fork = stick.fork["y_mm"]
    x, y, z = axis_point(fork - 30)
    shoot("fork", (x - 0.05, y, z + 0.2), target=(x, y, z))
    x, y, z = axis_point(250)
    shoot("close", (x, y, z + 0.24), target=(x, y, z))


def print_summary(hand: str, output_path: Path, model_objects) -> None:
    meshes = [item for item in model_objects if item.type == "MESH"]
    tag = f"STICK_{hand.upper()}"
    print(f"{tag}_OUTPUT={output_path}")
    print(f"{tag}_BYTES={output_path.stat().st_size}")
    print(f"{tag}_MESHES={len(meshes)}")
    print(f"{tag}_VERTICES={sum(len(m.data.vertices) for m in meshes)}")
    print(f"{tag}_POLYGONS={sum(len(m.data.polygons) for m in meshes)}")
    print(f"{tag}_LENGTH_M={AUTHORED_LENGTH_M}")
    print(f"{tag}_TRACKED_TIP_Y={TRACKED_TIP_Y:.7f}")


def main() -> None:
    args = parse_args()
    for hand in STATIONS["sticks"]:
        stick = Stick(hand)
        output_path = (args.output_dir / stick.data["glb"]).resolve()
        reset_scene()
        root, model_objects = build_prop(stick)
        export_glb(output_path, root, model_objects)

        if args.blend_dir:
            blend_path = (args.blend_dir / f"stick-{hand}.blend").resolve()
            blend_path.parent.mkdir(parents=True, exist_ok=True)
            bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
        if args.render_dir:
            render_proofs(args.render_dir.resolve(), stick, bpy.data.materials["TKA_Stick_Tape_Recolor"])

        print_summary(hand, output_path, model_objects)


if __name__ == "__main__":
    main()
