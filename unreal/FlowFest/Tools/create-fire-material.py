"""Create the native, texture-free Flow Fest fire materials in Unreal Editor 5.8.

Run with UnrealEditor-Cmd.exe FlowFest.uproject -run=pythonscript -script=<this file>.
Safe to rerun: only M_FireFlame and M_FireSparks are rebuilt.
"""
import unreal as u

ROOT = '/Game/FlowFest/Materials'
TOOLS = u.AssetToolsHelpers.get_asset_tools()
ASSETS = u.EditorAssetLibrary
EDIT = u.MaterialEditingLibrary


def connect(source, output, target, input_name):
    if not EDIT.connect_material_expressions(source, output, target, input_name):
        raise RuntimeError(f'Failed fire material connection {source.get_name()}[{output}] -> {target.get_name()}[{input_name}]')


def connect_property(source, output, prop):
    if not EDIT.connect_material_property(source, output, prop):
        raise RuntimeError(f'Failed fire material property connection {source.get_name()}[{output}] -> {prop}')


def create_material(name, code):
    path = f'{ROOT}/{name}'
    material = ASSETS.load_asset(path) if ASSETS.does_asset_exist(path) else TOOLS.create_asset(
        name, ROOT, u.Material, u.MaterialFactoryNew())
    if not material:
        raise RuntimeError(f'Could not create {path}')
    EDIT.delete_all_material_expressions(material)
    material.set_editor_property('material_domain', u.MaterialDomain.MD_SURFACE)
    material.set_editor_property('blend_mode', u.BlendMode.BLEND_ADDITIVE)
    material.set_editor_property('shading_model', u.MaterialShadingModel.MSM_UNLIT)
    material.set_editor_property('two_sided', True)

    uv = EDIT.create_material_expression(material, u.MaterialExpressionTextureCoordinate, -500, -180)
    time = EDIT.create_material_expression(material, u.MaterialExpressionTime, -500, 20)
    custom = EDIT.create_material_expression(material, u.MaterialExpressionCustom, -230, -100)
    custom.set_editor_property('description', 'Soft animated emission and opacity')
    custom.set_editor_property('output_type', u.CustomMaterialOutputType.CMOT_FLOAT4)
    custom_inputs = []
    for name in ('UV', 'Clock'):
        item = u.CustomInput()
        item.set_editor_property('input_name', name)
        custom_inputs.append(item)
    custom.set_editor_property('inputs', custom_inputs)
    custom.set_editor_property('code', code)
    connect(uv, '', custom, 'UV')
    connect(time, '', custom, 'Clock')
    rgb = EDIT.create_material_expression(material, u.MaterialExpressionComponentMask, 90, -170)
    rgb.set_editor_property('r', True)
    rgb.set_editor_property('g', True)
    rgb.set_editor_property('b', True)
    rgb.set_editor_property('a', False)
    alpha = EDIT.create_material_expression(material, u.MaterialExpressionComponentMask, 90, 40)
    alpha.set_editor_property('r', False)
    alpha.set_editor_property('g', False)
    alpha.set_editor_property('b', False)
    alpha.set_editor_property('a', True)
    connect(custom, '', rgb, '')
    connect(custom, '', alpha, '')
    connect_property(rgb, '', u.MaterialProperty.MP_EMISSIVE_COLOR)
    connect_property(alpha, '', u.MaterialProperty.MP_OPACITY)
    EDIT.layout_material_expressions(material)
    EDIT.recompile_material(material)
    if not ASSETS.save_loaded_asset(material):
        raise RuntimeError(f'Could not save {path}')
    u.log(f'FLOWFEST_FIRE_MATERIAL {path}')


# UV.y runs from the ember bed to the tip. Two traveling lobes disturb the
# narrowing silhouette; a smooth edge removes the card outline at all views.
FLAME = r'''float2 p = UV;
float y = saturate(p.y);
float sway = 0.11 * sin(y * 10.0 - Clock * 4.0 + p.x * 5.0);
float lick = 0.055 * sin(y * 23.0 - Clock * 6.7 + p.x * 11.0);
float x = abs(p.x - 0.5 + sway + lick);
float width = 0.43 * pow(1.0 - y, 0.72) + 0.012;
float edge = 1.0 - smoothstep(width * 0.53, width, x);
float top = 1.0 - smoothstep(0.79, 0.99, y + 0.035 * sin(p.x * 17.0 + Clock * 5.0));
float base = smoothstep(0.0, 0.09, y);
float turbulence = 0.83 + 0.17 * sin(y * 31.0 - Clock * 8.0 + p.x * 13.0);
float alpha = saturate(edge * top * base * turbulence) * 0.82;
float3 amber = float3(4.8, 0.54, 0.055);
float3 hot = float3(9.0, 2.5, 0.30);
float3 color = lerp(hot, amber, saturate(y * 1.2));
return float4(color, alpha);'''

# A handful of drifting pinpoints per sheet. The cell threshold and narrow
# radial falloff keep the upper cards mostly transparent.
SPARKS = r'''float2 p = UV;
float alpha = 0.0;
for (int i = 0; i < 9; ++i)
{
    float id = float(i);
    float seed = frac(sin(id * 78.233 + 2.71) * 43758.5453);
    float pace = 0.18 + 0.13 * frac(seed * 19.1);
    float age = frac(Clock * pace + seed);
    float cx = frac(seed * 31.7 + 0.17 * sin(Clock * 1.4 + id));
    float cy = age;
    float2 delta = (p - float2(cx, cy)) * float2(1.0, 1.3);
    float radius = 0.007 + 0.004 * frac(seed * 7.9);
    float dotAlpha = 1.0 - smoothstep(radius * 0.25, radius, length(delta));
    alpha += dotAlpha * smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(0.77, 1.0, age));
}
alpha = saturate(alpha) * 0.72;
return float4(float3(9.0, 1.8, 0.24), alpha);'''

create_material('M_FireFlame', FLAME)
create_material('M_FireSparks', SPARKS)
u.log('FLOWFEST_FIRE_MATERIALS_COMPLETE')
