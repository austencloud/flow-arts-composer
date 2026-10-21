# Flow Fest Nanite Trees Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, inline in the main session (Austen's Agent Budget rule: no subagent per task, one review at the end). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the native Flow Fest build's 39 ez-tree meshes with species grown in Unreal 5.8's Procedural Vegetation Editor from free Quixel Megaplants, rendered as Nanite Foliage with Dynamic Wind, at the measured placements the site export already provides.

**Architecture:** Thirteen vegetation graphs (one per growth form) export 39 `_Live` Nanite Foliage skeletal meshes with wind data and 39 `_Far` Nanite static meshes into `/Game/FlowFest/Assets/Trees/<family>/`. `AFlowFestWorld::BuildTrees` keeps reading `site.json` and the collision cylinders, but the 677 near trees go on one `UInstancedSkinnedMeshComponent` per family (batched `AddInstances`, bounds override, tick off) and the 2,162 backdrop trees stay on hierarchical instanced static meshes pointed at `_Far`. A config switch (`[FlowFest.Trees] NearLayer=Far`) is the measured fallback. The world actor pushes one breeze into `UDynamicWindSubsystem`, varied by time of day.

**Tech Stack:** Unreal Engine 5.8.3 (`C:\Program Files\Epic Games\UE_5.8`), C++ module `FlowFest`, plugins PCG + DynamicWind + ProceduralVegetationEditor (all Experimental), editor Python (`-run=pythonscript`), PowerShell tooling in `unreal/FlowFest/Tools/`, Quixel Megaplants from Fab (free, Fab Standard License).

**Spec:** `docs/superpowers/specs/2026-10-20-flow-fest-nanite-trees-design.md` (approved 2026-10-20).

**Standing rules for the executor:**
- Nothing is bought. The two optional paid leaf atlases need a separate yes from Austen after he has seen the Elder-based trees.
- Austen signs in to Epic himself. Never enter credentials.
- d2 was unreachable over SSH on 2026-10-20 (two timeouts). Retry `ssh d2 hostname` before Task 10; if it answers and has `C:\Program Files\Epic Games\UE_5.8`, package there, otherwise package on this PC and say so in the report.
- The primary checkout `E:/tka-platform` stays on `main`. All edits happen in the worktree from Task 1.
- Every "done" needs proof: a log line, a test result line, a screenshot reviewed before Austen sees it.

---

## File map

| Path (under `unreal/FlowFest/` unless absolute) | Responsibility |
| --- | --- |
| `FlowFest.uproject` | Enable PCG, DynamicWind, ProceduralVegetationEditor |
| `Config/DefaultEngine.ini` | `r.Nanite.Foliage=True` |
| `Config/DefaultGame.ini` | `[FlowFest.Trees] NearLayer=Live` |
| `Source/FlowFest/FlowFest.Build.cs` | Add `DynamicWind` module |
| `Source/FlowFest/FlowFestWorld.h` / `.cpp` | New `BuildTrees`, `UpdateBreeze`, tree counts |
| `Source/FlowFest/FlowFestTreeTests.cpp` (new) | `FlowFest.Environment.Trees` automation test |
| `Tools/tree-sources.json` (new) | Fab ids, licenses, species map, bark surfaces |
| `Tools/grow-trees.py` (new) | Editor Python: inspect packs, export variants, measure, purge ez-tree assets |
| `Tools/bootstrap.ps1` | Tree stage, `-SkipTrees` |
| `Tools/prepare-assets.mjs`, `Tools/import-assets.py` | Stop converting and re-materialising ez-trees |
| `README.md`, `CREDITS.md`, `VERIFICATION.md` | Describe the grown forest |
| `E:/worktrees/tka-platform/nanite-trees` | Worktree, branch `nanite-trees` |
| `E:/FlowFestForest58` | Delivery folder (`Builds`, `Project`, `Shared`, `Evidence`, `README.md`) |

## Growth forms

Family ids are `eztree-<form>-<letter>` (letters a, b, c, d for the variants). Asset folders and names replace `-` with `_`, so `eztree-white-oak-stand-a` lives at `/Game/FlowFest/Assets/Trees/eztree_white_oak_stand_a/eztree_white_oak_stand_a_Live` and `..._Far`. Targets come from `src/routes/test/flow-fest-sim/flow-fest-tree-species.ts`.

| Form | Variants | Megaplants source | Height m | Crown radius / height | Clear bole / height | Foliage tint (HSL offsets) | Bark tint |
| --- | --- | --- | --- | --- | --- | --- | --- |
| sugar-maple-stand | a b c d | Norway Maple Forest | 22 | 0.28 | 0.34 | 0.012, 0.06, 0.01 | -0.01, -0.04, -0.02 |
| silver-maple-damp | a b c | Norway Maple Forest | 22 | 0.38 | 0.24 | 0.0, -0.06, 0.07 | 0.0, -0.1, 0.04 |
| american-sycamore-damp | a b c | Norway Maple Forest leaves, pale bark (see Task 7) | 25 | 0.33 | 0.28 | 0.005, 0.0, 0.045 | 0.01, -0.2, 0.16 |
| american-beech-stand | a b c | European Beech Saplings | 20 | 0.30 | 0.30 | 0.02, 0.02, 0.035 | 0.01, -0.12, 0.1 |
| white-oak-stand | a b c | English Oak | 24 | 0.27 | 0.32 | -0.006, 0.02, -0.01 | 0.005, -0.05, 0.02 |
| white-oak-open | a b | English Oak | 20 | 0.40 | 0.22 | -0.01, 0.045, 0.005 | 0.005, -0.04, 0.03 |
| black-walnut-stand | a b c | Elder leaves, Black Alder bark | 21 | 0.26 | 0.38 | 0.008, -0.03, 0.02 | 0.01, -0.02, -0.06 |
| black-walnut-open | a b | Elder leaves, Black Alder bark | 18 | 0.36 | 0.26 | 0.01, -0.02, 0.03 | 0.01, -0.02, -0.05 |
| shagbark-hickory-stand | a b c | Elder leaves, Black Alder bark | 20 | 0.23 | 0.38 | 0.02, -0.01, 0.0 | 0.0, -0.06, -0.04 |
| hophornbeam-understory | a b c d | European Hornbeam | 11 | 0.29 | 0.22 | -0.01, -0.04, -0.05 | 0.005, -0.14, 0.04 |
| boxelder-understory | a b c d | Elder | 11 | 0.46 | 0.14 | 0.03, 0.02, 0.06 | 0.0, -0.08, 0.0 |
| eastern-redcedar-open | a b c | Japanese Cypress | 12 | 0.17 | 0.06 | -0.02, -0.05, -0.1 | 0.02, -0.05, -0.05 |
| standing-snag | a b | Dead Pine | 16 | 0.30 | 0 | none | 0.0, -0.55, -0.06 |

Season: mid-May full leaf-out, fresh green. The snag has no foliage.

---

### Execution note (2026-10-20)

Tasks 4 and 7 changed route. The Procedural Vegetation exporter writes assets only from its toolbar button (`FPVEditor::OnExport` -> `SPVExportSelectionDialog` -> `FPVExporter::Export`, editor-private, no Python entry), so growing 39 families meant driving 26 export dialogs by hand. Austen chose the scripted route instead: `grow-trees.py adopt` copies each pack's shipped tree (already Nanite Foliage with Dynamic Wind data) as `_Live`, and builds `_Far` from it with Geometry Script plus `UFlowFestTreeTools::CopyNaniteAssembly`, which carries the Nanite leaf assembly (its node list is protected from Python) onto the static mesh. The per-form crown tuning in Task 7 is replaced by picking a shipped tree of about the right height per family (`FORMS` in `grow-trees.py`); Beech saplings and Elder are under 3 m, so beech and hickory borrow Hornbeam and walnut and sycamore borrow Black Alder. The white oak pilot was exported from its graph before the change and is overwritten by adopt; `graphs` and `configure` stay for custom trees.

## Task 1: Worktree, Content junction, baseline build

**Files:**
- Create: `E:/worktrees/tka-platform/nanite-trees` (worktree), junction `E:/worktrees/tka-platform/nanite-trees/unreal/FlowFest/Content`

- [ ] **Step 1: Create the worktree on a new branch from main**

```powershell
git -C E:/tka-platform worktree add E:/worktrees/tka-platform/nanite-trees -b nanite-trees
```
Expected: `Preparing worktree (new branch 'nanite-trees')`.

- [ ] **Step 2: Junction the untracked Content folder into the worktree**

`Content/` is gitignored, so the worktree has none. Point it at the primary checkout's folder (one copy of the assets, the editor sees Source and Content together):

