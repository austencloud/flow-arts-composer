# Museum Game for Unreal Engine 5.8

This is a native C++ Unreal project for the Museum Game's authored one-walk layout. It uses the museum's source grid, room, exhibit, performer-station, furniture, and cave-shell data. It does not embed the browser game.

## Build

On Windows, install Unreal Engine 5.8, a compatible Visual Studio C++ toolchain, Node.js with this repository's dependencies, and Blender 5.0. The sibling Flow Fest producer project must contain its finalized `/Game/FlowFest` assets and `Tools/staged/Characters` base rig. Set `$PreviewBaseUrl` to a running source preview's base URL. From `unreal/MuseumGame`, export the source manifest and capture the 25 authored routines:

```powershell
node .\Tools\build-export.mjs
node .\Tools\capture-performances.mjs $PreviewBaseUrl .\Saved\PerformanceCaptures .\Content\Data\museum-performances.json
```

Then build and import the native project:

```powershell
pwsh .\Tools\bootstrap.ps1 -SharedProject ..\FlowFest -CaptureDirectory .\Saved\PerformanceCaptures
.\Launch.cmd
```

`bootstrap.ps1` exports the layout and authored performance manifest, copies the verified shared Flow Fest assets under their original `/Game/FlowFest` package names, prepares exact prop tracks and x-bot body clips from the raw captures, converts them in Blender, and imports them into Unreal. It also builds the editor target and retains the cave shell and static performer conversion workflow. `-SharedProject` defaults to sibling `../FlowFest`; `-CaptureDirectory` defaults to `Saved/PerformanceCaptures`. The script also accepts `-EngineRoot`, `-BlenderExe`, and `-CompilerVersion`. Generated data, imported assets, binaries, and the map are ignored by Git. A detached delivery copy includes them, but regeneration must run from this repository because the exporter reads `src` and `static`.

To make a cooked Windows build after bootstrap:

```powershell
.\Package.cmd
.\Builds\Windows\MuseumGame.exe
```

Packaging verifies the imported performance data before cooking and checks staged data afterward. The native archive lives under `Builds/Windows`.

Run `Tools/smoke-playback.ps1` after importing, or pass `-Executable` with a packaged `MuseumGame.exe`. It checks all animated stations, exercises pause/resume/restart, measures body/prop alignment for a full loop, captures a fresh rendered screenshot, and stops its own test process. See [verification results](VERIFICATION.md).

Use `-Mode Movement` for measured walking, sprint, release, diagonal and stopping checks on the entrance floor. `-MovementBaseline` measures the previous 290 cm/s traversal; it only applies to this diagnostic. `-FrameRate 20` checks movement at a lower rendering rate. The runner requires a fresh screenshot and a passing runtime log before stopping its own process.

Use `-Mode Progression` for First Fire court order, orbit and exit completion, extinguishing, backtracking, mid-orbit save serialization, blackout timing, and the Earth growth reveal. It feeds authored positions to the progression system, then walks the actual character through the Fire–Earth corridor in both directions and pushes against a blocked wall. The movement diagnostic separately measures entrance traversal speeds.

## Play

| Key | Action |
| --- | --- |
| W A S D, mouse | Walk and look |
| Hold either Shift | Sprint |
| Space | Jump |
| E | Open or close a nearby exhibit plaque |
| P | Pause or resume the nearest animated station outside First Fire |
| B | Restart the nearest animated station outside First Fire |
| F5 / F9 | Save or load native progress |
| R | Return to the entrance |
| Esc | Quit |

The native save records position, view direction, viewed exhibits, and First Fire progress in the `MuseumGameNative1` slot. Version 1 saves remain readable and begin Fire at its initial state. It is separate from browser storage.

First-person traversal is 4.5 m/s normally and 7.5 m/s while holding Shift. Both Museum and Flow Fest use Unreal's `CharacterMovement` for movement and collision. Museum's capsule uses the browser visitor's 15 cm collision radius. Museum's camera has no visible walking body, so its traversal speeds are tuned independently of Flow Fest's visible gait. Animated exhibit performers continue to use the shared playback runtime.

## Current native scope

The one-walk contains 27 rooms, 51 exhibits, and 33 performer stations. Thirty-one stations use 25 distinct authored routines captured from Museum sequence data. The initial native rig and prop are the shared x-bot and staff. One telekinetic formation hides the body and displays moving props. Two stations without authored sequences retain static figures. Playback uses the shared `FlowArtsRuntime` avatar and prop components. The six Isolation stations also place shared world-space pictograph panels beside their performers; each panel follows its station's prepared performance and playback clock.

The runtime builds the tile footprint with collision, places three imported cave shells, and displays source plaque text in a native HUD. Cave floor collision follows exported terrain elevation, and invisible blocked tile boundaries contain the visitor. The cave imports preserve source base color, roughness, metallic, normal and emissive textures, factors, and UV transforms, including the browser components' material tuning. Authored fixtures replace the generic light grid in these caves, and fixed camera exposure preserves dark scenes there and in their connecting corridors. Other galleries retain their existing automatic exposure. The native Fire shell extends its existing rock lip across the Fire–Earth mesh seam and tapers its roof into Earth's lower passage. First Fire follows the authored DJ → EK → FL court order, accumulates orbit progress, extinguishes completed courts as the visitor leaves, runs the 2.2-second blackout, and reveals growth at the Earth doorway. Its performers and lighting respond to that progression.

Isolation has six editable shadowed key lights, one room fill, and a bounded EV100 exposure volume in the native map. First Fire's progression switches the active performer's prop finish so the shared Niagara wick effect follows its lit court. Water console transformations and prop switching, the collaboration village simulation, other authored room dressing, environmental animated shader flames, and remaining browser lighting effects are still unported. The new wick effect covers prop fire, not the environmental flames. Flame placement markers stay hidden, as they do in the source game. The separate lobby scene's assets do not fit the current one-walk entrance and are not placed there. Native lighting is not yet a complete match for the browser scenes.

The layout exporter is `Tools/export-museum.ts`; `Tools/build-export.mjs` runs it against source TypeScript. `Tools/adopt-shared-assets.mjs` verifies and copies the producer asset bundle. Shared Flow Fest converters produce the captured clips. `Tools/prepare-shells.mjs` decodes compressed glTF and WebP sources using the same dependency stack as Flow Fest. `Tools/convert-shells.py` preserves mesh material slots, and `Tools/museum_surface_materials.py` restores PBR materials from source manifests with texture hashes. `Tools/create-project-assets.py` imports the cave environment and map. `Tools/convert-performers.py` and `Tools/import-performers.py` maintain static fallback figures.

`Tools/create-project-assets.py` also authors Isolation's map lighting through `Tools/museum_isolation_lighting.py`; `Tools/update-isolation-lighting.py` updates just those tagged actors in an imported map. The generated map remains an import output. The shared `../Shared/Tools/create-world-score-material.py`, `../Shared/Tools/create-niagara-fire-materials.py`, and `FlowArts.BuildNiagara` author plugin assets used by the score and fire effect. `Tools/review-exhibit.ps1` captures a specified native Isolation view for visual review and stops its own process. See [verification results](VERIFICATION.md) for recorded checks.

The [shared Unreal contract](../Shared/README.md) records package ownership, capture identity, timing, coordinates, and source verification.
