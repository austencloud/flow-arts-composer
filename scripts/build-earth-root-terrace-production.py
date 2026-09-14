"""Finish the Root Terrace graybox into the production shell the museum walks.

Pipeline (each step regenerates the next from source, nothing is hand-edited):

    pnpm exec tsx scripts/export-earth-root-terrace-blender-plan.ts
        -> docs/superpowers/specs/earth-root-terrace/earth-root-terrace-blender-plan.json
    blender -b -P scripts/build-earth-root-terrace-graybox.py
        -> blender/earth-root-terrace-graybox.blend   (the measured carve; geometry authority)
    blender -b -P scripts/build-earth-root-terrace-production.py [-- --fast]
        -> blender/earth-root-terrace-production.blend
        -> blender/exports/earth-root-terrace.raw.glb
        -> static/models/museum/cave/earth-root-terrace.glb   (gltf-transform optimised)
        -> blender/qa/earth-root-terrace-production/*.png     (Cycles views to look at)

What this pass adds to the graybox:

  * The carved shell becomes rock. The voxel remesher runs on the VOID rather
    than the shell (it discards enclosed cavities), so the remesh is driven by
    the surface the visitor actually sees, and the normals are flipped after.
    The void is built from the graybox's own two blocks - the room block and
    the corridor wing - not from a bounding box, because the shell is an L and
    a bounding box would hand the notch's outside face to the room.
  * The rock splits in two: the pit (rootbed, aven and cleft) and everything
    the visitor stands on (vestibule, ramp, terrace, east route, corridor).
    Each carries its own baked lightmap, because they are lit by different
    things - the pit by the daylight aven, the route by brass lanterns and by
    the First Fire behind the west door - and the runtime dims them apart.
  * Four rock sets, blended by height rather than painted on: cliff face high,
    mossy rock low, rocky trail on the walked decks and forest loam on the bed
    floor. The room's whole subject is a living floor five metres under a dry
    ledge, so the material has to say that without a single coloured light.
  * Brass, cut stone, roots and moss each get their own small lightmap, so the
    rail catches its lanterns instead of reading as a flat-shaded tube.
  * Performer stations are NOT exported: the museum pedestal standard renders
    them at runtime from the plan.

Flags after `--`:  --fast   1024 px lightmaps, 32 samples, no denoise, 2 views
                   --no-render   skip the QA views
                   --skip-optimize   leave the raw GLB only
"""

from __future__ import annotations

import json
import math
import subprocess
import sys
import urllib.request
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SPEC_DIR = ROOT / "docs" / "superpowers" / "specs" / "earth-root-terrace"
GRAYBOX_BLEND = ROOT / "blender" / "earth-root-terrace-graybox.blend"
GRAYBOX_REPORT = SPEC_DIR / "earth-root-terrace-graybox-report.json"
PROD_BLEND = ROOT / "blender" / "earth-root-terrace-production.blend"
MANIFEST_PATH = SPEC_DIR / "earth-root-terrace-blender-plan.json"
TEX_DIR = ROOT / "blender" / "polyhaven_textures"
RAW_GLB_PATH = ROOT / "blender" / "exports" / "earth-root-terrace.raw.glb"
FINAL_GLB_PATH = ROOT / "static" / "models" / "museum" / "cave" / "earth-root-terrace.glb"
QA_DIR = ROOT / "blender" / "qa" / "earth-root-terrace-production"
REPORT_PATH = SPEC_DIR / "earth-root-terrace-production-report.json"

ARGS = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
FAST = "--fast" in ARGS
RENDER = "--no-render" not in ARGS
OPTIMIZE = "--skip-optimize" not in ARGS

ROCK_LIGHTMAP_PX = 1024 if FAST else 4096
TRIM_LIGHTMAP_PX = 512 if FAST else 1024
BAKE_SAMPLES = 32 if FAST else 256
VIEW_SAMPLES = 32 if FAST else 128

# CC0 PolyHaven sets. Height decides which one you are looking at: bare cliff
# where the room is dry and lit, mossy rock down where the roots reach; the
# walked deck is a rocky trail and the rootbed is forest loam.
TEXTURE_SETS = {
    "cliff": "rock_face",
    "moss": "mossy_rock",
    "trail": "rocky_trail",
    "loam": "forest_ground_04",
}
TEXTURE_MAPS = ("diff", "nor_gl", "rough", "ao")
# Long periods on purpose. A 2 m period over a 21 m rootbed repeats eight
# times across one frame and the eye reads the repeat before it reads the
# rock - the floors especially, because they are the widest unbroken surface
# in the museum. A low-frequency tonal drift (see `breakup`) does the rest.
TEXTURE_PERIOD_M = {"cliff": 4.0, "moss": 3.0, "trail": 3.2, "loam": 4.5}

# Where one set becomes the other, in Blender z (= world elevation).
WALL_BLEND = (-1.5, 0.5)   # moss below, cliff above
FLOOR_BLEND = (-2.0, -1.0)  # loam below, trail above


def log(message: str) -> None:
    print(f"[et-production] {message}", flush=True)


# ── Source ──────────────────────────────────────────────────────────────────
if not GRAYBOX_BLEND.exists():
    raise RuntimeError(
        f"Missing {GRAYBOX_BLEND}. Run scripts/build-earth-root-terrace-graybox.py first."
    )
manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
graybox = json.loads(GRAYBOX_REPORT.read_text(encoding="utf-8"))
bpy.ops.wm.open_mainfile(filepath=str(GRAYBOX_BLEND))
scene = bpy.context.scene
if scene.get("earth_root_terrace_source_digest") != manifest["sourceDigest"]:
    raise RuntimeError(
        "The graybox blend was built from a different plan than the manifest on "
        "disk. Rebuild the graybox before finishing it."
    )
if graybox.get("sourceDigest") != manifest["sourceDigest"]:
    raise RuntimeError(
        "The graybox report is stale. Rebuild the graybox before finishing it."
    )
SOURCE_DIGEST = manifest["sourceDigest"]
CONTRACT = manifest["contract"]
if CONTRACT["coordinateSystem"]["gltfRuntime"]["integrationStatus"] != "compiled-cave-earth-room":
    raise RuntimeError("The production shell must be built from the compiled cave-earth contract")
ROOM = CONTRACT["room"]
BOUNDS = ROOM["blenderBounds"]
DATUMS = CONTRACT["datums"]
BED = CONTRACT["bed"]
CLEFT = CONTRACT["cleft"]
AVEN = CONTRACT["aven"]
CONSOLES = CONTRACT["consoles"]
BED_Y = DATUMS["bed"]
BLOCK = graybox["shell"]["block"]
WING = graybox["shell"]["wing"]

for path in (PROD_BLEND.parent, RAW_GLB_PATH.parent, FINAL_GLB_PATH.parent, QA_DIR, SPEC_DIR):
    path.mkdir(parents=True, exist_ok=True)


