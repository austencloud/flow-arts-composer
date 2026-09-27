# Ember Broken Rift production contract

**Status:** Mid-Flank Fire Pilgrimage Gate 2 R5 approved; Gate 3 R5 material target ready for review; R4 and prior Gate 1/2 production is historical

**Scene ID:** `ember-broken-rift`

**Gate manifest:** `./scene-gates.json`

**Creative provenance:** Museum trackers `C2tvT3lr69ss7EqvYknm`,
`OJGpjNddvANRvXMYt7sQ`, `inUhpQPs18g1o6HoKnDd`,
`j8jSJVcW6KGSbIur83Q8`, `MqaUVXWmMvvViGEOTCKX`,
`ZkW4K6AvovG7s4uXHFj3`, `wqUAKQMa79rTYDYa0N5m`,
`rn25Qau62kXyyOJpgm7Z`, `QRHbwRQLhM7Zn9LyYHOd`,
`gME4uHJawz9dtTlirRl8`, `kqMUPC5UpCHjj7ts9atQ`,
`5otAzYdNg5Wp5E27mgfo`, `nu73zqvPJRxio4T2sWz7`,
`ATURN84Ov2hmjWUndebl`, `ZSnkB98pb0wz6PO17XKp`,
`sDKmB6cUEXLfHgz4DGd4`, `s3cxnp6hOLBVQR5dDF42`,
`uXmi4z9lL7zCiNq5ULCp`, `ahPuPwh34G3FeqvUEHsB`,
`gqImqDqgfctdYi1kr6pH`, `ZgRNLK66C9Hz2wMPbOXc`,
`xSjtvI2XVvvMdn8pHqwP`, `WS9FU4nn2fCSbOn68IeB`,
`7uoHBfOCOqMmFeKBRh7l`, `lIPwVa2kGFcoQsgICkWI`,
`BvN1DiylOnfdbrofcwaM`, `xFcagbaZTQAq615IbZgT`,
`lXhTllDFV2Ne1E7foCkS`, `Vwm6XTLdDbDfxuoVE7z9`,
`5P5KVEq04dpHxu9F0ViI`, `Iur86OmZX40nTqdwgxDq`,
`Szxybxm6NlLkPyPL6dQt`, `1hlrU13Dg8VqdQaLJPib`, and
`3XyhXLyzv8ASNl2fLoCo`; Gate 3 proposal `n37Lcgy1czQrqITMnB8f`.

## R5 regression notice

Mid-Flank Fire Pilgrimage R5 is the only active spatial candidate. Austen
retained R4's colossal mid-flank direction but rejected its broad flat ledge in
`Vwm6XTLdDbDfxuoVE7z9`. Gate 1.1 R5 is approved in
`Szxybxm6NlLkPyPL6dQt`; Gate 2 R5 was approved in
`3XyhXLyzv8ASNl2fLoCo` after review under `1hlrU13Dg8VqdQaLJPib`. Gate 3 R5 is
ready for material-target review, and every later gate remains pending. The R5 Gate 1 sources are
`scripts/build-ember-geology-study.py`,
`scripts/prepare-ember-lava-simulator-benchmark.py`,
and `scripts/build-ember-geology-amendment.py`. Current evidence lives in
`evidence/gate-1-1-geology-amendment-r5/`. The R5 Gate 2 owner remains
`scripts/build-ember-geology-graybox.py`, with evidence in
`evidence/gate-2-geology-graybox-r5/`. R4 and earlier Blender sources, GLBs,
and Gate 2 evidence are historical only.

Except for the explicitly marked Gate 3 R5 material study, later-gate sections
below are retained as historical production evidence,
not as an active direction, approval, or implementation plan. The shipping
Ember runtime, final materials, atmosphere, Meshy assets, and Meshy credits are
unchanged by R5.

## Historical outcome before the geology-first restart

Ember should stop reading as a ring of low-poly props around an orange stage.
The orbiting viewer should read a broad volcanic basin first, a banked and
crusted lava river moving through it second, and an asymmetrical Columnar
Furnace plus active vent in the far field. The performer remains the brightest
cool silhouette and has an unobstructed 4.5 m action radius.

Gate 5 extends the approved production slice into the complete visual
environment: a full asymmetric caldera perimeter, broken columnar-basalt
fields, buried gate talus, foreground obsidian parallax, and a restrained glow
basin. The performer still owns an unobstructed 4.5 m action radius, but the
viewer now finds authored geology in every orbit sector instead of an empty
front half.

