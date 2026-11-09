"""Model the Flow Fest sim's hero props procedurally and export them as GLBs.

    "C:/Program Files/Blender Foundation/Blender 5.0/blender.exe" -b --factory-startup \
        --python scripts/build-flow-fest-sim-props.py -- [--asset canopy|fire|lantern|all] \
        [--preview-dir <dir>] [--skip-optimize]

Each asset is written twice into static/models/flow-fest-sim/props/:
    <asset>.glb       the near model
    <asset>-far.glb   the distance model (lacing, bark ridges and kindling dropped)

Both go through the repo's gltf-transform path with Draco geometry, the same
flags scripts/build-first-fire-production.py uses. Nothing here is hand-edited:
rerun the script to regenerate every file.

Conventions the runtime relies on (src/routes/test/flow-fest-sim/flow-fest-authored-props.ts):
  * metres, Y up in glTF (Z up here), origin on the ground at the prop's centre.
  * one mesh per material, named for its job, so the loader can find the glow
    part of the lantern ("lantern-glow") and the canopy fabric ("canopy-fabric").
  * colours live in vertex colours (COLOR_0) multiplied into flat PBR values,
    so a stone ring or a log reads as many stones and many logs without
    texture downloads. The sim has no environment map, so metal stays
    moderate rather than mirror-bright.

The canopy keeps the footprint, height and fabric colour of the primitive it
replaces (FFS_LEDFlowCircle_*): posts at +/-3.25 x +/-2.6 m, roof at 3.38 m. The
fire ring keeps the pit radius (1.42 m inner) and the hero fire's three crossed
logs (FlowFestHeroFire.svelte). The lantern keeps the 0.64 m glow height of the
route lantern it replaces. Material choices flagged in
docs/superpowers/specs/active/2026-10-22-flow-fest-follow-the-light.md are NOT
decided here; existing colours are carried over.
"""

from __future__ import annotations

import json
import math
import random
import subprocess
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "static" / "models" / "flow-fest-sim" / "props"
RAW_DIR = ROOT / "blender" / "exports" / "flow-fest-sim-props"

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def arg(name: str, default: str | None = None) -> str | None:
    if name in argv:
        return argv[argv.index(name) + 1]
    return default


ASSET = arg("--asset", "all")
PREVIEW_DIR = arg("--preview-dir")
OPTIMIZE = "--skip-optimize" not in argv


def log(message: str) -> None:
    print(f"[flow-fest-props] {message}", flush=True)


# ---------------------------------------------------------------- helpers


class Part:
    """One material's worth of geometry, built up in a single bmesh."""

    def __init__(self, name: str, color: tuple[float, float, float], roughness: float, metallic: float = 0.0, emissive: tuple[float, float, float] | None = None):
        self.name = name
        self.color = color
        self.roughness = roughness
        self.metallic = metallic
        self.emissive = emissive
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.color.new("Col")

    def paint(self, faces, rgb) -> None:
        for face in faces:
            for loop in face.loops:
                loop[self.col] = (*rgb, 1.0)

    def add_cylinder(self, a: Vector, b: Vector, r1: float, r2: float | None = None, segments: int = 6, rgb=(1, 1, 1), caps: bool = False):
        r2 = r1 if r2 is None else r2
        direction = b - a
        length = direction.length
        if length < 1e-5:
            return []
        before = set(self.bm.faces)
        result = bmesh.ops.create_cone(
            self.bm, cap_ends=caps, cap_tris=False, segments=segments,
            radius1=r1, radius2=r2, depth=length,
        )
        rot = direction.to_track_quat("Z", "Y").to_matrix().to_4x4()
        mat = Matrix.Translation((a + b) / 2) @ rot
        bmesh.ops.transform(self.bm, matrix=mat, verts=result["verts"])
        faces = [f for f in self.bm.faces if f not in before]
        self.paint(faces, rgb)
        return faces

    def add_box(self, center: Vector, size: Vector, rgb=(1, 1, 1)):
        before = set(self.bm.faces)
        result = bmesh.ops.create_cube(self.bm, size=1.0)
        bmesh.ops.transform(self.bm, matrix=Matrix.Translation(center) @ Matrix.Diagonal((*size, 1.0)), verts=result["verts"])
        faces = [f for f in self.bm.faces if f not in before]
        self.paint(faces, rgb)
        return faces

    def to_object(self, collection) -> bpy.types.Object:
        mesh = bpy.data.meshes.new(self.name)
        self.bm.normal_update()
        self.bm.to_mesh(mesh)
        self.bm.free()
        obj = bpy.data.objects.new(self.name, mesh)
        collection.objects.link(obj)
        obj.data.materials.append(make_material(self))
        for poly in mesh.polygons:
            poly.use_smooth = True
        return obj


