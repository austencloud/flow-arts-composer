"""Build the Moon scene's lunar outpost in Blender (fifth pass, 2026-11-24).

Run headless only:
  "C:/Program Files/Blender Foundation/Blender 5.0/blender.exe" -b --factory-startup \
      --python scripts/build-moon-outpost.py
Then optimise: node scripts/optimize-moon-outpost-glb.mjs

History (see scripts/build-cosmic-reliquary.py): four earlier passes failed
review. Sculpted Meshy set pieces fell apart under the orbiting camera, a
bright tiled regolith "read as concrete", and the stripped dark plain read as
"random 3D viewer dude on the moon with no context". This pass gives the
performer a reason to stand here: a small outpost whose landing pad is the
stage, in hard low sunlight.

What is authored here (static): the terrain (craters with rims and bowls,
swells, a ring of rounded hills that closes the horizon), rocks from pebble to
boulder clustered on crater rims, rover tracks and bootprints from the habitat
to the pad, the habitat module, the comms mast, and templates the runtime
places around the pad as it grows (floodlight mast, cargo groups, audience
bench). Nothing tiles: no image textures at all. Surface detail, the pad, the
lights, the Earth and the sky are made at runtime
(src/lib/shared/3d/environments/worlds/cosmic/).

Blender is Z-up; the glTF export turns Blender (x, y, z) into Three
(x, z, -y). The default viewer camera sits at Three (0, 4.2, 17), which is
Blender (0, -17, 4.2), looking towards Blender +Y.
"""

from __future__ import annotations

import math
import random
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils import noise


ROOT = Path(__file__).resolve().parents[1]
BLEND_PATH = ROOT / "blender" / "moon-outpost.blend"
RAW_GLB = ROOT / "static" / "models" / "cosmic" / "moon-outpost_raw.glb"
PREVIEW_DIR = ROOT / "blender" / "previews"
EXPORT_COLLECTION = "EXPORT_moon_outpost"

# Keep in step with moon-outpost-layout.ts.
PAD_FLAT_RADIUS = 10.5
PAD_BLEND_RADIUS = 15.0
HABITAT = Vector((12.0, 18.0))
HABITAT_YAW = math.radians(-8.0)
COMMS = Vector((-9.0, 26.0))
# Earth direction (Three (-38, 9, -66) => Blender (-38, 66, 9)).
EARTH_DIR = Vector((-38.0, 66.0, 9.0)).normalized()
# Sun direction for the preview render only (runtime owns the real one).
SUN_DIR = Vector((0.875, 0.408, 0.259)).normalized()
BENCH_SEAT_HEIGHT = 0.46
TERRAIN_OUTER_RADIUS = 230.0

RNG = random.Random(20261124)


# ---------------------------------------------------------------- utilities


def clear_scene() -> None:
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)
    for material in list(bpy.data.materials):
        bpy.data.materials.remove(material)


def new_collection(name: str) -> bpy.types.Collection:
    result = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(result)
    return result


