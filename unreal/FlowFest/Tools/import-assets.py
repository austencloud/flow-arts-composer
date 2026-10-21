"""Unreal 5.8 editor Python: import reproducible assets, create materials and save the map."""
import unreal as u
import json
import re
import sys
from pathlib import Path

PROJECT = Path(u.Paths.project_dir()).resolve()
STAGED = PROJECT / 'Tools' / 'staged'
TOOLS = u.AssetToolsHelpers.get_asset_tools()
ED = u.EditorAssetLibrary
ME = u.MaterialEditingLibrary
u.SystemLibrary.execute_console_command(None, 'Interchange.FeatureFlags.Import.FBX 0')
report = {'meshes': [], 'materials': [], 'errors': []}
# `--only=Car` imports just the jobs whose kind starts with that prefix and leaves
# set pieces, palette materials and ground textures alone. `--only=Set/` instead
# replaces the set pieces, which an ordinary run imports only when missing.
ONLY = next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--only=')), None)
SET_ONLY = ONLY is not None and ONLY.startswith('Set/')

MEADOW = '/Game/FlowFest/Assets/Meadow'

def import_file(path, folder, name, mesh=False):
    target = folder + '/' + name
    # These three small source meshes may change during site art passes. Reimport
    # them on every run so an existing project never keeps an older silhouette.
    if (not ED.does_asset_exist(target)
            or folder in ('/Game/FlowFest/Assets/Ecology', '/Game/FlowFest/Textures/Ecology', MEADOW)
            or (folder == '/Game/FlowFest/Textures' and name in (
                'TerrainOrtho', 'GroundFamilyMask', 'GroundDetail', 'GroundMeadow',
                'GroundLitter', 'GroundDamp', 'GroundNormal', 'GroundRoughness'))):
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
            options.static_mesh_import_data.build_nanite = folder == MEADOW
            options.static_mesh_import_data.auto_generate_collision = (
                name == 'SM_Car' or folder.startswith('/Game/FlowFest/Assets/Car/'))
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
                    author_ecology_material(material, name)
                    # All three source GLB materials declare doubleSided=true and
                    # alphaMode=OPAQUE. FBX drops the sidedness flag; preserve it
                    # without inventing alpha masking absent from the source.
                    material.set_editor_property('two_sided', True)
                    material.set_editor_property('shading_model', u.MaterialShadingModel.MSM_TWO_SIDED_FOLIAGE)
                ensure_instancing(material)
                if job_wind_family(folder) and not ME.get_material_property_input_node(material, u.MaterialProperty.MP_WORLD_POSITION_OFFSET):
                    add_foliage_wind(material, False)
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

