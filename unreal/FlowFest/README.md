# Flow Fest for Unreal Engine 5.8

This native Unreal Engine 5.8 C++ game covers Thursday arrival and the first night at Flow Fest. It uses measured site terrain and placements exported from the browser simulator's source data. The earlier verified living-world build is at `E:/FlowFestLivingWorld58`; see [VERIFICATION.md](VERIFICATION.md).

The embodiment upgrade adds attendee intentions, player needs, and the shared performance library. Native import and bundle verification passed for 699 replacements, with 677 legacy performances unchanged. Library, 1,312-routine motion, and all-rig hand-pose checks passed. The final Windows package passed numerical checks, packaged smoke, and sampled visual review. [EMBODIMENT.md](EMBODIMENT.md) records the evidence and limits.

## Play the embodiment build

- [Play Flow Fest](E:/FlowFestEmbodiment58/Play.cmd): open the packaged Windows game.
- [Open the editable Unreal project](E:/FlowFestEmbodiment58/Project/FlowFest.uproject): requires Unreal Engine 5.8.3 and the delivered [Shared runtime plugin](E:/FlowFestEmbodiment58/Shared/FlowArtsRuntime) beside `Project`.

The detached delivery keeps `Project` and `Shared` side by side. Its `Evidence/editable-file-manifest.json` records the copied project files after delivery finalization. The earlier living-world build at `E:/FlowFestLivingWorld58` remains separate.

Use **W A S D** and the mouse to move and look. Press **C** to choose a character and props, **E** to interact, **Q** to flow, **R** to switch the equipped family's A/B routine, and **M** to toggle sound. **F5** saves and **F9** loads. The full controls and first-night route are in [Play](#play).

## Rebuild from source

Prerequisites for full asset regeneration: Unreal Engine 5.8.3 for Windows, the eight Megaplants packs under `Content/Megaplant_Library` (`Tools/tree-sources.json`), a UE 5.8 compatible Visual Studio C++ toolchain, Node.js and the source repository dependencies, and Blender 5.0. The editor target for this upgrade has compiled with Visual Studio 2026 MSVC 14.50.35717. Generated Unreal assets are excluded from Git. Full regeneration must run from `unreal/FlowFest` inside the source repository because its tools import files from the repository's `src` and `static` trees. Do not run `bootstrap.ps1` from a detached delivery copy.

Capture the production performances from the repository root on d2. The default run records the 80 legacy clips. Run family mode as well for the 41 prop families and A/B routines:

```powershell
pnpm exec vite build --config unreal/FlowFest/Tools/native-capture.vite.config.mjs
node unreal/FlowFest/Tools/native-capture-static-runner.mjs unreal/FlowFest/Saved/PerformanceCaptures-v3
$env:FLOW_FEST_CAPTURE_FAMILY_MODE = '1'
node unreal/FlowFest/Tools/native-capture-static-runner.mjs unreal/FlowFest/Saved/PerformanceCaptures-v3
Remove-Item Env:FLOW_FEST_CAPTURE_FAMILY_MODE
```