def smoothstep(edge0: float, edge1: float, value: float) -> float:
    t = max(0.0, min(1.0, (value - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def material(
    name: str,
    color: tuple[float, float, float],
    roughness: float,
    metallic: float = 0.0,
    emission: tuple[float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except AttributeError:
        pass
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    mat.diffuse_color = (*color, 1.0)
    return mat


class Builder:
    """Collects bmesh parts with a material slot each, then makes one object."""

    def __init__(self, name: str, materials: list[bpy.types.Material]):
        self.name = name
        self.materials = materials
        self.bm = bmesh.new()

    def slot(self, mat: bpy.types.Material) -> int:
        return self.materials.index(mat)

    def _append(self, mesh: bpy.types.Mesh, matrix: Matrix, mat: bpy.types.Material,
                smooth: bool) -> None:
        mesh.transform(matrix)
        temp = bmesh.new()
        temp.from_mesh(mesh)
        index = self.slot(mat)
        for face in temp.faces:
            face.material_index = index
            face.smooth = smooth
        data = bpy.data.meshes.new("_tmp_part")
        temp.to_mesh(data)
        temp.free()
        self.bm.from_mesh(data)
        bpy.data.meshes.remove(data)
        bpy.data.meshes.remove(mesh)

    def box(self, size, location, mat, rotation=(0.0, 0.0, 0.0), bevel=0.02):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
        if bevel > 0:
            limit = min(size) * 0.45
            bmesh.ops.bevel(
                bm,
                geom=list(bm.edges),
                offset=min(bevel, limit),
                segments=2,
                profile=0.6,
                affect="EDGES",
            )
        mesh = bpy.data.meshes.new("_box")
        bm.to_mesh(mesh)
        bm.free()
        matrix = Matrix.Translation(Vector(location)) @ euler_matrix(rotation)
        self._append(mesh, matrix, mat, smooth=False)

    def box_at(self, size, frame: Matrix, local, mat, bevel=0.01):
        """A box whose centre and axes are given in another part's frame."""
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
        if bevel > 0:
            bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(bevel, min(size) * 0.45),
                            segments=2, profile=0.6, affect="EDGES")
        mesh = bpy.data.meshes.new("_box")
        bm.to_mesh(mesh)
        bm.free()
        self._append(mesh, frame @ Matrix.Translation(Vector(local)), mat, smooth=False)

    def rod(self, a, b, radius, mat, segments=8):
        """A round strut from point a to point b."""
        a, b = Vector(a), Vector(b)
        d = b - a
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments,
                              radius1=radius, radius2=radius, depth=d.length)
        mesh = bpy.data.meshes.new("_rod")
        bm.to_mesh(mesh)
        bm.free()
        rotation = d.normalized().to_track_quat("Z", "Y").to_matrix().to_4x4()
        self._append(mesh, Matrix.Translation((a + b) / 2) @ rotation, mat, smooth=True)

    def cylinder(self, radius, depth, location, mat, rotation=(0.0, 0.0, 0.0),
                 segments=24, smooth=True, cap_bevel=0.0, radius2=None):
        bm = bmesh.new()
        bmesh.ops.create_cone(
            bm,
            cap_ends=True,
            cap_tris=False,
            segments=segments,
            radius1=radius,
            radius2=radius if radius2 is None else radius2,
            depth=depth,
        )
        if cap_bevel > 0:
            rim_edges = [
                edge for edge in bm.edges
                if abs(edge.verts[0].co.z - edge.verts[1].co.z) < 1e-6
                and abs(abs(edge.verts[0].co.z) - depth / 2) < 1e-6
            ]
            bmesh.ops.bevel(bm, geom=rim_edges, offset=cap_bevel, segments=2,
                            profile=0.6, affect="EDGES")
        mesh = bpy.data.meshes.new("_cyl")
        bm.to_mesh(mesh)
        bm.free()
        mesh.set_sharp_from_angle(angle=math.radians(40))
        matrix = Matrix.Translation(Vector(location)) @ euler_matrix(rotation)
        self._append(mesh, matrix, mat, smooth=smooth)

    def sphere(self, radius, location, mat, scale=(1.0, 1.0, 1.0), segments=24,
               rings=12, smooth=True, rotation=(0.0, 0.0, 0.0)):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings,
                                  radius=radius)
        bmesh.ops.scale(bm, vec=Vector(scale), verts=bm.verts)
        mesh = bpy.data.meshes.new("_sph")
        bm.to_mesh(mesh)
        bm.free()
        matrix = Matrix.Translation(Vector(location)) @ euler_matrix(rotation)
        self._append(mesh, matrix, mat, smooth=smooth)

    def raw(self, verts, faces, mat, smooth=False):
        mesh = bpy.data.meshes.new("_raw")
        mesh.from_pydata(verts, [], faces)
        mesh.update()
        self._append(mesh, Matrix.Identity(4), mat, smooth=smooth)

    def finish(self, target: bpy.types.Collection, location=(0.0, 0.0, 0.0),
               yaw=0.0) -> bpy.types.Object:
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        for mat in self.materials:
            mesh.materials.append(mat)
        obj = bpy.data.objects.new(self.name, mesh)
        obj.location = location
        obj.rotation_euler = (0.0, 0.0, yaw)
        target.objects.link(obj)
        return obj


def euler_matrix(rotation) -> Matrix:
    rx, ry, rz = rotation
    return (
        Matrix.Rotation(rz, 4, "Z")
        @ Matrix.Rotation(ry, 4, "Y")
        @ Matrix.Rotation(rx, 4, "X")
    )


# ---------------------------------------------------------------- terrain


def fbm(x: float, y: float, seed: float, octaves: int = 4) -> float:
    return noise.fractal(Vector((x, y, seed)), 1.0, 2.0, octaves,
                         noise_basis="PERLIN_NEW")


def make_craters() -> list[tuple[float, float, float, float]]:
    """(x, y, radius, depth) in Blender metres. Kept off the pad, the habitat,
    the comms mast and the main route; larger ones further out."""
    craters: list[tuple[float, float, float, float]] = [
        # Hero craters that read in the default view.
        (-8.5, 10.5, 3.6, 0.75),
        (9.0, -5.5, 2.3, 0.42),
        (-16.0, -3.0, 5.0, 1.0),
        (22.0, 4.0, 6.0, 1.15),
        (-4.0, 30.0, 4.2, 0.8),
    ]

    def clear_of_features(x: float, y: float, r: float) -> bool:
        p = Vector((x, y))
        if p.length < PAD_BLEND_RADIUS + r:
            return False
        if (p - HABITAT).length < 8.0 + r:
            return False
        if (p - COMMS).length < 4.0 + r:
            return False
        for cx, cy, cr, _ in craters:
            if (p - Vector((cx, cy))).length < (cr + r) * 0.9:
                return False
        return True

    def scatter(count, r_range, dist_range, depth_ratio):
        attempts = 0
        placed = 0
        while placed < count and attempts < count * 60:
            attempts += 1
            angle = RNG.uniform(0, math.tau)
            dist = RNG.uniform(*dist_range)
            r = RNG.uniform(*r_range)
            x, y = math.cos(angle) * dist, math.sin(angle) * dist
            if clear_of_features(x, y, r):
                craters.append((x, y, r, r * depth_ratio * RNG.uniform(0.8, 1.2)))
                placed += 1

    scatter(7, (9.0, 18.0), (55.0, 120.0), 0.17)
    scatter(14, (2.5, 6.5), (18.0, 60.0), 0.2)
    scatter(90, (0.4, 2.0), (13.0, 70.0), 0.17)
    return craters


CRATERS: list[tuple[float, float, float, float]] = []


def crater_height(x: float, y: float) -> float:
    total = 0.0
    for cx, cy, r, depth in CRATERS:
        dx, dy = x - cx, y - cy
        d2 = dx * dx + dy * dy
        reach = r * 2.2
        if d2 > reach * reach:
            continue
        t = math.sqrt(d2) / r
        rim = 0.32 * depth
        if t < 1.0:
            # Bowl that rises into the rim crest at t = 1.
            total += (depth + rim) * (t * t * (1.6 - 0.6 * t)) - depth
        else:
            total += rim * math.exp(-((t - 1.0) / 0.42) ** 2 * 2.2)
    return total


def raw_height(x: float, y: float) -> float:
    d = math.hypot(x, y)
    swell = 0.7 * fbm(x / 26.0, y / 26.0, 1.3, 3) + 0.18 * fbm(x / 8.0, y / 8.0, 4.7, 3)
    hills_mask = smoothstep(70.0, 150.0, d)
    hill_noise = fbm(x / 55.0, y / 55.0, 9.1, 3)
    hills = hills_mask * (6.0 + 16.0 * max(0.0, hill_noise + 0.45))
    rim = smoothstep(180.0, TERRAIN_OUTER_RADIUS, d) * 10.0
    return swell + crater_height(x, y) + hills + rim


HABITAT_LEVEL = 0.0
RAW_ORIGIN = 0.0


def terrain_height(x: float, y: float) -> float:
    d = math.hypot(x, y)
    pad_weight = smoothstep(PAD_FLAT_RADIUS, PAD_BLEND_RADIUS, d)
    h = raw_height(x, y)
    # The pad sits on a levelled apron; the runtime pad surface is at z = 0.
    h = -0.02 + (h - RAW_ORIGIN * (1.0 - pad_weight)) * pad_weight
    hab = (Vector((x, y)) - HABITAT).length
    hab_weight = smoothstep(6.0, 9.5, hab)
    return HABITAT_LEVEL * (1.0 - hab_weight) + h * hab_weight


def build_terrain(target, regolith) -> bpy.types.Object:
    segments = 384
    radii = [0.0]
    r = 0.0
    while r < 22.0:
        r += 0.34
        radii.append(r)
    step = 0.34
    while r < TERRAIN_OUTER_RADIUS:
        step *= 1.045
        r = min(TERRAIN_OUTER_RADIUS, r + step)
        radii.append(r)
    verts = [(0.0, 0.0, terrain_height(0.0, 0.0))]
    for ring in radii[1:]:
        for s in range(segments):
            a = s / segments * math.tau
            x, y = math.cos(a) * ring, math.sin(a) * ring
            verts.append((x, y, terrain_height(x, y)))
    faces = []
    for s in range(segments):
        faces.append((0, 1 + s, 1 + (s + 1) % segments))
    for ring_index in range(1, len(radii) - 1):
        base_a = 1 + (ring_index - 1) * segments
        base_b = 1 + ring_index * segments
        for s in range(segments):
            n = (s + 1) % segments
            faces.append((base_a + s, base_b + s, base_b + n, base_a + n))
    builder = Builder("MO_Terrain", [regolith])
    builder.raw(verts, faces, regolith, smooth=True)
    obj = builder.finish(target)
    print(f"terrain verts={len(verts)} rings={len(radii)}")
    return obj


# ---------------------------------------------------------------- routes


def bezier(points: list[Vector], samples: int) -> list[Vector]:
    """Catmull-Rom through the control points."""
    result = []
    pts = [points[0]] + points + [points[-1]]
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
        for k in range(samples):
            t = k / samples
            t2, t3 = t * t, t * t * t
            result.append(0.5 * ((2 * p1) + (-p0 + p2) * t
                                 + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                                 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    result.append(points[-1])
    return result


def resample(path: list[Vector], spacing: float) -> list[Vector]:
    out = [path[0]]
    carry = 0.0
    for a, b in zip(path, path[1:]):
        seg = (b - a).length
        while carry + spacing <= seg:
            carry += spacing
            out.append(a.lerp(b, carry / seg))
        carry -= seg
    return out


# The rover drives from the habitat onto the pad; the runtime clips the tracks
# at the pad's painted edge, whatever size the pad has grown to.
ROVER_PATH = [
    Vector((17.0, 13.2)), Vector((14.6, 10.6)), Vector((11.4, 8.2)),
    Vector((8.2, 6.0)), Vector((5.2, 3.9)), Vector((2.4, 1.8)),
]
BOOT_PATH = [
    Vector((13.2, 12.6)), Vector((11.2, 11.0)), Vector((7.0, 9.4)),
    Vector((4.6, 7.2)), Vector((3.2, 5.0)), Vector((2.6, 3.9)),
]


def distance_to_path(p: Vector, path: list[Vector]) -> float:
    best = 1e9
    for a, b in zip(path, path[1:]):
        ab = b - a
        t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
        best = min(best, (a + ab * t - p).length)
    return best


def ribbon(builder: Builder, centre: list[Vector], offset: float, width: float,
           lift: float, mat, start_v: float = 0.0) -> None:
    verts, faces = [], []
    v_along = start_v
    for i, p in enumerate(centre):
        nxt = centre[min(i + 1, len(centre) - 1)]
        prv = centre[max(i - 1, 0)]
        tangent = (nxt - prv).normalized()
        normal = Vector((-tangent.y, tangent.x))
        if i > 0:
            v_along += (p - centre[i - 1]).length
        for side in (-0.5, 0.5):
            q = p + normal * (offset + side * width)
            verts.append((q.x, q.y, terrain_height(q.x, q.y) + lift))
    for i in range(len(centre) - 1):
        a = i * 2
        faces.append((a, a + 1, a + 3, a + 2))
    builder.raw(verts, faces, mat)
    # UVs: u across the tread (0..1), v along it in metres.
    bm = builder.bm
    bm.faces.ensure_lookup_table()
    uv_layer = bm.loops.layers.uv.verify()
    first_face = len(bm.faces) - len(faces)
    lengths = [0.0]
    for i in range(1, len(centre)):
        lengths.append(lengths[-1] + (centre[i] - centre[i - 1]).length)
    for fi in range(len(faces)):
        face = bm.faces[first_face + fi]
        for loop, (vi, uvu) in zip(face.loops, ((0, 0.0), (0, 1.0), (1, 1.0), (1, 0.0))):
            loop[uv_layer].uv = (uvu, start_v + lengths[fi + vi])


def build_tracks(target, track_mat) -> bpy.types.Object:
    builder = Builder("MO_RoverTracks", [track_mat])
    # Close sampling keeps the curve smooth: no visible corners between quads.
    centre = resample(bezier(ROVER_PATH, 24), 0.12)
    gauge = 1.7
    for offset in (-gauge / 2, gauge / 2):
        ribbon(builder, centre, offset, 0.3, 0.012, track_mat)
    return builder.finish(target)


def build_bootprints(target, boot_mat) -> bpy.types.Object:
    builder = Builder("MO_Bootprints", [boot_mat])
    for path_offset, reverse in ((0.0, False), (0.55, True)):
        path = resample(bezier(BOOT_PATH, 12), 0.36)
        if reverse:
            path = list(reversed(path))
        for i, p in enumerate(path[:-1]):
            nxt = path[i + 1]
            tangent = (nxt - p).normalized()
            normal = Vector((-tangent.y, tangent.x))
            side = 0.13 if i % 2 == 0 else -0.13
            centre = p + normal * (side + path_offset)
            centre += Vector((RNG.uniform(-0.03, 0.03), RNG.uniform(-0.03, 0.03)))
            length, width = 0.31, 0.13
            corners = []
            for along, across in ((-0.5, -0.5), (-0.5, 0.5), (0.5, 0.5), (0.5, -0.5)):
                q = centre + tangent * (along * length) + normal * (across * width)
                corners.append((q.x, q.y, terrain_height(q.x, q.y) + 0.01))
            builder.raw(corners, [(0, 1, 2, 3)], boot_mat)
            bm = builder.bm
            bm.faces.ensure_lookup_table()
            uv_layer = bm.loops.layers.uv.verify()
            face = bm.faces[len(bm.faces) - 1]
            for loop, uv in zip(face.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
                loop[uv_layer].uv = uv
    return builder.finish(target)


# ---------------------------------------------------------------- rocks


def rock_mesh(builder: Builder, centre: Vector, size: float, mat, seed: float,
              sink: float = 0.32, subdivisions: int = 2) -> None:
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=1.0)
    squash = (RNG.uniform(0.85, 1.25), RNG.uniform(0.75, 1.1), RNG.uniform(0.45, 0.75))
    for v in bm.verts:
        n = v.co.normalized()
        bump = noise.noise(n * 1.6 + Vector((seed, seed * 0.7, 1.3))) * 0.28
        bump += noise.noise(n * 4.0 + Vector((seed * 1.9, 0.2, seed))) * 0.08
        # Flatten facets a little so the rock reads as fractured, not blobby.
        v.co = n * (1.0 + bump)
        v.co.x *= squash[0]
        v.co.y *= squash[1]
        v.co.z *= squash[2]
    mesh = bpy.data.meshes.new("_rock")
    bm.to_mesh(mesh)
    bm.free()
    mesh.set_sharp_from_angle(angle=math.radians(34))
    ground = terrain_height(centre.x, centre.y)
    matrix = (
        Matrix.Translation(Vector((centre.x, centre.y, ground - sink * size * squash[2])))
        @ Matrix.Rotation(RNG.uniform(0, math.tau), 4, "Z")
        @ Matrix.Rotation(RNG.uniform(-0.25, 0.25), 4, "X")
        @ Matrix.Scale(size, 4)
    )
    builder._append(mesh, matrix, mat, smooth=True)


def rock_site_ok(p: Vector, min_radius: float, clearance: float) -> bool:
    if p.length < min_radius:
        return False
    if (p - HABITAT).length < 6.5 + clearance:
        return False
    if (p - COMMS).length < 2.5 + clearance:
        return False
    if distance_to_path(p, ROVER_PATH) < 1.6 + clearance:
        return False
    if distance_to_path(p, BOOT_PATH) < 0.8 + clearance:
        return False
    return True


def build_rocks(target, rock_mat) -> bpy.types.Object:
    builder = Builder("MO_Rocks", [rock_mat])
    placed = 0
    seed = 0.0

    def place(p: Vector, size: float, subdivisions: int = 2) -> None:
        nonlocal placed, seed
        seed += 1.37
        rock_mesh(builder, p, size, rock_mat, seed, subdivisions=subdivisions)
        placed += 1

    # Boulders: ejecta on the rims of the larger craters.
    for cx, cy, r, _ in CRATERS:
        if r < 2.2:
            continue
        count = 1 + int(r / 2.5)
        for _ in range(count):
            a = RNG.uniform(0, math.tau)
            dist = r * RNG.uniform(1.0, 1.7)
            p = Vector((cx + math.cos(a) * dist, cy + math.sin(a) * dist))
            if not rock_site_ok(p, 12.0, 0.6):
                continue
            size = min(2.4, RNG.uniform(0.25, 0.55) * (r / 3.0) ** 0.7)
            place(p, size, 2)
            # A few smaller pieces broken off beside it.
            for _ in range(RNG.randint(1, 3)):
                q = p + Vector((RNG.uniform(-1.2, 1.2), RNG.uniform(-1.2, 1.2))) * size * 1.6
                if rock_site_ok(q, 11.0, 0.2):
                    place(q, size * RNG.uniform(0.15, 0.35), 1)
    # Mid rocks scattered with clumping.
    for _ in range(110):
        a = RNG.uniform(0, math.tau)
        dist = 9.5 + RNG.random() ** 1.8 * 55.0
        p = Vector((math.cos(a) * dist, math.sin(a) * dist))
        if rock_site_ok(p, 9.5, 0.3):
            place(p, RNG.uniform(0.1, 0.4), 1)
    # Pebbles, closer in, around the apron edge.
    for _ in range(160):
        a = RNG.uniform(0, math.tau)
        dist = 7.5 + RNG.random() ** 1.3 * 26.0
        p = Vector((math.cos(a) * dist, math.sin(a) * dist))
        if rock_site_ok(p, 7.5, 0.0):
            place(p, RNG.uniform(0.035, 0.11), 1)
    print(f"rocks={placed}")
    return builder.finish(target)


# ---------------------------------------------------------------- outpost


def build_habitat(target, mats) -> bpy.types.Object:
    white, grey, gold, trim, window, airlock_lamp = (
        mats["white"], mats["grey"], mats["gold"], mats["trim"], mats["window"],
        mats["airlock_lamp"],
    )
    b = Builder("MO_Habitat", [white, grey, gold, trim, window, airlock_lamp])
    body_r = 1.9
    body_len = 6.4
    axis_z = 0.95 + body_r
    # Feet, legs and the foil-wrapped service bay under the hull.
    for sx in (-2.5, 2.5):
        for sy in (-1.15, 1.15):
            b.cylinder(0.28, 0.1, (sx, sy, 0.05), grey, segments=16, smooth=False)
            b.box((0.14, 0.14, 0.85), (sx, sy, 0.52), grey, bevel=0.02)
            b.box((0.5, 0.08, 0.08), (sx, sy * 0.6, 0.85), grey, bevel=0.01)
    b.box((5.2, 2.0, 0.5), (0.0, 0.0, 1.0), gold, bevel=0.05)
    b.box((5.4, 2.1, 0.06), (0.0, 0.0, 0.73), grey, bevel=0.01)
    # Hull.
    hull_rot = (0.0, math.pi / 2, 0.0)
    b.cylinder(body_r, body_len, (0.0, 0.0, axis_z), white, rotation=hull_rot, segments=40)
    for sx in (-1, 1):
        b.sphere(body_r, (sx * body_len / 2, 0.0, axis_z), white,
                 scale=(0.55, 1.0, 1.0), segments=40, rings=20)
        # End rings and a docking collar on the far end.
        b.cylinder(body_r + 0.05, 0.14, (sx * (body_len / 2 - 0.05), 0.0, axis_z), grey,
                   rotation=hull_rot, segments=40, cap_bevel=0.02)
    b.cylinder(0.55, 0.5, (body_len / 2 + 1.15, 0.0, axis_z), grey, rotation=hull_rot,
               segments=24, cap_bevel=0.03)
    b.cylinder(0.42, 0.06, (body_len / 2 + 1.42, 0.0, axis_z), trim, rotation=hull_rot,
               segments=24)
    # Panel bands along the hull (raised seams between pressure segments).
    for x in (-1.6, 0.0, 1.6):
        b.cylinder(body_r + 0.025, 0.07, (x, 0.0, axis_z), grey, rotation=hull_rot,
                   segments=40)
    # Longitudinal seams.
    for angle in (math.radians(60), math.radians(120)):
        y = math.cos(angle) * (body_r + 0.01)
        z = axis_z + math.sin(angle) * (body_r + 0.01)
        b.box((body_len - 0.3, 0.04, 0.04), (0.0, y, z), grey, rotation=(angle, 0, 0), bevel=0.0)
    # Windows on the pad-facing side (-Y), with dark frames.
    for x in (-2.2, -0.8, 0.6):
        frame_y = -body_r * math.cos(math.radians(12)) - 0.02
        z = axis_z + body_r * math.sin(math.radians(12))
        rot = (math.radians(-12), 0.0, 0.0)
        b.box((0.66, 0.06, 0.46), (x, frame_y, z), trim, rotation=rot, bevel=0.03)
        b.box((0.5, 0.06, 0.32), (x, frame_y - 0.025, z), window, rotation=rot, bevel=0.04)
    # Airlock on the pad side, with hatch, lamp and ramp.
    lock_x = 2.0
    lock_y = -body_r - 0.55
    lock_z = 2.05
    b.cylinder(0.9, 1.4, (lock_x, lock_y + 0.25, lock_z), white,
               rotation=(math.pi / 2, 0.0, 0.0), segments=32, cap_bevel=0.05)
    b.cylinder(0.95, 0.1, (lock_x, lock_y - 0.4, lock_z), grey,
               rotation=(math.pi / 2, 0.0, 0.0), segments=32, cap_bevel=0.02)
    b.box((0.95, 0.08, 1.25), (lock_x, lock_y - 0.47, lock_z - 0.05), trim, bevel=0.06)
    b.box((0.18, 0.06, 0.08), (lock_x + 0.28, lock_y - 0.52, lock_z - 0.05), grey, bevel=0.01)
    b.box((0.3, 0.12, 0.1), (lock_x, lock_y - 0.5, lock_z + 0.8), airlock_lamp, bevel=0.02)
    b.box((0.4, 0.16, 0.05), (lock_x, lock_y - 0.48, lock_z + 0.87), grey, bevel=0.01)
    ramp_len = 2.4
    ramp_top = lock_z - 0.62
    ramp_angle = math.atan2(ramp_top, ramp_len)
    b.box((1.0, math.hypot(ramp_len, ramp_top), 0.08),
          (lock_x, lock_y - 0.55 - ramp_len / 2, ramp_top / 2), grey,
          rotation=(ramp_angle, 0.0, 0.0), bevel=0.02)
    for side in (-0.5, 0.5):
        b.box((0.05, math.hypot(ramp_len, ramp_top), 0.05),
              (lock_x + side, lock_y - 0.55 - ramp_len / 2, ramp_top / 2 + 0.45), grey,
              rotation=(ramp_angle, 0.0, 0.0), bevel=0.0)
    # Radiator wing and a small antenna on the roof.
    b.box((0.12, 0.12, 0.9), (-1.0, 0.6, axis_z + body_r + 0.3), grey, bevel=0.02)
    b.box((3.2, 1.3, 0.05), (-1.0, 0.6, axis_z + body_r + 0.8), white,
          rotation=(math.radians(14), 0.0, 0.0), bevel=0.02)
    for x in (-2.2, -1.4, -0.6, 0.2):
        b.box((0.03, 1.28, 0.06), (x, 0.6, axis_z + body_r + 0.8), grey,
              rotation=(math.radians(14), 0.0, 0.0), bevel=0.0)
    b.cylinder(0.03, 1.3, (1.8, 0.7, axis_z + body_r + 0.55), grey, segments=8)
    b.sphere(0.07, (1.8, 0.7, axis_z + body_r + 1.22), grey, segments=10, rings=6)
    level = terrain_height(HABITAT.x, HABITAT.y)
    return b.finish(target, (HABITAT.x, HABITAT.y, level), HABITAT_YAW)


def build_comms(target, mats) -> bpy.types.Object:
    white, grey, gold, beacon = mats["white"], mats["grey"], mats["gold"], mats["beacon"]
    b = Builder("MO_CommsMast", [white, grey, gold, beacon])
    height = 8.5
    for i in range(3):
        a = i / 3 * math.tau
        foot = Vector((math.cos(a), math.sin(a))) * 1.1
        b.box((0.12, 0.12, 1.6), (foot.x * 0.55, foot.y * 0.55, 0.65), grey,
              rotation=(-math.sin(a) * 0.62, math.cos(a) * 0.62, 0.0), bevel=0.02)
        b.cylinder(0.2, 0.08, (foot.x, foot.y, 0.04), grey, segments=12, smooth=False)
    b.box((0.5, 0.5, 0.6), (0.0, 0.0, 0.9), gold, bevel=0.04)
    b.cylinder(0.07, height, (0.0, 0.0, height / 2), grey, segments=12)
    for z in (2.5, 4.5, 6.5):
        b.cylinder(0.11, 0.08, (0.0, 0.0, z), grey, segments=12)
    # The dish. The opening camera stands at Blender (0, -17, 4.2); the axis is
    # turned about 65 degrees from it, so that view sees a narrow ellipse with a
    # rim, struts and a feed, never a round disc.
    level = terrain_height(COMMS.x, COMMS.y) - 0.03
    dish_centre = Vector((0.55, -0.35, 6.0))
    to_camera = (Vector((0.0, -17.0, 4.2)) - (Vector((COMMS.x, COMMS.y, level)) + dish_centre)).normalized()
    left = Vector((-to_camera.y, to_camera.x, 0.0)).normalized()
    if left.x > 0:
        left = -left
    axis = (to_camera * 0.42 + left * 0.9 + Vector((0.0, 0.0, 0.35))).normalized()
    frame = Matrix.Translation(dish_centre) @ axis.to_track_quat("Z", "Y").to_matrix().to_4x4()

    def at(x, y, z):
        return (frame @ Vector((x, y, z, 1.0))).to_3d()

    radius, depth, rings, segs = 0.8, 0.2, 6, 32
    verts, faces = [], []
    for r in range(rings + 1):
        rr = r / rings * radius
        for s_ in range(segs):
            a = s_ / segs * math.tau
            verts.append(tuple(at(math.cos(a) * rr, math.sin(a) * rr, depth * (rr / radius) ** 2)))
    for r in range(rings):
        for s_ in range(segs):
            n = (s_ + 1) % segs
            a0, a1 = r * segs + s_, r * segs + n
            b0, b1 = (r + 1) * segs + s_, (r + 1) * segs + n
            faces.append((a0, b0, b1, a1))
    b.raw(verts, faces, white, smooth=True)
    b.raw(list(verts), [tuple(reversed(f)) for f in faces], grey, smooth=True)
    # Rim: a round lip round the bowl's edge.
    rim_segs = 32
    for s_ in range(rim_segs):
        a0 = s_ / rim_segs * math.tau
        a1 = (s_ + 1) / rim_segs * math.tau
        b.rod(at(math.cos(a0) * radius, math.sin(a0) * radius, depth),
              at(math.cos(a1) * radius, math.sin(a1) * radius, depth), 0.03, grey, segments=6)
    # Back ribs from the hub out to the rim.
    hub = at(0.0, 0.0, -0.14)
    for i in range(6):
        a = i / 6 * math.tau
        b.rod(hub, at(math.cos(a) * radius * 0.96, math.sin(a) * radius * 0.96, depth - 0.01),
              0.018, grey, segments=6)
    # Feed horn held out in front on three struts.
    feed = at(0.0, 0.0, 0.66)
    for i in range(3):
        a = i / 3 * math.tau + 0.5
        b.rod(at(math.cos(a) * radius * 0.98, math.sin(a) * radius * 0.98, depth), feed,
              0.016, grey, segments=6)
    b.rod(at(0.0, 0.0, 0.6), at(0.0, 0.0, 0.78), 0.06, gold, segments=12)
    # Hub housing and the arm back to the mast.
    b.rod(at(0.0, 0.0, -0.06), at(0.0, 0.0, -0.3), 0.12, grey, segments=12)
    b.rod(at(0.0, 0.0, -0.3), (0.0, 0.0, dish_centre.z - 0.2), 0.05, grey, segments=8)
    b.box((0.3, 0.3, 0.3), (0.0, 0.0, dish_centre.z - 0.2), grey, bevel=0.03)
    b.sphere(0.13, (0.0, 0.0, height + 0.1), beacon, segments=14, rings=8)
    return b.finish(target, (COMMS.x, COMMS.y, level))


def build_flood_mast_template(target, mats) -> bpy.types.Object:
    """Origin on the ground at the mast foot. The lamp faces Blender -Y, which
    the runtime turns towards the pad centre (Three +Z before rotation)."""
    grey, trim, lamp, white = mats["grey"], mats["trim"], mats["flood_lamp"], mats["white"]
    b = Builder("MO_TemplateFloodMast", [grey, trim, lamp, white])
    height = 4.6
    for i in range(3):
        a = i / 3 * math.tau + 0.4
        foot = Vector((math.cos(a), math.sin(a))) * 0.7
        b.box((0.07, 0.07, 1.0), (foot.x * 0.5, foot.y * 0.5, 0.42), grey,
              rotation=(-math.sin(a) * 0.75, math.cos(a) * 0.75, 0.0), bevel=0.01)
        b.cylinder(0.11, 0.05, (foot.x, foot.y, 0.025), grey, segments=10, smooth=False)
    b.box((0.36, 0.28, 0.3), (0.0, 0.0, 0.45), white, bevel=0.03)
    b.cylinder(0.045, height, (0.0, 0.0, height / 2), grey, segments=10)
    b.box((0.9, 0.08, 0.08), (0.0, 0.0, height - 0.05), grey, bevel=0.01)
    tilt = (math.radians(38), 0.0, 0.0)
    for x in (-0.3, 0.3):
        # Lamp frame: x across, -y out of the face, z up the face.
        frame = Matrix.Translation(Vector((x, -0.12, height + 0.08))) @ euler_matrix(tilt)
        b.box_at((0.42, 0.26, 0.3), frame, (0.0, 0.02, 0.0), white, bevel=0.03)
        b.box_at((0.36, 0.08, 0.24), frame, (0.0, 0.17, 0.0), grey, bevel=0.02)
        # Dark bezel round a recessed face, a hood over it, fins at its sides.
        b.box_at((0.4, 0.04, 0.28), frame, (0.0, -0.12, 0.0), trim, bevel=0.01)
        b.box_at((0.3, 0.02, 0.18), frame, (0.0, -0.13, 0.0), lamp, bevel=0.005)
        for gz in (-0.03, 0.03):
            b.box_at((0.3, 0.012, 0.012), frame, (0.0, -0.142, gz), trim, bevel=0.0)
        b.box_at((0.44, 0.16, 0.02), frame, (0.0, -0.2, 0.16), white, bevel=0.006)
        for fx in (-0.21, 0.21):
            b.box_at((0.02, 0.14, 0.3), frame, (fx, -0.19, 0.0), white, bevel=0.006)
    return b.finish(target)


def crate(b: Builder, size, location, mats, yaw=0.0) -> None:
    white, grey = mats["white"], mats["grey"]
    b.box(size, location, white, rotation=(0.0, 0.0, yaw), bevel=0.04)
    sx, sy, sz = size
    # Edge frame bands.
    for dz in (-sz / 2 + 0.05, sz / 2 - 0.05):
        b.box((sx + 0.02, sy + 0.02, 0.05), (location[0], location[1], location[2] + dz),
              grey, rotation=(0.0, 0.0, yaw), bevel=0.01)


def tank(b: Builder, radius, length, location, mats, lying=False, yaw=0.0) -> None:
    white, grey, gold = mats["white"], mats["grey"], mats["gold"]
    rot = (0.0, math.pi / 2, yaw) if lying else (0.0, 0.0, yaw)
    b.cylinder(radius, length, location, white, rotation=rot, segments=24, cap_bevel=0.06)
    for t in (-0.32, 0.32):
        if lying:
            offset = Vector((math.cos(yaw), math.sin(yaw), 0.0)) * (t * length)
            b.cylinder(radius + 0.015, 0.06, tuple(Vector(location) + offset), grey,
                       rotation=rot, segments=24)
        else:
            b.cylinder(radius + 0.015, 0.06, (location[0], location[1], location[2] + t * length),
                       grey, rotation=rot, segments=24)
    if not lying:
        b.cylinder(radius * 0.5, 0.1, (location[0], location[1], location[2] + length / 2 + 0.05),
                   gold, segments=16, cap_bevel=0.02)


def build_cargo_templates(target, mats) -> list[bpy.types.Object]:
    grey = mats["grey"]
    a = Builder("MO_TemplateCargoA", [mats["white"], grey, mats["gold"]])
    crate(a, (1.0, 0.8, 0.7), (0.0, 0.0, 0.35), mats, yaw=0.1)
    crate(a, (0.6, 0.55, 0.45), (0.15, 0.05, 0.925), mats, yaw=-0.2)
    a.box((0.3, 1.5, 0.12), (1.0, -0.1, 0.06), grey, bevel=0.02)
    a.box((0.3, 1.5, 0.12), (1.0, 0.75, 0.06), grey, bevel=0.02)
    tank(a, 0.34, 1.5, (1.0, 0.33, 0.48), mats, lying=True, yaw=math.pi / 2)
    b = Builder("MO_TemplateCargoB", [mats["white"], grey, mats["gold"]])
    tank(b, 0.28, 1.25, (0.0, 0.0, 0.625), mats)
    tank(b, 0.28, 1.25, (0.62, 0.12, 0.625), mats)
    crate(b, (0.7, 0.6, 0.5), (-0.2, -0.75, 0.25), mats, yaw=0.35)
    return [a.finish(target), b.finish(target)]


def build_bench_template(target, mats) -> bpy.types.Object:
    """One audience bench, centred on its seat origin, facing Blender -Y
    (Three +Z): the runtime turns it with the seat it sits under."""
    white, grey, trim = mats["white"], mats["grey"], mats["trim"]
    b = Builder("MO_TemplateBench", [white, grey, trim])
    h = BENCH_SEAT_HEIGHT
    # Dark matte top so the benches never pull the eye from the performer.
    b.box((1.1, 0.5, 0.13), (0.0, 0.0, h - 0.065), trim, bevel=0.03)
    b.box((1.04, 0.44, 0.05), (0.0, 0.0, h - 0.155), grey, bevel=0.012)
    for x in (-0.36, 0.36):
        b.box((0.18, 0.38, h - 0.18), (x, 0.0, (h - 0.18) / 2), grey, bevel=0.02)
        b.box((0.24, 0.5, 0.05), (x, 0.0, 0.025), trim, bevel=0.012)
    return b.finish(target)


# ---------------------------------------------------------------- preview


def add_preview(preview: bpy.types.Collection) -> bpy.types.Object:
    world = bpy.context.scene.world or bpy.data.worlds.new("MO_World")
    bpy.context.scene.world = world
    try:
        world.use_nodes = True
    except AttributeError:
        pass
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.0, 0.0, 0.0, 1)
    bg.inputs["Strength"].default_value = 0.0
    sun_data = bpy.data.lights.new("PREVIEW_Sun", "SUN")
    sun_data.energy = 4.5
    sun_data.angle = math.radians(0.5)
    sun = bpy.data.objects.new("PREVIEW_Sun", sun_data)
    sun.rotation_euler = SUN_DIR.to_track_quat("Z", "Y").to_euler()
    preview.objects.link(sun)
    camera_data = bpy.data.cameras.new("PREVIEW_CameraData")
    camera_data.lens = 30
    camera_data.clip_end = 600
    camera = bpy.data.objects.new("PREVIEW_Camera", camera_data)
    preview.objects.link(camera)
    bpy.context.scene.camera = camera
    return camera


def look_at(obj, point) -> None:
    direction = Vector(point) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def render_previews(camera) -> None:
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 960
    scene.render.resolution_y = 540
    scene.render.image_settings.file_format = "PNG"
    views = {
        "front": ((0.0, -17.0, 4.2), (0.0, 1.0, 1.1)),
        "top": ((0.0, -0.01, 70.0), (0.0, 0.0, 0.0)),
    }
    for name, (location, target) in views.items():
        camera.location = location
        look_at(camera, target)
        scene.render.filepath = str(PREVIEW_DIR / f"moon-outpost-{name}.png")
        bpy.ops.render.render(write_still=True)


# ---------------------------------------------------------------- main


def export_glb(collection: bpy.types.Collection) -> None:
    """Same glTF settings as scripts/blender-export-cosmic-full.py."""
    bpy.ops.object.select_all(action="DESELECT")
    selected = [obj for obj in collection.objects if obj.type == "MESH"]
    for obj in selected:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = selected[0]
    RAW_GLB.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(RAW_GLB),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_materials="EXPORT",
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_cameras=False,
        export_lights=False,
    )
    print(f"MOON_OUTPOST_RAW={RAW_GLB}")


def main() -> None:
    global CRATERS, HABITAT_LEVEL, RAW_ORIGIN
    clear_scene()
    CRATERS = make_craters()
    RAW_ORIGIN = raw_height(0.0, 0.0)
    HABITAT_LEVEL = raw_height(HABITAT.x, HABITAT.y)
    export = new_collection(EXPORT_COLLECTION)
    preview = new_collection("PREVIEW_not_exported")
    mats = {
        "regolith": material("MO_Regolith", (0.32, 0.31, 0.3), 0.95),
        "rock": material("MO_Rock", (0.22, 0.215, 0.21), 0.9),
        "track": material("MO_Track", (0.2, 0.2, 0.2), 0.95),
        "boot": material("MO_Boot", (0.2, 0.2, 0.2), 0.95),
        "white": material("MO_PanelWhite", (0.72, 0.72, 0.7), 0.55),
        "grey": material("MO_MetalGrey", (0.32, 0.33, 0.35), 0.42, metallic=0.6),
        "gold": material("MO_GoldFoil", (0.78, 0.55, 0.18), 0.32, metallic=0.45),
        "trim": material("MO_DarkTrim", (0.05, 0.05, 0.055), 0.85),
        "window": material("MO_Window", (0.9, 0.7, 0.45), 0.3,
                           emission=(1.0, 0.72, 0.42), emission_strength=4.0),
        "airlock_lamp": material("MO_AirlockLamp", (1.0, 0.6, 0.25), 0.3,
                                 emission=(1.0, 0.55, 0.2), emission_strength=6.0),
        "flood_lamp": material("MO_FloodLamp", (1.0, 0.78, 0.5), 0.2,
                               emission=(1.0, 0.7, 0.4), emission_strength=1.6),
        "beacon": material("MO_Beacon", (1.0, 0.1, 0.06), 0.3,
                           emission=(1.0, 0.08, 0.04), emission_strength=8.0),
    }
    build_terrain(export, mats["regolith"])
    build_tracks(export, mats["track"])
    build_bootprints(export, mats["boot"])
    build_rocks(export, mats["rock"])
    build_habitat(export, mats)
    build_comms(export, mats)
    build_flood_mast_template(export, mats)
    build_cargo_templates(export, mats)
    build_bench_template(export, mats)
    camera = add_preview(preview)
    BLEND_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    export_glb(export)
    if "--previews" in __import__("sys").argv:
        render_previews(camera)


if __name__ == "__main__":
    main()