The first production slice failed review because an existing Ocean Meshy model
defined the hero silhouette. Revision 2 keeps the approved shelf relationship
but gives the landmark an original, scene-authored silhouette. Three
Ember-specific Meshy candidates were auditioned. The blade and shard cluster
were rejected; the buttress survives only as buried surface support behind four
authored fault-crown plates. Gate 5 R4 removes that generated buttress entirely;
no generated candidate remains in the integrated runtime asset.

## Current regression boundary

Austen reopened the scene at Gate 1 on 2026-09-03. The R2 adversarial audit in
`torsiCoIaMMrkMklUMSq` led to R3, then Austen rejected R3's shallow broad-basin
read in `BvN1DiylOnfdbrofcwaM`. R4 established the correct colossal mid-flank
direction, but Austen then rejected its broad near-level ledge in
`Vwm6XTLdDbDfxuoVE7z9`. R5 supersedes every earlier Gate 1/2 artifact and every
pre-restart Gate 3 through Gate 6 approval.

The active boundary preserves the shared Ember scene owner, performer identity,
4.5 m action radius, 25 m orbit cap, front-stage facing, surface research,
atmospheric systems, and unspent Meshy credits. It replaces the macro terrain,
inboard basin, same-level source, lava footprint, and composition with a
true-scale upper edifice, compound slanted mid-flank, small stable widening,
gradually steepening lower country, and explicit off-world continuation. Gate
1.1 R5 and Gate 2 R5 are approved; Gate 3 R5 is ready for review, and all
later gates are pending.

## Authority ledger

| Concern                    | Canonical owner                  | Evidence path                                             | Current conflict                                                              |
| -------------------------- | -------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Creative direction         | Museum tracker                   | `C2tvT3lr69ss7EqvYknm`                                    | None                                                                          |
| Story canon                | Museum story bible               | `E:/flow-arts-private/museum/story-bible.md`              | No Ember-specific story claim is introduced                                   |
| Room shell and transitions | Ember environment runtime        | `src/lib/shared/3d/environments/scenes/EmberScene.svelte` | This is an orbit environment, not a navigable museum room                     |
| Performer roster           | Viewer3D runtime                 | `src/routes/test/viewer-3d/Viewer3DWorkbench.svelte`      | No performer identity is changed                                              |
| TKA motion                 | Not applicable                   | `domainProofRequired: false` in `scene-gates.json`        | No letter, position, motion, or sequence fact is asserted                     |
| Selected sequence variants | Not applicable                   | `domainProofRequired: false` in `scene-gates.json`        | No sequence is selected                                                       |
| Spatial geometry           | Ember R5 geology builders        | `scripts/build-ember-geology-study.py` and `scripts/build-ember-geology-amendment.py` | Gate 1.1 R5 approved; Gate 2 derives without changing geometry |
| Blender output             | Existing Ember Gate 2 builder    | `scripts/build-ember-geology-graybox.py`                | R5 review Blend/GLB ready; shipping GLB unchanged                               |
| Runtime behavior           | Existing Ember scene owner       | `src/lib/shared/3d/environments/scenes/EmberScene.svelte` | R5 does not change runtime behavior                                            |

## Claim ledger

| ID    | Class     | Statement                                                                                                                                   | Evidence or proposal source                        | Status   |
| ----- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | -------- |
| C-001 | literal   | Viewer3D gives Ember a 25 m maximum orbit distance.                                                                                         | `src/lib/shared/3d/components/Viewer3DCamera.svelte` | verified |
| C-002 | invention | R5 places the performer on a 12 by 11 m old cooled lava bench within a continuous compound flank, with a downslope/lateral audience crescent, 131.368 m of upper rise, 69.916 m of lower fall, and one high-source Flowy drainage continuing through the south scene boundary. | Gate 1.1 R5 evidence and `Szxybxm6NlLkPyPL6dQt` | approved for Gate 2 |
| C-003 | invention | Blue-black basalt and rough obsidian dominate; orange is confined to fissures and the banked, crusted river, with restrained mineral ochre. | `look-development.md`, Blackglass Mineral Rift | reserved for future Gate 3/4 |
| C-004 | literal   | The shared performer contract preserves a clear 4.5 m action radius around world origin. | R5 Gate 1.1 report | verified |

## Experience sentence

> The viewer orbits a performer halfway up a colossal volcanic flank: the
> mountain and its high fire continue above, a small stable widening and the
> drainage pass beside the performer without interrupting the slope, and the
> lower country falls away beneath them.

## Gate 0: Evidence preflight

### Sources and conflicts

- Runtime shell: `EmberScene.svelte` and `ember-scene-config.ts`.
- Camera contract: the real Viewer3D orbit, with Ember capped at 25 m.
- Stage frame: playable surface at native local Y 0.5 before environment
  grounding offset.
