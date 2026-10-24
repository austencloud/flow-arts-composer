"""Unreal 5.8 editor Python: import the jam kit and build its materials.

Everything lands in /Game/FlowFest/Assets/Jam and nowhere else. `author-jam.py` names each
Blender material after the Unreal one it stands for, so the import keeps no FBX materials and
binds every slot by name to the M_Jam_ graphs made here. The rope, its glow halo and the night
glows (lanterns, bulbs, the laptop, the LED club) take a Glow parameter the jam drives from the
sun: 0 by day, 1 once the sun is five degrees down.

Run: UnrealEditor-Cmd FlowFest.uproject -run=pythonscript -script=Tools/import-jam.py
"""
import unreal as u
from pathlib import Path

PROJECT = Path(u.Paths.project_dir()).resolve()
STAGED = PROJECT / 'Tools' / 'staged' / 'jam'
FOLDER = '/Game/FlowFest/Assets/Jam'
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


def param(material, name, value):
    return expression(material, u.MaterialExpressionScalarParameter, parameter_name=name, default_value=value)


def vparam(material, name, rgb):
    return expression(material, u.MaterialExpressionVectorParameter, parameter_name=name, default_value=u.LinearColor(*rgb, 1))


def connect(source, output, target, input_name):
    if not ME.connect_material_expressions(source, output, target, input_name):
        raise RuntimeError(f'Failed material connection {source.get_name()}[{output}] -> {target.get_name()}[{input_name}]')


def connect_property(source, output, prop):
    if not ME.connect_material_property(source, output, prop):
        raise RuntimeError(f'Failed material property connection {source.get_name()}[{output}] -> {prop}')


def multiply(m, a, b, a_out='', b_out=''):
    e = expression(m, u.MaterialExpressionMultiply); connect(a, a_out, e, 'A'); connect(b, b_out, e, 'B'); return e


def lerp(m, a, b, alpha, alpha_out=''):
    e = expression(m, u.MaterialExpressionLinearInterpolate)
    connect(a, '', e, 'A'); connect(b, '', e, 'B'); connect(alpha, alpha_out, e, 'Alpha'); return e


def fresh(name):
    path = FOLDER + '/' + name
    m = ED.load_asset(path) if ED.does_asset_exist(path) else TOOLS.create_asset(name, FOLDER, u.Material, u.MaterialFactoryNew())
    for old in list(ME.get_material_expressions(m)):
        ME.delete_material_expression(m, old)
    m.set_editor_property('two_sided', False)
    m.set_editor_property('blend_mode', u.BlendMode.BLEND_OPAQUE)
    m.set_editor_property('shading_model', u.MaterialShadingModel.MSM_DEFAULT_LIT)
    return m


def finish(m, nanite=True):
    usages = [u.MaterialUsage.MATUSAGE_INSTANCED_STATIC_MESHES]
    if nanite:
        usages.append(u.MaterialUsage.MATUSAGE_NANITE)
    for usage in usages:
        if not ME.has_material_usage(m, usage):
            ME.set_base_material_usage(m, usage, True)
    ME.recompile_material(m)
    ED.save_loaded_asset(m)
    return m


def plain(name, color, roughness=.8, metallic=0., per_instance=False, two_sided=False):
    m = fresh(name)
    if per_instance:
        base = expression(m, u.MaterialExpressionPerInstanceCustomData3Vector, data_index=0,
                          const_default_value=u.LinearColor(*color, 1))
    else:
        base = expression(m, u.MaterialExpressionConstant3Vector, constant=u.LinearColor(*color, 1))
    connect_property(base, '', u.MaterialProperty.MP_BASE_COLOR)
    connect_property(scalar(m, roughness), '', u.MaterialProperty.MP_ROUGHNESS)
    connect_property(scalar(m, metallic), '', u.MaterialProperty.MP_METALLIC)
    m.set_editor_property('two_sided', two_sided)
    return finish(m)


