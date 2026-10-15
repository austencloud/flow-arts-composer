# Avatar source bake-off

**Date:** 2026-08-28, updated 2026-08-29
**Status:** One personal MetaPerson export passed visual and rig evaluation. It is
not licensed for production use.

## Decision

Do not spend more time tuning the current avatar optimizer. The 61.5 MB source
model and its 2.4 MB production version look the same at the TKA camera. The
weak face, clothing, and shoulder construction are in the source model.

Do not build a SAM 3D Body or Meshy photo-to-avatar pipeline yet. Those tools
solve useful parts of the problem, but neither is a finished path from an
arbitrary clothed photo to a TKA-ready avatar.

The first fresh MetaPerson photo export passed the important technical checks.
Its 73-joint skin includes every TKA body bone, both arm and leg chains, and all
30 finger bones. The neutral, overhead, crossed, depth, and low stress poses did
not tear the jacket, detach a sleeve, collapse an elbow, or explode the mesh.

This file is an evaluation asset. Commercial use was not selected when it was
exported, so it must not enter the public avatar roster or asset CDN. A licensed
export is still required before production integration.

The local development catalog does expose it as **Austen** in the real
performer avatar picker. That exercises the complete preview, swap, animation,
and saved-performer path without weakening the publication boundary: production
catalog creation excludes entries marked `local-evaluation`.

Ready Player Me is not a candidate. Its services ended on January 31, 2026.

## What the test exercised

The test route is `/test/avatar-bakeoff`. It loads each evaluation model through
`createAvatarServices()` and `AvatarSkeletonBuilder`, then runs the production
arm IK and finger animator against five fixed targets:

- neutral lateral reach
- overhead reach
- crossed reach
- split-depth reach
- low reach

Every shot uses the same camera, lights, target positions, 1.8 meter height,
and two seconds of fixed-step IK settling. The right rail reports canonical
body-bone mapping, arm and leg chains, full finger mapping, source height, file
size, and achieved hand error.

Downloaded models remain evaluation-only ignored files under
`static/models/avatars/bakeoff/`. The local app may load the personal export
from there, but no third-party model is added to a production build, asset CDN,
or Git history by this work.

## Candidate scorecard

| Candidate                        | Visual result                                              | TKA deformation                                                          | Rig result                                                          |                         Payload | Availability            | Verdict                                             |
| -------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------: | ----------------------- | --------------------------------------------------- |
| Current ch01, raw                | Weak face and flat clothing                                | Shoulder gaps and poor overhead silhouette                               | 22/22 body bones; arms and legs pass; finger map fails              |                         61.5 MB | Already owned           | Reject as the future source                         |
| Current ch01, optimized          | No meaningful visual loss from raw at the test camera      | Same deformation as raw                                                  | Same rig result as raw                                              |                          2.4 MB | In production           | Keep only until replaced                            |
| Avatar SDK MetaPerson sample     | Best viable face and clothing detail in this set           | Cleanest viable overhead result; sleeves stay attached                   | 21/22 body bones; arms, legs, and all fingers pass                  | 14.4 MB before TKA optimization | Current product         | Advance to three-avatar export trial                |
| Personal MetaPerson photo export | Strong face, hair, leather, and clothing detail            | All five stress poses stay connected                                     | 73-joint rig; 22/22 source body bones; arms, legs, and fingers pass |                         12.2 MB | Evaluation license only | Pass locally; do not ship without commercial rights |
| Avaturn Mixamo sample            | Cannot grade textures because the public FBX contains none | Body weights run, but the texture-free sample is not a visual comparison | 21/22 body bones; arms, legs, and all fingers pass                  |                          0.7 MB | Current product         | Keep as a rig fallback candidate                    |
| Ready Player Me archived sample  | Better than the current source                             | Arms, legs, and fingers run                                              | 21/22 body bones; arms, legs, and all fingers pass                  |                          3.8 MB | Discontinued            | Disqualified                                        |

The original 21/22 external-rig result exposed a mapper defect, not a proven
missing chest bone. `Spine1` is also a common zero-based alias for `Spine`, and
`Spine2` is also a common alias for `Spine1`. The mapper checked those aliases
before exact canonical names, which shifted a correctly named three-level spine
down by one slot. It now preserves exact TKA bone names before trying vendor
aliases. The personal export contains and maps all three spine levels.

## Personal export provenance

- Source: MetaPerson Creator photo export, LOD1 GLB, 1K textures
- Export date: 2026-08-29
- Original archive: `D:/Downloads/avatar.zip`
- Model SHA-256: `C76CC4897B324A30D2128AE9D4EA1B2B8E97C6A07BE154C029ACD6E3C44A5CF4`
- Geometry: 12 skinned meshes, 37,482 uploaded vertices, 157,626 render
  vertices