# ── Textures ────────────────────────────────────────────────────────────────
def texture_path(set_key: str, map_key: str) -> Path:
    asset = TEXTURE_SETS[set_key]
    return TEX_DIR / asset / f"{asset}_{map_key}_2k.jpg"


for set_key, asset in TEXTURE_SETS.items():
    for map_key in TEXTURE_MAPS:
        target = texture_path(set_key, map_key)
        if target.exists() and target.stat().st_size > 0:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        url = f"https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/{asset}/{target.name}"
        log(f"downloading {url}")
        urllib.request.urlretrieve(url, target)


def load_image(set_key: str, map_key: str) -> bpy.types.Image:
    path = texture_path(set_key, map_key)
    image = bpy.data.images.load(str(path), check_existing=True)
    image.colorspace_settings.name = "sRGB" if map_key == "diff" else "Non-Color"
    return image


# ── GPU ─────────────────────────────────────────────────────────────────────
def enable_gpu() -> str:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for device_type in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = device_type
            prefs.get_devices()
        except Exception as exc:  # noqa: BLE001
            log(f"{device_type} unavailable: {exc}")
            continue
        gpus = [d for d in prefs.devices if d.type == device_type]
        if not gpus:
            continue
        for device in prefs.devices:
            device.use = device.type == device_type
        scene.cycles.device = "GPU"
        return device_type
    scene.cycles.device = "CPU"
    return "CPU"


scene.render.engine = "CYCLES"
COMPUTE = enable_gpu()
log(f"Cycles device: {COMPUTE}")
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = 0.02
scene.cycles.max_bounces = 6
scene.cycles.diffuse_bounces = 4
scene.cycles.glossy_bounces = 2
scene.cycles.caustics_reflective = False
scene.cycles.caustics_refractive = False


# ── Objects ─────────────────────────────────────────────────────────────────
def objects_with_prefix(prefix: str) -> list[bpy.types.Object]:
    return [o for o in scene.objects if o.type == "MESH" and o.name.startswith(prefix)]


def select_only(objs):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objs:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def triangle_count(obj) -> int:
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def remove_objects(objs) -> int:
    for obj in list(objs):
        bpy.data.objects.remove(obj, do_unlink=True)
    return len(objs)


shell = bpy.data.objects["ET_Shell_Rock"]
removed = {
    "locators": remove_objects([o for o in scene.objects if o.name.startswith("LOC_")]),
    "qaLights": remove_objects([o for o in scene.objects if o.type == "LIGHT"]),
}
log(f"removed graybox-only objects: {removed}")


def add_cube(name, centre, dims):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=centre)
    obj = bpy.context.active_object
    obj.name = name
    obj.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


# ── Shell: from boolean solid to rock ───────────────────────────────────────
# The voxel remesher discards enclosed cavities, so the remesh runs on the
# VOID - the block minus the shell - whose surface IS the rock surface, and
# the normals are flipped afterwards. The graybox's block is an L: a room box
# plus a wing down the corridor to the First Fire. Taking the void from one
# bounding box would put the L's notch inside the void and hand the runtime a
# slab of rock hanging in the corridor, so the void is built from the same two
# boxes the graybox carved, unioned.
RIM = 0.01


def void_box(name, box, z0, z1):
    return add_cube(
        name,
        ((box["minX"] + box["maxX"]) / 2, (box["minY"] + box["maxY"]) / 2, (z0 + z1) / 2),
        (
            box["maxX"] - box["minX"] - RIM * 2,
            box["maxY"] - box["minY"] - RIM * 2,
            z1 - z0 - RIM * 2,
        ),
    )


void = void_box("ET_Void_Block", BLOCK, BLOCK["minZ"], BLOCK["maxZ"])
wing = void_box("ET_Void_Wing", WING, BLOCK["minZ"], BLOCK["maxZ"])
select_only([void, wing])
bpy.ops.object.join()
void = bpy.context.view_layer.objects.active
# The two boxes overlap by a tenth of a metre, so the join is self-
# intersecting; EXACT with use_self resolves that in the same pass as the
# difference, and no separate union step is needed.
carve = void.modifiers.new("Void", "BOOLEAN")
carve.operation = "DIFFERENCE"
carve.solver = "EXACT"
carve.use_self = True
carve.use_hole_tolerant = True
carve.object = shell
bpy.ops.object.modifier_apply(modifier="Void")
log(f"void solid: {len(void.data.polygons)} faces")

union_bounds = {
    "minX": min(BLOCK["minX"], WING["minX"]),
    "maxX": max(BLOCK["maxX"], WING["maxX"]),
    "minY": min(BLOCK["minY"], WING["minY"]),
    "maxY": max(BLOCK["maxY"], WING["maxY"]),
    "minZ": BLOCK["minZ"],
    "maxZ": BLOCK["maxZ"],
}
# Local space IS world space from here: the split below reads local coords and
# the cube primitive left its origin mid-block.
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

remesh = void.modifiers.new("Remesh", "REMESH")
remesh.mode = "VOXEL"
remesh.voxel_size = 0.30
remesh.adaptivity = 0.0
remesh.use_smooth_shade = True
bpy.ops.object.modifier_apply(modifier="Remesh")
log(f"void remeshed: {len(void.data.polygons)} faces")

# The void's outside is the rock's inside.
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.flip_normals()
bpy.ops.object.mode_set(mode="OBJECT")

shell_collections = list(shell.users_collection)
bpy.data.objects.remove(shell, do_unlink=True)
void.name = "ET_Shell_Rock"
for collection in list(void.users_collection):
    collection.objects.unlink(void)
for collection in shell_collections:
    collection.objects.link(void)
shell = void

# Drop the caps where the void meets the outside: the two doorways and the far
# end of the corridor at the First Fire. Everything else the void touches is
# rock, and the sky disc closes the aven from inside.
SKIN_TOLERANCE = 0.45
bm = bmesh.new()
bm.from_mesh(shell.data)
bm.faces.ensure_lookup_table()
doomed = []
for face in bm.faces:
    c = face.calc_center_median()
    if (
        c.x < union_bounds["minX"] + SKIN_TOLERANCE
        or c.x > union_bounds["maxX"] - SKIN_TOLERANCE
        or c.y < union_bounds["minY"] + SKIN_TOLERANCE
        or c.y > union_bounds["maxY"] - SKIN_TOLERANCE
        or c.z < union_bounds["minZ"] + SKIN_TOLERANCE
        or c.z > union_bounds["maxZ"] - SKIN_TOLERANCE
    ):
        doomed.append(face)
bmesh.ops.delete(bm, geom=doomed, context="FACES")
bm.to_mesh(shell.data)
bm.free()
shell.data.update()
log(f"shell skin removed: {len(doomed)} caps, {len(shell.data.polygons)} faces left")

