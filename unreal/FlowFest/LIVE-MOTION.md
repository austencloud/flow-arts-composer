# Live motion and attendee activities

This upgrade adds portable sequence motion to the shared Unreal runtime, measured arm clearance, and poses for carrying equipment, eating, and sitting on the ground. The existing character and equipment catalogs remain the source of identity and appearance.

The delivery root is `E:/FlowFestLiveMotion58`: [Windows package target](E:/FlowFestLiveMotion58/Builds/Windows), [editable project](E:/FlowFestLiveMotion58/Project/FlowFest.uproject), [shared runtime](E:/FlowFestLiveMotion58/Shared), and [exporter launcher](E:/FlowFestLiveMotion58/Open-Sequence-Exporter.cmd). The catalog includes 16 characters, 41 prop families, and 71 exact variants. The standalone exporter is verified; native package and full-cycle collision verification remain pending.

## Current acceptance status

The arbitrary-sequence exporter has passed 25 actual browser downloads on source `552969d788`, covering all 16 characters, six scores, and wall, wheel, and floor planes. Cases include staff, mirrored buugeng, poi, fractional one-shot timing, absent-hand motion, and longer 8- and 16-step scores. Every file passed the 2 mm visible-palm contact gate; the largest measured gap was 0.005507 cm. Files, build receipt, and hashes are recorded in `Evidence/FinalSequences-552969d788/acceptance-manifest.json`. The exact source passed 39 focused tests and a web check with zero errors and warnings on d2.

Carrying no longer flips the wrists and staffs by 180 degrees while walking. A 60-frame capture used the actual Walk clip at 185 cm/s. Same-frame world transforms independently confirm rigid palm attachment, with hand-local prop variation below 0.000003 cm. An earlier apparent 2.77 cm drift came from the diagnostic's mirrored-transform conversion; it was not a runtime grip defect.

Eating was checked through 270 advancing frames across x-bot, ch34, and ch44. These samples have no measured upper-arm/torso crossings; the wrists and food path remain unchanged and elbows stay below the shoulders. Conservative body envelopes still report some residuals, so this does not establish complete collision clearance. Ground sitting now places the x-bot pelvis at floor level, with the palms above the thighs; separate 60-frame sit and rise captures cover the transition. These results do not establish every activity on every rig.

Dense spinning clearance remains under active correction. The native weighted-skin checks exposed contacts already present in the source motion, as well as conservative separation tests that can reject disjoint bent arms. Source continuity also has remaining interior elbow branch changes in some built-in x-bot staff clips. A continuous prepared elbow path and its final native surface checks are not yet accepted. Background preparation passes a stationary two-frame positive fixture and correctly retains failure for the difficult moving staff clip after restart; this does not establish successful preparation of a full moving cycle. No current evidence establishes collision-free arbitrary sequences or final crowd performance.

Both authored turn clips have been retargeted for all 16 characters. All 32 imported clips passed native duration, signed hip orientation, and horizontal hip travel checks. Their import preserves every existing character field and animation mapping. This verifies the turn assets; grounded stance planning and full-cycle spinning clearance still require their runtime checks.

The 25 accepted browser captures passed the native runtime importer and playback-session tests, including incompatible input and oversized-file rejection. The report is `Evidence/native-final25-import-81d7-report/index.json`. This exercises the runtime API rather than the Slate file-picker interface. The Windows package and local-main integration remain pending. Earlier measurements in `Evidence` are diagnostic history and must not be presented as acceptance of the final build.

## Bring a new sequence into Unreal

1. Double-click [Open-Sequence-Exporter.cmd](E:/FlowFestLiveMotion58/Open-Sequence-Exporter.cmd). It starts the prepared local companion if needed and opens the capture page.
2. Paste a Composer sequence JSON or verified performance transfer. Choose the character and the exact prop variant you will equip in Unreal.
3. Capture and download the `.motion.json` file. The exporter runs the production web performer, including its hands, fingers, prop motion, and the prop length actually used by the renderer.
4. In Flow Fest, press **C** to equip that character and prop. Press **F6**, enter the motion file's full path, and choose **Load motion**. Paths may also be relative to the game's `Saved/Performances` directory.
5. Use the performance library's playback controls to pause, seek, restart, and change speed.

New captures load at runtime; they do not need an Unreal asset import, compilation, or new game package. Each file is specific to its character rig and exact prop build. The importer checks those identities and rejects incompatible files with an explanation. Capture the same sequence again to use another character or prop variant. Captured prop length is restored on import; older captures use the catalog length. Playback identity includes the complete validated capture, so a resized or recaptured version cannot resume a different track accidentally.

