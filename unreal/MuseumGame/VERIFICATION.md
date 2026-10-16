# Shared Museum playback verification

Verified October 15, 2026 with Unreal Engine 5.8.3, MSVC 14.50.35717, and Blender 5.0.

## Delivered behavior

- 33 stations: 31 animated stations using 25 exact authored Museum routines, one of them a hidden-body formation, plus two static figures without sequences.
- Shared `FlowArtsRuntime` avatar, skeletal animation, prop binding, and playback components. The initial Museum character and prop are x-bot and staff.
- Nearby station controls: P pauses/resumes; B restarts. Both body animation and props freeze and resume together.
- 23 four-second routines and two three-second routines, captured at 30 fps. No generic routine substitution.

## Evidence

| Check | Result |
| --- | --- |
| Focused Vitest export, motion-contract, and character-catalog checks | 16 passed |
| Node pre-import/imported/packaged contract checks and rejection cases | 2 passed |
| Actual browser capture and Blender conversion | 25 captures, 2,940 source frames, 25 FBXs |
| Copied shared asset receipt | 641 files verified by SHA-256 |
| Editor C++ build and exact clip import | Passed; 25 imported clips |
| Editor native smoke | Passed; peak grip and prop-anchor error both 0.11 cm |
| Windows BuildCookRun and packaged data verification | Passed |
| Packaged executable native smoke | Passed; peak grip and prop-anchor error both 0.11 cm |
| Actual editor and packaged rendering | Screenshots inspected; animated shared bodies, staffs, and station controls visible |

Each native smoke checks the 33/31/25 station and routine counts, exact profile identities, prop readiness, hidden-body animation, pause, resume, restart, then every animated station for 4.2 seconds after settling. This includes a full cycle of the longest routine. The failure limit is 15 cm; both tested builds stayed within 0.11 cm.

The packaged executable is `E:/MuseumGameAnimated58/Builds/Windows/MuseumGame.exe`. The detached project, shared plugin, source captures, staged FBXs, and logs are preserved under `E:/MuseumGameAnimated58`. The previous `E:/MuseumGameNative58` build is preserved.

Native logs are `Project/Saved/Logs/MuseumPlaybackSmoke-e070914416f5406c9b393914ffac70fa.log` (editor) and `Project/Saved/Logs/MuseumPlaybackSmoke-e3d823bdd6764bbbafec082f34db808f.log` (package). Build/import logs and captures are in `Project/Saved`; the packaged screenshot is in `Builds/Windows/MuseumGame/Saved/Screenshots/Windows/HighresScreenshot00000.png`.

## Remaining scope

This verifies shared performer playback. The room-specific console transformations, collaboration village, other room dressing, and browser lighting effects listed in the README remain unported. Native room lighting and cave materials still differ from the browser game.

## Movement correction — October 15, 2026

The previous native visitor was capped at 290 cm/s and had no sprint input. The source spawn faced north, but the native game ignored that field and faced east toward the entrance side wall. Museum now walks at 450 cm/s, sprints at 750 cm/s while either Shift is held, and applies the authored facing on initial spawn and return to entrance. Reset also clears queued movement and velocity.

Both native games use Unreal `CharacterMovement` for translation and collision. This correction was coordinated with the Flow Fest agent: Museum's first-person visitor speeds are separate from Flow Fest's measured visible gait. Shared performer animation, prop tracks, and playback clocks are unchanged.

The movement diagnostic measures planar displacement on the real entrance floor with collision enabled. It records game time, wall time, frame rate, sprint release, diagonal speed and stopping distance. It also checks the initial facing and captures the view after returning to the entrance.

| Runtime check | Walk | Sprint | Released Shift | Diagonal | Stop distance |
| --- | --- | --- | --- | --- | --- |
| Editor, previous cap, 60 fps | 290.0 cm/s | — | — | — | — |
| Editor, corrected, 60 fps | 450.0 cm/s | 750.0 cm/s | 450.0 cm/s | 450.0 cm/s | 17.8 cm |
| Packaged executable, corrected, 20 fps | 450.0 cm/s | 750.0 cm/s | 450.0 cm/s | 450.0 cm/s | 30.0 cm |

Steady measurement windows ran at a 1.00 game-time/wall-time ratio. Both runs stopped at zero velocity. The editor C++ build and Windows BuildCookRun passed, and rendered editor and packaged entrance screenshots show the corrected hallway direction and Shift sprint hint.

Runtime evidence in `Project/Saved/Logs`:

- `MuseumMovementSmoke-f7b7baf576bc47aa88297a22923e6380.log` — previous speed reproduced.
- `MuseumMovementSmoke-d119b02d8a8c44129da92c50880bf7a4.log` — corrected movement passed.
- `MuseumMovementSmoke-44aa0e9b794043c9adf88b800b98d55f.log` — packaged movement passed at 20 fps.

The shared imported-data check still verifies 33 stations, 31 animated stations, 25 authored routines, and 641 asset-receipt files. Packaged data verification passed too. The prior full performer playback evidence above remains applicable; this movement correction does not change those components or assets.