# Relief weight: full on walls and vaults, gentle on anything that faces up.
# A second group sinks every floor a hand's width under its datum, so the
# runtime pedestals and the rail feet sit ON the rock rather than in it, and
# the voxel's own +-0.15 m never lifts a floor above the collider.
FLOOR_SINK = 0.12
relief = shell.vertex_groups.new(name="Relief")
floor_group = shell.vertex_groups.new(name="Floor")
for vertex in shell.data.vertices:
    up = vertex.normal.z
    t = min(1.0, max(0.0, (up - 0.35) / 0.4))
    relief.add([vertex.index], 1.0 - t * 0.7, "REPLACE")
    f = min(1.0, max(0.0, (up - 0.5) / 0.35))
    floor_group.add([vertex.index], f * f * (3 - 2 * f), "REPLACE")

coarse_tex = bpy.data.textures.new("ET_Relief_Coarse", "CLOUDS")
coarse_tex.noise_scale = 2.4
coarse_tex.noise_depth = 2
coarse_tex.noise_basis = "IMPROVED_PERLIN"
mid_tex = bpy.data.textures.new("ET_Relief_Mid", "CLOUDS")
mid_tex.noise_scale = 1.1
mid_tex.noise_depth = 2
mid_tex.noise_basis = "BLENDER_ORIGINAL"
fine_tex = bpy.data.textures.new("ET_Relief_Fine", "CLOUDS")
fine_tex.noise_scale = 0.75
fine_tex.noise_depth = 3
fine_tex.noise_basis = "VORONOI_F1"

for name, tex, strength in (
    ("Relief", coarse_tex, 0.22),
    ("ReliefMid", mid_tex, 0.10),
    ("ReliefFine", fine_tex, 0.05),
):
    mod = shell.modifiers.new(name, "DISPLACE")
    mod.texture = tex
    mod.texture_coords = "GLOBAL"
    mod.direction = "NORMAL"
    mod.mid_level = 0.5
    mod.strength = strength
    mod.vertex_group = "Relief"
    bpy.ops.object.modifier_apply(modifier=name)

# The rootbed is ground, not a slab. Everything the visitor STANDS on has to
# stay flat - the collider reads its height from the plan, and a bump under a
# walked deck floats the feet - but nothing walks on the bed, so it gets metres
# of gentle mounding that the flat decks above cannot have.
bed_group = shell.vertex_groups.new(name="BedFloor")
for vertex in shell.data.vertices:
    inside = (
        BED["minX"] - 0.4 <= vertex.co.x <= BED["maxX"] + 0.4
        and BED["minY"] - 0.4 <= vertex.co.y <= BED["maxY"] + 0.4
        and vertex.co.z < BED_Y + 0.9
    )
    up = min(1.0, max(0.0, (vertex.normal.z - 0.5) / 0.35))
    bed_group.add([vertex.index], (up * up * (3 - 2 * up)) if inside else 0.0, "REPLACE")
bed_tex = bpy.data.textures.new("ET_Bed_Undulation", "CLOUDS")
bed_tex.noise_scale = 5.5
bed_tex.noise_depth = 2
bed_tex.noise_basis = "IMPROVED_PERLIN"
mound = shell.modifiers.new("BedMound", "DISPLACE")
mound.texture = bed_tex
mound.texture_coords = "GLOBAL"
mound.direction = "Z"
mound.mid_level = 0.5
mound.strength = 0.34
mound.vertex_group = "BedFloor"
bpy.ops.object.modifier_apply(modifier="BedMound")

sink = shell.modifiers.new("FloorSink", "DISPLACE")
sink.direction = "Z"
sink.mid_level = 0.0
sink.strength = -FLOOR_SINK
sink.vertex_group = "Floor"
bpy.ops.object.modifier_apply(modifier="FloorSink")

SHELL_TRI_BUDGET = 300_000
tris = triangle_count(shell)
if tris > SHELL_TRI_BUDGET:
    dec = shell.modifiers.new("Decimate", "DECIMATE")
    dec.decimate_type = "COLLAPSE"
    dec.ratio = SHELL_TRI_BUDGET / tris
    dec.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier="Decimate")
bpy.ops.object.shade_smooth()
log(f"shell final: {triangle_count(shell)} tris")


# ── One rock, two objects ───────────────────────────────────────────────────
# The pit and the route are lit by different things and the runtime dims them
# apart, so each carries its own lightmap. A face is pit rock if it is over
# the rootbed, in the daylight aven, or in the cleft beside the exit;
# everything else is the walked route and its corridor.
PIT_GROW = 0.6
pit_box = {
    "minX": BED["minX"] - PIT_GROW,
    "maxX": BED["maxX"] + PIT_GROW,
    "minY": BED["minY"] - PIT_GROW,
    "maxY": BED["maxY"] + PIT_GROW,
}
aven_centre = Vector((AVEN["centre"]["x"], AVEN["centre"]["y"]))
aven_reach = AVEN["radius"] + 1.2


def is_pit(centre: Vector) -> bool:
    if pit_box["minX"] <= centre.x <= pit_box["maxX"] and pit_box["minY"] <= centre.y <= pit_box["maxY"]:
        return True
    if (Vector((centre.x, centre.y)) - aven_centre).length <= aven_reach:
        return True
    return (
        CLEFT["minX"] - PIT_GROW <= centre.x <= CLEFT["maxX"] + PIT_GROW
        and CLEFT["minY"] - PIT_GROW <= centre.y <= CLEFT["maxY"] + PIT_GROW
    )


SPLIT_NAMES = ["route", "pit"]
shell.data.materials.clear()
for name in SPLIT_NAMES:
    shell.data.materials.append(bpy.data.materials.new(f"ET split {name}"))
bm = bmesh.new()
bm.from_mesh(shell.data)
for face in bm.faces:
    face.material_index = 1 if is_pit(face.calc_center_median()) else 0
bm.to_mesh(shell.data)
bm.free()
shell.data.update()
assigned = {name: 0 for name in SPLIT_NAMES}
for poly in shell.data.polygons:
    assigned[SPLIT_NAMES[poly.material_index]] += 1
log(f"rock faces: {assigned}")
if min(assigned.values()) == 0:
    raise RuntimeError(f"a rock half received no faces: {assigned}")
select_only([shell])
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.separate(type="MATERIAL")
bpy.ops.object.mode_set(mode="OBJECT")

rock_objects: dict[str, bpy.types.Object] = {}
for obj in [o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith("ET_Shell_Rock")]:
    if len(obj.data.polygons) == 0:
        raise RuntimeError(f"{obj.name} came out of the split with no faces")
    # Separate-by-material leaves each piece with only its own slot, so every
    # polygon reports index 0: identify the piece by the slot's name.
    slot = obj.material_slots[obj.data.polygons[0].material_index].material
    key = slot.name.removeprefix("ET split ")
    if key not in SPLIT_NAMES:
        raise RuntimeError(f"{obj.name} carries unexpected material {slot.name}")
    obj.name = f"ET_Rock_{key.capitalize()}"
    obj.data.name = obj.name
    obj.data.materials.clear()
    rock_objects[key] = obj
