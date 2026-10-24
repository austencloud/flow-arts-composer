"""Unreal 5.8 editor Python: import reproducible assets, create materials and save the map."""
import unreal as u
import json
import math
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
# `--only=Ground` reauthors just M_Ground, `--only=Roads` just the road materials and
# `--only=Floor/` just the forest floor pieces.

MEADOW = '/Game/FlowFest/Assets/Meadow'
FLOOR = '/Game/FlowFest/Assets/Floor'

def import_file(path, folder, name, mesh=False):
    target = folder + '/' + name
    # These three small source meshes may change during site art passes. Reimport
    # them on every run so an existing project never keeps an older silhouette.
    if (not ED.does_asset_exist(target)
            or folder in ('/Game/FlowFest/Assets/Ecology', '/Game/FlowFest/Textures/Ecology', MEADOW, FLOOR)
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
            options.static_mesh_import_data.build_nanite = folder in (MEADOW, FLOOR)
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

# A partial run needs no decoded source jobs when it imports none of them.
for job in ([] if SET_ONLY or (ONLY and not (STAGED / 'imports.json').exists())
            else json.loads((STAGED / 'imports.json').read_text())):
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

def author_meadow_material(name='M_MeadowGrass', green=((.06, .075, .025), (.19, .22, .075)),
                           straw=((.14, .11, .05), (.46, .37, .18))):
    """One material for the field grass meshes. UV V runs root (0) to tip (1); each
    instance's custom data 0 is how dry the clump is and 1 its brightness, so a
    field mixes green, olive and straw clumps instead of one cloned colour. Ferns
    use the same graph with deeper greens that turn bronze instead of straw."""
    m = material(name, green[1], .78)
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
    green = gradient(*green)
    straw = gradient(*straw)
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

def author_litter_material():
    """Fallen leaves: UV U picks each leaf's colour along a ramp from dark wet brown
    through rust to pale tan; custom data 1 darkens a whole patch where it lies damp."""
    m = material('M_LeafLitter', (.2, .11, .05), .85)
    for old in list(ME.get_material_expressions(m)):
        ME.delete_material_expression(m, old)
    m.set_editor_property('two_sided', True)
    uv = expression(m, u.MaterialExpressionTextureCoordinate)
    tone = expression(m, u.MaterialExpressionComponentMask, r=True, g=False, b=False, a=False)
    connect(uv, '', tone, '')
    ramp = None
    # Wide enough to read against the tan litter ground: near-black wet leaves to pale dry ones.
    stops = ((.035, .02, .01), (.11, .05, .02), (.27, .1, .03), (.46, .33, .15))
    for index, rgb in enumerate(stops):
        colour = expression(m, u.MaterialExpressionConstant3Vector, constant=u.LinearColor(*rgb, 1))
        if ramp is None:
            ramp = colour
            continue
        # Each stop takes over across its third of the U range.
        shifted = expression(m, u.MaterialExpressionMultiply)
        connect(tone, '', shifted, 'A'); connect(scalar(m, len(stops) - 1), '', shifted, 'B')
        start = expression(m, u.MaterialExpressionSubtract)
        connect(shifted, '', start, 'A'); connect(scalar(m, index - 1), '', start, 'B')
        weight = expression(m, u.MaterialExpressionSaturate)
        connect(start, '', weight, '')
        step = expression(m, u.MaterialExpressionLinearInterpolate)
        connect(ramp, '', step, 'A'); connect(colour, '', step, 'B'); connect(weight, '', step, 'Alpha')
        ramp = step
    brightness = expression(m, u.MaterialExpressionPerInstanceCustomData, data_index=1, const_default_value=1)
    base = expression(m, u.MaterialExpressionMultiply)
    connect(ramp, '', base, 'A'); connect(brightness, '', base, 'B')
    connect_property(base, '', u.MaterialProperty.MP_BASE_COLOR)
    connect_property(scalar(m, .82), '', u.MaterialProperty.MP_ROUGHNESS)
    connect_property(scalar(m, .3), '', u.MaterialProperty.MP_SPECULAR)
    ensure_instancing(m)
    ME.set_base_material_usage(m, u.MaterialUsage.MATUSAGE_NANITE, True)
    ME.layout_material_expressions(m)
    ME.recompile_material(m)
    ED.save_loaded_asset(m)
    return m

# The fallen log and stump wear the Megaplants dead pine bark, with its broken wood on the cut ends.
FLOOR_BARK = '/Game/Megaplant_Library/Tree_Dead_Pine/Materials/MI_Dead_Pine_Bark_01'
FLOOR_HEARTWOOD = '/Game/Megaplant_Library/Tree_Dead_Pine/Materials/MI_Dead_Pine_BrokenBranch_01'
if not ONLY or ONLY.startswith('Floor'):
    fern = author_meadow_material('M_Fern', green=((.025, .045, .012), (.1, .17, .04)),
                                  straw=((.09, .05, .02), (.36, .2, .07)))
    litter = author_litter_material()
    for name in ('LeafLitter', 'FernClump', 'FallenLog', 'Stump'):
        mesh = import_file(STAGED / (name + '.fbx'), FLOOR, name, True)
        for slot, entry in enumerate(mesh.static_materials):
            slot_name = str(entry.material_slot_name).lower()
            choice = (fern if name == 'FernClump' else litter if name == 'LeafLitter'
                      else ED.load_asset(FLOOR_HEARTWOOD if 'heartwood' in slot_name else FLOOR_BARK))
            if not choice:
                raise RuntimeError(f'Forest floor material missing for {name} slot {slot_name}')
            mesh.set_material(slot, choice)
        nanite = mesh.get_editor_property('nanite_settings')
        nanite.set_editor_property('enabled', True)
        if name == 'FernClump' and hasattr(u, 'NaniteShapePreservation'):
            nanite.set_editor_property('shape_preservation', u.NaniteShapePreservation.VOXELIZE)
        mesh.set_editor_property('nanite_settings', nanite)
        ED.save_loaded_asset(mesh)
        u.log(f"FLOWFEST_FLOOR {name} nanite={mesh.get_editor_property('nanite_settings').enabled} "
              f"slots={[str(e.material_slot_name) + '=' + (e.material_interface.get_name() if e.material_interface else 'None') for e in mesh.static_materials]}")
    ED.save_directory(FLOOR, only_if_is_dirty=True, recursive=True)

palette = {
    'M_Ground': ((.12,.17,.055),.95,0,0), 'M_Dirt': ((.19,.13,.07),.96,0,0),
    'M_Asphalt': ((.055,.06,.055),.92,0,0), 'M_Wood': ((.21,.095,.035),.85,0,0),
    'M_Canvas': ((.43,.25,.10),.92,0,0), 'M_Metal': ((.18,.22,.23),.38,.8,0),
    'M_Ember': ((1,.17,.012),.7,0,9), 'M_Grass': ((.10,.18,.035),.96,0,0),
}
if ONLY:
    palette = ({'M_Ground': palette['M_Ground']} if ONLY == 'Ground' else
               {k: palette[k] for k in ('M_Dirt', 'M_Asphalt')} if ONLY == 'Roads' else {})
site = json.loads((PROJECT / 'Content' / 'Data' / 'site.json').read_text())
ground_bounds = site['groundSurface']
if ground_bounds['file'] != 'ground-family-mask.rgba':
    raise RuntimeError('Unexpected registered ground-family mask contract')

def unary_one_minus(material, value):
    e = expression(material, u.MaterialExpressionOneMinus)
    connect(value, '', e, '')
    return e

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

def road_material(m, paved):
    """Road and path surfaces. BuildRoads runs U along the road in metres and V across it
    in half-widths (the running surface is -1 to 1, the shoulder fades out by 1.35).
    Vertex red is crown shade, green marks a foot path and blue fades the ends."""
    m.set_editor_property('blend_mode', u.BlendMode.BLEND_MASKED)
    m.set_editor_property('opacity_mask_clip_value', .5)
    m.set_editor_property('dither_opacity_mask', True)
    def op(cls, a, b):
        e = expression(m, cls)
        connect(a, '', e, 'A'); connect(b, '', e, 'B')
        return e
    def mul(a, b): return op(u.MaterialExpressionMultiply, a, b)
    def add(a, b): return op(u.MaterialExpressionAdd, a, b)
    def sub(a, b): return op(u.MaterialExpressionSubtract, a, b)
    def lerp(a, b, alpha):
        e = expression(m, u.MaterialExpressionLinearInterpolate)
        connect(a, '', e, 'A'); connect(b, '', e, 'B'); connect(alpha, '', e, 'Alpha')
        return e
    def unary(cls, x):
        e = expression(m, cls)
        connect(x, '', e, '')
        return e
    def smooth(lo, hi, value):
        e = expression(m, u.MaterialExpressionSmoothStep)
        connect(scalar(m, lo), '', e, 'Min'); connect(scalar(m, hi), '', e, 'Max'); connect(value, '', e, 'Value')
        return e
    def color(r, g, b): return expression(m, u.MaterialExpressionConstant3Vector, constant=u.LinearColor(r, g, b, 1))
    def pick(source, output, ch):
        e = expression(m, u.MaterialExpressionComponentMask, r=ch == 'r', g=ch == 'g', b=ch == 'b', a=False)
        connect(source, output, e, '')
        return e
    def band(value, centre, inner, outer):
        """1 within `inner` of `centre`, 0 beyond `outer`."""
        return unary(u.MaterialExpressionOneMinus, smooth(inner, outer, unary(u.MaterialExpressionAbs, sub(value, scalar(m, centre)))))

    uv = expression(m, u.MaterialExpressionTextureCoordinate, coordinate_index=0)
    across = unary(u.MaterialExpressionAbs, pick(uv, '', 'g'))
    paint = expression(m, u.MaterialExpressionVertexColor)
    world = expression(m, u.MaterialExpressionWorldPosition)
    xy = expression(m, u.MaterialExpressionComponentMask, r=True, g=True, b=False, a=False)
    connect(world, '', xy, '')
    grit_uv = mul(xy, scalar(m, 1 / 160))
    detail = expression(m, u.MaterialExpressionTextureSample, texture=ED.load_asset('/Game/FlowFest/Textures/GroundDetail'))
    connect(grit_uv, '', detail, 'UVs')
    # GroundDetail is a grassy forest-floor photo. Its brightness alone gives the soil or
    # tar a grain; its colour is the grass the shoulders and a drive's crown wear back to.
    brightness = expression(m, u.MaterialExpressionDotProduct)
    connect(detail, 'RGB', brightness, 'A'); connect(color(.3, .59, .11), '', brightness, 'B')
    grain = lerp(scalar(m, .55), scalar(m, 1.45), unary(u.MaterialExpressionSaturate, mul(brightness, scalar(m, 2.5))))
    grass = expression(m, u.MaterialExpressionMultiply)
    connect(detail, 'RGB', grass, 'A'); connect(scalar(m, .8), '', grass, 'B')
    ragged = expression(m, u.MaterialExpressionNoise, scale=.012, levels=3, output_min=-.5, output_max=.5, quality=1)
    patches = expression(m, u.MaterialExpressionNoise, scale=.0035, levels=2, output_min=0, output_max=1, quality=1)
    foot = pick(paint, 'G', 'r')
    drive = unary(u.MaterialExpressionOneMinus, foot)

    if paved:
        # County tar: wear lightens it in patches, the middle of each lane carries oil, and
        # the edges crumble into the gravel shoulder.
        tar = mul(lerp(color(.045, .047, .046), color(.085, .082, .076), mul(patches, scalar(m, .7))), grain)
        oil = mul(band(across, .5, .03, .14), scalar(m, .7))
        oiled = lerp(tar, mul(tar, scalar(m, .78)), oil)
        crumble = smooth(.84, 1.0, add(across, mul(ragged, scalar(m, .3))))
        surface = lerp(oiled, mul(color(.15, .13, .1), grain), crumble)
        verge = smooth(1.08, 1.3, add(across, mul(ragged, scalar(m, .3))))
        roughness = lerp(scalar(m, .9), scalar(m, .78), oil)
    else:
        # Packed soil. Drives keep two wheel ruts and a grassy crown between them; foot
        # paths wear one smoother, paler line down the middle.
        soil = mul(lerp(color(.17, .12, .075), color(.23, .17, .11), patches), grain)
        rut = mul(band(across, .45, .1, .28), drive)
        rutted = lerp(soil, mul(soil, color(.78, .76, .74)), rut)
        crown = mul(mul(unary(u.MaterialExpressionOneMinus, smooth(.1, .26, across)), drive), patches)
        crowned = lerp(rutted, grass, mul(crown, scalar(m, .4)))
        worn = mul(unary(u.MaterialExpressionOneMinus, smooth(.15, .75, across)), foot)
        surface = lerp(crowned, mul(crowned, scalar(m, 1.15)), worn)
        verge = smooth(.88, 1.25, add(across, mul(ragged, scalar(m, .3))))
        roughness = lerp(lerp(scalar(m, .94), scalar(m, .82), rut), scalar(m, .86), worn)
    edged = lerp(surface, grass, mul(verge, scalar(m, .85)))
    shade = lerp(scalar(m, 1), color(.56, .5, .44), unary(u.MaterialExpressionSaturate, pick(paint, 'R', 'r')))
    connect_property(mul(edged, shade), '', u.MaterialProperty.MP_BASE_COLOR)
    connect_property(roughness, '', u.MaterialProperty.MP_ROUGHNESS)
    # The shoulder thins out raggedly and the ends fade; the material's temporal dither
    # stands in for the soft blend a translucent road would need.
    edge = unary(u.MaterialExpressionSaturate, add(mul(sub(scalar(m, 1.32), across), scalar(m, 2.6)), mul(ragged, scalar(m, .8))))
    connect_property(mul(edge, pick(paint, 'B', 'r')), '', u.MaterialProperty.MP_OPACITY_MASK)
    if ED.does_asset_exist('/Game/FlowFest/Textures/GroundNormal'):
        relief = expression(m, u.MaterialExpressionTextureSample, texture=ED.load_asset('/Game/FlowFest/Textures/GroundNormal'),
                            sampler_type=u.MaterialSamplerType.SAMPLERTYPE_NORMAL)
        connect(grit_uv, '', relief, 'UVs')
        connect_property(relief, 'RGB', u.MaterialProperty.MP_NORMAL)


for name, args in palette.items():
    m = material(name, *args)
    if name == 'M_Ground' and (STAGED / 'TerrainOrtho.png').exists():
        tex = import_file(STAGED / 'TerrainOrtho.png', '/Game/FlowFest/Textures', 'TerrainOrtho')
        world = expression(m, u.MaterialExpressionWorldPosition)
        sample = expression(m, u.MaterialExpressionTextureSample, texture=tex)
        connect(ground_uv(m, world, ground_bounds), '', sample, 'UVs')
        connect_property(sample, 'RGB', u.MaterialProperty.MP_BASE_COLOR)
        required_ground = ('GroundFamilyMask', 'GroundFields', 'GroundDetail', 'GroundMeadow', 'GroundLitter', 'GroundDamp')
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
        # A second mapping, 1.53 times larger and turned 37 degrees, takes over in
        # 5-10 m noise patches, so no tile edge or repeat lines up across the hillside.
        turned = []
        for row in ((math.cos(math.radians(37)), -math.sin(math.radians(37))), (math.sin(math.radians(37)), math.cos(math.radians(37)))):
            dot = expression(m, u.MaterialExpressionDotProduct)
            connect(xy, '', dot, 'A')
            connect(expression(m, u.MaterialExpressionConstant2Vector, r=row[0] / 375, g=row[1] / 375), '', dot, 'B')
            turned.append(dot)
        turned_uv = expression(m, u.MaterialExpressionAppendVector)
        connect(turned[0], '', turned_uv, 'A'); connect(turned[1], '', turned_uv, 'B')
        swap_noise = expression(m, u.MaterialExpressionNoise, scale=.0016, levels=2, output_min=0, output_max=1, quality=1)
        swap = expression(m, u.MaterialExpressionSmoothStep)
        connect(swap_noise, '', swap, 'Value')
        connect(scalar(m, .35), '', swap, 'Min'); connect(scalar(m, .65), '', swap, 'Max')
        def two_scale(texture, sampler=None):
            props = {'texture': texture}
            if sampler is not None:
                props['sampler_type'] = sampler
            near = expression(m, u.MaterialExpressionTextureSample, **props)
            far = expression(m, u.MaterialExpressionTextureSample, **props)
            connect(detail_uv, '', near, 'UVs'); connect(turned_uv, '', far, 'UVs')
            mixed = expression(m, u.MaterialExpressionLinearInterpolate)
            connect(near, 'RGB', mixed, 'A'); connect(far, 'RGB', mixed, 'B'); connect(swap, '', mixed, 'Alpha')
            return mixed
        details = {}
        for source_name in ('GroundDetail', 'GroundMeadow', 'GroundLitter', 'GroundDamp'):
            detail_tex = import_file(STAGED / (source_name + '.png'), '/Game/FlowFest/Textures', source_name)
            details[source_name] = two_scale(detail_tex)
        # The meadow texture is a watered lawn; the hills around it are late-summer
        # tan. Olive it down and let broad 20-40 m patches dry toward straw.
        def tinted(sample, rgb):
            out = expression(m, u.MaterialExpressionMultiply)
            connect(sample, '', out, 'A')
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
        # Litter is most of the site; deepen it toward a shaded woodland brown.
        colours = ((details['GroundDetail'], ''), (field, ''), (tinted(details['GroundLitter'], (.82, .76, .7)), ''), (details['GroundDamp'], ''))
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
        # Farm fields: open land the mask left as litter (Tools/classify-fields.mjs). Red is
        # the field weight, green its dryness: 0 for green crop rows, 1 for hay or stubble.
        fields_tex = import_file(STAGED / 'GroundFields.png', '/Game/FlowFest/Textures', 'GroundFields')
        fields_tex.set_editor_property('compression_settings', u.TextureCompressionSettings.TC_MASKS)
        fields_tex.set_editor_property('srgb', False)
        ED.save_loaded_asset(fields_tex)
        fields = expression(m, u.MaterialExpressionTextureSample, texture=fields_tex, sampler_type=u.MaterialSamplerType.SAMPLERTYPE_MASKS)
        connect(ground_uv(m, world, ground_bounds, True), '', fields, 'UVs')
        def channel(source, output, ch):
            e = expression(m, u.MaterialExpressionComponentMask, r=ch == 'r', g=ch == 'g', b=ch == 'b', a=False)
            connect(source, output, e, '')
            return e
        def op(cls, a, b):
            e = expression(m, cls)
            connect(a, '', e, 'A'); connect(b, '', e, 'B')
            return e
        def lerp3(a, b, alpha):
            e = expression(m, u.MaterialExpressionLinearInterpolate)
            connect(a, '', e, 'A'); connect(b, '', e, 'B'); connect(alpha, '', e, 'Alpha')
            return e
        def smoothstep(lo, hi, value):
            e = expression(m, u.MaterialExpressionSmoothStep)
            connect(scalar(m, lo), '', e, 'Min'); connect(scalar(m, hi), '', e, 'Max'); connect(value, '', e, 'Value')
            return e
        field_weight = channel(fields, 'RGB', 'r')
        field_dry = channel(fields, 'RGB', 'g')
        # Hay and stubble: the straw-coloured detail, with the meadow's green coming
        # back in the same broad patches that dry the meadows.
        hay = lerp3(tinted(details['GroundDetail'], (1.2, 1.08, .74)), tinted(details['GroundMeadow'], (1.5, 1.3, 1.1)),
                    op(u.MaterialExpressionMultiply, unary_one_minus(m, patches), scalar(m, .35)))
        # Crop rows run east to west about 76 cm apart: green plants over a soil furrow.
        # Past 25-70 m the rows blend into their average so they never shimmer.
        y = expression(m, u.MaterialExpressionComponentMask, r=False, g=True, b=False, a=False)
        connect(world, '', y, '')
        wave = expression(m, u.MaterialExpressionSine, period=76)
        connect(y, '', wave, '')
        plants = smoothstep(-.35, .15, wave)
        depth = expression(m, u.MaterialExpressionPixelDepth)
        rows_near = unary_one_minus(m, smoothstep(2500, 7000, depth))
        cover = lerp3(scalar(m, .68), plants, rows_near)
        crop = lerp3(tinted(details['GroundLitter'], (.95, .9, .85)), tinted(details['GroundMeadow'], (1.05, 1.3, .9)), cover)
        field_colour = lerp3(crop, hay, field_dry)
        # The orthophoto's light and dark keeps each real field's tracks and patchiness.
        photo = expression(m, u.MaterialExpressionDotProduct)
        connect(sample, 'RGB', photo, 'A')
        connect(expression(m, u.MaterialExpressionConstant3Vector, constant=u.LinearColor(.3, .59, .11, 1)), '', photo, 'B')
        variation = expression(m, u.MaterialExpressionClamp, min_default=.78, max_default=1.25)
        connect(op(u.MaterialExpressionDivide, photo, lerp3(scalar(m, .13), scalar(m, .21), field_dry)), '', variation, '')
        family_color = lerp3(family_color, op(u.MaterialExpressionMultiply, field_colour, variation), field_weight)
        # Broad 15-30 m light and dark washes, the way soil, moisture and leaf fall vary.
        wash_noise = expression(m, u.MaterialExpressionNoise, scale=.00045, levels=3, output_min=0, output_max=1, quality=1)
        wash = expression(m, u.MaterialExpressionLinearInterpolate, const_a=.8, const_b=1.12)
        connect(wash_noise, '', wash, 'Alpha')
        washed = expression(m, u.MaterialExpressionMultiply)
        connect(family_color, '', washed, 'A'); connect(wash, '', washed, 'B')
        blend = expression(m, u.MaterialExpressionLinearInterpolate, const_alpha=.90)
        connect(sample, 'RGB', blend, 'A'); connect(washed, '', blend, 'B')
        # Under the crowns the soil stays damp and dark; the terrain's vertex red is crown shade.
        crowns = expression(m, u.MaterialExpressionVertexColor)
        shade = expression(m, u.MaterialExpressionLinearInterpolate)
        connect(scalar(m, 1), '', shade, 'A')
        connect(expression(m, u.MaterialExpressionConstant3Vector, constant=u.LinearColor(.56, .5, .44, 1)), '', shade, 'B')
        connect(crowns, 'R', shade, 'Alpha')
        shaded = expression(m, u.MaterialExpressionMultiply)
        connect(blend, '', shaded, 'A'); connect(shade, '', shaded, 'B')
        connect_property(shaded, '', u.MaterialProperty.MP_BASE_COLOR)
        if (STAGED / 'GroundNormal.png').exists():
            normal_tex = import_file(STAGED / 'GroundNormal.png', '/Game/FlowFest/Textures', 'GroundNormal')
            normal_tex.set_editor_property('compression_settings', u.TextureCompressionSettings.TC_NORMALMAP)
            normal_tex.set_editor_property('srgb', False)
            ED.save_loaded_asset(normal_tex)
            normal = two_scale(normal_tex, u.MaterialSamplerType.SAMPLERTYPE_NORMAL)
            connect_property(normal, '', u.MaterialProperty.MP_NORMAL)
    if name in ('M_Dirt', 'M_Asphalt'):
        road_material(m, paved=name == 'M_Asphalt')
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