- Creative authority: Mid-Flank Fire Pilgrimage R5 under trackers
  `BvN1DiylOnfdbrofcwaM` and `Vwm6XTLdDbDfxuoVE7z9`. Historical R4,
  Direction A, R3, Direction E, and
  Blackglass work may inform later surfaces but do not own geometry.
- Canon conflicts: none. No story or TKA-domain behavior is changed.

### Live motion proof

Not required. This slice changes environment geometry and materials only.

## Gate 1.1 R5: Measured plan

### Player route

This is an orbit environment rather than a walkable room. The spatial sequence
is visual: upper edifice and furnace saddle, performer on a small stable
widening within a continuous compound grade, gravity-led drainage passing west
of the action envelope, gradually steepening lower country, and off-world
downslope continuation.

| Stop | Viewer position and action                   | First focus                     | Environment response                         | Next cue                  |
| ---- | -------------------------------------------- | ------------------------------- | -------------------------------------------- | ------------------------- |
| 1    | Default camera, orbit begins from runtime -Z | Performer against rising mountain | High source and edifice continue out of frame | Orbit uphill |
| 2    | Side orbit                                   | Small old-flow widening and passing drainage | Performer remains clear while the flank stays slanted | Orbit behind |
| 3    | Opposite camera at runtime +Z                | Gradually steepening lower country | Drainage and terrain continue below and beyond scene | Return to performer |

### Spatial artifacts

- Annotated floor plan: `evidence/gate-1-1-geology-amendment-r5/01-north-up-measured-plan.png`
- True-scale vertical composition proof: `evidence/gate-1-1-geology-amendment-r5/02-true-scale-midflank-section.png`
- Exact uphill/downhill orbit proof: `evidence/gate-1-1-geology-amendment-r5/03-runtime-uphill-downhill-proof.png`
- Sightline study: `evidence/gate-1-1-geology-amendment-r5/04-orbit-sightline-study.png`
- Plan contract: `scene-development.md`
- Automated report: `evidence/gate-1-1-geology-amendment-r5/ember-midflank-fire-pilgrimage-r5-gate1-1-report.json`

## Gate 2: Playable graybox

Gate 2 R5 is `approved`. The existing graybox owner derives the editable
Blend, review-equivalent GLB, exact camera evidence, and continuous orbit from
the approved R5 heightfield and checked-in Flowy thickness raster. It also
includes the four approved downslope/lateral audience standing proxies.

- Editable source:
  `../../../blender/ember-midflank-fire-pilgrimage-graybox-r5.blend`
- Review GLB:
  `../../../static/models/ember/review/ember-midflank-fire-pilgrimage-graybox-r5.glb`
- Coordinate manifest:
  `evidence/gate-2-geology-graybox-r5/ember-midflank-fire-pilgrimage-r5-coordinate-manifest.json`
- Review contact sheet:
  `evidence/gate-2-geology-graybox-r5/ember-midflank-fire-pilgrimage-r5-gate2-contact-sheet.png`
- Continuous orbit:
  `evidence/gate-2-geology-graybox-r5/14-continuous-runtime-orbit.webp`
- Verification report:
  `evidence/gate-2-geology-graybox-r5/ember-midflank-fire-pilgrimage-r5-graybox-report.json`

The diagnostic 12 by 11 m bench outline and action ring are excluded from the
GLB. The muted old-flow material marks the whole geological contact, not a
performer-centred stage. Final surface materials, ember response, runtime
integration, and Meshy assets remain outside Gate 2. Austen approved this exact
artifact in `3XyhXLyzv8ASNl2fLoCo`. R4 Gate 2 evidence remains historical under
tracker `lXhTllDFV2Ne1E7foCkS`; Gate 3 R5 is ready for material-target review.

## Gate 3 R5: Cooled flank and crusted flow

Proposal `n37Lcgy1czQrqITMnB8f` carries the approved source meshes and eleven
cameras unchanged into an editable material/lighting study. The close AI
paintover supplies the intended surface finish; exact Blender views provide
registration evidence. The native study still contains coarse lava cells and
graybox rock faces. Those are explicit production gaps, not accepted finish.

- [Material brief and limitations](evidence/gate-3-midflank-r5/material-lighting-brief.md)
- [Target board](evidence/gate-3-midflank-r5/ember-r5-material-target-board.png)
- [Native orbit](evidence/gate-3-midflank-r5/ember-r5-orbit-board.png)
- [Cold bench / optional ember peak](evidence/gate-3-midflank-r5/ember-r5-ember-comparison.png)
- [Exact camera/geometry checks](evidence/gate-3-midflank-r5/registered-target-report.json)
- [Image-generation prompts and rejected drift](evidence/gate-3-midflank-r5/imagegen-provenance.json)

