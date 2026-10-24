# Production performance capture

The native capture bundle samples Flow Arts Composer's production Svelte/Three performer and mounted pose rigs at 30 fps. It uses an isolated Chrome and an ephemeral server rooted in the exact source worktree. Raw JSON belongs in `unreal/FlowFest/Saved/PerformanceCaptures-v3`, outside packaged game data. Keep each generated sequence snapshot with its clips: a new snapshot can produce a different 16-step LOOP. The older `Saved/PerformanceCaptures` family pilot is obsolete and must not replace finalized v3 captures.

The default pass records 80 legacy clips for 16 deployed characters: four flow profiles and one ride pose per rig. The family pass adds 41 prop families × A/B × 16 rigs, or 1,312 captures. Each family routine has 480 frames over 16 seconds. The planned native animation total also includes 176 locomotion clips, for 1,568 clips across all groups. The family pass and full native verification for this upgrade are still pending.

Build and capture from a worktree at the exact committed source revision, with dependencies installed. Use d2 for this long job:

```powershell
pnpm exec vite build --config unreal/FlowFest/Tools/native-capture.vite.config.mjs
node unreal/FlowFest/Tools/native-capture-static-runner.mjs unreal/FlowFest/Saved/PerformanceCaptures-v3
$env:FLOW_FEST_CAPTURE_FAMILY_MODE = '1'
node unreal/FlowFest/Tools/native-capture-static-runner.mjs unreal/FlowFest/Saved/PerformanceCaptures-v3
Remove-Item Env:FLOW_FEST_CAPTURE_FAMILY_MODE
```

The bundle is written to `unreal/FlowFest/Intermediate/native-capture-static`. The runner stops its server and browser after each pass. It writes `manifest.json` for legacy captures and updates `family-manifest.json` incrementally for family captures. Each family/variant also has a preserved `family-<family>-<A-or-B>.sequence.json` snapshot. The family runner reuses existing valid clips and snapshots on reruns, so an interrupted capture can resume in the same directory. Keep the complete raw directory for later repair.

To capture a bounded family subset, use comma-separated filters before the family-mode runner. For example:

```powershell
$env:FLOW_FEST_CAPTURE_FAMILY_MODE = '1'
$env:FLOW_FEST_CAPTURE_CHARACTERS = 'ch01,ch07'
$env:FLOW_FEST_CAPTURE_FAMILIES = 'poi,hoop'
$env:FLOW_FEST_CAPTURE_VARIANTS = 'A,B'
node unreal/FlowFest/Tools/native-capture-static-runner.mjs unreal/FlowFest/Saved/PerformanceCaptures-v3
Remove-Item Env:FLOW_FEST_CAPTURE_FAMILY_MODE,Env:FLOW_FEST_CAPTURE_CHARACTERS,Env:FLOW_FEST_CAPTURE_FAMILIES,Env:FLOW_FEST_CAPTURE_VARIANTS
```

Check family names against the source prop catalog before setting `FLOW_FEST_CAPTURE_FAMILIES`. A filtered pilot is useful for diagnosing a rig or converter but does not establish the full 1,312-routine gate. Do not combine family mode with `FLOW_FEST_CAPTURE_RIDE_ONLY`.

For a focused legacy recapture, preserve the existing output directory, especially its four `x-bot_<profile>.json` files. Set `FLOW_FEST_CAPTURE_CHARACTERS` to the desired rig IDs. The runner injects preserved LOOP snapshots into both the rendered scene and output JSON and keeps the original 80-entry legacy manifest. Set `FLOW_FEST_CAPTURE_RIDE_ONLY=1` to repair only ride samples; it may be combined with the character filter. Clear the environment variables after capture.

Each captured performance frame contains local bones, the performer world transform, rendered prop transforms, and left/right wrist positions. Revision `clock-isolated-body-v3` records `rotatedBodyWorld` separately from the prop holder: the source animates a child rotation group, so holder transforms alone cannot reproduce the mesh's spin. The runner suspends automatic rendering and prerolls the manual clock before sampling. Retain the revision and capture diagnostics when transferring files; older family captures are not valid input for this release.

Ride frames also contain `boneRootParentWorld`, the world transform of the non-bone parent above Hips. It carries Avatar3D's per-rig height scale, which `skinnedMeshLocal` does not. Reconstruct a ride joint in the vehicle frame as `inverse(vehicleWorld) * boneRootParentWorld * boneTRSChain`. Validate that frames contain the deployed GLB's full bone set; GLB skins may omit unweighted ancestors from `skeleton.bones`, so the exporter traverses parent Bone nodes.

