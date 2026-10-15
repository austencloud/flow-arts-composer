"""Blender 5 background conversion: deployed glTF rigs and per-rig Mixamo motion to FBX.

Run after prepare-characters.mjs. Pass --id x-bot for one rig. Exported animation
FBXs contain the same normalized armature as their matching skeletal mesh FBX.
"""
import argparse
import json
import re
import sys
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
STAGED = HERE / 'staged' / 'Characters'
MANIFEST = json.loads((STAGED / 'imports.json').read_text(encoding='utf-8'))

parser = argparse.ArgumentParser()
parser.add_argument('--id', action='append', help='Only convert these character IDs')
parser.add_argument('--family-only', action='store_true', help='Convert only staged P_<family>_A/B captures')
parser.add_argument('--force', action='store_true', help='Re-export assets even when FBX is current')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
bpy.context.scene.render.fps = 30


def is_current(output, *inputs):
    if args.force or not output.exists():
        return False
    return output.stat().st_mtime_ns >= max(path.stat().st_mtime_ns for path in (*inputs, Path(__file__)))


def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for action in list(bpy.data.actions):
        if action.users == 0:
            bpy.data.actions.remove(action)
    bpy.data.orphans_purge(do_recursive=True)


def normalize(name):
    return re.sub(r'^mixamorig\d*:?', '', name)


