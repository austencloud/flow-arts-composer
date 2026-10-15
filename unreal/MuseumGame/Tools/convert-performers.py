"""Bake deployed avatar GLBs to floor-centred static FBX meshes for MuseumGame.

Run with Blender 5 in background mode. Source avatars remain untouched; FBX and
texture intermediates live under ignored Saved/Performers. Each resulting mesh
uses metres in Blender, faces the source avatar's forward direction, and has
its feet at local Z=0. Unreal's FBX importer converts metres to centimetres.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

import bpy
from mathutils import Vector

project = Path(__file__).resolve().parents[1]
repo = project.parents[1]
output = project / "Saved" / "Performers"
parser = argparse.ArgumentParser()
parser.add_argument("--source-root", type=Path, help="Repository containing static/models/avatars/_optimized")
parser.add_argument("--id", action="append", help="Convert only this deployed avatar ID")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

if args.source_root:
    source_root = args.source_root.resolve()
else:
    source_root = repo
    if not (source_root / "static/models/avatars/_optimized").is_dir():
        common = subprocess.check_output(
            ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
            cwd=repo, text=True,
        ).strip()
        source_root = Path(common).resolve().parent
output.mkdir(parents=True, exist_ok=True)
manifest_path = output / "characters.json"
subprocess.run(
    ["node", str(repo / "unreal/Shared/Tools/character-catalog.mjs"),
     "--source-root", str(args.source_root.resolve() if args.source_root else repo),
     "--output", str(manifest_path)],
    check=True,
)
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
if manifest.get("schema") != "flow-arts-native-characters-v1":
    raise RuntimeError(f"Unsupported native character manifest: {manifest_path}")
characters = manifest["characters"]
ids = [character["id"] for character in characters]
if len(ids) != 16 or len(set(ids)) != 16:
    raise RuntimeError(f"Expected 16 unique deployed avatars, got {ids}")
if args.id and set(args.id) - set(ids):
    raise RuntimeError(f"Unknown deployed avatar IDs: {sorted(set(args.id) - set(ids))}")

for character in characters:
    avatar_id = character["id"]
    if args.id and avatar_id not in args.id:
        continue
    glb = source_root / character["sourceRelativePath"]
    if not glb.is_file():
        raise RuntimeError(f"Missing deployed avatar: {glb}")
    key = character["key"]
    fbx = output / f"SM_{key}.fbx"
    if fbx.is_file() and fbx.stat().st_mtime >= max(glb.stat().st_mtime, Path(__file__).stat().st_mtime):
        print("MUSEUM_PERFORMER_CACHED", avatar_id, fbx)
        continue
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(glb))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"
              and any(mod.type == "ARMATURE" for mod in obj.modifiers)]
    if not meshes:
        raise RuntimeError(f"Avatar has no meshes: {avatar_id}")
    # Material image paths must outlive this Blender session for FBX import.
    image_files = {}
    for index, image in enumerate(bpy.data.images):
        if image.source != "FILE" or not (image.packed_file or image.has_data):
            continue
        target_image = output / f"{key}_T_{index}.png"
        image.save_render(str(target_image))
        image_files[image.name] = str(target_image)
    bpy.ops.object.select_all(action="DESELECT")
    for mesh in meshes:
        mesh.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    # Apply the source rest pose and skinning, leaving no skeletal dependency.
    bpy.ops.object.convert(target="MESH")
    baked = list(bpy.context.selected_objects)
    for mesh in baked:
        world = mesh.matrix_world.copy()
        mesh.parent = None
        mesh.matrix_world = world
    bpy.context.view_layer.objects.active = baked[0]
    bpy.ops.object.join()
    figure = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    vertices = figure.data.vertices
    minimum = Vector((min(v.co.x for v in vertices), min(v.co.y for v in vertices), min(v.co.z for v in vertices)))
    maximum = Vector((max(v.co.x for v in vertices), max(v.co.y for v in vertices), max(v.co.z for v in vertices)))
    centre_x = (minimum.x + maximum.x) / 2
    centre_y = (minimum.y + maximum.y) / 2
    for vertex in vertices:
        vertex.co.x -= centre_x
        vertex.co.y -= centre_y
        vertex.co.z -= minimum.z
    height = maximum.z - minimum.z
    if not 1.0 < height < 5.0:
        raise RuntimeError(f"{avatar_id}: unexpected avatar height {height:.3f} m")
    # Two source rigs include unusually large bind-pose extents. Keep their
    # recognizable geometry but fit the museum's human-scale station contract.
    if height > 2.4:
        scale = 1.8 / height
        for vertex in vertices:
            vertex.co *= scale
        print("MUSEUM_PERFORMER_NORMALIZED", avatar_id, f"{height:.3f}m", "to 1.800m")
        height = 1.8
    figure.name = f"SM_{key}"
    def base_color_image(material):
        shader = next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
        if not shader:
            return None
        visited = set()
        def upstream(socket):
            for link in socket.links:
                node = link.from_node
                if node in visited:
                    continue
                visited.add(node)
                if node.type == "TEX_IMAGE" and node.image:
                    return image_files.get(node.image.name)
                for input_socket in node.inputs:
                    result = upstream(input_socket)
                    if result:
                        return result
            return None
        return upstream(shader.inputs["Base Color"])
    specs = [{"name": material.name, "baseColor": base_color_image(material),
              "color": list(material.diffuse_color)} for material in figure.data.materials]
    (output / f"SM_{key}.json").write_text(json.dumps(specs, indent=2) + "\n", encoding="utf-8")
    bpy.ops.export_scene.fbx(
        filepath=str(fbx), use_selection=True, object_types={"MESH"},
        apply_unit_scale=True, axis_forward="-Y", axis_up="Z",
        use_mesh_modifiers=True, path_mode="COPY", embed_textures=True,
        add_leaf_bones=False,
    )
    if not fbx.is_file() or fbx.stat().st_size < 1024:
        raise RuntimeError(f"Performer FBX export failed: {fbx}")
    print("MUSEUM_PERFORMER_CONVERTED", avatar_id, f"{height:.3f}m", fbx)

(output / "ids.json").write_text(json.dumps(ids, indent=2) + "\n", encoding="utf-8")
print("MUSEUM_PERFORMERS_CONVERTED", len(args.id or ids))