def author_ecology_material(material, asset_name):
    """Bind decoded source textures; FBX's embedded ecology samplers have no Texture2D."""
    base_path = STAGED / (asset_name + '_BaseColor.png')
    if not base_path.is_file():
        raise RuntimeError('Ecology source base color missing: ' + str(base_path))
    # FBX reimport retains stale sample nodes and WPO on an existing material.
    # Reauthoring all three small materials prevents graph accumulation and
    # guarantees each TextureSample has an assigned imported source texture.
    # UE 5.8's DeleteAllMaterialExpressions iterates GetExpressions while each
    # DeleteMaterialExpression removes from that same array, skipping entries.
    # Delete a snapshot instead so repeated FBX imports cannot leave empty
    # TextureSamples connected to the newly authored ecology graph.
    for old in list(ME.get_material_expressions(material)):
        ME.delete_material_expression(material, old)
    if ME.get_material_expressions(material):
        raise RuntimeError('Ecology material graph did not clear: ' + material.get_path_name())
    folder = '/Game/FlowFest/Textures/Ecology'
    base = import_file(base_path, folder, asset_name + '_BaseColor')
    color = expression(material, u.MaterialExpressionTextureSample, texture=base)
    connect_property(color, 'RGB', u.MaterialProperty.MP_BASE_COLOR)
    normal_path = STAGED / (asset_name + '_Normal.png')
    if normal_path.is_file():
        normal = import_file(normal_path, folder, asset_name + '_Normal')
        normal.set_editor_property('compression_settings', u.TextureCompressionSettings.TC_NORMALMAP)
        normal.set_editor_property('srgb', False)
        ED.save_loaded_asset(normal)
        sample = expression(material, u.MaterialExpressionTextureSample,
                            texture=normal, sampler_type=u.MaterialSamplerType.SAMPLERTYPE_NORMAL)
        connect_property(sample, 'RGB', u.MaterialProperty.MP_NORMAL)
    mr_path = STAGED / (asset_name + '_MetallicRoughness.png')
    if mr_path.is_file():
        mr = import_file(mr_path, folder, asset_name + '_MetallicRoughness')
        mr.set_editor_property('compression_settings', u.TextureCompressionSettings.TC_MASKS)
        mr.set_editor_property('srgb', False)
        ED.save_loaded_asset(mr)
        sample = expression(material, u.MaterialExpressionTextureSample,
                            texture=mr, sampler_type=u.MaterialSamplerType.SAMPLERTYPE_MASKS)
        green = expression(material, u.MaterialExpressionComponentMask,
                           r=False, g=True, b=False, a=False)
        connect(sample, 'RGB', green, '')
        connect_property(green, '', u.MaterialProperty.MP_ROUGHNESS)
    else:
        connect_property(scalar(material, .88), '', u.MaterialProperty.MP_ROUGHNESS)
    connect_property(scalar(material, 0), '', u.MaterialProperty.MP_METALLIC)
    for node in ME.get_material_expressions(material):
        if isinstance(node, u.MaterialExpressionTextureSample) and not node.get_editor_property('texture'):
            raise RuntimeError('Unbound ecology texture sampler: ' + material.get_path_name())

def add_foliage_wind(material, tree, grade=True):
    """Small height-weighted WPO motion, so stems stay planted in the soil."""
    base = ME.get_material_property_input_node(material, u.MaterialProperty.MP_BASE_COLOR)
    if base and grade:
        if not tree:
            # The source meadow blades are vivid in UE's midday sunlight.
            # Shift their existing painted texture toward dry olive while
            # retaining the source highlights and stem variation.
            olive = expression(material, u.MaterialExpressionConstant3Vector,
                               constant=u.LinearColor(1.0, .70, .58, 1))
            graded = expression(material, u.MaterialExpressionMultiply)
            connect(base, '', graded, 'A'); connect(olive, '', graded, 'B')
            base = graded
        random = expression(material, u.MaterialExpressionPerInstanceRandom)
        dark = expression(material, u.MaterialExpressionConstant3Vector,
                          constant=u.LinearColor(.82, .9, .76, 1))
        light = expression(material, u.MaterialExpressionConstant3Vector,
                           constant=u.LinearColor(1.02, 1.0, .82, 1))
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
    for old in list(ME.get_material_expressions(m)):
        ME.delete_material_expression(m, old)
    if ME.get_material_expressions(m):
        raise RuntimeError('Palette material graph did not clear: ' + path)
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

def paint_from_instance(material, default=u.LinearColor(.5, .5, .5, 1)):
    """Recolour a parked car's body panels per instance, as the web lot's recolor
    mode does: the panel albedo gives way to the instance's paint, and the
    normal, roughness and metal inputs stay as imported."""
    current = ME.get_material_property_input_node(material, u.MaterialProperty.MP_BASE_COLOR)
    if isinstance(current, u.MaterialExpressionPerInstanceCustomData3Vector):
        if current.get_editor_property('const_default_value') == default:
            return
        current.set_editor_property('const_default_value', default)
        ME.recompile_material(material)
        ED.save_loaded_asset(material)
        return
    paint = expression(material, u.MaterialExpressionPerInstanceCustomData3Vector,
                       data_index=0, const_default_value=default)
    connect_property(paint, '', u.MaterialProperty.MP_BASE_COLOR)
    ME.recompile_material(material)
    ED.save_loaded_asset(material)