The updated executable is `E:/MuseumGameMovement58/Builds/Windows/MuseumGame.exe`. Its source, imported assets, plugin, captures and logs are preserved under `E:/MuseumGameMovement58/Project` and `E:/MuseumGameMovement58/Shared`. Build logs are `Project/Saved/movement-editor-build.log` and `Project/Saved/movement-package.log`; the packaged screenshot is `Builds/Windows/MuseumGame/Saved/Screenshots/Windows/HighresScreenshot00000.png`. The earlier animated build and its running user session were preserved.

## Cave materials and First Fire progression — October 15, 2026

This wave restores the three cave shells' 32 source material slots and 35 textures, including the browser components' color and emissive overrides. The conversion retains texture hashes, factors and UV transforms. Fifteen authored Water/Earth fixtures and three progression-driven Fire lights replace the generic cave light grid. Within these caves and their connecting corridors, the camera uses fixed exposure corresponding to the browser's 1.1 multiplier, so automatic exposure cannot brighten the intended blackout. Older native galleries retain automatic exposure: a packaged screenshot caught that their existing lights become too dark under the cave setting.

First Fire now follows DJ → EK → FL, records orbit completion, latches completed courts off after the visitor moves 14 metres away, runs the 2.2-second blackout, and reveals Earth growth. Body and prop playback use the existing shared runtime; Fire's progression controls when those stations play. Version 2 saves include Fire state. The loader accepts version 1 and initializes Fire progress; an archived version 1 binary save was not available for a migration test.

Authored corridor bounds suppress overlapping tile cubes. Invisible blocked-tile collision contains the visitor, and the first-person capsule now matches the source visitor's 15 cm radius. The Fire–Earth shell adapter extends the existing rock lip and lowers its crown into Earth's passage without changing source GLBs, UVs or material assignments.

### Checks

- The two focused export and First Fire state suites passed: 6 tests.
- Editor C++ build passed with at most four compile actions. d2 has no Unreal installation, so Unreal build, import and runtime verification ran locally.
- Unreal imported all three cave shells and restored 6/8/18 material slots with 10/12/13 textures for Water/Earth/Fire. Import evidence is `Project/Saved/museum-surfaces-import-engine.log` and `Project/Saved/museum-surface-import.json`.
- The native progression smoke verifies court order, orbit and exit completion, extinguish/backtrack behavior, mid-orbit save serialization, blackout timing, material/light state, and paused Fire performers after completion. It then drives the real `CharacterMovement` capsule through the Fire–Earth corridor in both directions, asserts grounding throughout, and checks that a blocked cave boundary stops movement.
- Editor progression passed in `Project/Saved/Logs/MuseumProgressionSmoke-d8b6cd7f345b4bd482cb89df0742d90e.log`.
- Rendered Water, Earth and Fire views were inspected. `Project/Saved/Surface-Water.png`, `Surface-Earth.png` and `Surface-Fire.png` preserve those views. An unlit diagnostic isolates corridor geometry from cave lighting.
- The final `Project/Saved/Surface-FireEarth-Unlit.png` confirms the roof and right-wall openings are closed. Blender ray probes measured 4–5 cm of wall overlap at floor, eye and crown heights after the vertex-only adapter change.
- Windows BuildCookRun passed. Packaged data verification retained 33 stations, 31 animated stations, 25 authored routines and 641 shared asset-receipt files. Build evidence is `Project/Saved/museum-world-package.log`.
- After the regional exposure correction, the packaged progression, playback and movement checks all passed. Playback measured 0.11 cm peak grip and prop-anchor error across all 31 animated stations. At 20 fps, movement measured 450 cm/s walking, 750 cm/s sprinting, 450 cm/s after releasing Shift and diagonally, with a 26.5 cm stop distance and zero final velocity. Steady windows had a 1.00 game-time/wall-time ratio.
- Final packaged screenshots were inspected: `HighresScreenshot00003.png` shows the growth doorway, `00004` the animated gallery, and `00005` the entrance. Gallery and entrance exposure is readable again; the growth doorway remains dark as recorded below.

### Delivered build and final runtime evidence

The executable is `E:/MuseumGameWorld58/Builds/Windows/MuseumGame.exe`. The detached source, imported assets, shared plugin baseline, captures and logs are preserved under `E:/MuseumGameWorld58/Project` and `E:/MuseumGameWorld58/Shared`. Earlier native, animated and movement builds remain available. `BUILD-PROVENANCE.json` records the source commit and delivery hashes.

Final logs in `Project/Saved/Logs`:

| Check | Log |
| --- | --- |
| Packaged progression and collision | `MuseumProgressionSmoke-c502a91b1ec94cb9a85476342f8ed499.log` |
| Packaged shared performer playback | `MuseumPlaybackSmoke-a179e26870944db181aadf08ce5170e6.log` |
| Packaged movement at 20 fps | `MuseumMovementSmoke-15dfb7c655474f27b071a7e4ea2487c1.log` |

The final screenshots are in `Builds/Windows/MuseumGame/Saved/Screenshots/Windows`. The Flow Fest agent was notified when the Unreal build slot was released. This wave leaves the shared runtime and performer asset baseline unchanged; Flow Fest's separate embodiment repairs have not been adopted here.

### Remaining parity work

Water console transformations and prop switching, the Water surface and waterfall shaders, collaboration village simulation, remaining room dressing, animated flames, and full browser lighting parity are still incomplete. The growth doorway remains dark under the authored lamp values. This wave does not establish complete visual parity or test every room's traversal. See the README for the current native scope.