```powershell
cmd /c mklink /J E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\Content E:\tka-platform\unreal\FlowFest\Content
```
Expected: `Junction created for ...`. `unreal/Shared` is tracked (`git ls-files unreal/Shared` lists files), so it needs no junction.

- [ ] **Step 3: Build the editor target from the worktree as the baseline**

```powershell
pwsh E:/worktrees/tka-platform/nanite-trees/unreal/FlowFest/Tools/bootstrap.ps1 -SourceRoot E:/tka-platform -SkipAssetGeneration -SkipImport
```
Expected: ends with `Flow Fest native bootstrap completed: E:\worktrees\...\FlowFest.uproject`. This also creates the `node_modules` junction the tools need. Runs on this PC because d2 is unreachable; note that in the report.

- [ ] **Step 4: Confirm the current trees still load from the junction**

```powershell
& "C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor-Cmd.exe" E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\FlowFest.uproject -ExecCmds="Automation RunTests FlowFest.Environment.EcologyAndSoundAssets; Quit" -unattended -nop4 -nosplash -RenderOffscreen -log -abslog=E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\Saved\automation-baseline.log
Select-String -Path E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\Saved\automation-baseline.log -Pattern 'Test Completed. Result='
```
Expected: `Result={Passed}` for the ecology test. This proves the worktree plus junction is a working project before anything changes.

---

### Task 2: Plugins, renderer setting, module dependency, source manifest

**Files:**
- Modify: `unreal/FlowFest/FlowFest.uproject`
- Modify: `unreal/FlowFest/Config/DefaultEngine.ini` (RendererSettings block)
- Modify: `unreal/FlowFest/Config/DefaultGame.ini`
- Modify: `unreal/FlowFest/Source/FlowFest/FlowFest.Build.cs`
- Create: `unreal/FlowFest/Tools/tree-sources.json`

All paths in this and later tasks are under `E:/worktrees/tka-platform/nanite-trees/`.

- [ ] **Step 1: Enable the plugins**

Replace the `"Plugins"` array in `FlowFest.uproject` with:

```json
  "Plugins": [
    {"Name": "FlowArtsRuntime", "Enabled": true},
    {"Name": "ProceduralMeshComponent", "Enabled": true},
    {"Name": "PythonScriptPlugin", "Enabled": true},
    {"Name": "EditorScriptingUtilities", "Enabled": true},
    {"Name": "Interchange", "Enabled": true},
    {"Name": "PCG", "Enabled": true},
    {"Name": "DynamicWind", "Enabled": true},
    {"Name": "ProceduralVegetationEditor", "Enabled": true},
    {"Name": "AndroidFileServer", "Enabled": false}
  ]
```

- [ ] **Step 2: Turn on Nanite Foliage**

In `Config/DefaultEngine.ini`, add one line to the `[/Script/Engine.RendererSettings]` block after `r.Nanite.ProjectEnabled=True`:

```ini
r.Nanite.Foliage=True
```
(`URendererSettings::bEnableNaniteFoliage`, console variable `r.Nanite.Foliage`, requires an editor restart.)

- [ ] **Step 3: Add the near-layer switch**

Append to `Config/DefaultGame.ini`:

```ini
[FlowFest.Trees]
; Live = Nanite Foliage skinned near trees with Dynamic Wind. Far = Nanite static near trees (the measured fallback).
NearLayer=Live
```

- [ ] **Step 4: Add the Dynamic Wind module dependency**

Replace the dependency line in `Source/FlowFest/FlowFest.Build.cs` with:

```csharp
        PublicDependencyModuleNames.AddRange(new[] { "Core", "CoreUObject", "Engine", "FlowArtsRuntime", "AnimationCore", "InputCore", "ProceduralMeshComponent", "Json", "JsonUtilities", "AssetRegistry", "Slate", "SlateCore", "DynamicWind" });
```

- [ ] **Step 5: Write the source manifest**

Create `Tools/tree-sources.json`:

```json
{
  "license": "Fab Standard License (free Quixel Megaplants, for use inside this Unreal project)",
  "claimedBy": "Austen Cloud, Fab library, 2026-10-20",
  "contentFolder": "Content/Fab",
  "packs": [
    {"id": "83642c38-7661-4df1-8629-0422e1898d26", "name": "Megaplants: English Oak", "folder": "Megaplants_English_Oak", "feeds": ["white-oak-stand", "white-oak-open"]},
    {"id": "e789ad04-cf79-4973-adb0-85c794d77144", "name": "Megaplants: Norway Maple Forest", "folder": "Megaplants_Norway_Maple_Forest", "feeds": ["sugar-maple-stand", "silver-maple-damp", "american-sycamore-damp"]},
    {"id": "6867d008-fc3a-404e-9e53-087eccdcd722", "name": "Megaplants: European Beech Saplings", "folder": "Megaplants_European_Beech_Saplings", "feeds": ["american-beech-stand"]},
    {"id": "43679e75-6ed0-4b03-9288-9e2bc49376d2", "name": "Megaplants: European Hornbeam", "folder": "Megaplants_European_Hornbeam", "feeds": ["hophornbeam-understory"]},
    {"id": "fe7a58b3-19fe-4249-b496-2214b32650b3", "name": "Megaplants: Elder", "folder": "Megaplants_Elder", "feeds": ["black-walnut-stand", "black-walnut-open", "shagbark-hickory-stand", "boxelder-understory"]},
    {"id": "0843f3cf-41c1-4980-b46a-3df5742ddaef", "name": "Megaplants: Japanese Cypress", "folder": "Megaplants_Japanese_Cypress", "feeds": ["eastern-redcedar-open"]},
    {"id": "bc9e4e89-fcf4-4be6-b0f0-8b37395a72de", "name": "Megaplants: Dead Pine", "folder": "Megaplants_Dead_Pine", "feeds": ["standing-snag"]},
    {"id": "9257b627-e37a-4112-82c7-4a99c1a8aec6", "name": "Megaplants: Black Alder", "folder": "Megaplants_Black_Alder", "feeds": ["black-walnut-stand", "black-walnut-open", "shagbark-hickory-stand"]}
  ],
  "barkSurfaces": [],
  "notes": [
    "folder is the name Fab's Add to Project gives the pack under Content/Fab; correct it in Task 4 if the download names it differently.",
    "barkSurfaces gains an entry {\"form\", \"source\", \"url\", \"license\"} for every bark texture that does not come from a pack above (Task 7)."
  ]
}
```

- [ ] **Step 6: Rebuild the editor and start it once so the plugins register**