New captures measure each calibrated palm against its visible prop grip at every sampled frame. A gap above 2 mm on a visible prop stops the export with an explanation. Hidden or absent prop motions retain the source arm pose and socket data, but render no prop or effect and contribute no fake prop collision geometry. V5 records this measurement plus the posed palm location and authored finger relaxation. The native importer requires the complete contact record and checks the additional socket data. Older v3 and v4 captures remain readable. Native playback separately measures palm contact after its own body correction, so the export record does not substitute for a native contact check.

Supported input is valid application `SequenceData`, directly or inside a verified performance transfer. A legacy `stepNumber: 0` row supplies the starting position and is normalized out of the timed steps. Timing preserves the exact sum of authored step durations, including fractional seconds. Sampling is nominally 30 samples per second: durations between frame boundaries use evenly spaced intervals of at most 1/30 second, with an exact terminal timestamp. One-shot captures include the terminal pose; loops wrap at the exact duration. The export limit is 1,024 steps and 600 seconds. A runtime capture contains the motion as well as the score, so a score JSON alone is not a native motion file.

The exporter's **Default plane** selector accepts wall, wheel, or floor. Explicit planes already authored on individual motions take precedence. The chosen default is recorded with the capture and included in the playback identity; wall remains the default for older files. This setting controls the shared performer before sampling, so Unreal receives the corresponding body and prop motion together. Capture support alone does not establish native collision clearance for every plane or mixed-plane sequence.

### Restart the delivered exporter

The supplied `Open-Sequence-Exporter.cmd` launcher uses `Sequence-Exporter.json` to select the prepared bundle and port. It needs installed Node.js. It checks the running server's build receipt, starts a hidden companion when needed, and records the process and URL in `Sequence-Exporter-running.json`. A conflicting server produces an error instead of being stopped.

Keep the configured `Exporter-<commit>` folder intact. The runner verifies `unreal/FlowFest/Intermediate/native-capture-static/native-capture-build.json` against the built files and serves the supplied `static` assets. The prepared bundle runs without the source checkout or an npm install.

