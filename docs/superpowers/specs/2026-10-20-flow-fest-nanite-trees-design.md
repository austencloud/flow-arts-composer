# Flow Fest native trees: grown species on Nanite Foliage

Date: 2026-10-20. Status: approved in conversation, awaiting Austen's read of this file.

## Why

The native Flow Fest build (Unreal Engine 5.8.3, `unreal/FlowFest`) still renders the browser simulator's ez-tree meshes: 39 families of about 28,000 triangles each, flat leaf cards from a small atlas, no LODs, no Nanite, a sine-wave wind in the leaf material, used for all 2,839 placements (677 near, 2,162 backdrop). Lumen, virtual shadow maps and two-sided foliage shading are already on, so the mesh is what holds the forest back. Trees fill most of every frame, including the fire circle at night.

Austen's direction (2026-10-20): the best look Unreal can give, grown per species, all from free sources, with nothing bought without his yes. The build is for his PC now; sharing is years away, so Experimental engine features are acceptable.

## What changes

The nine measured species of the Ohio and Indiana woodlot (mid-May, full leaf-out) are grown in Unreal 5.8's Procedural Vegetation Editor from Quixel's free Megaplants, exported as Nanite Foliage, and placed at the measured transforms the site export already provides. The site data, the browser simulator, grass and understory, collision, saves, HUD and crowd do not change.

## 1. Assets and rights

All vegetation sources are Quixel Megaplants on Fab, free under the Fab Standard License, which covers use inside an Unreal project. Austen authorised claiming them in his signed-in Chrome on 2026-10-20.

| Pack | Fab listing | Used for |
| --- | --- | --- |
| Megaplants: English Oak | `83642c38-7661-4df1-8629-0422e1898d26` | white oak |
| Megaplants: Norway Maple Forest | `e789ad04-cf79-4973-adb0-85c794d77144` | sugar maple, silver maple, sycamore leaves |
| Megaplants: European Beech Saplings | `6867d008-fc3a-404e-9e53-087eccdcd722` | beech leaves |
| Megaplants: European Hornbeam | `43679e75-6ed0-4b03-9288-9e2bc49376d2` | hophornbeam |
| Megaplants: Elder | `fe7a58b3-19fe-4249-b496-2214b32650b3` | compound leaves for black walnut, shagbark hickory, boxelder |
| Megaplants: Japanese Cypress | `0843f3cf-41c1-4980-b46a-3df5742ddaef` | eastern redcedar |
| Megaplants: Dead Pine | `bc9e4e89-fcf4-4be6-b0f0-8b37395a72de` | standing snags |
| Megaplants: Black Alder | `9257b627-e37a-4112-82c7-4a99c1a8aec6` | spare broadleaf grower and bark |

Species are matched on leaf shape and bark character, not on the name on the box. Bark that no pack supplies (beech's smooth grey, sycamore's pale mottling, hickory's shaggy plates, walnut's dark furrows) comes from free Quixel bark surfaces on Fab or CC0 surfaces from Poly Haven or ambientCG, each recorded in the source manifest below.

Optional paid leaf sets, only with a separate yes from Austen after the Elder-based trees are seen: American Sycamore Atlas 01 (Baldinoboy 3D, $2.99) and Walnut Tree Leaves (Karolina Renkiewicz, $5.99).

Downloaded packs live under `unreal/FlowFest/Content/Fab/`, which the project's `.gitignore` already excludes. `Tools/tree-sources.json` records every Fab item id, its license, which species it feeds and any bark surface used, so the trees can be rebuilt on another machine. `CREDITS.md` gains a Quixel Megaplants section and loses the ez-tree section once the ez-tree assets are gone.

## 2. Growing

One Procedural Vegetation Editor graph per form, thirteen in all, matching the forms `site.json` uses (variants in brackets):

sugar-maple-stand (a to d), silver-maple-damp (a to c), american-sycamore-damp (a to c), american-beech-stand (a to c), white-oak-stand (a to c), white-oak-open (a, b), black-walnut-stand (a to c), black-walnut-open (a, b), shagbark-hickory-stand (a to c), hophornbeam-understory (a to d), boxelder-understory (a to d), eastern-redcedar-open (a to c), standing-snag (a, b).

Variants come from different grower seeds, so the thirty-nine exported trees keep today's family ids one to one (`eztree-white-oak-stand-a` stays the folder and asset base name, with the `eztree-` prefix retained so `site.json` needs no change). Growth targets per form come from the species file: `crownRadiusRatio`, `trunkHeightRatio`, `matureHeightMeters`, the role (canopy, understory, open, damp, snag) and the `colorGrade` foliage and bark offsets, which become material instance tints. Season is mid-May full leaf-out: fresh green, no autumn.

Each variant exports twice into `/Game/FlowFest/Assets/Trees/<family>/`:

- `<family>_Live`: Nanite Foliage skinned asset with Dynamic Wind data, for the near layer.
- `<family>_Far`: plain Nanite static mesh, for the backdrop and the fallback below.

