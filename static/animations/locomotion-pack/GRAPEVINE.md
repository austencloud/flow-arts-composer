# Grapevine motion assets

`grapevine-left.glb` and `grapevine-right.glb` are four-step lateral loops:
side, cross behind, side, cross in front.

## Provenance

- Provider: Adobe Mixamo
- Source files: `left strafe walking.fbx` and `right strafe walking.fbx`, kept
  off this repository; `build-grapevine.py` reads them from the folder named
  by `ANIMATION_SOURCE_DIR`
- Source import date recorded by the repository: 2026-04-04
- Original Mixamo motion IDs: not preserved by that import
- Skeleton: Mixamo humanoid
- Source sampling: 30 frames per second
- Final constraint bake: 120 frames per second
- Source translation units: centimetres; glTF export converts them to metres
- Derived clips: modified and visually baked with Blender 5
- Commercial-use evidence: [Adobe's Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)
  states that Mixamo characters and animations may be used royalty-free in
  personal, commercial, and nonprofit projects, including video games.
- Attribution: this manifest retains provider and source identity even though
  the FAQ does not make attribution a runtime requirement.

The source hashes and measured output are recorded in
`grapevine.motion.json`. The GLBs are product assets, not a stand-alone motion
library for resale or redistribution.

## Rebuild

Run Blender from the repository worktree:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.0\blender.exe' `
  --background `
  --python 'static\animations\locomotion-pack\build-grapevine.py'
```

The script solves both legs against their authored foot paths, transfers the
pelvis toward the active support, and searches the two knee bend circles for a
pair that keeps the thigh and shin centre lines apart. Blender then visually
bakes the constrained result at 120 Hz. The higher rate matters: safe 30 Hz
poses can still interpolate through each other halfway between keys.

The build fails on missing front/back crossing, less than 12 cm of ankle
clearance, less than 4 cm of leg-centre clearance at any exported frame,
leg-length drift, implausible foot height, missing support transfer, or pelvis
sway outside the authored range. `grapevine.motion.json` records the measured
result and the checksum of each GLB so CI can prove that the manifest and
assets still match.

## Runtime contract

`LocomotionAnimator` owns clip selection, time, gait phase, contact curves, and
the authored pelvis transfer. It removes the clip's secular lateral travel but
keeps this family’s detrended support-side sway; ordinary strafe clips do not
receive that permission. It contact-retargets these clips without the
sidestep-only leg-order constraint because negative leg order is intentional
here. `FootPlanter` remains a late contact correction layer and must not
generate the crossover.
