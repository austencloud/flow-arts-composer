# One MPFB character in TKA

Status: local evaluation complete; not promoted to the production roster.

## Reference quality pass, 2026-09-14

The current reference is `intake-mpfb-962266499`. Its earlier thumb-roll
correction is present: the distal thumb-to-index-joint distance is 15.76 mm
on both hands, against a 109.55 mm palm length. The runtime grip check passes.
This measures bones, not finger-surface contact; the close views and sampled
staff-loop frames show a usable grip, with further finger-fit work still open.

The outfit's source material declares `female_casualsuit01_ao.png`, but MPFB's
GAMEENGINE wrapper omitted it. The generator now connects authored outfit AO
to Blender's glTF occlusion output. It preserves the diffuse, normal and alpha
channels and exports non-default AO strength. It does not bake shadows into
the base color or change skin and hair materials.

The comparison candidate is `intake-mpfb-962266499-quality`, at
`/test/character-playground?character=intake-mpfb-962266499-quality`.
It restores AO on the archived reference export; it does not regenerate the
person from a seed. All 22,589 vertex positions across nine meshes and all
62 node transforms match the original optimized candidate exactly. The
delivered GLB is 3,282,724 bytes, SHA256
`bd4377588ff11c0406c8f850c3810406f0719ad616db438302c5ae4cc95854c7`.
The original candidate remains available.

`scripts/characters/verify-mpfb-materials.mjs` checks this casual-suit fixture.
The original fails for missing AO; the corrected raw export, optimized export,
and a fresh Blender generation pass. A controlled Blender export with AO
strength 0.35 retains that value within 1e-6. The corrected candidate also
passes `verify-mpfb-grip.mjs` with the original distances.

Direct inspection used the production character playground, Forest environment,
1600x900 CSS viewport (1920x1080 capture), default staff loop, and hidden plane
guides. The guide overlay was disabled through existing controls for inspection;
the scene defaults were not changed. Before/after camera and paused pose were
held constant. The shading improvement is modest. Evidence is under
`E:/3D-Models/mpfb-proof-20260908/playground/quality-pass-20260914/`, including
`reference-before.webp`, `reference-after.webp`, and `motion-front.webp`.

This pass supports continuing with one reference character. Skin detail,
eye appearance, hair quality, facial animation and exhaustive collision testing
remain unproven. The original September 8 trial below is historical evidence.

MPFB can produce a clothed, skinned character that loads into TKA and performs
the existing staff loop. This trial required two export corrections: bake the
body's modelling shape keys, and align finger bone rolls to TKA's positive-X
flexion convention. Matching Mixamo bone names alone was insufficient.

MetaPerson remains the stronger visual benchmark. The MPFB character has a
coherent face, body, clothes and hair, with fingers curling around the staffs.
Its default skin and clothing look plain, thumbs remain extended in the common
grip preset, and the face has no expression animation. This proves a practical
source pipeline, not a finished avatar collection or production acceptance.

## Reproduce

Generator: `scripts/characters/mpfb-proof.py`.
Rights record: `scripts/characters/mpfb-proof.provenance.json`.

Prerequisites used:

