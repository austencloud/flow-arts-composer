"""Unreal 5.8 editor Python for Flow Fest trees.

Run through UnrealEditor-Cmd.exe <project> -run=pythonscript -script="<this file> <mode> ...".

Modes:
  inspect                       list every asset in each Megaplants pack with its class
  graphs                        copy each pack's vegetation graph to /Game/FlowFest/Vegetation/PV_<form> (skips existing)
  configure <form> live|far     point the form graph's Export nodes at the variant assets (run inside the open editor: py <this file> configure ...)
  packs                         print the height of every tree the packs ship (which trees to adopt)
  adopt                         copy the packs' trees into the family folders as <family>_Live and <family>_Far
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
# Content/Megaplant_Library -> /Game/Megaplant_Library/
PACK_ROOT = '/Game/' + SOURCES['contentFolder'].split('/', 1)[1] + '/'

# form -> (variant letters, height m, crown radius / height, clear bole / height, pack folder, shipped tree per variant)
# The shipped trees are chosen by size (grow-trees.py packs, 2026-10-20): Beech saplings and Elder are under 3 m, so
# beech and hickory stands borrow Hornbeam, walnut and sycamore borrow Black Alder, and boxelder mixes small maples
# with Elder. Every placement is scaled to its own height, so a source near the target height keeps leaves life-size.
FORMS = {
    'sugar-maple-stand':      ('abcd', 22, 0.28, 0.34, 'Tree_Norway_Maple',     ['Tree_Norway_Maple:A', 'Tree_Norway_Maple:B', 'Tree_Hornbeam:C', 'Tree_Hornbeam:D']),
    'silver-maple-damp':      ('abc',  22, 0.38, 0.24, 'Tree_Norway_Maple',     ['Tree_Norway_Maple:B', 'Tree_Norway_Maple:A', 'Tree_Black_Alder:A']),
    'american-sycamore-damp': ('abc',  25, 0.33, 0.28, 'Tree_Norway_Maple',     ['Tree_Black_Alder:A', 'Tree_Black_Alder:C', 'Tree_Black_Alder:B']),
    'american-beech-stand':   ('abc',  20, 0.30, 0.30, 'Tree_European_Beech',   ['Tree_Hornbeam:A', 'Tree_Hornbeam:C', 'Tree_Hornbeam:D']),
    'white-oak-stand':        ('abc',  24, 0.27, 0.32, 'Tree_English_Oak',      ['Tree_English_Oak:A', 'Tree_English_Oak:B', 'Tree_English_Oak:C']),
    'white-oak-open':         ('ab',   20, 0.40, 0.22, 'Tree_English_Oak',      ['Tree_English_Oak:C', 'Tree_English_Oak:B']),
    'black-walnut-stand':     ('abc',  21, 0.26, 0.38, 'Tree_Elder',            ['Tree_Black_Alder:A', 'Tree_Black_Alder:C', 'Tree_Black_Alder:B']),
    'black-walnut-open':      ('ab',   18, 0.36, 0.26, 'Tree_Elder',            ['Tree_Black_Alder:B', 'Tree_Black_Alder:A']),
    'shagbark-hickory-stand': ('abc',  20, 0.23, 0.38, 'Tree_Elder',            ['Tree_Hornbeam:A', 'Tree_Hornbeam:C', 'Tree_Black_Alder:C']),
    'hophornbeam-understory': ('abcd', 11, 0.29, 0.22, 'Tree_Hornbeam',         ['Tree_Hornbeam:B', 'Tree_Hornbeam:D', 'Tree_Hornbeam:C', 'Tree_Hornbeam:A']),
    'boxelder-understory':    ('abcd', 11, 0.46, 0.14, 'Tree_Elder',            ['Tree_Norway_Maple:C', 'Tree_Elder:B', 'Tree_Elder:D', 'Tree_Hornbeam:B']),
    'eastern-redcedar-open':  ('abc',  12, 0.17, 0.06, 'Tree_Japanese_Cypress', ['Tree_Japanese_Cypress:D', 'Tree_Japanese_Cypress:G', 'Tree_Japanese_Cypress:C']),
    'standing-snag':          ('ab',   16, 0.30, 0.00, 'Tree_Dead_Pine',        ['Tree_Dead_Pine:C', 'Tree_Dead_Pine:D']),
}

# pack folder -> the ProceduralVegetation graph asset the pack ships (grow-trees.py inspect, 2026-10-20)
PACK_GRAPHS = {
    'Tree_English_Oak':      'Tree_English_Oak_Forest_01/PVE_English_Oak_Forest_01',
    'Tree_Norway_Maple':     'Tree_Norway_Maple_Forest_01/PVE_Norway_Maple_Forest_01',
    'Tree_European_Beech':   'Tree_European_Beech_Saplings_01/PVE_Tree_European_Beech_Saplings_01',
    'Tree_Hornbeam':         'Tree_Hornbeam_01/PVE_Tree_Hornbeam_01',
    'Tree_Elder':            'Tree_Elder_01/Tree_Elder_01',
    'Tree_Japanese_Cypress': 'Tree_Japanese_Cypress_01/PVE_Tree_Japanese_Cypress_01',
    'Tree_Dead_Pine':        'Tree_Dead_Pine_01/PVE_Tree_Dead_Pine_01',
    'Tree_Black_Alder':      'Tree_Black_Alder_01/PVE_Black_Alder_01',
}


def graph_path(form):
    """The project's graph for one growth form."""
    return f"{VEGETATION}/PV_{form.replace('-', '_')}"


