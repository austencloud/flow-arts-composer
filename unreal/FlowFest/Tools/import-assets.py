"""Unreal 5.8 editor Python: import reproducible assets, create materials and save the map."""
import unreal as u
import json
from pathlib import Path

PROJECT = Path(u.Paths.project_dir()).resolve()
STAGED = PROJECT / 'Tools' / 'staged'
TOOLS = u.AssetToolsHelpers.get_asset_tools()
ED = u.EditorAssetLibrary
ME = u.MaterialEditingLibrary
u.SystemLibrary.execute_console_command(None, 'Interchange.FeatureFlags.Import.FBX 0')
report = {'meshes': [], 'materials': [], 'errors': []}

def import_file(path, folder, name, mesh=False):
    target = folder + '/' + name
    if not ED.does_asset_exist(target):
        task = u.AssetImportTask()
        task.filename = str(path)
        task.destination_path = folder
        task.destination_name = name
        task.automated = True
        task.replace_existing = True
        task.save = True
        if mesh:
            options = u.FbxImportUI()
            options.import_mesh = True
            options.import_as_skeletal = False
            options.mesh_type_to_import = u.FBXImportType.FBXIT_STATIC_MESH
            options.automated_import_should_detect_type = False
            options.import_materials = True
            options.import_textures = True
            options.static_mesh_import_data.combine_meshes = True
            options.static_mesh_import_data.generate_lightmap_u_vs = False
            options.static_mesh_import_data.auto_generate_collision = name == 'SM_Car'
            task.options = options
        TOOLS.import_asset_tasks([task])
    asset = ED.load_asset(target)
    if not asset:
        raise RuntimeError('Could not load imported asset ' + target)
    if mesh:
        report['meshes'].append(target)
        bounds = asset.get_bounds()
        u.log('FLOWFEST_BOUNDS ' + name + ' ' + str(bounds.box_extent))
        for slot in asset.static_materials:
            material = slot.material_interface
            if isinstance(material, u.Material):
                if folder.endswith('/Trees/' + name):
                    material.set_editor_property('two_sided', True)
                    # Blender's FBX exporter drops glTF alphaMode. Restore leaf coverage explicitly.
                    if material.get_name().endswith('_leaves'):
                        material.set_editor_property('blend_mode', u.BlendMode.BLEND_MASKED)
                        material.set_editor_property('opacity_mask_clip_value', .42)
                        material.set_editor_property('shading_model', u.MaterialShadingModel.MSM_TWO_SIDED_FOLIAGE)
                        leaf = ME.get_material_property_input_node(material, u.MaterialProperty.MP_BASE_COLOR)
                        if not isinstance(leaf, u.MaterialExpressionTextureSample):
                            raise RuntimeError('Expected leaf color texture on ' + material.get_path_name())
                        connect_property(leaf, 'A', u.MaterialProperty.MP_OPACITY_MASK)
                        connect_property(leaf, 'RGB', u.MaterialProperty.MP_SUBSURFACE_COLOR)
                ensure_instancing(material)
                ME.recompile_material(material)
                ED.save_loaded_asset(material)
            elif isinstance(material, u.MaterialInstanceConstant):
                usage = u.MaterialUsage.MATUSAGE_INSTANCED_STATIC_MESHES
                ME.set_material_usage_override(material, usage, True, True)
                if not ME.has_material_usage(material, usage):
                    raise RuntimeError(f'Instancing usage was not enabled on {material.get_path_name()}')
                ED.save_loaded_asset(material)
    ED.save_loaded_asset(asset)
    return asset

def expression(material, cls, **props):
    e = ME.create_material_expression(material, cls)
    for key, value in props.items():
        e.set_editor_property(key, value)
    return e

def scalar(material, value):
    return expression(material, u.MaterialExpressionConstant, r=value)

def connect(source, output, target, input_name):
    if not ME.connect_material_expressions(source, output, target, input_name):
        raise RuntimeError(f'Failed material connection {source.get_name()}[{output}] -> {target.get_name()}[{input_name}]')

def connect_property(source, output, prop):
    if not ME.connect_material_property(source, output, prop):
        raise RuntimeError(f'Failed material property connection {source.get_name()}[{output}] -> {prop}')

def ensure_instancing(material):
    usage = u.MaterialUsage.MATUSAGE_INSTANCED_STATIC_MESHES
    if not ME.has_material_usage(material, usage):
        ME.set_base_material_usage(material, usage, True)
    if not ME.has_material_usage(material, usage):
        raise RuntimeError(f'Instancing usage was not enabled on {material.get_path_name()}')