for job in ([] if SET_ONLY else json.loads((STAGED / 'imports.json').read_text())):
    if ONLY and not job['kind'].startswith(ONLY):
        continue
    folder = '/Game/FlowFest/Assets/' + job['kind']
    mesh = import_file(STAGED / (job['id'] + '.fbx'), folder, job['id'], True)
    painted = job.get('car', {}).get('paintMaterials', [])
    found = set()
    for slot in mesh.static_materials if painted else []:
        slot_material = slot.material_interface
        # Unreal numbers repeat names across folders (Fairheaven_LT80_Bodymat_001).
        base = re.sub(r'_\d{3}$', '', slot_material.get_name()) if slot_material else None
        if base in painted:
            if not isinstance(slot_material, u.Material):
                raise RuntimeError('Car paint needs an editable material: ' + slot_material.get_path_name())
            paint_from_instance(slot_material)
            found.add(base)
    if set(painted) - found:
        raise RuntimeError(f"{job['id']}: paint materials not found: {sorted(set(painted) - found)}")
    # Save the textures the FBX brought in now, so a later failure cannot leave
    # saved materials pointing at textures that only existed in memory.
    ED.save_directory(folder, only_if_is_dirty=True, recursive=True)
    if job.get('car'):
        u.log(f"FLOWFEST_CAR {job['id']} slots={len(mesh.static_materials)} painted={sorted(found)}")
SET_PIECES = ['Tent', 'DomeTent', 'Canopy', 'CampCanopy', 'Gatehouse', 'Firepit', 'Bench', 'Signpost']
# Tent fly and canopy fabric take each instance's colour (BuildCamps); a lone piece
# shows the default: the web camp's first tent colour and a white canopy top.
SET_PAINT = {'Tent_fly_nylon': u.LinearColor(.78, .15, .07, 1), 'Canopy_fabric': u.LinearColor(.81, .79, .74, 1)}
for name in ([n for n in SET_PIECES if ('Set/' + n).startswith(ONLY)] if SET_ONLY else [] if ONLY else SET_PIECES):
    if SET_ONLY and ED.does_asset_exist('/Game/FlowFest/Assets/Set/' + name):
        ED.delete_asset('/Game/FlowFest/Assets/Set/' + name)
    mesh = import_file(STAGED / (name + '.fbx'), '/Game/FlowFest/Assets/Set', name, True)
    for slot in mesh.static_materials:
        slot_material = slot.material_interface
        if isinstance(slot_material, u.Material) and slot_material.get_name() in SET_PAINT:
            paint_from_instance(slot_material, SET_PAINT[slot_material.get_name()])
            ensure_instancing(slot_material)
    ED.save_directory('/Game/FlowFest/Assets/Set', only_if_is_dirty=True, recursive=True)
    u.log(f"FLOWFEST_SET {name} slots={[s.material_interface.get_name() for s in mesh.static_materials if s.material_interface]}")