`prepare-characters.mjs` converts captures to native animations. `prepare-prop-motion.mjs` reduces each family capture to a `flow-fest-prop-motion-v3` track. Each frame contains 28 numbers: two seven-number prop-root transforms, two three-number wrist anchors, and two four-number visual-body quaternions in native coordinates. The runtime uses wrist anchors to align animated roots with the live sampled hands, and applies the absolute body rotation to each mesh and its fire/LED attachments. Starting orientation is preserved. Every compact track records the SHA-256 of its raw source bytes, the capture revision, and frame count.

These tools support `--family-only --allow-partial --capture-id <rig-id>` for incremental conversion, with `--captures <raw-directory>` also required by `prepare-characters.mjs`. Without `--allow-partial`, family conversion requires all 82 family A/B roles. `validate-runtime-data.mjs` rejects missing roles, stale capture revisions, malformed transforms, and incomplete catalogs. The package gate requires all 1,312 family tracks plus 64 legacy tracks. Native automation separately samples imported bodies, wrist alignment, live mesh rotation, loop playback, and entry/switch/exit transitions.

For d2, use `scripts/d2-run.ps1` for a committed full capture or its scratch worktree for a focused repair, keeping the preserved raw directory available. Keep build and capture logs on d2, then transfer the finished `Saved/PerformanceCaptures-v3` directory to the native build worktree. Do not capture from the primary checkout's port 5173 server.

## Phrase stage capture

The `-PhraseStage` mode plays a different captured routine for every phrase of `static/data/flow-fest/phrase-stage-schedule.json`. Phrase mode captures each distinct (sequence, plane, prop, character) the schedule uses. It rebuilds the sequence from the library snapshot `static/data/flow-fest/phrase-library.json` with `rebuildPhraseSequence`, sets one step per beat at the schedule's tempo, and captures it in the phrase's plane through the same production performer as authored runtime motion. A staff performer holds `fire_double_staff`, per the spec's fire-props rule. Each result is a looping `.motion.json` runtime bundle, the format `FFlowArtsRuntimeMotion` loads without cooking, so phrase captures skip `prepare-characters.mjs` and `prepare-prop-motion.mjs`. Those converters remain the path for the 16-step profile and family LOOPs.

```powershell
pnpm exec vite build --config unreal/FlowFest/Tools/native-capture.vite.config.mjs
$env:FLOW_FEST_CAPTURE_PHRASE_SCHEDULE = 'static/data/flow-fest/phrase-stage-schedule.json'
$env:FLOW_FEST_CAPTURE_PHRASE_BEATS = '128'   # optional: only phrases starting before this beat
node unreal/FlowFest/Tools/native-capture-static-runner.mjs unreal/FlowFest/Saved/PhraseCaptures
Remove-Item Env:FLOW_FEST_CAPTURE_PHRASE_SCHEDULE, Env:FLOW_FEST_CAPTURE_PHRASE_BEATS
node unreal/FlowFest/Tools/import-phrase-motions.mjs unreal/FlowFest/Saved/PhraseCaptures [--suffix -g52]
```

Files are named `<character>_<prop>_<plane>_<first 12 hex of SHA-256 of the sequence id>.motion.json`. `phrase-manifest.json` lists every capture with its sequence id, plane, prop, character, frame count and capture time. Reruns reuse captures already listed for the same build. `FLOW_FEST_CAPTURE_PHRASE_LIBRARY` overrides the library path. Phrase mode cannot be combined with family or ride-only mode.

`import-phrase-motions.mjs` copies the bundles into `Content/FlowFest/PhraseStage/Motions` and merges `phrase-motions.json`, the index the stage looks motions up by. It also writes `Content/FlowFest/PhraseStage/runtime-rigs.json` for the rig check. That folder is add-only: an existing file with different bytes stops the import instead of being replaced. A recapture of routines already in the store imports with `--suffix -g52`, which names each file `<base>-g52.motion.json` (its sidecar `<base>-g52.body.json`); when two indexes name the same routine the stage keeps the `-g52` file. The 2026-10-23 full-grid recapture (performers keep the 0.52 m grid instead of shrinking it to the arm reach) is stored that way: 12 of the schedule's 54 routines passed the 2 mm palm-grip check and were imported; the other 42 still play their earlier captures (their failures are in `phrase-failures.json`). On the recaptured routines the hands reach 0.56 to 0.60 m from the rig root, against 0.29 to 0.32 m before.

