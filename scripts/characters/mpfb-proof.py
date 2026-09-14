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
MaterialService = importlib.import_module(mpfb.__name__ + ".services.materialservice").MaterialService
MhMaterial = importlib.import_module(mpfb.__name__ + ".entities.material.mhmaterial").MhMaterial
NodeWrapperGameEngine = importlib.import_module(mpfb.__name__ + ".entities.nodemodel.v2.materials.nodewrappergameengine").NodeWrapperGameEngine


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
shoes = "shoes01"
hat = "none"
eyebrows = "eyebrow001"
eyelashes = "eyelashes01"
eye_color = "brown"
hair_color_override = None
outfit_color_override = None
skin = "young_caucasian_female"
details = {}
requested_options = None
age = "young"
variation_seed = args.seed
face_seed = args.seed
if args.options:
    requested_options = json.loads(args.options.read_text())
    variation_seed = requested_options.get("variationSeed")
    if variation_seed is None:
        variation_seed = args.seed
    face_seed = requested_options.get("faceSeed")
    if face_seed is None:
        face_seed = variation_seed
if args.seed is not None:
    rng = random.Random(variation_seed)
    face_rng = random.Random(face_seed)
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
    hair = rng.choice(["bald", "short01", "short02", "short03", "short04", "bob01", "bob02", "ponytail01", "afro01", "braid01", "long01"])
    outfit = rng.choice(["female_casualsuit01", "female_casualsuit02", "female_elegantsuit01", "female_sportsuit01"] if gender == "female" else ["male_casualsuit01", "male_casualsuit02", "male_casualsuit03", "male_casualsuit04", "male_casualsuit05", "male_casualsuit06", "male_elegantsuit01", "male_worksuit01"])
    shoes = rng.choice(["shoes01", "shoes02", "shoes03", "shoes04", "shoes05", "shoes06"])
    hat = rng.choice(["none", "fedora01", "fedora_cocked"])
    eyebrows = rng.choice([f"eyebrow{number:03d}" for number in range(1, 13)])
    eyelashes = rng.choice(["none", "eyelashes01", "eyelashes02", "eyelashes03", "eyelashes04"])
    eye_color = rng.choice(["blue", "bluegreen", "brown", "brownlight", "deepblue", "green", "grey", "ice", "lightblue"])
    if requested_options:
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
        shoes = requested_options["shoes"]
        hat = requested_options["hat"]
        eyebrows = requested_options["eyebrows"]
        eyelashes = requested_options["eyelashes"]
        eye_color = requested_options["eyeColor"]
        hair_color_override = requested_options["hairColorOverride"]
        outfit_color_override = requested_options["outfitColorOverride"]
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
        details = RandomizationService.pick_random_details(detail_spec, sections, face_rng)
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
    ("eyebrows", eyebrows + ".mhclo", "Eyebrows"),
    ("tongue", "tongue01.mhclo", "Tongue"),
    ("teeth", "teeth_base.mhclo", "Teeth"),
    ("clothes", outfit + ".mhclo", "Clothes"),
    ("clothes", shoes + ".mhclo", "Clothes"),
]
if hair != "bald":
    parts.append(("hair", hair + ".mhclo", "Hair"))
if eyelashes != "none":
    parts.append(("eyelashes", eyelashes + ".mhclo", "Eyelashes"))
if hat != "none":
    parts.append(("clothes", hat + ".mhclo", "Clothes"))
# The official low-poly eye asset deliberately exposes its iris alternatives as
# .mhmat files. Rebuild this one material explicitly so the selection does not
# depend on an add-on-local alternative-materials implementation.
eyes = HumanService.add_mhclo_asset(
    asset("eyes", "low-poly.mhclo"), body, asset_type="Eyes", material_type="GAMEENGINE", subdiv_levels=0,
)
MaterialService.delete_all_materials(eyes)
eye_material = MaterialService.create_empty_material("MPFB eyes " + eye_color, eyes)
selected_eye_material = MhMaterial()
selected_eye_material.populate_from_mhmat(asset("eyes", eye_color + ".mhmat"))
NodeWrapperGameEngine.create_instance(eye_material.node_tree, mhmat=selected_eye_material)
for subdir, name, kind in parts:
    loaded = HumanService.add_mhclo_asset(
        asset(subdir, name), body, asset_type=kind, material_type="GAMEENGINE",
        subdiv_levels=0,
    )
    if name == outfit + ".mhclo":
        outfit_object = loaded
    if hair != "bald" and name == hair + ".mhclo":
        hair_object = loaded
parts.append(("eyes", f"low-poly.mhclo + materials/{eye_color}.mhmat", "Eyes"))


def srgb_channel_to_linear(channel):
    channel /= 255.0
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def apply_solid_color_override(asset_object, color):
    if not color or not asset_object or not asset_object.material_slots:
        return
    rgba = tuple(srgb_channel_to_linear(int(color[index:index + 2], 16)) for index in (1, 3, 5)) + (1.0,)
    material = asset_object.material_slots[0].material
    if not material or not material.use_nodes:
        raise RuntimeError("Expected a node material for solid color override")
    principled = next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
    if not principled:
        raise RuntimeError("Expected a Principled base-color node for solid color override")
    base_color = principled.inputs.get("Base Color")
    if not base_color:
        raise RuntimeError("Expected a Base Color input for solid color override")
    for link in list(base_color.links):
        material.node_tree.links.remove(link)
    # Keep the asset's alpha and normal-map links intact; only color becomes solid.
    base_color.default_value = rgba


apply_solid_color_override(locals().get("hair_object"), hair_color_override)
apply_solid_color_override(locals().get("outfit_object"), outfit_color_override)

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
    "seed": args.seed, "variationSeed": variation_seed, "faceSeed": face_seed,
    "macros": macros, "details": details,
    "requestedOptions": requested_options,
    "resolvedControls": {
        "presentation": "feminine" if macros["gender"] < 0.5 else "masculine",
        "age": age, "height": macros.get("height"), "weight": macros["weight"],
        "muscle": macros["muscle"], "proportions": macros.get("proportions"),
        "hair": hair, "outfit": outfit,
        "shoes": shoes, "hat": hat, "eyebrows": eyebrows,
        "eyelashes": eyelashes, "eyeColor": eye_color,
        "hairColorOverride": hair_color_override,
        "outfitColorOverride": outfit_color_override,
        "face": requested_options["face"] if requested_options else None,
    },
    "handFrameVersion": 2,
    "skin": skin, "rig": "mixamo", "assets": parts,
    "bones": {r.name: [b.name for b in r.data.bones] for r in rigs},
}, indent=2))
print("MPFB_PROOF_COMPLETE", args.output)
