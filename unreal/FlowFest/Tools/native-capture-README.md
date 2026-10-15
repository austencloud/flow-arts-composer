# Production performance capture

The native capture bundle samples Flow Arts Composer's production Svelte/Three performer and mounted pose rigs at 30 fps. It uses an isolated Chrome and an ephemeral server rooted in the exact source worktree. Raw JSON belongs in `unreal/FlowFest/Saved/PerformanceCaptures`, outside packaged game data. Keep each generated sequence snapshot with its clips: a new snapshot can produce a different 16-step LOOP.

The default pass records 80 legacy clips for 16 deployed characters: four flow profiles and one ride pose per rig. The family pass adds 41 prop families × A/B × 16 rigs, or 1,312 captures. Each family routine has 480 frames over 16 seconds. The planned native animation total also includes 176 locomotion clips, for 1,568 clips across all groups. The family pass and full native verification for this upgrade are still pending.

Build and capture from a worktree at the exact committed source revision, with dependencies installed. Use d2 for this long job:

```powershell
pnpm exec vite build --config unreal/FlowFest/Tools/native-capture.vite.config.mjs
node unreal/FlowFest/Tools/native-capture-static-runner.mjs unreal/FlowFest/Saved/PerformanceCaptures
$env:FLOW_FEST_CAPTURE_FAMILY_MODE = '1'
node unreal/FlowFest/Tools/native-capture-static-runner.mjs unreal/FlowFest/Saved/PerformanceCaptures
Remove-Item Env:FLOW_FEST_CAPTURE_FAMILY_MODE
```

The bundle is written to `unreal/FlowFest/Intermediate/native-capture-static`. The runner stops its server and browser after each pass. It writes `manifest.json` for legacy captures and updates `family-manifest.json` incrementally for family captures. Each family/variant also has a preserved `family-<family>-<A-or-B>.sequence.json` snapshot. The family runner reuses existing valid clips and snapshots on reruns, so an interrupted capture can resume in the same directory. Keep the complete raw directory for later repair.

To capture a bounded family subset, use comma-separated filters before the family-mode runner. For example:

```powershell
$env:FLOW_FEST_CAPTURE_FAMILY_MODE = '1'
$env:FLOW_FEST_CAPTURE_CHARACTERS = 'ch01,ch07'
$env:FLOW_FEST_CAPTURE_FAMILIES = 'poi,hoop'
$env:FLOW_FEST_CAPTURE_VARIANTS = 'A,B'
node unreal/FlowFest/Tools/native-capture-static-runner.mjs unreal/FlowFest/Saved/PerformanceCaptures
Remove-Item Env:FLOW_FEST_CAPTURE_FAMILY_MODE,Env:FLOW_FEST_CAPTURE_CHARACTERS,Env:FLOW_FEST_CAPTURE_FAMILIES,Env:FLOW_FEST_CAPTURE_VARIANTS
```

Check family names against the source prop catalog before setting `FLOW_FEST_CAPTURE_FAMILIES`. A filtered pilot is useful for diagnosing a rig or converter but does not establish the full 1,312-routine gate. Do not combine family mode with `FLOW_FEST_CAPTURE_RIDE_ONLY`.

For a focused legacy recapture, preserve the existing output directory, especially its four `x-bot_<profile>.json` files. Set `FLOW_FEST_CAPTURE_CHARACTERS` to the desired rig IDs. The runner injects preserved LOOP snapshots into both the rendered scene and output JSON and keeps the original 80-entry legacy manifest. Set `FLOW_FEST_CAPTURE_RIDE_ONLY=1` to repair only ride samples; it may be combined with the character filter. Clear the environment variables after capture.

Each captured performance frame contains local bones, the performer world transform, rendered prop transforms, and left/right wrist positions. Ride frames also contain `boneRootParentWorld`, the world transform of the non-bone parent above Hips. It carries Avatar3D's per-rig height scale, which `skinnedMeshLocal` does not. Reconstruct a ride joint in the vehicle frame as `inverse(vehicleWorld) * boneRootParentWorld * boneTRSChain`. Validate that frames contain the deployed GLB's full bone set; GLB skins may omit unweighted ancestors from `skeleton.bones`, so the exporter traverses parent Bone nodes.

`prepare-characters.mjs` converts captures to native animations. `prepare-prop-motion.mjs` reduces each family capture to a `flow-fest-prop-motion-v2` track. Each frame contains 20 numbers: two seven-number prop-root transforms and two three-number captured wrist anchors, converted into native coordinates. The runtime uses these anchors to align each animated prop root with the live sampled hand. These tools support `--family-only --allow-partial --capture-id <rig-id>` for incremental conversion, with `--captures <raw-directory>` also required by `prepare-characters.mjs`. Without `--allow-partial`, family conversion requires all 82 family A/B roles. The package gate requires the complete set.

For d2, use `scripts/d2-run.ps1` for a committed full capture or its scratch worktree for a focused repair, keeping the preserved raw directory available. Keep build and capture logs on d2, then transfer the finished `Saved/PerformanceCaptures` directory to the native build worktree. Do not capture from the primary checkout's port 5173 server.
