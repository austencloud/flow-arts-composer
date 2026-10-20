"""Attempt A: drive a Procedural Vegetation graph from editor Python and export variants.

Imported by grow-trees.py (which registers itself as the grow_trees module first).
"""
import time

import unreal as u
from grow_trees import FORMS, TREES, VEGETATION, family, seed

ED = u.EditorAssetLibrary


def graph_asset(form):
    """The project's graph for this form (PV_<form> under /Game/FlowFest/Vegetation)."""
    path = f"{VEGETATION}/PV_{form.replace('-', '_')}"
    if not ED.does_asset_exist(path):
        raise RuntimeError('Author the graph first: ' + path)
    return ED.load_asset(path)


def configure(graph, name, live, variant_seed):
    found_export = found_seed = False
    for node in graph.get_editor_property('graph').get_editor_property('nodes'):
        settings = node.get_settings()
        if isinstance(settings, u.PVExportSettings):
            params = settings.get_editor_property('export_settings')
            params.set_editor_property('content_browser_folder', u.DirectoryPath(f'{TREES}/{name}'))
            params.set_editor_property('mesh_name', f'{name}_Live' if live else f'{name}_Far')
            params.set_editor_property('export_mesh_type', u.PVExportMeshType.SKELETAL_MESH if live else u.PVExportMeshType.STATIC_MESH)
            params.set_editor_property('create_nanite_foliage', True)
            params.set_editor_property('replace_policy', u.PVAssetReplacePolicy.REPLACE)
            settings.set_editor_property('export_settings', params)
            found_export = True
        if isinstance(settings, u.PVSeedGeneratorSettings):
            settings.set_editor_property('seed', variant_seed)
            found_seed = True
    if not found_export:
        raise RuntimeError('Graph has no Export node')
    if not found_seed:
        raise RuntimeError('Graph has no Seed Generator node')


def run(graph):
    """Execute the graph through a PCG component in the editor world; the export element runs inside generate()."""
    actor = u.EditorLevelLibrary.spawn_actor_from_class(u.PCGVolume, u.Vector(0, 0, 0))
    component = actor.get_component_by_class(u.PCGComponent)
    component.set_editor_property('graph', graph.get_editor_property('graph'))
    component.generate(True)
    return actor


def export_form(form, letters, which='both'):
    letters_tuple, *_rest = FORMS[form]
    graph = graph_asset(form)
    for letter in letters:
        assert letter in letters_tuple, letter
        name = family(form, letter)
        for live in ((True, False) if which == 'both' else ((which == 'live'),)):
            configure(graph, name, live, seed(form, letter))
            ED.save_loaded_asset(graph)
            actor = run(graph)
            target = f"{TREES}/{name}/{name}{'_Live' if live else '_Far'}"
            # Rescan the folder so the registry sees the new asset, retrying briefly while the save flushes.
            for _ in range(30):
                if ED.does_asset_exist(target):
                    break
                u.AssetRegistryHelpers.get_asset_registry().scan_paths_synchronous([f'{TREES}/{name}'], True)
                time.sleep(1)
            u.EditorLevelLibrary.destroy_actor(actor)
            if ED.does_asset_exist(target):
                u.log('FLOWFEST_EXPORTED ' + target)
            else:
                u.log_error('FLOWFEST_EXPORT_FAILED ' + target)