def make_material(part: Part) -> bpy.types.Material:
    mat = bpy.data.materials.new(part.name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    attr = nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    # The glTF exporter reads a direct vertex-colour link only, so the flat
    # colour is baked into the vertex colours (bake_flat_colour) instead of
    # being multiplied in the node tree.
    mat.node_tree.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = part.roughness
    bsdf.inputs["Metallic"].default_value = part.metallic
    if part.emissive:
        bsdf.inputs["Emission Color"].default_value = (*part.emissive, 1.0)
        bsdf.inputs["Emission Strength"].default_value = 3.0
    return mat


def bake_flat_colour(part: Part) -> None:
    """Multiply the part's flat colour into its vertex colours (see make_material)."""
    for face in part.bm.faces:
        for loop in face.loops:
            c = loop[part.col]
            loop[part.col] = (c[0] * part.color[0], c[1] * part.color[1], c[2] * part.color[2], 1.0)


def srgb(hex_colour: str) -> tuple[float, float, float]:
    def channel(v: int) -> float:
        c = v / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    h = hex_colour.lstrip("#")
    return tuple(channel(int(h[i : i + 2], 16)) for i in (0, 2, 4))  # type: ignore[return-value]


def jitter(rng: random.Random, base: float, spread: float) -> tuple[float, float, float]:
    v = base + (rng.random() - 0.5) * spread
    return (v, v, v)


def reset_scene() -> bpy.types.Collection:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene.collection


def finish(parts: list[Part], collection) -> list[bpy.types.Object]:
    objects = []
    for part in parts:
        if not part.bm.faces:
            part.bm.free()
            continue
        bake_flat_colour(part)
        objects.append(part.to_object(collection))
    return objects


def triangles(objects) -> int:
    total = 0
    for obj in objects:
        for poly in obj.data.polygons:
            total += len(poly.vertices) - 2
    return total


def export(objects, name: str) -> dict:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    raw = RAW_DIR / f"{name}.raw.glb"
    final = OUT_DIR / f"{name}.glb"
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=str(raw),
        export_format="GLB",
        use_selection=True,
        export_cameras=False,
        export_lights=False,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_yup=True,
    )
    if OPTIMIZE:
        cli = ROOT / "node_modules" / "@gltf-transform" / "cli" / "bin" / "cli.js"
        command = [
            "node", str(cli), "optimize", str(raw), str(final),
            "--compress", "draco", "--simplify", "false",
            # The runtime finds parts BY MESH NAME; keep them apart.
            "--palette", "false", "--instance", "false", "--join", "false",
        ]
        result = subprocess.run(command, capture_output=True, text=True, cwd=str(ROOT))
        if result.returncode != 0:
            log(result.stdout[-2000:])
            log(result.stderr[-2000:])
            raise RuntimeError("gltf-transform optimize failed")
    else:
        final.write_bytes(raw.read_bytes())
    report = {"file": str(final.relative_to(ROOT)).replace("\\", "/"), "bytes": final.stat().st_size, "triangles": triangles(objects), "meshes": [o.name for o in objects]}
    log(json.dumps(report))
    return report


def render_preview(objects, name: str, eye: Vector, target: Vector, lens: float = 35) -> None:
    if not PREVIEW_DIR:
        return
    scene = bpy.context.scene
    world = bpy.data.worlds.new("preview-sky")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    sky = world.node_tree.nodes.new("ShaderNodeTexSky")
    try:
        sky.sky_type = "NISHITA"
    except TypeError:
        pass
    world.node_tree.links.new(sky.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 0.35
    scene.world = world
    ground_mesh = bpy.data.meshes.new("ground")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=30)
    bm.to_mesh(ground_mesh)
    bm.free()
    ground = bpy.data.objects.new("ground", ground_mesh)
    gmat = bpy.data.materials.new("ground")
    gmat.use_nodes = True
    gmat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*srgb("#4a5a32"), 1)
    gmat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 1.0
    ground_mesh.materials.append(gmat)
    scene.collection.objects.link(ground)
    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = 3.2
    sun_data.angle = math.radians(2)
    sun = bpy.data.objects.new("sun", sun_data)
    sun.rotation_euler = (math.radians(52), math.radians(8), math.radians(35))
    scene.collection.objects.link(sun)
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = lens
    cam = bpy.data.objects.new("cam", cam_data)
    cam.location = eye
    cam.rotation_euler = (target - eye).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 800
    scene.view_settings.view_transform = "AgX"
    out = Path(PREVIEW_DIR) / f"{name}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(out)
    bpy.ops.render.render(write_still=True)
    log(f"preview -> {out}")


