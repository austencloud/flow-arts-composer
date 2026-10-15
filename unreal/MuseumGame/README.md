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

## Play

| Key | Action |
| --- | --- |
| W A S D, mouse | Walk and look |
| Space | Jump |
| E | Open or close a nearby exhibit plaque |
| P | Pause or resume the nearest animated station |
| B | Restart the nearest animated station |
| F5 / F9 | Save or load native progress |
| R | Return to the entrance |
| Esc | Quit |

The native save records position, view direction, and viewed exhibits in the `MuseumGameNative1` slot. It is separate from browser storage.

## Current native scope

The one-walk contains 27 rooms, 51 exhibits, and 33 performer stations. Thirty-one stations use 25 distinct authored routines captured from Museum sequence data. The initial native rig and prop are the shared x-bot and staff. One telekinetic formation hides the body and displays moving props. Two stations without authored sequences retain static figures. Playback uses the shared `FlowArtsRuntime` avatar and prop components.

The runtime builds the tile footprint with collision, places three imported cave shells, and displays source plaque text in a native HUD. Cave floor collision follows exported terrain elevation. Room-specific water, fire, and earth console transformations, the collaboration village, other authored room dressing, and browser lighting effects remain unported. Cave shells are imported without their source materials, so native visuals still differ from the browser experience.

The layout exporter is `Tools/export-museum.ts`; `Tools/build-export.mjs` runs it against source TypeScript. `Tools/adopt-shared-assets.mjs` verifies and copies the producer asset bundle. Shared Flow Fest converters produce the captured clips. `Tools/convert-shells.py` and `Tools/create-project-assets.py` prepare the cave environment and map. `Tools/convert-performers.py` and `Tools/import-performers.py` maintain static fallback figures.

The [shared Unreal contract](../Shared/README.md) records package ownership, capture identity, timing, coordinates, and source verification.