The cold bench is recommended. The ember alternate is a static visual trial,
not an implemented pulse. Gate 3 awaits human judgment; Gate 4 remains pending.
Runtime assets and Meshy credits are unchanged.

### Historical R3 Gate 2 evidence

- Review GLB:
  `../../../static/models/ember/review/ember-breached-rift-bench-graybox-r3.glb`
- Review contact sheet:
  `evidence/gate-2-geology-graybox-r3/ember-breached-rift-bench-r3-gate2-contact-sheet.png`
- Continuous orbit, sampled orbit board, and north-up plan:
  `evidence/gate-2-geology-graybox-r3/14-continuous-runtime-orbit.webp`,
  `evidence/gate-2-geology-graybox-r3/11-sampled-runtime-orbit-board.png`, and
  `evidence/gate-2-geology-graybox-r3/09-north-up-plan.png`
- Environment-specific exemptions are recorded in `scene-gates.json`; the
  review object is an orbit backdrop, so room navigation, route timing, and
  sequence parity are not applicable.

## Historical Gate 3: Registered visual target

- Locked camera set:
  `evidence/lookdev-r3/ember-lookdev-r3-report.json`
- Visual target board:
  `evidence/lookdev-r3/ember-lookdev-r3-comparison-board.png`
- Material and lighting brief: `look-development.md`
- Eight-sector proofs:
  `evidence/lookdev-r3/ember-lookdev-r3-riven-lava-tube-orbit-board.png`,
  `evidence/lookdev-r3/ember-lookdev-r3-columnar-furnace-orbit-board.png`, and
  `evidence/lookdev-r3/ember-lookdev-r3-obsidian-shear-orbit-board.png`
- Editable source: `blender/ember-broken-rift-lookdev-r3.blend`

The three targets share the approved stage relationship and camera set while
testing distinct hero geometries: fractured lava tube, asymmetric columnar
furnace, and low obsidian shear. Austen selected Columnar Furnace in museum
tracker item `QRHbwRQLhM7Zn9LyYHOd`. The selected target freezes the hero
relationship, material hierarchy, and anti-repetition guardrails while leaving
production topology and optimization to Gate 4.

## Historical Gate 4: Production slice

### Volcanic World Revision 5 production result

The authorized Gate 4 implementation remains governed by
`gate-4-columnar-furnace-production-slice-plan.md`, with the volcanic-world
amendment recorded in museum tracker `nu73zqvPJRxio4T2sWz7`. Revision 5 retains
the Columnar Furnace landmark and its complete-orbit supporting geology, then
places them inside one continuous 230 m volcanic basin with layered caldera
depth, a distant active vent, an open lava channel, and authored levees.

The static world contains 192 scene-authored mesh objects and 40,316 triangles.
The runtime river follows ten shared control points through a 1,792-triangle
indexed spline surface with downhill motion, warped molten leads, rafted dark
crust, fog, and three sampled lights. Blender, runtime configuration, and the
contract tests consume the same JSON spatial owner. The build imports no Meshy,
web, Ocean, generated, or pre-existing model.

### Historical Revision 1 rejection

The R1 runtime proof remains in `evidence/gate-4/` as failure evidence. Its
technical checks passed, but its creative dependency did not: the pre-existing
`basalt_pinnacle.glb` supplied the landmark's entire identity. Austen rejected
that approach on 2026-08-26 and authorized a full redesign.

Historical Revision 2 used an Ember-specific Meshy buttress as buried support.
That artifact remains failure evidence only. The selected Columnar Furnace
slice uses none of it.

Gate 4 Columnar revisions 1 through 3 remain adversarial rejection evidence.
R1 read as a basalt pipe organ with a neon zipper. R2 retained a flat black
fault ribbon with glowing stitches. R3 improved mass but exposed procedural
horizontal texture bands and orange emissive lozenges that read as interface
decoration. Museum tracker item `5otAzYdNg5Wp5E27mgfo` authorizes R4 to replace
those tells with asymmetric geological mass, negative space, mostly hidden
heat, and coordinated secondary geology across the entire orbit. Revision 4 is
the immediate visual baseline for R5; it passed technically but remained too
contained to satisfy the volcanic-world direction.

### Scope

