"""Unreal Editor Python: import all catalog variants and validate native meshes."""
import json
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

def import_mesh(name):
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
            try: import_mesh(name)
            except Exception as exc:
                report['errors'].append(f'{name}: {exc}')

ED.save_directory('/Game/FlowFest/Props',only_if_is_dirty=True,recursive=True)
(PROJECT/'Saved').mkdir(exist_ok=True)
(PROJECT/'Saved/import-props-report.json').write_text(json.dumps(report,indent=2))
if report['errors']: raise RuntimeError('Prop import failed: '+ '; '.join(report['errors']))
u.log(f"FLOWFEST_PROPS_IMPORTED {len(report['imported'])}")