def author_meadow_material():
    """One material for the field grass meshes. UV V runs root (0) to tip (1); each
    instance's custom data 0 is how dry the clump is and 1 its brightness, so a
    field mixes green, olive and straw clumps instead of one cloned colour."""
    m = material('M_MeadowGrass', (.2, .24, .08), .78)
    for old in list(ME.get_material_expressions(m)):
        ME.delete_material_expression(m, old)
    m.set_editor_property('two_sided', True)
    m.set_editor_property('shading_model', u.MaterialShadingModel.MSM_TWO_SIDED_FOLIAGE)
    uv = expression(m, u.MaterialExpressionTextureCoordinate)
    t = expression(m, u.MaterialExpressionComponentMask, r=False, g=True, b=False, a=False)
    connect(uv, '', t, '')

    def gradient(root, tip):
        g = expression(m, u.MaterialExpressionLinearInterpolate)
        connect(expression(m, u.MaterialExpressionConstant3Vector, constant=u.LinearColor(*root, 1)), '', g, 'A')
        connect(expression(m, u.MaterialExpressionConstant3Vector, constant=u.LinearColor(*tip, 1)), '', g, 'B')
        connect(t, '', g, 'Alpha')
        return g
    green = gradient((.06, .075, .025), (.19, .22, .075))
    straw = gradient((.14, .11, .05), (.46, .37, .18))
    dryness = expression(m, u.MaterialExpressionPerInstanceCustomData, data_index=0, const_default_value=.35)
    brightness = expression(m, u.MaterialExpressionPerInstanceCustomData, data_index=1, const_default_value=1)
    blend = expression(m, u.MaterialExpressionLinearInterpolate)
    connect(green, '', blend, 'A'); connect(straw, '', blend, 'B'); connect(dryness, '', blend, 'Alpha')
    base = expression(m, u.MaterialExpressionMultiply)
    connect(blend, '', base, 'A'); connect(brightness, '', base, 'B')
    connect_property(base, '', u.MaterialProperty.MP_BASE_COLOR)
    # Light passing through a blade picks up its colour; the roots sit in the clump's shade.
    transmission = expression(m, u.MaterialExpressionMultiply)
    connect(base, '', transmission, 'A')
    connect(expression(m, u.MaterialExpressionConstant3Vector, constant=u.LinearColor(.9, .85, .55, 1)), '', transmission, 'B')
    connect_property(transmission, '', u.MaterialProperty.MP_SUBSURFACE_COLOR)
    occlusion = expression(m, u.MaterialExpressionLinearInterpolate, const_a=.55, const_b=1)
    connect(t, '', occlusion, 'Alpha')
    connect_property(occlusion, '', u.MaterialProperty.MP_AMBIENT_OCCLUSION)
    connect_property(scalar(m, .8), '', u.MaterialProperty.MP_ROUGHNESS)
    connect_property(scalar(m, .25), '', u.MaterialProperty.MP_SPECULAR)
    # A thin blade seen from above is edge-on to a high sun and shades nearly black.
    # Light it mostly as the ground it covers: its normal leans 60 percent to world up.
    m.set_editor_property('tangent_space_normal', False)
    lit = expression(m, u.MaterialExpressionLinearInterpolate, const_alpha=.6)
    connect(expression(m, u.MaterialExpressionVertexNormalWS), '', lit, 'A')
    connect(expression(m, u.MaterialExpressionConstant3Vector, constant=u.LinearColor(0, 0, 1, 1)), '', lit, 'B')
    up = expression(m, u.MaterialExpressionNormalize)
    connect(lit, '', up, '')
    connect_property(up, '', u.MaterialProperty.MP_NORMAL)
    add_foliage_wind(m, False, grade=False)
    ensure_instancing(m)
    ME.set_base_material_usage(m, u.MaterialUsage.MATUSAGE_NANITE, True)
    # Voxelized Nanite foliage draws the default material unless the voxel usage is set.
    ME.set_base_material_usage(m, u.MaterialUsage.MATUSAGE_VOXELS, True)
    ME.layout_material_expressions(m)
    ME.recompile_material(m)
    ED.save_loaded_asset(m)
    return m

MEADOW_PIECES = ['MeadowPatch', 'StubbleTuft', 'SeedStalks']
if not ONLY or ONLY.startswith('Meadow') or SET_ONLY:
    meadow = author_meadow_material()
    for name in MEADOW_PIECES:
        mesh = import_file(STAGED / (name + '.fbx'), MEADOW, name, True)
        for slot in range(len(mesh.static_materials)):
            mesh.set_material(slot, meadow)
        nanite = mesh.get_editor_property('nanite_settings')
        nanite.set_editor_property('enabled', True)
        # Thin blades vanish under ordinary Nanite simplification; voxelizing keeps a field's mass at range.
        if hasattr(u, 'NaniteShapePreservation'):
            nanite.set_editor_property('shape_preservation', u.NaniteShapePreservation.VOXELIZE)
        # set_editor_property runs PostEditChange, which rebuilds the mesh (the subsystem is absent in commandlets).
        mesh.set_editor_property('nanite_settings', nanite)
        ED.save_loaded_asset(mesh)
        u.log(f"FLOWFEST_MEADOW {name} nanite={mesh.get_editor_property('nanite_settings').enabled}")
    ED.save_directory(MEADOW, only_if_is_dirty=True, recursive=True)

palette = {
    'M_Ground': ((.12,.17,.055),.95,0,0), 'M_Dirt': ((.19,.13,.07),.96,0,0),
    'M_Asphalt': ((.055,.06,.055),.92,0,0), 'M_Wood': ((.21,.095,.035),.85,0,0),
    'M_Canvas': ((.43,.25,.10),.92,0,0), 'M_Metal': ((.18,.22,.23),.38,.8,0),
    'M_Ember': ((1,.17,.012),.7,0,9), 'M_Grass': ((.10,.18,.035),.96,0,0),
}
if ONLY:
    palette = {}
