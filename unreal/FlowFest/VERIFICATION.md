# Flow Fest native verification

**Ready for local play.** The final Windows package passed its build, standalone smoke, and six targeted visual checks on October 15, 2026. Logs in `Saved` are build artifacts and are not committed with this report. The delivery copy is under `E:/FlowFestNative58/Evidence`.

## Checks with evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Unreal Engine 5.8 editor target | The final editor build passed; UnrealBuildTool reports `Result: Succeeded`. | `Saved/build-delivery-editor.log` |
| Catalog and story smoke in editor game mode | The earlier editor smoke passed 16 character choices, 71 prop choices, and all three native camp journeys with isolated save/load. | `Saved/smoke-ride-floor-editor.log` |
| Final Windows package | Unreal Automation Tool `BuildCookRun` passed. The package contains `Builds/Windows/FlowFest.exe` and cooked content under `Builds/Windows/FlowFest/Content/Paks`. | `Saved/package-delivery.log` |
| Packaged standalone smoke | The packaged game exited successfully. Its log reports `FlowFestSmoke PASS: all three native camp journeys and isolated save/load` after catalog and animation checks. | `E:/FlowFestNative58/Evidence/smoke-packaged.log` |
| Imported prop assets | Passed import validation: 142 hand meshes, with an empty `errors` array. | `Saved/validate-props-report.json`, `Saved/import-props-report.json` |
| Fan finish | The source geometry check reports `FAN_FINISH_OK`, and the Unreal imported-material check reports `FAN_FINISH_IMPORTED_OK`. Fresh packaged wardrobe review shows the white covered fan equipped on Marcus. | `E:/FlowFestNative58/Evidence/verify-fan-finish.log`, `E:/FlowFestNative58/Evidence/verify-imported-fan.log`, `E:/FlowFestNative58/Evidence/wardrobe.png` |
| Authored right-hand geometry | The validator reports 45 left/right FBX pairs and 18 GLB source matches. Blender prints an add-on shutdown traceback after this success line; that traceback does not establish a geometry failure. | `Saved/validate-authored-rights.log` |
| Character pose audit | The report contains 16 rigs and records 256 evaluated clips over 768 frames. It is a structural pose audit, not a visual quality judgment for every pose. | `Saved/audit-all-character-poses.json` |
| Mounted ride contact | The post-fix editor smoke reports Ride foot height for all 16 rigs, from 34.96 to 45.10 cm in the vehicle frame, and passes. The older Blender probe predates removal of an extra floor lift and is not final comparison evidence. The fresh packaged Marcus ride capture was inspected. | `E:/FlowFestNative58/Evidence/build-ride-floor-editor.log`, `E:/FlowFestNative58/Evidence/smoke-ride-floor-editor.log`, `E:/FlowFestNative58/Evidence/ride.png` |
| Recoverable source captures | The delivery archive contains 80 source captures, including 16 Ride clips. Its recorded SHA-256 was checked against the archive: `9792c6a5947afc83ab270ff65effdab1e26c0a9a621275a689fa7df907284b2c`. | `E:/FlowFestNative58/Evidence/production-performances.tar.gz`, `E:/FlowFestNative58/Evidence/capture-archive.json` |
| Packaged visual review | Fresh wardrobe, flow, mounted ride, fire, gate, and camp captures were inspected without blocking rendering defects. | `E:/FlowFestNative58/Evidence/wardrobe.png`, `flow.png`, `ride.png`, `fire.png`, `gate.png`, `camp.png` |

The 256 animation clips are 11 locomotion clips, four captured flow profiles, and one mounted ride pose per character. The native catalog includes 41 physical prop IDs and 71 selectable variants. Each variant has left and right hand meshes, for 142 meshes. Four captured performance profiles drive flow playback: poi, hoop, club, and double baton. Other props use the closest profile.

The delivery project includes generated Unreal assets and compiled binaries. That detached copy supports native C++ edits, editor launches, and packaging from those assets. Full asset regeneration requires this project inside the source repository because the tooling imports files from `src` and `static`. Raw performance captures are kept in the separate archive above. To restore them for regeneration after integration, extract the archive into `E:/tka-platform/unreal/FlowFest/Saved` so its top-level `PerformanceCaptures` folder becomes `E:/tka-platform/unreal/FlowFest/Saved/PerformanceCaptures`. Verify the SHA-256 before extracting. The [capture guide](Tools/native-capture-README.md) explains how to preserve the original LOOP snapshots when repairing selected rigs.

## Delivery identity

Launch `E:/FlowFestNative58/Builds/Windows/FlowFest.exe`. Its packaged game binary is `FlowFest/Binaries/Win64/FlowFest.exe`, with SHA-256 `0962461850ae1689ca8196da889f1579e4e3118ef5d0de034c792c875167eba7`. The root executable is the Unreal package launcher.

The older executable in `E:/FlowFestNative58/Archive/Windows-before-catalog-integration` predates the full catalog. It is not the final deliverable.

## Scope

This is a native Unreal Engine 5.8 C++ first-night game. It covers Thursday arrival through Friday morning, with three camp paths and native progress saving. The save slot is separate from browser storage. The car and electric unicycle use character movement; the car does not use Chaos vehicle physics. The browser's live sequence editor, arbitrary live IK generation, multiplayer services, and browser save synchronization are outside this native build.