Transfer that complete capture directory to the native build machine. Then, from the repository's `unreal/FlowFest` directory, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Tools\bootstrap.ps1 -SourceRoot E:\tka-platform
.\Launch.cmd
```

`bootstrap.ps1` exports the site and ecology data, converts source GLBs and textures for native import, authors campsite and ground meshes in Blender, converts all 16 deployed characters and their locomotion, converts all 41 physical prop families and 71 variants for both hands, imports captured routines and six original ambient loops, compiles the C++ editor target, and saves the Unreal assets and map. It also ports the authored electric unicycle. It creates a `node_modules` junction in the task worktree when needed. You can override `-EngineRoot`, `-BlenderExe`, and `-CompilerVersion`. Use the skip switches only when rerunning a completed stage.

Performance capture must precede a fresh bootstrap. The harness samples the production performer, IK, fingers, prop transforms, and mounted pose. The static runner uses an isolated browser and closes its temporary server when finished. All 1,312 family routines (41 families × A/B × 16 rigs) have been captured at 480 frames and 30 fps. The complete native animation set also calls for 64 legacy flow clips, 16 ride clips, and 176 locomotion clips, or 1,568 clips total. Pass another location with `bootstrap.ps1 -CaptureDirectory <directory>`. Raw captures stay in `Saved`; compact prop motion goes into packaged runtime data. The 16 verified family archives, SHA-256 sidecars, and completion report are in `E:/FlowFestLivingWorld58/Evidence/LivingCaptures-v3`. See [the capture guide](Tools/native-capture-README.md) for incremental capture and repair instructions.

The earlier archive at `E:/FlowFestNative58/Evidence/production-performances.tar.gz` preserves the 80 legacy captures only. Its SHA-256 is `9792c6a5947afc83ab270ff65effdab1e26c0a9a621275a689fa7df907284b2c`. It does not replace the new family capture pass.

`Launch.cmd` starts Unreal Editor in game mode at 1600×900. The PowerShell launcher also supports review captures:

```powershell
.\Tools\launch.ps1 -Review camp -Capture C:\Temp\flowfest-camp.png -AutoExit
.\Tools\launch.ps1 -Smoke -AutoExit -LogPath C:\Temp\flowfest-smoke.log
.\Tools\launch.ps1 -Character ch44 -Prop fan:day_white_covered -Wardrobe
.\Tools\launch.ps1 -Character remy -Prop poi -Showcase flow
.\Tools\launch.ps1 -Character ch01 -Showcase ride
```

For a cooked Windows build from generated assets, run `Package.cmd` in the repository project. It invokes Unreal Automation Tool's `BuildCookRun` with build, cook, stage, package, pak, and archive enabled. The default archive directory is `Builds`; `-ArchiveDirectory` can target another local directory. `-EngineRoot` and `-CompilerVersion` are also accepted. The packaging script checks the staged site, character and prop catalogs, and complete compact motion set before packaging. The prior living-world package result is recorded in [VERIFICATION.md](VERIFICATION.md). Launch a completed Windows archive with:

```powershell
.\Tools\launch.ps1 -PackageRoot .\Builds\Windows
.\Tools\launch.ps1 -PackageRoot .\Builds\Windows -Explore
```

The package launcher requires both `FlowFest.exe` and `FlowFest/Content/Paks` inside the supplied root. Without `-PackageRoot`, it launches the editor game mode.

The source launcher also accepts `-Explore` to start on foot beside the fire circle with the normal third-person camera. Add `-Review camp` or `-Review gate` to choose another ground location. This shortcut keeps food, rest, greetings, and flow available; F10 starts the arrival journey. The final packaged visual review used this on-foot route.

Review positions are `gate`, `camp`, `fire`, and `overview`. A capture is requested after 25 seconds so shaders and assets can settle; automatic exit occurs after 40 seconds. Review mode logs average and maximum game frame delta after a 10-second warmup at capture or exit; these are not GPU timings. Review placement changes only the current session and does not alter saved progress. `-Smoke` checks the 1,312 family performances, legacy rigs, movement, camp journeys, and save/load in a separate `FlowFestNative58Smoke` slot. The `FlowFest.Motion` automation test samples the family routines against imported bodies and props. A filtered pilot is useful for diagnosis; it cannot establish the full 1,312-routine gate. The prior living-world package passed its full native test and packaged smoke; see [VERIFICATION.md](VERIFICATION.md) for its logs and review gates.

## Play

Press **C** to choose your character and equipment. All 16 deployed characters and all 71 prop variants are available; selections save with the journey. Regular and large buugeng each offer four left/right pairings: matching A, mirrored AB, mirrored BA, and matching B. Choose a departure with **1**, **2**, or **3**, then press **E**. Drive to the gate, check in, and choose lower tent, upper tent, or car camp. Arrive and unload; tent campers stage the car at parking and walk home. Make camp, visit the workshop field, follow the lights to the fire circle, flow in the jam, then return to camp and sleep. Friday morning ends the scripted first-night journey.

| Key | Action |
| --- | --- |
| W A S D, mouse | Move/steer and look |
| Left Shift | Sprint on foot, accelerate in car |
| Space | Jump; rise in photo flight |
| Left Ctrl | Descend in photo flight |
| E | Interact with the current nearby objective |
| 1 / 2 / 3 | Choose loadout or camp at the relevant step |
| F | Switch first-person and third-person camera |
| P | Toggle free-flight photo camera |
| V | Toggle EUC when on foot |
| C | Open character and gear selection; click to equip, C or Esc to close |
| Q | Start/stop a synchronized flow performance; moving ends it |
| R | Cycle the equipped prop family's A/B routine |
| M | Toggle festival sound |
| T | Travel near the current objective for review; interaction is still required |
| G | Cycle time-of-day presets |
| F5 / F9 | Save / load native progress |
| F6 | Open the shared performance library while on foot (embodiment source revision) |
| F10 | Begin a new Thursday journey |
| Esc | Quit the game |

Progress is also saved as the story advances. Load explicitly with F9. The native `FlowFestNative58` save slot is separate from browser storage. Version 2 saves add the A/B routine and sound setting; version 1 saves still load.

In the embodiment build, **E** at the food stop near the workshop gets food and water, and **E** at camp rests. These timed actions replenish hunger or energy and can end early with **E** or movement. **H** greets a nearby available attendee; the reply names them and their current purpose. These actions become available during the festival night. F5/F9 save and restore player needs, an active break, and attendee intentions. Save version 3 accepts older saves. Native activity checks and final packaged smoke passed.

## Native scope and limits

The native world builds terrain, roads, trees, camps, parked cars, landmarks, visitors, fire, sky, and fog from exported site data and imported assets. The ecology export adds 21,731 grass placements and 20 damp-sedge and hazel understory placements, with Dynamic Wind on the Nanite Foliage trees and ground surface layers. Each grass placement grows a voxelized Nanite meadow patch (`Assets/Meadow`), ringed by stubble tufts, with dry seed stalks in tall or parched spots. The source keeps only two of three cells on a 4 m grid outside the camp lawns, so about 23,600 fill patches on a jittered 1.6 m grid cover the open ground between, each borrowing its nearest placement's shade and tint and thinning out 3.5 to 6 m past the last one; per-instance custom data sets each clump's dryness and brightness from the source tint, shade, neighbour density and trampling. Grass is cleared under parked cars and flattened beside them and the roads, and the field ground dries toward straw in broad patches to match the hills. The meadow material needs both the Nanite and Voxels usage flags, or voxelized clumps draw the default material and render black. Native attendee schedules use 38 named crowd members with route following, social stops, and rotating fire turns. Six original procedural mono loops provide woodland, camp, crowd, and fire ambience with distance attenuation, configured occlusion, and gains that change with time of day and jam state. The HUD and C++ state machine cover loadout, arrival, gate check-in, three camp choices, camp setup, workshop field, fire jam, and Friday morning. The character system retains the 16 deployed meshes and 11 locomotion clips per rig. Props retain all 71 authored variants, hand colors, and physical dimensions.

The embodiment source revision gives the 38 attendees bounded needs, preferences, homes, equipment, and inspectable goals. They travel to food, camp, practice, watch, socialize in pairs, or take reserved turns at the fire circle. Needs and completed actions affect the next goal; ongoing routes, actions, and fire reservations are saved. Practice and performance use authored prop routines. Food, rest, and social stops have destinations, facing, and timing, but currently use existing idle clips. There is no eating, sitting, or talking animation, and stowed equipment has no visible holster.

The food stop has a canopy and benches, with attendees arriving at it; the player sees an E food/water prompt. Close walk views show hands remaining attached to carried handles through a stride. The existing arm swing can still bring a carried staff across the torso; there is no separate carry arm pose. The final cohort passed native motion and hand-pose checks. Nine packaged performer images sampled ch01 fire double staff and ch22/ch42 stick; no gross hand detachment was observed. These checks do not establish collision-free motion, full prop-tip clearance, or physical staff realism.

The scripted experience covers the first night. Car and EUC movement remains simple; the car has no Chaos vehicle physics. The EUC uses the production mounted contact pose. Each of the 41 prop families has two finite captured routines rather than an arbitrary native TKA sequence evaluator. Camp dressing, visitor behavior, and fire use native implementations. Photo flight and travel near objective are review aids.

## Asset provenance

### Shared native foundation

Flow Fest and Museum use the `FlowArtsRuntime` plugin under `unreal/Shared/FlowArtsRuntime`. It owns native avatar animation, equipment, grip IK, the synchronized playback clock, and routine transitions. `unreal/Shared/Tools` owns character catalog evaluation and capture validation. Festival geography, journeys, attendee schedules, and UI remain game-specific. Flow Fest's project enables the plugin through `AdditionalPluginDirectories: ["../Shared"]` and redirects its former game-module component names to the shared module.

A detached editable delivery must keep `Project` and `Shared` beside each other: `Project/FlowFest.uproject`, `Shared/FlowArtsRuntime/FlowArtsRuntime.uplugin`, and `Shared/Tools`. Copy the generated project content and both game and plugin binaries as well as source; copying the `.uproject` alone is insufficient. Full source asset regeneration still requires the repository and its dependencies, as described above.

The current family schema is `flow-fest-prop-motion-v3`, captured with revision `clock-isolated-body-v3`. Character, physical prop family, and routine A/B must match exactly. Existing schema tags and `/Game/FlowFest` asset paths remain compatible during adoption. Moving assets to another mount requires an Unreal asset migration; renaming raw `.uasset` files is not supported. The prop converter's tested native Feet space is `(source.z, -source.x, source.y) * 100`; skeleton import and static prop mesh spaces have their own basis transformations and must not be treated as interchangeable.

### Sources

- `Tools/export-site.ts` reads the source terrain, runtime contract, species manifest, production dressing, grass, and ground-life ecology. It writes `Content/Data/site.json` and height samples in the source site's coordinate frame, preserving road and camp clearings.
- `Tools/prepare-assets.mjs` decodes source ecology and car GLBs and their textures. `Tools/author-assets.py` converts them to FBX and builds campsite and set meshes. `Tools/import-assets.py` imports those assets, preserves foliage transparency and double-sided surfaces, and creates native materials and the festival map.
- The parked lot uses the browser simulator's six car bodies, each sized to its measured length, settled on its four tyres, and given one of its catalogue paints per car; the driven car is the Ace '11 hatchback. Five bodies are by Daniel Zhabotinsky and the campervan by TheoClarke, all licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); titles and links are in `CREDITS.md` and the source repository's `static/models/flow-fest/cars/CREDITS.md`. `import-assets.py --only=Car/` reimports just the cars.
- Camps match the browser simulator's mix of ridge tents, dome tents and pop-up canopies. Each tent's fly and each canopy top takes one of the web camp's fabric colours. The camp canopies carry a table, cooler and two chairs; the workshop and food stalls use the bare canopy. `author-assets.py -- --sets-only` rebuilds the set meshes without the source GLBs, and `import-assets.py --only=Set/` replaces them in the content store.
- Trees come from free Quixel Megaplants packs (`Tools/tree-sources.json`), added to the project from the editor's Fab window into `Content/Megaplant_Library/`. `Tools/grow-trees.py adopt` (run through `UnrealEditor-Cmd.exe <project> -run=pythonscript -script="<path> adopt"`) copies one shipped tree per family into `/Game/FlowFest/Assets/Trees/<family>/`: the pack's Nanite Foliage skeletal mesh with Dynamic Wind as `<family>_Live`, and a Nanite static mesh carrying the same leaf assembly (`UFlowFestTreeTools::CopyNaniteAssembly`) as `<family>_Far`. Species without a free pack borrow a tree of the right size (hornbeam for beech and hickory, black alder for walnut and sycamore, cypress for redcedar, dead pine for snags); the `FORMS` table in `grow-trees.py` says which. `grow-trees.py packs` lists the shipped trees with their heights, `measure` prints every family's height and crown ratio, `purge-eztree` deletes the old ez-tree assets. To grow a custom tree instead, `grow-trees.py graphs` copies each pack's Procedural Vegetation graph to `/Game/FlowFest/Vegetation/PV_<form>`; open it in the editor, run `py "<path>" configure <form> live` (then `far`) in the Cmd console, and press the toolbar Export button, because the exporter has no script entry. `bootstrap.ps1 -SkipTrees` skips the pack check. `[FlowFest.Trees] NearLayer=Far` in `DefaultGame.ini` switches the near layer to the static meshes. The existing Flow Fest source scene provides the tree instances.
- `Tools/prepare-characters.mjs`, `convert-characters.py`, and `import-characters.py` port the deployed avatar catalog and source locomotion. The capture harness ports production flow and mounted poses into native animation assets. Walking, running, and directional movement match playback cadence to travel speed; jump and landing playback start at the source contact events. Terrain foot correction and contact-triggered footsteps run while walking.
- `Tools/prepare-props.mjs`, `convert-props.py`, and `import-props.py` port the physical prop catalog, including authored GLBs and source procedural shapes. `prepare-prop-motion.mjs` compacts corrected family captures into version 3, 28-number frames: two prop-root transforms, two wrist anchors, and two visual-body quaternions. Native playback aligns roots to sampled hands and reproduces the source mesh rotation, including its starting orientation. Body animation, props, and routine transitions share a playback clock. Compact files retain the raw capture SHA-256.
- `Tools/prepare-audio.py` synthesizes six original mono ambient loops; `Tools/import-audio.py` imports them as looping Unreal sound waves.
- `Tools/convert-euc.py` reproduces the source electric-unicycle geometry and materials. `import-euc.py` stores the body and rotating wheel separately.
