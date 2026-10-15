# Museum Game for Unreal Engine 5.8

This is a native C++ Unreal project for the Museum Game's authored one-walk layout. It uses the museum's source grid, room, exhibit, performer-station, furniture, and cave-shell data. It does not embed the browser game.

## Build

On Windows, install Unreal Engine 5.8, a compatible Visual Studio C++ toolchain, Node.js with this repository's dependencies, and Blender 5.0. From the repository's `unreal/MuseumGame` directory:

```powershell
pwsh .\Tools\bootstrap.ps1
.\Launch.cmd
```

`bootstrap.ps1` exports the source layout to `Content/Data/museum.json`, converts the source cave GLBs to FBX, compiles the editor target, and creates the native map and materials. It accepts `-EngineRoot`, `-BlenderExe`, and `-CompilerVersion`. The generated data, imported assets, binaries, and map are ignored by Git. A detached delivery copy includes them, but regeneration must run from this repository because the exporter reads `src` and `static`.

To make a cooked Windows build after bootstrap:

```powershell
.\Package.cmd
.\Builds\Windows\MuseumGame.exe
```

The packaging script checks that the cooked layout contains at least 20 rooms and 40 exhibits. The native archive lives under `Builds/Windows`.

## Play

| Key | Action |
| --- | --- |
| W A S D, mouse | Walk and look |
| Space | Jump |
| E | Open or close a nearby exhibit plaque |
| F5 / F9 | Save or load native progress |
| R | Return to the entrance |
| Esc | Quit |

The native save records position, view direction, and viewed exhibits in the `MuseumGameNative1` slot. It is separate from browser storage.

## Current native scope

The exported one-walk contains 27 rooms, 51 exhibits, and 33 performer stations. The runtime builds the full tile footprint with collision, places the three imported cave shells, and displays source plaque text through a native HUD. Cave floor collision follows the exported terrain elevation. Sixteen imported character models are reused across the performer stations. This is a walkable museum foundation. The browser's animated performances, sequence playback, interactions beyond plaque reading, authored room dressing, and lighting effects have not yet been ported. Cave shells are imported without their source materials. The native visuals therefore differ substantially from the browser experience.

The layout exporter is `Tools/export-museum.ts`, and `Tools/build-export.mjs` runs it against the repository's TypeScript source. `Tools/convert-shells.py` prepares source cave GLBs in Blender; `Tools/create-project-assets.py` imports them and creates the Unreal map. `Tools/convert-performers.py` and `Tools/import-performers.py` prepare the performer models.