- Preserve the protected 4.5 m action radius and front-stage performer heading.
- Extend the authored geology into a continuous exterior-scale volcanic basin.
- Establish a distant vent and layered terrain silhouettes without a circular
  enclosure or theatrical backdrop.
- Route one open lava river around the action area and out of the front frame.
- Preserve the existing Ember loader and lava-effect ownership rather than
  creating a second environment renderer.

### Acceptance tests

- The world reads as a continuous volcanic landscape, not a manufactured stage
  inside a decorated room.
- Near, middle, and far terrain establish convincing depth from front, side,
  and rear-quarter orbit positions without becoming a uniform enclosing wall.
- The performer has 4.5 m of unobstructed action clearance.
- The open lava river follows a downhill channel, skirts the action area, and
  combines dark rafted crust with visibly moving molten leads and local light.
- The optimized asset loads through Meshopt/KTX2-capable runtime
  infrastructure with no console error.
- The real `/test/viewer-3d?scene=ember` route is captured at the repository's
  required desktop, tablet, and mobile viewports.
- Focused asset and runtime contract tests pass.

### Review evidence

- Editable source: `blender/ember-volcanic-world-production-slice-r5.blend`
- Build and geometry report:
  `evidence/gate-4-volcanic-r5/ember-volcanic-world-production-slice-r5-report.json`
- Eight-sector orbit board:
  `evidence/gate-4-volcanic-r5/ember-volcanic-world-production-slice-r5-orbit-board.png`
- Runtime and performance report:
  `evidence/gate-4-volcanic-r5/ember-volcanic-world-production-slice-r5-runtime-report.json`
- Immediate before baseline:
  `evidence/gate-4-columnar-r4/ember-columnar-runtime-front-stage-1920x1080.webp`
- Responsive four-performer proof:
  `evidence/gate-4-columnar-r4/ember-columnar-runtime-four-performers-front-stage-1920x1080.webp`
- Seven-viewport board:
  `evidence/gate-4-columnar-r4/ember-columnar-runtime-front-stage-viewport-sweep.webp`
- Optimized runtime asset: `static/models/ember/ember-production-slice.glb`
- Reversible optimized asset: `static/models/ember/ember-production-slice-r5.glb`
- Geometry result: 192 mesh objects, 40,316 triangles, a 6,912-triangle largest
  mesh, one continuous volcanic basin, one distant vent assembly, two channel
  levees, 6.156 m minimum structural clearance, and no imported sources.
- Contract result: 27 focused geometry, asset, stage-bound, and camera tests
  pass across four files; `svelte-check` returns zero errors and zero warnings.
- Visual result: eight Blender orbit sectors plus live front, river-side,
  opposite-quarter, and rear-orbit review at 1920×1080, followed by 2560×1440,
  3840×2160, 1440×900, 820×1180, 960×412, and 375×667 runtime
  proofs after renderer settle. The performer faces front stage in every view.
- Runtime result: zero slice-owned console errors and warnings after scene
  readiness; the warm asset request returned 304.
- Performance result: the optimized asset is 2,581,844 bytes with nine KTX2
  textures, Meshopt compression, and quantized geometry.
- Responsive result: the existing shared owner grew the stage through one,
  two, three, and four performers while keeping all bodies inside the platform.
  The Viewer3D formation adapter preserves front-stage facing through those
  count changes and leaves explicit back-to-back/circle headings intact.
- Art verdict: the room-to-world problem is solved and the river-side shot is
  the scene's new benchmark. The full orbit is approximately 9.1/10 rather than
  final top-tier: smooth distant slopes, the generic vent crown, and weaker rear
  compositions remain visible limitations.
- Gate result: `ready-for-review`, approval unset. Gate 5 remains pending.

### Volcanic World Revision 6 continuity result

Museum tracker `ATURN84Ov2hmjWUndebl` authorizes the correction from a rear-only
basin to one continuous world around the camera. R6 preserves the R5 hero,
materials, stage behavior, performer heading, and action clearance while
expanding the terrain contract to 380 by 335 m and the river to seventeen shared
control points ending beyond the audience camera.

- Editable source: `blender/ember-volcanic-world-production-slice-r6.blend`
- Build report:
  `evidence/gate-4-volcanic-r6/ember-volcanic-world-production-slice-r6-report.json`
- Eight-sector orbit board:
  `evidence/gate-4-volcanic-r6/ember-volcanic-world-production-slice-r6-orbit-board.png`
- Optimized runtime asset: `static/models/ember/ember-production-slice.glb`
- Reversible optimized asset: `static/models/ember/ember-production-slice-r6.glb`
- Geometry result: 192 authored mesh objects, 49,532 triangles, a
  16,128-triangle terrain mesh, one surrounding terrain owner, three travel
  saddles, one distant vent assembly, two channel levees, and no imported
  source.
