"""Restore authored glTF materials on Museum FBX shells (Unreal editor Python)."""
import hashlib
import json
import re
import unreal as u

ED = u.EditorAssetLibrary
ME = u.MaterialEditingLibrary
TOOLS = u.AssetToolsHelpers.get_asset_tools()


def name(value):
    return re.sub(r"[^A-Za-z0-9_]", "_", value)


def expression(material, cls, **values):
    node = ME.create_material_expression(material, cls)
    for key, value in values.items():
        node.set_editor_property(key, value)
    return node


def link(source, output, target, pin):
    if not ME.connect_material_expressions(source, output, target, pin):
        raise RuntimeError(f"Material connection failed: {pin}")


def property_link(source, output, prop):
    if not ME.connect_material_property(source, output, prop):
        raise RuntimeError(f"Material property connection failed: {prop}")


def scalar(material, value):
    return expression(material, u.MaterialExpressionConstant, r=float(value))


def vector(material, value):
    return expression(material, u.MaterialExpressionConstant3Vector,
                      constant=u.LinearColor(*value[:3], 1))


def linear_hex(value):
    """Three Color.set(hex) converts sRGB into its linear working space."""
    channels = [int(value[index:index + 2], 16) / 255 for index in (1, 3, 5)]
    return [channel / 12.92 if channel <= .04045 else ((channel + .055) / 1.055) ** 2.4
            for channel in channels]


def multiply(material, first, second, first_output="", second_output=""):
    node = expression(material, u.MaterialExpressionMultiply)
    link(first, first_output, node, "A")
    link(second, second_output, node, "B")
    return node


