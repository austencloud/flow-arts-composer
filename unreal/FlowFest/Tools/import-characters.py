"""Unreal 5.8 editor Python: import every deployed rig and its own motion clips.

Run after prepare-characters.mjs and convert-characters.py. Existing assets are
left untouched by default; pass --force to replace imports from staged FBX.
"""
import json
import os
import sys
from pathlib import Path

import unreal as u

PROJECT = Path(u.Paths.project_dir()).resolve()
STAGED = PROJECT / 'Tools' / 'staged' / 'Characters'
MANIFEST = json.loads((STAGED / 'imports.json').read_text(encoding='utf-8'))
CATALOG = json.loads((PROJECT / 'Content' / 'Data' / 'characters.json').read_text(encoding='utf-8'))
FORCE = '--force' in sys.argv or os.environ.get('FLOWFEST_FORCE') == '1'
CAPTURE_ONLY = os.environ.get('FLOWFEST_CAPTURE_ONLY') == '1'
LOCOMOTION_ONLY = os.environ.get('FLOWFEST_LOCOMOTION_ONLY') == '1'
CAPTURE_ID = os.environ.get('FLOWFEST_CAPTURE_ID')
if CAPTURE_ONLY and LOCOMOTION_ONLY:
    raise RuntimeError('Choose capture-only or locomotion-only import')
TOOLS = u.AssetToolsHelpers.get_asset_tools()
ED = u.EditorAssetLibrary
u.SystemLibrary.execute_console_command(None, 'Interchange.FeatureFlags.Import.FBX 0')

if len(MANIFEST['characters']) != 16 or len(CATALOG['characters']) != 16:
    raise RuntimeError('Character catalog must contain exactly 16 deployed rigs')
if [x['id'] for x in MANIFEST['characters']] != [x['id'] for x in CATALOG['characters']]:
    raise RuntimeError('Staged and packaged character catalogs disagree')


def import_task(filename, folder, name, options):
    if not filename.is_file() or filename.stat().st_size < 1024:
        raise RuntimeError(f'Missing staged character asset: {filename}')
    path = f'{folder}/{name}'
    if ED.does_asset_exist(path) and not FORCE:
        asset = ED.load_asset(path)
        if not asset:
            raise RuntimeError(f'Cannot load existing asset {path}')
        return asset
    task = u.AssetImportTask()
    task.filename = str(filename)
    task.destination_path = folder
    task.destination_name = name
    task.automated = True
    task.replace_existing = FORCE
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
for character in MANIFEST['characters']:
    if CAPTURE_ID and character['id'] != CAPTURE_ID:
        continue
    key, folder = character['key'], character['folder']
    if character['id'] == 'personal-metaperson':
        raise RuntimeError('Evaluation-only MetaPerson must never enter the native catalog')
    mesh = ED.load_asset(character['mesh']) if CAPTURE_ONLY or LOCOMOTION_ONLY else import_task(STAGED / key / f'SK_{key}.fbx', folder, f'SK_{key}', mesh_options())
    if not isinstance(mesh, u.SkeletalMesh):
        raise RuntimeError(f'{character["id"]}: imported asset is not a SkeletalMesh')
    skeleton = mesh.get_editor_property('skeleton')
    if not skeleton:
        raise RuntimeError(f'{character["id"]}: skeletal mesh has no skeleton')
    expected = character['skeleton'].split('.')[-1]
    if skeleton.get_name() != expected:
        raise RuntimeError(f'{character["id"]}: expected skeleton {expected}; imported {skeleton.get_name()}')
    if not CAPTURE_ONLY and not LOCOMOTION_ONLY:
        bind_appearance(character, mesh)
    if not CAPTURE_ONLY:
        for clip in MANIFEST['animations']:
            animation = import_task(STAGED / key / f'A_{clip}.fbx', folder, f'A_{clip}', animation_options(skeleton))
            if not isinstance(animation, u.AnimSequence):
                raise RuntimeError(f'{character["id"]}: A_{clip} is not an AnimSequence')
            if animation.get_editor_property('skeleton') != skeleton:
                raise RuntimeError(f'{character["id"]}: A_{clip} targets another skeleton')
    if CAPTURE_ONLY and not character.get('captures'):
        raise RuntimeError(f'{character["id"]}: no staged captures for capture-only import')
    for profile in (() if LOCOMOTION_ONLY else character.get('captures', {})):
        name = 'Ride' if profile == 'Ride' else f'Flow_{profile}'
        animation = import_task(STAGED / key / f'A_{name}.fbx', folder, f'A_{name}', animation_options(skeleton))
        if not isinstance(animation, u.AnimSequence) or animation.get_editor_property('skeleton') != skeleton:
            raise RuntimeError(f'{character["id"]}: captured A_{name} is missing or targets another skeleton')
        expected_seconds = 1.0 if profile == 'Ride' else 16.0
        if abs(animation.get_play_length() - expected_seconds) > .05:
            raise RuntimeError(f'{character["id"]}: A_{name} duration {animation.get_play_length():.3f}s, expected {expected_seconds:.3f}s')
    ED.save_loaded_asset(mesh)
    ED.save_loaded_asset(skeleton)
    imported_count += 1
    u.log(f'FLOWFEST_CHARACTER_IMPORTED {character["id"]} {mesh.get_path_name()} {skeleton.get_path_name()}')

if CAPTURE_ID and imported_count != 1 or not CAPTURE_ID and imported_count != 16:
    raise RuntimeError(f'Character import count mismatch: {imported_count}')
u.log(f'FLOWFEST_CHARACTERS_IMPORTED {imported_count}')
