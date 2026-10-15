# Flow Fest for Unreal Engine 5.8

This is a native Unreal Engine 5.8 C++ game of the Thursday arrival and first night at Flow Fest. It uses the measured site terrain and placements exported from the browser simulator's source data. It does not embed or run the browser simulator. The living-world upgrade is being prepared for `E:/FlowFestLivingWorld58`; the earlier `E:/FlowFestNative58` delivery remains separate.

## Build and launch

Prerequisites for full asset regeneration: Unreal Engine 5.8.3 for Windows, a UE 5.8 compatible Visual Studio C++ toolchain, Node.js and the source repository dependencies, and Blender 5.0. The earlier editor target compiled with Visual Studio 2026 MSVC 14.50.35717; this upgrade still needs its own build and runtime verification. Generated Unreal assets are excluded from Git. Full regeneration must run from `unreal/FlowFest` inside the source repository because its tools import files from the repository's `src` and `static` trees. Do not run `bootstrap.ps1` from a detached delivery copy.

Capture the production performances from the repository root on d2. The default run records the 80 legacy clips. Run family mode as well for the 41 prop families and A/B routines:

```powershell
pnpm exec vite build --config unreal/FlowFest/Tools/native-capture.vite.config.mjs
node unreal/FlowFest/Tools/native-capture-static-runner.mjs unreal/FlowFest/Saved/PerformanceCaptures
$env:FLOW_FEST_CAPTURE_FAMILY_MODE = '1'
node unreal/FlowFest/Tools/native-capture-static-runner.mjs unreal/FlowFest/Saved/PerformanceCaptures
Remove-Item Env:FLOW_FEST_CAPTURE_FAMILY_MODE
```

