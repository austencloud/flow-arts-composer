"""Repair two right-hand FBX material bindings after Unreal import.

The right meshes keep the authored section geometry and source slot names, but
some imports bind their sections to unrelated Stick materials. The left meshes
provide the intended non-recolor materials; the right shaft stays red.

Run directly with Unreal's PythonScript commandlet to repair an existing
project, or call repair_right_prop_materials after import-props.py finishes.
"""

import json
import re
from pathlib import Path

import unreal as u


FOLDER = '/Game/FlowFest/Props'
RED_MATERIAL = f'{FOLDER}/Hand_Recolor_Red'
TARGET_SLOTS = {
    'capsule_baton': {
        'names': ('TKA_Baton_Shaft_Recolor', 'TKA_Baton_Tube', 'TKA_Baton_Cap'),
        'sizes': (620, 274, 1496),
    },
    'fire_double_staff': {
        'names': ('TKA_FireStaff_Tube_Recolor', 'TKA_FireStaff_ThumbBand',
                  'TKA_FireStaff_Wick'),
        'sizes': (3100, 196, 18600),
    },
}
MISBOUND_SECTIONS = {1: 'TKA_Stick_Heartwood', 2: 'TKA_Stick_Bark'}


def source_slot_name(slot):
    # Blender suffixes duplicate glTF material names on later exports.
    imported = str(slot.get_editor_property('imported_material_slot_name'))
    return re.sub(r'_\d{3}$', '', imported)


def section_sizes(mesh):
    sizes = []
    for index in range(mesh.get_num_sections(0)):
        vertices, *_ = u.ProceduralMeshLibrary.get_section_from_static_mesh(
            mesh, 0, index)
        sizes.append(len(vertices))
    return sizes


def repair_pair(prop_id, variant):
    expected = TARGET_SLOTS[prop_id]['names']
    expected_sizes = TARGET_SLOTS[prop_id]['sizes']
    left_path = variant['mesh']
    right_path = variant['rightMesh']
    left = u.EditorAssetLibrary.load_asset(left_path)
    right = u.EditorAssetLibrary.load_asset(right_path)
    if not isinstance(left, u.StaticMesh) or not isinstance(right, u.StaticMesh):
        raise RuntimeError(f'{prop_id}: left or right static mesh is missing')

    left_sizes = section_sizes(left)
    right_sizes = section_sizes(right)
    if tuple(left_sizes) != expected_sizes or tuple(right_sizes) != expected_sizes:
        raise RuntimeError(
            f'{prop_id}: unexpected left/right section sizes: {left_sizes} / {right_sizes}')

    editor = u.get_default_object(u.StaticMeshEditorSubsystem)
    left_slots = list(left.get_editor_property('static_materials'))
    right_slots = list(right.get_editor_property('static_materials'))
    if len(right_slots) not in (3, 4):
        raise RuntimeError(f'{prop_id}: unexpected right material slot count {len(right_slots)}')
    left_indices = [editor.get_lod_material_slot(left, 0, section) for section in range(3)]
    right_indices = [editor.get_lod_material_slot(right, 0, section) for section in range(3)]
    if (len(set(left_indices)) != 3 or len(set(right_indices)) != 3
            or any(index < 0 or index >= len(left_slots) for index in left_indices)
            or any(index < 0 or index >= len(right_slots) for index in right_indices)):
        raise RuntimeError(f'{prop_id}: unexpected section-to-slot maps {left_indices} / {right_indices}')

    for section, (left_index, right_index) in enumerate(zip(left_indices, right_indices)):
        left_name = source_slot_name(left_slots[left_index])
        right_name = source_slot_name(right_slots[right_index])
        expected_right = 'Hand_Recolor_Red' if section == 0 else expected[section]
        if left_name != expected[section] or right_name != expected_right:
            raise RuntimeError(
                f'{prop_id}: unexpected section {section} source slots '
                f'{left_name} / {right_name}')
    unused_indices = set(range(len(right_slots))) - set(right_indices)
    if any(source_slot_name(right_slots[index]) != 'TKA_Stick_Bud'
           for index in unused_indices):
        raise RuntimeError(f'{prop_id}: unexpected unused right slots {unused_indices}')

    red = u.EditorAssetLibrary.load_asset(RED_MATERIAL)
    if not isinstance(red, u.MaterialInterface):
        raise RuntimeError(f'{prop_id}: red hand material is missing: {RED_MATERIAL}')
    materials = [red]
    for index, name in enumerate(expected[1:], start=1):
        material = left.get_material(left_indices[index])
        if not material or not material.get_name().startswith(name):
            raise RuntimeError(
                f'{prop_id}: left section {index} has unexpected material '
                f'{material.get_name() if material else None}')
        materials.append(material)

    for section, material in enumerate(materials):
        current = right.get_material(right_indices[section])
        current_name = current.get_name() if current else None
        permitted = ('Hand_Recolor_Red',) if section == 0 else (
            expected[section], MISBOUND_SECTIONS[section])
        if not current_name or not any(
                current_name == name or re.fullmatch(rf'{re.escape(name)}_\d{{3}}', current_name)
                for name in permitted):
            raise RuntimeError(
                f'{prop_id}: unexpected right section {section} material {current_name}')

    for section, material in enumerate(materials):
        right.set_material(right_indices[section], material)
    if any(right.get_material(right_indices[section]).get_path_name() != material.get_path_name()
           for section, material in enumerate(materials)):
        raise RuntimeError(f'{prop_id}: right material binding did not persist')
    if not u.EditorAssetLibrary.save_loaded_asset(right):
        raise RuntimeError(f'{prop_id}: could not save repaired right mesh')
    u.log(f'FLOWFEST_RIGHT_PROP_MATERIALS_REPAIRED {right_path}')


def repair_right_prop_materials(catalog):
    targets = [prop for prop in catalog['props'] if prop['id'] in TARGET_SLOTS]
    if {prop['id'] for prop in targets} != set(TARGET_SLOTS) or len(targets) != len(TARGET_SLOTS):
        raise RuntimeError('expected one catalog entry for each right material repair target')
    for prop in targets:
        variants = [variant for variant in prop['variants']
                    if variant['id'] == 'default']
        if len(variants) != 1:
            raise RuntimeError(f"{prop['id']}: expected one default variant")
        repair_pair(prop['id'], variants[0])


if __name__ == '__main__':
    project = Path(u.Paths.project_dir()).resolve()
    catalog = json.loads((project / 'Content/Data/props.json').read_text())
    repair_right_prop_materials(catalog)