def blanket():
    """The instance colour in woven stripes across V, with a cream weft line between them."""
    m = fresh('M_Jam_Blanket')
    base = expression(m, u.MaterialExpressionPerInstanceCustomData3Vector, data_index=0, const_default_value=u.LinearColor(.45, .1, .05, 1))
    uv = expression(m, u.MaterialExpressionTextureCoordinate, u_tiling=1., v_tiling=7.)
    v = expression(m, u.MaterialExpressionComponentMask, r=False, g=True, b=False, a=False); connect(uv, '', v, '')
    stripe = expression(m, u.MaterialExpressionFrac); connect(v, '', stripe, '')
    band = expression(m, u.MaterialExpressionStep); connect(scalar(m, .72), '', band, 'Y'); connect(stripe, '', band, 'X')
    cream = expression(m, u.MaterialExpressionConstant3Vector, constant=u.LinearColor(.62, .55, .42, 1))
    connect_property(lerp(m, base, cream, band), '', u.MaterialProperty.MP_BASE_COLOR)
    connect_property(scalar(m, .95), '', u.MaterialProperty.MP_ROUGHNESS)
    m.set_editor_property('two_sided', True)
    return finish(m)


def glow(name, rgb, strength, base=(.6, .58, .5), roughness=.4, nanite=True):
    """Emissive at Colour x Strength x Glow. Glow is 1 unless the jam drives it."""
    m = fresh(name)
    colour = vparam(m, 'Colour', rgb)
    level = multiply(m, param(m, 'Glow', 1.), param(m, 'Strength', strength))
    connect_property(multiply(m, colour, level), '', u.MaterialProperty.MP_EMISSIVE_COLOR)
    connect_property(expression(m, u.MaterialExpressionConstant3Vector, constant=u.LinearColor(*base, 1)), '', u.MaterialProperty.MP_BASE_COLOR)
    connect_property(scalar(m, roughness), '', u.MaterialProperty.MP_ROUGHNESS)
    return finish(m, nanite)


def club_glow():
    """Light inside frosted plastic: the body glows in its Colour, brighter where the shell is
    seen edge-on (a longer path through the diffuser), with a cooler-white core."""
    m = fresh('M_Jam_ClubGlow')
    colour = vparam(m, 'Colour', (.2, .5, 1.))
    level = multiply(m, param(m, 'Glow', 1.), param(m, 'Strength', 22.))
    fres = expression(m, u.MaterialExpressionFresnel, exponent=1.6, base_reflect_fraction=.0)
    shell = lerp(m, scalar(m, .55), scalar(m, 1.), fres)
    core = lerp(m, expression(m, u.MaterialExpressionConstant3Vector, constant=u.LinearColor(.9, .95, 1., 1)), colour, fres)
    connect_property(multiply(m, multiply(m, core, shell), level), '', u.MaterialProperty.MP_EMISSIVE_COLOR)
    connect_property(expression(m, u.MaterialExpressionConstant3Vector, constant=u.LinearColor(.75, .78, .8, 1)), '', u.MaterialProperty.MP_BASE_COLOR)
    connect_property(scalar(m, .32), '', u.MaterialProperty.MP_ROUGHNESS)
    connect_property(scalar(m, .5), '', u.MaterialProperty.MP_SPECULAR)
    return finish(m)


def rope():
    """The circle's rope: a dull cotton rope by day; at night its LED core glows warm."""
    m = fresh('M_Jam_Rope')
    colour = vparam(m, 'Colour', (1., .78, .52))
    level = multiply(m, multiply(m, param(m, 'Glow', 0.), param(m, 'GlowScale', 1.)), scalar(m, 9.))
    connect_property(multiply(m, colour, level), '', u.MaterialProperty.MP_EMISSIVE_COLOR)
    connect_property(expression(m, u.MaterialExpressionConstant3Vector, constant=u.LinearColor(.42, .36, .27, 1)), '', u.MaterialProperty.MP_BASE_COLOR)
    connect_property(scalar(m, .92), '', u.MaterialProperty.MP_ROUGHNESS)
    return finish(m, False)


