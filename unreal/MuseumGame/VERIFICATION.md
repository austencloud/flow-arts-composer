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
