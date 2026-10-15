"""Create reproducible native map and materials after the C++ editor build."""
import json
from pathlib import Path
import unreal as u

project = Path(u.Paths.project_dir()).resolve()
data = json.loads((project / "Content" / "Data" / "museum.json").read_text(encoding="utf-8"))
if data.get("version") != 1 or len(data.get("rooms", [])) < 20:
    raise RuntimeError("Museum export is incomplete")

ed = u.EditorAssetLibrary
tools = u.AssetToolsHelpers.get_asset_tools()
matlib = u.MaterialEditingLibrary
u.SystemLibrary.execute_console_command(None, "Interchange.FeatureFlags.Import.FBX 0")

for shell in ("DrownedGallery", "EarthRootTerrace", "FirstFire"):
    source = project / "Saved" / "Shells" / (shell + ".fbx")
    if not source.is_file():
        raise RuntimeError(f"Missing converted cave shell: {source}")
    folder = "/Game/MuseumGame/Shells/" + shell
    target = folder + "/SM_" + shell
    if ed.does_asset_exist(target):
        continue
    task = u.AssetImportTask()
    task.filename = str(source)
    task.destination_path = folder
    task.destination_name = "SM_" + shell
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
    options.static_mesh_import_data.combine_meshes = True
    options.static_mesh_import_data.generate_lightmap_u_vs = False
    options.static_mesh_import_data.auto_generate_collision = False
    task.options = options
    tools.import_asset_tasks([task])
    asset = ed.load_asset(target)
    if not asset:
        raise RuntimeError(f"Failed to import {target}")
    ed.save_loaded_asset(asset)
    u.log(f"MUSEUM_SHELL_IMPORTED {shell} {asset.get_bounds().box_extent}")

def material(name, color, roughness):
    path = "/Game/MuseumGame/Materials/" + name
    if ed.does_asset_exist(path):
        return ed.load_asset(path)
    m = tools.create_asset(name, "/Game/MuseumGame/Materials", u.Material, u.MaterialFactoryNew())
    matlib.delete_all_material_expressions(m)
    pigment = matlib.create_material_expression(m, u.MaterialExpressionConstant3Vector)
    pigment.set_editor_property("constant", u.LinearColor(*color, 1))
    matlib.connect_material_property(pigment, "", u.MaterialProperty.MP_BASE_COLOR)
    matte = matlib.create_material_expression(m, u.MaterialExpressionConstant)
    matte.set_editor_property("r", roughness)
    matlib.connect_material_property(matte, "", u.MaterialProperty.MP_ROUGHNESS)
    matlib.set_base_material_usage(m, u.MaterialUsage.MATUSAGE_INSTANCED_STATIC_MESHES, True)
    matlib.layout_material_expressions(m)
    matlib.recompile_material(m)
    ed.save_loaded_asset(m)

material("M_Floor", (.24, .245, .235), .82)
material("M_Wall", (.12, .13, .14), .88)
material("M_Display", (.56, .38, .16), .42)
material("M_Performer", (.38, .41, .44), .68)
material("M_Furniture", (.24, .17, .12), .75)

map_path = "/Game/MuseumGame/Maps/Museum"
level = u.get_editor_subsystem(u.LevelEditorSubsystem)
if not ed.does_asset_exist(map_path):
    if not level.new_level(map_path):
        raise RuntimeError("Could not create museum level")
    spawn = data["spawn"]
    start = u.EditorLevelLibrary.spawn_actor_from_class(
        u.PlayerStart,
        u.Vector(float(spawn["x"]) * 50, float(spawn["y"]) * 50, 150),
        u.Rotator(0, 0, 0),
    )
    if not start:
        raise RuntimeError("Could not place PlayerStart")
    sky = u.EditorLevelLibrary.spawn_actor_from_class(u.SkyLight, u.Vector(0, 0, 500))
    if sky:
        sky.get_editor_property("light_component").set_editor_property("intensity", .45)
    level.save_current_level()
ed.save_directory("/Game/MuseumGame", only_if_is_dirty=True, recursive=True)
u.log("MUSEUM_ASSETS_OK")
