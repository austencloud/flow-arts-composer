"""Blender 5 background conversion: deployed glTF rigs and per-rig Mixamo motion to FBX.

Run after prepare-characters.mjs. Pass --id x-bot for one rig. Exported animation
FBXs contain the same normalized armature as their matching skeletal mesh FBX.
"""
import argparse
import json
import hashlib
import math
import re
import os
import subprocess
import sys
from pathlib import Path

import bpy
from mathutils import Quaternion, Vector

HERE = Path(__file__).resolve().parent
BUNDLE_TOOL = HERE.parent.parent / 'Shared' / 'Tools' / 'performance-bundle.mjs'


def performance_contract(command, **paths):
    subprocess.run([os.environ.get('TKA_NODE', 'node'), str(BUNDLE_TOOL), command,
                    *[str(item) for key, value in paths.items() for item in (f'--{key}', value)]],
                   check=True)


parser = argparse.ArgumentParser()
parser.add_argument('--project', type=Path, help='Unreal project containing Tools/staged/Characters')
parser.add_argument('--staged', type=Path, help='Explicit staged Characters directory')
parser.add_argument('--profiles-only', action='store_true', help='Convert only manifest-listed custom performances')
parser.add_argument('--id', action='append', help='Only convert these character IDs')
parser.add_argument('--family-only', action='store_true', help='Convert only staged P_<family>_A/B captures')
parser.add_argument('--turns-only', action='store_true', help='Convert only TurnLeft/TurnRight on existing rigs')
parser.add_argument('--allow-partial', action='store_true', help='Pilot only: convert available family captures for explicit --id')
parser.add_argument('--force', action='store_true', help='Re-export assets even when FBX is current')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
STAGED = (args.staged or (args.project / 'Tools' / 'staged' / 'Characters' if args.project else HERE / 'staged' / 'Characters')).resolve()
MANIFEST = json.loads((STAGED / 'imports.json').read_text(encoding='utf-8'))
if args.allow_partial and (not args.family_only or not args.id):
    raise RuntimeError('--allow-partial requires --family-only and explicit --id')
if args.profiles_only and args.family_only:
    raise RuntimeError('--profiles-only cannot combine with --family-only')
if args.turns_only and (args.profiles_only or args.family_only or args.allow_partial):
    raise RuntimeError('--turns-only cannot combine with profile or family conversion')
if args.turns_only and set(MANIFEST['animations']) & {'TurnLeft', 'TurnRight'} != {'TurnLeft', 'TurnRight'}:
    raise RuntimeError('--turns-only requires prepared TurnLeft/TurnRight manifest entries')
if args.profiles_only and (len(MANIFEST['characters']) != 1 or MANIFEST['characters'][0]['id'] != 'x-bot' or
                           not MANIFEST['characters'][0].get('captures') or
                           any(not name.startswith('M_') for name in MANIFEST['characters'][0]['captures'])):
    raise RuntimeError('--profiles-only requires staged x-bot Museum captures')
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
    decoded = STAGED / f'{character["key"]}.glb'
    if not decoded.is_file():
        raise RuntimeError(f'Missing staged decoded rig: {decoded}')
    objects = import_glb(decoded)
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
    if not args.family_only and not args.profiles_only and not args.turns_only and not is_current(mesh_file, decoded):
        export_fbx(mesh_file, armature, meshes, False)
    return armature, meshes


