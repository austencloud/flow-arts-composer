# Production performance capture

The capture bundle samples the existing Svelte/Three production performer and
mounted pose rigs at 30 fps. It exports all 16 deployed character rigs for the
`fire-poi`, `fire-hoop`, `juggler`, `led-flow`, and `ride` profiles. The four
performance profiles use one generated production LOOP snapshot per profile,
shared across all characters. Each JSON frame contains local bone transforms,
the performer world transform, and the final rendered prop transforms. `ride`
contains the live pedal transforms. Raw captures belong in
`unreal/FlowFest/Saved/PerformanceCaptures`, outside packaged game data.
Ride frames also record `boneRootParentWorld`, the world transform of the
non-bone parent above Hips. This includes Avatar3D's per-rig height scale;
`skinnedMeshLocal` alone does not include it. Reconstruct a Ride joint in the
vehicle frame as `inverse(vehicleWorld) * boneRootParentWorld * boneTRSChain`.

Run from a worktree at the exact committed source revision with dependencies
installed. Use d2 for the build and browser capture:

```powershell
pnpm exec vite build --config unreal/FlowFest/Tools/native-capture.vite.config.mjs
node unreal/FlowFest/Tools/native-capture-static-runner.mjs unreal/FlowFest/Saved/PerformanceCaptures
```

The runner serves only the built bundle and `static/` assets on an ephemeral
loopback port. It starts Playwright's isolated Chrome for capture, writes 80 JSON
clips plus `manifest.json`, and stops the server and browser when finished. The
bundle is written to `unreal/FlowFest/Intermediate/native-capture-static`.
Keep the complete raw directory and its generated sequences for later repair.
The production generator may produce a different LOOP on a fresh full run.

To recapture selected rigs from the same LOOP snapshots, preserve the existing
output directory (especially its four `x-bot_<profile>.json` files), rebuild
the bundle at the desired source revision, and set a comma-separated filter:

```powershell
$env:FLOW_FEST_CAPTURE_CHARACTERS = 'ch01,ch07,ch21,ch22,ch41,ch42'
node unreal/FlowFest/Tools/native-capture-static-runner.mjs unreal/FlowFest/Saved/PerformanceCaptures
Remove-Item Env:FLOW_FEST_CAPTURE_CHARACTERS
```

Focused capture replaces only the selected rigs' five files. It reads the
preserved x-bot sequence in each profile, injects those snapshots into both the
rendered scene and output JSON, and keeps the original 80-entry manifest. Check
that all 80 files still match the manifest and that each frame contains the
deployed GLB's full bone set before importing animations. GLB skins may omit
unweighted ancestors from `skeleton.bones`; the exporter traverses parent Bone
nodes to include them.

To repair only Ride samples while preserving all performance JSON and the
original manifest, set `FLOW_FEST_CAPTURE_RIDE_ONLY=1` before the runner. It
can be combined with `FLOW_FEST_CAPTURE_CHARACTERS` for selected rigs. Remove
both environment variables after capture.

To run this on d2, use `scripts/d2-run.ps1` for a committed full capture job or
reuse its scratch worktree for a focused repair so the preserved raw directory
remains available. Keep build and capture logs on d2, and transfer the finished
`Saved/PerformanceCaptures` directory back to the task worktree for native
conversion. Do not capture from the primary checkout's port 5173 server.