if set(rock_objects) != set(SPLIT_NAMES):
    raise RuntimeError(f"shell split produced {sorted(rock_objects)}, expected {SPLIT_NAMES}")
for name in SPLIT_NAMES:
    bpy.data.materials.remove(bpy.data.materials[f"ET split {name}"])
log("rock split: " + ", ".join(f"{k} {triangle_count(o)} tris" for k, o in rock_objects.items()))


# ── Trim: brass, cut stone, roots, moss ─────────────────────────────────────
# Each family joins into one object with one small lightmap, so the rail
# actually catches its own lanterns instead of reading as a flat tube.
def join_family(name, objs):
    if not objs:
        raise RuntimeError(f"{name}: nothing to join")
    for obj in objs:
        if obj.data.users > 1:
            obj.data = obj.data.copy()
    select_only(objs)
    if len(objs) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    obj.data.name = name
    obj.data.materials.clear()
    return obj


def console_parts(*suffixes) -> list[bpy.types.Object]:
    """The console bodies, by part. Named rather than prefixed, because the
    lit face is NOT brass: it keeps the graybox lamp material so the runtime
    can tune it by name, and it is exported beside the lantern heads."""
    wanted = {f"_{s}" for s in suffixes}
    found = [
        obj
        for obj in objects_with_prefix("ET_Console_")
        if any(obj.name.endswith(s) for s in wanted)
    ]
    if len(found) != len(CONSOLES) * len(wanted):
        raise RuntimeError(
            f"expected {len(CONSOLES) * len(wanted)} console parts for "
            f"{sorted(wanted)}, found {sorted(o.name for o in found)}"
        )
    return found


trim_objects = {
    "brass": join_family(
        "ET_Brass",
        [
            *objects_with_prefix("ET_RailPost_"),
            *objects_with_prefix("ET_LampStem_"),
            *objects_with_prefix("ET_Rail"),
            *console_parts("Panel", "Cap", "LegW", "LegE"),
        ],
    ),
    "stone": join_family(
        "ET_CutStone",
        [
            *objects_with_prefix("ET_Letter_"),
            *objects_with_prefix("ET_Stamp_"),
            *objects_with_prefix("ET_ConsoleLetter_"),
        ],
    ),
    "root": join_family("ET_Roots", objects_with_prefix("ET_Root_")),
    "moss": join_family("ET_Moss", objects_with_prefix("ET_Growth_Moss_")),
}
# Flat-topped cylinders read as plastic pucks no matter how they are shaded.
# A short-period displace on the moss alone gives each disc its own uneven
# crown; the discs are 0.3-0.6 m across, so the noise has to be much finer
# than the metres-wide drift the rock uses.
_moss = trim_objects.get("moss")
if _moss is not None:
    select_only([_moss])
    bpy.context.view_layer.objects.active = _moss
    bpy.ops.object.modifier_add(type="SUBSURF")
    _moss.modifiers["Subdivision"].subdivision_type = "SIMPLE"
    _moss.modifiers["Subdivision"].levels = 2
    _moss.modifiers["Subdivision"].render_levels = 2
    bpy.ops.object.modifier_apply(modifier="Subdivision")
    _moss_tex = bpy.data.textures.new("ET_Moss_Crown", "CLOUDS")
    _moss_tex.noise_scale = 0.35
    _moss_tex.noise_depth = 2
    _moss_tex.noise_basis = "IMPROVED_PERLIN"
    _crown = _moss.modifiers.new("MossCrown", "DISPLACE")
    _crown.texture = _moss_tex
    _crown.texture_coords = "GLOBAL"
    _crown.direction = "Z"
    _crown.mid_level = 0.35
    _crown.strength = 0.055
    bpy.ops.object.modifier_apply(modifier="MossCrown")
    bpy.ops.object.shade_smooth()
    log(f"moss crowned: {len(_moss.data.polygons)} faces")

lamp_heads = objects_with_prefix("ET_Lamp_")
console_faces = console_parts("Face")
sky_disc = bpy.data.objects["ET_Sky"]
log("trim: " + ", ".join(f"{k} {triangle_count(o)} tris" for k, o in trim_objects.items()))


# ── UVs ─────────────────────────────────────────────────────────────────────
def unwrap(obj, margin=0.002) -> float:
    """Smart-project one UV layer and return metres per UV unit."""
    select_only([obj])
    while obj.data.uv_layers:
        obj.data.uv_layers.remove(obj.data.uv_layers[0])
    obj.data.uv_layers.new(name="UVMap")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(
        angle_limit=math.radians(66),
        island_margin=margin,
        area_weight=0.0,
        correct_aspect=True,
        scale_to_bounds=False,
    )
    bpy.ops.object.mode_set(mode="OBJECT")
    mesh = obj.data
    uv = mesh.uv_layers.active.data
    world_area = 0.0
    uv_area = 0.0
    for poly in mesh.polygons:
        world_area += poly.area
        loops = [uv[i].uv for i in poly.loop_indices]
        acc = 0.0
        for i in range(len(loops)):
            a, b = loops[i], loops[(i + 1) % len(loops)]
            acc += a.x * b.y - b.x * a.y
        uv_area += abs(acc) / 2
    if uv_area <= 1e-9:
        raise RuntimeError(f"{obj.name}: unwrap produced no UV area")
    return math.sqrt(world_area / uv_area)


m_per_uv: dict[str, float] = {}
for key, obj in rock_objects.items():
    m_per_uv[f"rock-{key}"] = unwrap(obj, margin=0.0015)
for key, obj in trim_objects.items():
    m_per_uv[f"trim-{key}"] = unwrap(obj, margin=0.004)
log("UV density " + ", ".join(f"{k} {v:.2f} m/uv" for k, v in m_per_uv.items()))


# ── Materials ───────────────────────────────────────────────────────────────
def new_material(name: str):
    # Blender appends ".001" on a name collision and the runtime looks its
    # materials up by exact name, so the authoring material moves aside first.
    existing = bpy.data.materials.get(name)
    if existing is not None:
        existing.name = f"{name} (authoring)"
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    tree = mat.node_tree
    bsdf = tree.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.9
    bsdf.inputs["Metallic"].default_value = 0.0
    return mat, tree, bsdf


def box_texture(tree, set_key, map_key, scale):
    node = tree.nodes.new("ShaderNodeTexImage")
    node.image = load_image(set_key, map_key)
    node.projection = "BOX"
    node.projection_blend = 0.3
    node.interpolation = "Linear"
    coords = tree.nodes.new("ShaderNodeTexCoord")
    mapping = tree.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (scale, scale, scale)
    tree.links.new(coords.outputs["Object"], mapping.inputs["Vector"])
    tree.links.new(mapping.outputs["Vector"], node.inputs["Vector"])
    return node


