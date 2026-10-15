"""Convert the museum's authored glTF shells to FBX for Unreal's static mesh importer.

Run with Blender in background mode. Source files stay in the web app's asset tree;
the FBX intermediates are regenerated in this project's ignored Saved directory.
"""
import bpy
from pathlib import Path

project = Path(__file__).resolve().parents[1]
repo = project.parents[1]
output = project / "Saved" / "Shells"
output.mkdir(parents=True, exist_ok=True)
shells = {
    "DrownedGallery": "cave/drowned-gallery.glb",
    "EarthRootTerrace": "cave/earth-root-terrace.glb",
    "FirstFire": "cave/first-fire-cinder-court.glb",
    "OrderLobbyDressing": "lobby/order-lobby-dressing.glb",
    "OrderLobbyCeiling": "lobby/order-lobby-ceiling.glb",
}
for name, relative in shells.items():
    source = repo / "static" / "models" / "museum" / relative
    target = output / (name + ".fbx")
    if target.exists() and target.stat().st_mtime >= source.stat().st_mtime:
        print("MUSEUM_SHELL_CACHED", name)
        continue
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(source))
    for image in bpy.data.images:
        if image.packed_file:
            image.filepath_raw = str(output / (name + "_" + image.name.replace("/", "_") + ".png"))
            image.file_format = "PNG"
            image.save()
    bpy.ops.export_scene.fbx(
        filepath=str(target),
        object_types={"MESH"},
        apply_unit_scale=True,
        axis_forward="-Y",
        axis_up="Z",
        use_mesh_modifiers=True,
        path_mode="COPY",
        embed_textures=True,
        add_leaf_bones=False,
    )
    print("MUSEUM_SHELL_CONVERTED", name, target)
