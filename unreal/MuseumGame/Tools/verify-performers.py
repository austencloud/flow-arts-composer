"""Read back saved performer meshes, materials, and texture references in Unreal."""
import json
from pathlib import Path

import unreal as u

folder = "/Game/MuseumGame/Performers"
staged = Path(u.Paths.project_dir()) / "Saved" / "Performers"
ids = json.loads((staged / "ids.json").read_text(encoding="utf-8"))
if len(ids) != 16 or len(set(ids)) != 16:
    raise RuntimeError("Expected 16 unique performer IDs")
ed = u.EditorAssetLibrary
slot_count = 0
textured_count = 0
texture_names = set()
for avatar_id in ids:
    key = avatar_id.replace("-", "_")
    mesh_path = f"{folder}/SM_{key}"
    mesh = ed.load_asset(mesh_path)
    if not isinstance(mesh, u.StaticMesh):
        raise RuntimeError(f"Missing native static mesh: {mesh_path}")
    height = mesh.get_bounds().box_extent.z * 2
    if not 100 < height < 300:
        raise RuntimeError(f"Implausible performer height: {mesh_path} {height}")
    specs = json.loads((staged / f"SM_{key}.json").read_text(encoding="utf-8"))
    slots = mesh.get_editor_property("static_materials")
    if len(slots) != len(specs) or not slots:
        raise RuntimeError(f"Material slot count mismatch: {mesh_path}")
    for index, spec in enumerate(specs):
        mat_path = f"{folder}/M_{key}_{index}"
        mat = slots[index].get_editor_property("material_interface")
        if not isinstance(mat, u.Material) or mat.get_path_name().split(".")[0] != mat_path:
            raise RuntimeError(f"Wrong material in {mesh_path} slot {index}: {mat}")
        slot_count += 1
        if spec["baseColor"]:
            tex_name = Path(spec["baseColor"]).stem
            tex_path = f"{folder}/{tex_name}"
            tex = ed.load_asset(tex_path)
            if not isinstance(tex, u.Texture2D):
                raise RuntimeError(f"Missing base color texture: {tex_path}")
            if mat_path not in ed.find_package_referencers_for_asset(tex_path, True):
                raise RuntimeError(f"Texture is not referenced by {mat_path}: {tex_path}")
            textured_count += 1
            texture_names.add(tex_name)
    u.log(f"MUSEUM_PERFORMER_VERIFIED {avatar_id} {height:.1f}cm {len(slots)} slots")
u.log(f"MUSEUM_PERFORMERS_VERIFIED {len(ids)} meshes {slot_count} materials {textured_count} textured_slots {len(texture_names)} textures")