def rgb_mix(tree, blend_type="MIX"):
    node = tree.nodes.new("ShaderNodeMix")
    node.data_type = "RGBA"
    node.blend_type = blend_type
    return node


def height_factor(tree, low, high):
    """0 below `low`, 1 above `high`, on world z."""
    geometry = tree.nodes.new("ShaderNodeNewGeometry")
    sep = tree.nodes.new("ShaderNodeSeparateXYZ")
    tree.links.new(geometry.outputs["Position"], sep.inputs["Vector"])
    ramp = tree.nodes.new("ShaderNodeMapRange")
    ramp.inputs["From Min"].default_value = low
    ramp.inputs["From Max"].default_value = high
    tree.links.new(sep.outputs["Z"], ramp.inputs["Value"])
    return ramp.outputs["Result"]


def breakup(tree, scale=0.075, low=0.72, high=1.2):
    """A metres-wide tonal drift to multiply over a tiled colour. Box
    projection repeats the SAME crack every period; this makes each repeat a
    different shade, which is what stops the eye counting them."""
    coords = tree.nodes.new("ShaderNodeTexCoord")
    mapping = tree.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (scale, scale, scale)
    tree.links.new(coords.outputs["Object"], mapping.inputs["Vector"])
    noise = tree.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Detail"].default_value = 2.0
    noise.inputs["Roughness"].default_value = 0.5
    tree.links.new(mapping.outputs["Vector"], noise.inputs["Vector"])
    ramp = tree.nodes.new("ShaderNodeMapRange")
    ramp.inputs["From Min"].default_value = 0.34
    ramp.inputs["From Max"].default_value = 0.66
    ramp.inputs["To Min"].default_value = low
    ramp.inputs["To Max"].default_value = high
    ramp.clamp = True
    tree.links.new(noise.outputs["Fac"], ramp.inputs["Value"])
    return ramp.outputs["Result"]


def rock_bake_material(name, lightmap_image, tint=(1, 1, 1)):
    """Box-projected PBR for the bake. Two axes decide the surface: the face's
    own normal picks wall or floor, and world height picks which wall and
    which floor. Moss and loam low, cliff and trail high - the room's subject
    is a living floor under a dry ledge, and no coloured light is doing it."""
    mat, tree, bsdf = new_material(name)
    links = tree.links
    drift = breakup(tree)

    def pbr(set_key):
        scale = 1.0 / TEXTURE_PERIOD_M[set_key]
        diff = box_texture(tree, set_key, "diff", scale)
        nor = box_texture(tree, set_key, "nor_gl", scale)
        rough = box_texture(tree, set_key, "rough", scale)
        ao = box_texture(tree, set_key, "ao", scale)
        colour = rgb_mix(tree, "MULTIPLY")
        colour.inputs["Factor"].default_value = 0.8
        links.new(diff.outputs["Color"], colour.inputs[6])
        links.new(ao.outputs["Color"], colour.inputs[7])
        shade = rgb_mix(tree, "MULTIPLY")
        shade.inputs["Factor"].default_value = 1.0
        links.new(colour.outputs[2], shade.inputs[6])
        shade.inputs[7].default_value = (*tint, 1.0)
        varied = rgb_mix(tree, "MULTIPLY")
        varied.inputs["Factor"].default_value = 1.0
        links.new(shade.outputs[2], varied.inputs[6])
        links.new(drift, varied.inputs[7])
        return varied.outputs[2], nor.outputs["Color"], rough.outputs["Color"]

    def blend(a, b, factor):
        node = rgb_mix(tree)
        links.new(factor, node.inputs["Factor"])
        links.new(a, node.inputs[6])
        links.new(b, node.inputs[7])
        return node.outputs[2]

    wall_f = height_factor(tree, *WALL_BLEND)
    floor_f = height_factor(tree, *FLOOR_BLEND)
    moss = pbr("moss")
    cliff = pbr("cliff")
    loam = pbr("loam")
    trail = pbr("trail")
    wall = [blend(moss[i], cliff[i], wall_f) for i in range(3)]
    floor = [blend(loam[i], trail[i], floor_f) for i in range(3)]

    geometry = tree.nodes.new("ShaderNodeNewGeometry")
    sep = tree.nodes.new("ShaderNodeSeparateXYZ")
    links.new(geometry.outputs["Normal"], sep.inputs["Vector"])
    up = tree.nodes.new("ShaderNodeMapRange")
    up.inputs["From Min"].default_value = 0.45
    up.inputs["From Max"].default_value = 0.8
    links.new(sep.outputs["Z"], up.inputs["Value"])

    def mix_by_up(a, b):
        node = rgb_mix(tree)
        links.new(up.outputs["Result"], node.inputs["Factor"])
        links.new(a, node.inputs[6])
        links.new(b, node.inputs[7])
        return node.outputs[2]

    links.new(mix_by_up(wall[0], floor[0]), bsdf.inputs["Base Color"])
    links.new(mix_by_up(wall[2], floor[2]), bsdf.inputs["Roughness"])
    normal_map = tree.nodes.new("ShaderNodeNormalMap")
    normal_map.space = "OBJECT"
    normal_map.inputs["Strength"].default_value = 0.8
    links.new(mix_by_up(wall[1], floor[1]), normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])

    target = tree.nodes.new("ShaderNodeTexImage")
    target.image = lightmap_image
    target.select = True
    tree.nodes.active = target
    return mat