# ---------------------------------------------------------------- canopy

CANOPY_POST_X = 3.25
CANOPY_POST_Y = 2.6
CANOPY_TOP = 3.38
TRUSS = 0.29  # a standard 290 mm box truss
CHORD_R = 0.024
LACE_R = 0.009
LED_RING_RADIUS = 1.7
LED_RING_HEIGHT = 1.75


def truss_run(part: Part, a: Vector, b: Vector, up: Vector, side: Vector, lacing: bool, rgb) -> None:
    """A box truss from a to b: four chords on the corners of a TRUSS square, zig-zag lacing on each face."""
    h = TRUSS / 2
    corners = [up * h + side * h, up * h - side * h, -up * h - side * h, -up * h + side * h]
    for c in corners:
        part.add_cylinder(a + c, b + c, CHORD_R, segments=8, rgb=rgb)
    if not lacing:
        return
    length = (b - a).length
    axis = (b - a).normalized()
    bays = max(1, round(length / TRUSS))
    step = length / bays
    for face in range(4):
        c0 = corners[face]
        c1 = corners[(face + 1) % 4]
        for i in range(bays):
            p0 = a + axis * (i * step)
            p1 = a + axis * ((i + 1) * step)
            if i % 2 == 0:
                part.add_cylinder(p0 + c0, p1 + c1, LACE_R, segments=4, rgb=rgb)
            else:
                part.add_cylinder(p0 + c1, p1 + c0, LACE_R, segments=4, rgb=rgb)


