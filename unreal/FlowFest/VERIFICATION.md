# Flow Fest native verification

This record separates checks that have passed in the Unreal Editor from checks still needed on the final Windows package. Evidence was collected on October 15, 2026. Logs in `Saved` are build artifacts and are not committed with this report. The delivery copy is under `E:/FlowFestNative58/Evidence`.

## Checks with evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Unreal Engine 5.8 editor target | Passed at the recorded revision. UnrealBuildTool reports `Result: Succeeded`. Source has changed since this build, so the final build needs its own check. | `Saved/build-final-editor.log` |
| Catalog and story smoke in editor game mode | Passed at the recorded revision. The log reports 16 character choices, 71 prop choices, and `FlowFestSmoke PASS: all three native camp journeys and isolated save/load`. | `Saved/smoke-final-editor.log` |
| Imported prop assets | Passed import validation: 142 hand meshes, with an empty `errors` array. | `Saved/validate-props-report.json`, `Saved/import-props-report.json` |
| Authored right-hand geometry | The validator reports 45 left/right FBX pairs and 18 GLB source matches. Blender prints an add-on shutdown traceback after this success line; that traceback does not establish a geometry failure. | `Saved/validate-authored-rights.log` |
| Character pose audit | The report contains 16 rigs and records 256 evaluated clips over 768 frames. It is a structural pose audit, not a visual quality judgment for every pose. | `Saved/audit-all-character-poses.json` |
| Review images | Gate, camp, fire, overview, wardrobe, and flow captures exist. The final packaged build has not yet been visually reviewed. | `Saved/Review` |

The 256 animation clips are 11 locomotion clips, four captured flow profiles, and one mounted ride pose per character. The native catalog includes 41 physical prop IDs and 71 selectable variants. Each variant has left and right hand meshes, for 142 meshes. Four captured performance profiles drive flow playback: poi, hoop, club, and double baton. Other props use the closest profile.

## Final delivery checks pending

- Compile the final source revision after the character ride and HUD changes.
- Run the final editor smoke against that revision and retain the resulting log.
- Package the Windows build and confirm `Builds/Windows/FlowFest.exe` and `Builds/Windows/FlowFest/Content/Paks` exist.
- Launch that packaged executable, complete a package smoke, and inspect final captures for gate, camp, fire, wardrobe, and flow scenes.
- Copy the verified package, Unreal project, final logs, and captures into `E:/FlowFestNative58` before marking the delivery ready.

The older executable in `E:/FlowFestNative58/Archive/Windows-before-catalog-integration` predates the full catalog. It is not the final deliverable.

## Scope

This is a native Unreal Engine 5.8 C++ first-night game. It covers Thursday arrival through Friday morning, with three camp paths and native progress saving. The save slot is separate from browser storage. The car and electric unicycle use character movement; the car does not use Chaos vehicle physics. The browser's live sequence editor, arbitrary live IK generation, multiplayer services, and browser save synchronization are outside this native build.