def select_objects(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def import_glb(path):
    previous = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    return set(bpy.data.objects) - previous


def export_fbx(path, armature, meshes, animation):
    path.parent.mkdir(parents=True, exist_ok=True)
    select_objects([armature, *meshes])
    bpy.ops.export_scene.fbx(
        filepath=str(path), use_selection=True, object_types={'ARMATURE', 'MESH'},
        apply_unit_scale=True, axis_forward='-Y', axis_up='Z', add_leaf_bones=False,
        armature_nodetype='NULL', path_mode='COPY', embed_textures=True,
        bake_anim=animation, bake_anim_use_all_bones=True,
        bake_anim_use_nla_strips=False, bake_anim_use_all_actions=False,
        bake_anim_step=1.0, bake_anim_simplify_factor=0.0,
    )
    if not path.exists() or path.stat().st_size < 1024:
        raise RuntimeError(f'FBX export failed: {path}')


def armature_of(objects, label):
    armatures = [obj for obj in objects if obj.type == 'ARMATURE']
    if len(armatures) != 1:
        raise RuntimeError(f'{label}: expected one armature, found {len(armatures)}')
    return armatures[0]


def normalize_bones(armature, expected):
    renamed = {}
    for bone in armature.data.bones:
        previous = bone.name
        desired = normalize(previous)
        if desired in renamed.values():
            raise RuntimeError(f'Bone name collision on {desired}')
        bone.name = desired
        renamed[previous] = desired
    actual = set(armature.data.bones.keys())
    missing = set(expected) - actual
    if missing:
        raise RuntimeError(f'{armature.name}: missing normalized source bones: {sorted(missing)}')
    return renamed


def prepare_rig(character):
    clear_scene()
    objects = import_glb(character['decoded'])
    armature = armature_of(objects, character['id'])
    meshes = [obj for obj in objects if obj.type == 'MESH']
    if not meshes or not any(any(mod.type == 'ARMATURE' for mod in mesh.modifiers) for mesh in meshes):
        raise RuntimeError(f'{character["id"]}: no skinned meshes')
    normalize_bones(armature, character['bones']['boneMap'].values())
    # Source GLBs use metres. Their lowest rest foot becomes the component's zero.
    feet = [armature.data.bones[name] for name in ('LeftFoot', 'RightFoot')]
    floor = min((armature.matrix_world @ foot.matrix_local).translation.z for foot in feet)
    roots = [obj for obj in objects if obj.parent is None]
    for root in roots:
        root.location.z -= floor
    armature.animation_data_clear()
    mesh_file = STAGED / character['key'] / f'SK_{character["key"]}.fbx'
    if not args.family_only and not is_current(mesh_file, Path(character['decoded'])):
        export_fbx(mesh_file, armature, meshes, False)
    return armature, meshes


def retarget_clip(character, target, clip_name, source_path, captured=False):
    imported = import_glb(source_path)
    source = armature_of(imported, source_path.name)
    if not source.animation_data or not source.animation_data.action:
        raise RuntimeError(f'{source_path}: missing animation action')
    source_bones = {normalize(bone.name): bone for bone in source.pose.bones}
    # Fingers absent from the source stay in each character's own bind pose.
    if not {'Hips', 'LeftFoot', 'RightFoot', 'LeftHand', 'RightHand'} <= source_bones.keys():
        raise RuntimeError(f'{source_path}: motion lacks essential Mixamo joints')
    target.animation_data_create()
    action = bpy.data.actions.new(f'{character["key"]}_{clip_name}')
    target.animation_data.action = action
    scene = bpy.context.scene
    scene.render.fps = 30
    start, end = map(int, source.animation_data.action.frame_range)
    if end <= start or end - start > 600:
        raise RuntimeError(f'{source_path}: unreasonable animation range {start}-{end}')
    source_hip_bone = source_bones['Hips'].bone
    target_hip_bone = target.pose.bones['Hips'].bone
    source_rest = source.matrix_world @ source_hip_bone.matrix_local
    target_rest = target.matrix_world @ target_hip_bone.matrix_local
    target_height = max(.1, target_rest.translation.z)
    source_height = max(.1, source_rest.translation.z)
    source_to_world = source_rest.to_3x3()
    world_to_target = target_rest.to_3x3().inverted()
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        for bone in target.pose.bones:
            source_bone = source_bones.get(bone.name)
            bone.rotation_mode = 'QUATERNION'
            if source_bone:
                bone.rotation_quaternion = source_bone.rotation_quaternion.copy()
                if captured:
                    # Production capture includes shoulder/arm/hand and pedal IK translations.
                    # It was sampled from this exact source rig, so retain its full local pose.
                    bone.location = source_bone.location.copy()
                elif bone.name == 'Hips':
                    # Mixamo hip translation is in bone space (its local Z is
                    # forward). Strip root travel in world space and retain
                    # only the vertical bob/jump in the target bone's basis.
                    world_motion = source_to_world @ source_bone.location
                    vertical = world_motion.z * target_height / source_height
                    bone.location = world_to_target @ Vector((0.0, 0.0, vertical))
                else:
                    bone.location = (0.0, 0.0, 0.0)
            else:
                bone.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
                bone.location = (0.0, 0.0, 0.0)
            bone.keyframe_insert(data_path='rotation_quaternion', frame=frame, group=bone.name)
            if captured or bone.name == 'Hips':
                bone.keyframe_insert(data_path='location', frame=frame, group=bone.name)
    scene.frame_set(start)
    # FBX exports the current action only; frame span and pose are explicit.
    scene.frame_start, scene.frame_end = start, end
    destination = STAGED / character['key'] / f'A_{clip_name}.fbx'
    export_fbx(destination, target, [], True)
    target.animation_data.action = None
    bpy.data.actions.remove(action)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in imported:
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.orphans_purge(do_recursive=True)
    print(f'FLOWFEST_ANIMATION {character["id"]} {clip_name} {end - start + 1} frames')


for character in MANIFEST['characters']:
    if args.id and character['id'] not in args.id:
        continue
    if args.family_only and len([profile for profile in character.get('captures', {})
                                 if profile.startswith('P_') and profile.endswith(('_A', '_B'))]) != 82:
        raise RuntimeError(f'{character["id"]}: expected 82 staged family captures')
    target, meshes = prepare_rig(character)
    if not args.family_only:
        for clip_name, filename in MANIFEST['animations'].items():
            source_path = Path(MANIFEST['animationSource']) / filename
            output = STAGED / character['key'] / f'A_{clip_name}.fbx'
            if is_current(output, source_path, Path(character['decoded'])):
                continue
            retarget_clip(character, target, clip_name, source_path)
    for profile, path in character.get('captures', {}).items():
        if args.family_only and not (profile.startswith('P_') and profile.endswith(('_A', '_B'))):
            continue
        name = 'Ride' if profile == 'Ride' else f'Flow_{profile}'
        source_path = Path(path)
        output = STAGED / character['key'] / f'A_{name}.fbx'
        if is_current(output, source_path, Path(character['decoded'])):
            continue
        retarget_clip(character, target, name, source_path, captured=True)
    print(f'FLOWFEST_CHARACTER {character["id"]} {len(meshes)} mesh parts')

if args.id and set(args.id) - {c['id'] for c in MANIFEST['characters']}:
    raise RuntimeError(f'Unknown character ID: {set(args.id) - {c["id"] for c in MANIFEST["characters"]}}')
print('FLOWFEST_CHARACTERS_CONVERTED')
