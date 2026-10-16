"""Unreal Editor Python: import all catalog variants and validate native meshes."""
import json
import re
from pathlib import Path
import unreal as u

PROJECT = Path(u.Paths.project_dir()).resolve()
CATALOG = json.loads((PROJECT/'Content/Data/props.json').read_text())
STAGED = PROJECT/'Tools/staged/Props'
ASSETS = u.AssetToolsHelpers.get_asset_tools()
ED = u.EditorAssetLibrary
u.SystemLibrary.execute_console_command(None, 'Interchange.FeatureFlags.Import.FBX 0')
report = {'imported': [], 'bounds': {}, 'errors': []}

def ensure_led_material():
    path = '/Game/FlowFest/Props/M_PropLED'
    material = ED.load_asset(path) if ED.does_asset_exist(path) else ASSETS.create_asset(
        'M_PropLED', '/Game/FlowFest/Props', u.Material, u.MaterialFactoryNew())
    if not material: raise RuntimeError(f'Could not create {path}')
    edit = u.MaterialEditingLibrary
    edit.delete_all_material_expressions(material)
    material.set_editor_property('material_domain', u.MaterialDomain.MD_SURFACE)
    material.set_editor_property('shading_model', u.MaterialShadingModel.MSM_UNLIT)
    color = edit.create_material_expression(material, u.MaterialExpressionConstant3Vector, -200, 0)
    color.set_editor_property('constant', u.LinearColor(.05, 1.8, 6.0))
    if not edit.connect_material_property(color, '', u.MaterialProperty.MP_EMISSIVE_COLOR):
        raise RuntimeError('Could not connect LED emissive material')
    edit.recompile_material(material)
    if not ED.save_loaded_asset(material): raise RuntimeError(f'Could not save {path}')

ensure_led_material()

def linear_color(hex_color):
    values = [int(hex_color[index:index+2], 16) / 255 for index in (1, 3, 5)]
    rgb = [value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4 for value in values]
    return u.LinearColor(*rgb, 1)

def finish_fan_mesh(mesh, name, variant, right):
    build = variant.get('fanBuild')
    if build not in ('fire', 'lotus', 'day', 'moon'): return
    hand = '#ef4444' if right else '#3b82f6'
    colors = {
        'TKA_Fan_Day_Frame': '#f0f1f4' if variant.get('fanFrameColor') == 'white' else '#11141a',
        'TKA_Fan_Cover_Solid_Recolor': hand,
        'TKA_Fan_Moon_Frame': hand,
    }
    targets = {'day': ['TKA_Fan_Day_Frame'], 'moon': ['TKA_Fan_Moon_Frame'],
               'fire': [], 'lotus': []}[build][:]
    if variant.get('fanCover') == 'covered' and build in ('fire', 'day'):
        targets.append('TKA_Fan_Cover_Solid_Recolor')
    found = set()
    for slot in range(mesh.get_num_sections(0)):
        original = mesh.get_material(slot)
        if not original: continue
        source_name = original.get_name()
        target = next((key for key in targets if source_name.startswith(key)), None)
        # The original reimport mapped the right-hand cover to a shared red
        # material. The selected GLB cover is the second material slot.
        if not target and 'TKA_Fan_Cover_Solid_Recolor' in targets and slot == 1 and source_name == 'Hand_Recolor_Red':
            target = 'TKA_Fan_Cover_Solid_Recolor'
        if not target: continue
        asset_name = re.sub(r'[^A-Za-z0-9_]', '_', f'M_FanFinish_{name}_{slot}')
        path = f'/Game/FlowFest/Props/{asset_name}'
        if not ED.does_asset_exist(path):
            if not ED.duplicate_asset(original.get_path_name(), path):
                raise RuntimeError(f'Could not duplicate fan material: {path}')
        material = ED.load_asset(path)
        expression = u.MaterialEditingLibrary.get_material_property_input_node(material, u.MaterialProperty.MP_BASE_COLOR)
        if not expression: raise RuntimeError(f'Fan material has no base color: {path}')
        kind = expression.get_class().get_name()
        field = 'default_value' if kind == 'MaterialExpressionVectorParameter' else 'constant' if kind == 'MaterialExpressionConstant3Vector' else None
        if not field: raise RuntimeError(f'Unexpected fan color expression {kind}: {path}')
        expression.set_editor_property(field, linear_color(colors[target]))
        u.MaterialEditingLibrary.recompile_material(material)
        if not ED.save_loaded_asset(material): raise RuntimeError(f'Could not save fan material: {path}')
        mesh.set_material(slot, material)
        found.add(target)
    if found != set(targets): raise RuntimeError(f'{name}: fan finish materials missing {set(targets)-found}')

def import_mesh(name, variant=None, right=False):
    path = STAGED/f'{name}.fbx'
    if not path.exists(): raise FileNotFoundError(path)
    task = u.AssetImportTask()
    task.filename = str(path)
    task.destination_path = '/Game/FlowFest/Props'
    task.destination_name = name
    task.automated = True
    task.replace_existing = True
    task.save = True
    options = u.FbxImportUI()
    options.import_mesh = True
    options.import_as_skeletal = False
    options.mesh_type_to_import = u.FBXImportType.FBXIT_STATIC_MESH
    options.automated_import_should_detect_type = False
    options.import_materials = True
    options.import_textures = True
    options.static_mesh_import_data.combine_meshes = True
    options.static_mesh_import_data.generate_lightmap_u_vs = False
    options.static_mesh_import_data.auto_generate_collision = False
    task.options = options
    ASSETS.import_asset_tasks([task])
    asset_path = f'/Game/FlowFest/Props/{name}.{name}'
    mesh = ED.load_asset(asset_path)
    if not isinstance(mesh,u.StaticMesh): raise RuntimeError(f'Import failed: {asset_path}')
    if variant is not None: finish_fan_mesh(mesh, name, variant, right)
    extent = mesh.get_bounds().box_extent
    if max(extent.x,extent.y,extent.z) < 1: raise RuntimeError(f'Implausibly small mesh: {asset_path}')
    ED.save_loaded_asset(mesh)
    report['imported'].append(asset_path)
    report['bounds'][name] = [round(extent.x,2),round(extent.y,2),round(extent.z,2)]

for prop in CATALOG['props']:
    for variant in prop['variants']:
        for field in ('mesh','rightMesh'):
            path=variant.get(field)
            if not path: continue
            name=path.rsplit('/',1)[-1].split('.')[0]
            try: import_mesh(name, variant if prop['id'] in ('fan','bigfan') else None, field == 'rightMesh')
            except Exception as exc:
                report['errors'].append(f'{name}: {exc}')

ED.save_directory('/Game/FlowFest/Props',only_if_is_dirty=True,recursive=True)
(PROJECT/'Saved').mkdir(exist_ok=True)
(PROJECT/'Saved/import-props-report.json').write_text(json.dumps(report,indent=2))
if report['errors']: raise RuntimeError('Prop import failed: '+ '; '.join(report['errors']))
u.log(f"FLOWFEST_PROPS_IMPORTED {len(report['imported'])}")