site = json.loads((PROJECT / 'Content' / 'Data' / 'site.json').read_text())
ground_bounds = site['groundSurface']
if ground_bounds['file'] != 'ground-family-mask.rgba':
    raise RuntimeError('Unexpected registered ground-family mask contract')

def ground_uv(material, world, bounds, flip_z=False):
    """Map native X/Y centimetres to the source site's X/Z metre mask."""
    x = expression(material, u.MaterialExpressionComponentMask, r=True, g=False, b=False, a=False)
    y = expression(material, u.MaterialExpressionComponentMask, r=False, g=True, b=False, a=False)
    connect(world, '', x, '')
    connect(world, '', y, '')
    x_div = expression(material, u.MaterialExpressionDivide)
    x_add = expression(material, u.MaterialExpressionAdd)
    y_div = expression(material, u.MaterialExpressionDivide)
    y_add = expression(material, u.MaterialExpressionAdd)
    uv = expression(material, u.MaterialExpressionAppendVector)
    width_cm = (bounds['maxX'] - bounds['minX']) * 100
    height_cm = (bounds['maxZ'] - bounds['minZ']) * 100
    connect(x, '', x_div, 'A'); connect(scalar(material, width_cm), '', x_div, 'B')
    connect(x_div, '', x_add, 'A')
    connect(scalar(material, -bounds['minX'] * 100 / width_cm), '', x_add, 'B')
    connect(y, '', y_div, 'A'); connect(scalar(material, height_cm), '', y_div, 'B')
    if flip_z:
        negative_y = expression(material, u.MaterialExpressionMultiply)
        connect(y_div, '', negative_y, 'A'); connect(scalar(material, -1), '', negative_y, 'B')
        connect(negative_y, '', y_add, 'A')
        connect(scalar(material, bounds['maxZ'] * 100 / height_cm), '', y_add, 'B')
    else:
        connect(y_div, '', y_add, 'A')
        connect(scalar(material, -bounds['minZ'] * 100 / height_cm), '', y_add, 'B')
    connect(x_add, '', uv, 'A'); connect(y_add, '', uv, 'B')
    return uv

