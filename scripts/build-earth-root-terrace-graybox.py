"""Build the Earth Root Terrace graybox in Blender: one carved shell.

The measured layout authority is buildEarthRootTerraceLayout (TypeScript);
scripts/export-earth-root-terrace-blender-plan.ts serialises the compiled room
to a hash-stamped JSON contract. This script verifies that digest, carves every
space the visitor occupies out of one block of rock, stands the brass rail, the
letters and the root growth in it, lights it for review, renders the QA views,
saves an editable .blend and exports the raw ET_ geometry.

Run from the repository root:

  pnpm exec tsx scripts/export-earth-root-terrace-blender-plan.ts
  "C:/Program Files/Blender Foundation/Blender 5.0/blender.exe" ^
    --background --factory-startup ^
    --python scripts/build-earth-root-terrace-graybox.py

Outputs:
  blender/earth-root-terrace-graybox.blend
  blender/exports/earth-root-terrace-graybox.raw.glb
  blender/qa/earth-root-terrace-graybox/*.png
  docs/superpowers/specs/earth-root-terrace/earth-root-terrace-graybox-report.json

The room in one paragraph (Blender frame: x east, y north, z up, metres, the
origin at the compiled room's plan centre): a mossy vestibule inside the west
door; a ramp climbing east along the north wall to an overlook spur 1.8 m up,
which shows the whole rootbed at once and then sends the visitor back; the
working route leaves the vestibule's south-east corner instead and falls a
metre to a catwalk that crosses the rootbed as a causeway 1.4 m above it, with
three control consoles set into its south rail, one opposite each case; the
rootbed itself is sunk 2.4 m under a dome and an aven, where G, H and I stand
in one row facing the catwalk; past the catwalk's east end the east channel
drops to a landing on the row's axis, then on down past a cleft to Air's door.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import random
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SPEC_DIR = ROOT / "docs" / "superpowers" / "specs" / "earth-root-terrace"
MANIFEST_PATH = SPEC_DIR / "earth-root-terrace-blender-plan.json"
FIRE_MANIFEST_PATH = (
    ROOT / "docs" / "superpowers" / "specs" / "first-fire-cinder-court"
    / "first-fire-cinder-court-blender-plan.json"
)
BLEND_PATH = ROOT / "blender" / "earth-root-terrace-graybox.blend"
RAW_GLB_PATH = ROOT / "blender" / "exports" / "earth-root-terrace-graybox.raw.glb"
QA_DIR = ROOT / "blender" / "qa" / "earth-root-terrace-graybox"
REPORT_PATH = SPEC_DIR / "earth-root-terrace-graybox-report.json"
RNG = random.Random(0xEA47)

_shell_spec = importlib.util.spec_from_file_location(
    "cave_shell", ROOT / "scripts" / "blender" / "cave_shell.py"
)
cave_shell = importlib.util.module_from_spec(_shell_spec)
_shell_spec.loader.exec_module(cave_shell)


def load_contract() -> tuple[dict, str]:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    contract = manifest["contract"]
    canonical = json.dumps(
        contract, ensure_ascii=False, separators=(",", ":"), sort_keys=True
    )
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    if digest != manifest["sourceDigest"]:
        raise RuntimeError(
            "Earth Root Terrace Blender manifest digest mismatch. "
            "Regenerate it from the TypeScript layout before building."
        )
    return contract, digest


CONTRACT, SOURCE_DIGEST = load_contract()
if CONTRACT["coordinateSystem"]["gltfRuntime"]["integrationStatus"] != "compiled-cave-earth-room":
    raise RuntimeError("The shell must be built from the compiled cave-earth contract")

# The carve below is written against the regraded floors. Name them, so a
# future layout change fails here instead of partway through on a KeyError.
REQUIRED_FLOORS = {
    "vestibule", "entry-ramp", "overlook", "gallery-descent", "gallery",
    "alcove-g", "alcove-h", "alcove-i", "east-link", "landing", "exit-ramp",
    "door-approach",
}
_missing = sorted(REQUIRED_FLOORS - {floor["id"] for floor in CONTRACT["floors"]})
if _missing:
    raise RuntimeError(
        f"The contract no longer carries {_missing}. Re-author the carve "
        "against the current floors "
        f"({sorted(floor['id'] for floor in CONTRACT['floors'])}) "
        "before rebuilding (scene gate 2)."
    )

DATUM = CONTRACT["datums"]
ROOM = CONTRACT["room"]
BOUNDS = ROOM["blenderBounds"]
FLOORS = {floor["id"]: floor for floor in CONTRACT["floors"]}
BED = CONTRACT["bed"]
CLEFT = CONTRACT["cleft"]
AVEN = CONTRACT["aven"]
DOORS = CONTRACT["doors"]
STATIONS = CONTRACT["stations"]
RAILS = CONTRACT["rails"]
CONSOLES = CONTRACT["consoles"]

DOOR_Y = DATUM["door"]
OVERLOOK_Y = DATUM["overlook"]
OVERLOOK_CROWN = DATUM["overlookCrown"]
GALLERY_Y = DATUM["gallery"]
LANDING_Y = DATUM["landing"]
BED_Y = DATUM["bed"]
CLEFT_Y = DATUM["cleft"]
BED_CROWN = DATUM["bedCrown"]
VESTIBULE_CROWN = DATUM["vestibuleCrown"]
AVEN_TOP = DATUM["avenTop"]
RAIL_H = DATUM["railHeight"]

# The First Fire's block reaches 1.8 m past its own east wall — straight into
# the corridor that runs south along that wall to its door. Earth's rock
# starts where Fire's ends, so the two shells never occupy the same metre;
# the corridor's west 0.8 m is Fire's to carve (build-first-fire-production).
FIRE_SHELL_MARGIN = 1.8
_fire = json.loads(FIRE_MANIFEST_PATH.read_text(encoding="utf-8"))["contract"]
FIRE_BLOCK_EAST_X = (
    _fire["room"]["planCentre"]["x"] + _fire["room"]["blenderBounds"]["maxX"]
    + FIRE_SHELL_MARGIN - ROOM["planCentre"]["x"]
)
corridor_rects = CONTRACT["approachCorridor"]["blenderRects"]
CORRIDOR_MIN_X = min(r["centre"]["x"] - r["sizeX"] / 2 for r in corridor_rects)
CORRIDOR_MAX_X = max(r["centre"]["x"] + r["sizeX"] / 2 for r in corridor_rects)
CORRIDOR_MIN_Y = min(r["centre"]["y"] - r["sizeY"] / 2 for r in corridor_rects)
if not CORRIDOR_MIN_X < FIRE_BLOCK_EAST_X < CORRIDOR_MAX_X:
    raise RuntimeError(
        f"Fire's block face x={FIRE_BLOCK_EAST_X:.2f} is not inside the corridor "
        f"({CORRIDOR_MIN_X}..{CORRIDOR_MAX_X}); the two shells no longer meet there"
    )

for path in (BLEND_PATH.parent, RAW_GLB_PATH.parent, QA_DIR, REPORT_PATH.parent):
    path.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = CONTRACT["sceneName"]
scene["earth_root_terrace_contract_schema"] = CONTRACT["schemaVersion"]
scene["earth_root_terrace_source_digest"] = SOURCE_DIGEST
scene["earth_root_terrace_source_modules"] = json.dumps(CONTRACT["sourceModules"])
scene["earth_root_terrace_stations"] = json.dumps(STATIONS)


def create_collection(name, parent=None):
    result = bpy.data.collections.new(name)
    (parent or scene.collection).children.link(result)
    return result


export_root = create_collection("EXPORT_EarthRootTerrace")
COLLECTIONS = {
    name: create_collection(name, export_root) for name in ("SHELL", "FURNITURE", "GROWTH")
}
for name in ("LOCATORS", "CAMERAS", "QA_ONLY"):
    COLLECTIONS[name] = create_collection(name)
if set(CONTRACT["collections"]) != set(COLLECTIONS):
    raise RuntimeError("Blender collection contract is incomplete")


def move_to_collection(obj, target):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    target.objects.link(obj)
    return obj


def material(name, color, roughness=0.85, metallic=0.0, emission=None, emission_strength=0.0):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    result.diffuse_color = color
    bsdf = result.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        if emission:
            bsdf.inputs["Emission Color"].default_value = emission
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    return result


ROCK = material("ET Rock", (0.16, 0.14, 0.11, 1.0), roughness=0.95)
# Brass at metallic 0: the museum has no environment map, and a metal with
# nothing to reflect renders as a flat cutout. The production bake gives the
# rail its highlights from the baked light instead.
BRASS = material("ET Brass", (0.62, 0.46, 0.22, 1.0), roughness=0.35)
LAMP = material(
    "ET Lamp", (1.0, 0.72, 0.4, 1.0), roughness=0.4,
    emission=(1.0, 0.7, 0.36, 1.0), emission_strength=5.0,
)
GROWTH = material(
    "ET Growth", (0.18, 0.52, 0.16, 1.0), roughness=0.8,
    emission=(0.22, 0.9, 0.26, 1.0), emission_strength=1.4,
)
SKY = material(
    "ET Sky", (0.78, 0.87, 1.0, 1.0), roughness=0.6,
    emission=(0.8, 0.9, 1.0, 1.0), emission_strength=6.0,
)
ROOT_MAT = material("ET Root", (0.2, 0.13, 0.08, 1.0), roughness=0.9)
STAMP = material("ET Cut Stone", (0.72, 0.66, 0.56, 1.0), roughness=0.7)
LOCATOR = material("Performer Locator", (0.82, 0.86, 0.82, 1.0), roughness=0.6)


def assign(obj, mat):
    if obj.type == "MESH":
        obj.data.materials.clear()
        obj.data.materials.append(mat)


def add_box(name, location, dimensions, mat, target, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, mat)
    return move_to_collection(obj, target)


def add_cylinder(name, location, radius, depth, mat, target, vertices=24, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation
    )
    obj = bpy.context.active_object
    obj.name = name
    assign(obj, mat)
    return move_to_collection(obj, target)


def add_curve_mesh(name, points, radius, mat, target, radii=None, resolution=3):
    """A bevelled bezier converted to a mesh; per-point radii taper it."""
    curve_data = bpy.data.curves.new(f"{name}_Curve", type="CURVE")
    curve_data.dimensions = "3D"
    curve_data.resolution_u = resolution
    curve_data.bevel_depth = radius
    curve_data.bevel_resolution = 3
    spline = curve_data.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for index, (bezier, point) in enumerate(zip(spline.bezier_points, points)):
        bezier.co = point
        bezier.handle_left_type = "AUTO"
        bezier.handle_right_type = "AUTO"
        if radii:
            bezier.radius = radii[index]
    obj = bpy.data.objects.new(name, curve_data)
    target.objects.link(obj)
    obj.data.materials.append(mat)
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj.select_set(False)
    obj.name = name
    assign(obj, mat)
    return obj


def add_text_mesh(name, text, location, rotation, scale, mat, target):
    bpy.ops.object.text_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.body = text
    obj.data.align_x = "CENTER"
    obj.data.align_y = "CENTER"
    obj.data.extrude = 0.055
    obj.data.bevel_depth = 0.018
    obj.scale = (scale, scale, scale)
    move_to_collection(obj, target)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.select_set(False)
    obj.name = name
    assign(obj, mat)
    return obj


# ── The block ───────────────────────────────────────────────────────────────
# One block of rock around the interior and the corridor, the way the Drowned
# Gallery's and the First Fire's are. Every space is cut from it below, so
# floor, wall and vault come out as one continuous surface.
SHELL_MARGIN = 3.5
SHELL_FLOOR = CLEFT_Y - 2.0
SHELL_ROOF = AVEN_TOP + 2.5
CORRIDOR_CROWN = CONTRACT["approachCorridor"]["clearance"]

block_box = {
    "minX": FIRE_BLOCK_EAST_X,
    "maxX": BOUNDS["maxX"] + SHELL_MARGIN,
    "minY": BOUNDS["minY"] - SHELL_MARGIN,
    "maxY": BOUNDS["maxY"] + SHELL_MARGIN,
}
wing_box = {
    "minX": FIRE_BLOCK_EAST_X,
    "maxX": CORRIDOR_MAX_X + SHELL_MARGIN,
    "minY": CORRIDOR_MIN_Y - SHELL_MARGIN,
    "maxY": block_box["minY"] + 0.1,
}


def box_object(name, box, z0, z1, target):
    return add_box(
        name,
        ((box["minX"] + box["maxX"]) / 2, (box["minY"] + box["maxY"]) / 2, (z0 + z1) / 2),
        (box["maxX"] - box["minX"], box["maxY"] - box["minY"], z1 - z0),
        ROCK, target,
    )


shell_rock = box_object("ET_Shell_Rock", block_box, SHELL_FLOOR, SHELL_ROOF, COLLECTIONS["SHELL"])
shell_wing = box_object("ET_Shell_Wing", wing_box, SHELL_FLOOR, CORRIDOR_CROWN + 2.6, COLLECTIONS["SHELL"])
union = shell_rock.modifiers.new("Wing", "BOOLEAN")
union.operation = "UNION"
union.solver = "EXACT"
union.object = shell_wing
bpy.context.view_layer.objects.active = shell_rock
bpy.ops.object.modifier_apply(modifier="Wing")
bpy.data.objects.remove(shell_wing, do_unlink=True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# ── The voids ───────────────────────────────────────────────────────────────
carver = cave_shell.Carver("ET_CARVE_Negative", scene)
EXPAND = 0.22


def floor_box(floor_id):
    box = FLOORS[floor_id]["box"]
    return box["minX"], box["minY"], box["maxX"], box["maxY"]


def clamp01(value):
    return min(1.0, max(0.0, value))


def carve_vault(name, box, floor, crown, shape, corner_radius, expand=EXPAND, relief=0.14, segments=5):
    return carver.vault(
        f"ET_Void_{name}", box, floor, crown, shape=shape,
        corner_radius=corner_radius, expand=expand, corner_segments=segments,
        relief=relief, seed=len(carver.parts) * 1.31,
    )


# 1. The vestibule: a low dome inside the west door, the stamp on its east wall.
vx0, vy0, vx1, vy1 = floor_box("vestibule")
carve_vault("Vestibule", (vx0, vy0, vx1, vy1), DOOR_Y, VESTIBULE_CROWN, "dome", 1.6)

# 2. The north run: the entry ramp climbing east along the north wall onto the
# overlook spur. One barrel vault; the spur is a dead end by design, so the
# vault closes at the overlook's east face and the visitor comes back down it.
nx0, ny0, nx1, ny1 = floor_box("entry-ramp")
ox0, oy0, ox1, oy1 = floor_box("overlook")
RAMP_FROM, RAMP_TO = FLOORS["entry-ramp"]["fromZ"], FLOORS["entry-ramp"]["toZ"]


def north_floor(x, _y):
    return RAMP_FROM + (RAMP_TO - RAMP_FROM) * clamp01((x - nx0) / (nx1 - nx0))


carve_vault(
    "NorthRun", (min(nx0, ox0), min(ny0, oy0), max(nx1, ox1), max(ny1, oy1)),
    north_floor, OVERLOOK_CROWN, "tube", 1.1,
)

# 3. The gallery descent: the working route out of the vestibule's south-east
# corner, falling a metre onto the catwalk. Its own low vault, so leaving the
# vestibule the other way feels like going under rather than up.
gx0, gy0, gx1, gy1 = floor_box("gallery-descent")
GD_FROM, GD_TO = FLOORS["gallery-descent"]["fromZ"], FLOORS["gallery-descent"]["toZ"]


def descent_floor(x, _y):
    return GD_FROM + (GD_TO - GD_FROM) * clamp01((x - gx0) / (gx1 - gx0))


carve_vault(
    "GalleryDescent", (gx0, gy0, gx1, gy1), descent_floor,
    FLOORS["gallery-descent"]["crown"], "tube", 0.6,
)

# 4. The rootbed and the catwalk that crosses it. The terrain is 2.5D - one
# height per point - so the catwalk cannot be a slab hung over the bed. It is
# a CAUSEWAY: rock left standing from the bed floor up to the gallery deck,
# with the pit carved south of it, north of it, and in the four gaps of the
# alcove band. Its top is the walkway; its south face is the wall the consoles
# sit on; and the overlook's line to the cases passes over its rail, which is
# what the sightline test measures.
gallery = FLOORS["gallery"]["box"]
alcoves = [FLOORS[i]["box"] for i in ("alcove-g", "alcove-h", "alcove-i")]
CAUSEWAY_S = gallery["minY"]
CAUSEWAY_N = max(a["maxY"] for a in alcoves)
PIT_TOP = BED_CROWN - 2.7
PIT_R = 0.45

pit_rects = [
    ("BedSouth", (BED["minX"], BED["minY"], BED["maxX"], CAUSEWAY_S)),
    ("BedNorth", (BED["minX"], CAUSEWAY_N, BED["maxX"], BED["maxY"])),
]
# The alcove band, minus the three alcoves: four gaps that make the bays read
# as bays. The rail folds around them; the drop beside it is real.
gap_edges = [BED["minX"]]
for alcove in alcoves:
    gap_edges += [alcove["minX"], alcove["maxX"]]
gap_edges.append(BED["maxX"])
for index in range(0, len(gap_edges), 2):
    x0, x1 = gap_edges[index], gap_edges[index + 1]
    if x1 - x0 > 0.05:
        # North past the band, into the trench, so the two cuts overlap
        # instead of meeting on a face.
        pit_rects.append((f"BedGap{index // 2}", (x0, gallery["maxY"], x1, CAUSEWAY_N + EXPAND)))

for name, box in pit_rects:
    span = min(box[2] - box[0], box[3] - box[1]) / 2
    carver.prism(
        f"ET_Void_{name}", box, [(0.0, BED_Y), (0.0, PIT_TOP)],
        corner_radius=min(PIT_R, span - 0.02), corner_segments=5, relief=0.0,
    )

# The air over the whole causeway, cut down to the deck in ONE piece: the
# catwalk, the three alcoves and the four drops beside them share one volume
# above the deck line. Cutting them as four boxes left rock standing in the
# seams - a rounded corner between two voids is not a corner, it is a nine
# metre pillar, and two of them stood square in the overlook's view of the
# row. Relief is zero: the walked rectangle is what the collider and the
# sightline proofs both trust, so nothing may bulge up through it.
carver.prism(
    "ET_Void_CausewayAir",
    (gallery["minX"], gallery["minY"] - EXPAND, BED["maxX"] + EXPAND, CAUSEWAY_N + EXPAND),
    [(0.0, GALLERY_Y), (0.0, PIT_TOP)], corner_radius=0.15, corner_segments=4,
)

# The dome over the whole bed, springing from just under the pit's top so the
# chamber and its cap come out as one surface. It passes over the causeway as
# well: the catwalk stands inside the rootbed's volume, not in a tunnel.
bed_box = (BED["minX"], BED["minY"], BED["maxX"], BED["maxY"])
bed_limit = min(bed_box[2] - bed_box[0], bed_box[3] - bed_box[1]) / 2
carver.prism(
    "ET_Void_BedCap", bed_box,
    [(0.0, PIT_TOP - 0.2), (bed_limit * 0.5, BED_CROWN - 1.0), (bed_limit * 0.85, BED_CROWN)],
    corner_radius=2.6, corner_segments=7, relief=0.22, seed=2.0,
)

# 5. The east channel: the catwalk's east end steps onto the link, which falls
# to the landing on the row's axis, then the exit ramp regains the datum at the
# door approach. Its west face is open to the bed the whole way, so the
# ensemble read from the landing looks straight down the row.
east_floors = [FLOORS[i] for i in ("east-link", "landing", "exit-ramp", "door-approach")]
ex0 = min(f["box"]["minX"] for f in east_floors)
ex1 = max(f["box"]["maxX"] for f in east_floors)
ey0 = min(f["box"]["minY"] for f in east_floors)
ey1 = max(f["box"]["maxY"] for f in east_floors)


def east_floor(_x, y):
    for floor in east_floors:
        box = floor["box"]
        if box["minY"] - 1e-6 <= y <= box["maxY"] + 1e-6:
            if floor["kind"] == "flat":
                return floor["fromZ"]
            fraction = clamp01((y - box["minY"]) / (box["maxY"] - box["minY"]))
            return floor["fromZ"] + (floor["toZ"] - floor["fromZ"]) * fraction
    return DOOR_Y if y < ey0 else GALLERY_Y


carve_vault("EastRoute", (ex0, ey0, ex1, ey1), east_floor, FLOORS["landing"]["crown"], "tube", 1.1)

# 6. The aven over H: a shaft that narrows toward a closed top, where the
# sky disc hangs. It is not open to the outside - the museum has no sky -
# so what the bed is lit by is the disc, and in production the spot behind it.
AVEN_R = AVEN["radius"]
aven_box = (
    AVEN["centre"]["x"] - AVEN_R, AVEN["centre"]["y"] - AVEN_R,
    AVEN["centre"]["x"] + AVEN_R, AVEN["centre"]["y"] + AVEN_R,
)
carver.prism(
    "ET_Void_Aven", aven_box,
    [(0.0, AVEN["base"]), (0.0, AVEN["base"] + 5.9), (0.9, AVEN_TOP - 1.8), (1.65, AVEN_TOP - 0.1)],
    corner_radius=AVEN_R, corner_segments=7, relief=0.12, seed=4.0,
)
SKY_Z = AVEN_TOP - 0.4
SKY_R = 1.5

# 7. The cleft beside the door approach: a slot dropping four metres below the
# bed, its east face flush with the deck's west edge so the floor visibly
# falls away on the way out.
carve_vault(
    "Cleft", (CLEFT["minX"], CLEFT["minY"] - 0.2, ex0, CLEFT["maxY"]),
    CLEFT_Y, 3.0, "slot", 0.8, expand=0.0, relief=0.1, segments=4,
)

# 8. The corridor from the First Fire, swept along its centreline with a joint
# at every bend (the Drowned Gallery's approach used the same trick: a chain
# of vaulted slices corrugates a passage). The sweep runs past Earth's block
# face into Fire's band, where Fire's own carve continues it.
JOINT_PROUD = 0.08
long_run = max(corridor_rects, key=lambda r: r["sizeY"])
door_row = min(corridor_rects, key=lambda r: r["centre"]["y"])
fire_door_y = door_row["centre"]["y"] + 0.75
corridor_x = long_run["centre"]["x"]
corridor_plan = [
    (DOORS["west"]["centre"]["x"] + 0.4, DOORS["west"]["centre"]["y"]),
    (corridor_x, DOORS["west"]["centre"]["y"]),
    (corridor_x, fire_door_y),
    (CORRIDOR_MIN_X - 0.8, fire_door_y),
]
CORRIDOR_W = long_run["sizeX"]
carver.swept("ET_Void_Corridor", corridor_plan, CORRIDOR_W, CORRIDOR_CROWN, shape="tube", base=DOOR_Y)
for index, bend in enumerate(corridor_plan[1:-1]):
    carver.chamber(
        f"ET_Void_Corridor-joint-{index}", bend, CORRIDOR_W / 2 + JOINT_PROUD,
        CORRIDOR_CROWN, shape="tube", segments=20, base=DOOR_Y,
    )

# 9. The south door bore out to Air, through the block's south face.
south = DOORS["south"]
carver.swept(
    "ET_Void_SouthDoor",
    [(south["centre"]["x"], south["centre"]["y"] + 1.0),
     (south["centre"]["x"], block_box["minY"] - 0.8)],
    (south["span"]["max"] - south["span"]["min"]) + 0.4, south["clearance"],
    shape="tube", extend=0.0, base=DOOR_Y,
)

SHELL_REPORT = carver.subtract_from(shell_rock)
SHELL_REPORT["margin"] = SHELL_MARGIN
SHELL_REPORT["fireBlockEastX"] = round(FIRE_BLOCK_EAST_X, 3)
SHELL_REPORT["block"] = {**block_box, "minZ": SHELL_FLOOR, "maxZ": SHELL_ROOF}
SHELL_REPORT["wing"] = wing_box
print(f"carved shell: {SHELL_REPORT}")


# ── Where the deck is under a point ────────────────────────────────────────
def deck_at(x, y, slop=0.02):
    """The walked height at (x, y), or None if nothing is walkable there."""
    for floor in CONTRACT["floors"]:
        box = floor["box"]
        if not box["minX"] - slop <= x <= box["maxX"] + slop:
            continue
        if not box["minY"] - slop <= y <= box["maxY"] + slop:
            continue
        if floor["kind"] == "flat":
            return floor["fromZ"]
        axis = "X" if floor["kind"] == "ramp-x" else "Y"
        low, high = box["min" + axis], box["max" + axis]
        fraction = clamp01(((x if axis == "X" else y) - low) / (high - low))
        return floor["fromZ"] + (floor["toZ"] - floor["fromZ"]) * fraction
    return None


# ── The rail ───────────────────────────────────────────────────────────────
# Four disjoint runs now, not one folded line: the overlook's south edge, the
# catwalk's south edge (the one the consoles are set into), the catwalk's
# north edge folding around the three alcoves, and the east channel's west
# edge. Posts stand 15 cm inside the contract's line so every foot lands on
# the deck - and which side "inside" is differs per run, so it is measured
# rather than assumed: probe both sides and keep the one with a deck on it.
RAIL_INSET = 0.15
POST_R = 0.035
# The production pass sinks every walked deck 0.12 m under its datum, so the
# 0.30 m voxel remesh can never lift rock ABOVE the collider, and the remesh
# then rounds a deck EDGE down by most of another voxel - measured 0.40 m
# below datum a hand's width in from the catwalk lip. A foot authored at the
# datum therefore hangs in mid-air over the rootbed, which is precisely how
# the first console pass shipped: cap on the rail, legs dangling. Every foot
# that meets a deck starts this far under it instead, and the rock closes
# over the buried part.
FOOT_SINK = 0.55
POST_SPACING = 2.0
CONSOLE_GAP = 0.06
POST_CLEAR = 0.14

console_spans = [
    (c["blender"]["x"] - c["width"] / 2, c["blender"]["x"] + c["width"] / 2,
     c["blender"]["y"])
    for c in CONSOLES
]


def on_run(y, cy):
    return abs(y - cy - RAIL_INSET) < 0.4


def in_console(x, y):
    """Inside a console's own span, where the cap is the barrier."""
    return any(
        on_run(y, cy) and x0 - CONSOLE_GAP <= x <= x1 + CONSOLE_GAP
        for x0, x1, cy in console_spans
    )