- Delivery result: the 2.52 MiB asset uses nine KTX2 textures, Meshopt, and mesh
  quantization.
- Focused verification: eight R6 production-slice contract tests pass, the
  absent historical integrated-room fixture remains an explicit todo, and
  `svelte-check` reports zero errors and zero warnings.
- Runtime boundary: live front-stage capture is pending because both the
  primary and isolated dev routes currently fail before scene evaluation with
  the checkout's SvelteKit virtual-CSS HTTP 500. The committed lockfile also
  disagrees with `patchedDependencies`, so a frozen dependency repair cannot
  proceed inside this scoped scene task.
- Gate result: `in-progress`, approval unset. The implementation is complete;
  runtime capture is the remaining verification item.

### Volcanic World Revision 7 Meshy geology result

Museum tracker `ZSnkB98pb0wz6PO17XKp` authorizes a bounded Gate 4 geology
correction after R6 still read as a graybox. R7 keeps the R6 spatial chassis and
changes the visual ownership of the focal formations.

- Editable source: `blender/ember-volcanic-world-production-slice-r7.blend`
- Build report:
  `evidence/gate-4-meshy-r1/ember-volcanic-world-production-slice-r7-report.json`
- Eight-sector orbit board:
  `evidence/gate-4-meshy-r1/ember-volcanic-world-production-slice-r7-orbit-board.png`
- Optimized runtime asset: `static/models/ember/ember-production-slice.glb`
- Reversible optimized asset: `static/models/ember/ember-production-slice-r7.glb`
- Source result: four unique Meshy 7 multiview winners, each retextured,
  officially remeshed, embedded once, and buried into authored terrain.
- Geometry result: 79 mesh objects, 196,906 triangles, 49,345 triangles in the
  largest mesh, and 6.156 m minimum structural clearance against the protected
  4.5 m action radius.
- Delivery result: the 6.33 MiB asset uses 18 KTX2 textures, Meshopt, and mesh
  quantization.
- Credit result: 200 of the authorized 240 credits spent; 40 remain unused.
- Runtime result:
  `evidence/gate-4-meshy-r1/ember-r7-runtime-hero-1920x1080.png` records the
  decisive front-stage view with the breached caldera, crusted river, scaled
  escarpment, and separated blackglass stage. The browser console reached the
  environment-ready state with no errors or warnings.
- Focused verification: 15 R7 production and paid-request checks pass, the
  absent historical integrated-room fixture remains an explicit todo, and
  `svelte-check` reports zero errors and zero warnings.
- Gate result: implementation and verification complete; approval remains unset
  pending Austen's review.

### Cinematic atmosphere R1 result

Museum tracker `sDKmB6cUEXLfHgz4DGd4` authorizes the runtime atmosphere
audition after the R7 Meshy geometry still read as one gray material band. The
R7 GLB, terrain dimensions, lava route, and performer clearance remain locked.

- Selected direction: Blackglass Inferno.
- Rejected directions: Furnace Storm, which flattened the composition into an
  orange wash; Sulfur Caldera, which weakened Ember's red-black identity.
- Runtime ownership: one scene-local data rig drives the existing haze,
  particles, heat fields, lava colors, light placement, quality-aware shadow,
  and per-material GLB response.
- Visual proof:
  `evidence/gate-4-atmosphere-r1/ember-atmosphere-look-board.png`,
  `evidence/gate-4-atmosphere-r1/ember-blackglass-orbit-board.png`, and
  `evidence/gate-4-atmosphere-r1/ember-blackglass-viewport-board.png`.
- Performance proof:
  `evidence/gate-4-atmosphere-r1/ember-atmosphere-runtime-report.json` records
  60.23 average FPS and a 16.8 ms p95 across 180 frames at the decisive 1920 by
  1080 runtime view.
- Credit result: no Meshy calls and no credit spend.
- Gate result: ready for review; approval remains unset.

### Geological World R8 terrain result

Museum tracker `s3cxnp6hOLBVQR5dDF42` reopens Gate 3 for a bounded terrain
comparison. It preserves the R7 Meshy formations, Blackglass Inferno runtime
rig, seventeen-point lava route, front-stage performer heading, responsive
stage owner, and 4.5 m protected action radius.

- Registered directions: Breached Caldera Terraces, Collapsed Lava Delta, and
  Basalt Badlands. Each uses the same four cameras and locked scene owners.