- Blender 5.0.1.
- MPFB 2.0.17 source at commit
  `437dd513888a92399d1d3200d2e80859fae55abc` from the official
  [repository](https://github.com/makehumancommunity/mpfb2/tree/437dd513888a92399d1d3200d2e80859fae55abc).
  Downloaded archive SHA256:
  `4d185bbe44b0e26657666d29c85059fce8d2cbed0e1556ff23d66a6ef9832f57`.
- Official [MakeHuman system assets](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html),
  `makehuman_system_assets_cc0.zip`, SHA256:
  `b542127a8e25547c7c29c19f2d1d2adb9a664c80396ecd694095dbc8028a0107`.
  All selected character assets are CC0; MPFB program code has a separate GPL license.

The source checkout, extracted assets, isolated Blender resources and generated
artifacts are under `E:/3D-Models/mpfb-proof-20260908/`. No extension was installed
into Austen's existing Blender preferences. No Mixamo upload or paid generation
was involved.

From the repository, with `$mpfbSource`, `$mpfbAssets`, and `$mpfbOutput` pointing
to the source checkout, extracted system pack and persistent output directory:

```powershell
$env:BLENDER_USER_RESOURCES = 'E:/3D-Models/mpfb-proof-20260908/blender-user'
& 'C:/Program Files/Blender Foundation/Blender 5.0/blender.exe' --background --factory-startup --python-exit-code 1 --python scripts/characters/mpfb-proof.py -- --source $mpfbSource --assets $mpfbAssets --output $mpfbOutput
node --import tsx scripts/characters/character-intake.mjs --source "$mpfbOutput/mpfb-proof.glb" --provenance scripts/characters/mpfb-proof.provenance.json --output E:/3D-Models/mpfb-proof-20260908/intake --stage-bakeoff --texture-size 2048
```

Intake requires `--replace` to repeat an existing character output. The generator
writes the named source and GLB in its chosen output directory. Keep that directory
task-owned. Source `.blend` retains editable modelling keys and packed textures;
only its export copy has the modelling keys and helper geometry baked away.

## Delivered asset

- Named local candidate: `intake-mpfb-proof`, displayed as **MPFB Proof**.
- Bake-off: `/test/avatar-bakeoff?candidate=intake-mpfb-proof&pose=neutral&lighting=studio`.
- Staff lab: `/test/staff-grip?character=intake-current&view=quad&play=0`;
  current intake is a mutable slot, so verify its file hash before future reviews.
- Source: `E:/3D-Models/mpfb-proof-20260908/generated/mpfb-proof-source.blend`.
- Optimized GLB: `E:/3D-Models/mpfb-proof-20260908/intake/mpfb-proof/optimized/mpfb-proof.glb`.
- SHA256: `c7976bcea52135dbc84e21e3c03198f6a486ee71e0d5a683331d8d8e450d4c24`.
- 2,844,484 bytes; 38,932 triangles; 9 skinned meshes; 52 bones;
  22/22 required body bones and 30/30 finger bones. Static intake errors: none.
- 2K texture ceiling, 2 normal maps, no roughness texture maps. Hair, eyebrows
  and eyelashes use transparency; the six solid materials are opaque after intake.
- The previous current-intake GLB was preserved as
  `E:/3D-Models/mpfb-proof-20260908/previous-intake-current.glb`.

## Visual and motion evidence

Direct browser inspection used the existing bake-off and staff lab at 1280×720,
studio lighting, the default frontal camera plus orbit/zoom and the staff lab's
four cameras. A task-owned server on port 5199 was necessary because 5173 stalled
on asset requests. Port 5173 was not restarted or modified.

All five poses loaded coherently after the corrections. Screenshots and the
complete displayed metrics are in `E:/3D-Models/mpfb-proof-20260908/evidence/`.
Close inspection confirmed the four fingers changed from curling away from the
shaft to curling around it. No separated bodyparts or clothing were visible.

The displayed palm **target error** is distance from the requested pose, not
the distance from the hand to the displayed staff. Staffs follow achieved grips.
Large extreme-pose errors also reproduce on MetaPerson:

| Pose       | MPFB left/right, m | MetaPerson left/right, m |
| ---------- | ------------------ | ------------------------ |
| Neutral    | 0.097 / 0.097      | 0.070 / 0.070            |
| Overhead   | 0.112 / 0.112      | 0.085 / 0.080            |
| Cross-body | 0.460 / 0.460      | 0.432 / 0.432            |
| Depth      | 0.073 / 0.144      | 0.116 / 0.088            |
| Low        | 0.529 / 0.527      | 0.521 / 0.521            |

The staff lab ran the existing **A / Split-Same** fixture through repeated loops.
Multiple observed phases retained coherent skinning and contact; displayed
shaft/contact telemetry was 0.0–0.1° and 0.0 mm, with zero collisions at the
sampled moments. Those values measure the prop attachment, not finger-surface
contact, and are not an exhaustive collision sweep. No walking, facial animation,
or full sequence-catalog certification is claimed.

The cross-body and low targets still exceed what the current poser achieves;
this trial does not fix that shared limitation. Keep MPFB as one evaluation
candidate and MetaPerson as the visual reference before expanding the roster.
