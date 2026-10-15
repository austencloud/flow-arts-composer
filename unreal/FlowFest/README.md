# Flow Fest for Unreal Engine 5.8

This is a native Unreal Engine 5.8 C++ game of the Thursday arrival and first night at Flow Fest. It uses the measured site terrain and placements exported from the browser simulator's source data. It does not embed or run the browser simulator.

## Build and launch

Prerequisites: Unreal Engine 5.8.3 for Windows, a UE 5.8 compatible Visual Studio C++ toolchain, Node.js and the source repository dependencies, and Blender 5.0. The editor target has compiled with Visual Studio 2026 MSVC 14.50.35717. The project generates local Unreal assets; those generated files are excluded from Git. Keep access to the source repository and its `node_modules` when rebuilding.

First capture the production performances from the repository root on d2:

```powershell
pnpm exec vite build --config unreal/FlowFest/Tools/native-capture.vite.config.mjs
node unreal/FlowFest/Tools/native-capture-static-runner.mjs unreal/FlowFest/Saved/PerformanceCaptures
```

Transfer that complete capture directory to the native build machine. Then, from this directory, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Tools\bootstrap.ps1 -SourceRoot E:\tka-platform
.\Launch.cmd
```

`bootstrap.ps1` exports the site data, converts the source GLBs and WebP textures for native import, authors campsite meshes in Blender, converts all 16 deployed characters and their locomotion, converts all 41 physical prop types and 65 variants for both hands, compiles the C++ editor target, and saves the Unreal assets and map. It also ports the authored electric unicycle. It creates a `node_modules` junction in the task worktree when needed. You can override `-EngineRoot`, `-BlenderExe`, and `-CompilerVersion`. Use the skip switches only when rerunning a completed stage.

Performance capture must precede a fresh bootstrap. The harness samples the production performer, IK, fingers, prop transforms, and mounted pose. The static runner uses an isolated browser and closes its temporary server when finished. The 80 captures contain four flow profiles plus one mounted pose for each character. Pass another location with `bootstrap.ps1 -CaptureDirectory <directory>`. Raw captures stay in `Saved`; only compact prop motion goes into the packaged runtime data. See [the capture guide](Tools/native-capture-README.md) for exact revision and repair instructions.

`Launch.cmd` starts Unreal Editor in game mode at 1600×900. The PowerShell launcher also supports review captures:

```powershell
.\Tools\launch.ps1 -Review camp -Capture C:\Temp\flowfest-camp.png -AutoExit
.\Tools\launch.ps1 -Smoke -AutoExit -LogPath C:\Temp\flowfest-smoke.log
.\Tools\launch.ps1 -Character ch44 -Prop fan:day_white_covered -Wardrobe
.\Tools\launch.ps1 -Character remy -Prop poi -Showcase flow
.\Tools\launch.ps1 -Character ch01 -Showcase ride
```

For a cooked Windows build after a successful bootstrap, run `Package.cmd`. It invokes Unreal Automation Tool's `BuildCookRun` with build, cook, stage, package, pak, and archive enabled. The default archive directory is `Builds`; `-ArchiveDirectory` can target another local directory. `-EngineRoot` and `-CompilerVersion` are also accepted. The packaging script validates staged terrain, character and prop catalogs, and all 64 compact prop-motion clips. Launch its Windows archive with:

```powershell
.\Tools\launch.ps1 -PackageRoot .\Builds\Windows
```

The package launcher requires both `FlowFest.exe` and `FlowFest/Content/Paks` inside the supplied root. Without `-PackageRoot`, it launches the editor game mode.

Review positions are `gate`, `camp`, `fire`, and `overview`. A capture is requested after 25 seconds so shaders and assets can settle; automatic exit occurs after 40 seconds. Review mode logs average and maximum game frame delta after a 10-second warmup at capture or exit; these are not GPU timings. Review placement changes only the current session and does not alter saved progress. `-Smoke` checks all character rigs, animation loop durations and bone positions, all prop variants, movement, all three camp journeys, and save/load in a separate `FlowFestNative58Smoke` save slot. See the Unreal log for `FlowFestSmoke PASS` or `FlowFestSmoke FAIL`.

## Play

Press **C** to choose your character and equipment. All 16 deployed characters and all 65 prop variants are available; selections save with the journey. Choose a departure with **1**, **2**, or **3**, then press **E**. Drive to the gate, check in, and choose lower tent, upper tent, or car camp. Arrive and unload; tent campers stage the car at parking and walk home. Make camp, visit the workshop field, follow the lights to the fire circle, flow in the jam, then return to camp and sleep. Friday morning ends the scripted first-night journey.

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
| T | Travel near the current objective for review; interaction is still required |
| G | Cycle time-of-day presets |
| F5 / F9 | Save / load native progress |
| F10 | Begin a new Thursday journey |
| Esc | Quit the game |

Progress is also saved as the story advances. Load explicitly with F9. The native `FlowFestNative58` save slot is separate from browser storage. Saves are versioned and validated before loading.

## Native scope and limits

The native world builds terrain, roads, trees, camps, parked cars, landmarks, visitors, fire, sky, and fog from exported site data and imported assets. The HUD and C++ state machine cover loadout, arrival, gate check-in, three camp choices, camp setup, workshop field, fire jam, and Friday morning. The character system uses the existing deployed character meshes, source materials, 11 locomotion clips per rig, and captured production performances. Props retain their authored geometry, variants, hand colors, and physical dimensions.

The scripted experience currently covers the first night. The car and EUC use character movement; the car has no Chaos vehicle physics. The EUC uses the production mounted contact pose. Four captured performance profiles drive the catalog: poi, hoop, club, and double baton; other prop families share the closest profile. The browser's live sequence editor, multiplayer services, arbitrary live IK generation, and browser storage synchronization are not native features. Camp dressing, visitor behavior, and fire use native implementations. Photo flight and travel near objective are review aids.

## Asset provenance

- `Tools/export-site.ts` reads the source terrain manifest, height and surface data, runtime contract, species manifest, and production dressing. It writes `Content/Data/site.json` and the height samples used by the native world. The exported contract fixes the source site's coordinate frame and places roads, trees, camps, vehicles, and landmarks.
- `Tools/prepare-assets.mjs` decodes the source tree and car GLBs and their textures. `Tools/author-assets.py` converts them to FBX and builds the additional campsite and set meshes. `Tools/import-assets.py` imports those assets and creates native materials and the festival map.
- The imported Ace '11 hatchback is by [Daniel Zhabotinsky](https://sketchfab.com/3d-models/055ff8a21b8d4d279debca089e2fafcd), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), as recorded in the source repository's `static/models/flow-fest/cars/CREDITS.md`.
- Generated tree meshes originate from [@dgreenheck/ez-tree](https://github.com/dgreenheck/ez-tree), MIT licensed. The existing Flow Fest source scene provides the tree instances.
- `Tools/prepare-characters.mjs`, `convert-characters.py`, and `import-characters.py` port the deployed avatar catalog and source locomotion. The capture harness ports production flow and mounted poses into native animation assets.
- `Tools/prepare-props.mjs`, `convert-props.py`, and `import-props.py` port the physical prop catalog, including authored GLBs and source procedural shapes. `prepare-prop-motion.mjs` reduces captured prop roots to interpolated runtime tracks.
- `Tools/convert-euc.py` reproduces the source electric-unicycle geometry and materials. `import-euc.py` stores the body and rotating wheel separately.