- Selected direction: Breached Caldera Terraces. Its offset rim, collapsed
  benches, and open travel breach produced the strongest shelf-to-world fusion,
  midground hierarchy, and far silhouette without restoring a prop ring.
- Terrain correction: the former 23 m flat moat is now a 10.8 m action floor.
  Eight fractured crust plates transition from the responsive stage into the
  terrain, while local erosion bowls protect the four retained Meshy bases.
- Editable source: `blender/ember-volcanic-world-production-slice-r8.blend`.
  The target audition blend is deterministically regenerated by
  `scripts/build-ember-production-slice.py --r8-targets` rather than committed
  as a 126 MiB binary.
- Registered target evidence: `evidence/gate-3-terrain-r8/`.
- Production evidence and complete orbit:
  `evidence/gate-4-terrain-r8/ember-volcanic-world-production-slice-r8-orbit-board.png`.
- Runtime asset: `static/models/ember/ember-production-slice.glb`; reversible
  asset: `static/models/ember/ember-production-slice-r8.glb`.
- Geometry result: 87 mesh objects, 197,898 triangles, a 49,345-triangle
  largest mesh, and 6.156 m minimum structural clearance.
- Delivery result: 6,697,772 bytes, 18 KTX2 textures, Meshopt compression, and
  mesh quantization.
- Runtime result: the decisive 1920 by 1080 view sustained 60.06 average FPS
  across 180 frames with a 17.5 ms p95 and no console errors or warnings. The
  four-performer capture confirms that the shared stage grows inside the new
  embedded crust transition.
- Credit result: no Meshy calls; the remaining 40 credits are untouched.
- Gate result: Gate 3 is approved by Austen's “Sick. Send it.” authorization.
  Gate 4 implementation and verification are complete; visual approval remains
  unset pending review of the production result.

### Volcanic Surface Ecology R9 target result

Museum tracker `uXmi4z9lL7zCiNq5ULCp` authorizes a new registered surface
comparison while preserving R8's terrain, atmosphere, geology, lava route,
responsive stage, performer heading, and action clearance.

- Independent directions: Fresh Flow Field, Ash-Choked Caldera, and
  Hydrothermal Rift.
- Director synthesis: Fresh Rift. It keeps roped young lava, fractured basalt,
  and sheltered ash as the world-wide hierarchy, then confines iron-rich
  hydrothermal response to lava-distance contact zones.
- Rejected full-scene languages: Ash-Choked Caldera restores the low-contrast
  graybox read; Hydrothermal Rift adds strong light interaction but allows
  sulfur and color accents to compete with Ember's lava hierarchy.
- Material proof: each direction uses four color, roughness, and normal-map
  families. The continuous basin blends them with a smooth per-vertex RGBA mask
  instead of hard material islands.
- Capability relationship: the production plan composes the existing shared
  `masked-ground-detail-material.ts` owner through an Ember-local adapter. It
  does not establish a second world-space ground-detail implementation.
- Registered evidence:
  `evidence/gate-3-surface-r9/ember-r9-surface-target-board.jpg`, sixteen
  camera-registered source renders, the candidate decision ledger, and
  `ember-r9-surface-target-report.json`.
- Editable target: `blender/ember-surface-ecology-r9-targets.blend`; all texture
  pixels rebuild deterministically with
  `scripts/build-ember-production-slice.py --r9-surface-targets`.
- Credit result: no Meshy calls; all 40 remaining credits stay reserved.
- Gate result: Austen approved Fresh Rift on 2026-08-28 in museum tracker
  `ahPuPwh34G3FeqvUEHsB`, authorizing the Gate 4 Blender and runtime pass.

### Volcanic Surface Ecology R9 production slice

Gate 4 carries the approved four-family ecology into the preserved R8 breached
caldera rather than rebuilding its terrain or introducing another material
system.

- Editable source:
  `blender/ember-volcanic-world-production-slice-r9.blend`.
- Deterministic build and report:
  `scripts/build-ember-production-slice.py --r9-production` and
  `evidence/gate-4-surface-r9/ember-volcanic-world-production-slice-r9-report.json`.
- Runtime assets: the 4,488,452-byte shipping and reversible GLBs at
  `static/models/ember/ember-production-slice.glb` and
  `static/models/ember/ember-production-slice-r9.glb`, plus a 1,024-square
  world mask and four color-detail families under
  `static/textures/ember-surface-r9/`.
- Delivery profile: 87 meshes, 197,898 triangles, a 49,345-triangle largest
  mesh, 6.156 m minimum structural clearance, 12 KTX2 maps, Meshopt
  compression, and mesh quantization.