def graphs():
    """Copy each pack's graph to the project's form graph. Existing graphs are kept: they hold hand tuning."""
    for form, (_letters, _h, _c, _b, pack, _sources) in FORMS.items():
        dst = graph_path(form)
        if ED.does_asset_exist(dst):
            u.log('FLOWFEST_GRAPH kept ' + dst)
            continue
        src = PACK_ROOT + pack + '/' + PACK_GRAPHS[pack]
        if ED.duplicate_asset(src, dst) and ED.save_asset(dst):
            u.log(f'FLOWFEST_GRAPH copied {src} -> {dst}')
        else:
            u.log_error(f'FLOWFEST_GRAPH failed {src} -> {dst}')


def export_nodes(form):
    """The Export node settings of one form graph, in a stable order (the editor's loaded objects when run inside it)."""
    package = graph_path(form)
    ED.load_asset(package)
    found = [o for o in u.ObjectIterator(u.PVExportSettings) if o.get_outermost().get_path_name() == package]
    found.sort(key=lambda o: o.get_path_name())
    return found


def configure(form, which):
    """Give each variant letter one Export node: folder, name and mesh type. Extra nodes are left alone."""
    letters, *_rest = FORMS[form]
    nodes = export_nodes(form)
    if len(nodes) < len(letters):
        raise SystemExit(f'FLOWFEST_CONFIGURE {form} needs {len(letters)} Export nodes, graph has {len(nodes)}')
    live = which == 'live'
    for node, letter in zip(nodes, letters):
        name = family(form, letter)
        params = node.get_editor_property('export_settings')
        folder = u.DirectoryPath()
        folder.set_editor_property('path', f'{TREES}/{name}')
        params.set_editor_property('content_browser_folder', folder)
        params.set_editor_property('mesh_name', f"{name}{'_Live' if live else '_Far'}")
        params.set_editor_property('replace_policy', u.PVAssetReplacePolicy.REPLACE)
        params.set_editor_property('export_mesh_type', u.PVExportMeshType.SKELETAL_MESH if live else u.PVExportMeshType.STATIC_MESH)
        params.set_editor_property('create_nanite_foliage', True)
        node.set_editor_property('export_settings', params)
        u.log(f'FLOWFEST_CONFIGURE {node.get_path_name()} -> {TREES}/{name}/{name}{"_Live" if live else "_Far"}')
    for node in nodes[len(letters):]:
        u.log(f'FLOWFEST_CONFIGURE spare {node.get_path_name()} ({node.get_editor_property("export_settings").get_editor_property("mesh_name")})')


def family(form, letter):
    """Asset folder and base name for one variant (site.json family id with '-' replaced by '_')."""
    return f'eztree-{form}-{letter}'.replace('-', '_')


def seed(form, letter):
    """Stable per-variant seed so a re-export reproduces the same tree."""
    return (sum(ord(c) for c in form) * 31 + ord(letter)) % 100000


def pack_trees(pack):
    """The whole-tree skeletal meshes a pack ships, A first (its Instances folder holds branch and leaf parts)."""
    folder = PACK_ROOT + pack + '/' + PACK_GRAPHS[pack].split('/')[0]
    found = []
    for path in ED.list_assets(folder, recursive=False, include_folder=False):
        data = ED.find_asset_data(path)
        if data.get_class().get_name() == 'SkeletalMesh':
            found.append(path.split('.')[0])
    return sorted(found)


