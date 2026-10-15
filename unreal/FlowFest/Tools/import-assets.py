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
    # These three small source meshes may change during site art passes. Reimport
    # them on every run so an existing project never keeps an older silhouette.
    if not ED.does_asset_exist(target) or folder == '/Game/FlowFest/Assets/Ecology':
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
                if job_wind_family(folder):
                    # All three source GLB materials declare doubleSided=true and
                    # alphaMode=OPAQUE. FBX drops the sidedness flag; preserve it
                    # without inventing alpha masking absent from the source.
                    material.set_editor_property('two_sided', True)
                    material.set_editor_property('shading_model', u.MaterialShadingModel.MSM_TWO_SIDED_FOLIAGE)
                if folder.endswith('/Trees/' + name):
                    material.set_editor_property('two_sided', True)
                    # Blender's FBX exporter drops glTF alphaMode. Restore leaf coverage explicitly.
                    if material.get_name().endswith('_leaves'):
                        material.set_editor_property('blend_mode', u.BlendMode.BLEND_MASKED)
                        material.set_editor_property('opacity_mask_clip_value', .42)
                        material.set_editor_property('shading_model', u.MaterialShadingModel.MSM_TWO_SIDED_FOLIAGE)
                        # A previous pass may have wrapped base color in the
                        # per-instance tint multiply. Keep the coverage and
                        # subsurface links already authored on that material.
                        opacity = ME.get_material_property_input_node(material, u.MaterialProperty.MP_OPACITY_MASK)
                        subsurface = ME.get_material_property_input_node(material, u.MaterialProperty.MP_SUBSURFACE_COLOR)
                        if not opacity or not subsurface:
                            leaf = ME.get_material_property_input_node(material, u.MaterialProperty.MP_BASE_COLOR)
                            if not isinstance(leaf, u.MaterialExpressionTextureSample):
                                raise RuntimeError('Leaf color texture missing from unfinished material ' + material.get_path_name())
                            if not opacity:
                                connect_property(leaf, 'A', u.MaterialProperty.MP_OPACITY_MASK)
                            if not subsurface:
                                connect_property(leaf, 'RGB', u.MaterialProperty.MP_SUBSURFACE_COLOR)
                ensure_instancing(material)
                if ((folder.startswith('/Game/FlowFest/Assets/Trees/') and material.get_name().endswith('_leaves')) or job_wind_family(folder)) and not ME.get_material_property_input_node(material, u.MaterialProperty.MP_WORLD_POSITION_OFFSET):
                    add_foliage_wind(material, folder.startswith('/Game/FlowFest/Assets/Trees/'))
                if job_wind_family(folder):
                    # The ecology source is opaque, two-sided foliage. Give its
                    # back face colored transmission from the same (possibly
                    # instance-tinted) base color instead of leaving it black.
                    if not ME.get_material_property_input_node(material, u.MaterialProperty.MP_SUBSURFACE_COLOR):
                        color = ME.get_material_property_input_node(material, u.MaterialProperty.MP_BASE_COLOR)
                        if not color:
                            raise RuntimeError('Ecology base color missing: ' + material.get_path_name())
                        transmission = expression(material, u.MaterialExpressionMultiply)
                        tint = expression(material, u.MaterialExpressionConstant3Vector,
                                          constant=u.LinearColor(.42, .52, .34, 1))
                        connect(color, '', transmission, 'A')
                        connect(tint, '', transmission, 'B')
                        connect_property(transmission, '', u.MaterialProperty.MP_SUBSURFACE_COLOR)
                    if not ME.get_material_property_input_node(material, u.MaterialProperty.MP_SUBSURFACE_COLOR):
                        raise RuntimeError('Ecology subsurface color missing: ' + material.get_path_name())
                ME.recompile_material(material)
                ED.save_loaded_asset(material)
            elif isinstance(material, u.MaterialInstanceConstant):
                if job_wind_family(folder):
                    raise RuntimeError('Ecology wind/sidedness needs an editable material: ' + material.get_path_name())
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

def job_wind_family(folder):
    return folder == '/Game/FlowFest/Assets/Ecology'