- Rig: one 73-joint skin with canonical body, limb, toe, and 30 finger bones
- Materials: embedded 1K and 512 JPEG PBR textures, including normal and
  metallic-roughness maps
- Animation clips: none; TKA supplies animation through the shared skeleton
- License boundary: evaluation only because Commercial use was not selected
  during export

The existing skinning-safe avatar optimizer was also tested. Re-encoding the
already compressed JPEG textures to WebP increased this model from 12.15 MB to
12.25 MB, so the raw GLB remains the better evaluation file. Geometry
compression was not applied because the canonical avatar loader does not
configure a Draco or Meshopt decoder, and changing that delivery contract needs
a separate production asset pass.

## What the Meta release actually gives us

[SAM 3D Body](https://ai.meta.com/blog/sam-3d/) is real. Meta released it on
November 19, 2025. It estimates a person's pose and body shape from one image,
including unusual poses and partial occlusion. Its output uses the open
[Momentum Human Rig](https://github.com/facebookresearch/MHR), which includes a
parametric skeleton, a skinned body mesh, pose correctives, facial blendshapes,
and seven LODs.

That is not the same as reconstructing the photographed clothes, hair, and
surface appearance as a finished avatar. The public path is a gated 2.11 GB
research checkpoint plus Python inference and MHR assets. It produces body
parameters and mesh data, not a customer-ready GLB creator flow. Meta also
calls out remaining hand-pose limitations. Turning it into the requested
experience would require us to own inference hosting, MHR-to-TKA export,
texture and identity generation, hair, clothing, neutral-pose conversion,
quality checks, and failure recovery.

SAM 3D Body is a useful future body-matching input. It is not the fastest route
to better avatars.

## What the existing commercial tools cover

### MetaPerson

[MetaPerson's JavaScript API](https://docs.metaperson.avatarsdk.com/js_api/)
already accepts a JPEG or PNG image, creates a customizable avatar, and exports
GLB, glTF, or FBX. Exports expose LOD and texture profiles from 1K through 4K,
including WebP. The hosted creator supplies body controls, outfits, hair, and a
customer-facing UI. Its separate REST API is Enterprise-only.

This is the closest existing product to the requested end state. The important
caveat is that it builds a recognizable avatar from a photo and selected
assets. It does not reproduce arbitrary photographed clothing.

### Avaturn

[Avaturn documents GLB export and a Mixamo-tested humanoid
rig](https://docs.avaturn.me/docs/importing/mixamo/). The public rig sample
mapped well in TKA, but it contained no textures. A real creator export is
required before its appearance can be scored.

### Meshy

[Meshy's current rigging documentation](https://docs.meshy.ai/en/webapp/guides/3d-model/rigging)
says its auto-rigger supports humanoids and exports rigged FBX. It also says the
input should have clean topology, standard human proportions, and a pose close
to T or A. Meshy can generate candidates for a curated roster. It does not make
an arbitrary full-body photo in any pose a reliable rigged-character input.

### Character Creator 5 and Headshot 3

[Reallusion Headshot 3](https://www.reallusion.com/character-creator/headshot/)
generates a detailed head from a photo, matches a base body, and feeds the
stable Character Creator rig. It is a Windows desktop production tool, not an
end-user upload flow. The current CC5 and Headshot bundle is listed at $329.
This is the strongest fallback for a small curated set of hero avatars if the
hosted creators do not meet the visual bar.

## Next experiment and stop conditions

Do not spend another export until the commercial-use terms for a generated GLB
fit TKA's budget and storage model. If they do, create two additional licensed
avatars from distinct real photos, including one difficult face and one loose
outfit. Export LOD1 GLB with 1K textures and the standard bind pose, then run
this same route. The personal evaluation export remains the first test in that
three-avatar set.

Advance to a production creator only if all three exports meet these checks:

- both arm and leg chains map without per-avatar code
- all fingers map, or a documented no-finger product choice is made
- overhead and crossed poses show no shoulder holes, garment separation, or
  collapsed elbows
- optimized payload is at most 8 MB without a visible loss at the TKA camera
- the license and commercial plan permit generated avatars to be stored and
  served by TKA

If the three-avatar test fails, stop the hosted-creator track. Buy Character
Creator 5 plus Headshot 3, make a small curated roster, and compare those
exports before considering any custom photo reconstruction work.

## Reproduction

Convert the two evaluation FBX files with Blender 5:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.0\blender.exe' `
  --factory-startup --background `
  --python scripts/avatar-bakeoff/convert-candidate.py `
  -- <input.fbx> <output.glb>
```

The converter bakes the FBX root rotation before glTF's Y-up export. Without
that step, both samples lie on the Z axis and TKA scales their body depth to
1.8 meters.

Run the focused checks:

```powershell
pnpm exec vitest run src/routes/test/avatar-bakeoff/avatar-bakeoff-data.test.ts
pnpm exec svelte-check --tsconfig ./tsconfig.json
```
