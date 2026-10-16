"""Unreal 5.8 editor Python: import every deployed rig and its own motion clips.

Run after prepare-characters.mjs and convert-characters.py. Existing assets are
left untouched by default; pass --force to replace imports from staged FBX.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

import unreal as u

PROJECT = Path(u.Paths.project_dir()).resolve()
HERE = Path(__file__).resolve().parent
BUNDLE_TOOL = HERE.parent.parent / 'Shared' / 'Tools' / 'performance-bundle.mjs'


def performance_contract(command, **paths):
    subprocess.run([os.environ.get('TKA_NODE', 'node'), str(BUNDLE_TOOL), command,
                    *[str(item) for key, value in paths.items() for item in (f'--{key}', value)]],
                   check=True)


STAGED = Path(os.environ.get('FLOWFEST_STAGED', PROJECT / 'Tools' / 'staged' / 'Characters')).resolve()
MANIFEST = json.loads((STAGED / 'imports.json').read_text(encoding='utf-8'))
PERFORMANCE_MANIFEST_FILE = os.environ.get('MUSEUM_PERFORMANCE_MANIFEST')
PROFILES_ONLY = bool(PERFORMANCE_MANIFEST_FILE)
PERFORMANCE_MANIFEST = json.loads(Path(PERFORMANCE_MANIFEST_FILE).read_text(encoding='utf-8')) if PROFILES_ONLY else None
CATALOG = None if PROFILES_ONLY else json.loads((PROJECT / 'Content' / 'Data' / 'characters.json').read_text(encoding='utf-8'))
FORCE = '--force' in sys.argv or os.environ.get('FLOWFEST_FORCE') == '1'
CAPTURE_ONLY = os.environ.get('FLOWFEST_CAPTURE_ONLY') == '1'
LOCOMOTION_ONLY = os.environ.get('FLOWFEST_LOCOMOTION_ONLY') == '1'
FAMILY_ONLY = os.environ.get('FLOWFEST_FAMILY_ONLY') == '1'
CAPTURE_ID = os.environ.get('FLOWFEST_CAPTURE_ID')
ALLOW_PARTIAL = os.environ.get('FLOWFEST_ALLOW_PARTIAL') == '1'
if sum((CAPTURE_ONLY, LOCOMOTION_ONLY, FAMILY_ONLY)) > 1:
    raise RuntimeError('Choose one import subset: capture-only, locomotion-only, or family-only')
if ALLOW_PARTIAL and (not FAMILY_ONLY or not CAPTURE_ID):
    raise RuntimeError('FLOWFEST_ALLOW_PARTIAL requires FLOWFEST_FAMILY_ONLY=1 and FLOWFEST_CAPTURE_ID')
if PROFILES_ONLY:
    if any((CAPTURE_ONLY, LOCOMOTION_ONLY, FAMILY_ONLY, ALLOW_PARTIAL, CAPTURE_ID)):
        raise RuntimeError('Museum profiles cannot combine with FlowFest import subsets')
    if PERFORMANCE_MANIFEST.get('schema') != 'museum-native-performances-v1' or PERFORMANCE_MANIFEST.get('characterId') != 'x-bot' or PERFORMANCE_MANIFEST.get('propId') != 'staff':
        raise RuntimeError('Invalid Museum performance manifest')
    if len(MANIFEST['characters']) != 1 or MANIFEST['characters'][0]['id'] != 'x-bot':
        raise RuntimeError('Museum stage must contain only x-bot')
TOOLS = u.AssetToolsHelpers.get_asset_tools()
ED = u.EditorAssetLibrary
u.SystemLibrary.execute_console_command(None, 'Interchange.FeatureFlags.Import.FBX 0')

if not PROFILES_ONLY and (len(MANIFEST['characters']) != 16 or len(CATALOG['characters']) != 16):
    raise RuntimeError('Character catalog must contain exactly 16 deployed rigs')
if not PROFILES_ONLY and [x['id'] for x in MANIFEST['characters']] != [x['id'] for x in CATALOG['characters']]:
    raise RuntimeError('Staged and packaged character catalogs disagree')


def import_task(filename, folder, name, options, force=False):
    if not filename.is_file() or filename.stat().st_size < 1024:
        raise RuntimeError(f'Missing staged character asset: {filename}')
    path = f'{folder}/{name}'
    if ED.does_asset_exist(path) and not (FORCE or force):
        asset = ED.load_asset(path)
        if not asset:
            raise RuntimeError(f'Cannot load existing asset {path}')
        return asset
    task = u.AssetImportTask()
    task.filename = str(filename)
    task.destination_path = folder
    task.destination_name = name
    task.automated = True
    task.replace_existing = FORCE or force
    task.save = True
    task.options = options
    TOOLS.import_asset_tasks([task])
    asset = ED.load_asset(path)
    if not asset:
        raise RuntimeError(f'Import failed: {filename} -> {path}')
    # FBX creates material and texture packages alongside the mesh. The task's
    # save flag only persists its primary object, leaving those packages dirty.
    if isinstance(asset, u.SkeletalMesh):
        if not ED.save_directory(folder, only_if_is_dirty=False, recursive=True):
            raise RuntimeError(f'Failed to save skeletal mesh dependencies in {folder}')
    ED.save_loaded_asset(asset)
    return asset


def mesh_options():
    options = u.FbxImportUI()
    options.automated_import_should_detect_type = False
    options.mesh_type_to_import = u.FBXImportType.FBXIT_SKELETAL_MESH
    options.import_mesh = True
    options.import_as_skeletal = True
    options.import_animations = False
    options.import_materials = True
    options.import_textures = True
    data = options.skeletal_mesh_import_data
    data.set_editor_property('import_morph_targets', True)
    return options


def animation_options(skeleton):
    options = u.FbxImportUI()
    options.automated_import_should_detect_type = False
    options.mesh_type_to_import = u.FBXImportType.FBXIT_ANIMATION
    options.import_mesh = False
    options.import_as_skeletal = True
    options.import_animations = True
    options.skeleton = skeleton
    options.import_materials = False
    options.import_textures = False
    return options


def restore_reference_scale(animation, reference_roots, character_id):
    """Restore imported root transforms to the mesh skeleton's centimetre space.

    The mesh reference pose stores a 100x scale on Hips or RootNode1. Animation
    FBX import may drop this scale and also leave the root translation in metres.
    Hips is a top-level bone on four rigs, so its own translation is not affected
    by its scale and must be converted separately.
    """
    model = animation.get_editor_property('data_model_interface')
    controller = animation.get_editor_property('controller')
    frame_count = model.get_number_of_frames()
    if frame_count < 2:
        raise RuntimeError(f'{character_id}: {animation.get_name()} has no usable animation frames')
    for bone_name, reference_transform in reference_roots.items():
        reference_scale = reference_transform.scale3d
        sampled = [u.AnimationLibrary.get_bone_pose_for_frame(animation, bone_name, frame, False)
                   for frame in (0, frame_count // 2, frame_count - 1)]
        scale_matches = all(max(abs(pose.scale3d.x - reference_scale.x),
                                abs(pose.scale3d.y - reference_scale.y),
                                abs(pose.scale3d.z - reference_scale.z)) < .01 for pose in sampled)
        reference_origin = reference_transform.translation
        reference_height = max(abs(reference_origin.x), abs(reference_origin.y), abs(reference_origin.z))
        sampled_height = max(max(abs(pose.translation.x), abs(pose.translation.y),
                                 abs(pose.translation.z)) for pose in sampled)
        metres_to_centimetres = reference_height > 10 and sampled_height < 10
        if scale_matches and not metres_to_centimetres:
            continue
        positions, rotations, scales = [], [], []
        for frame in range(frame_count):
            pose = u.AnimationLibrary.get_bone_pose_for_frame(animation, bone_name, frame, False)
            factor = 100.0 if metres_to_centimetres else 1.0
            positions.append(u.Vector(pose.translation.x * factor, pose.translation.y * factor,
                                      pose.translation.z * factor))
            rotations.append(pose.rotation)
            scales.append(u.Vector(reference_scale.x, reference_scale.y, reference_scale.z))
        if not controller.set_bone_track_keys(bone_name.lower(), positions, rotations, scales, False):
            raise RuntimeError(f'{character_id}: failed to restore {bone_name} scale on {animation.get_name()}')
        for frame in (0, frame_count // 2, frame_count - 1):
            corrected = u.AnimationLibrary.get_bone_pose_for_frame(animation, bone_name, frame, False)
            scale = corrected.scale3d
            if max(abs(scale.x - reference_scale.x), abs(scale.y - reference_scale.y),
                   abs(scale.z - reference_scale.z)) > .01:
                raise RuntimeError(f'{character_id}: {animation.get_name()} {bone_name} scale was not retained')
            if metres_to_centimetres and max(abs(corrected.translation.x), abs(corrected.translation.y),
                                              abs(corrected.translation.z)) < 10:
                raise RuntimeError(f'{character_id}: {animation.get_name()} {bone_name} translation is still in metres')
        if not ED.save_loaded_asset(animation):
            raise RuntimeError(f'{character_id}: could not save corrected {animation.get_name()}')
        u.log(f'FLOWFEST_RESTORED_ROOT_TRANSFORM {character_id} {animation.get_name()} {bone_name}')


def material_asset(character, spec, textures):
    path = spec['asset']
    material = ED.load_asset(path) if ED.does_asset_exist(path) else None
    if not material:
        name = path.rsplit('/', 1)[-1].split('.')[0]
        material = TOOLS.create_asset(name, character['folder'], u.Material, u.MaterialFactoryNew())
    if not isinstance(material, u.Material):
        raise RuntimeError(f'{character["id"]}: cannot create material {path}')
    u.MaterialEditingLibrary.delete_all_material_expressions(material)
    material.set_editor_property('used_with_skeletal_mesh', True)
    material.set_editor_property('two_sided', bool(spec['doubleSided']))
    if spec['alphaMode'] == 'BLEND':
        material.set_editor_property('blend_mode', u.BlendMode.BLEND_TRANSLUCENT)
    elif spec['alphaMode'] == 'MASK':
        material.set_editor_property('blend_mode', u.BlendMode.BLEND_MASKED)
    else:
        material.set_editor_property('blend_mode', u.BlendMode.BLEND_OPAQUE)

    def sample(index, x, y):
        if index is None:
            return None
        if index < 0 or index >= len(textures):
            raise RuntimeError(f'{character["id"]}: invalid material texture {index}')
        node = u.MaterialEditingLibrary.create_material_expression(material, u.MaterialExpressionTextureSample, x, y)
        node.set_editor_property('texture', textures[index])
        return node

    def connect(node, channel, target):
        if node:
            u.MaterialEditingLibrary.connect_material_property(node, channel, target)

    def scalar(value, x, y):
        node = u.MaterialEditingLibrary.create_material_expression(material, u.MaterialExpressionConstant, x, y)
        node.set_editor_property('r', float(value))
        return node

    def multiplied(node, channel, factor, x, y):
        if abs(float(factor) - 1.0) < 0.0001:
            return node, channel
        multiply = u.MaterialEditingLibrary.create_material_expression(material, u.MaterialExpressionMultiply, x, y)
        u.MaterialEditingLibrary.connect_material_expressions(node, channel, multiply, 'A')
        u.MaterialEditingLibrary.connect_material_expressions(scalar(factor, x - 180, y + 120), '', multiply, 'B')
        return multiply, ''

    base = sample(spec['baseColor'], -500, -300)
    normal = sample(spec['normal'], -500, 0)
    packed = sample(spec['metallicRoughness'], -500, 300)
    emissive = sample(spec['emissive'], -500, 600)
    occlusion = sample(spec['occlusion'], -500, 900)
    if base:
        color = u.MaterialEditingLibrary.create_material_expression(material, u.MaterialExpressionConstant3Vector, -700, -140)
        factors = spec['baseColorFactor']
        color.set_editor_property('constant', u.LinearColor(float(factors[0]), float(factors[1]), float(factors[2]), 1.0))
        product = u.MaterialEditingLibrary.create_material_expression(material, u.MaterialExpressionMultiply, -240, -300)
        u.MaterialEditingLibrary.connect_material_expressions(base, 'RGB', product, 'A')
        u.MaterialEditingLibrary.connect_material_expressions(color, '', product, 'B')
        connect(product, '', u.MaterialProperty.MP_BASE_COLOR)
    else:
        color = u.MaterialEditingLibrary.create_material_expression(material, u.MaterialExpressionConstant3Vector, -500, -300)
        factors = spec['baseColorFactor']
        color.set_editor_property('constant', u.LinearColor(float(factors[0]), float(factors[1]), float(factors[2]), 1.0))
        connect(color, '', u.MaterialProperty.MP_BASE_COLOR)
    connect(normal, 'RGB', u.MaterialProperty.MP_NORMAL)
    if packed:
        metal, metal_channel = multiplied(packed, 'B', spec['metallicFactor'], -220, 300)
        rough, rough_channel = multiplied(packed, 'G', spec['roughnessFactor'], -220, 500)
        connect(metal, metal_channel, u.MaterialProperty.MP_METALLIC)
        connect(rough, rough_channel, u.MaterialProperty.MP_ROUGHNESS)
    else:
        connect(scalar(spec['metallicFactor'], -500, 300), '', u.MaterialProperty.MP_METALLIC)
        connect(scalar(spec['roughnessFactor'], -500, 480), '', u.MaterialProperty.MP_ROUGHNESS)
    connect(emissive, 'RGB', u.MaterialProperty.MP_EMISSIVE_COLOR)
    connect(occlusion, 'R', u.MaterialProperty.MP_AMBIENT_OCCLUSION)
    if base and spec['alphaMode'] == 'BLEND':
        connect(base, 'A', u.MaterialProperty.MP_OPACITY)
    elif base and spec['alphaMode'] == 'MASK':
        connect(base, 'A', u.MaterialProperty.MP_OPACITY_MASK)
    u.MaterialEditingLibrary.recompile_material(material)
    if not ED.save_loaded_asset(material):
        raise RuntimeError(f'{character["id"]}: cannot save material {path}')
    return material


def bind_appearance(character, mesh):
    textures = []
    role_indices = {index for spec in character['materials'] for field in ('normal', 'metallicRoughness', 'occlusion') if (index := spec[field]) is not None}
    color_indices = {index for spec in character['materials'] for field in ('baseColor', 'emissive') if (index := spec[field]) is not None}
    for index, spec in enumerate(character['textures']):
        path = spec['asset']
        name = path.rsplit('/', 1)[-1].split('.')[0]
        texture = import_task(Path(spec['file']), character['folder'], name, None)
        if not isinstance(texture, u.Texture2D):
            raise RuntimeError(f'{character["id"]}: texture import failed {path}')
        if index in role_indices and index not in color_indices:
            texture.set_editor_property('srgb', False)
        if any(specification['normal'] == index for specification in character['materials']):
            texture.set_editor_property('compression_settings', u.TextureCompressionSettings.TC_NORMALMAP)
        ED.save_loaded_asset(texture)
        textures.append(texture)
    material_by_name = {spec['name']: material_asset(character, spec, textures) for spec in character['materials']}
    slots = list(mesh.get_editor_property('materials'))
    for slot in slots:
        name = str(slot.get_editor_property('material_slot_name'))
        material = material_by_name.get(name)
        if not material:
            raise RuntimeError(f'{character["id"]}: no source material for skeletal slot {name}')
        slot.set_editor_property('material_interface', material)
    mesh.set_editor_property('materials', slots)
    if not ED.save_loaded_asset(mesh):
        raise RuntimeError(f'{character["id"]}: cannot save material slots')
    if any(not slot.get_editor_property('material_interface') for slot in mesh.get_editor_property('materials')):
        raise RuntimeError(f'{character["id"]}: material slot remained empty')


imported_count = 0
imported_family_profiles = 0
for character in MANIFEST['characters']:
    if CAPTURE_ID and character['id'] != CAPTURE_ID:
        continue
    key, folder = character['key'], character['folder']
    if character['id'] == 'personal-metaperson':
        raise RuntimeError('Evaluation-only MetaPerson must never enter the native catalog')
    mesh = ED.load_asset(character['mesh']) if CAPTURE_ONLY or LOCOMOTION_ONLY or FAMILY_ONLY or PROFILES_ONLY else import_task(STAGED / key / f'SK_{key}.fbx', folder, f'SK_{key}', mesh_options())
    if not isinstance(mesh, u.SkeletalMesh):
        raise RuntimeError(f'{character["id"]}: imported asset is not a SkeletalMesh')
    skeleton = mesh.get_editor_property('skeleton')
    if not skeleton:
        raise RuntimeError(f'{character["id"]}: skeletal mesh has no skeleton')
    expected = character['skeleton'].split('.')[-1]
    if skeleton.get_name() != expected:
        raise RuntimeError(f'{character["id"]}: expected skeleton {expected}; imported {skeleton.get_name()}')
    reference_pose = skeleton.get_reference_pose()
    reference_roots = {}
    for bone_name in reference_pose.get_bone_names():
        reference_transform = reference_pose.get_ref_bone_pose(bone_name)
        scale = reference_transform.scale3d
        if max(scale.x, scale.y, scale.z) > 10:
            reference_roots[str(bone_name)] = reference_transform
    if len(reference_roots) != 1:
        raise RuntimeError(f'{character["id"]}: expected one metre-to-centimetre reference bone, found {list(reference_roots)}')
    if not CAPTURE_ONLY and not LOCOMOTION_ONLY and not FAMILY_ONLY and not PROFILES_ONLY:
        bind_appearance(character, mesh)
    if not CAPTURE_ONLY and not FAMILY_ONLY and not PROFILES_ONLY:
        for clip in MANIFEST['animations']:
            animation = import_task(STAGED / key / f'A_{clip}.fbx', folder, f'A_{clip}', animation_options(skeleton))
            if not isinstance(animation, u.AnimSequence):
                raise RuntimeError(f'{character["id"]}: A_{clip} is not an AnimSequence')
            if animation.get_editor_property('skeleton') != skeleton:
                raise RuntimeError(f'{character["id"]}: A_{clip} targets another skeleton')
            restore_reference_scale(animation, reference_roots, character['id'])
    if (CAPTURE_ONLY or FAMILY_ONLY) and not character.get('captures'):
        raise RuntimeError(f'{character["id"]}: no staged captures for performance import')
    family_profiles = [profile for profile in character.get('captures', {})
                       if profile.startswith('P_') and profile.endswith(('_A', '_B'))]
    if FAMILY_ONLY and not ALLOW_PARTIAL and len(family_profiles) != 82:
        raise RuntimeError(f'{character["id"]}: expected 82 staged family performances')
    if ALLOW_PARTIAL:
        family_profiles = [profile for profile in family_profiles
                           if (STAGED / key / f'A_Flow_{profile}.fbx').is_file()]
        if not family_profiles:
            raise RuntimeError(f'{character["id"]}: no converted family performances for pilot')
    expected_museum = {}
    if PROFILES_ONLY:
        for item in PERFORMANCE_MANIFEST['performances']:
            profile = 'M_' + ''.join(c if c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_' else '_'
                                    for c in str(item['sequenceId']))
            if item['profile'] != profile or profile in expected_museum or not item['sequence']['steps']:
                raise RuntimeError(f'Invalid Museum profile {item.get("profile")}')
            durations = [step.get('duration', 1) for step in item['sequence']['steps']]
            if any(isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0 for value in durations):
                raise RuntimeError(f'Invalid Museum step duration {profile}')
            duration = sum(durations)
            if not isinstance(duration, (int, float)) or duration <= 0 or abs(duration * 30 - round(duration * 30)) > 1e-6:
                raise RuntimeError(f'Invalid Museum duration {profile}')
            expected_museum[profile] = float(duration)
        if set(character.get('captures', {})) != set(expected_museum):
            raise RuntimeError('Museum staged captures disagree with performance manifest')
    for profile in (() if LOCOMOTION_ONLY else (expected_museum if PROFILES_ONLY else family_profiles if FAMILY_ONLY else character.get('captures', {}))):
        if FAMILY_ONLY and not (profile.startswith('P_') and profile.endswith(('_A', '_B'))):
            continue
        name = 'Ride' if profile == 'Ride' else f'Flow_{profile}'
        body_file = Path(character['captures'][profile])
        fbx_file = STAGED / key / f'A_{name}.fbx'
        if profile != 'Ride':
            performance_contract('validate-body', body=body_file, character=character['id'], profile=profile)
            performance_contract('validate-fbx', body=body_file, fbx=fbx_file, converter=HERE / 'convert-characters.py')
        # A new receipt is evidence of this import, never of an asset left over
        # from an earlier capture. Performance imports always replace the clip.
        animation = import_task(fbx_file, folder, f'A_{name}', animation_options(skeleton), force=profile != 'Ride')
        if not isinstance(animation, u.AnimSequence) or animation.get_editor_property('skeleton') != skeleton:
            raise RuntimeError(f'{character["id"]}: captured A_{name} is missing or targets another skeleton')
        expected_seconds = expected_museum[profile] if PROFILES_ONLY else 1.0 if profile == 'Ride' else 16.0
        if abs(animation.get_play_length() - expected_seconds) > .05:
            raise RuntimeError(f'{character["id"]}: A_{name} duration {animation.get_play_length():.3f}s, expected {expected_seconds:.3f}s')
        restore_reference_scale(animation, reference_roots, character['id'])
        if profile != 'Ride':
            if not ED.save_loaded_asset(animation):
                raise RuntimeError(f'Could not persist performance {character["id"]}/{profile}')
            asset_file = PROJECT / 'Content' / folder.removeprefix('/Game/') / f'A_{name}.uasset'
            performance_contract('record-import', body=body_file, fbx=fbx_file,
                                 asset=asset_file, importer=Path(__file__),
                                 character=character['id'], profile=profile,
                                 converter=HERE / 'convert-characters.py')
        if FAMILY_ONLY:
            imported_family_profiles += 1
    if not PROFILES_ONLY:
        ED.save_loaded_asset(mesh)
        ED.save_loaded_asset(skeleton)
    imported_count += 1
    u.log(f'FLOWFEST_CHARACTER_IMPORTED {character["id"]} {mesh.get_path_name()} {skeleton.get_path_name()}')

if CAPTURE_ID and imported_count != 1 or not CAPTURE_ID and imported_count != (1 if PROFILES_ONLY else 16):
    raise RuntimeError(f'Character import count mismatch: {imported_count}')
u.log(f'FLOWFEST_CHARACTERS_IMPORTED {imported_count}')
if FAMILY_ONLY:
    u.log(f'FLOWFEST_FAMILY_PROFILES_IMPORTED {imported_family_profiles}')
