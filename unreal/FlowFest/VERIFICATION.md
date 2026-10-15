# Flow Fest living world verification

The living world upgrade at `E:/FlowFestLivingWorld58` passed its native, package, smoke, visual, and detached-project checks. Its `Project` and sibling `Shared` directory form the editable native project. The earlier release at `E:/FlowFestNative58` remains available. Local source integration is recorded separately in `E:/FlowFestLivingWorld58/Evidence/integration-final.log` after it runs.

## Release contract

- Unreal Engine 5.8, using the installed 5.8.3 build.
- Preserve all 16 deployed characters, 41 physical prop families, 71 selectable variants, and 142 hand meshes.
- Capture two production routines per physical family and character: 1,312 family clips, each 480 frames at 30 fps. Keep 64 legacy flow clips, 16 ride clips, and 176 locomotion clips, for 1,568 native animation clips.
- Family captures must use `clock-isolated-body-v3`; compact motion uses 28-value `flow-fest-prop-motion-v3` frames and records the raw source SHA-256.
- Complete motion, ecology, sound, journey, save, package, and visual checks before delivery.

## Current evidence

Paths beginning with `Saved/` or `Content/` are relative to the repository's `unreal/FlowFest`. Files named after an absolute evidence directory in a table row are in that directory.

| Check | Result | Evidence |
| --- | --- | --- |
| Native editor build | The final Unreal Engine 5.8 editor build passed at source commit `dd17c46fb8`. | `E:/FlowFestLivingWorld58/Evidence/flowfest-native-final-gate.json`, `flowfest-editor-final-build.log` |
| Corrected family captures | Complete: 16 rigs × 82 roles = 1,312 clips, each 480 frames at 30 fps. The final manifest has 82 preserved sequence snapshots, exact role/prop matches, and no seam or adjacent-frame threshold violations across 5,248 hand/prop streams. All 16 per-rig archives have SHA-256 sidecars and were merged with internal-file hash checks. | `E:/FlowFestLivingWorld58/Evidence/LivingCaptures-v3/capture-completion-qc.txt`, `capture-producer-final.log`, the 16 `*-v3.tar.gz` archives and sidecars, `Project/Saved/PerformanceCaptures-v3/family-manifest.json` |
| Compact prop motion and native import | All 16 rigs imported 82 native family profiles each, for 1,312 total. The strict runtime validator passed with 16 characters, 41 prop families, 71 variants, 1,568 animation references, 1,312 family clips, 1,376 compact clips, and 660,480 checked frames. Museum's 25 comparison clips and Flow Fest's prior 1,130 clips remained byte-identical through the shared-converter merge. | `E:/FlowFestLivingWorld58/Evidence/flowfest-native-final-gate.json`, `MergeCompatibility/flowfest-runtime-data-final.log`, `MergeCompatibility/museum-compact-parity.json`, `MergeCompatibility/flowfest-compact-parity.json`, `native-import-summary.json`, `NativeImports/` |
| Real source-to-compact basis conversion | Staff, poi, fan, and stick A pilots passed the asymmetric-point basis check, including the animated visual-body transform. Full native playback then passed the unfiltered motion suite. | `Saved/PerformanceCaptures-v3-pilot`, `E:/FlowFestLivingWorld58/Evidence/flowfest-native-final-gate.json` |
| Native family motion | The unfiltered six-suite run passed across all 1,312 family profiles, foot contacts, locomotion transitions, crowd routes, ecology and sound assets, and reactive sound state. Maximum sampled captured-hand error was 0.37 cm at `ch01/P_bigbuugeng_A`; maximum prop-anchor error was 0.20 cm. Routine transition and visual-body thresholds passed. | `E:/FlowFestLivingWorld58/Evidence/flowfest-native-final-gate.json`, `flowfest-automation-final.log` |
| Walking and jumping visuals | Native frame sequences show travel with alternating feet, takeoff, airborne pose, landing, and recovery. | `E:/FlowFestLivingWorld58/Evidence/walk-sequence.png`, `jump-sequence.png` and their numbered frames |
| Prop variant visuals | Native frame sequences preserve triangle side grip and mirrored buugeng geometry during steady spinning. | `E:/FlowFestLivingWorld58/Evidence/triangle-side-v3-contact-sheet.png`, `buugeng-mirrored-v3-contact-sheet.png` |
| Locomotion and crowd automation | Foot contacts, locomotion transitions, and identity route/fire rotation checks pass. | `Saved/automation-motion-final.log`, `Saved/automation-crowd-final.log` |
| Ecology and daylight | Native material imports compile. Daytime camp, noon exposure, and sunset flow exposure were visually reviewed; the v6 noon and sunset images were accepted. The packaged noon, sunset, and fire captures also passed visual review. | `Saved/Logs/import-ecology-art-pass.log`, `E:/FlowFestLivingWorld58/Evidence/camp-art-final.png`, `noon-exposure-v6.png`, `sunset-flow-exposure-v6.png`, `packaged-noon.png`, `packaged-sunset.png`, `packaged-fire.png` |
| Audio generation | Six deterministic mono ambient loops generated on d2 with amplitude and loop-boundary checks. | `Tools/staged/audio/audio-report.json` |
| Spatial sound state | Native distance falloff, reactive day/night/jam gains, mute/resume, and rebuild checks pass. Occlusion configuration is checked; this is not an auditory listening review or a physical obstruction trace test. | `FlowFest.Sound.DistanceAndReactiveMix` in `Saved/automation-xbot-full-v3.log` |
| Incomplete runtime data rejection | Passed negative control: the packaging preflight rejects the incomplete motion manifest. | `Saved/validate-runtime-incomplete.log` |
| Source checks | The d2 Svelte typecheck passed with zero errors and warnings. The changed-file compile gate passed for one Svelte file, also with zero errors and warnings. | `E:/FlowFestLivingWorld58/Evidence/source-check-summary.json`, `d2-source-check.log`, `d2-compile-gate.log` |
| Windows package and standalone smoke | Unreal Automation Tool completed build, cook, stage, package, and archive with exit code 0. The staged runtime validator passed. The packaged game loaded all 1,312 family performances and completed all three native camp journeys and isolated save/load; the smoke process exited 0. | `E:/FlowFestLivingWorld58/Evidence/package-final.log`, `packaged-smoke-final.log` |
| Package identity and visual review | The archive has seven executable and cooked-data files recorded with SHA-256. The main game binary is SHA-256 `61484434ad4d6c0d957296e0534c619ecf48383ef47b619db0b5783a5fe51ee7`. Packaged noon, sunset, fire, and wardrobe reviews exited 0. The fire sequence shows attendee bodies and props advancing in a readable night scene; wardrobe shows 16 characters, 71 choices, and the selected character with a white fan. Launcher checks found no native errors or material failures. | `E:/FlowFestLivingWorld58/Evidence/package-file-manifest.json`, `packaged-noon.png`, `packaged-noon.log`, `packaged-sunset.png`, `packaged-sunset.log`, `packaged-fire.png`, `packaged-fire-001.png` through `packaged-fire-005.png`, `packaged-fire.log`, `packaged-wardrobe.png`, `packaged-wardrobe.log` |
| Detached editable project | The delivered project loaded its Festival map through the sibling shared runtime plugin. The commandlet exited 0 with zero errors and warnings, and found three native classes and 16 skeletal character meshes. | `E:/FlowFestLivingWorld58/Evidence/detached-project-check.json`, `detached-project-check.log` |

