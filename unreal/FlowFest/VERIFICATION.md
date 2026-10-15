# Flow Fest living world verification

The living world upgrade is in verification. The earlier release at `E:/FlowFestNative58` remains available. This report does not certify the new package until its final gates below pass.

## Release contract

- Unreal Engine 5.8, using the installed 5.8.3 build.
- Preserve all 16 deployed characters, 41 physical prop families, 71 selectable variants, and 142 hand meshes.
- Capture two production routines per physical family and character: 1,312 family clips, each 480 frames at 30 fps. Keep 64 legacy flow clips, 16 ride clips, and 176 locomotion clips, for 1,568 native animation clips.
- Family captures must use `clock-isolated-body-v3`; compact motion uses 28-value `flow-fest-prop-motion-v3` frames and records the raw source SHA-256.
- Complete motion, ecology, sound, journey, save, package, and visual checks before delivery.

## Current evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Native editor build, corrected visual-body playback | Passed; UnrealBuildTool reports `Result: Succeeded`. | `Saved/build-v3-visual.log` |
| Capture pilot | Eight x-bot routines (staff, poi, fan, stick; A/B) passed the source continuity gates on d2. The full catalog is pending. | d2 `E:/FlowFestLivingCaptures-v3` |
| Real source-to-compact basis conversion | Staff, poi, fan, and stick A pilots passed the asymmetric-point basis check, including the animated visual-body transform. Native playback remains a separate gate. | `Saved/PerformanceCaptures-v3-pilot` |
| Audio generation | Six deterministic mono ambient loops generated on d2 with amplitude and loop-boundary checks. | `Tools/staged/audio/audio-report.json` |
| Incomplete runtime data rejection | Passed negative control: the packaging preflight rejects the incomplete motion manifest. | `Saved/validate-runtime-incomplete.log` |

## Final gates still pending

- Complete corrected captures, preserved sequence snapshots, source hashes, Blender conversion, and native import for all 16 rigs.
- Full native motion automation: all 1,312 family routines, imported bodies and props, wrist alignment, visual-body rotation, and routine transitions.
- Foot contact and locomotion transition tests; visual walking, jumping, landing, and spinning checks.
- Ecology import with valid compiled materials; daytime ground/trees and nighttime fire review.
- Spatial ambience import, attenuation/occlusion and mute state checks, and native crowd routes/performer rotation.
- Strict runtime data preflight, Windows cook/package, staged-data validation, and standalone journey/save/catalog smoke.
- Detached playable package and editable project with hashes, evidence archive, and final local main integration.

## Scope

The game retains the original character and equipment catalogs. Native movement includes velocity-matched gait playback, strafing, backward travel, jump/landing timing, terrain foot correction, and contact-triggered footstep sound. Body animation and props share a playback clock; each physical prop family has two captured production routines.

The environment adds 21,731 grass placements and 20 understory placements, foliage wind, ground surface layers, scheduled attendees, and six original spatial ambient loops. The first-night journey covers Thursday arrival through Friday morning with three camp choices and native progress saves.

The routines are finite source captures. Arbitrary native TKA sequence editing, multiplayer services, browser save synchronization, a full festival weekend, and Chaos car physics remain outside this build. Camp/crowd ambience is synthesized texture without recorded speech. Existing car and EUC movement uses the character movement system.

## Previous release

The earlier playable package is `E:/FlowFestNative58/Builds/Windows/FlowFest.exe`. Its game binary SHA-256 is `0962461850ae1689ca8196da889f1579e4e3118ef5d0de034c792c875167eba7`. Its 80 legacy raw captures are preserved at `E:/FlowFestNative58/Evidence/production-performances.tar.gz`, SHA-256 `9792c6a5947afc83ab270ff65effdab1e26c0a9a621275a689fa7df907284b2c`. These identities certify the prior release only.