def add_foliage_wind(material, tree):
    """Small height-weighted WPO motion, so stems stay planted in the soil."""
    base = ME.get_material_property_input_node(material, u.MaterialProperty.MP_BASE_COLOR)
    if base:
        random = expression(material, u.MaterialExpressionPerInstanceRandom)
        dark = expression(material, u.MaterialExpressionConstant3Vector,
                          constant=u.LinearColor(.82, .9, .76, 1))
        light = expression(material, u.MaterialExpressionConstant3Vector,
                           constant=u.LinearColor(1.1, 1.06, .87, 1))
        variation = expression(material, u.MaterialExpressionLinearInterpolate)
        varied_color = expression(material, u.MaterialExpressionMultiply)
        connect(dark, '', variation, 'A'); connect(light, '', variation, 'B')
        connect(random, '', variation, 'Alpha')
        connect(base, '', varied_color, 'A'); connect(variation, '', varied_color, 'B')
        connect_property(varied_color, '', u.MaterialProperty.MP_BASE_COLOR)
    time = expression(material, u.MaterialExpressionTime)
    world = expression(material, u.MaterialExpressionWorldPosition)
    object_pos = expression(material, u.MaterialExpressionObjectPositionWS)
    # UE's mask defaults vary across engine versions. Explicitly clear the
    # unused channels so the wind chain stays scalar under the SM6 compiler.
    x = expression(material, u.MaterialExpressionComponentMask,
                   r=True, g=False, b=False, a=False)
    height_delta = expression(material, u.MaterialExpressionSubtract)
    height = expression(material, u.MaterialExpressionComponentMask,
                        r=False, g=False, b=True, a=False)
    phase = expression(material, u.MaterialExpressionAdd)
    speed = expression(material, u.MaterialExpressionMultiply)
    wavelength = expression(material, u.MaterialExpressionMultiply)
    sine = expression(material, u.MaterialExpressionSine)
    weight = expression(material, u.MaterialExpressionDivide)
    wave = expression(material, u.MaterialExpressionMultiply)
    strength = expression(material, u.MaterialExpressionScalarParameter,
                          parameter_name='WindStrength', default_value=.38)
    controlled = expression(material, u.MaterialExpressionMultiply)
    direction = expression(material, u.MaterialExpressionConstant3Vector,
                           constant=u.LinearColor(9 if tree else 3, 4 if tree else 1.5, 0, 1))
    offset = expression(material, u.MaterialExpressionMultiply)
    connect(time, '', speed, 'A'); connect(scalar(material, .68 if tree else 1.8), '', speed, 'B')
    connect(world, '', x, '')
    connect(x, '', wavelength, 'A'); connect(scalar(material, .002), '', wavelength, 'B')
    connect(speed, '', phase, 'A'); connect(wavelength, '', phase, 'B')
    connect(phase, '', sine, '')
    connect(world, '', height_delta, 'A'); connect(object_pos, '', height_delta, 'B')
    connect(height_delta, '', height, '')
    connect(height, '', weight, 'A'); connect(scalar(material, 650 if tree else 65), '', weight, 'B')
    connect(sine, '', wave, 'A'); connect(weight, '', wave, 'B')
    connect(wave, '', controlled, 'A'); connect(strength, '', controlled, 'B')
    connect(direction, '', offset, 'A'); connect(controlled, '', offset, 'B')
    connect_property(offset, '', u.MaterialProperty.MP_WORLD_POSITION_OFFSET)

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
        mask = expression(m, u.MaterialExpressionComponentMask,
                          r=True, g=True, b=False, a=False)
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
            # Surveyed imagery establishes the field/woodland structure; detail is
            # a close-range modulation, not a replacement photograph.
            blend = expression(m, u.MaterialExpressionLinearInterpolate, const_alpha=.27)
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
    if name == 'M_Dirt' and (STAGED / 'GroundDetail.png').exists():
        detail_tex = import_file(STAGED / 'GroundDetail.png', '/Game/FlowFest/Textures', 'GroundDetail')
        detail = expression(m, u.MaterialExpressionTextureSample, texture=detail_tex)
        earth = expression(m, u.MaterialExpressionMultiply)
        base = ME.get_material_property_input_node(m, u.MaterialProperty.MP_BASE_COLOR)
        connect(base, '', earth, 'A')
        connect(detail, 'RGB', earth, 'B')
        connect_property(earth, '', u.MaterialProperty.MP_BASE_COLOR)
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