def plain_bake_material(name, colour, roughness, lightmap_image):
    """Brass, cut stone, root and moss: a colour and a roughness, plus the
    lightmap as the bake target. Metallic stays 0 - the museum has no
    environment map, and a metal without one is a flat unlit cutout."""
    mat, tree, bsdf = new_material(name)
    shade = rgb_mix(tree, "MULTIPLY")
    shade.inputs["Factor"].default_value = 1.0
    shade.inputs[6].default_value = (*colour, 1.0)
    tree.links.new(breakup(tree, scale=0.22, low=0.62, high=1.3), shade.inputs[7])
    tree.links.new(shade.outputs[2], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = roughness
    target = tree.nodes.new("ShaderNodeTexImage")
    target.image = lightmap_image
    target.select = True
    tree.nodes.active = target
    return mat


def rock_export_material(name, set_key, lightmap_image, m_per_uv_value, albedo):
    """What the GLB carries: one tiled set on UVMap with a KHR_texture_transform
    repeat, and the lightmap on Emission at unity. The height blend cannot
    survive into glTF, so each half exports the set that dominates it: cliff
    for the route above, mossy rock for the pit below."""
    mat, tree, bsdf = new_material(name)
    links = tree.links
    repeat = m_per_uv_value / TEXTURE_PERIOD_M[set_key]
    uv = tree.nodes.new("ShaderNodeUVMap")
    uv.uv_map = "UVMap"
    mapping = tree.nodes.new("ShaderNodeMapping")
    mapping.vector_type = "POINT"
    mapping.inputs["Scale"].default_value = (repeat, repeat, 1.0)
    links.new(uv.outputs["UV"], mapping.inputs["Vector"])

    def tiled(map_key):
        node = tree.nodes.new("ShaderNodeTexImage")
        node.image = load_image(set_key, map_key)
        links.new(mapping.outputs["Vector"], node.inputs["Vector"])
        return node

    diff = tiled("diff")
    darken = rgb_mix(tree, "MULTIPLY")
    darken.inputs["Factor"].default_value = 1.0
    links.new(diff.outputs["Color"], darken.inputs[6])
    darken.inputs[7].default_value = (*albedo, 1.0)
    links.new(darken.outputs[2], bsdf.inputs["Base Color"])
    rough = tiled("rough")
    links.new(rough.outputs["Color"], bsdf.inputs["Roughness"])
    nor = tiled("nor_gl")
    normal_map = tree.nodes.new("ShaderNodeNormalMap")
    normal_map.uv_map = "UVMap"
    normal_map.inputs["Strength"].default_value = 0.9
    links.new(nor.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    attach_lightmap(tree, bsdf, lightmap_image)
    return mat


def attach_lightmap(tree, bsdf, lightmap_image):
    lm = tree.nodes.new("ShaderNodeTexImage")
    lm.image = lightmap_image
    lm_uv = tree.nodes.new("ShaderNodeUVMap")
    lm_uv.uv_map = "UVMap"
    tree.links.new(lm_uv.outputs["UV"], lm.inputs["Vector"])
    tree.links.new(lm.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 1.0


def plain_export_material(name, colour, roughness, lightmap_image):
    mat, tree, bsdf = new_material(name)
    bsdf.inputs["Base Color"].default_value = (*colour, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    attach_lightmap(tree, bsdf, lightmap_image)
    return mat


def new_lightmap(name, size):
    image = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
    image.colorspace_settings.name = "sRGB"
    image.generated_color = (0, 0, 0, 1)
    return image


# Brass reads as brass through colour and roughness alone; roots and moss are
# organic, and the cut letters are a paler stone than the wall they sit on.
TRIM_SURFACE = {
    "brass": ((0.52, 0.36, 0.15), 0.34),
    "stone": ((0.66, 0.60, 0.50), 0.72),
    "root": ((0.17, 0.11, 0.07), 0.88),
    "moss": ((0.085, 0.165, 0.06), 0.95),
}

lightmaps: dict[str, bpy.types.Image] = {}
bake_targets: list[tuple[str, bpy.types.Object, bpy.types.Image]] = []
# The pit is a shade darker and a shade cooler than the ledge above it: it is
# under five metres of rock and lit by sky, not by brass.
# The pit is darker and cooler than the ledge above it: it is under five
# metres of rock and lit by sky. The route is warmer, because what lights it
# is brass and the fire in the room behind.
ROCK_TINT = {"route": (1.0, 0.90, 0.76), "pit": (0.62, 0.70, 0.66)}
for key, obj in rock_objects.items():
    image = new_lightmap(f"ET_Rock_{key}_Lightmap", ROCK_LIGHTMAP_PX)
    lightmaps[f"rock-{key}"] = image
    mat = rock_bake_material(f"ET Rock {key.capitalize()} (bake)", image, tint=ROCK_TINT[key])
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    bake_targets.append((f"rock-{key}", obj, image))
for key, obj in trim_objects.items():
    image = new_lightmap(f"ET_{key.capitalize()}_Lightmap", TRIM_LIGHTMAP_PX)
    lightmaps[f"trim-{key}"] = image
    colour, roughness = TRIM_SURFACE[key]
    mat = plain_bake_material(f"ET {key.capitalize()} (bake)", colour, roughness, image)
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    bake_targets.append((f"trim-{key}", obj, image))


# ── Bake lighting ───────────────────────────────────────────────────────────
# Three sources, and the room's whole story is in which is which: daylight
# down the aven onto the rootbed, brass lanterns along the walked route, and
# the First Fire still burning behind the west door. Cold ahead, warm behind.
world = scene.world
world.use_nodes = True
background = world.node_tree.nodes.get("Background")
background.inputs["Color"].default_value = (0.030, 0.038, 0.050, 1.0)
background.inputs["Strength"].default_value = 0.45

# Every one of the four rock sets is a warm brown or an olive - PolyHaven
# rock is quarried in daylight - so the only thing that can put a cool cast
# in the pit is the light itself. Sky down the shaft is properly blue.
DAYLIGHT = (0.62, 0.78, 1.0)
LANTERN = (1.0, 0.70, 0.36)
FIRELIGHT = (1.0, 0.46, 0.16)
bake_lights: list[bpy.types.Object] = []


def bake_light(name, location, colour, energy, radius, kind="POINT", spot_size=None, target=None):
    data = bpy.data.lights.new(name, kind)
    data.color = colour
    data.energy = energy
    data.shadow_soft_size = radius
    data.use_shadow = True
    if kind == "SPOT" and spot_size:
        data.spot_size = spot_size
        data.spot_blend = 0.35
    if kind == "AREA":
        data.shape = "DISK"
        data.size = radius * 2
    obj = bpy.data.objects.new(name, data)
    obj.location = location
    if target is not None:
        obj.rotation_euler = (Vector(target) - Vector(location)).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(obj)
    bake_lights.append(obj)
    return obj


def build_bake_lights():
    # The aven is a SHAFT, and the shaft is the point: nineteen metres of rock
    # with a hole in it collimates daylight, so what lands on the rootbed is a
    # pool around the middle case and not an even fill. The first pass used a
    # wide area light and the bed came out lit like an office - no shaft, no
    # falloff, and nothing for the three cases to be picked out of.
    cx, cy = AVEN["centre"]["x"], AVEN["centre"]["y"]
    throw = AVEN["top"] - 0.8 - BED_Y
    bake_light(
        "BAKE_Aven", (cx, cy, AVEN["top"] - 0.8), DAYLIGHT, 30000.0, 1.2,
        kind="SPOT", spot_size=2 * math.atan((AVEN["radius"] + 1.1) / throw),
        target=(cx, cy, BED_Y),
    )
    # A wide, weak disc at the throat, so the pit still reads outside the pool
    # and the shaft walls carry light down instead of going black.
    bake_light(
        "BAKE_AvenThroat", (cx, cy, AVEN["base"] + 1.4), DAYLIGHT, 650.0,
        AVEN["radius"] * 0.8, kind="AREA", target=(cx, cy, BED_Y),
    )
    for lamp in lamp_heads:
        bake_light(f"BAKE_{lamp.name}", tuple(lamp.location), LANTERN, 260.0, 0.16)
    # The First Fire, one room west. Its torches are real and its corridor is
    # carved into this same shell, so the light that arrives at the threshold
    # is warm and comes through the door - which is the handover the plan
    # asks for: fire behind, growth and daylight ahead.
    door = CONTRACT["doors"]["west"]["centre"]
    bake_light("BAKE_FireDoor", (door["x"] - 2.4, door["y"], 1.5), FIRELIGHT, 330.0, 0.9)
    bake_light("BAKE_FireSpill", (door["x"] + 1.6, door["y"], 1.7), FIRELIGHT, 110.0, 0.9)
    # The vestibule is where the wing stamp is cut and where the opener stands,
    # and it has no fixture of its own. A wide soft disc under its crown, warm
    # because everything behind the visitor is still fire, so the arrival reads
    # without pretending there is a lamp on the wall.
    vest = next(f["box"] for f in CONTRACT["floors"] if f["id"] == "vestibule")
    vx = (vest["minX"] + vest["maxX"]) / 2
    vy = (vest["minY"] + vest["maxY"]) / 2
    bake_light(
        "BAKE_Vestibule", (vx, vy, DATUMS["vestibuleCrown"] - 0.6),
        (0.94, 0.93, 0.92), 420.0, 3.4, kind="AREA",
        target=(vx, vy, DATUMS["door"]),
    )
    # And the same at the far end: the exit descent runs eleven metres below the
    # last lantern to a door the visitor cannot see. Cooler, because what is
    # through it is wind.
    exit_door = CONTRACT["doors"]["south"]["centre"]
    bake_light(
        "BAKE_ExitApproach",
        (exit_door["x"], exit_door["y"] + 4.5, DATUMS["door"] + 4.2),
        (0.78, 0.84, 0.95), 300.0, 3.0, kind="AREA",
        target=(exit_door["x"], exit_door["y"] + 1.0, DATUMS["door"]),
    )
    # And one more standing IN the bore, facing back up the ramp. The first
    # pass lit the ramp floor and left the doorway itself a black recess, which
    # reads as a dead end rather than a way out; the room's whole last movement
    # is walking toward a door the visitor cannot yet see through.
    bake_light(
        "BAKE_ExitDoor",
        (exit_door["x"], exit_door["y"] + 0.4, DATUMS["door"] + 1.7),
        (0.74, 0.82, 0.96), 260.0, 1.3, kind="AREA",
        target=(exit_door["x"], exit_door["y"] + 4.0, DATUMS["door"] + 0.6),
    )


build_bake_lights()
log(f"bake lights: {len(bake_lights)}")


def set_emission(mat_name: str, strength: float) -> None:
    mat = bpy.data.materials.get(mat_name)
    node = mat.node_tree.nodes.get("Principled BSDF") if mat and mat.node_tree else None
    if node:
        node.inputs["Emission Strength"].default_value = strength


# The sky disc is the only emissive surface in the room, and the lantern heads
# are the only ones the runtime tunes. Nothing else glows: moss that glows is
# a fantasy, and this room's green has to come from being alive, not lit.
BAKE_EMISSION = {"ET Sky": 42.0, "ET Lamp": 24.0}
for mat_name, strength in BAKE_EMISSION.items():
    set_emission(mat_name, strength)


def bake(obj, image, samples):
    select_only([obj])
    scene.cycles.samples = samples
    settings = scene.render.bake
    settings.target = "IMAGE_TEXTURES"
    settings.use_pass_direct = True
    settings.use_pass_indirect = True
    settings.use_pass_color = True
    settings.use_pass_emit = True
    settings.use_pass_diffuse = True
    settings.use_pass_glossy = False
    settings.use_pass_transmission = False
    settings.margin = 6 if image.size[0] <= 1024 else 12
    settings.margin_type = "ADJACENT_FACES"
    settings.use_clear = True
    log(f"baking {obj.name} -> {image.name} {image.size[0]}px @ {samples} spp")
    bpy.ops.object.bake(type="COMBINED")
    path = QA_DIR / f"{image.name}.png"
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    return path


def denoise(image, path: Path) -> bpy.types.Image:
    """OIDN through the compositor, since Cycles does not denoise bakes."""
    if FAST:
        return image
    tmp = bpy.data.scenes.new("ET_Denoise")
    tree = bpy.data.node_groups.new("ET_Denoise_Tree", "CompositorNodeTree")
    tree.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    tmp.compositing_node_group = tree
    if hasattr(tmp, "use_nodes"):
        tmp.use_nodes = True
    src = tree.nodes.new("CompositorNodeImage")
    src.image = image
    dn = tree.nodes.new("CompositorNodeDenoise")
    if "HDR" in dn.inputs:
        dn.inputs["HDR"].default_value = False
    out = tree.nodes.new("NodeGroupOutput")
    tree.links.new(src.outputs["Image"], dn.inputs["Image"])
    tree.links.new(dn.outputs["Image"], out.inputs[0])
    tmp.render.resolution_x = image.size[0]
    tmp.render.resolution_y = image.size[1]
    tmp.render.resolution_percentage = 100
    tmp.render.image_settings.file_format = "PNG"
    tmp.render.image_settings.color_mode = "RGB"
    tmp.view_settings.view_transform = "Standard"
    tmp.render.engine = "BLENDER_EEVEE"
    tmp.render.filepath = str(path)
    try:
        bpy.ops.render.render(write_still=True, scene=tmp.name)
    except Exception as exc:  # noqa: BLE001
        log(f"denoise failed, keeping the raw bake: {exc}")
        bpy.data.scenes.remove(tmp)
        bpy.data.node_groups.remove(tree)
        return image
    bpy.data.scenes.remove(tmp)
    bpy.data.node_groups.remove(tree)
    clean = bpy.data.images.load(str(path), check_existing=False)
    clean.name = image.name + "_dn"
    clean.colorspace_settings.name = "sRGB"
    log(f"denoised {image.name}")
    return clean


final_lightmaps: dict[str, bpy.types.Image] = {}
for key, obj, image in bake_targets:
    samples = BAKE_SAMPLES if key.startswith("rock") else max(32, BAKE_SAMPLES // 2)
    bake(obj, image, samples)
    final_lightmaps[key] = denoise(image, QA_DIR / f"{image.name}_dn.png")
for image in final_lightmaps.values():
    image.pack()

# ── Swap to export materials ────────────────────────────────────────────────
ROCK_EXPORT_SET = {"route": "cliff", "pit": "moss"}
for key, obj in rock_objects.items():
    mat = rock_export_material(
        f"ET Rock {key.capitalize()}", ROCK_EXPORT_SET[key], final_lightmaps[f"rock-{key}"],
        m_per_uv[f"rock-{key}"], albedo=(0.52, 0.50, 0.46) if key == "route" else (0.46, 0.50, 0.42),
    )
    obj.data.materials.clear()
    obj.data.materials.append(mat)
for key, obj in trim_objects.items():
    colour, roughness = TRIM_SURFACE[key]
    mat = plain_export_material(
        f"ET {key.capitalize()}", colour, roughness, final_lightmaps[f"trim-{key}"]
    )
    obj.data.materials.clear()
    obj.data.materials.append(mat)

# Export strengths: the runtime tunes every lightmap-less emissive by name
# (EarthRootTerraceAuthored.svelte), so they ship at unity.
for mat_name in BAKE_EMISSION:
    set_emission(mat_name, 1.0)
for obj in bake_lights:
    bpy.data.objects.remove(obj, do_unlink=True)
bake_lights.clear()

# ── QA views ────────────────────────────────────────────────────────────────
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGB"
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.view_settings.exposure = 0.0
scene.cycles.samples = VIEW_SAMPLES
scene.cycles.use_denoising = True
try:
    scene.cycles.denoiser = "OPTIX" if COMPUTE == "OPTIX" else "OPENIMAGEDENOISE"
except TypeError:
    pass

render_paths: dict[str, str] = {}
VIEWS = ["overlook", "console-stance"] if FAST else [
    "threshold", "ramp-climb", "overlook", "catwalk-run", "console",
    "console-stance", "ensemble", "exit", "overview", "plan",
]
CUTAWAY_VIEWS = {"overview", "plan"}
if RENDER:
    # The QA views are lit by the same sources the bake saw, so the frames
    # show the room as the lightmaps carry it.
    build_bake_lights()
    for mat_name, strength in BAKE_EMISSION.items():
        set_emission(mat_name, strength)
    for view_id in VIEWS:
        spec = next((c for c in CONTRACT["cameras"] if c["id"] == view_id), None)
        camera = bpy.data.objects.get(spec["name"] if spec else f"CAM_{view_id}")
        if camera is None:
            log(f"no camera for view {view_id}")
            continue
        for obj in rock_objects.values():
            obj.hide_render = view_id in CUTAWAY_VIEWS
        scene.camera = camera
        path = QA_DIR / f"earth-root-terrace-{view_id}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        render_paths[view_id] = str(path.relative_to(ROOT)).replace("\\", "/")
        log(f"rendered {view_id}")
    for obj in rock_objects.values():
        obj.hide_render = False
    for mat_name in BAKE_EMISSION:
        set_emission(mat_name, 1.0)
    for obj in bake_lights:
        bpy.data.objects.remove(obj, do_unlink=True)
    bake_lights.clear()

# ── Export ──────────────────────────────────────────────────────────────────
export_objects = [
    *rock_objects.values(), *trim_objects.values(),
    *lamp_heads, *console_faces, sky_disc,
]
if any(o.type != "MESH" for o in export_objects):
    raise RuntimeError("a non-mesh leaked into the ET_ export set")
# Anything the graybox authored under ET_ and no family claimed would be
# dropped here in silence - which is exactly how the first regrade pass
# would have shipped a room with no consoles on its rail.
orphans = sorted(
    o.name
    for o in scene.objects
    if o.type == "MESH" and o.name.startswith("ET_") and o not in export_objects
)
if orphans:
    raise RuntimeError(f"graybox meshes claimed by no export family: {orphans}")
exported_materials = {o.data.materials[0].name for o in export_objects if o.data.materials}
if len(exported_materials) != len(export_objects):
    log(f"exported materials ({len(exported_materials)}): {sorted(exported_materials)}")
for obj in export_objects:
    if not obj.data.materials:
        raise RuntimeError(f"{obj.name} would export with no material")
for mat in bpy.data.materials:
    if mat.name not in exported_materials or not mat.node_tree:
        continue
    node = mat.node_tree.nodes.get("Principled BSDF")
    if node and node.inputs["Metallic"].default_value > 0:
        raise RuntimeError(f"{mat.name} is metallic; the museum has no environment map")

bpy.ops.wm.save_as_mainfile(filepath=str(PROD_BLEND))

select_only(export_objects)
bpy.ops.export_scene.gltf(
    filepath=str(RAW_GLB_PATH),
    export_format="GLB",
    use_selection=True,
    export_cameras=False,
    export_lights=False,
    export_extras=True,
    export_apply=True,
    export_texcoords=True,
    export_normals=True,
    export_materials="EXPORT",
    export_image_format="AUTO",
)
raw_size = RAW_GLB_PATH.stat().st_size
log(f"raw GLB {raw_size / 1e6:.1f} MB -> {RAW_GLB_PATH}")

final_size = None
if OPTIMIZE:
    cli = ROOT / "node_modules" / "@gltf-transform" / "cli" / "bin" / "cli.js"
    command = [
        "node", str(cli), "optimize", str(RAW_GLB_PATH), str(FINAL_GLB_PATH),
        "--texture-compress", "webp", "--texture-size", str(ROCK_LIGHTMAP_PX),
        "--compress", "draco", "--simplify", "false",
        # The runtime tunes the untextured emissives BY NAME and reads the
        # lantern heads as separate nodes: palette would fold those materials
        # into one atlas material, and instance/join would collapse the heads.
        "--palette", "false", "--instance", "false", "--join", "false",
    ]
    log("optimising: " + " ".join(command))
    result = subprocess.run(command, capture_output=True, text=True, cwd=str(ROOT))
    if result.returncode != 0:
        log(result.stdout[-2000:])
        log(result.stderr[-2000:])
        raise RuntimeError("gltf-transform optimize failed")
    final_size = FINAL_GLB_PATH.stat().st_size
    log(f"final GLB {final_size / 1e6:.1f} MB -> {FINAL_GLB_PATH}")

report = {
    "sourceDigest": SOURCE_DIGEST,
    "blenderVersion": bpy.app.version_string,
    "computeDevice": COMPUTE,
    "fast": FAST,
    "removedGrayboxObjects": removed,
    "rockFaces": assigned,
    "rockTriangles": {k: triangle_count(o) for k, o in rock_objects.items()},
    "trimTriangles": {k: triangle_count(o) for k, o in trim_objects.items()},
    "lightmaps": {key: image.size[0] for key, _obj, image in bake_targets},
    "bakeSamples": BAKE_SAMPLES,
    "textureSets": TEXTURE_SETS,
    "wallBlend": list(WALL_BLEND),
    "floorBlend": list(FLOOR_BLEND),
    "uvMetresPerUnit": m_per_uv,
    "emissiveMaterials": sorted(BAKE_EMISSION),
    "exportObjectCount": len(export_objects),
    "consoleFaces": sorted(o.name for o in console_faces),
    "exportMaterials": sorted(exported_materials),
    "rawGlbBytes": raw_size,
    "finalGlbBytes": final_size,
    "finalGlbPath": str(FINAL_GLB_PATH.relative_to(ROOT)).replace("\\", "/"),
    "renders": render_paths,
}
REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
log(f"report -> {REPORT_PATH}")