```powershell
pwsh E:/worktrees/tka-platform/nanite-trees/unreal/FlowFest/Tools/bootstrap.ps1 -SourceRoot E:/tka-platform -SkipAssetGeneration -SkipImport
& "C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor-Cmd.exe" E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\FlowFest.uproject -run=pythonscript -script="import unreal; unreal.log('FLOWFEST_PLUGINS ' + str([c for c in dir(unreal) if c.startswith('PV') or c.startswith('DynamicWind')][:12]))" -unattended -nop4 -nosplash -RenderOffscreen
```
Expected: build succeeds; the log line lists `PVExportSettings`, `PVGrowerSettings`, `DynamicWindSubsystem` among the names (the plugins' classes are now scriptable).

- [ ] **Step 7: Commit**

```powershell
git -C E:/worktrees/tka-platform/nanite-trees add unreal/FlowFest/FlowFest.uproject unreal/FlowFest/Config/DefaultEngine.ini unreal/FlowFest/Config/DefaultGame.ini unreal/FlowFest/Source/FlowFest/FlowFest.Build.cs unreal/FlowFest/Tools/tree-sources.json
git -C E:/worktrees/tka-platform/nanite-trees commit -m "Flow Fest: enable Nanite Foliage, Dynamic Wind and the vegetation editor; record Megaplants sources"
```

---

### Task 3: Claim and download the eight Megaplants packs

**Files:**
- Creates: `unreal/FlowFest/Content/Fab/<pack folder>/` for each pack (gitignored, lands in the primary checkout through the junction)

Claiming a pack writes to Austen's Fab library and Fab bounces the click to Epic's sign-in page (`epicgames.com/id/login`, `prompt=select_account`) even when fab.com shows him signed in. That sign-in is his action.

- [ ] **Step 1: Ask Austen to sign in on the Claude tab**

The Claude in Chrome tab (tab group window, currently on the Epic sign-in page) needs one sign-in from him. Ask for exactly that, then continue with Task 4 and later tasks that do not need the packs (Task 5 and Task 6 compile without them) until he answers.

- [ ] **Step 2: Claim each pack**

For each listing id in `Tools/tree-sources.json`, in that tab: navigate to `https://www.fab.com/listings/<id>`, wait 5 s, run

```javascript
const add=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Add to My Library'); if(add){add.click();} ({clicked:!!add})
```
wait 5 s, then read the buttons again. Expected after the click: no `Add to My Library` button, the page stays on the listing, and `https://www.fab.com/library` lists the pack. A pack already in the library shows no Add button on first load; that counts as claimed.

Alternative if the Epic page keeps coming back: the editor's own Fab window (Unreal editor, `Window > Fab`) uses the Epic Games Launcher session, which Austen already uses for the engine. Search each pack name there and press `Add to Project`; this claims and downloads in one go.

- [ ] **Step 3: Download into the project**

Open the editor on the worktree project (`UnrealEditor.exe E:\worktrees\...\FlowFest.uproject`), `Window > Fab`, `My Library`, and for each of the eight packs press `Add to Project` (engine version 5.8). Drive this with the computer-use tools. Expected: eight folders under `Content/Fab/`.

- [ ] **Step 4: Verify and fix the folder names in the manifest**

```powershell
Get-ChildItem E:\tka-platform\unreal\FlowFest\Content\Fab -Directory | Select-Object -ExpandProperty Name
```
Expected: eight names. If any differs from `folder` in `tree-sources.json`, update the JSON to the real name and commit it.

```powershell
git -C E:/worktrees/tka-platform/nanite-trees add unreal/FlowFest/Tools/tree-sources.json
git -C E:/worktrees/tka-platform/nanite-trees commit -m "Flow Fest: Megaplants pack folder names as downloaded"
```

---

### Task 4: Pilot one species end to end (white oak from English Oak)

**Files:**
- Create: `unreal/FlowFest/Tools/grow-trees.py`
- Creates assets: `/Game/FlowFest/Vegetation/PV_white_oak_stand` (graph), `/Game/FlowFest/Assets/Trees/eztree_white_oak_stand_a/eztree_white_oak_stand_a_Live` and `_Far`

This task decides how the other twelve forms are grown. Two attempts, in order; the first that exports a correct asset wins.

- [ ] **Step 1: Write the inspect and measure parts of grow-trees.py**

```python
"""Unreal 5.8 editor Python for Flow Fest trees.

Modes:
  inspect            list every asset in each Megaplants pack with its class
  export <form> <letters> [live|far|both]   export variants of one form (Attempt A, Task 4)
  measure            print height and crown ratio of every exported tree
  purge-eztree       delete the old ez-tree assets from the family folders
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

# form -> (variant letters, height m, crown radius / height, clear bole / height, pack folder key)
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

def measure():
    rows = []
    for form, (letters, height, crown, bole, _) in FORMS.items():
        for letter in letters:
            name = family(form, letter)
            for suffix, cls in (('_Live', u.SkeletalMesh), ('_Far', u.StaticMesh)):
                path = f'{TREES}/{name}/{name}{suffix}'
                asset = ED.load_asset(path) if ED.does_asset_exist(path) else None
                if asset is None:
                    rows.append((name + suffix, 'MISSING'))
                    continue
                extent = asset.get_bounds().box_extent if isinstance(asset, u.StaticMesh) else asset.get_imported_bounds().box_extent
                mesh_height = extent.z * 2
                crown_ratio = max(extent.x, extent.y) / mesh_height
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
        from grow_trees_export import export_form  # added in Step 3
        export_form(sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else 'both')
    else:
        raise SystemExit('unknown mode ' + mode)
```

- [ ] **Step 2: Run inspect and read what the English Oak pack contains**

```powershell
& "C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor-Cmd.exe" E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\FlowFest.uproject -run=pythonscript -script="E:/worktrees/tka-platform/nanite-trees/unreal/FlowFest/Tools/grow-trees.py inspect" -unattended -nop4 -nosplash -RenderOffscreen -log -abslog=E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\Saved\grow-inspect.log
Select-String -Path E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\Saved\grow-inspect.log -Pattern 'FLOWFEST_PACK Megaplants_English_Oak'
```
Expected: lines naming the pack's classes. Record in the task notes which of these the pack ships: `ProceduralVegetation` (a whole graph), `ProceduralVegetationGrowerPreset`, `ProceduralVegetationGrowthDataAsset`, `ProceduralVegetationPlantProfileDataAsset`, `PVWindSettings`, `SkeletalMesh`, `StaticMesh`, `MaterialInstanceConstant`, `Texture2D`. The export in Step 3 needs a `ProceduralVegetation` asset to execute; if the pack ships only presets and meshes, create one first in the editor (`Content Browser > Add > Procedural Vegetation`, saved as `/Game/FlowFest/Vegetation/PV_white_oak_stand`) with a Preset Loader node pointed at the pack's grower preset, a Grower, Foliage Palette using the pack's leaf meshes, Mesh Builder, and Export; that authoring is Attempt B below.

- [ ] **Step 3: Attempt A, scripted export (bounded at two hours)**

Create `Tools/grow_trees_export.py`:

```python
"""Attempt A: drive a Procedural Vegetation graph from editor Python and export variants."""
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
    for node in graph.get_editor_property('nodes'):
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
            # Property name confirmed by help(u.PVSeedGeneratorSettings) in Step 2's log; 'seed' is the plugin's name for it.
            settings.set_editor_property('seed', variant_seed)
            found_seed = True
    if not found_export:
        raise RuntimeError('Graph has no Export node')
    if not found_seed:
        raise RuntimeError('Graph has no Seed Generator node')

def run(graph):
    """Execute the graph through a PCG component in the editor world and wait for the export."""
    world = u.UnrealEditorSubsystem().get_editor_world()
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
            # The export element runs on the main thread inside generate(); rescan the folder so the
            # registry sees the new asset, retrying briefly in case the save is still flushing.
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
```

Author the pilot graph for Attempt A to drive: open the editor on the worktree project, double-click the English Oak pack's `ProceduralVegetation` asset (or create one as Step 2 describes), `File > Save As` into `/Game/FlowFest/Vegetation/PV_white_oak_stand`. Then run:

```powershell
& "C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor-Cmd.exe" E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\FlowFest.uproject -run=pythonscript -script="E:/worktrees/tka-platform/nanite-trees/unreal/FlowFest/Tools/grow-trees.py export white-oak-stand a both" -unattended -nop4 -nosplash -RenderOffscreen -log -abslog=E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\Saved\grow-pilot.log
Select-String -Path E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\Saved\grow-pilot.log -Pattern 'FLOWFEST_EXPORT'
```
Expected if Attempt A works: `FLOWFEST_EXPORTED /Game/FlowFest/Assets/Trees/eztree_white_oak_stand_a/eztree_white_oak_stand_a_Live` and `..._Far`. Fix property names from the error text (`help(u.PVSeedGeneratorSettings)` and `help(u.PVExportParams)` print the real names) for at most two hours of attempts. If the graph never executes through a PCG component (the vegetation editor may run graphs only inside its own editor), stop and go to Step 4.

- [ ] **Step 4: Attempt B, export from the vegetation editor window**

Drive the editor with the computer-use tools:
1. Open `/Game/FlowFest/Vegetation/PV_white_oak_stand` (double-click in the Content Browser). The Procedural Vegetation editor opens with the graph and a viewport.
2. Select the `Seed Generator` node; in Details set `Seed` to `seed('white-oak-stand', 'a')` (print it: `python -c "print((sum(ord(c) for c in 'white-oak-stand')*31+ord('a'))%100000)"`).
3. Select the `Grower` node; adjust height, trunk and crown parameters toward 24 m, bole 0.32, crown 0.27 (the viewport grid shows metres).
4. Select the `Export` node; in Details set `Content Browser Folder` to `/Game/FlowFest/Assets/Trees/eztree_white_oak_stand_a`, `Mesh Name` to `eztree_white_oak_stand_a_Live`, `Export Mesh Type` to `Skeletal Mesh`, `Create Nanite Foliage` on, `Wind Settings` to the plugin's default tree wind preset (the pack's own `PVWindSettings` asset if it ships one).
5. Press the toolbar `Export` button (the Export node's own button in 5.8). Wait for the asset to appear in the Content Browser.
6. Change `Mesh Name` to `eztree_white_oak_stand_a_Far`, `Export Mesh Type` to `Static Mesh`, press Export again.
7. `Ctrl+S` to save the graph.

Expected: both assets exist. Record in the task notes which attempt worked and which fields had to be set; every later form follows the same recipe.

- [ ] **Step 5: Measure and look at the pilot**

```powershell
& "C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor-Cmd.exe" E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\FlowFest.uproject -run=pythonscript -script="E:/worktrees/tka-platform/nanite-trees/unreal/FlowFest/Tools/grow-trees.py measure" -unattended -nop4 -nosplash -RenderOffscreen -log -abslog=E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\Saved\grow-measure.log
Select-String -Path E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\Saved\grow-measure.log -Pattern 'FLOWFEST_TREE eztree_white_oak_stand_a'
```
Expected: `eztree_white_oak_stand_a_Live height_cm=... crown_ratio=0.2x target=0.27 ok` and the same for `_Far`. Then open the `_Live` asset in the editor's skeletal mesh viewer, take a screenshot with the computer-use tools, and judge it yourself before Austen sees it: full May canopy, oak leaf shape, bark reads as oak, no gaps at branch joins. Adjust the Grower and re-export until it passes.

- [ ] **Step 6: Commit the tooling**

```powershell
git -C E:/worktrees/tka-platform/nanite-trees add unreal/FlowFest/Tools/grow-trees.py unreal/FlowFest/Tools/grow_trees_export.py
git -C E:/worktrees/tka-platform/nanite-trees commit -m "Flow Fest: grow-trees tooling (inspect, export, measure, purge) with the white oak pilot"
```

---

### Task 5: Placement on Nanite Foliage with the static fallback, and the breeze

**Files:**
- Modify: `unreal/FlowFest/Source/FlowFest/FlowFestWorld.h`
- Modify: `unreal/FlowFest/Source/FlowFest/FlowFestWorld.cpp` (includes, `BuildTrees`, `SetTimeOfDay`, `Tick`, `BuildPeople` tick enable)

- [ ] **Step 1: Header additions**

In `FlowFestWorld.h`, add after `class UHierarchicalInstancedStaticMeshComponent;`:

```cpp
class UInstancedSkinnedMeshComponent;
class UDynamicWindData;
```

Add in the `public:` block after `GetTimeOfDay()`:

```cpp
    UFUNCTION(BlueprintPure, Category="Flow Fest|Site")
    int32 GetNearTreeCount() const { return NearTreeCount; }

    UFUNCTION(BlueprintPure, Category="Flow Fest|Site")
    int32 GetBackdropTreeCount() const { return BackdropTreeCount; }
```

Add in the `private:` block after `InstanceGroups`:

```cpp
    UPROPERTY(Transient) TArray<TObjectPtr<UInstancedSkinnedMeshComponent>> TreeLiveGroups;
    UPROPERTY(Transient) TObjectPtr<UDynamicWindData> TreeWindData;
    int32 NearTreeCount = 0;
    int32 BackdropTreeCount = 0;
    bool bLiveNearTrees = true;
    FVector BreezeCenter = FVector::ZeroVector;
```

Add after `void BuildTrees();`:

```cpp
    void UpdateBreeze();
```

- [ ] **Step 2: Includes**

In `FlowFestWorld.cpp`, add after `#include "Components/HierarchicalInstancedStaticMeshComponent.h"`:

```cpp
#include "Components/InstancedSkinnedMeshComponent.h"
#include "DynamicWindData.h"
#include "DynamicWindParameters.h"
#include "DynamicWindSubsystem.h"
#include "Engine/SkeletalMesh.h"
#include "Misc/ConfigCacheIni.h"
```

- [ ] **Step 3: Replace BuildTrees**

Replace the whole `AFlowFestWorld::BuildTrees()` function with:

```cpp
void AFlowFestWorld::BuildTrees()
{
    // [FlowFest.Trees] NearLayer=Live|Far in DefaultGame.ini, or -ini:Game:[FlowFest.Trees]:NearLayer=Far on the command line.
    FString NearLayer = TEXT("Live");
    GConfig->GetString(TEXT("FlowFest.Trees"), TEXT("NearLayer"), NearLayer, GGameIni);
    bLiveNearTrees = !NearLayer.Equals(TEXT("Far"), ESearchCase::IgnoreCase);
    TreeWindData = NewObject<UDynamicWindData>(this, TEXT("TreeWind"));

    // The near trees use simple invisible trunks for walking collision. HiddenInGame
    // only affects rendering; the instances retain their BlockAll collision bodies.
    UHierarchicalInstancedStaticMeshComponent* Trunks = AddInstanceGroup(BasicMesh(TEXT("/Engine/BasicShapes/Cylinder.Cylinder")), TEXT("TreeTrunkCollision"));
    if (Trunks)
    {
        Trunks->SetCollisionProfileName(TEXT("BlockAll"));
        Trunks->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
        Trunks->SetHiddenInGame(true);
        Trunks->SetCastShadow(false);
    }

    struct FTreeBatch
    {
        UStaticMesh* Far = nullptr;
        USkeletalMesh* Live = nullptr;
        float MeshCm = 0.f;
        bool bBackdrop = false;
        TArray<FTransform> Transforms;
        FBox Bounds = FBox(ForceInit);
    };
    TMap<FString, FTreeBatch> Batches;
    TSet<FString> Missing;
    NearTreeCount = 0;
    BackdropTreeCount = 0;

    for (int32 Layer = 0; Layer < 2; ++Layer)
    {
        const bool bBackdrop = Layer == 1;
        const bool bLive = !bBackdrop && bLiveNearTrees;
        for (const FSiteTree& Tree : bBackdrop ? BackdropTrees : Trees)
        {
            if (Tree.Family.IsEmpty() || Tree.Height <= 0.f) continue;
            const FString GroupKey = Tree.Family + (bBackdrop ? TEXT("_backdrop") : TEXT("_near"));
            if (Missing.Contains(GroupKey)) continue;
            FTreeBatch* Batch = Batches.Find(GroupKey);
            if (!Batch)
            {
                FString Normalized = Tree.Family;
                Normalized.ReplaceInline(TEXT("-"), TEXT("_"));
                const FString Folder = FString::Printf(TEXT("/Game/FlowFest/Assets/Trees/%s"), *Normalized);
                FTreeBatch New;
                New.bBackdrop = bBackdrop;
                if (bLive)
                {
                    New.Live = LoadObject<USkeletalMesh>(nullptr, *FString::Printf(TEXT("%s/%s_Live.%s_Live"), *Folder, *Normalized, *Normalized));
                    if (New.Live) New.MeshCm = New.Live->GetBounds().BoxExtent.Z * 2.f;
                }
                else
                {
                    New.Far = LoadObject<UStaticMesh>(nullptr, *FString::Printf(TEXT("%s/%s_Far.%s_Far"), *Folder, *Normalized, *Normalized));
                    if (New.Far) New.MeshCm = New.Far->GetBounds().BoxExtent.Z * 2.f;
                }
                if (!New.Live && !New.Far)
                {
                    UE_LOG(LogTemp, Warning, TEXT("Flow Fest tree asset missing: %s/%s_%s"), *Folder, *Normalized, bLive ? TEXT("Live") : TEXT("Far"));
                    Missing.Add(GroupKey);
                    continue;
                }
                Batch = &Batches.Add(GroupKey, MoveTemp(New));
            }
            const float Scale = Tree.Height * MetresToCm / FMath::Max(1.f, Batch->MeshCm);
            const FVector Location = ToWorld(Tree.Position.X, Tree.Position.Y);
            // Three.js +Y rotations reverse when source (x,y,z) maps to UE (x,z,y).
            Batch->Transforms.Add(FTransform(FRotator(0.f, -FMath::RadiansToDegrees(Tree.Rotation), 0.f), Location, FVector(Scale)));
            const float Reach = Tree.Height * MetresToCm;
            Batch->Bounds += FBox(Location - FVector(Reach, Reach, 0.f), Location + FVector(Reach, Reach, Reach * 1.2f));
            if (!bBackdrop && Trunks)
            {
                const float TrunkHeightCm = FMath::Min(300.f, Tree.Height * MetresToCm * 0.45f);
                Trunks->AddInstance(FTransform(FRotator::ZeroRotator, ToWorld(Tree.Position.X, Tree.Position.Y, TrunkHeightCm * 0.5f), FVector(0.5f, 0.5f, TrunkHeightCm / 100.f)));
            }
        }
    }

    for (TPair<FString, FTreeBatch>& Pair : Batches)
    {
        FTreeBatch& Batch = Pair.Value;
        const FString Name = TEXT("Trees_") + Pair.Key;
        if (Batch.Live)
        {
            // One skinned component per family. Instances arrive in one batch, the bounds are
            // set before registration, and the component never ticks: the wind lives on the GPU.
            UInstancedSkinnedMeshComponent* Group = NewObject<UInstancedSkinnedMeshComponent>(this, FName(*Name));
            Group->SetupAttachment(SiteRoot);
            Group->SetSkinnedAsset(Batch.Live);
            Group->SetTransformProvider(TreeWindData);
            Group->SetCollisionEnabled(ECollisionEnabled::NoCollision);
            Group->PrimaryComponentTick.bCanEverTick = false;
            Group->SetPrimitiveBoundsOverride(Batch.Bounds);
            Group->RegisterComponent();
            TArray<int32> Animations;
            Animations.Init(0, Batch.Transforms.Num());
            Group->AddInstances(Batch.Transforms, Animations, false, true);
            TreeLiveGroups.Add(Group);
            NearTreeCount += Batch.Transforms.Num();
        }
        else
        {
            UHierarchicalInstancedStaticMeshComponent* Group = AddInstanceGroup(Batch.Far, Name);
            if (Batch.bBackdrop) Group->SetCullDistances(18000, 110000);
            Group->AddInstances(Batch.Transforms, false, true);
            if (Batch.bBackdrop) BackdropTreeCount += Batch.Transforms.Num();
            else NearTreeCount += Batch.Transforms.Num();
        }
    }
    UE_LOG(LogTemp, Display, TEXT("Flow Fest trees: %d near (%s), %d backdrop, %d families missing"),
           NearTreeCount, bLiveNearTrees ? TEXT("Nanite Foliage") : TEXT("Nanite static"), BackdropTreeCount, Missing.Num());
    UpdateBreeze();
}

void AFlowFestWorld::UpdateBreeze()
{
    UDynamicWindSubsystem* Wind = GetWorld() ? GetWorld()->GetSubsystem<UDynamicWindSubsystem>() : nullptr;
    if (!Wind || TreeLiveGroups.IsEmpty()) return;
    if (const APawn* Player = UGameplayStatics::GetPlayerPawn(this, 0)) BreezeCenter = Player->GetActorLocation();
    // Calm at night, gusty through the afternoon: the same sun altitude the sky uses.
    const float Daylight = FMath::Clamp(FMath::Sin((TimeOfDay - 6.f) * PI / 12.f), 0.f, 1.f);
    FDynamicWindParameters Params;
    Params.SimulationCenter = BreezeCenter;
    Params.SimulationExtents = 60000.f;
    // Prevailing south-westerly, in UE axes (site east is +X, site south is +Y).
    Params.WindDirection = FVector(0.77f, -0.64f, 0.f);
    Params.WindSpeed = FMath::Lerp(4.f, 14.f, Daylight);
    Params.WindAmplitude = FMath::Lerp(0.25f, 1.f, Daylight);
    Wind->UpdateWindParameters(Params);
}
```

- [ ] **Step 4: Hook the breeze into time of day and the tick**

In `SetTimeOfDay`, add as the last line of the function:

```cpp
    UpdateBreeze();
```

In `Tick(float DeltaSeconds)`, add as the first statement after `Super::Tick(DeltaSeconds);`:

```cpp
    if (!TreeLiveGroups.IsEmpty())
    {
        if (const APawn* Player = UGameplayStatics::GetPlayerPawn(this, 0))
            if (FVector::DistSquared(Player->GetActorLocation(), BreezeCenter) > FMath::Square(1000.f)) UpdateBreeze();
    }
```

In `BuildPeople`, change the last line to:

```cpp
    SetActorTickEnabled(People.Num() > 0 || FireLight != nullptr || !TreeLiveGroups.IsEmpty());
```

- [ ] **Step 5: Build**

```powershell
& 'C:\Program Files\Epic Games\UE_5.8\Engine\Build\BatchFiles\Build.bat' FlowFestEditor Win64 Development -Project=E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\FlowFest.uproject -WaitMutex -NoHotReloadFromIDE -MaxParallelActions=8 -NoUBA
```
Expected: `Total execution time` with no errors.

- [ ] **Step 6: Run the game once with the pilot and read the log**

```powershell
pwsh E:/worktrees/tka-platform/nanite-trees/unreal/FlowFest/Tools/launch.ps1 -Review camp -Hour 15 -AutoExit -Offscreen -LogPath E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\Saved\trees-pilot.log -Capture E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\Saved\trees-pilot.png
Select-String -Path E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\Saved\trees-pilot.log -Pattern 'Flow Fest trees:|tree asset missing'
```
Expected: `Flow Fest trees: N near (Nanite Foliage), M backdrop, 38 families missing` where N and M are the white-oak-stand-a placements (other families warn as missing until Task 7). The capture shows the pilot oaks standing at their measured spots. Look at it before moving on.

- [ ] **Step 7: Commit**

```powershell
git -C E:/worktrees/tka-platform/nanite-trees add unreal/FlowFest/Source/FlowFest/FlowFestWorld.h unreal/FlowFest/Source/FlowFest/FlowFestWorld.cpp
git -C E:/worktrees/tka-platform/nanite-trees commit -m "Flow Fest: near trees on instanced skinned Nanite Foliage with a Dynamic Wind breeze, backdrop on Nanite static meshes"
```

---

### Task 6: Automation test `FlowFest.Environment.Trees`

**Files:**
- Create: `unreal/FlowFest/Source/FlowFest/FlowFestTreeTests.cpp`

- [ ] **Step 1: Write the test**

```cpp
// Asset inspection needs editor data, which cooked game targets omit.
#if WITH_DEV_AUTOMATION_TESTS && WITH_EDITOR
#include "Misc/AutomationTest.h"
#include "Dom/JsonObject.h"
#include "DynamicWindSkeletalData.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/StaticMesh.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowFestTreeAssetsTest, "FlowFest.Environment.Trees",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowFestTreeAssetsTest::RunTest(const FString& Parameters)
{
    FString Source;
    if (!TestTrue(TEXT("Exported site.json is present"),
        FFileHelper::LoadFileToString(Source, *(FPaths::ProjectContentDir() / TEXT("Data/site.json"))))) return false;
    TSharedPtr<FJsonObject> Site;
    if (!TestTrue(TEXT("Exported site.json parses"),
        FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Source), Site) && Site.IsValid())) return false;

    TSet<FString> Families;
    int32 Counts[2] = {0, 0};
    const TCHAR* Layers[2] = {TEXT("trees"), TEXT("backdropTrees")};
    for (int32 Layer = 0; Layer < 2; ++Layer)
    {
        const TArray<TSharedPtr<FJsonValue>>* Items = nullptr;
        if (!TestTrue(*FString::Printf(TEXT("%s placements exist"), Layers[Layer]),
            Site->TryGetArrayField(Layers[Layer], Items) && Items)) return false;
        for (const TSharedPtr<FJsonValue>& Item : *Items)
        {
            const TSharedPtr<FJsonObject> Object = Item->AsObject();
            FString Family;
            if (Object.IsValid() && Object->TryGetStringField(TEXT("family"), Family) && !Family.IsEmpty())
            {
                Families.Add(Family);
                ++Counts[Layer];
            }
        }
    }
    TestEqual(TEXT("Measured near placements"), Counts[0], 677);
    TestEqual(TEXT("Measured backdrop placements"), Counts[1], 2162);
    TestEqual(TEXT("Thirty-nine grown families"), Families.Num(), 39);

    for (const FString& Family : Families)
    {
        FString Normalized = Family;
        Normalized.ReplaceInline(TEXT("-"), TEXT("_"));
        const FString Folder = FString::Printf(TEXT("/Game/FlowFest/Assets/Trees/%s"), *Normalized);
        USkeletalMesh* Live = LoadObject<USkeletalMesh>(nullptr, *FString::Printf(TEXT("%s/%s_Live.%s_Live"), *Folder, *Normalized, *Normalized));
        if (TestNotNull(*FString::Printf(TEXT("Grown live tree %s"), *Family), Live))
        {
            TestTrue(*FString::Printf(TEXT("Live tree %s is Nanite"), *Family), Live->IsNaniteEnabled());
            TestTrue(*FString::Printf(TEXT("Live tree %s carries Dynamic Wind data"), *Family),
                Live->HasAssetUserDataOfClass(UDynamicWindSkeletalData::StaticClass()));
            TestTrue(*FString::Printf(TEXT("Live tree %s has materials"), *Family), !Live->GetMaterials().IsEmpty());
        }
        UStaticMesh* Far = LoadObject<UStaticMesh>(nullptr, *FString::Printf(TEXT("%s/%s_Far.%s_Far"), *Folder, *Normalized, *Normalized));
        if (TestNotNull(*FString::Printf(TEXT("Grown far tree %s"), *Family), Far))
        {
            TestTrue(*FString::Printf(TEXT("Far tree %s is Nanite"), *Family), Far->IsNaniteEnabled());
            TestTrue(*FString::Printf(TEXT("Far tree %s has materials"), *Family), !Far->GetStaticMaterials().IsEmpty());
        }
    }
    return true;
}
#endif
```

- [ ] **Step 2: Build and run it, expecting failures for the 38 ungrown families**

```powershell
& 'C:\Program Files\Epic Games\UE_5.8\Engine\Build\BatchFiles\Build.bat' FlowFestEditor Win64 Development -Project=E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\FlowFest.uproject -WaitMutex -NoHotReloadFromIDE -MaxParallelActions=8 -NoUBA
& "C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor-Cmd.exe" E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\FlowFest.uproject -ExecCmds="Automation RunTests FlowFest.Environment.Trees; Quit" -unattended -nop4 -nosplash -RenderOffscreen -log -abslog=E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\Saved\automation-trees.log
Select-String -Path E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\Saved\automation-trees.log -Pattern 'Test Completed. Result=|Grown live tree'
```
Expected now: `Result={Failed}`, with `Grown live tree eztree-white-oak-stand-a` passing and the other 38 families reported missing. The placement counts (677, 2162, 39) pass. This is the test that turns green at the end of Task 7.

- [ ] **Step 3: Commit**

```powershell
git -C E:/worktrees/tka-platform/nanite-trees add unreal/FlowFest/Source/FlowFest/FlowFestTreeTests.cpp
git -C E:/worktrees/tka-platform/nanite-trees commit -m "Flow Fest: automation test for the grown Nanite tree assets"
```

---

### Task 7: Grow the remaining twelve forms, 39 variants, 78 exports

**Files:**
- Creates assets: `/Game/FlowFest/Vegetation/PV_<form>` for 12 more forms; `_Live` and `_Far` for 38 more families
- Modify: `unreal/FlowFest/Tools/tree-sources.json` (`barkSurfaces`, if any)

Work form by form in the order of the growth-forms table, using the recipe that won in Task 4. For every form:

- [ ] **Step 1: Author the form's graph**

Start from the source pack named in the table (for the three Elder-leaved hardwoods: Elder's grower and leaves, Black Alder's bark material in the Trunk Texture Setup). Save as `/Game/FlowFest/Vegetation/PV_<form with underscores>`. Set the Grower toward the table's height, crown and bole targets and the role: `stand` forms grow a narrow crown and long bole, `open` forms a wide low crown, `understory` forms short with a low bole (boxelder multi-stemmed, hophornbeam a single slender stem), `damp` forms tall with wide crowns, `eastern-redcedar-open` a dense conical evergreen, `standing-snag` no foliage and a few broken limbs.

Bark: sycamore's pale mottled bark and beech's smooth grey come first from the packs' own bark materials (Beech Saplings for beech; Beech Saplings or Norway Maple for sycamore with a lighter tint). Only if a screenshot says the bark reads wrong, take a free CC0 bark surface from Poly Haven or ambientCG, import it under `/Game/FlowFest/Textures/Bark/`, and add `{"form", "source", "url", "license"}` to `barkSurfaces` in `tree-sources.json`.

Tint: apply the table's foliage and bark HSL offsets as the material instance's tint parameters on the exported mesh's materials (Hue shift, Saturation and Value multipliers in the Megaplants master material) so two forms sharing leaves still read as different trees.

- [ ] **Step 2: Export every variant, live and far**

Attempt A: `grow-trees.py export <form> <letters> both`. Attempt B: the editor recipe from Task 4 Step 4, once per variant and mesh type, changing only Seed, Mesh Name and Export Mesh Type.

- [ ] **Step 3: Measure after each form**

```powershell
& "C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor-Cmd.exe" E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\FlowFest.uproject -run=pythonscript -script="E:/worktrees/tka-platform/nanite-trees/unreal/FlowFest/Tools/grow-trees.py measure" -unattended -nop4 -nosplash -RenderOffscreen -log -abslog=E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\Saved\grow-measure.log
Select-String -Path E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\Saved\grow-measure.log -Pattern 'FLOWFEST_TREE' | Select-String -Pattern 'OFF|MISSING'
```
Expected after the last form: no `OFF` and no `MISSING` lines (78 `ok` lines).

- [ ] **Step 4: Run the automation test**

Same command as Task 6 Step 2. Expected: `Test Completed. Result={Passed}`.

- [ ] **Step 5: Look at every form once**

Launch with the full forest and capture the gate, camp and fire spots at 12:00:

```powershell
foreach ($spot in 'gate','camp','fire') { pwsh E:/worktrees/tka-platform/nanite-trees/unreal/FlowFest/Tools/launch.ps1 -Review $spot -Hour 12 -AutoExit -Offscreen -LogPath "E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\Saved\forest-$spot-noon.log" -Capture "E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\Saved\forest-$spot-noon.png" }
Select-String -Path E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\Saved\forest-camp-noon.log -Pattern 'Flow Fest trees:'
```
Expected: `Flow Fest trees: 677 near (Nanite Foliage), 2162 backdrop, 0 families missing`. Review the three captures yourself: a closed May canopy, no floating or sunken trunks (scale from the measured height still holds), species visibly different along a path, no black or checkerboard materials. Fix and re-export anything that fails before showing Austen.

- [ ] **Step 6: Commit the manifest**

```powershell
git -C E:/worktrees/tka-platform/nanite-trees add unreal/FlowFest/Tools/tree-sources.json
git -C E:/worktrees/tka-platform/nanite-trees commit -m "Flow Fest: all thirteen forms grown; bark surface sources recorded"
```
(The graphs and meshes are under gitignored `Content/`; they travel in the delivery's `Project/` and `Evidence/` in Task 10.)

---

### Task 8: Pipeline scripts, purge of ez-tree assets, docs

**Files:**
- Modify: `unreal/FlowFest/Tools/prepare-assets.mjs:27`
- Modify: `unreal/FlowFest/Tools/import-assets.py` (lines 60 to 93 and 321 to 323)
- Modify: `unreal/FlowFest/Tools/bootstrap.ps1`
- Modify: `unreal/FlowFest/README.md`, `unreal/FlowFest/CREDITS.md`

- [ ] **Step 1: Stop staging ez-tree GLBs**

In `prepare-assets.mjs`, replace line 27

```js
const jobs = site.assets.map(a => ({ id: a.family.replaceAll('-', '_'), family: a.family, source: resolve(source, a.source.startsWith('/models/') ? 'static'+a.source : a.source.replace(/^\//, '')), kind: 'Trees' }));
```
with

```js
// Trees are grown in the editor from Megaplants (Tools/grow-trees.py); nothing is converted from the browser's ez-tree GLBs.
const jobs = [];
```

- [ ] **Step 2: Remove the tree material branches from import-assets.py**

Delete the block starting `if folder.endswith('/Trees/' + name):` through the `migrate_foliage_tint(material)` line (the two `if folder.startswith('/Game/FlowFest/Assets/Trees/')` conditions included), and change the wind line to:

```python
                if job_wind_family(folder) and not ME.get_material_property_input_node(material, u.MaterialProperty.MP_WORLD_POSITION_OFFSET):
                    add_foliage_wind(material, False)
```
Delete `migrate_wind_masks` and `migrate_foliage_tint` if nothing else calls them (`grep -n migrate_ Tools/import-assets.py`). In the import loop, delete the line `if job['kind'] == 'Trees': folder += '/' + job['id']`.

- [ ] **Step 3: Add the tree stage to bootstrap.ps1**

Add `[switch]$SkipTrees` to the `param(` block after `[switch]$SkipImport`. Add before the final `Write-Host`:

```powershell
if (-not $SkipTrees) {
    $sources = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'tree-sources.json') -Raw | ConvertFrom-Json
    foreach ($pack in $sources.packs) {
        $packPath = Join-Path $projectRoot (Join-Path $sources.contentFolder $pack.folder)
        if (-not (Test-Path -LiteralPath $packPath)) {
            throw "Megaplants pack missing: $($pack.name) expected at $packPath. Claim it on Fab (listing $($pack.id)) and add it to the project from the editor's Fab window, then rerun."
        }
    }
    $growScript = Join-Path $PSScriptRoot 'grow-trees.py'
    & $editorCmd $projectFile '-run=pythonscript' "-script=$growScript measure" -unattended -nop4 -nosplash -RenderOffscreen -abslog=(Join-Path $projectRoot 'Saved\grow-measure.log')
    if ($LASTEXITCODE -ne 0) { throw "Tree measurement failed ($LASTEXITCODE)" }
    $missing = Select-String -LiteralPath (Join-Path $projectRoot 'Saved\grow-measure.log') -Pattern 'FLOWFEST_TREE .* MISSING'
    if ($missing) { throw "Grown tree assets missing; export them from the graphs under /Game/FlowFest/Vegetation (see README): $($missing.Count) assets" }
}
```

- [ ] **Step 4: Purge the ez-tree assets and rerun the tree test**

```powershell
& "C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor-Cmd.exe" E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\FlowFest.uproject -run=pythonscript -script="E:/worktrees/tka-platform/nanite-trees/unreal/FlowFest/Tools/grow-trees.py purge-eztree" -unattended -nop4 -nosplash -RenderOffscreen -log -abslog=E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\Saved\grow-purge.log
Select-String -Path E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\Saved\grow-purge.log -Pattern 'FLOWFEST_PURGE' | Measure-Object
```
Expected: `FLOWFEST_PURGED` lines, no `FLOWFEST_PURGE_FAILED`. Then rerun the Task 6 test command: `Result={Passed}`. Rerun the import stage to prove it no longer touches trees:

```powershell
pwsh E:/worktrees/tka-platform/nanite-trees/unreal/FlowFest/Tools/bootstrap.ps1 -SourceRoot E:/tka-platform -SkipAssetGeneration -SkipBuild
```
Expected: completes; `Saved/grow-measure.log` has no `MISSING`.

- [ ] **Step 5: Docs**

`CREDITS.md`: replace the whole `## Trees` section (heading through the four bark texture links) with:

```markdown
## Trees

The forest is grown in Unreal Engine 5.8's Procedural Vegetation Editor from Quixel Megaplants packs claimed on Fab under the Fab Standard License: English Oak, Norway Maple Forest, European Beech Saplings, European Hornbeam, Elder, Japanese Cypress, Dead Pine and Black Alder (listing ids in `Tools/tree-sources.json`). Species are matched on leaf shape and bark character, not on the pack names. Any bark surface from outside those packs is listed with its license in the same file. Tree placements come from Flow Fest's measured and authored site data. The browser simulator keeps its ez-tree meshes; none are used in the native build.
```

`README.md`: in the line beginning `- \`Tools/prepare-assets.mjs\` decodes source tree, ecology, and car GLBs`, drop `tree, `; replace the bullet `- Generated tree meshes originate from ...` with:

```markdown
- Trees are grown in the editor from free Quixel Megaplants (`Tools/tree-sources.json`), one Procedural Vegetation graph per growth form under `/Game/FlowFest/Vegetation/`, exported as Nanite Foliage (`_Live`, with Dynamic Wind) and Nanite static meshes (`_Far`) into `/Game/FlowFest/Assets/Trees/<family>/`. `Tools/grow-trees.py` inspects packs, exports variants, measures proportions and purges old assets. `bootstrap.ps1 -SkipTrees` skips the pack check. `[FlowFest.Trees] NearLayer=Far` in `DefaultGame.ini` switches the near layer to the static meshes.
```
In the world description paragraph (line 98), change `with tree and grass wind` to `with Dynamic Wind on the Nanite Foliage trees and material wind on the grass`. Prerequisites line: add `the eight Megaplants packs under Content/Fab`.

- [ ] **Step 6: Commit**

```powershell
git -C E:/worktrees/tka-platform/nanite-trees add unreal/FlowFest/Tools/prepare-assets.mjs unreal/FlowFest/Tools/import-assets.py unreal/FlowFest/Tools/bootstrap.ps1 unreal/FlowFest/README.md unreal/FlowFest/CREDITS.md
git -C E:/worktrees/tka-platform/nanite-trees commit -m "Flow Fest: tree stage in bootstrap, ez-tree conversion removed, credits and README for the grown forest"
```

---

### Task 9: Performance, fallback decision, review captures, wind watch

**Files:**
- Creates: `E:/FlowFestForest58/Evidence/` (`perf-*.csv`, `forest-*.png`, `wind-*.png`)

- [ ] **Step 1: Capture frame timing with the live near layer and with the static fallback**

The CSV profiler records game thread, render thread and GPU time per frame. Run at the camp at 15:00 (under near trees, afternoon wind) for 600 frames each way:

```powershell
$editor = "C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor.exe"
$project = "E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\FlowFest.uproject"
& $editor $project -game -windowed -ResX=2560 -ResY=1440 -NoSplash -FlowFestReview=camp -FlowFestHour=15 -FlowFestAutoExit -csvCaptureFrames=600 -csvGpuStats -abslog=E:\FlowFestForest58\Evidence\perf-live-1440.log | Out-Null
& $editor $project -game -windowed -ResX=2560 -ResY=1440 -NoSplash -FlowFestReview=camp -FlowFestHour=15 -FlowFestAutoExit -csvCaptureFrames=600 -csvGpuStats "-ini:Game:[FlowFest.Trees]:NearLayer=Far" -abslog=E:\FlowFestForest58\Evidence\perf-far-1440.log | Out-Null
& $editor $project -game -windowed -ResX=3840 -ResY=2160 -NoSplash -FlowFestReview=camp -FlowFestHour=15 -FlowFestAutoExit -csvCaptureFrames=600 -csvGpuStats -ExecCmds="r.ScreenPercentage 67" -abslog=E:\FlowFestForest58\Evidence\perf-live-4k.log | Out-Null
Get-ChildItem E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\Saved\Profiling\CSV\*.csv | Sort-Object LastWriteTime | Select-Object -Last 3
```
Copy the three CSVs to `E:/FlowFestForest58/Evidence/perf-live-1440.csv`, `perf-far-1440.csv`, `perf-live-4k.csv`. Summarise with:

```powershell
foreach ($f in 'perf-live-1440','perf-far-1440','perf-live-4k') {
  $rows = Import-Csv "E:\FlowFestForest58\Evidence\$f.csv"
  $gt = ($rows | Measure-Object -Property FrameTime -Average).Average
  $game = ($rows | Measure-Object -Property GameThreadTime -Average).Average
  $gpu = ($rows | Measure-Object -Property GPUTime -Average).Average
  "{0}: frame {1:N2} ms, game thread {2:N2} ms, gpu {3:N2} ms" -f $f, $gt, $game, $gpu
}
```
Expected: frame time at or under 16.7 ms in all three (60 fps cap). Tree share of the game thread = live game thread minus far game thread; budget 3 ms.

- [ ] **Step 2: Decide the near layer**

If the tree share is over 3 ms, first lower cost without changing the look: in `BuildTrees`, call `Group->SetCullDistances(0, 60000)` on each live group, and confirm the bounds override is in effect (`Group->Bounds` logged once). Re-measure. If still over 3 ms, set `NearLayer=Far` in `DefaultGame.ini`, commit it with the measurements quoted in the message, and the report says the near layer runs on Nanite static meshes with the live path kept behind the switch.

- [ ] **Step 3: Review captures, six spots, three times**

```powershell
foreach ($spot in 'gate','camp','fire') { foreach ($hour in 12, 19.5, 23) {
  $tag = "forest-$spot-$($hour.ToString().Replace('.','-'))"
  pwsh E:/worktrees/tka-platform/nanite-trees/unreal/FlowFest/Tools/launch.ps1 -Review $spot -Hour $hour -AutoExit -Offscreen -LogPath "E:\FlowFestForest58\Evidence\$tag.log" -Capture "E:\FlowFestForest58\Evidence\$tag.png"
} }
pwsh E:/worktrees/tka-platform/nanite-trees/unreal/FlowFest/Tools/launch.ps1 -Review overview -Hour 12 -AutoExit -Offscreen -LogPath E:\FlowFestForest58\Evidence\forest-overview-12.log -Capture E:\FlowFestForest58\Evidence\forest-overview-12.png
```
Expected: ten PNGs. Put each beside the matching capture from `E:/FlowFestLivingWorld58/Evidence/` (`camp-art-final.png`, `packaged-noon.png`, `packaged-sunset.png`, `packaged-fire.png`) and review them yourself first: canopy density, leaf transmission at sunset, the fire circle's trees lit from below at night, no popping between `_Live` and `_Far` at the layer edge in the overview.

- [ ] **Step 4: Watch the wind**

Launch a real window and record ten frames a tenth of a second apart:

```powershell
pwsh E:/worktrees/tka-platform/nanite-trees/unreal/FlowFest/Tools/launch.ps1 -Review camp -Hour 15 -AutoExit -LogPath E:\FlowFestForest58\Evidence\wind-camp.log -Capture E:\FlowFestForest58\Evidence\wind-camp.png -CaptureFrames 10 -CaptureStart 20 -CaptureInterval 0.1
```
Expected: `wind-camp.png` through `wind-camp-009.png` show branch tips displaced between frames. If the trees stand still: confirm `Flow Fest trees: 677 near (Nanite Foliage)` in the log, that `r.Nanite.Foliage` is 1 at runtime (`-ExecCmds="r.Nanite.Foliage"` prints it), and try `-ExecCmds="DynamicWind.OverrideAmplitude 2"`; if the override moves them, the breeze parameters are too small and `UpdateBreeze` gets `WindAmplitude` raised until the afternoon reads as a breeze, not a gale. Also watch one night capture to confirm calm.

- [ ] **Step 5: Commit any tuning**

```powershell
git -C E:/worktrees/tka-platform/nanite-trees add unreal/FlowFest/Source/FlowFest/FlowFestWorld.cpp unreal/FlowFest/Config/DefaultGame.ini
git -C E:/worktrees/tka-platform/nanite-trees commit -m "Flow Fest: breeze and near-layer tuning from the camp measurements"
```
(Skip if nothing changed.)

---

### Task 10: Package, smoke, delivery, verification doc, integrate

**Files:**
- Modify: `unreal/FlowFest/VERIFICATION.md`
- Creates: `E:/FlowFestForest58/` (`Builds`, `Project`, `Shared`, `Evidence`, `README.md`)

- [ ] **Step 1: Package**

```powershell
ssh -o ConnectTimeout=10 -o BatchMode=yes d2 'hostname && dir "C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor-Cmd.exe"'
```
If that prints the path, run the package on d2 from a scratch worktree of the exact commit the way `scripts/d2-gate.ps1` in Cirque Aflame does, copying `Content/` across first. Otherwise, on this PC:

```powershell
& E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\Package.cmd -ArchiveDirectory E:\FlowFestForest58\Builds 2>&1 | Tee-Object -FilePath E:\FlowFestForest58\Evidence\package.log
Select-String -Path E:\FlowFestForest58\Evidence\package.log -Pattern 'BUILD SUCCESSFUL|AutomationTool exiting with ExitCode'
```
Expected: `ExitCode=0`, and `E:\FlowFestForest58\Builds\Windows\FlowFest.exe` exists.

- [ ] **Step 2: Packaged smoke and packaged captures**

```powershell
pwsh E:/worktrees/tka-platform/nanite-trees/unreal/FlowFest/Tools/launch.ps1 -PackageRoot E:\FlowFestForest58\Builds\Windows -Smoke -AutoExit -Offscreen -LogPath E:\FlowFestForest58\Evidence\packaged-smoke.log
pwsh E:/worktrees/tka-platform/nanite-trees/unreal/FlowFest/Tools/launch.ps1 -PackageRoot E:\FlowFestForest58\Builds\Windows -Review fire -Hour 23 -AutoExit -Offscreen -LogPath E:\FlowFestForest58\Evidence\packaged-fire.log -Capture E:\FlowFestForest58\Evidence\packaged-fire.png
Select-String -Path E:\FlowFestForest58\Evidence\packaged-smoke.log -Pattern 'FlowFestSmoke PASS|Flow Fest trees:'
```
Expected: `Flow Fest run completed successfully.` twice, `FlowFestSmoke PASS`, and `Flow Fest trees: 677 near (...), 2162 backdrop, 0 families missing` in the packaged log.

- [ ] **Step 3: Assemble the delivery**

```powershell
robocopy E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest E:\FlowFestForest58\Project /E /XD Binaries Intermediate DerivedDataCache Saved Builds .vs /XF *.sln
robocopy E:\tka-platform\unreal\FlowFest\Content E:\FlowFestForest58\Project\Content /E
robocopy E:\worktrees\tka-platform\nanite-trees\unreal\Shared E:\FlowFestForest58\Shared /E
Get-ChildItem E:\FlowFestForest58\Builds\Windows -Recurse -Include *.exe,*.pak,*.utoc,*.ucas | Get-FileHash -Algorithm SHA256 | Select-Object Hash, Path | ConvertTo-Json | Set-Content E:\FlowFestForest58\Evidence\package-file-manifest.json
```
Write `E:/FlowFestForest58/README.md` in the layout of `E:/FlowFestLivingWorld58/README.md`: the play link, the project link, the guide, verification and credits links, then one paragraph: the forest is 39 tree variants of nine Ohio woodlot species grown from Quixel Megaplants as Nanite Foliage with Dynamic Wind, at the measured placements, and everything else from the living world build is unchanged; the controls paragraph copied as is; the Evidence paragraph naming `perf-*.csv`, the `forest-*.png` captures and `package-file-manifest.json`.

- [ ] **Step 4: VERIFICATION.md**

Add a row to the `## Current evidence` table after the Ecology row:

```markdown
| Grown Nanite forest | 39 families grown from eight Megaplants packs; `FlowFest.Environment.Trees` passed (677 near, 2,162 backdrop placements, every family has a Nanite `_Live` mesh with Dynamic Wind data and a Nanite `_Far` mesh). Camp at 15:00: frame, game thread and GPU times recorded live and with the static fallback at 1440p and 4K; near layer runs on <Live or Far, from Task 9>. Ten review captures and a ten-frame wind sequence reviewed. | `E:/FlowFestForest58/Evidence/automation-trees.log`, `perf-live-1440.csv`, `perf-far-1440.csv`, `perf-live-4k.csv`, `forest-*.png`, `wind-camp*.png` |
```
Fill in the real numbers and the chosen layer. Update the first paragraph to name `E:/FlowFestForest58` as the current release and `E:/FlowFestLivingWorld58` as the previous one, and add the new game binary's SHA-256 from the manifest to a `## Previous release` style line for this build. Copy `Saved/automation-trees.log` into Evidence.

- [ ] **Step 5: Commit, integrate into main, clean up**

```powershell
git -C E:/worktrees/tka-platform/nanite-trees add unreal/FlowFest/VERIFICATION.md
git -C E:/worktrees/tka-platform/nanite-trees commit -m "Flow Fest: Nanite forest verification and the FlowFestForest58 delivery"
git -C E:/tka-platform merge --no-ff nanite-trees -m "Merge branch 'nanite-trees': Flow Fest trees grown from Megaplants on Nanite Foliage"
cmd /c rmdir E:\worktrees\tka-platform\nanite-trees\unreal\FlowFest\Content
git -C E:/tka-platform worktree remove E:/worktrees/tka-platform/nanite-trees
```
The junction is removed with `rmdir` (never `Remove-Item -Recurse`, which would follow it into the real Content folder) before the worktree goes. Nothing is pushed.

- [ ] **Step 6: Report**

Open with three plain sentences: what changed in the forest, that it runs at 60 fps (or what it runs at), and where it is (`E:/FlowFestForest58/Builds/Windows/FlowFest.exe`, on local main, nothing pushed). Then: which export attempt worked, the near-layer decision with the numbers, whether packaging ran on d2 or here, the Elder-leaf look-alikes with a capture so Austen can decide on the two paid atlases, and what was not verified.

---

## Self-review against the spec

- Section 1 (assets, rights, manifest, credits): Tasks 2, 3, 7, 8.
- Section 2 (thirteen graphs, 39 families, `_Live` and `_Far`, scripting attempt then hand authoring, graphs archived): Tasks 4, 7, 10 (graphs ship in `Project/Content/FlowFest/Vegetation`).
- Section 3 (plugins, `r.Nanite.Foliage`, skinned near layer with batching, bounds override and tick off, HISM backdrop, breeze by time of day, fallback switch): Tasks 2, 5, 9.
- Section 4 (60 fps at 1440p native and 4K at 67 percent, trees at most 3 ms game thread, stats in Evidence): Task 9 Step 1 and 2 (CSV profiler in place of `stat unit` screenshots, which give the same three numbers in a form that can be averaged).
- Section 5 (automation test, captures at six spots by three times, wind watched, `Package.cmd` smoke, d2 or local): Tasks 6, 9, 10. The spec's "BuildTrees produces 677 near and 2,162 backdrop instances" is checked from `site.json` inside the test and from the runtime log line in the launched and packaged runs, because the automation test runs without a playing world.
- Section 6 (worktree and junction, bootstrap tree stage and `-SkipTrees`, ez-tree conversion removed, docs, delivery folder): Tasks 1, 8, 10.
- Placeholders: Task 4 names two discovery outputs (the pack's asset classes, the seed and export property names) with the commands that print them; both are decided inside Task 4, not deferred.
- Names used consistently: `_Live`, `_Far`, `Trees_<family>_near|_backdrop`, `TreeLiveGroups`, `TreeWindData`, `UpdateBreeze`, `NearTreeCount`, `BackdropTreeCount`, `[FlowFest.Trees] NearLayer`, `grow-trees.py` modes `inspect`, `export`, `measure`, `purge-eztree`.
