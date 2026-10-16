"""Convert authored museum GLBs to FBX, retaining source PBR sidecars for Unreal."""
import bpy
import json
import subprocess
from pathlib import Path


def extend_fire_earth_rock_join():
    """Carry Fire's authored tunnel lip into Earth's rock at their portal."""
    rock = bpy.data.objects.get("FF_Rock_Lane")
    if rock is None or rock.type != "MESH":
        raise RuntimeError("First Fire corridor rock is missing")

    def smoothstep(value):
        value = max(0.0, min(1.0, value))
        return value * value * (3.0 - 2.0 * value)

    # In source GLB coordinates Fire's east lip ends near x=30.47 (world 90.72),
    # while Earth's west rock begins near world x=91.44-91.60 at this portal.
    # The authored blocks meet at world x=91.05, but production relief leaves
    # a visible 0.7-1.0 m gap. This FBX-only adapter stretches Fire's existing
    # tunnel tongue 1.2 m into Earth, retaining its floor, walls, UVs and
    # material. The y fade leaves adjacent rock away from this door untouched.
    # Fire's 5.5 m crown also remains open above Earth's ~3.2 m crown if only
    # the tongue is extended. Taper its upper surface into Earth's lower roof,
    # keeping the roof at or above 3.1 m across the portal centerline.
    # On the right of the L-turn, Fire's lip is 0.7 m south of Earth's wall at
    # eye height and 1.4 m south near the crown. Bend this existing side wall
    # inward over its final metres so the dead-end edge meets Earth's rock;
    # the left/north turn stays open.
    changed = 0
    for vertex in rock.data.vertices:
        x, y = vertex.co.x, vertex.co.y
        weight = smoothstep((x - 28.0) / 2.0) * smoothstep((-y - 7.5) / 1.5)
        if weight:
            vertex.co.x += 1.2 * weight
            changed += 1
        roof_weight = smoothstep((vertex.co.x - 29.0) / 2.0) * smoothstep((-y - 7.5) / 1.5)
        if vertex.co.z > 3.1 and roof_weight:
            vertex.co.z -= (vertex.co.z - 3.1) * 0.97 * roof_weight
        side_weight = smoothstep((vertex.co.x - 29.0) / 2.2) * smoothstep((-y - 11.8) / 2.4)
        if side_weight:
            upper = smoothstep((vertex.co.z - 2.0) / 1.0)
            vertex.co.y += (0.75 + 0.75 * upper) * side_weight
    if changed < 100:
        raise RuntimeError("First Fire corridor rock no longer matches the join")
    print("MUSEUM_FIRE_EARTH_ROCK_JOIN", changed)


project = Path(__file__).resolve().parents[1]
output = project / "Saved" / "Shells"
output.mkdir(parents=True, exist_ok=True)
subprocess.run(["node", str(project / "Tools" / "prepare-shells.mjs")], check=True)
for name in ("DrownedGallery", "EarthRootTerrace", "FirstFire", "OrderLobbyDressing", "OrderLobbyCeiling"):
    source = output / (name + ".glb")
    target = output / (name + ".fbx")
    manifest = json.loads((output / (name + ".materials.json")).read_text(encoding="utf-8"))
    conversion_key = manifest["sourceSha256"] + (":fire-earth-rock-join-v3" if name == "FirstFire" else ":material-slots-v2")
    receipt = output / (name + ".fbx.sha256")
    if target.exists() and receipt.exists() and receipt.read_text() == conversion_key:
        print("MUSEUM_SHELL_CACHED", name)
        continue
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    # Prevent Blender from suffixing material names left over from other shells.
    for material in list(bpy.data.materials):
        if material.users == 0:
            bpy.data.materials.remove(material)
    bpy.ops.import_scene.gltf(filepath=str(source))
    # EXT_mesh_gpu_instancing can share geometry between objects with different
    # material overrides. FBX requires a stable layout for each mesh datablock.
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            materials = [slot.material for slot in obj.material_slots]
            obj.data = obj.data.copy()
            for index, material in enumerate(materials):
                obj.material_slots[index].link = "DATA"
                obj.material_slots[index].material = material
    if name == "FirstFire":
        extend_fire_earth_rock_join()
    bpy.ops.export_scene.fbx(
        filepath=str(target), object_types={"MESH"}, apply_unit_scale=True,
        axis_forward="-Y", axis_up="Z", use_mesh_modifiers=True,
        path_mode="STRIP", embed_textures=False, add_leaf_bones=False,
    )
    receipt.write_text(conversion_key)
    print("MUSEUM_SHELL_CONVERTED", name, target)
