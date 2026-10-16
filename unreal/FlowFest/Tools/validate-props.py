"""Unreal Editor Python: audit imported prop meshes and authored appearance assets."""
import json
from pathlib import Path
import unreal as u

project = Path(u.Paths.project_dir()).resolve()
catalog = json.loads((project / 'Content/Data/props.json').read_text())
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
          'errors': failures}
(project / 'Saved/validate-props-report.json').write_text(json.dumps(report, indent=2))
if failures:
    raise RuntimeError('Prop asset validation failed: ' + '; '.join(failures))
u.log(f"FLOWFEST_PROPS_VALIDATED {len(slots)} meshes {classes}")
