# True sidestep clips

`sidestep-right.glb` and `sidestep-left.glb` are one-cycle sidestep loops: the
trailing foot closes to the leading one, then the leading foot steps out. The
body stays square to the front and the feet never pass each other. The pack's
`strafe-left/right.glb` walk on a diagonal and cross the feet; these clips
were built to replace them and are not wired into a loader yet (see the
locomotion canon, current contract item 13).

## Provenance

- Provider: Adobe Mixamo, through the Mixamo archive the turn clips already
  use (`turns/import-mixamo-turnarounds.py`):
  `huggingface.co/datasets/Linzhan/Mixamo-Animations-Characters`,
  `animation_motion/Side_Step.fbx`
- Mixamo clip name: "Side Step". Mixamo motion ID: not carried by the archive.
- Downloaded: 2026-11-22, a plain download into
  `E:/tka-studio/walk-sources/Side_Step/` (outside the repository; the raw
  FBX is not committed)
- Source SHA-256:
  `a950e8c4efa5ab2801e533849e06040c751491fd71d35aafbc34ce6e6c479d6f`
- Skeleton: Mixamo humanoid (`mixamorig` prefix); 30 frames per second;
  centimetres in the FBX, metres after glTF export
- Frames used: all 45 (source frames 1-45). The last frame repeats the first
  pose 0.81 m further on, so the clip loops as one sidestep cycle.
- Root motion: the Hips keep their authored travel, as `convert.py` leaves
  the pack's other Mixamo clips; the animator reads native speed from it
  (about 0.55 m/s).
- Commercial use: [Adobe's Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)
  allows royalty-free use of Mixamo animations in personal, commercial and
  nonprofit projects. The GLBs are product assets, not a motion library for
  redistribution.
- Performer identity or biometric constraints: none stated by the source.

## What was changed

- The source travels to the character's right; `sidestep-right.glb` is that
  direction. `sidestep-left.glb` is the same motion mirrored through the
  character's sagittal plane: each bone takes its partner's motion relative
  to the rest pose, reflected left for right.
- The closing foot only rose 3 cm in the source, so it skimmed the floor and
  measured as a stance sliding 0.8 m. Each foot that moves faster than
  0.15 m/s across the floor is lifted by a softened sine (power 0.6) of the
  distance it has covered, enough for the swing to peak 10 cm above the
  foot's planted height (6.9 cm added to the closing foot, 0.8 cm to the
  stepping foot). Hip and knee are re-solved as a two-bone chain in the
  original knee plane; the foot keeps its authored orientation.

## Known defects

- A wide (0.9 m), crouched athletic shuffle with a 12 cm pelvis dip. Played
  much faster than its 0.55 m/s it slides: at 1.0 m/s on x-bot, ch01, ch12
  and ch44 the peak stance slip is 0.21 to 0.27 m.

## Rebuild

From the repository worktree:

```powershell
$blender = 'C:\Program Files\Blender Foundation\Blender 5.0\blender.exe'
$src = 'E:\tka-studio\walk-sources\Side_Step\Side_Step.fbx'
$build = 'static\animations\locomotion-pack\build-mixamo-archive-clip.py'
& $blender --background --factory-startup --python $build -- --src $src `
  --out static\animations\locomotion-pack\sidestep-right.glb `
  --action sidestep-right --swing-clearance 0.10
& $blender --background --factory-startup --python $build -- --src $src `
  --out static\animations\locomotion-pack\sidestep-left.glb `
  --action sidestep-left --mirror --swing-clearance 0.10
```

The asset contract is `tests/unit/3d/sidestep-clip-asset.test.ts`.
