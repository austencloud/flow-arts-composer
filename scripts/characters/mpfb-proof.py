"""Build one clothed MPFB evaluation avatar without installing into user Blender.

Run with Blender --background --factory-startup --python-exit-code 1 --python
this-file -- --source <mpfb2 checkout> --assets <system pack directory>
--output <persistent output directory>. Use an isolated BLENDER_USER_RESOURCES.
MPFB source and the official CC0 system asset pack are external prerequisites.
"""

import argparse
import importlib
import json
import math
import random
import sys
import types
from pathlib import Path

import bpy


parser = argparse.ArgumentParser()
parser.add_argument("--source", type=Path, required=True)
parser.add_argument("--assets", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--seed", type=int)
parser.add_argument("--options", type=Path)
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
args.output.mkdir(parents=True, exist_ok=True)

# Blender's extension APIs require a three-part package name. Load the pinned
# checkout in a process-local namespace; no add-on install or preference save.
namespace = types.ModuleType("bl_ext.mpfbproof")
namespace.__path__ = [str(args.source / "src")]
sys.modules[namespace.__name__] = namespace
mpfb = importlib.import_module("bl_ext.mpfbproof.mpfb")
bpy.context.preferences.use_preferences_save = False
bpy.context.preferences.addons.new().module = mpfb.__name__
mpfb.register()

HumanService = importlib.import_module(mpfb.__name__ + ".services.humanservice").HumanService
TargetService = importlib.import_module(mpfb.__name__ + ".services.targetservice").TargetService
ExportService = importlib.import_module(mpfb.__name__ + ".services.exportservice").ExportService
ObjectService = importlib.import_module(mpfb.__name__ + ".services.objectservice").ObjectService
RandomizationService = importlib.import_module(mpfb.__name__ + ".services.randomizationservice").RandomizationService


def asset(subdir, name):
    matches = list((args.assets / subdir).rglob(name))
    if len(matches) != 1:
        raise RuntimeError(f"Expected one {subdir}/{name}, found {matches}")
    return str(matches[0])


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
macros = TargetService.get_default_macro_info_dict()
macros.update(gender=0.0, age=0.35, muscle=0.5, weight=0.5)
macros["race"] = {"african": 0.0, "asian": 0.0, "caucasian": 1.0}
hair = "ponytail01"
outfit = "female_sportsuit01"
skin = "young_caucasian_female"
details = {}
requested_options = None
age = "young"
if args.seed is not None:
    rng = random.Random(args.seed)
    spec = RandomizationService.get_default_phenotype_spec()
    # Adult bodies, with moderate variation that the bundled outfits can fit.
    spec["phenotype"]["discrete_age"] = False
    spec["phenotype"]["attributes"]["age"].update(neutral=0.55, deviation=0.2)
    for key in ["weight", "muscle", "height", "proportions"]:
        spec["phenotype"]["attributes"][key]["deviation"] = 0.3
    macros = RandomizationService.randomize_macro_info_dict(spec, rng)
    gender = "female" if macros["gender"] < 0.5 else "male"
    race = max(macros["race"], key=macros["race"].get)
    age = "young" if macros["age"] < 0.625 else "middleage" if macros["age"] < 0.875 else "old"
    skin = f"{age}_{race}_{gender}"
    hair = rng.choice(["short01", "short02", "short03", "bob01", "ponytail01", "afro01"])
    outfit = rng.choice(["female_casualsuit01", "female_casualsuit02", "female_sportsuit01"] if gender == "female" else ["male_casualsuit01", "male_casualsuit02", "male_casualsuit03"])
    if args.options:
        requested_options = json.loads(args.options.read_text())
        presentation = requested_options["presentation"]
        gender = "female" if presentation == "feminine" else "male"
        macros.update(
            gender=0.0 if presentation == "feminine" else 1.0,
            age={"young": 0.5, "middleage": 0.75, "old": 1.0}[requested_options["age"]],
            height=requested_options["height"],
            weight=requested_options["weight"],
            muscle=requested_options["muscle"],
            proportions=requested_options["proportions"],
        )
        age = requested_options["age"]
        skin = f"{age}_{race}_{gender}"
        hair = requested_options["hair"]
        outfit = requested_options["outfit"]
body = HumanService.create_human(macro_detail_dict=macros)
body.name = "MPFB Proof"
if args.seed is not None:
    target_data = json.loads((args.source / "src/mpfb/data/targets/target.json").read_text())
    sections = {name: section.get("categories", []) for name, section in target_data.items()
                if name in ["head", "nose", "eyes", "mouth", "chin", "ears"]}
    detail_spec = RandomizationService.get_default_detail_spec(list(sections))
    intensity = requested_options["face"] if requested_options else 0.5
    # A zero-value face control promises the base face, rather than a subtle
    # random morph that would be invisible until a later comparison.
    if intensity > 0:
        for section in detail_spec["sections"].values():
            section.update(
                min=1,
                max=1 + round(intensity * 2) if requested_options else 3,
                deviation=0.1 + intensity * 0.4 if requested_options else 0.3,
            )
        details = RandomizationService.pick_random_details(detail_spec, sections, rng)
        TargetService.bulk_load_targets(body, details)
HumanService.set_character_skin(
    asset("skins", skin + ".mhmat"), body, skin_type="GAMEENGINE"
)
# This is MPFB's authored rig/weights, not a Mixamo cloud re-rig.
HumanService.add_builtin_rig(body, "mixamo")
# TKA's staff poses flex fingers around local +X. MPFB's Mixamo-named bones
# use different rolls, so names alone do not establish that convention.
# Orient local +Z into the palm: positive X then bends +Y toward the palm.
# Change only rest frames, before export, preserving joints and skin weights.
rig = body.parent
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
for side, handedness in [("Left", 1), ("Right", -1)]:
    bones = rig.data.edit_bones
    prefix = f"mixamorig:{side}Hand"
    forward = bones[prefix + "Middle1"].head - bones[prefix].head
    across = bones[prefix + "Index1"].head - bones[prefix + "Pinky1"].head
    palm_normal = forward.cross(across).normalized() * handedness
    for finger in ["Thumb", "Index", "Middle", "Ring", "Pinky"]:
        for joint in range(1, 4):
            bone = bones[f"{prefix}{finger}{joint}"]
            bone.align_roll(palm_normal)
            # Thumb flexion crosses the palm; the other fingers flex into it.
            # Mirror this quarter-turn because the runtime mirrors Y/Z pose
            # deltas between hands while keeping positive-X flexion on both.
            if finger == "Thumb":
                bone.roll += handedness * math.pi / 2
bpy.ops.object.mode_set(mode="OBJECT")
parts = [
    ("eyes", "low-poly.mhclo", "Eyes"),
    ("eyebrows", "eyebrow001.mhclo", "Eyebrows"),
    ("eyelashes", "eyelashes01.mhclo", "Eyelashes"),
    ("tongue", "tongue01.mhclo", "Tongue"),
    ("teeth", "teeth_base.mhclo", "Teeth"),
    ("hair", hair + ".mhclo", "Hair"),
    ("clothes", outfit + ".mhclo", "Clothes"),
    ("clothes", "shoes01.mhclo", "Clothes"),
]
for subdir, name, kind in parts:
    HumanService.add_mhclo_asset(
        asset(subdir, name), body, asset_type=kind, material_type="GAMEENGINE",
        subdiv_levels=0,
    )

bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(args.output / "mpfb-proof-source.blend"))
root = ExportService.create_character_copy(body, name_suffix="_export")
export_body = ObjectService.find_object_of_type_amongst_nearest_relatives(root, "Basemesh")
# glTF with export_morph=False otherwise exports the unshaped Basis, while
# clothes and the rig were fitted to the shaped human. Freeze the evaluated
# modelling keys on the export copy before applying topology-changing masks.
for obj in ObjectService.get_list_of_children(root):
    if obj.type == "MESH" and obj.data.shape_keys:
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
ExportService.bake_modifiers_remove_helpers(
    export_body, bake_masks=True, bake_subdiv=False, remove_helpers=True, also_proxy=True
)
bpy.ops.object.select_all(action="DESELECT")
root.select_set(True)
for child in ObjectService.get_list_of_children(root):
    child.select_set(True)
bpy.context.view_layer.objects.active = root
for obj in bpy.context.selected_objects:
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
bpy.ops.export_scene.gltf(
    filepath=str(args.output / "mpfb-proof.glb"), export_format="GLB",
    use_selection=True, export_animations=False, export_morph=False,
)
rigs = [o for o in bpy.context.selected_objects if o.type == "ARMATURE"]
(args.output / "generation.json").write_text(json.dumps({
    "mpfbVersion": list(mpfb.VERSION), "blenderVersion": bpy.app.version_string,
    "seed": args.seed, "macros": macros, "details": details,
    "requestedOptions": requested_options,
    "resolvedControls": {
        "presentation": "feminine" if macros["gender"] < 0.5 else "masculine",
        "age": age, "height": macros.get("height"), "weight": macros["weight"],
        "muscle": macros["muscle"], "proportions": macros.get("proportions"),
        "hair": hair, "outfit": outfit,
        "face": requested_options["face"] if requested_options else None,
    },
    "handFrameVersion": 2,
    "skin": skin, "rig": "mixamo", "assets": parts,
    "bones": {r.name: [b.name for b in r.data.bones] for r in rigs},
}, indent=2))
print("MPFB_PROOF_COMPLETE", args.output)
