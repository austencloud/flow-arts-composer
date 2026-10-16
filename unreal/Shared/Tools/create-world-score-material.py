"""Create the exposure-stable, opaque native world-widget material.

Run in Unreal Editor with the FlowArtsRuntime plugin mounted. The result is
/FlowArtsRuntime/Effects/Materials/M_WorldScore, which the score component loads.
"""
import unreal as u


# The opaque widget asset is a MaterialInstanceConstant. Its graph lives in
# Widget3DPassThrough, so duplicate that parent and apply the opaque settings.
OPAQUE_TEMPLATE = "/Engine/EngineMaterials/Widget3DPassThrough_Opaque"
DEST = "/FlowArtsRuntime/Effects/Materials/M_WorldScore"
EDIT = u.MaterialEditingLibrary
ASSETS = u.EditorAssetLibrary
EMISSIVE = u.MaterialProperty.MP_EMISSIVE_COLOR


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def parameter_names(material):
    return {
        str(node.get_editor_property("parameter_name"))
        for node in EDIT.get_material_expressions(material)
        if isinstance(node, (u.MaterialExpressionTextureSampleParameter,
                             u.MaterialExpressionVectorParameter,
                             u.MaterialExpressionScalarParameter))
    }


def parameter_node(material, name, node_class):
    matches = [node for node in EDIT.get_material_expressions(material)
               if isinstance(node, node_class)
               and str(node.get_editor_property("parameter_name")) == name]
    require(len(matches) == 1, f"Expected one {name} parameter in {DEST}, found {len(matches)}")
    return matches[0]


opaque = ASSETS.load_asset(OPAQUE_TEMPLATE)
require(isinstance(opaque, u.MaterialInstanceConstant),
        f"Missing UE opaque widget material instance: {OPAQUE_TEMPLATE}")
source = opaque.get_editor_property("parent")
while source and not isinstance(source, u.Material):
    source = source.get_editor_property("parent")
require(isinstance(source, u.Material),
        f"Could not resolve the graph material for {OPAQUE_TEMPLATE}")
source_path = source.get_path_name()
require(EDIT.get_material_property_input_node(source, EMISSIVE),
        "Engine widget material has no emissive graph to preserve")
require({"SlateUI", "TintColorAndOpacity", "OpacityFromTexture"} <= parameter_names(source),
        "Engine widget material interface changed; inspect before adapting it")

if ASSETS.does_asset_exist(DEST):
    material = ASSETS.load_asset(DEST)
    require(isinstance(material, u.Material), f"Existing {DEST} is not a material")
    require({"SlateUI", "TintColorAndOpacity", "OpacityFromTexture"} <= parameter_names(material),
            f"Existing {DEST} lost the widget parameter interface")
else:
    material = ASSETS.duplicate_asset(source_path, DEST)
    require(isinstance(material, u.Material), f"Could not duplicate {source_path} to {DEST}")

material.set_editor_property("material_domain", u.MaterialDomain.MD_SURFACE)
material.set_editor_property("blend_mode", u.BlendMode.BLEND_OPAQUE)
material.set_editor_property("shading_model", u.MaterialShadingModel.MSM_UNLIT)
material.set_editor_property("two_sided", False)

# The opaque engine instance overrides switches on its parent. Duplicating only
# the parent graph leaves those overrides behind and displays its checker
# default. Keep the original SlateUI texture node, but drive color directly.
slate = parameter_node(material, "SlateUI", u.MaterialExpressionTextureSampleParameter)
tint = parameter_node(material, "TintColorAndOpacity", u.MaterialExpressionVectorParameter)
adaptation = EDIT.get_material_property_input_node(material, EMISSIVE)
if not isinstance(adaptation, u.MaterialExpressionEyeAdaptationInverse):
    adaptation = EDIT.create_material_expression(
        material, u.MaterialExpressionEyeAdaptationInverse, 450, -120)
require(adaptation, "Could not create EyeAdaptationInverse")
inputs = EDIT.get_inputs_for_material_expression(material, adaptation)
color = next((node for node in inputs if isinstance(node, u.MaterialExpressionMultiply)), None)
if not color:
    color = EDIT.create_material_expression(material, u.MaterialExpressionMultiply, 210, -120)
require(color, "Could not create widget color multiply")
require(EDIT.connect_material_expressions(slate, "", color, "A"),
        "Could not connect SlateUI render target to widget color")
require(EDIT.connect_material_expressions(tint, "", color, "B"),
        "Could not connect widget tint to widget color")
require(EDIT.connect_material_expressions(color, "", adaptation, ""),
        "Could not connect widget color to EyeAdaptationInverse")
require(EDIT.connect_material_property(adaptation, "", EMISSIVE),
        "Could not connect exposure-stable color to emissive")
errors = EDIT.recompile_material(material)
require(not errors, f"World score material compile failed: {errors}")
require(ASSETS.save_loaded_asset(material), f"Could not save {DEST}")
u.log(f"FLOWARTS_WORLD_SCORE_MATERIAL_READY {DEST}")
