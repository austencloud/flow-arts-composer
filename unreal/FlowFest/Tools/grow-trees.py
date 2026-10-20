"""Unreal 5.8 editor Python for Flow Fest trees.

Run through UnrealEditor-Cmd.exe <project> -run=pythonscript -script="<this file> <mode> ...".

Modes:
  inspect                       list every asset in each Megaplants pack with its class
  export <form> <letters> [live|far|both]   export variants of one form through its graph (Attempt A)
  measure                       print height and crown ratio of every exported tree
  purge-eztree                  delete the old ez-tree assets from the family folders
"""
import json
import sys
from pathlib import Path

import unreal as u

PROJECT = Path(u.Paths.project_dir()).resolve()
SOURCES = json.loads((PROJECT / 'Tools' / 'tree-sources.json').read_text())
ED = u.EditorAssetLibrary
TREES = '/Game/FlowFest/Assets/Trees'
VEGETATION = '/Game/FlowFest/Vegetation'

# form -> (variant letters, height m, crown radius / height, clear bole / height, pack folder)
FORMS = {
    'sugar-maple-stand':      ('abcd', 22, 0.28, 0.34, 'Megaplants_Norway_Maple_Forest'),
    'silver-maple-damp':      ('abc',  22, 0.38, 0.24, 'Megaplants_Norway_Maple_Forest'),
    'american-sycamore-damp': ('abc',  25, 0.33, 0.28, 'Megaplants_Norway_Maple_Forest'),
    'american-beech-stand':   ('abc',  20, 0.30, 0.30, 'Megaplants_European_Beech_Saplings'),
    'white-oak-stand':        ('abc',  24, 0.27, 0.32, 'Megaplants_English_Oak'),
    'white-oak-open':         ('ab',   20, 0.40, 0.22, 'Megaplants_English_Oak'),
    'black-walnut-stand':     ('abc',  21, 0.26, 0.38, 'Megaplants_Elder'),
    'black-walnut-open':      ('ab',   18, 0.36, 0.26, 'Megaplants_Elder'),
    'shagbark-hickory-stand': ('abc',  20, 0.23, 0.38, 'Megaplants_Elder'),
    'hophornbeam-understory': ('abcd', 11, 0.29, 0.22, 'Megaplants_European_Hornbeam'),
    'boxelder-understory':    ('abcd', 11, 0.46, 0.14, 'Megaplants_Elder'),
    'eastern-redcedar-open':  ('abc',  12, 0.17, 0.06, 'Megaplants_Japanese_Cypress'),
    'standing-snag':          ('ab',   16, 0.30, 0.00, 'Megaplants_Dead_Pine'),
}


def family(form, letter):
    """Asset folder and base name for one variant (site.json family id with '-' replaced by '_')."""
    return f'eztree-{form}-{letter}'.replace('-', '_')


def seed(form, letter):
    """Stable per-variant seed so a re-export reproduces the same tree."""
    return (sum(ord(c) for c in form) * 31 + ord(letter)) % 100000


def inspect():
    for pack in SOURCES['packs']:
        folder = '/Game/Fab/' + pack['folder']
        if not ED.does_directory_exist(folder):
            u.log_error('FLOWFEST_PACK missing ' + folder)
            continue
        for path in ED.list_assets(folder, recursive=True, include_folder=False):
            data = ED.find_asset_data(path)
            u.log(f"FLOWFEST_PACK {pack['folder']} {data.get_class().get_name()} {path}")


def bounds_extent(asset):
    if isinstance(asset, u.StaticMesh):
        return asset.get_bounds().box_extent
    return asset.get_imported_bounds().box_extent


def measure():
    rows = []
    for form, (letters, height, crown, bole, _pack) in FORMS.items():
        for letter in letters:
            name = family(form, letter)
            for suffix in ('_Live', '_Far'):
                path = f'{TREES}/{name}/{name}{suffix}'
                asset = ED.load_asset(path) if ED.does_asset_exist(path) else None
                if asset is None:
                    rows.append((name + suffix, 'MISSING'))
                    continue
                extent = bounds_extent(asset)
                mesh_height = extent.z * 2
                crown_ratio = max(extent.x, extent.y) / mesh_height if mesh_height else 0
                ok = abs(crown_ratio - crown) <= 0.15 * max(crown, 0.1) + 0.03
                rows.append((name + suffix, f'height_cm={mesh_height:.0f} crown_ratio={crown_ratio:.2f} target={crown:.2f} {"ok" if ok else "OFF"}'))
    for row in rows:
        u.log('FLOWFEST_TREE ' + ' '.join(row))


def purge_eztree():
    """Delete the old ez-tree static mesh, its materials and textures from each family folder."""
    for form, (letters, *_rest) in FORMS.items():
        for letter in letters:
            name = family(form, letter)
            folder = f'{TREES}/{name}'
            if not ED.does_directory_exist(folder):
                continue
            keep = (f'{name}_Live', f'{name}_Far')
            for path in ED.list_assets(folder, recursive=True, include_folder=False):
                asset_name = path.rsplit('/', 1)[-1].split('.')[0]
                if asset_name.startswith(keep):
                    continue
                if ED.delete_asset(path):
                    u.log('FLOWFEST_PURGED ' + path)
                else:
                    u.log_error('FLOWFEST_PURGE_FAILED ' + path)


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'inspect'
    if mode == 'inspect':
        inspect()
    elif mode == 'measure':
        measure()
    elif mode == 'purge-eztree':
        purge_eztree()
    elif mode == 'export':
        # grow_trees_export imports this file's tables under the name grow_trees.
        sys.modules['grow_trees'] = sys.modules[__name__]
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from grow_trees_export import export_form
        export_form(sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else 'both')
    else:
        raise SystemExit('unknown mode ' + mode)