def rope_glow():
    """A soft additive halo tube around the rope, brightest where it faces the camera."""
    m = fresh('M_Jam_RopeGlow')
    m.set_editor_property('blend_mode', u.BlendMode.BLEND_ADDITIVE)
    m.set_editor_property('shading_model', u.MaterialShadingModel.MSM_UNLIT)
    colour = vparam(m, 'Colour', (1., .78, .52))
    level = multiply(m, multiply(m, param(m, 'Glow', 0.), param(m, 'GlowScale', 1.)), scalar(m, .55))
    fres = expression(m, u.MaterialExpressionFresnel, exponent=1.2, base_reflect_fraction=0.)
    soft = expression(m, u.MaterialExpressionOneMinus); connect(fres, '', soft, '')
    halo = multiply(m, soft, soft)
    connect_property(multiply(m, multiply(m, colour, level), halo), '', u.MaterialProperty.MP_EMISSIVE_COLOR)
    return finish(m, False)


SOLIDS = {
    'Steel': ((.42, .43, .45), .38, .9), 'Aluminium': ((.62, .63, .64), .3, .9), 'MeshBlack': ((.018, .018, .02), .7),
    'Rubber': ((.025, .025, .027), .75), 'PlasticWhite': ((.7, .7, .68), .45), 'Wood': ((.3, .2, .12), .85),
    'Duvetyne': ((.012, .012, .014), .98), 'CanRed': ((.42, .03, .02), .4, .2),
    'Wick': ((.04, .035, .03), .95),
}
made = {}
for short, spec in SOLIDS.items():
    made['M_Jam_' + short] = plain('M_Jam_' + short, spec[0], spec[1], spec[2] if len(spec) > 2 else 0.)
made['M_Jam_Fabric'] = plain('M_Jam_Fabric', (.05, .1, .2), .85, 0., True, True)
made['M_Jam_Plastic'] = plain('M_Jam_Plastic', (.5, .5, .48), .45, 0., True)
made['M_Jam_Nylon'] = plain('M_Jam_Nylon', (.5, .1, .25), .5, 0., True)
made['M_Jam_Blanket'] = blanket()
made['M_Jam_LanternGlow'] = glow('M_Jam_LanternGlow', (1., .82, .6), 6., (.8, .78, .72), .3)
made['M_Jam_BulbGlow'] = glow('M_Jam_BulbGlow', (1., .62, .3), 28., (.9, .8, .6), .2)
made['M_Jam_ScreenGlow'] = glow('M_Jam_ScreenGlow', (.55, .65, 1.), 3., (.02, .02, .025), .1)
made['M_Jam_ClubStrip'] = glow('M_Jam_ClubStrip', (.6, .8, 1.), 40., (.1, .1, .1), .3)
made['M_Jam_ClubGlow'] = club_glow()
made['M_Jam_Rope'] = rope()
made['M_Jam_RopeGlow'] = rope_glow()


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
    # Small hand props: plain meshes are cheaper than Nanite at this size and keep the
    # translucent-looking club and emissive bulbs simple.
    data.build_nanite = False
    data.auto_generate_collision = False
    data.vertex_color_import_option = u.VertexColorImportOption.IGNORE
    task.options = options
    TOOLS.import_asset_tasks([task])
    mesh = ED.load_asset(FOLDER + '/' + name)
    if not mesh:
        raise RuntimeError('Could not import ' + name)
    keys = sorted(made, key=len, reverse=True)  # longest first: M_Jam_RopeGlow before M_Jam_Rope
    for index, slot in enumerate(mesh.static_materials):
        slot_name = str(slot.material_slot_name)
        key = next((k for k in keys if slot_name == k or slot_name.startswith(k + '_') or slot_name.startswith(k + '.')), None)
        if not key:
            errors.append(f'{name}: no material for slot {slot_name}')
            continue
        mesh.set_material(index, made[key])
    ED.save_loaded_asset(mesh)
    u.log(f'FLOWFEST_JAM {name} slots={[str(s.material_slot_name) for s in mesh.static_materials]} extent={mesh.get_bounds().box_extent}')


for fbx in sorted(STAGED.glob('*.fbx')) if STAGED.exists() else []:
    try:
        import_mesh(fbx.stem)
    except Exception as e:  # keep going so one bad file does not hide the rest
        errors.append(f'{fbx.stem}: {e}')
ED.save_directory(FOLDER, only_if_is_dirty=True, recursive=True)
for e in errors:
    u.log_error('FLOWFEST_JAM_ERROR ' + e)
u.log(f'FLOWFEST_JAM_DONE errors={len(errors)}')
