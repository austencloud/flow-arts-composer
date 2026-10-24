"""Unreal 5.8 editor Python: import the festival structures and build their materials.

Everything lands in /Game/FlowFest/Assets/Structures and nowhere else. `author-structures.py`
names each Blender material after the Unreal one it stands for, so the import keeps no FBX
materials and binds every slot by name to the M_Structures_ graphs made here.
"""
import unreal as u
from pathlib import Path

PROJECT = Path(u.Paths.project_dir()).resolve()
STAGED = PROJECT / 'Tools' / 'staged' / 'structures'
FOLDER = '/Game/FlowFest/Assets/Structures'
TOOLS = u.AssetToolsHelpers.get_asset_tools()
ED = u.EditorAssetLibrary
ME = u.MaterialEditingLibrary
u.SystemLibrary.execute_console_command(None, 'Interchange.FeatureFlags.Import.FBX 0')
errors = []

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

def multiply(m, a, b, a_out='', b_out=''):
    e = expression(m, u.MaterialExpressionMultiply); connect(a, a_out, e, 'A'); connect(b, b_out, e, 'B'); return e

def fresh(name):
    """An empty material graph in the structures folder, reused when it already exists."""
    path = FOLDER + '/' + name
    m = ED.load_asset(path) if ED.does_asset_exist(path) else TOOLS.create_asset(name, FOLDER, u.Material, u.MaterialFactoryNew())
    for old in list(ME.get_material_expressions(m)):
        ME.delete_material_expression(m, old)
    m.set_editor_property('two_sided', False)
    m.set_editor_property('blend_mode', u.BlendMode.BLEND_OPAQUE)
    return m

def finish(m):
    for usage in (u.MaterialUsage.MATUSAGE_INSTANCED_STATIC_MESHES, u.MaterialUsage.MATUSAGE_NANITE):
        if not ME.has_material_usage(m, usage):
            ME.set_base_material_usage(m, usage, True)
    ME.recompile_material(m)
    ED.save_loaded_asset(m)
    return m

def plain(name, color, roughness=.8, metallic=0., per_instance=False, two_sided=False):
    """A constant colour, darkened per board by the mesh's vertex grey; or the instance's colour."""
    m = fresh(name)
    if per_instance:
        base = expression(m, u.MaterialExpressionPerInstanceCustomData3Vector, data_index=0,
                          const_default_value=u.LinearColor(*color, 1))
    else:
        base = expression(m, u.MaterialExpressionConstant3Vector, constant=u.LinearColor(*color, 1))
    grey = expression(m, u.MaterialExpressionVertexColor)
    connect_property(multiply(m, base, grey, '', 'R'), '', u.MaterialProperty.MP_BASE_COLOR)
    connect_property(scalar(m, roughness), '', u.MaterialProperty.MP_ROUGHNESS)
    connect_property(scalar(m, metallic), '', u.MaterialProperty.MP_METALLIC)
    m.set_editor_property('two_sided', two_sided)
    return finish(m)

def art_panel():
    """Two instance colours (data 0-2 and 3-5) in painted rings whose count is data 6."""
    m = fresh('M_Structures_ArtPanel')
    a = expression(m, u.MaterialExpressionPerInstanceCustomData3Vector, data_index=0, const_default_value=u.LinearColor(.7, .25, .1, 1))
    b = expression(m, u.MaterialExpressionPerInstanceCustomData3Vector, data_index=3, const_default_value=u.LinearColor(.9, .75, .3, 1))
    rings = expression(m, u.MaterialExpressionPerInstanceCustomData, data_index=6, const_default_value=5.)
    uv = expression(m, u.MaterialExpressionTextureCoordinate)
    centre = expression(m, u.MaterialExpressionConstant2Vector, r=.5, g=.62)
    distance = expression(m, u.MaterialExpressionDistance); connect(uv, '', distance, 'A'); connect(centre, '', distance, 'B')
    wave = expression(m, u.MaterialExpressionFrac); connect(multiply(m, distance, rings), '', wave, '')
    band = expression(m, u.MaterialExpressionRound); connect(wave, '', band, '')
    blend = expression(m, u.MaterialExpressionLinearInterpolate)
    connect(a, '', blend, 'A'); connect(b, '', blend, 'B'); connect(band, '', blend, 'Alpha')
    connect_property(blend, '', u.MaterialProperty.MP_BASE_COLOR)
    connect_property(scalar(m, .85), '', u.MaterialProperty.MP_ROUGHNESS)
    m.set_editor_property('two_sided', True)
    return finish(m)

def ground_patch():
    """Draped gravel pads and trampled strips. Vertex red fades the edge, green picks trampled
    earth over gravel; a world-space noise breaks the colour and dithers a ragged edge."""
    m = fresh('M_Structures_GroundPatch')
    m.set_editor_property('blend_mode', u.BlendMode.BLEND_MASKED)
    m.set_editor_property('dither_opacity_mask', True)
    vc = expression(m, u.MaterialExpressionVertexColor)
    # Noise samples absolute world position when its Position input is left empty.
    noise = expression(m, u.MaterialExpressionNoise, scale=.02, levels=3, output_min=0., output_max=1., quality=1)
    gravel = expression(m, u.MaterialExpressionConstant3Vector, constant=u.LinearColor(.20, .19, .17, 1))
    earth = expression(m, u.MaterialExpressionConstant3Vector, constant=u.LinearColor(.13, .10, .065, 1))
    kind = expression(m, u.MaterialExpressionLinearInterpolate)
    connect(gravel, '', kind, 'A'); connect(earth, '', kind, 'B'); connect(vc, 'G', kind, 'Alpha')
    shade = expression(m, u.MaterialExpressionLinearInterpolate)
    connect(scalar(m, .7), '', shade, 'A'); connect(scalar(m, 1.25), '', shade, 'B'); connect(noise, '', shade, 'Alpha')
    connect_property(multiply(m, kind, shade), '', u.MaterialProperty.MP_BASE_COLOR)
    connect_property(scalar(m, .95), '', u.MaterialProperty.MP_ROUGHNESS)
    edge = expression(m, u.MaterialExpressionSubtract)
    connect(multiply(m, vc, scalar(m, 1.8), 'R'), '', edge, 'A'); connect(noise, '', edge, 'B')
    connect_property(edge, '', u.MaterialProperty.MP_OPACITY_MASK)
    return finish(m)

