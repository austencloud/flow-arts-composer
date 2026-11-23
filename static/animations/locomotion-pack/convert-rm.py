"""Convert root-motion FBX files to GLB using Blender's Python API.
Run with: blender --background --python convert-rm.py

These are the same animations as the originals but downloaded with
"In Place" OFF so the Hips bone contains XZ displacement data.
The "-rm" suffix distinguishes them from the old in-place versions.
"""
import bpy
import os

script_dir = os.path.dirname(os.path.abspath(__file__))
# Raw FBX sources are kept off the repository. Point ANIMATION_SOURCE_DIR at
# the folder that holds them; without it the script looks beside itself.
source_dir = os.environ.get("ANIMATION_SOURCE_DIR", script_dir)

# Map source FBX -> output GLB
conversions = {
    "idle-rm.fbx": "idle-rm.glb",
    "walking-rm.fbx": "walk-forward-rm.glb",
    "walking-backward-rm.fbx": "walk-backward-rm.glb",
    "strafe-left-rm.fbx": "strafe-left-rm.glb",
    "strafe-right-rm.fbx": "strafe-right-rm.glb",
    "run-rm.fbx": "run-rm.glb",
    "jump-up-rm.fbx": "jump-up-rm.glb",
    "falling-idle-rm.fbx": "falling-idle-rm.glb",
    "falling-to-landing-rm.fbx": "falling-to-landing-rm.glb",
}

for fbx_name, glb_name in conversions.items():
    fbx_path = os.path.join(source_dir, fbx_name)
    glb_path = os.path.join(script_dir, glb_name)

    if not os.path.exists(fbx_path):
        print(f"SKIP (not found): {fbx_name}")
        continue

    print(f"Converting: {fbx_name} -> {glb_name}")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=fbx_path)
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format='GLB',
        export_animations=True,
        export_skins=True,
    )

    print(f"  Done: {glb_name}")

print("All conversions complete!")