Transfer that complete capture directory to the native build machine. Then, from the repository's `unreal/FlowFest` directory, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Tools\bootstrap.ps1 -SourceRoot E:\tka-platform
.\Launch.cmd
```

`bootstrap.ps1` exports the site and ecology data, converts source GLBs and textures for native import, authors campsite and ground meshes in Blender, converts all 16 deployed characters and their locomotion, converts all 41 physical prop families and 71 variants for both hands, imports captured routines and six original ambient loops, compiles the C++ editor target, and saves the Unreal assets and map. It also ports the authored electric unicycle. It creates a `node_modules` junction in the task worktree when needed. You can override `-EngineRoot`, `-BlenderExe`, and `-CompilerVersion`. Use the skip switches only when rerunning a completed stage.

Performance capture must precede a fresh bootstrap. The harness samples the production performer, IK, fingers, prop transforms, and mounted pose. The static runner uses an isolated browser and closes its temporary server when finished. The planned full set is 1,568 native clips: 1,312 family routines (41 families × A/B × 16 rigs), 64 legacy flow clips, 16 ride clips, and 176 locomotion clips. Pass another location with `bootstrap.ps1 -CaptureDirectory <directory>`. Raw captures stay in `Saved`; compact prop motion goes into packaged runtime data. See [the capture guide](Tools/native-capture-README.md) for incremental capture and repair instructions.

The earlier archive at `E:/FlowFestNative58/Evidence/production-performances.tar.gz` preserves the 80 legacy captures only. Its SHA-256 is `9792c6a5947afc83ab270ff65effdab1e26c0a9a621275a689fa7df907284b2c`. It does not replace the new family capture pass.

`Launch.cmd` starts Unreal Editor in game mode at 1600×900. The PowerShell launcher also supports review captures:

```powershell
.\Tools\launch.ps1 -Review camp -Capture C:\Temp\flowfest-camp.png -AutoExit
.\Tools\launch.ps1 -Smoke -AutoExit -LogPath C:\Temp\flowfest-smoke.log
.\Tools\launch.ps1 -Character ch44 -Prop fan:day_white_covered -Wardrobe
.\Tools\launch.ps1 -Character remy -Prop poi -Showcase flow
.\Tools\launch.ps1 -Character ch01 -Showcase ride
```

For a cooked Windows build from generated assets, run `Package.cmd` in the repository project. It invokes Unreal Automation Tool's `BuildCookRun` with build, cook, stage, package, pak, and archive enabled. The default archive directory is `Builds`; `-ArchiveDirectory` can target another local directory. `-EngineRoot` and `-CompilerVersion` are also accepted. The packaging script checks the staged site, character and prop catalogs, and complete compact motion set before packaging. A successful package for this upgrade has not yet been established. Launch a completed Windows archive with:

```powershell
.\Tools\launch.ps1 -PackageRoot .\Builds\Windows
```

The package launcher requires both `FlowFest.exe` and `FlowFest/Content/Paks` inside the supplied root. Without `-PackageRoot`, it launches the editor game mode.

Review positions are `gate`, `camp`, `fire`, and `overview`. A capture is requested after 25 seconds so shaders and assets can settle; automatic exit occurs after 40 seconds. Review mode logs average and maximum game frame delta after a 10-second warmup at capture or exit; these are not GPU timings. Review placement changes only the current session and does not alter saved progress. `-Smoke` checks the legacy rigs, movement, camp journeys, and save/load in a separate `FlowFestNative58Smoke` slot. The `FlowFest.Motion` automation test samples the family routines against imported bodies and props. A filtered pilot is useful for diagnosis; it cannot establish the full 1,312-routine gate. Build and full-gate results for this upgrade are pending.

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
| F10 | Begin a new Thursday journey |
| Esc | Quit the game |

Progress is also saved as the story advances. Load explicitly with F9. The native `FlowFestNative58` save slot is separate from browser storage. Version 2 saves add the A/B routine and sound setting; version 1 saves still load.

## Native scope and limits

The native world builds terrain, roads, trees, camps, parked cars, landmarks, visitors, fire, sky, and fog from exported site data and imported assets. The ecology export adds 21,731 grass placements and 20 damp-sedge and hazel understory placements, with tree and grass wind, varied foliage tint, and ground surface layers. Scheduled visitor staging uses 38 named crowd members and two fire turns at the fair area. Six original procedural mono loops provide spatial woodland, camp, crowd, and fire sound that responds to distance, obstruction, time of day, and jam state. The HUD and C++ state machine cover loadout, arrival, gate check-in, three camp choices, camp setup, workshop field, fire jam, and Friday morning. The character system retains the 16 deployed meshes and 11 locomotion clips per rig. Props retain all 71 authored variants, hand colors, and physical dimensions.

The scripted experience covers the first night. Car and EUC movement remains simple; the car has no Chaos vehicle physics. The EUC uses the production mounted contact pose. Each of the 41 prop families has two finite captured routines rather than an arbitrary native TKA sequence evaluator. Camp dressing, visitor behavior, and fire use native implementations. Photo flight and travel near objective are review aids.

## Asset provenance

- `Tools/export-site.ts` reads the source terrain, runtime contract, species manifest, production dressing, grass, and ground-life ecology. It writes `Content/Data/site.json` and height samples in the source site's coordinate frame, preserving road and camp clearings.
- `Tools/prepare-assets.mjs` decodes source tree, ecology, and car GLBs and their textures. `Tools/author-assets.py` converts them to FBX and builds campsite and set meshes. `Tools/import-assets.py` imports those assets, preserves foliage transparency and double-sided surfaces, and creates native materials and the festival map.
- The imported Ace '11 hatchback is by [Daniel Zhabotinsky](https://sketchfab.com/3d-models/055ff8a21b8d4d279debca089e2fafcd), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), as recorded in the source repository's `static/models/flow-fest/cars/CREDITS.md`.
- Generated tree meshes originate from [@dgreenheck/ez-tree](https://github.com/dgreenheck/ez-tree), MIT licensed. The existing Flow Fest source scene provides the tree instances.
- `Tools/prepare-characters.mjs`, `convert-characters.py`, and `import-characters.py` port the deployed avatar catalog and source locomotion. The capture harness ports production flow and mounted poses into native animation assets.
- `Tools/prepare-props.mjs`, `convert-props.py`, and `import-props.py` port the physical prop catalog, including authored GLBs and source procedural shapes. `prepare-prop-motion.mjs` compacts each family capture into a version 2, 20-number frame: two seven-number prop-root transforms and two three-number wrist anchors. Native playback uses those anchors to align animated props to the sampled hands.
- `Tools/prepare-audio.py` synthesizes six original mono ambient loops; `Tools/import-audio.py` imports them as looping Unreal sound waves.
- `Tools/convert-euc.py` reproduces the source electric-unicycle geometry and materials. `import-euc.py` stores the body and rotating wheel separately.