for name, args in palette.items():
    m = material(name, *args)
    if name == 'M_Ground' and (STAGED / 'TerrainOrtho.png').exists():
        tex = import_file(STAGED / 'TerrainOrtho.png', '/Game/FlowFest/Textures', 'TerrainOrtho')
        world = expression(m, u.MaterialExpressionWorldPosition)
        sample = expression(m, u.MaterialExpressionTextureSample, texture=tex)
        connect(ground_uv(m, world, ground_bounds), '', sample, 'UVs')
        connect_property(sample, 'RGB', u.MaterialProperty.MP_BASE_COLOR)
        required_ground = ('GroundFamilyMask', 'GroundDetail', 'GroundMeadow', 'GroundLitter', 'GroundDamp')
        for source_name in required_ground:
            if not (STAGED / (source_name + '.png')).is_file():
                raise RuntimeError('Missing source ground texture: ' + source_name)
        mask_tex = import_file(STAGED / 'GroundFamilyMask.png', '/Game/FlowFest/Textures', 'GroundFamilyMask')
        mask_tex.set_editor_property('compression_settings', u.TextureCompressionSettings.TC_MASKS)
        mask_tex.set_editor_property('srgb', False)
        ED.save_loaded_asset(mask_tex)
        mask_sample = expression(m, u.MaterialExpressionTextureSample,
                                 texture=mask_tex, sampler_type=u.MaterialSamplerType.SAMPLERTYPE_MASKS)
        connect(ground_uv(m, world, ground_bounds, True), '', mask_sample, 'UVs')
        # The registered RGBA mask carries packed, meadow and litter weights;
        # damp is the remaining weight. It was painted from the same roads,
        # camps and measured tree locations as the source browser scene.
        weights = []
        for channel in ('r', 'g', 'b'):
            weight = expression(m, u.MaterialExpressionComponentMask,
                                r=channel == 'r', g=channel == 'g', b=channel == 'b', a=False)
            connect(mask_sample, 'RGB', weight, '')
            weights.append(weight)
        rg = expression(m, u.MaterialExpressionAdd)
        rgb = expression(m, u.MaterialExpressionAdd)
        damp = expression(m, u.MaterialExpressionOneMinus)
        connect(weights[0], '', rg, 'A'); connect(weights[1], '', rg, 'B')
        connect(rg, '', rgb, 'A'); connect(weights[2], '', rgb, 'B')
        connect(rgb, '', damp, '')
        detail_uv = expression(m, u.MaterialExpressionDivide)
        xy = expression(m, u.MaterialExpressionComponentMask, r=True, g=True, b=False, a=False)
        connect(world, '', xy, '')
        connect(xy, '', detail_uv, 'A'); connect(scalar(m, 245), '', detail_uv, 'B')
        details = {}
        for source_name in ('GroundDetail', 'GroundMeadow', 'GroundLitter', 'GroundDamp'):
            detail_tex = import_file(STAGED / (source_name + '.png'), '/Game/FlowFest/Textures', source_name)
            details[source_name] = expression(m, u.MaterialExpressionTextureSample, texture=detail_tex)
            connect(detail_uv, '', details[source_name], 'UVs')
        # The meadow texture is a watered lawn; the hills around it are late-summer
        # tan. Olive it down and let broad 20-40 m patches dry toward straw.
        def tinted(sample, rgb):
            out = expression(m, u.MaterialExpressionMultiply)
            connect(sample, 'RGB', out, 'A')
            connect(expression(m, u.MaterialExpressionConstant3Vector, constant=u.LinearColor(*rgb, 1)), '', out, 'B')
            return out
        # Noise samples absolute world position when its Position input is left empty.
        patches = expression(m, u.MaterialExpressionNoise, scale=.0004, levels=3, output_min=0, output_max=1, quality=1)
        dryness = expression(m, u.MaterialExpressionLinearInterpolate, const_a=.25, const_b=.85)
        connect(patches, '', dryness, 'Alpha')
        field = expression(m, u.MaterialExpressionLinearInterpolate)
        connect(tinted(details['GroundMeadow'], (1, .86, .6)), '', field, 'A')
        connect(tinted(details['GroundDetail'], (1.05, .95, .78)), '', field, 'B')
        connect(dryness, '', field, 'Alpha')
        colours = ((details['GroundDetail'], 'RGB'), (field, ''), (details['GroundLitter'], 'RGB'), (details['GroundDamp'], 'RGB'))
        terms = []
        for (colour, output), weight in zip(colours, (*weights, damp)):
            term = expression(m, u.MaterialExpressionMultiply)
            connect(colour, output, term, 'A'); connect(weight, '', term, 'B')
            terms.append(term)
        first = expression(m, u.MaterialExpressionAdd)
        second = expression(m, u.MaterialExpressionAdd)
        family_color = expression(m, u.MaterialExpressionAdd)
        connect(terms[0], '', first, 'A'); connect(terms[1], '', first, 'B')
        connect(terms[2], '', second, 'A'); connect(terms[3], '', second, 'B')
        connect(first, '', family_color, 'A'); connect(second, '', family_color, 'B')
        blend = expression(m, u.MaterialExpressionLinearInterpolate, const_alpha=.90)
        connect(sample, 'RGB', blend, 'A'); connect(family_color, '', blend, 'B')
        connect_property(blend, '', u.MaterialProperty.MP_BASE_COLOR)
        if (STAGED / 'GroundNormal.png').exists():
            normal_tex = import_file(STAGED / 'GroundNormal.png', '/Game/FlowFest/Textures', 'GroundNormal')
            normal_tex.set_editor_property('compression_settings', u.TextureCompressionSettings.TC_NORMALMAP)
            normal_tex.set_editor_property('srgb', False)
            ED.save_loaded_asset(normal_tex)
            normal = expression(m, u.MaterialExpressionTextureSample, texture=normal_tex, sampler_type=u.MaterialSamplerType.SAMPLERTYPE_NORMAL)
            connect(detail_uv, '', normal, 'UVs')
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