def source_tree(spec):
    """'Tree_Hornbeam:C' -> the asset path of that shipped tree."""
    pack, letter = spec.split(':')
    for path in pack_trees(pack):
        if path.endswith('_' + letter):
            return path
    raise SystemExit(f'FLOWFEST_ADOPT no tree {spec}')


def packs():
    for pack in PACK_GRAPHS:
        for path in pack_trees(pack):
            mesh = ED.load_asset(path)
            ext = mesh.get_bounds().box_extent
            u.log(f'FLOWFEST_PACKTREE {pack} {path.rsplit("/", 1)[-1]} height_cm={ext.z * 2:.0f} crown={max(ext.x, ext.y) / max(ext.z * 2, 1):.2f}')


def adopt():
    """Each family takes one of its pack's shipped trees: the skeletal mesh as _Live, a Nanite static mesh with the
    same leaf assembly as _Far."""
    u.AssetRegistryHelpers.get_asset_registry().scan_paths_synchronous([TREES], force_rescan=True)
    for form, (letters, _h, _c, _b, _pack, sources) in FORMS.items():
        for letter, spec in zip(letters, sources):
            src = source_tree(spec)
            name = family(form, letter)
            live = f'{TREES}/{name}/{name}_Live'
            far = f'{TREES}/{name}/{name}_Far'
            stale = [path.split('.')[0] for path in ED.list_assets(f'{TREES}/{name}', recursive=False, include_folder=False)
                     if path.split('.')[0] in (live, far, live + '_Skeleton')]
            if stale and not all(ED.delete_asset(path) for path in stale):
                u.log_error(f'FLOWFEST_ADOPT {name} could not delete {stale}')
                continue
            if not ED.duplicate_asset(src, live):
                u.log_error(f'FLOWFEST_ADOPT {name} failed to copy {src}')
                continue
            mesh = ED.load_asset(live)
            dynamic = u.DynamicMeshPool().request_mesh()
            dynamic, outcome = u.GeometryScript_AssetUtils.copy_mesh_from_skeletal_mesh(
                mesh, dynamic, u.GeometryScriptCopyMeshFromAssetOptions(), u.GeometryScriptMeshReadLOD())
            if outcome != u.GeometryScriptOutcomePins.SUCCESS:
                u.log_error(f'FLOWFEST_ADOPT {name} trunk copy failed {outcome}')
                continue
            options = u.GeometryScriptCreateNewStaticMeshAssetOptions()
            options.set_editor_property('enable_nanite', True)
            static, outcome = u.GeometryScript_NewAssetUtils.create_new_static_mesh_asset_from_mesh(dynamic, far, options)
            if outcome != u.GeometryScriptOutcomePins.SUCCESS or static is None:
                u.log_error(f'FLOWFEST_ADOPT {name} far mesh failed {outcome}')
                continue
            slots = []
            for entry in mesh.get_editor_property('materials'):
                slot = u.StaticMaterial()
                slot.set_editor_property('material_interface', entry.get_editor_property('material_interface'))
                slots.append(slot)
            static.set_editor_property('static_materials', slots)
            leaves = u.FlowFestTreeTools.copy_nanite_assembly(mesh, static)
            saved = ED.save_asset(live) and ED.save_asset(far)
            u.log(f'FLOWFEST_ADOPT {name} <- {src.rsplit("/", 1)[-1]} leaves={leaves} saved={saved}')
    u.FlowFestTreeTools.finish_mesh_compilation()


def inspect():
    for pack in SOURCES['packs']:
        folder = PACK_ROOT + pack['folder']
        if not ED.does_directory_exist(folder):
            u.log_error('FLOWFEST_PACK missing ' + folder)
            continue
        for path in ED.list_assets(folder, recursive=True, include_folder=False):
            data = ED.find_asset_data(path)
            u.log(f"FLOWFEST_PACK {pack['folder']} {data.get_class().get_name()} {path}")


def bounds_extent(asset):
    return asset.get_bounds().box_extent


def measure():
    rows = []
    for form, (letters, height, crown, bole, _pack, _sources) in FORMS.items():
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
    u.FlowFestTreeTools.finish_mesh_compilation()  # pack parts build on load; let them finish before the commandlet exits


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
    elif mode == 'graphs':
        graphs()
    elif mode == 'configure':
        configure(sys.argv[2], sys.argv[3])
    elif mode == 'packs':
        packs()
    elif mode == 'adopt':
        adopt()
    elif mode == 'measure':
        measure()
    elif mode == 'purge-eztree':
        purge_eztree()
    else:
        raise SystemExit('unknown mode ' + mode)
