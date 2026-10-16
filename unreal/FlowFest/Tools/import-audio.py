"""Import generated WAVs as looping Unreal sound waves."""
import unreal as u
from pathlib import Path

project = Path(u.Paths.project_dir()).resolve()
staged = project / 'Tools' / 'staged' / 'audio'
folder = '/Game/FlowFest/Audio'
tools = u.AssetToolsHelpers.get_asset_tools()
for name in ('WoodlandWind', 'Birds', 'Insects', 'Camp', 'Fire', 'Crowd'):
    source = staged / (name + '.wav')
    if not source.exists():
        raise RuntimeError(f'Missing generated audio: {source}')
    task = u.AssetImportTask()
    task.filename = str(source)
    task.destination_path = folder
    task.destination_name = name
    task.automated = True
    task.replace_existing = True
    task.save = True
    tools.import_asset_tasks([task])
    sound = u.EditorAssetLibrary.load_asset(folder + '/' + name)
    if not sound:
        raise RuntimeError(f'Audio import failed: {name}')
    sound.set_editor_property('looping', True)
    u.EditorAssetLibrary.save_loaded_asset(sound)
u.log('FLOWFEST_AUDIO_IMPORT_COMPLETE')