def restore_shell_materials(project, shell, mesh):
    staging = project / "Saved" / "Shells"
    manifest = json.loads((staging / (shell + ".materials.json")).read_text(encoding="utf-8"))
    texture_cache = {}
    material_map = {}
    folder = "/Game/MuseumGame/Shells/" + shell
    tuning = manifest.get("browserTuning") or {}

    def sample(material, info, role):
        index = info["index"]
        key = (index, role)
        if key not in texture_cache:
            record = manifest["textures"][index]
            source = staging / record["file"]
            if hashlib.sha256(source.read_bytes()).hexdigest() != record["sha256"]:
                raise RuntimeError(f"Changed source texture: {source}")
            texture_name = "T_" + shell + "_" + str(index) + "_" + role
            texture_path = folder + "/Textures/" + texture_name
            task = u.AssetImportTask()
            task.filename = str(source)
            task.destination_path = folder + "/Textures"
            task.destination_name = texture_name
            task.automated = True
            task.replace_existing = True
            task.save = True
            TOOLS.import_asset_tasks([task])
            texture = ED.load_asset(texture_path)
            if not isinstance(texture, u.Texture2D):
                raise RuntimeError(f"Texture import failed: {texture_path}")
            texture.set_editor_property("srgb", role == "color")
            if role == "normal":
                texture.set_editor_property("compression_settings", u.TextureCompressionSettings.TC_NORMALMAP)
                texture.set_editor_property("flip_green_channel", True)
            elif role == "data":
                texture.set_editor_property("compression_settings", u.TextureCompressionSettings.TC_MASKS)
            ED.save_loaded_asset(texture)
            texture_cache[key] = texture
        sampler = {"color": u.MaterialSamplerType.SAMPLERTYPE_COLOR,
                   "normal": u.MaterialSamplerType.SAMPLERTYPE_NORMAL,
                   "data": u.MaterialSamplerType.SAMPLERTYPE_MASKS}[role]
        node = expression(material, u.MaterialExpressionTextureSample,
                          texture=texture_cache[key], sampler_type=sampler)
        transform = info.get("extensions", {}).get("KHR_texture_transform", {})
        if transform.get("rotation", 0) != 0:
            raise RuntimeError("Museum material importer needs a rotated UV adapter")
        scale = transform.get("scale", [1, 1])
        offset = transform.get("offset", [0, 0])
        uv = expression(material, u.MaterialExpressionTextureCoordinate,
                        coordinate_index=transform.get("texCoord", info.get("texCoord", 0)),
                        u_tiling=scale[0], v_tiling=scale[1])
        if offset != [0, 0]:
            add = expression(material, u.MaterialExpressionAdd)
            shift = expression(material, u.MaterialExpressionConstant2Vector, r=offset[0], g=offset[1])
            link(uv, "", add, "A")
            link(shift, "", add, "B")
            uv = add
        link(uv, "", node, "UVs")
        return node

    for source in manifest["materials"]:
        material_name = "M_" + name(source["name"])
        path = folder + "/Materials/" + material_name
        material = ED.load_asset(path) if ED.does_asset_exist(path) else TOOLS.create_asset(
            material_name, folder + "/Materials", u.Material, u.MaterialFactoryNew())
        # Delete from a snapshot: UE5.8 DeleteAllMaterialExpressions skips nodes
        # while mutating the array it iterates during a reimport.
        for old in list(ME.get_material_expressions(material)):
            ME.delete_material_expression(material, old)
        material.set_editor_property("two_sided", source.get("doubleSided", False))
        pbr = source.get("pbrMetallicRoughness", {})
        tune = tuning.get("overrides", {}).get(source["name"])
        base = linear_hex(tune["base"]) if tune and "base" in tune else pbr.get("baseColorFactor", [1, 1, 1, 1])
        pigment = vector(material, base)
        if "baseColorTexture" in pbr:
            pigment = multiply(material, pigment, sample(material, pbr["baseColorTexture"], "color"), second_output="RGB")
        property_link(pigment, "", u.MaterialProperty.MP_BASE_COLOR)
        roughness = scalar(material, pbr.get("roughnessFactor", 1))
        metallic = scalar(material, pbr.get("metallicFactor", 1))
        if "metallicRoughnessTexture" in pbr:
            packed = sample(material, pbr["metallicRoughnessTexture"], "data")
            roughness = multiply(material, roughness, packed, second_output="G")
            metallic = multiply(material, metallic, packed, second_output="B")
        property_link(roughness, "", u.MaterialProperty.MP_ROUGHNESS)
        property_link(metallic, "", u.MaterialProperty.MP_METALLIC)
        if "normalTexture" in source:
            info = source["normalTexture"]
            normal = sample(material, info, "normal")
            # glTF scales tangent X/Y, retaining Z; UE normal input normalizes.
            normal = multiply(material, normal, vector(material, [info.get("scale", 1), info.get("scale", 1), 1]), first_output="RGB")
            property_link(normal, "", u.MaterialProperty.MP_NORMAL)
        strength = source.get("extensions", {}).get("KHR_materials_emissive_strength", {}).get("emissiveStrength", 1)
        emission = source.get("emissiveFactor", [0, 0, 0])
        if tune:
            strength = tune["intensity"]
            if "color" in tune:
                emission = linear_hex(tune["color"])
        elif "emissiveTexture" in source:
            strength = (strength or 1) * tuning.get("lightmapBoost", 1)
        emissive = vector(material, [v * strength for v in emission])
        if "emissiveTexture" in source:
            emissive = multiply(material, emissive, sample(material, source["emissiveTexture"], "color"), second_output="RGB")
        glow = expression(material, u.MaterialExpressionScalarParameter, parameter_name="GlowScale", default_value=1.0)
        property_link(multiply(material, emissive, glow), "", u.MaterialProperty.MP_EMISSIVE_COLOR)
        # The browser hides flame placement guides; they are not flame art.
        # Growth sections are revealed by the authored progression at runtime.
        if shell == "FirstFire" and ("Growth" in source["name"] or "Flame Guide" in source["name"]):
            material.set_editor_property("blend_mode", u.BlendMode.BLEND_MASKED)
            presence = expression(material, u.MaterialExpressionScalarParameter, parameter_name="Presence",
                                  default_value=0.0 if "Flame Guide" in source["name"] else 1.0)
            property_link(presence, "", u.MaterialProperty.MP_OPACITY_MASK)
        ME.set_base_material_usage(material, u.MaterialUsage.MATUSAGE_INSTANCED_STATIC_MESHES, True)
        ME.layout_material_expressions(material)
        ME.recompile_material(material)
        ED.save_loaded_asset(material)
        material_map[name(source["name"])] = material

    slots = []
    for index, slot in enumerate(mesh.static_materials):
        slot_name = str(slot.material_slot_name)
        material = material_map.get(name(slot_name))
        if not material:
            raise RuntimeError(f"Unmatched authored material: {shell} slot {slot_name}; expected {list(material_map)}")
        mesh.set_material(index, material)
        slots.append({"slot": slot_name, "material": material.get_path_name()})
    ED.save_loaded_asset(mesh)
    u.log(f"MUSEUM_SURFACE_MATERIALS_OK {shell} slots={len(slots)} textures={len(texture_cache)}")
    return {"shell": shell, "sourceSha256": manifest["sourceSha256"], "slots": slots, "textureCount": len(texture_cache)}