def file_sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def retarget_clip(character, target, clip_name, source_path, captured=False, turn=False):
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
    source_start, end = map(int, source.animation_data.action.frame_range)
    start = 0 if turn else source_start
    if turn and source_start != 1:
        raise RuntimeError(f'{source_path}: expected source turn keys to begin at frame 1, got {source_start}')
    if end <= start or end - start > (3600 if captured else 600):
        raise RuntimeError(f'{source_path}: unreasonable animation range {start}-{end}')
    source_hip_bone = source_bones['Hips'].bone
    target_hip_bone = target.pose.bones['Hips'].bone
    source_rest = source.matrix_world @ source_hip_bone.matrix_local
    target_rest = target.matrix_world @ target_hip_bone.matrix_local
    target_height = max(.1, target_rest.translation.z)
    source_height = max(.1, source_rest.translation.z)
    source_to_world = source_rest.to_3x3()
    world_to_target = target_rest.to_3x3().inverted()
    support_bones = {side: f'{side.title()}ToeBase' if f'{side.title()}ToeBase' in target.pose.bones
                     else f'{side.title()}Foot' for side in ('left', 'right')}
    turn_samples = []
    source_hip_rotations = []
    for frame in range(start, end + 1):
        # UE's FBX importer preserves the source duration but evaluates only
        # keys through end - 1. Repeat the authored final pose on both end - 1
        # and end so the native clip actually reaches its measured heading.
        scene.frame_set(end if turn and frame >= end - 1 else frame)
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
                    motion = world_motion if turn else Vector((0.0, 0.0, world_motion.z))
                    bone.location = world_to_target @ (motion * (target_height / source_height))
                else:
                    bone.location = (0.0, 0.0, 0.0)
            else:
                bone.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
                bone.location = (0.0, 0.0, 0.0)
            bone.keyframe_insert(data_path='rotation_quaternion', frame=frame, group=bone.name)
            if captured or bone.name == 'Hips':
                bone.keyframe_insert(data_path='location', frame=frame, group=bone.name)
        if turn:
            bpy.context.view_layer.update()
            source_hip_rotations.append((source.matrix_world @ source_bones['Hips'].matrix).to_quaternion())
            transforms = {name: target.matrix_world @ target.pose.bones[name].matrix
                          for name in dict.fromkeys(('Hips', 'LeftFoot', 'RightFoot', *support_bones.values()))}
            positions = {name: list(matrix.translation) for name, matrix in transforms.items()}
            rotations = {name: list(matrix.to_quaternion()) for name, matrix in transforms.items()}
            turn_samples.append({'frame': frame, 'seconds': frame / 30, 'positionsM': positions,
                                 'rotationsWxyz': rotations,
                                 'hipsLocalRotation': list(target.pose.bones['Hips'].rotation_quaternion)})
    scene.frame_set(start)
    # FBX exports the current action only; frame span and pose are explicit.
    scene.frame_start, scene.frame_end = start, end
    destination = STAGED / character['key'] / f'A_{clip_name}.fbx'
    export_fbx(destination, target, [], True)
    if turn:
        turn_info = character['turns'][clip_name]
        if len(turn_samples) != turn_info['frameCount'] or abs(end / 30 - turn_info['durationSeconds']) > 1e-4:
            raise RuntimeError(f'{character["id"]}/{clip_name}: converted turn timing disagrees with source')
        source_angle = math.degrees(source_hip_rotations[0].rotation_difference(source_hip_rotations[-1]).angle)
        target_start_q = Quaternion(turn_samples[0]['rotationsWxyz']['Hips'])
        target_end_q = Quaternion(turn_samples[-1]['rotationsWxyz']['Hips'])
        target_angle = math.degrees(target_start_q.rotation_difference(target_end_q).angle)
        if abs(source_angle - target_angle) > .05:
            raise RuntimeError(f'{character["id"]}/{clip_name}: retarget changed hip turn angle '
                               f'{source_angle:.3f} -> {target_angle:.3f} degrees')
        supports = {}
        for side in ('left', 'right'):
            weights = turn_info[f'{side}Foot']
            bone = support_bones[side]
            windows = []
            begin = None
            for index, weight in enumerate([*weights, 0.0]):
                if weight >= .5 and begin is None:
                    begin = index
                elif weight < .5 and begin is not None:
                    end_index = index - 1
                    points = [Vector(turn_samples[i]['positionsM'][bone]) for i in range(begin, index)]
                    anchor = points[0]
                    windows.append({'supportBone': bone, 'startFrame': begin, 'endFrame': end_index,
                                    'startSeconds': begin / 30, 'endSeconds': end_index / 30,
                                    'supportStartM': list(anchor), 'supportEndM': list(points[-1]),
                                    'maxSupportHorizontalDriftM': max(((point - anchor).xy.length for point in points), default=0)})
                    begin = None
            supports[side] = windows
        decoded = STAGED / f'{character["key"]}.glb'
        receipt = {'schema': 'flowfest-native-turn-retarget-v1', 'characterId': character['id'],
                   'clip': clip_name, 'source': turn_info, 'sourceSha256': file_sha256(source_path),
                   'decodedRigSha256': file_sha256(decoded), 'fbxSha256': file_sha256(destination),
                   'converterSha256': file_sha256(Path(__file__)), 'durationSeconds': end / 30,
                   'frameCount': len(turn_samples), 'supportBones': support_bones, 'supportWindows': supports,
                   'sourceWorldHipDeltaAngleDegrees': source_angle,
                   'retargetWorldHipDeltaAngleDegrees': target_angle,
                   'nativeEndpointHeldFromFrame': end - 1,
                   'neutralStart': turn_samples[0], 'neutralEnd': turn_samples[-1]}
        (STAGED / character['key'] / f'A_{clip_name}.turn.json').write_text(
            json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
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
    if args.family_only and not args.allow_partial and len([profile for profile in character.get('captures', {})
                                 if profile.startswith('P_') and profile.endswith(('_A', '_B'))]) != 82:
        raise RuntimeError(f'{character["id"]}: expected 82 staged family captures')
    if args.allow_partial and not any(profile.startswith('P_') and profile.endswith(('_A', '_B'))
                                     for profile in character.get('captures', {})):
        raise RuntimeError(f'{character["id"]}: no staged family captures for pilot')
    target, meshes = prepare_rig(character)
    decoded = STAGED / f'{character["key"]}.glb'
    if not args.family_only and not args.profiles_only:
        for clip_name, filename in MANIFEST['animations'].items():
            turn = clip_name in ('TurnLeft', 'TurnRight')
            if args.turns_only and not turn:
                continue
            source_path = Path(MANIFEST['animationSource']) / filename
            output = STAGED / character['key'] / f'A_{clip_name}.fbx'
            receipt = STAGED / character['key'] / f'A_{clip_name}.turn.json'
            if is_current(output, source_path, decoded) and (not turn or
                    receipt.is_file() and receipt.stat().st_mtime_ns >= output.stat().st_mtime_ns):
                continue
            retarget_clip(character, target, clip_name, source_path, turn=turn)
    for profile in (() if args.turns_only else character.get('captures', {})):
        if args.profiles_only and not profile.startswith('M_'):
            continue
        if args.family_only and not (profile.startswith('P_') and profile.endswith(('_A', '_B'))):
            continue
        name = 'Ride' if profile == 'Ride' else f'Flow_{profile}'
        source_path = STAGED / character['key'] / f'capture_{profile}.glb'
        if not source_path.is_file():
            raise RuntimeError(f'Missing staged capture: {source_path}')
        output = STAGED / character['key'] / f'A_{name}.fbx'
        if profile != 'Ride':
            performance_contract('validate-body', **{'body': source_path, 'character': character['id'],
                                 'profile': profile, 'decoded-rig': decoded})
        if is_current(output, source_path, decoded):
            if profile == 'Ride':
                continue
            # A recent timestamp cannot establish which capture made an FBX.
            # Rebuild old or invalid receipts instead of certifying an old file.
            try:
                performance_contract('validate-fbx', body=source_path, fbx=output, converter=Path(__file__))
                continue
            except subprocess.CalledProcessError:
                pass
        retarget_clip(character, target, name, source_path, captured=True)
        if profile != 'Ride':
            performance_contract('record-fbx', body=source_path, fbx=output, converter=Path(__file__))
    print(f'FLOWFEST_CHARACTER {character["id"]} {len(meshes)} mesh parts')

if args.id and set(args.id) - {c['id'] for c in MANIFEST['characters']}:
    raise RuntimeError(f'Unknown character ID: {set(args.id) - {c["id"] for c in MANIFEST["characters"]}}')
print('FLOWFEST_CHARACTERS_CONVERTED')