The launcher reads its bundle and port from `Sequence-Exporter.json`. The current [local exporter](http://127.0.0.1:64152/test/flow-fest-native-export?custom=1) runs `Exporter-81d7d08f5f` on port 64152, with a responsive canvas and a visible finished-pose preview. Direct browser checks cover seven viewport sizes and equivalent 200% reflow, plus fresh loop and one-shot exports. Evidence is in `Evidence/exporter-preview-81d7d08f5f`. The original 25 accepted browser captures were produced by `Exporter-552969d788`; their receipt file SHA-256 is `074dab6a2269a6fa5350a6b90cbd9675c25bcfb2d7035f73bbb96bdac2151192` and build identity is `449e5ae7fdde8fe6848ff8828ec312982cc2a0ed846e8e95fad27d83b82ed612`. Interface-only updates retain that capture baseline and require their own receipt and fresh browser check; they do not change which build produced those files. `Tools/Verify-Delivery.ps1` checks this provenance, the performance hashes, the packaged catalogs, and source parity with the editable project.

Effective prop length is measured from the rendered performer and stored in each capture. First-valid rig calibration can vary slightly during initialization; each file retains its own fitted length and measured contact result. Different fitted lengths produce different validated payload identities. `Performances/index.json` identifies the exact files used for native acceptance. Earlier calibration comparisons remain in `Evidence/compatible-family-comparison-b8e49c2eb7.json`.

### Rebuild the exporter from source

Build the capture bundle on d2 using the repository's `scripts/d2-run.ps1` workflow:

```text
pnpm exec vite build --config unreal/FlowFest/Tools/native-capture.vite.config.mjs
```

Transfer `unreal/FlowFest/Intermediate/native-capture-static`, including `native-capture-build.json`, to the matching source checkout. From that repository root, start the local companion:

```text
node unreal/FlowFest/Tools/native-capture-static-runner.mjs --serve
```

The command prints the exporter URL. Keep it running while capturing. The receipt checks the built files before serving them. The source checkout must also have the deployed optimized avatar assets and repository dependencies. Rebuilding requires the repository; the delivered exporter uses its prepared bundle.

For automated captures from the source checkout, pass a request JSON containing `sequence`, `characterId`, `propType`, `propId`, `effectId` (`fire` or `led`), and `loop`. Optional `capturePlane` accepts `wall`, `wheel`, or `floor` and defaults to `wall`:

```text
node unreal/FlowFest/Tools/native-capture-static-runner.mjs OUTPUT_DIRECTORY --runner unreal/FlowFest/Tools/capture-runtime-motion.mjs --manifest REQUEST.json
```

## How the body correction works

The native prop roots attach to calibrated palms. Their orientation, scale, and visual rotation come from the same sampled transforms used to build the collision geometry, including the transition into a performance and switches between routines. Diagnostic source-wrist deviation is separate from the distance between the final palm and visible grip.

Unreal samples the captured body, wrists, and props from one playback clock. The ordinary runtime applies a bounded temporal response to body, arm, and opposite-prop contacts. Each hand and its owned prop may move by at most 8 cm, at no more than 30 cm per second. The response uses contact gradients and a fresh final query; it preserves limb lengths and prop orientation. Independent hand motion can change the relative hand pattern. This fallback leaves the hips and feet anchored and reports any remaining contact.

Eating and resting retain their authored wrist positions. Their activity correction changes each elbow's swivel by at most 15 degrees and 30 degrees per second. The revised eating pose places the elbows farther from the torso while preserving the bowl and spoon paths. Full-cycle weighted-skin checks found no upper-arm/torso crossings on the three tested rigs; conservative envelopes still report residuals. This is narrower evidence than complete collision clearance. Earlier broad searches that shifted hands by 35 cm are no longer the production path for measured avatars.

The broad clearance checks use envelopes measured from each imported rig's LOD0 skin, including torso hulls, exposed upper-arm regions, and limb radii. A weighted-skin narrow phase checks both deformed upper arms against the torso surface. The first 23% of each upper arm, at its shoulder attachment, is excluded from the torso check. Complete closed arm surfaces can also resolve false contacts between the broad arm capsules; this includes hands and fingers, surface separation, and containment checks in both directions. Open sleeves and clothing retain their original triangles and can establish separation only when every relevant component has a strict padded projection gap. Overlapping bounds are inconclusive and keep the contact rejected. Focused tests cover separation, overlap, containment, and the actual ch01 runtime callback; they do not establish clearance for all ch01 poses. Forearm-to-body and head checks retain conservative envelopes. Complete arms check the opposite prop, and the trunk checks held props using the available closed-surface or conservative open-cover method. Unsupported meshes retain conservative checks. Equipped props use conservative capsule covers fitted to their actual imported triangles. Curved and hollow props can use up to 16 capsules, with a separate cover for each hand; old catalogs fall back to the whole-mesh bounds. A skin certificate cannot waive a prop passing through the torso or head. Carrying uses an authored relaxed pose over locomotion; equipped props remain attached to the calibrated palms.

A previous frame's bounded response is carried forward only while playback and rig identity remain continuous. Seeks, rig or clip changes, and discontinuities reset it. Exact repeats reuse the complete solved body pose only when every input bone transform, prop capsule, rig identity, and solver setting still matches; pausing does not repeatedly change the correction. The final certificate describes the final evaluated pose, including unresolved contacts. Missing skin data retains conservative diagnostics instead of starting an expensive whole-body search.

Lower-body coverage retains original triangles influenced by either thigh, calf, foot, or their descendants, including disconnected shoes. Arms and held props must separate from those posed regions with padding. Overlapping conservative regions reject even when their actual surfaces might be disjoint; open mesh pieces cannot establish volume clearance. Accessories without those bone influences are outside this coverage.

Imported clips and built-in performance routines support background preparation of a continuous correction path. Preparation uses immutable copies of the rig geometry and runs at most two jobs at once. Matching attendees share a path keyed by the complete motion, rig, scale, palm calibration, prop geometry, and correction policy. A path becomes usable only after every source pose and interval midpoint, including a loop's closing interval, passes its clearance and continuity checks. Partial and failed paths are never used. Seeking resets the live correction while retaining a matching prepared path. Playback still checks the final evaluated pose; preparation is guidance rather than a guarantee for every possible sequence or interpolated time. The preparation limit is 512 source frames, sufficient for the bundled 480-frame routines, with midpoint checks in addition. Longer captures remain loadable and use the live correction; a partially sampled path cannot be published as fully prepared. A focused native test confirms that ordinary x-bot staff playback requests its 480-frame routine without replay-only flags. After deliberately failing the initial arm-only attempt, the test captures both turn clips (59 poses) and continues into independent stance capture. This establishes the fallback connection, not successful preparation or clearance of the entire routine.

Short attendee turns retain unfinished preparation. When the last attendee leaves a routine, its worker finishes the current bounded slice, parks its progress, and releases its worker slot. A later matching routine resumes that same entry. Dormant entries remain subject to the 64-entry cache limit and can be evicted; changed motion or equipment identities cannot reuse them. A focused regression covers repeated short sessions and both worker slots being occupied.

Entry into a prepared stance uses the displayed fallback pose as its starting point. A quarter-second blend can begin only when the body and both feet will stay neutral for the full interval, with one source-frame margin. Intermediate frames receive fresh clearance queries but can still contain contact; they are not reported as active prepared motion. The final frame must pass its clearance check before activation. A missed frame that carries the blend into a foot turn cancels entry. Actual moving-sequence activation remains part of the pending native acceptance.

Grounded stance preparation is currently being verified. It uses the imported turn clips to move the body into a stance, hold it, and return on the performance clock. Support, limb reach, continuity, ground contact, and the posed skin must pass before a stance can activate. Its bounded hand offsets follow the performance plane's normal and move each visible prop with its hand. The moving-loop acceptance test has not passed; the presence of this planner is not evidence that a sequence receives a successful stance.

These checks do not simulate cloth or guarantee freedom from every possible skin or prop intersection. Some authored reaches remain infeasible within the correction bounds. Diagnostics report the worst obstacle and arm segment, fitted envelope, solve duration, common hand-and-prop translation, independent per-hand displacement, source-pose deviation, shoulder angles, and residual overlap. Palm-to-grip contact is measured separately from source-pose deviation. A reported correction still needs rendered review. See the current acceptance status above for pending clearance and performance acceptance.

The imported skeletal meshes need LOD0 CPU access to measure their envelopes. To update existing assets without regenerating their animations, set `FLOW_FEST_CPU_ACCESS_ONLY=1` while running `Tools/import-characters.py` in the Unreal Python commandlet. Remove that environment flag afterward.

## Attendee activities

- **Carry:** hands hold the equipped props near the torso while the walking animation continues underneath. Equipped attendees also carry their props while waiting for a turn or socializing; equipment is stowed during meals and floor rest.
- **Eat:** one hand supports a bowl; the other cycles through scooping, lifting food, taking a bite, and returning.
- **Rest:** the pelvis and upper body descend together, the legs bend with feet forward, and hands settle near the thighs. The attendee completes the standing transition before walking to the next destination.

For the player, press **E** at the food stop to eat or at camp to rest. Press **E** or move to end the break early; **Space** also requests a rise from rest. Closing the performance library keeps playback running. Movement or **Q** stops a performance and restores carrying.

Activity clocks and the standing delay are part of the attendee simulation state, including saved state. Player food and rest interactions drive the same pose adapter. Leaving rest completes the standing transition before walking, jumping, riding, or starting a performance; carried equipment returns after the transition. Saving and loading during this transition preserves its pose and remaining delay. The deterministic evidence harness can select the same activity phases for review.

Attendee intentions continue updating offscreen. Skeletal pose evaluation is limited to rendered attendees to avoid spending the collision-solving budget on hidden characters.

## Reproduce a pose review

`Tools/launch.ps1` accepts `-Activity carry|eat|sit`, `-ActivityTime`, and `-ActivityExit` for a deterministic activity pose. Combine them with `-Showcase idle`, `-PoseEvidence`, an absolute `-Capture` path, `-Offscreen`, and `-AutoExit`. Use `-Showcase walk` to inspect carrying over locomotion.

Add `-ActivityPlayback` to advance the activity during a frame capture. The activity begins at `-ActivityTime` when the capture warmup ends; a nonnegative `-ActivityExit` counts down to the end of the rise. Without this switch, the evidence pose stays frozen. `-CaptureFrames` and `-CaptureInterval` select the review length. These deterministic captures use a fixed timestep and are not performance benchmarks.

For a scripted check of the same runtime importer used by **F6 → Load motion**, supply `-Motion FILE.motion.json` and optionally `-MotionTime SECONDS`. The latter seeks and pauses for comparison. Add `-LogPath` when combining `-Motion` with `-AutoExit`, so the launcher can verify that import succeeded. `-PoseEvidence` writes a `.pose.json` alongside each screenshot with world-relative bone transforms and arm-clearance diagnostics.

`Tools/verify-activity-poses.py` reports measurements from those files. Supplying `--reference standing.pose.json` also reports foot displacement and pelvis descent. Measurements need to be read alongside the rendered character; bone height alone does not establish skin contact with the ground.