def build_canopy(far: bool) -> list[Part]:
    rng = random.Random(7)
    metal = Part("canopy-truss", srgb("#a7adb4"), roughness=0.42, metallic=0.55)
    hardware = Part("canopy-hardware", srgb("#2b2d30"), roughness=0.6, metallic=0.3)
    fabric = Part("canopy-fabric", srgb("#36304d"), roughness=0.82)
    ballast = Part("canopy-ballast", srgb("#6f6a62"), roughness=0.95)
    alu = (1.0, 1.0, 1.0)
    top_mid = CANOPY_TOP - TRUSS / 2 - 0.06
    X = Vector((1, 0, 0))
    Y = Vector((0, 1, 0))
    Z = Vector((0, 0, 1))
    corners = [Vector((sx * CANOPY_POST_X, sy * CANOPY_POST_Y, 0)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    # Towers: base plate + vertical truss up to the corner block.
    for corner in corners:
        truss_run(metal, corner + Z * 0.06, corner + Z * (top_mid - TRUSS / 2), X, Y, not far, alu)
        hardware.add_box(corner + Z * 0.015, Vector((0.6, 0.6, 0.03)), rgb=(1, 1, 1))
        metal.add_box(corner + Z * top_mid, Vector((TRUSS + 0.06, TRUSS + 0.06, TRUSS + 0.06)), rgb=(0.92, 0.92, 0.92))
        if not far:
            # A water-ballast block and a ratchet strap at each foot.
            outward = Vector((math.copysign(1, corner.x), math.copysign(1, corner.y), 0))
            block = corner + outward * 0.55
            ballast.add_box(block + Z * 0.2, Vector((0.55, 0.38, 0.4)), rgb=jitter(rng, 0.95, 0.12))
            hardware.add_cylinder(block + Z * 0.38, corner + Z * 1.1, 0.012, segments=4)
    # Top ring: four truss spans between the corner blocks.
    for i in range(4):
        a = corners[i] + Z * top_mid
        b = corners[(i + 1) % 4] + Z * top_mid
        axis = (b - a).normalized()
        side = axis.cross(Z).normalized()
        inset = axis * ((TRUSS + 0.06) / 2)
        truss_run(metal, a + inset, b - inset, Z, side, not far, alu)
    # Shade fabric: a tensioned sail laced inside the top ring, lifted at the
    # centre by a crown hoop so it sheds rain, with scalloped catenary edges.
    nx, ny = (28, 22) if not far else (10, 8)
    half_x = CANOPY_POST_X - TRUSS * 0.5
    half_y = CANOPY_POST_Y - TRUSS * 0.5
    base_z = top_mid + TRUSS / 2 - 0.02
    grid = []
    bm = fabric.bm
    for j in range(ny + 1):
        row = []
        for i in range(nx + 1):
            u = i / nx * 2 - 1
            v = j / ny * 2 - 1
            r = max(abs(u), abs(v))
            lift = 0.42 * (1 - r) ** 1.6
            # Sag between the lacing points on the edge.
            edge = max(0.0, r - 0.86) / 0.14
            sag_phase = abs(math.sin((u if abs(v) > abs(u) else v) * math.pi * 3))
            sag = 0.05 * edge * sag_phase
            wrinkle = 0.008 * noise.noise(Vector((u * 3.1, v * 3.1, 0.4)))
            row.append(bm.verts.new((u * half_x, v * half_y, base_z + lift - sag + wrinkle)))
        grid.append(row)
    for j in range(ny):
        for i in range(nx):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            shade = 0.9 + 0.1 * (1 - max(abs(i / nx * 2 - 1), abs(j / ny * 2 - 1)))
            fabric.paint([f], (shade, shade, shade))
    # A second, downward-facing skin so the underside reads from the floor.
    under = bmesh.ops.duplicate(bm, geom=list(bm.faces))
    under_faces = [g for g in under["geom"] if isinstance(g, bmesh.types.BMFace)]
    bmesh.ops.reverse_faces(bm, faces=under_faces)
    bmesh.ops.translate(bm, vec=(0, 0, -0.012), verts=[g for g in under["geom"] if isinstance(g, bmesh.types.BMVert)])
    fabric.paint(under_faces, (0.78, 0.78, 0.8))
    # Crown hoop under the sail's peak, and the four suspension cables that
    # carry the hanging LED ring off the truss (the ring itself stays a
    # runtime light).
    hoop_z = base_z + 0.38
    segs = 24
    for k in range(segs):
        a0 = k / segs * math.tau
        a1 = (k + 1) / segs * math.tau
        metal.add_cylinder(Vector((math.cos(a0) * 0.55, math.sin(a0) * 0.55, hoop_z)), Vector((math.cos(a1) * 0.55, math.sin(a1) * 0.55, hoop_z)), 0.014, segments=5)
    for k in range(4):
        ang = math.pi / 4 + k * math.pi / 2
        ring_point = Vector((math.cos(ang) * LED_RING_RADIUS, math.sin(ang) * LED_RING_RADIUS, LED_RING_HEIGHT + 0.05))
        top_point = Vector((math.copysign(half_x - 0.6, ring_point.x), math.copysign(half_y - 0.6, ring_point.y), base_z + 0.1))
        hardware.add_cylinder(ring_point, top_point, 0.005, segments=4)
        hardware.add_cylinder(Vector((math.cos(ang) * 0.55, math.sin(ang) * 0.55, hoop_z)), Vector((math.cos(ang) * (half_x - 0.1), math.sin(ang) * (half_y - 0.1), base_z)), 0.011, segments=4)
    return [metal, hardware, fabric, ballast]


# ---------------------------------------------------------------- fire

FIRE_PIT_INNER_RADIUS = 1.42
FIRE_STONES = 22
LOG_ANGLES = [0.08, math.pi / 3 + 0.08, 2 * math.pi / 3 + 0.08]


def add_stone(part: Part, rng: random.Random, center: Vector, size: float, subdiv: int, tint) -> None:
    before = set(part.bm.faces)
    result = bmesh.ops.create_icosphere(part.bm, subdivisions=subdiv, radius=size)
    seed = Vector((rng.random() * 50, rng.random() * 50, rng.random() * 50))
    flat = 0.45 + rng.random() * 0.25
    stretch = 1.0 + rng.random() * 0.35
    rot = Matrix.Rotation(rng.random() * math.tau, 4, "Z") @ Matrix.Rotation((rng.random() - 0.5) * 0.5, 4, "X")
    for v in result["verts"]:
        n = v.co.normalized()
        # Two octaves of noise for a weathered field stone, and a flattened
        # base so it sits in the dirt rather than on it.
        d = 0.34 * noise.noise(n * 1.3 + seed) + 0.12 * noise.noise(n * 3.6 + seed) + 0.04 * noise.noise(n * 9.0 + seed)
        co = n * size * (1 + d)
        co.x *= stretch
        co.z *= flat
        if co.z < -size * 0.2:
            co.z = -size * 0.2 + (co.z + size * 0.2) * 0.25
        v.co = rot @ co + center
    faces = [f for f in part.bm.faces if f not in before]
    for f in faces:
        up = max(0.0, f.normal.z)
        # Soot on the inner faces, lichen-paler tops on the outer ones.
        inward = -(f.calc_center_median() - Vector((0, 0, 0))).normalized().dot(f.normal)
        soot = max(0.0, inward) * 0.55
        g = (0.82 + 0.25 * up) * (1 - soot)
        part.paint([f], (tint[0] * g, tint[1] * g, tint[2] * g))


def add_log(bark: Part, grain: Part, rng: random.Random, angle: float, length: float, r_end: float, r_mid: float, z: float, far: bool) -> None:
    segments = 12 if not far else 7
    rings = 10 if not far else 3
    direction = Vector((math.cos(angle), math.sin(angle), 0))
    side = Vector((0, 0, 1)).cross(direction)
    up = Vector((0, 0, 1))
    seed = rng.random() * 40
    verts_rings = []
    bm = bark.bm
    for k in range(rings + 1):
        t = k / rings - 0.5
        along = direction * (t * length)
        radius = r_mid + (r_end - r_mid) * abs(t * 2)
        ring = []
        for s in range(segments):
            a = s / segments * math.tau
            ridge = 0.0 if far else 0.018 * abs(math.sin(a * 7 + seed)) + 0.014 * noise.noise(Vector((a * 2, t * 6, seed)))
            r = radius + ridge
            co = along + side * (math.cos(a) * r) + up * (math.sin(a) * r * 0.92 + z)
            ring.append(bm.verts.new(co))
        verts_rings.append(ring)
    for k in range(rings):
        t = (k + 0.5) / rings - 0.5
        # Charred toward the centre of the pit, raw bark at the outer end.
        char = max(0.0, 1 - abs(t * 2) * 1.4)
        for s in range(segments):
            f = bm.faces.new((verts_rings[k][s], verts_rings[k][(s + 1) % segments], verts_rings[k + 1][(s + 1) % segments], verts_rings[k + 1][s]))
            g = 1.0 - 0.85 * char
            bark.paint([f], (g, g * (1 - 0.2 * char), g * (1 - 0.3 * char)))
    # End grain on both ends: pale sawn wood with darker rings.
    for k, sign in ((0, -1), (rings, 1)):
        center = direction * (sign * length / 2) + up * z
        c = grain.bm.verts.new(center + direction * sign * 0.004)
        ring = [grain.bm.verts.new(v.co + direction * sign * 0.004) for v in verts_rings[k]]
        for s in range(segments):
            tri = (c, ring[s], ring[(s + 1) % segments]) if sign > 0 else (c, ring[(s + 1) % segments], ring[s])
            f = grain.bm.faces.new(tri)
            grain.paint([f], (1.0, 1.0, 1.0))


def build_fire(far: bool) -> list[Part]:
    rng = random.Random(11)
    stones = Part("fire-stones", srgb("#7a7368"), roughness=0.93)
    bark = Part("fire-logs-bark", srgb("#4a3424"), roughness=0.96)
    grain = Part("fire-logs-endgrain", srgb("#a07850"), roughness=0.9)
    coals = Part("fire-coals", srgb("#1a1310"), roughness=1.0)
    for index in range(FIRE_STONES):
        angle = index / FIRE_STONES * math.tau + (rng.random() - 0.5) * 0.12
        radius = FIRE_PIT_INNER_RADIUS + 0.2 + rng.random() * 0.12
        size = 0.14 + rng.random() * 0.13
        tint = (1.0 + (rng.random() - 0.5) * 0.18, 1.0 + (rng.random() - 0.5) * 0.12, 1.0 + (rng.random() - 0.5) * 0.2)
        center = Vector((math.cos(angle) * radius, math.sin(angle) * radius, size * (0.22 + rng.random() * 0.2)))
        add_stone(stones, rng, center, size, 2 if not far else 1, tint)
    # The hero fire's three crossed logs: 1.75 m, 0.14 to 0.18 m radius, centre
    # 0.245 m up, so the volumetric flame still sits where it was tuned.
    for i, angle in enumerate(LOG_ANGLES):
        add_log(bark, grain, rng, angle, 1.75, 0.18, 0.14, 0.245 + (i - 1) * 0.02, far)
    if not far:
        # Kindling and split pieces leaning into the cross, and a bed of
        # coal lumps under it.
        for k in range(9):
            a = k / 9 * math.tau + rng.random() * 0.3
            foot = Vector((math.cos(a) * 0.62, math.sin(a) * 0.62, 0.02))
            head = Vector((math.cos(a) * 0.08, math.sin(a) * 0.08, 0.55 + rng.random() * 0.15))
            bark.add_cylinder(foot, head, 0.03 + rng.random() * 0.015, 0.02, segments=5, rgb=(0.55, 0.45, 0.4), caps=True)
        for k in range(26):
            a = rng.random() * math.tau
            r = rng.random() ** 0.6 * 0.75
            add_stone(coals, rng, Vector((math.cos(a) * r, math.sin(a) * r, 0.02)), 0.05 + rng.random() * 0.05, 1, (1, 1, 1))
    return [stones, bark, grain, coals]


# ---------------------------------------------------------------- lantern

LANTERN_GLOW_HEIGHT = 0.64


def build_lantern(far: bool) -> list[Part]:
    wood = Part("lantern-post", srgb("#33271f"), roughness=0.94)
    iron = Part("lantern-iron", srgb("#1f1c1a"), roughness=0.55, metallic=0.4)
    glow = Part("lantern-glow", srgb("#ffc673"), roughness=0.3, emissive=srgb("#ffc673"))
    # A split-wood stake with a chamfered top, driven into the path edge.
    seg = 6 if not far else 4
    wood.add_cylinder(Vector((0, 0, -0.08)), Vector((0, 0, 0.82)), 0.034, 0.026, segments=seg, caps=True)
    # An iron shepherd's hook off the top, the lantern hanging off its tip.
    arm_out = 0.2
    hook = [Vector((0, 0, 0.8))]
    for k in range(1, 7):
        t = k / 6
        hook.append(Vector((arm_out * t, 0, 0.8 + 0.08 * math.sin(t * math.pi))))
    for a, b in zip(hook, hook[1:]):
        iron.add_cylinder(a, b, 0.007, segments=4)
    iron.add_cylinder(Vector((arm_out, 0, 0.8)), Vector((arm_out, 0, 0.74)), 0.004, segments=4)
    cx = Vector((arm_out, 0, LANTERN_GLOW_HEIGHT))
    # Lantern: cap, base, four frame bars, a glass chimney with the glow inside.
    iron.add_cylinder(cx + Vector((0, 0, 0.09)), cx + Vector((0, 0, 0.13)), 0.07, 0.02, segments=8 if not far else 5, caps=True)
    iron.add_cylinder(cx + Vector((0, 0, -0.1)), cx + Vector((0, 0, -0.08)), 0.06, 0.065, segments=8 if not far else 5, caps=True)
    iron.add_cylinder(cx + Vector((0, 0, 0.13)), cx + Vector((0, 0, 0.1 + 0.07)), 0.012, segments=4)
    if not far:
        for k in range(4):
            a = math.pi / 4 + k * math.pi / 2
            o = Vector((math.cos(a) * 0.058, math.sin(a) * 0.058, 0))
            iron.add_cylinder(cx + o + Vector((0, 0, -0.08)), cx + o + Vector((0, 0, 0.09)), 0.005, segments=4)
    glow.add_cylinder(cx + Vector((0, 0, -0.08)), cx + Vector((0, 0, 0.09)), 0.05, 0.045, segments=10 if not far else 6, caps=True)
    return [wood, iron, glow]


# ---------------------------------------------------------------- main

BUILDERS = {
    "canopy": (build_canopy, "led-flow-canopy", Vector((9.5, -8.5, 4.2)), Vector((0, 0, 2.0)), 30),
    "fire": (build_fire, "fire-circle", Vector((3.2, -3.0, 2.1)), Vector((0, 0, 0.15)), 35),
    "lantern": (build_lantern, "path-lantern", Vector((1.0, -1.2, 0.85)), Vector((0.08, 0, 0.5)), 45),
}

reports = []
for key, (builder, name, eye, target, lens) in BUILDERS.items():
    if ASSET not in ("all", key):
        continue
    for far in (False, True):
        collection = reset_scene()
        objects = finish(builder(far), collection)
        file_name = f"{name}-far" if far else name
        reports.append(export(objects, file_name))
        if not far:
            render_preview(objects, name, eye, target, lens)

log("done: " + json.dumps(reports))