MATERIALS = {
    'Wood': ((.30, .28, .25), .85), 'WoodMoss': ((.075, .085, .05), .9), 'WoodWarm': ((.36, .25, .15), .8),
    'RoofTeal': ((.035, .26, .26), .45, .5), 'Galvanized': ((.5, .51, .5), .42, .85), 'RoofGrey': ((.2, .21, .22), .5, .4),
    'RoofGreen': ((.06, .16, .08), .5, .4), 'RoofPink': ((.55, .26, .29), .5, .35), 'RoofCharcoal': ((.07, .07, .075), .55, .4),
    'WallPale': ((.58, .56, .5), .85), 'WallTan': ((.42, .39, .33), .85), 'WallBrown': ((.28, .19, .12), .85),
    'PaintWhite': ((.72, .72, .69), .6), 'LogWall': ((.26, .15, .075), .85), 'Stone': ((.3, .28, .25), .9),
    'Concrete': ((.4, .39, .36), .92), 'Canvas': ((.78, .77, .72), .8), 'BlackCloth': ((.015, .015, .017), .95),
    'Steel': ((.5, .51, .52), .45, .6), 'DarkMetal': ((.04, .04, .04), .5, .3), 'Window': ((.015, .02, .025), .08),
    'PlasticBlue': ((.16, .25, .33), .5), 'PlasticWhite': ((.78, .78, .75), .5), 'Red': ((.5, .035, .025), .5),
    'BarrelBlue': ((.03, .12, .4), .45), 'SignPaint': ((.8, .74, .58), .8), 'Chalkboard': ((.03, .04, .035), .9),
    'Hay': ((.55, .44, .2), .95), 'Wristbands': ((.9, .3, .05), .5), 'Lime': ((.42, .75, .08), .5),
    'ConeOrange': ((.85, .25, .02), .5), 'Rope': ((.4, .33, .22), .95), 'Bulb': ((.62, .58, .48), .2),
    'ChairGreen': ((.04, .14, .07), .85), 'ChairNavy': ((.03, .05, .14), .85), 'ChairRust': ((.26, .07, .035), .85),
    'TableTop': ((.68, .67, .63), .6), 'WaterFlat': ((.3, .44, .58), .3),
}
made = {}
for short, spec in MATERIALS.items():
    made['M_Structures_' + short] = plain('M_Structures_' + short, spec[0], spec[1], spec[2] if len(spec) > 2 else 0.)
made['M_Structures_Fabric'] = plain('M_Structures_Fabric', (.8, .8, .78), .8, 0., True)
made['M_Structures_InstancePaint'] = plain('M_Structures_InstancePaint', (.8, .8, .78), .55, 0., True)
made['M_Structures_ArtPanel'] = art_panel()
made['M_Structures_GroundPatch'] = ground_patch()

def import_mesh(name):
    task = u.AssetImportTask()
    task.filename = str(STAGED / (name + '.fbx'))
    task.destination_path = FOLDER
    task.destination_name = name
    task.automated = True
    task.replace_existing = True
    task.save = True
    options = u.FbxImportUI()
    options.import_mesh = True
    options.import_as_skeletal = False
    options.mesh_type_to_import = u.FBXImportType.FBXIT_STATIC_MESH
    options.automated_import_should_detect_type = False
    options.import_materials = False
    options.import_textures = False
    data = options.static_mesh_import_data
    data.combine_meshes = True
    data.generate_lightmap_u_vs = False
    data.build_nanite = True
    data.auto_generate_collision = False
    data.vertex_color_import_option = u.VertexColorImportOption.REPLACE
    task.options = options
    TOOLS.import_asset_tasks([task])
    mesh = ED.load_asset(FOLDER + '/' + name)
    if not mesh:
        raise RuntimeError('Could not import ' + name)
    for index, slot in enumerate(mesh.static_materials):
        slot_name = str(slot.material_slot_name)
        key = next((k for k in made if slot_name == k or slot_name.startswith(k + '_')), None)
        if not key:
            errors.append(f'{name}: no material for slot {slot_name}')
            continue
        mesh.set_material(index, made[key])
    ED.save_loaded_asset(mesh)
    u.log(f'FLOWFEST_STRUCTURE {name} slots={len(mesh.static_materials)} extent={mesh.get_bounds().box_extent}')

for fbx in sorted(STAGED.glob('*.fbx')):
    import_mesh(fbx.stem)
ED.save_directory(FOLDER, only_if_is_dirty=True, recursive=True)
for e in errors:
    u.log_error('FLOWFEST_STRUCTURE_ERROR ' + e)
u.log(f'FLOWFEST_STRUCTURES_DONE errors={len(errors)}')
