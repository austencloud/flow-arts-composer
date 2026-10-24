"""Unreal Editor Python: audit imported prop meshes and authored appearance assets."""
import hashlib
import json
import sys
from pathlib import Path
import unreal as u

project = Path(u.Paths.project_dir()).resolve()
catalog_path = project / 'Content/Data/props.json'
original_catalog_bytes = catalog_path.read_bytes()
catalog = json.loads(original_catalog_bytes)
sys.path.insert(0, str(project / 'Tools'))
from prop_capsule_cover import build_cover, validate_cover
# Metadata-only regeneration reads the ALREADY imported meshes; no reimport,
# Blender job, asset save, or packaged CPU-access flag is required.
generate_clearance = '-FlowFestGeneratePropClearance' in u.SystemLibrary.get_command_line()
cover_report = {}

def mesh_triangles(mesh):
    vertices, triangles = [], []
    for section in range(mesh.get_num_sections(0)):
        points, indices, _, _, _ = u.ProceduralMeshLibrary.get_section_from_static_mesh(mesh, 0, section)
        if len(indices) % 3: raise ValueError('Invalid imported triangle index count')
        offset = len(vertices)
        vertices.extend((float(p.x), float(p.y), float(p.z)) for p in points)
        triangles.extend(tuple(offset + int(indices[i+j]) for j in range(3)) for i in range(0, len(indices), 3))
    if not triangles: raise ValueError('Imported mesh has no readable triangles')
    return vertices, triangles
registry = u.AssetRegistryHelpers.get_asset_registry()
assets = registry.get_assets_by_path('/Game/FlowFest/Props', recursive=False)
classes = {}
for asset in assets:
    kind = str(asset.asset_class_path.asset_name)
    classes[kind] = classes.get(kind, 0) + 1

failures = []
slots = {}
for prop in catalog['props']:
    for variant in prop['variants']:
        for field in ('mesh', 'rightMesh'):
            path = variant.get(field)
            if not path:
                continue
            mesh = u.EditorAssetLibrary.load_asset(path)
            if not isinstance(mesh, u.StaticMesh):
                failures.append(f'{path}: missing StaticMesh')
                continue
            cover_field = 'rightClearanceCapsules' if field == 'rightMesh' else 'clearanceCapsules'
            try:
                if generate_clearance or cover_field in variant:
                    vertices, triangles = mesh_triangles(mesh)
                    capsules = build_cover(vertices, triangles) if generate_clearance else variant[cover_field]
                    cover_report[path] = validate_cover(vertices, triangles, capsules)
                    asset_file = project / 'Content' / (path.removeprefix('/Game/').split('.')[0] + '.uasset')
                    cover_report[path]['assetSHA256'] = hashlib.sha256(asset_file.read_bytes()).hexdigest()
                    if generate_clearance:
                        variant[cover_field] = capsules
                        variant['clearanceSpace'] = 'ue-static-mesh-local-cm-v1'
            except Exception as exc:
                failures.append(f'{path}: clearance cover: {exc}')
            materials = mesh.get_editor_property('static_materials')
            slots[path] = len(materials)
            if not materials or any(not item.material_interface for item in materials):
                failures.append(f'{path}: empty material slot')
            extent = mesh.get_bounds().box_extent
            if min(extent.x, extent.y, extent.z) <= 0:
                failures.append(f'{path}: zero geometry bound')

report = {'meshCount': len(slots), 'classes': classes,
          'materialSlotsMin': min(slots.values()) if slots else 0,
          'materialSlotsMax': max(slots.values()) if slots else 0,
          'clearanceGenerated': generate_clearance, 'clearanceCovers': cover_report,
          'errors': failures}
(project / 'Saved/validate-props-report.json').write_text(json.dumps(report, indent=2))
if failures:
    raise RuntimeError('Prop asset validation failed: ' + '; '.join(failures))
if generate_clearance:
    # Atomic replacement only after ALL variants pass complete-triangle coverage.
    previous = project / 'Saved/props-before-clearance.json'
    if not previous.exists(): previous.write_bytes(original_catalog_bytes)
    temporary = catalog_path.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(catalog, indent=2))
    temporary.replace(catalog_path)
u.log(f"FLOWFEST_PROPS_VALIDATED {len(slots)} meshes {classes}")