## Evidence limits

Automated sound-state checks confirm distance falloff, reactive gains, mute/resume, and occlusion configuration. They do not certify an auditory listening review or a physical obstruction trace test. Visual captures and smoke checks exercise the packaged build but do not measure GPU frame time.

## Scope

The game retains the original character and equipment catalogs. Native movement includes velocity-matched gait playback, strafing, backward travel, jump/landing timing, terrain foot correction, and contact-triggered footstep sound. Body animation and props share a playback clock; each physical prop family has two captured production routines.

The environment adds 21,731 grass placements and 20 understory placements, foliage wind, ground surface layers, scheduled attendees, and six original spatial ambient loops. The first-night journey covers Thursday arrival through Friday morning with three camp choices and native progress saves.

The routines are finite source captures. Arbitrary native TKA sequence editing, multiplayer services, browser save synchronization, a full festival weekend, and Chaos car physics remain outside this build. Camp/crowd ambience is synthesized texture without recorded speech. Existing car and EUC movement uses the character movement system.

## Previous release

The earlier playable package is `E:/FlowFestNative58/Builds/Windows/FlowFest.exe`. Its game binary SHA-256 is `0962461850ae1689ca8196da889f1579e4e3118ef5d0de034c792c875167eba7`. Its 80 legacy raw captures are preserved at `E:/FlowFestNative58/Evidence/production-performances.tar.gz`, SHA-256 `9792c6a5947afc83ab270ff65effdab1e26c0a9a621275a689fa7df907284b2c`. These identities certify the prior release only.
