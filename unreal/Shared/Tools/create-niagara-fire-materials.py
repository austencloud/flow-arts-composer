"""Create editable, texture-free Niagara sprite/ribbon materials in plugin content.

Run once in Unreal Editor after FlowArtsRuntime is mounted, before FlowArts.BuildNiagara.
The script only creates/updates the three Flow Arts Niagara material assets.
"""
import unreal as u

ROOT = '/FlowArtsRuntime/Effects/Materials'
TOOLS = u.AssetToolsHelpers.get_asset_tools()
ASSETS = u.EditorAssetLibrary
EDIT = u.MaterialEditingLibrary


def create(name, hlsl):
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
    material.set_editor_property('used_with_niagara_sprites', name != 'M_NiagaraTrail')
    material.set_editor_property('used_with_niagara_ribbons', name == 'M_NiagaraTrail')

    uv = EDIT.create_material_expression(material, u.MaterialExpressionTextureCoordinate, -500, -160)
    # Particle age advances with Niagara simulation, freezing shader licks on pause.
    clock = EDIT.create_material_expression(material, u.MaterialExpressionParticleRelativeTime, -500, 20)
    custom = EDIT.create_material_expression(material, u.MaterialExpressionCustom, -230, -80)
    custom.set_editor_property('description', 'Flow Arts Niagara fire emission and soft alpha')
    custom.set_editor_property('output_type', u.CustomMaterialOutputType.CMOT_FLOAT4)
    inputs = []
    for input_name in ('UV', 'Clock'):
        entry = u.CustomInput()
        entry.set_editor_property('input_name', input_name)
        inputs.append(entry)
    custom.set_editor_property('inputs', inputs)
    custom.set_editor_property('code', hlsl)
    if not EDIT.connect_material_expressions(uv, '', custom, 'UV'):
        raise RuntimeError(f'UV connection failed: {path}')
    if not EDIT.connect_material_expressions(clock, '', custom, 'Clock'):
        raise RuntimeError(f'Particle age connection failed: {path}')
    rgb = EDIT.create_material_expression(material, u.MaterialExpressionComponentMask, 90, -150)
    for channel in ('r', 'g', 'b'):
        rgb.set_editor_property(channel, True)
    rgb.set_editor_property('a', False)
    alpha = EDIT.create_material_expression(material, u.MaterialExpressionComponentMask, 90, 40)
    for channel in ('r', 'g', 'b'):
        alpha.set_editor_property(channel, False)
    alpha.set_editor_property('a', True)
    EDIT.connect_material_expressions(custom, '', rgb, '')
    EDIT.connect_material_expressions(custom, '', alpha, '')
    EDIT.connect_material_property(rgb, '', u.MaterialProperty.MP_EMISSIVE_COLOR)
    EDIT.connect_material_property(alpha, '', u.MaterialProperty.MP_OPACITY)
    EDIT.layout_material_expressions(material)
    EDIT.recompile_material(material)
    if not ASSETS.save_loaded_asset(material):
        raise RuntimeError(f'Could not save {path}')
    u.log(f'FLOWARTS_NIAGARA_MATERIAL {path}')


FLAME = r'''float2 p = UV;
float y = saturate(p.y);
float sway = 0.10 * sin(y * 11.0 - Clock * 2.45 + p.x * 4.0);
float lick = 0.045 * sin(y * 24.0 - Clock * 3.4 + p.x * 11.0);
float x = abs(p.x - 0.5 + sway + lick);
float width = 0.42 * pow(1.0 - y, 0.68) + 0.012;
float edge = 1.0 - smoothstep(width * 0.58, width, x);
float tip = 1.0 - smoothstep(0.72, 0.99, y);
float base = smoothstep(0.0, 0.08, y);
float alpha = saturate(edge * tip * base) * (1.0 - smoothstep(0.50, 1.0, Clock)) * 0.68;
float3 amber = float3(4.5, 0.42, 0.025);
float3 hot = float3(8.0, 2.25, 0.22);
return float4(lerp(hot, amber, y), alpha);'''

EMBER = r'''float2 d = (UV - 0.5) * float2(1.0, 1.0);
float r = length(d);
float alpha = (1.0 - smoothstep(0.08, 0.46, r)) * (1.0 - smoothstep(0.35, 1.0, Clock)) * 0.75;
return float4(float3(9.0, 1.5, 0.10), alpha);'''

TRAIL = r'''float across = abs(UV.y - 0.5) * 2.0;
float fade = (1.0 - smoothstep(0.12, 1.0, UV.x));
float alpha = (1.0 - smoothstep(0.20, 1.0, across)) * fade * 0.30;
return float4(float3(5.0, 0.48, 0.025), alpha);'''

create('M_NiagaraFlame', FLAME)
create('M_NiagaraEmber', EMBER)
create('M_NiagaraTrail', TRAIL)
u.log('FLOWARTS_NIAGARA_MATERIALS_COMPLETE')