In a linked worktree the capture bundle needs two things the primary checkout has: the gitignored character models (copy `static/models/avatars/_optimized` into the worktree; do not junction it, a worktree removal would delete through the link) and workspace packages built from their sources (the primary `packages/*/dist` can be older than the code importing it). A task-local wrapper config that adds the `development` resolve condition and moves `cacheDir` out of `node_modules` covers the second; build with `--configLoader native`.

## Body response sidecars

`-PhraseStage -BodyResponse` (off by default; `Tools/launch.ps1 -PhraseStage -BodyResponse`) reads the browser body response planner's track for each phrase motion from a sidecar beside it: `Motions/<base>.motion.json` has `Motions/<base>.body.json`. The stage logs once per performer whether it found a track. A track plays only while its phrase is planted (or resting); walks and turns keep the native footwork, and it fades in and out over half a beat at the phrase edges.

```json
{ "version": "flow-fest-body-response-v1", "stepCount": 16, "samplesPerStep": 48, "loop": true,
  "frame": "performer: +x left, +z audience, y up, metres",
  "offset": [[x, y, z, yaw], ...],
  "feet": { "left": [[x, z, lift, yaw], ...], "right": [[x, z, lift, yaw], ...] },
  "chestYaw": [radians, ...],
  "steps": [{ "foot": "left", "startStep": 2.1, "endStep": 2.45, "from": [x, z], "to": [x, z], "yawFrom": 0, "yawTo": 1.57, "liftM": 0.07 }] }
```

- Sample `i` is score step `i / samplesPerStep` of the sequence; there are `stepCount * samplesPerStep` samples, one more when `loop` is false. The stage samples at the phrase's score step wrapped to `stepCount`, linear between samples (yaw the short way), and a looping track blends its last sample into its first.
- `offset`: the hips' move (`y` below 0 is a duck) and the body yaw in radians about the vertical through the hips, 0 = the grid facing, the schedule's yaw sign. The stage adds it to the lower-body layer: the whole captured body moves by the offset and turns by the yaw about the hips (no waist twist). The staffs stay in the grid frame: two-bone IK then puts each hand back on its captured grip, with the captured elbow as the pole, so the body moves under a pattern that holds still. Off (no `-BodyResponse`, or no planted track) the layer is unchanged.
- `chestYaw` (optional, one number a sample): the twist the chest keeps against the body yaw, radians, applied half at `Spine1` and half at `Spine2` on top of the body yaw. Absent means 0.
- `feet`: each foot's planted offset from the native footprint (`x`, `z`), its lift above the ground while swinging, and the body yaw it was planted at. The native footprint turns by that yaw about the hips' ground point, then shifts by the offset.
- `steps`: each step's foot, its span in score steps and its lift. The stage reads it for the toe pitch while a foot swings; the rest is for reports.
- Frame: the performer faces +z. On the stage, +x runs along `LeftOf(yaw)` and +z along `(cos yaw, sin yaw)` of the performer's schedule facing, metres to centimetres through `FRig::World`.

`pnpm exec tsx unreal/FlowFest/Tools/export-body-response.ts [--force] [--dry-run]` writes a sidecar for every entry of the motion index once the planner (`src/lib/shared/3d/collision/body-response.ts`) exists. It runs the planner under Vitest with the project's config, since the planner and the character state are Svelte rune modules. The Motions folder is add-only: an existing sidecar with different bytes is kept unless `--force` is given. `node unreal/FlowFest/Tools/fixtures/body-response-fixture.mjs` writes a synthetic proof track: a 0.2 m sway, three step pairs, a 90 degree turn with a 0.3 rad chest twist back, and a 0.15 m duck. `--file Motions/<base>.motion.json` targets a given motion, such as its `-g52` recapture.

`-FlowFestPhraseStageHandLog=<file.csv>` writes each performer's root, hand and staff-root world positions every frame and fixes the step at 30 Hz, so two runs from the same `-FlowFestPhraseStageStartBeat` log the same beats. Measured 2026-10-23 with the fixture track (0.2 m sway, 90 degree turn), against the same beats with the switch off: the right staff stayed within 0.05 cm and the left within 2.1 cm at the 95th percentile, 4.1 cm at worst, where the 0.2 m sway leaves the captured grip just beyond the left arm's reach.