- Capability relationship: `EmberGroundDetail.svelte` loads the ecology maps;
  `ember-ground-detail.ts` supplies Ember's bounds, families, and role policy;
  the existing shared `masked-ground-detail-material.ts` remains the sole
  shader owner.
- Scene integration: material treatment now follows semantic geology roles so
  the R9 names cannot silently fall back to the stale world tint. The responsive
  stage, front-stage performer heading, Meshy landmarks, river route, and 4.5 m
  action clearance are unchanged.
- Verification complete: Svelte check reports zero errors and zero warnings;
  the focused production, Ember-detail, and shared-detail suites report 14
  passing tests with one historical todo; the scene-gate validator passes.
- Verification outstanding: the live Viewer3D hero, bounded 25 m orbit,
  one-to-four performer growth, console, performance sample, and responsive
  viewport sweep. Gate 4 remains in progress until those frames are judged.

## Historical Gate 5: Integrated room

### Implemented visual integration

- R1 established the integrated geology but remained too dark and retained the
  generated buttress as hidden support.
- R2 and R3 expanded the locked orbit proof and visibility treatment. Their
  geometry still left one half of the orbit visually open, and the live rear
  camera exposed the support as a wet, Ocean-like backdrop.
- R4 deletes `Ember_Generated_Buttress_01` from the integrated build. Three
  textured authored basalt backplates now give the gate a deliberate reverse
  side rather than disguising an imported or generated survivor.
- R4 extends the approved production slice to 14 irregular caldera ridges, 68
  columnar-basalt columns, 34 pieces of gate talus, five obsidian shards, and
  three gate backplates.
- The perimeter now visually encloses all eight orbit sectors while every
  element remains outside the unobstructed 4.5 m performer action radius.
- The Ember review performer uses the shared Viewer3D front-stage adapter at
  `Math.PI`, which presents the avatar's visible front to the default negative-Z
  audience camera while the gate remains behind the performance. The adapter
  also survives performer-count and same-direction formation changes.
- Orange remains localized to shelf faults and the buried basin. Cool side
  lights, lighter fog, and stronger sky and hemisphere fill keep basalt faces
  readable without flattening the scene into an orange hellscape.

### Runtime evidence

- Integrated runtime asset: `static/models/ember/ember-integrated-room.glb`
- Runtime and performance report:
  `evidence/gate-5-r4/ember-integrated-room-r4-runtime-report.json`
- Build and camera report:
  `evidence/gate-5-r4/ember-integrated-room-r4-report.json`
- Eight-sector contact sheet:
  `evidence/gate-5-r4/ember-integrated-room-r4-orbit-board.png`
- Authored renders:
  `evidence/gate-5-r4/ember-integrated-room-r4-hero.png`,
  `evidence/gate-5-r4/ember-integrated-room-r4-oblique.png`,
  `evidence/gate-5-r4/ember-integrated-room-r4-reverse.png`,
  `evidence/gate-5-r4/ember-integrated-room-r4-gate-detail.png`,
  `evidence/gate-5-r4/ember-integrated-room-r4-side-depth.png`, and
  `evidence/gate-5-r4/ember-integrated-room-r4-plan.png`
- Asset result: 1,661,988 bytes, 156 mesh objects, 56,140 triangles, seven
  materials, three shared KTX2 textures, Meshopt compression, and quantized
  geometry.
- Runtime result: zero console errors and zero warnings. An uncached proof
  request returned 200 with all 1,661,988 bytes; the warm runtime path returned 304.
- Viewport result: 1920×1080, 2560×1440, 3840×2160, 1440×900, 820×1180,
  960×412, and 375×667 passed after renderer settle.
- Orbit result: front, front-right, right, rear-right, rear, rear-left, left,
  and front-left passed. Austen's exact reported camera at
  `-3.320,1.597,28.409` also passed after the generated survivor was removed.
- Focused result: 16 tests passed across the Meshy generator and Ember asset
  contracts.

### Historical Gate 5 boundary

Gate 5 was approved under the former art direction. Its evidence remains valid
as a historical technical record, but the 2026-08-27 Gate 3 regression
invalidates that approval for the next Ember release.

## Historical Gate 6: Final acceptance

Gate 6 was approved under the former art direction. The final acceptance walk
passed performer-count stage growth and contraction, responsive composition,
Ember to Autumn to Ember re-entry, eight-sector orbit coherence, runtime
console, focused regression, and frame pacing. That record remains useful
engineering evidence, but museum tracker item `rn25Qau62kXyyOJpgm7Z`
supersedes its creative acceptance. Gate 6 is pending until the selected Gate 3
direction completes production and integration again.