def crosses_console(a, b):
    """Does the bar between two posts pass through a console?"""
    if abs(a[1] - b[1]) > 1e-6:
        return False
    low, high = sorted((a[0], b[0]))
    return any(
        on_run(a[1], cy) and low < x1 and high > x0 for x0, x1, cy in console_spans
    )


def rail_offset(a, b):
    """The 15 cm step onto the deck for the segment a -> b."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy)
    nx, ny = -dy / length, dx / length
    mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    probe = 0.4
    left = deck_at(mx + nx * probe, my + ny * probe)
    right = deck_at(mx - nx * probe, my - ny * probe)
    if (left is None) == (right is None):
        raise RuntimeError(
            f"rail segment ({a[0]}, {a[1]}) -> ({b[0]}, {b[1]}): "
            "cannot tell which side the deck is on"
        )
    sign = 1.0 if right is None else -1.0
    return (nx * RAIL_INSET * sign, ny * RAIL_INSET * sign)


def offset_run(points):
    """The whole run stepped inboard; at a fold the two steps add, which
    mitres the corner into the deck instead of leaving a notch."""
    moved = []
    for index, point in enumerate(points):
        if index == 0:
            ox, oy = rail_offset(points[0], points[1])
        elif index == len(points) - 1:
            ox, oy = rail_offset(points[-2], points[-1])
        else:
            first = rail_offset(points[index - 1], point)
            second = rail_offset(point, points[index + 1])
            ox, oy = first[0] + second[0], first[1] + second[1]
        moved.append((point[0] + ox, point[1] + oy))
    return moved


def run_samples(line):
    """Post positions: every vertex, every two metres between, and both edges
    of any console the run passes, so the bar stops square against it."""
    out = []
    for index in range(len(line) - 1):
        a, b = line[index], line[index + 1]
        length = math.hypot(b[0] - a[0], b[1] - a[1])
        steps = max(1, round(length / POST_SPACING))
        stops = [step / steps for step in range(steps)]
        if abs(b[1] - a[1]) < 1e-6:
            for x0, x1, cy in console_spans:
                if abs(a[1] - cy - RAIL_INSET) > 0.4:
                    continue
                for edge in (x0 - POST_CLEAR, x1 + POST_CLEAR):
                    stops.append((edge - a[0]) / (b[0] - a[0]))
        for t in sorted({round(t, 6) for t in stops if 0.0 <= t < 1.0}):
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    out.append(line[-1])
    return out


post_count = 0
lamp_count = 0
rail_runs = []
for run_index, run in enumerate(RAILS):
    line = offset_run([(p["x"], p["y"]) for p in run["points"]])
    height = run["height"]
    stretches, current = [], []
    for px, py in run_samples(line):
        z0 = deck_at(px, py)
        if z0 is None:
            raise RuntimeError(
                f"rail run {run_index}: a post at ({px:.2f}, {py:.2f}) stands off the deck"
            )
        if in_console(px, py):
            continue
        if current and crosses_console(current[-1], (px, py)):
            if len(current) > 1:
                stretches.append(current)
            current = []
        current.append((px, py, z0 + height))
        add_cylinder(
            f"ET_RailPost_{post_count:02d}",
            (px, py, z0 + (height - FOOT_SINK) / 2), POST_R, height + FOOT_SINK,
            BRASS, COLLECTIONS["FURNITURE"], vertices=12,
        )
        if post_count % 4 == 0:
            add_cylinder(
                f"ET_Lamp_{lamp_count:02d}", (px, py, z0 + height + 0.2), 0.09, 0.24,
                LAMP, COLLECTIONS["FURNITURE"], vertices=12,
            )
            add_cylinder(
                f"ET_LampStem_{lamp_count:02d}", (px, py, z0 + height + 0.05), 0.02, 0.1,
                BRASS, COLLECTIONS["FURNITURE"], vertices=8,
            )
            lamp_count += 1
        post_count += 1
    if len(current) > 1:
        stretches.append(current)
    for stretch_index, stretch in enumerate(stretches):
        add_curve_mesh(
            f"ET_Rail_{run_index}{chr(97 + stretch_index)}", stretch, 0.03,
            BRASS, COLLECTIONS["FURNITURE"], resolution=4,
        )
    rail_runs.append({"vertices": len(line), "stretches": len(stretches), "height": height})

# ── The three control consoles ─────────────────────────────────────────────
# Set into the catwalk's south rail, one opposite each case. The cap takes the
# rail's own line and its own height, so the visitor works the row over the
# same edge they would have leaned on - the console is the barrier there, not
# a lectern standing in the walkway. Phase 4 makes the faces live; here they
# are brass, a lit plate and the case letter.
console_report = []
for console in CONSOLES:
    letter = console["letter"]
    cx = console["blender"]["x"]
    cy = console["blender"]["y"]
    width = console["width"]
    cap_top = console["capZ"]
    deck = deck_at(console["stand"]["x"], console["stand"]["y"])
    if deck is None:
        raise RuntimeError(f"console {letter}: nowhere to stand at its own stance")
    foot = deck - FOOT_SINK
    add_box(
        f"ET_Console_{letter}_Panel", (cx, cy, (foot + cap_top - 0.1) / 2),
        (width, 0.06, cap_top - 0.1 - foot), BRASS, COLLECTIONS["FURNITURE"],
    )
    add_box(
        f"ET_Console_{letter}_Cap", (cx, cy + 0.17, cap_top - 0.05),
        (width, 0.34, 0.1), BRASS, COLLECTIONS["FURNITURE"],
    )
    add_box(
        f"ET_Console_{letter}_Face", (cx, cy + 0.19, cap_top + 0.004),
        (width - 0.3, 0.2, 0.016), LAMP, COLLECTIONS["FURNITURE"],
    )
    for side in (-1, 1):
        add_cylinder(
            f"ET_Console_{letter}_Leg{'WE'[side > 0]}",
            (cx + side * (width / 2 - 0.12), cy + 0.24, (foot + cap_top - 0.1) / 2),
            0.035, cap_top - 0.1 - foot, BRASS, COLLECTIONS["FURNITURE"], vertices=8,
        )
    # Read from the stance, looking south at the case: the glyph lies on the
    # cap with its head away from the visitor.
    add_text_mesh(
        f"ET_ConsoleLetter_{letter}", letter,
        (cx, cy + 0.28, cap_top + 0.022), (0.0, 0.0, math.pi), 0.26,
        STAMP, COLLECTIONS["FURNITURE"],
    )
    console_report.append({
        "letter": letter, "x": cx, "y": cy, "capZ": cap_top,
        "deck": round(deck, 3), "stand": console["stand"],
    })

# A lamp on the landing's east wall, where the visitor stops for the ensemble.
landing = FLOORS["landing"]["box"]
lx = landing["maxX"] - 0.35
ly = (landing["minY"] + landing["maxY"]) / 2
add_cylinder(
    f"ET_LampStem_{lamp_count:02d}", (lx, ly, LANDING_Y + 0.8 - FOOT_SINK / 2),
    0.025, 1.6 + FOOT_SINK, BRASS, COLLECTIONS["FURNITURE"], vertices=8,
)
add_cylinder(f"ET_Lamp_{lamp_count:02d}", (lx, ly, LANDING_Y + 1.72), 0.09, 0.24, LAMP, COLLECTIONS["FURNITURE"], vertices=12)
lamp_count += 1

# ── The sky disc at the top of the aven ─────────────────────────────────────
add_cylinder(
    "ET_Sky", (AVEN["centre"]["x"], AVEN["centre"]["y"], SKY_Z), SKY_R, 0.05,
    SKY, COLLECTIONS["FURNITURE"], vertices=32,
)

# ── Growth: moss inside the west door, roots down the bed walls ─────────────
# Fire's extinction hands over to green growth at the threshold. Six moss
# discs on the vestibule floor just inside the door; nothing else on the
# floor, so the opener station (rendered at runtime) has the room.
opener = CONTRACT["opener"]["blender"]
door_x = DOORS["west"]["centre"]["x"]
for index in range(6):
    r = RNG.uniform(0.3, 0.6)
    # Ahead of the visitor, not underfoot: the first pass scattered them in
    # the two metres the arriving visitor is already standing in.
    mx = door_x + 2.0 + RNG.uniform(0.0, 3.0)
    my = RNG.uniform(-1.0, 2.6)
    add_cylinder(
        f"ET_Growth_Moss_{index:02d}", (mx, my, DOOR_Y + 0.015), r, 0.03,
        GROWTH, COLLECTIONS["GROWTH"], vertices=16,
    )

# Roots come out of the terrace's underside and the bed's walls and thin as
# they go. Along the east wall they get thinner toward the exit: by the door
# approach they are threads, and past the south door there are none — Air's
# handoff starts here.
root_count = 0


def root(points, base_radius, taper=(1.0, 0.75, 0.45, 0.25)):
    global root_count
    add_curve_mesh(
        f"ET_Root_{root_count:02d}", points, base_radius, ROOT_MAT,
        COLLECTIONS["GROWTH"], radii=list(taper[: len(points)]), resolution=4,
    )
    root_count += 1


# Every strand stays inside a hand's width of the wall it grew down. The
# first pass let them arc 0.6 m into the pit, and from the ramp a single
# root stood between the visitor and case H: the room's whole job is the
# sightline from the deck to the row, so nothing hangs in that air.
WALL_HUG = 0.12
# Down the bed's north wall. West of x = 5 that wall is the underside of the
# entry ramp and the overlook, and the strip of bed between it and the alcove
# band is the gap the overlook looks down through - so nothing hangs in the
# band the overlook's rays to the three cases cross (roughly x -2 to +7).
for rx in (-7.5, 8.0, 11.5):
    wobble = RNG.uniform(-0.35, 0.35)
    over = deck_at(rx, BED["maxY"] + 0.4)
    top = (over - 0.5) if over is not None else 2.6
    fall = top - (BED_Y + 0.1)
    root([
        (rx, BED["maxY"] + 0.25, top),
        (rx + wobble, BED["maxY"] - WALL_HUG, top - fall * 0.35),
        (rx - wobble * 0.6, BED["maxY"] - WALL_HUG * 0.7, top - fall * 0.7),
        (rx + wobble * 0.3, BED["maxY"] - WALL_HUG, BED_Y + 0.1),
    ], 0.075)
# Off the causeway's underside, between the cases and never in front of one.
# They start below the deck lip, so nothing stands in the walkway.
for rx in (-7.6, -0.4, 6.4, 12.2):
    wobble = RNG.uniform(-0.25, 0.25)
    root([
        (rx, CAUSEWAY_S + 0.05, GALLERY_Y - 0.15),
        (rx + wobble, CAUSEWAY_S - WALL_HUG, GALLERY_Y - 0.5),
        (rx - wobble * 0.6, CAUSEWAY_S - WALL_HUG * 0.7, BED_Y + 0.8),
        (rx + wobble * 0.3, CAUSEWAY_S - WALL_HUG, BED_Y + 0.1),
    ], 0.05)
# The bed's west wall, clear of the row's axis and of the ensemble read.
for ry in (-2.0, -4.6, -7.0):
    wobble = RNG.uniform(-0.3, 0.3)
    root([
        (BED["minX"] - 0.3, ry, 3.2),
        (BED["minX"] + WALL_HUG, ry + wobble, 0.9),
        (BED["minX"] + WALL_HUG * 0.7, ry - wobble * 0.5, -1.0),
        (BED["minX"] + WALL_HUG, ry + wobble * 0.3, BED_Y + 0.1),
    ], 0.07)
# The south wall carries the letters, so its roots run the far corners only.
for rx in (-8.0, 11.8):
    wobble = RNG.uniform(-0.3, 0.3)
    root([
        (rx, BED["minY"] - 0.3, 3.2),
        (rx + wobble, BED["minY"] + WALL_HUG, 1.0),
        (rx - wobble * 0.5, BED["minY"] + WALL_HUG * 0.7, -1.0),
        (rx, BED["minY"] + WALL_HUG, BED_Y + 0.1),
    ], 0.07)
# Threads on the east channel's east wall, fading out at the door approach:
# Air's handoff starts here and green stops.
for ry, radius in ((-5.0, 0.03), (-9.0, 0.018)):
    root([
        (ex1 + 0.3, ry, east_floor(ex1, ry) + 2.6),
        (ex1 - 0.12, ry + 0.3, east_floor(ex1, ry) + 1.6),
        (ex1 - 0.12, ry - 0.2, east_floor(ex1, ry) + 0.7),
        (ex1 - 0.1, ry, east_floor(ex1, ry) + 0.1),
    ], radius)

# ── Cut letters ─────────────────────────────────────────────────────────────
# The class stamp on the vestibule's east wall, read from the door; the case
# letters on the bed's south wall, read from the rail. Elemental words are
# never spoken in the room: the stamp names the class, the letters the cases.
# On the wall the door aims at, at the door's own y — the visitor reads the
# class name before anything else in the room. The first pass hung it two
# metres south of the doorway and it left the frame on arrival.
stamp = add_text_mesh(
    "ET_Stamp_TogetherSame", "TOGETHER-SAME",
    (vx1 + 0.2, DOORS["west"]["centre"]["y"], 2.3),
    (math.pi / 2, 0.0, -math.pi / 2), 0.42, STAMP, COLLECTIONS["FURNITURE"],
)
for station in STATIONS:
    add_text_mesh(
        f"ET_Letter_{station['letter']}", station["letter"],
        (station["blender"]["x"], BED["minY"] + 0.12, BED_Y + 1.6), (math.pi / 2, 0.0, math.pi), 1.2,
        STAMP, COLLECTIONS["FURNITURE"],
    )

# ── Locators (never exported) ───────────────────────────────────────────────
# A performer's height, not a half-height marker: these cones are the only
# thing standing on the bed in QA, and at 0.9 m they read as clear of the
# rail from viewpoints where a person would not be.
def add_locator(name, location, radius=0.3, depth=1.7):
    bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=radius, depth=depth, location=(location[0], location[1], location[2] + depth / 2))
    obj = bpy.context.active_object
    obj.name = name
    assign(obj, LOCATOR)
    return move_to_collection(obj, COLLECTIONS["LOCATORS"])


for station in STATIONS:
    b = station["blender"]
    add_locator(f"LOC_Station_{station['letter']}", (b["x"], b["y"], b["z"]))
add_locator("LOC_Opener", (opener["x"], opener["y"], opener["z"]))
ens = CONTRACT["ensemble"]
# The contract's ensemble camera now stands exactly on this eye, so the marker
# would be rendered from inside itself: keep it in the .blend for anyone
# opening the file, but never in a frame.
add_locator(
    "LOC_EnsembleEye", (ens["eye"]["x"], ens["eye"]["y"], ens["eye"]["z"]), 0.18, 0.5
).hide_render = True

# ── QA lights ───────────────────────────────────────────────────────────────
qa_lights = []


def add_light(name, location, color, energy, radius=0.6, kind="POINT", spot_size=None, target=None):
    data = bpy.data.lights.new(name, kind)
    data.color = color
    data.energy = energy
    data.shadow_soft_size = radius
    if kind == "SPOT" and spot_size:
        data.spot_size = spot_size
        data.spot_blend = 0.4
    obj = bpy.data.objects.new(name, data)
    obj.location = location
    COLLECTIONS["QA_ONLY"].objects.link(obj)
    if target is not None:
        direction = Vector(target) - Vector(location)
        obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    qa_lights.append(obj)
    return obj


DAYLIGHT = (0.86, 0.91, 1.0)
WARM = (1.0, 0.76, 0.5)
# The aven is a shaft of daylight, not a searchlight. At 30000 W the first
# pass tone-mapped the whole rootbed to flat white and the row read as three
# cones on a sheet of paper: no floor, no relief, nothing to compare.
add_light(
    "QA_Aven", (AVEN["centre"]["x"], AVEN["centre"]["y"], AVEN_TOP - 1.2),
    DAYLIGHT, 5200, 1.6, "SPOT", math.radians(62),
    target=(AVEN["centre"]["x"], AVEN["centre"]["y"], BED_Y),
)
for station in STATIONS:
    b = station["blender"]
    add_light(
        "QA_Bed_" + station["letter"],
        (b["x"], b["y"] + 1.5, BED_Y + 4.8), DAYLIGHT, 180, 0.8,
    )
# Green at the threshold is the seam from Fire's extinction, but a pure green
# key turned the vestibule into a monochrome fog with no rock in it: a warm
# key with a green fill instead, so the moss is the thing that is green.
add_light("QA_Vestibule", ((vx0 + vx1) / 2, 0.8, 3.4), (0.95, 0.9, 0.78), 300, 0.8)
# Low and close to the floor: the fill exists to green the moss, and at 1.1 m
# it washed the whole east wall instead, with the class stamp sitting on it.
add_light("QA_VestibuleGrowth", (vx0 + 3.0, 0.6, 0.45), (0.42, 0.9, 0.4), 110, 0.7)
add_light("QA_Ramp", ((nx0 + nx1) / 2, (ny0 + ny1) / 2, 4.6), WARM, 360, 0.6)
add_light("QA_Overlook", ((ox0 + ox1) / 2, (oy0 + oy1) / 2, 5.4), WARM, 520, 0.6)
add_light("QA_Descent", ((gx0 + gx1) / 2, (gy0 + gy1) / 2, 3.0), WARM, 240, 0.5)
# One over each console: the catwalk is where the visitor works, so it is lit
# to work by, not to admire.
for console in CONSOLES:
    add_light(
        "QA_Gallery_" + console["letter"],
        (console["blender"]["x"], (CAUSEWAY_S + CAUSEWAY_N) / 2, GALLERY_Y + 3.4),
        WARM, 300, 0.6,
    )
add_light("QA_Landing", (lx - 0.6, ly, LANDING_Y + 2.4), WARM, 380, 0.5)
add_light("QA_Approach", ((ex0 + ex1) / 2, -10.0, 2.6), WARM, 220, 0.5)
add_light("QA_Cleft", ((CLEFT["minX"] + CLEFT["maxX"]) / 2, (CLEFT["minY"] + CLEFT["maxY"]) / 2, CLEFT_Y + 3.0), (0.4, 0.5, 0.6), 280, 0.5)
add_light("QA_Corridor", (corridor_x, (DOORS["west"]["centre"]["y"] + fire_door_y) / 2, 2.4), (0.5, 0.8, 0.5), 260, 0.6)

# ── Cameras from the contract ───────────────────────────────────────────────
def look_at(obj, target):
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


PLAN_SECTION_Z = 3.0
# Two cameras the contract does not carry, both QA only: the production slice
# registers to contract cameras and this list never enters the manifest.
#
# The contract's own `console` view sits at the visitor's eye at their working
# stance. It proves the sightline - nothing crosses the line to the case - but
# the cap is below the frame, so the shot that shows the INTERACTION does not
# exist. `console-stance` stands off their shoulder.
#
# The first cut of it was pitched at the case and framed the console against
# bare rootbed, because at that pitch the catwalk deck and its 1.4 m drop fell
# under the bottom edge. A console floating over a floor is exactly the read
# the regrade exists to kill, so the eye moved back and up and the aim came in
# to the near bed: deck, drop and bed are now all in frame under the fixture.
#
# `catwalk-run` looks east along the row itself, which is the one view that
# says what this room now is: a working walkway at rail height over the bed,
# three consoles down its length, the cases below on the left.
_stance = CONSOLES[1]
_first, _last = CONSOLES[0], CONSOLES[-1]
QA_CAMERAS = [
    {
        "id": "console-stance",
        "name": "CAM_console-stance",
        "type": "perspective",
        "horizontalFovDegrees": 70,
        "position": {"x": _stance["blender"]["x"] - 3.4, "y": 6.2, "z": 2.6},
        "target": {"x": _stance["blender"]["x"] + 0.3, "y": 0.4, "z": -2.0},
    },
    {
        "id": "catwalk-run",
        "name": "CAM_catwalk-run",
        "type": "perspective",
        "horizontalFovDegrees": 72,
        "position": {
            "x": _first["blender"]["x"] - 4.6,
            "y": FLOORS["gallery"]["box"]["maxY"] - 0.45,
            "z": GALLERY_Y + DATUM["eyeAboveFloor"],
        },
        "target": {
            "x": _last["blender"]["x"] + 2.0,
            "y": FLOORS["gallery"]["box"]["minY"] + 0.2,
            "z": GALLERY_Y - 0.4,
        },
    },
]

cameras = {}
for camera_spec in list(CONTRACT["cameras"]) + QA_CAMERAS:
    data = bpy.data.cameras.new(camera_spec["name"])
    camera = bpy.data.objects.new(camera_spec["name"], data)
    position = camera_spec["position"]
    camera.location = (position["x"], position["y"], position["z"])
    data.clip_start = 0.05
    data.clip_end = 250
    if camera_spec["id"] == "plan":
        # A section, not a cutaway: the near plane slices the room at 3 m so
        # the terrace, the corridor and the vestibule all read as void and
        # the rock between them as rock.
        data.clip_start = position["z"] - PLAN_SECTION_Z
    if camera_spec["type"] == "orthographic":
        data.type = "ORTHO"
        data.ortho_scale = camera_spec["orthographicScale"]
    else:
        horizontal_fov = math.radians(camera_spec["horizontalFovDegrees"])
        data.sensor_width = 36
        data.lens = data.sensor_width / (2 * math.tan(horizontal_fov / 2))
    target = camera_spec["target"]
    look_at(camera, Vector((target["x"], target["y"], target["z"])))
    COLLECTIONS["CAMERAS"].objects.link(camera)
    cameras[camera_spec["id"]] = camera

# ── Render setup ────────────────────────────────────────────────────────────
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.image_settings.color_depth = "8"
scene.render.film_transparent = False
scene.view_settings.look = "AgX - Medium High Contrast"
scene.view_settings.exposure = 0.3
scene.world = bpy.data.worlds.new("Earth Root Terrace QA World")
scene.world.use_nodes = True
background = scene.world.node_tree.nodes.get("Background")
background.inputs["Color"].default_value = (0.006, 0.008, 0.01, 1.0)
background.inputs["Strength"].default_value = 0.12


def world_bounds(objects):
    points = [obj.matrix_world @ Vector(c) for obj in objects if obj.type == "MESH" for c in obj.bound_box]
    return {
        "minX": min(p.x for p in points), "maxX": max(p.x for p in points),
        "minY": min(p.y for p in points), "maxY": max(p.y for p in points),
        "minZ": min(p.z for p in points), "maxZ": max(p.z for p in points),
    }


export_meshes = [o for o in scene.objects if o.type == "MESH" and o.name.startswith("ET_")]
if any(o.name.startswith("ET_") and o.type in ("LIGHT", "CAMERA") for o in scene.objects):
    raise RuntimeError("ET_ export prefix includes a QA light or camera")
for obj in export_meshes:
    if obj.type == "MESH" and (not obj.data.materials or obj.data.materials[0] is None):
        raise RuntimeError(f"{obj.name} has no material")
    for slot in obj.material_slots:
        bsdf = slot.material.node_tree.nodes.get("Principled BSDF")
        if bsdf and bsdf.inputs["Metallic"].default_value > 0.0:
            raise RuntimeError(f"{obj.name}: {slot.material.name} is metallic; the museum has no environment map")

bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))

render_paths = {}
CUTAWAY_CAMERAS = {"overview"}
for name, camera in cameras.items():
    shell_rock.hide_render = name in CUTAWAY_CAMERAS
    scene.camera = camera
    render_path = QA_DIR / f"earth-root-terrace-{name}.png"
    scene.render.filepath = str(render_path)
    bpy.ops.render.render(write_still=True)
    render_paths[name] = str(render_path.relative_to(ROOT)).replace("\\", "/")
shell_rock.hide_render = False
scene.camera = cameras["overlook"]
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))

bpy.ops.object.select_all(action="DESELECT")
for obj in export_meshes:
    obj.select_set(True)
bpy.context.view_layer.objects.active = export_meshes[0]
bpy.ops.export_scene.gltf(
    filepath=str(RAW_GLB_PATH),
    export_format="GLB",
    use_selection=True,
    export_cameras=False,
    export_lights=False,
    export_extras=True,
    export_apply=True,
)

report = {
    "sourceDigest": SOURCE_DIGEST,
    "schemaVersion": CONTRACT["schemaVersion"],
    "blenderVersion": bpy.app.version_string,
    "blendPath": str(BLEND_PATH.relative_to(ROOT)).replace("\\", "/"),
    "manifestPath": str(MANIFEST_PATH.relative_to(ROOT)).replace("\\", "/"),
    "rawGlbPath": str(RAW_GLB_PATH.relative_to(ROOT)).replace("\\", "/"),
    "shell": SHELL_REPORT,
    "exportPrefix": CONTRACT["exportPrefix"],
    "exportMeshCount": len(export_meshes),
    "exportObjects": sorted(o.name for o in export_meshes),
    "materialCount": len(bpy.data.materials),
    "railPosts": post_count,
    "footSink": FOOT_SINK,
    "railRuns": rail_runs,
    "consoles": console_report,
    "lamps": lamp_count,
    "roots": root_count,
    "exportObjectBounds": world_bounds(export_meshes),
    "collections": sorted(COLLECTIONS),
    "renders": render_paths,
    "contractCameras": [c["id"] for c in CONTRACT["cameras"]],
    "qaOnlyCameras": [c["id"] for c in QA_CAMERAS],
}
REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(f"Verified Earth Root Terrace source digest: {SOURCE_DIGEST}")
print(f"Saved editable graybox: {BLEND_PATH}")
print(f"Export meshes: {len(export_meshes)}; posts {post_count}; lamps {lamp_count}; roots {root_count}")
for name, path in render_paths.items():
    print(f"Rendered {name:>16}: {path}")
