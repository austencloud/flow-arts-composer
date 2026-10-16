"""Update only Isolation's native map actors in an already imported project."""

import json
import sys
from pathlib import Path
import unreal as u

project = Path(u.Paths.project_dir()).resolve()
sys.path.insert(0, str(project / "Tools"))
from museum_isolation_lighting import create_isolation_lighting

data = json.loads((project / "Content" / "Data" / "museum.json").read_text(encoding="utf-8"))
level = u.get_editor_subsystem(u.LevelEditorSubsystem)
if not level.load_level("/Game/MuseumGame/Maps/Museum"):
    raise RuntimeError("Could not load Museum level")
create_isolation_lighting(data)
if not level.save_current_level():
    raise RuntimeError("Could not save Museum level")