def material(name, color, roughness=.8, metallic=0, emissive=0):
    path = '/Game/FlowFest/Materials/' + name
    m = ED.load_asset(path) if ED.does_asset_exist(path) else TOOLS.create_asset(name, '/Game/FlowFest/Materials', u.Material, u.MaterialFactoryNew())
    ME.delete_all_material_expressions(m)
    c = expression(m, u.MaterialExpressionConstant3Vector, constant=u.LinearColor(*color, 1))
    connect_property(c, '', u.MaterialProperty.MP_BASE_COLOR)
    connect_property(scalar(m, roughness), '', u.MaterialProperty.MP_ROUGHNESS)
    connect_property(scalar(m, metallic), '', u.MaterialProperty.MP_METALLIC)
    if emissive:
        multiply = expression(m, u.MaterialExpressionMultiply)
        connect(c, '', multiply, 'A')
        connect(scalar(m, emissive), '', multiply, 'B')
        connect_property(multiply, '', u.MaterialProperty.MP_EMISSIVE_COLOR)
    ensure_instancing(m)
    report['materials'].append(path)
    return m

for job in json.loads((STAGED / 'imports.json').read_text()):
    folder = '/Game/FlowFest/Assets/' + job['kind']
    if job['kind'] == 'Trees': folder += '/' + job['id']
    import_file(STAGED / (job['id'] + '.fbx'), folder, job['id'], True)
for name in ['Tent', 'DomeTent', 'Canopy', 'Gatehouse', 'Firepit', 'Bench', 'Signpost']:
    import_file(STAGED / (name + '.fbx'), '/Game/FlowFest/Assets/Set', name, True)

palette = {
    'M_Ground': ((.12,.17,.055),.95,0,0), 'M_Dirt': ((.19,.13,.07),.96,0,0),
    'M_Asphalt': ((.055,.06,.055),.92,0,0), 'M_Wood': ((.21,.095,.035),.85,0,0),
    'M_Canvas': ((.43,.25,.10),.92,0,0), 'M_Metal': ((.18,.22,.23),.38,.8,0),
    'M_Ember': ((1,.17,.012),.7,0,9), 'M_Grass': ((.10,.18,.035),.96,0,0),
}
for name, args in palette.items():
    m = material(name, *args)
    if name == 'M_Ground' and (STAGED / 'TerrainOrtho.png').exists():
        tex = import_file(STAGED / 'TerrainOrtho.png', '/Game/FlowFest/Textures', 'TerrainOrtho')
        world = expression(m, u.MaterialExpressionWorldPosition)
        mask = expression(m, u.MaterialExpressionComponentMask, r=True, g=True)
        divide = expression(m, u.MaterialExpressionDivide)
        add = expression(m, u.MaterialExpressionAdd)
        sample = expression(m, u.MaterialExpressionTextureSample, texture=tex)
        connect(world, '', mask, '')  # UE 5.8 shortens this pin name; empty selects input 0.
        connect(mask, '', divide, 'A')
        connect(scalar(m, 102400), '', divide, 'B')
        connect(divide, '', add, 'A')
        connect(scalar(m, .5), '', add, 'B')
        connect(add, '', sample, 'UVs')
        connect_property(sample, 'RGB', u.MaterialProperty.MP_BASE_COLOR)
        if (STAGED / 'GroundDetail.png').exists():
            detail_tex = import_file(STAGED / 'GroundDetail.png', '/Game/FlowFest/Textures', 'GroundDetail')
            detail = expression(m, u.MaterialExpressionTextureSample, texture=detail_tex)
            blend = expression(m, u.MaterialExpressionLinearInterpolate, const_alpha=.68)
            connect(sample, 'RGB', blend, 'A')
            connect(detail, 'RGB', blend, 'B')
            connect_property(blend, '', u.MaterialProperty.MP_BASE_COLOR)
        if (STAGED / 'GroundNormal.png').exists():
            normal_tex = import_file(STAGED / 'GroundNormal.png', '/Game/FlowFest/Textures', 'GroundNormal')
            normal_tex.set_editor_property('compression_settings', u.TextureCompressionSettings.TC_NORMALMAP)
            normal_tex.set_editor_property('srgb', False)
            ED.save_loaded_asset(normal_tex)
            normal = expression(m, u.MaterialExpressionTextureSample, texture=normal_tex, sampler_type=u.MaterialSamplerType.SAMPLERTYPE_NORMAL)
            connect_property(normal, 'RGB', u.MaterialProperty.MP_NORMAL)
    ME.layout_material_expressions(m)
    ME.recompile_material(m)
    ED.save_loaded_asset(m)

map_path = '/Game/FlowFest/Maps/Festival'
if not ED.does_asset_exist(map_path):
    level = u.get_editor_subsystem(u.LevelEditorSubsystem)
    level.new_level(map_path)
    level.save_current_level()
ED.save_directory('/Game/FlowFest', only_if_is_dirty=True, recursive=True)
(PROJECT / 'Saved').mkdir(exist_ok=True)
(PROJECT / 'Saved' / 'import-report.json').write_text(json.dumps(report, indent=2))
u.log('FLOWFEST_IMPORT_COMPLETE')
