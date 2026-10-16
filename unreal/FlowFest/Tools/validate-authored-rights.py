"""Blender geometry gate for staged authored prop left/right FBX exports.

Checks actual exported vertex positions. The right hand must retain the same
model as the left, except for the explicitly mirrored buugeng chirality and
the separately authored stick-right model.
"""
import bpy
import json
import math
from pathlib import Path
from mathutils import Matrix
from mathutils.kdtree import KDTree

STAGED = Path(__file__).resolve().parent / 'staged' / 'Props'
CATALOG = json.loads((STAGED / 'catalog.json').read_text())
AUTHORED = {
    'buugeng', 'bigbuugeng', 'chicken', 'bigchicken', 'guitar',
    'ukulele', 'sword', 'sickles', 'trigeng', 'doublestar',
    'bigdoublestar', 'doublecontactball', 'bigdoublecontactball',
    'capsule_baton', 'fire_double_staff', 'stick', 'pen',
    'fan', 'bigfan',
}

def positions(path):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.fbx(filepath=str(path))
    result = []
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue
        result.extend(tuple(round(v, 3) for v in obj.matrix_world @ vertex.co)
                      for vertex in obj.data.vertices)
    if not result:
        raise AssertionError(f'Empty FBX: {path}')
    return set(result)

def mirrored(points, axis):
    return {tuple(-v if index == axis else v for index, v in enumerate(point))
            for point in points}

def close_matches(expected, actual):
    tree = KDTree(len(actual))
    for index, point in enumerate(actual):
        tree.insert(point, index)
    tree.balance()
    return sum(tree.find(point)[2] <= .002 for point in expected)

def source_positions(prop, source_override=None):
    source = source_override or prop['source']
    if not source.startswith('/models/props/'):
        return None
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(STAGED / Path(source).name))
    orientation = Matrix.Rotation(-math.pi / 2, 4, 'X')
    if prop['id'] == 'chicken':
        offset = .3810001 * prop['scale'] - .059 * .52
        orientation = Matrix.Translation((0, offset, 0)) @ Matrix.Rotation(math.pi, 4, 'X') @ orientation
    result = set()
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue
        world = orientation @ Matrix.Scale(prop['scale'], 4) @ obj.matrix_world
        result.update(tuple(round(v, 3) for v in world @ vertex.co)
                      for vertex in obj.data.vertices)
    return result

checks = 0
source_checks = 0
for prop in CATALOG['props']:
    if prop['id'] not in AUTHORED:
        continue
    for variant in prop['variants']:
        key = f"{prop['id']}_{variant['id']}".replace('-', '_')
        left = positions(STAGED / f'{key}.fbx')
        right = positions(STAGED / f'{key}_right.fbx')
        if prop['id'] == 'stick':
            # Both have their own authored GLB; their geometry deliberately differs.
            if len(right) < 100 or len(left) < 100:
                raise AssertionError(f'{key}: stick mesh lost its authored detail')
        elif prop['id'] in ('buugeng', 'bigbuugeng') and variant['leftFlipped'] != variant['rightFlipped']:
            overlaps = [len(right & mirrored(left, axis)) for axis in range(3)]
            if max(overlaps) != len(right) or len(right) != len(left):
                raise AssertionError(f'{key}: mirrored pair geometry mismatch {len(left)} {len(right)} {overlaps}')
        elif right != left:
            raise AssertionError(f'{key}: right-hand FBX geometry differs from left-hand source model')
        checks += 1

    # First variant is the unflipped authored source for each model family.
    if (expected := source_positions(prop)) is not None:
        first = prop['variants'][0]
        key = f"{prop['id']}_{first['id']}".replace('-', '_')
        actual = positions(STAGED / f'{key}.fbx')
        overlap = close_matches(expected, actual)
        # FBX may split or weld vertex seams; compare each authored point to
        # the nearest FBX vertex within 2 mm, including asymmetry and cutouts.
        if overlap / len(expected) < .999:
            raise AssertionError(f'{key}: FBX differs from staged authored GLB ({overlap}/{len(expected)} matched)')
        source_checks += 1
    if prop['id'] == 'stick':
        expected = source_positions(prop, '/models/props/stick-right.glb')
        actual = positions(STAGED / 'stick_default_right.fbx')
        overlap = close_matches(expected, actual)
        if overlap / len(expected) < .999:
            raise AssertionError(f'stick-right: FBX differs from dedicated authored GLB ({overlap}/{len(expected)} matched)')
        source_checks += 1

print(f'FLOWFEST_AUTHORED_RIGHT_GEOMETRY_OK {checks} left/right FBX pairs, {source_checks} GLB source matches')
