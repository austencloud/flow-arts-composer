# Gait clips

`gait-clips.json` is what the `GaitAnimator`
(`src/lib/shared/3d/locomotion/gait/`) plays: one cycle each of a walk, a run,
a crouched walk and a crouched run, a standing and a crouched idle, two jumps, a fall, two
landings, a slide, two rolls and four turns. `gait-gestures.json` holds the gestures, and
loads the first time one is asked for.

## Provenance

- Provider: Adobe Mixamo, through the Mixamo archive the turn and sidestep
  clips already use: `huggingface.co/datasets/Linzhan/Mixamo-Animations-Characters`,
  `animation_motion/`. Mixamo motion IDs: not carried by the archive.
- Downloaded: 2026-11-22 to 2026-11-24, plain downloads into
  `E:/tka-studio/walk-sources/` (outside the repository; the raw FBX is not
  committed).

| Clip       | Archive file                     | Frames used                | SHA-256                                                            |
| ---------- | -------------------------------- | -------------------------- | ------------------------------------------------------------------ |
| walk       | `Standard_Walk.fbx`              | one cycle, 1.15 s, 1.73 m  | `d9daf2b6e6faff6c455e222181b79e63455068f0127a10f90ee90d2bea9b04c6` |
| run        | `Slow_Run.fbx`                   | one cycle, 0.733 s, 2.20 m | `7a93050ae3c581c03826b94ec7e50606264f905faee9a38911e10951063bbb3f` |
| crouchWalk | `Crouch_Torch_Walk_Forward.fbx`  | one cycle, 1.10 s, 1.65 m  | `25914e0b7379334d55f75872910391acc7cbe2ea4448373d0acf51b82b2ae779` |
| crouchRun  | `Crouched_Run.fbx`               | one cycle, 0.75 s, 1.95 m  | `abf47453b7ef3d78f81dd31f677858b85923712219f155e670193a99745d32ba` |
| (arms)     | `Sneaking_Forward.fbx`           | one cycle, 1.65 s, arms    | `4847ede6ab6ae1f07b7237fdd9cd82a28901d86e567e0f619ce07ec841e22d65` |
| stand      | `Breathing_Idle.fbx`             | all of it, 9.93 s, at 0.2  | `7b3a548b065736c0901041e19c70c64ae03b09583471620454e847fbe3f5696c` |
| crouch     | `Crouch_Torch_Idle_01.fbx`       | all of it, 6.83 s, looped  | `a294ee16b57c23e1e13e38247aaad15dd897cf5ad8acb12b6df83b21e9fb2df9` |
| jump       | `Unarmed_Jump.fbx`               | 0.4 to 2.3 s               | `e59147a9af2a1496ac6cfc0ba913447432e7d119782dad9b61a02f08d37c8b20` |
| leap       | `Unarmed_Jump_Running.fbx`       | 0.2 to 1.4 s               | `bab8be91291378ed05a5c3bb0ad0f82cf4cc57d013d9c08cb007c95b5dbf7145` |
| fall       | `Fall_A_Loop.fbx`                | all of it, looped          | `7af44510121d39413e2ccaed14366f43131671887bc9ef3a3c8c29174a6f1127` |
| landRun    | `Fall_A_Land_To_Run_Forward.fbx` | all of it, 0.93 s          | `24803f22163ddcee355a83e03cb8396e3f3741555b19316293c022509af2c7f6` |
| landHard   | `Hard_Landing.fbx`               | 0.03 to 2.0 s              | `a2fadc3e77c9b7308177fd7f024afceddab1700de88628b023dd5a95f42c7314` |
| slide      | `Running_Slide.fbx`              | all of it, 1.53 s          | `98df4ae580cfc65e0e21a4a070247658d6b8ac578ffa7248c8f943275a2f51e0` |
| roll       | `Sprinting_Forward_Roll.fbx`     | all of it, 1.17 s          | `d154d7b25ffa439d0ebdb38df412e865bf7840ade8d8aafcae57018e5b6714ba` |
| rollStand  | `Stand_To_Roll.fbx`              | 0.2 to 2.37 s              | `7da39bc246f96855a348cc780d94c78b9ddea76b978ae8ef79c7ca98cd982188` |
| turnStand  | `Right_Turn_10.fbx`              | all of it, 1 s             | `ca15217a2156aa656313e6568166a1fe17e0d5f7b4729aec99259596edd574dc` |
| turnWalk   | `Walking_Turn_180.fbx`           | all of it, 1 s             | `839a8bec689ac0c95628267811836e110eedcea16ed8905fcd5142cad8516535` |
| turnRun    | `Running_Turn_180.fbx`           | all of it, 0.67 s          | `ffe541f851c64f6811cf0da75497b0ec3ce3cf4e2c0ec652da614b8289ea47ec` |
| turnCrouch | `Crouch_Torch_Turn_Left_90.fbx`  | 0.1 to 1.2 s               | `645b041fd3968bc2fd45aabbf198c0aab0e57f0f4c2bd0d780d98bc90a2f9dfe` |
| wave       | `Waving_3.fbx`                   | all of it, looped          | `4824aed57dbd38bd42553e69140cb91cc22f9775e8d136bf9d9df80f989f1e72` |
| point      | `Pointing_3.fbx`                 | 0.2 to 2.6 s               | `71613d2f5a7db1fe741648a9903b74d7ec3ffcde45457e72ae68a1fcf8cda5ea` |
| clap       | `Clapping.fbx`                   | all of it, looped          | `c208f7b01efe34c458a068c4b9c84ad418e1c4d05f9c33af92cddfc58527b78b` |
| bow        | `Quick_Informal_Bow.fbx`         | 0 to 2.1 s                 | `1bfe7a6fff3b26c1583bb1f36a8873f7aeec2472b14b2415c05de94092688a1a` |
| cheer      | `Cheering.fbx`                   | all of it, looped          | `2a7ab932cfac197d0970548f1c209e4237a240c0e955b64f30e5bf0127ecc7f3` |

