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
