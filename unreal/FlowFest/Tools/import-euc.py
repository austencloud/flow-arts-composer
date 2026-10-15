"""Import the source EUC meshes and restore their source PBR materials."""
import json
from pathlib import Path
import unreal as u

PROJECT = Path(u.Paths.project_dir()).resolve()
STAGED = PROJECT / 'Tools/staged/EUC'
FOLDER = '/Game/FlowFest/EUC'
ED = u.EditorAssetLibrary
ME = u.MaterialEditingLibrary
TOOLS = u.AssetToolsHelpers.get_asset_tools()
u.SystemLibrary.execute_console_command(None, 'Interchange.FeatureFlags.Import.FBX 0')
materials = {}
for name, values in json.loads((STAGED / 'materials.json').read_text()).items():
    mat = ED.load_asset(f'{FOLDER}/{name}') if ED.does_asset_exist(f'{FOLDER}/{name}') else TOOLS.create_asset(name, FOLDER, u.Material, u.MaterialFactoryNew())
    ME.delete_all_material_expressions(mat)
    color = ME.create_material_expression(mat, u.MaterialExpressionConstant3Vector)
    color.constant = u.LinearColor(*values['color'])
    ME.connect_material_property(color, '', u.MaterialProperty.MP_BASE_COLOR)
    for key, prop in [('roughness', u.MaterialProperty.MP_ROUGHNESS), ('metallic', u.MaterialProperty.MP_METALLIC)]:
        node = ME.create_material_expression(mat, u.MaterialExpressionConstant)
        node.r = values[key]
        ME.connect_material_property(node, '', prop)
    if values['emission']:
        glow = ME.create_material_expression(mat, u.MaterialExpressionConstant3Vector)
        glow.constant = u.LinearColor(*(c * values['emission'] for c in values['color']))
        ME.connect_material_property(glow, '', u.MaterialProperty.MP_EMISSIVE_COLOR)
    ME.recompile_material(mat)
    ED.save_loaded_asset(mat)
    materials[name] = mat
for name in ['SM_EUC_Body', 'SM_EUC_Wheel']:
    task = u.AssetImportTask()
    task.filename = str(STAGED / (name + '.fbx'))
    task.destination_path = FOLDER
    task.destination_name = name
    task.automated = True
    task.replace_existing = True
    task.save = True
    options = u.FbxImportUI()
    options.automated_import_should_detect_type = False
    options.mesh_type_to_import = u.FBXImportType.FBXIT_STATIC_MESH
    options.import_materials = False
    options.import_textures = False
    options.static_mesh_import_data.combine_meshes = True
    options.static_mesh_import_data.auto_generate_collision = False
    options.static_mesh_import_data.generate_lightmap_u_vs = False
    task.options = options
    TOOLS.import_asset_tasks([task])
    mesh = ED.load_asset(f'{FOLDER}/{name}')
    if not isinstance(mesh, u.StaticMesh):
        raise RuntimeError(f'Missing {name}')
    for i, slot in enumerate(mesh.static_materials):
        source_name = str(slot.material_slot_name)
        if source_name not in materials:
            raise RuntimeError(f'Unknown EUC material: {source_name}')
        mesh.set_material(i, materials[source_name])
    ED.save_loaded_asset(mesh)
u.log('FLOWFEST_EUC_IMPORT_OK: two native meshes with source materials')