The standing idle plays at a fifth of its size: each frame is blended 0.2 of the
way from the clip's own calmest frame (`calm` in the baker), so it breathes and
sways without the full recording's 20 cm swing of the hips.

- Commercial use and modification: [Adobe's Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)
  allows royalty-free use of Mixamo animations in personal, commercial and
  nonprofit projects. No attribution is required.
- Redistribution: these are product assets, not a motion library to hand on.
  Whether publishing converted Mixamo clips in a public repository raises a
  separate question is open with Austen's lawyer list; nothing here settles it.
- Performer identity or biometric constraints: none stated by the source.

## What was changed

Nothing is retargeted in the files. `scripts/gait/bake-gait-clips.mjs` does the
following, and no frame is drawn by hand.

- Steps: one seamless cycle cut out of the clip and resampled evenly, the left
  foot's touchdown at phase 0 and the right foot's at 0.5, the travel turned
  onto +Z and the steady part of it taken out.
- Moves: the stretch in the table, the travel kept beside it as a distance, and
  for the jumps the height above the take-off taken out, because the body's own
  fall gives it.
- Turns: which way the hips face and where they get to are kept beside the pose
  as the body's own way, so the body follows the recording. One side is
  recorded; the other is its mirror.
- Crouched: the idle, the walk and the turn are one performer's, who carries a
  torch in the left hand, so the turn starts and ends in the idle's own stance.
  The idle is turned to face straight ahead. The arms under all of them are the
  sneak's, the upper arms hanging as they do there rather than leaning with the
  trunk: the walk's blended 0.3 toward the upright walk's and the run's 0.4
  toward the upright run's, at the same place in the stride. The idle and the
  turn have the middle of the sneak's whole cycle, blended 0.3 toward the
  standing idle's and half way to the turn's own free right arm and its mirror.
  The sneak's arms lead with one side, so they are first blended half way to
  their own mirror half a cycle on. Upright arms alone hang down into the
  raised thighs.
- The rolls go up to 8 cm higher while they are on the floor, because the clips
  put the head and the shoulder through it on a body this size.
- All: when each foot holds the floor is recorded, and rotations are 16-bit
  integers beside the source skeleton's rest pose, so one file serves every
  body.

## Rebuild

From the repository root, with the folders that hold the FBX files:

```powershell
node scripts/gait/bake-gait-clips.mjs <folder with FBX sources> <another>
```

Each file's `sources` list carries each FBX's checksum, so a rebuild from other
sources shows.
