"""Import baked Museum performer FBXs as native Unreal static meshes.

Run with UnrealEditor-Cmd -run=pythonscript after convert-performers.py.
The exported IDs, in catalog order, map to /Game/MuseumGame/Performers/SM_<id>
with hyphens changed to underscores. Meshes are floor-centred in centimetres.
"""
import json
import os
from pathlib import Path

import unreal as u

project = Path(u.Paths.project_dir()).resolve()
staged = project / "Saved" / "Performers"
ids = json.loads((staged / "ids.json").read_text(encoding="utf-8"))
if len(ids) != 16 or len(set(ids)) != 16:
    raise RuntimeError(f"Expected 16 unique performer IDs, got {ids}")
ed = u.EditorAssetLibrary
tools = u.AssetToolsHelpers.get_asset_tools()
folder = "/Game/MuseumGame/Performers"
matlib = u.MaterialEditingLibrary
only_id = os.environ.get("MUSEUM_PERFORMER_ID")
if only_id and only_id not in ids:
    raise RuntimeError(f"Unknown performer ID: {only_id}")
u.SystemLibrary.execute_console_command(None, "Interchange.FeatureFlags.Import.FBX 0")


def texture_asset(path):
    file = Path(path)
    if not file.is_file():
        raise RuntimeError(f"Missing performer texture: {file}")
    name = file.stem
    asset_path = f"{folder}/{name}"
    if not ed.does_asset_exist(asset_path):
        task = u.AssetImportTask()
        task.filename = str(file)
        task.destination_path = folder
        task.destination_name = name
        task.automated = True
        task.replace_existing = False
        task.save = True
        tools.import_asset_tasks([task])
    texture = ed.load_asset(asset_path)
    if not isinstance(texture, u.Texture2D):
        raise RuntimeError(f"Texture import failed: {file} -> {asset_path}")
    return texture


def material_asset(key, index, spec):
    name = f"M_{key}_{index}"
    path = f"{folder}/{name}"
    material = ed.load_asset(path) if ed.does_asset_exist(path) else tools.create_asset(
        name, folder, u.Material, u.MaterialFactoryNew())
    if not isinstance(material, u.Material):
        raise RuntimeError(f"Could not create performer material: {path}")
    matlib.delete_all_material_expressions(material)
    if spec["baseColor"]:
        sample = matlib.create_material_expression(material, u.MaterialExpressionTextureSample)
        sample.set_editor_property("texture", texture_asset(spec["baseColor"]))
        matlib.connect_material_property(sample, "RGB", u.MaterialProperty.MP_BASE_COLOR)
    else:
        color = spec["color"]
        pigment = matlib.create_material_expression(material, u.MaterialExpressionConstant3Vector)
        pigment.set_editor_property("constant", u.LinearColor(float(color[0]), float(color[1]), float(color[2]), 1))
        matlib.connect_material_property(pigment, "", u.MaterialProperty.MP_BASE_COLOR)
    material.set_editor_property("two_sided", True)
    matlib.set_base_material_usage(material, u.MaterialUsage.MATUSAGE_INSTANCED_STATIC_MESHES, True)
    matlib.recompile_material(material)
    if not ed.save_loaded_asset(material):
        raise RuntimeError(f"Could not save performer material: {path}")
    return material

for avatar_id in ids:
    if only_id and avatar_id != only_id:
        continue
    key = avatar_id.replace("-", "_")
    name = f"SM_{key}"
    asset_path = f"{folder}/{name}"
    source = staged / f"{name}.fbx"
    if not source.is_file() or source.stat().st_size < 1024:
        raise RuntimeError(f"Missing converted performer: {source}")
    if not ed.does_asset_exist(asset_path):
        task = u.AssetImportTask()
        task.filename = str(source)
        task.destination_path = folder
        task.destination_name = name
        task.automated = True
        task.replace_existing = False
        task.save = True
        options = u.FbxImportUI()
        options.import_mesh = True
        options.import_as_skeletal = False
        options.mesh_type_to_import = u.FBXImportType.FBXIT_STATIC_MESH
        options.automated_import_should_detect_type = False
        options.import_materials = False
        options.import_textures = False
        options.static_mesh_import_data.combine_meshes = True
        options.static_mesh_import_data.generate_lightmap_u_vs = False
        options.static_mesh_import_data.auto_generate_collision = False
        task.options = options
        tools.import_asset_tasks([task])
    mesh = ed.load_asset(asset_path)
    if not isinstance(mesh, u.StaticMesh):
        raise RuntimeError(f"Performer import failed: {source} -> {asset_path}")
    ext = mesh.get_bounds().box_extent
    height_cm = ext.z * 2
    if not 100 < height_cm < 300:
        raise RuntimeError(f"{avatar_id}: bad imported height {height_cm} cm")
    materials = mesh.get_editor_property("static_materials")
    specs = json.loads((staged / f"{name}.json").read_text(encoding="utf-8"))
    if len(materials) != len(specs) or not materials:
        raise RuntimeError(f"{avatar_id}: {len(materials)} Unreal slots != {len(specs)} source slots")
    for index, spec in enumerate(specs):
        mesh.set_material(index, material_asset(key, index, spec))
    if not ed.save_loaded_asset(mesh):
        raise RuntimeError(f"Could not save performer mesh: {asset_path}")
    if not ed.save_directory(folder, only_if_is_dirty=False, recursive=True):
        raise RuntimeError(f"Could not save performer assets in {folder}")
    u.log(f"MUSEUM_PERFORMER_IMPORTED {avatar_id} {asset_path} {height_cm:.1f}cm {len(materials)} materials")

u.log(f"MUSEUM_PERFORMERS_OK {1 if only_id else len(ids)}")