Automation: the editor documents no scripting for the vegetation editor. The first attempt is editor Python over the PCG graph and `UProceduralVegetation*` asset classes (`Tools/grow-trees.py`). If that cannot build or export graphs, the graphs are authored in the editor by hand and `grow-trees.py` is reduced to the export and naming step. Either way the finished graphs are saved as project assets under `/Game/FlowFest/Vegetation/` and archived with the delivery's Evidence, because Epic broke graph compatibility between 5.7 and 5.8 and may again.

## 3. Placement, wind and settings

Project settings: enable the `DynamicWind`, `ProceduralVegetationEditor` (editor only) and `PCG` plugins; set `r.Nanite.Foliage=1` in `DefaultEngine.ini`.

`AFlowFestWorld::BuildTrees` keeps its shape: it reads `site.json`, adds the invisible collision cylinders for near trees, and scales each instance from its measured height against the asset's bounds. What changes is the component behind each family.

- Near layer (677): one `UInstancedSkinnedMeshComponent` per family, loaded from `<family>_Live`, instances added in one `AddInstances` batch in world space. Each component gets `SetPrimitiveBoundsOverride` to its instances' extent, component tick off, cull distances, and the optimisation flags off by default on skinned components. Forty components is in the range people report as slow on 5.7.2 and 5.8.1 (game thread cost scales with component count), so this is measured, not assumed.
- Backdrop (2,162): the existing hierarchical instanced static mesh path pointed at `<family>_Far`, with today's cull distances (18,000 to 110,000).
- Wind: the world actor owns one breeze, direction and strength, pushed into `UDynamicWindSubsystem`. Time-of-day presets vary it: calm at night, gusty in the afternoon. The sine-wave world position offset in the old leaf materials goes away with the ez-tree materials; `import-assets.py` stops adding tree wind.
- Fallback, decided by measurement: if the near layer's game thread share stays above 3 ms after the mitigations, a config value (`FlowFest.Trees.NearLayer=Far`) makes the near layer use `<family>_Far` through the static path too, with wind as material world position offset on the Nanite static meshes. Both paths stay in the code behind that one setting.

Not touched: grass and understory ecology, the collision cylinders, saves, HUD, crowd, roads, camps, lighting.

## 4. Performance budget

The game caps at 60 fps (`t.MaxFPS=60`). Target on Austen's PC (RTX 4090, 7950X, 128 GB): 60 fps held at 2560 by 1440 native, and at 3840 by 2160 with TSR at 67 percent screen percentage, at the six review spots (gate, camp, workshop, fire circle, and noon, sunset and night presets) while walking under near trees. Trees take at most 3 ms of game thread. Frame stats (`stat unit`, `stat nanite`) are captured at each spot before and after and saved in Evidence.

## 5. Proof

- New automation test `FlowFest.Environment.Trees` beside the ecology test: every family in `site.json` has a `_Live` and a `_Far` asset, both Nanite, the live one carrying Dynamic Wind skeletal data; `BuildTrees` produces 677 near and 2,162 backdrop instances; no family logs the "tree asset missing" warning.
- Screenshots at the six spots at all three times of day, side by side with the current Evidence captures, reviewed by Claude before Austen sees them.
- Wind watched moving in a real window.
- Packaged Windows build through `Package.cmd` and the packaged smoke the earlier deliveries used (`VERIFICATION.md`).
- Cooking and packaging run on d2 if it has Unreal 5.8.3; if not, on this PC, and the report says so.

## 6. Pipeline and repo

- Work happens in a worktree at `E:/worktrees/tka-platform/nanite-trees` on branch `nanite-trees`, with a junction from the worktree's `unreal/FlowFest/Content` to the primary checkout's `Content`, because Content is untracked and the editor needs Source and Content together. The junction is removed before the worktree is.
- `bootstrap.ps1` gains a tree stage that runs `grow-trees.py` and fails loudly when a pack in `tree-sources.json` is missing from `Content/Fab`, plus a `-SkipTrees` switch.
- `prepare-assets.mjs` and `author-assets.py` stop converting the ez-tree GLBs; `import-assets.py` stops creating tree materials and tree wind. The ez-tree folders under `Content/FlowFest/Assets/Trees` are deleted after the swap.
- `README.md`, `CREDITS.md` and `VERIFICATION.md` describe the trees as grown Nanite Foliage from Megaplants.
- The browser simulator keeps its ez-trees. Only the native build changes.
- Delivery: a new folder `E:/FlowFestForest58` with `Builds`, `Project`, `Evidence` and a README in the layout `E:/FlowFestLivingWorld58` uses.

## Risks and how they are handled

- Experimental stack (Nanite Foliage, vegetation editor, Dynamic Wind): acceptable for a personal build; the fallback in section 3 keeps a non-skinned path.
- Skinned component game thread cost: mitigations in section 3, measured against the 3 ms budget, fallback if it fails.
- No scripting for the vegetation editor: hand authoring in the editor, archived graphs.
- Species look-alikes (Elder leaves on walnut and hickory, maple leaves on sycamore): judged from screenshots; the two paid atlases are the backup, with Austen's yes first.
- Collision on skinned foliage is incomplete in the engine; the existing cylinder trunks already carry walking collision.

## Out of scope

Leaf litter, fallen logs, saplings between measured trees, seasonal change, the browser simulator's trees, any PCG scatter beyond the measured placements.
