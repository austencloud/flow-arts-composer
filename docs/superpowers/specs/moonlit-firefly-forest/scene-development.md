# Moonlit Firefly Forest production contract

**Status:** Gate 12 Night Master approved; Gate 13A registered atmosphere targets active

**Scene ID:** `forest-firefly`

**Gate manifest:** `./scene-gates.json`

**Controlling plan:**
`../../plans/active/2026-08-08-forest-environment-pass-one.md`

**Creative provenance:** `rSguQqdHHv8fKNbDnmPv`, `W8SPNRGyTmAbzoV1GvFR`,
`2mXvGcaruOaXMvBjZ3dd`, `PoPSyJvOcDbpppYKubmr`,
`DlJ4UAevLxMFd2jA3VTf`, `v7A3GRTREIH4OuohvBOX`,
`UFY4AuUL80NTJMojrRBN`, `cYHeDvPZV5zgbGyCTbh7`,
`Q9wYcOIrKi0DBs3srzgm`, `lTXVsp1LWwbWMTL02sQK`,
`2h40cRvXHIL9szNFxb8c`, `IfXvzjoulL4tBTuSfY9j`,
`eNGUZus1AmY7RDttJu0p`, `l7yMn4ZnGJwXKKNNSW0c`,
`UwbTSR6CvVN9M925ZB2T`, `2jmNOIkBTDAWtY2VJL6C`,
`90nJzrs68M97RhzjzmFg`, `QPrseVHJrkNlGKbehXBl`

This file is an evidence index for the scene-production gate contract. The
controlling plan remains the single creative and implementation owner.

## Outcome

The Forest should read as an intimate performance clearing discovered inside a
living woodland. The stage remains the first focal point, the inhabited camp is
second, and the forest depth is third. Four near-frame trees now stand upstage
of the audience and form an irregular natural proscenium around the performance
bowl. A worn northwest trail begins behind the stage and bends into the woods.
Rocks, deadwood, grass, and mushrooms belong to named habitat vignettes rather
than an even scatter. The underlying 30 m flat terrain survives as a geometry
budget, while widened-layout callers omit the near-frame layer.

## Authority ledger

| Concern                   | Canonical owner              | Evidence path                                                                                               | Current conflict                                                                |
| ------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Creative direction        | Museum tracker               | Tracker items above                                                                                         | None                                                                            |
| Story canon               | Museum story bible           | `E:/flow-arts-private/museum/story-bible.md`                                                                | None                                                                            |
| Experience and gate order | Forest controlling plan      | Plan linked above                                                                                           | None                                                                            |
| Spatial geometry          | Forest layout contracts      | `scripts/forest-path-layout.json`, `scripts/forest-tree-layout.json`, `scripts/forest-campsite-layout.json` | Scene Lab and production now consume the same baked woodland placement          |
| Blender output            | Deterministic Forest builder | `scripts/build-forest-environment.py`                                                                       | Gate 10 scene layers remain isolated from the Coven-safe main GLB               |
| Runtime behavior          | Forest runtime scene         | `src/lib/shared/3d/environments/scenes/ForestScene.svelte`                                                  | No legacy procedural tree, tent, fire-ring, rock, bush, or log fallback remains |
| Cross-scene coordination  | Bramble and Elsa log         | `../active/2026-08-08-bramble-elsa-scene-coordination.md`                                                   | Optional shared-sky sun input announced before Gate 13A                         |

## Claim ledger

| ID    | Class     | Statement                                                                                                                                                         | Evidence or proposal source                                                            | Status                        |
| ----- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------- |
| C-001 | literal   | The terrain stays level through 30 m; the baked environment contract owns the woodland placement.                                                                 | Forest path contract, tree layout, and Gate 10 verification                            | locked                        |
| C-002 | literal   | Ground ecology is caused by named habitats rather than even scatter.                                                                                              | Gate 7 metrics and Austen approval                                                     | locked                        |
| C-003 | invention | Selected near trees create a smaller default visual clearing while widened-layout callers omit that layer.                                                        | Austen Gate 8 approval and Gate 9 runtime proof                                        | locked                        |
| C-004 | invention | The camp shelter is a hand-built moss-canvas lean-to with oak poles.                                                                                              | Gate 8 revision 1 visual target                                                        | rejected by Austen            |
| C-005 | literal   | Poly Haven boulder and rock sources are CC0 and already used by approved Autumn production.                                                                       | Source asset pages and Autumn builder                                                  | verified                      |
| C-006 | invention | The camp uses a contemporary two-person dome, three-person tunnel, and one-person trekking-pole tent as one cohesive gear family.                                 | Austen Gate 8 approval and production GLB                                              | implemented; in visual review |
| C-007 | literal   | The production fire pocket provides a 3.05 m fuel-clear circle and at least 4.57 m from each tent edge and the stage.                                             | Forest campsite contract, GLB verifier, and official fire guidance                     | verified                      |
| C-008 | invention | Four upstage trees form the natural audience-facing amphitheater without occupying the audience side of the clearing.                                             | Austen direction and Gate 10 runtime proof                                             | in visual review              |
| C-009 | invention | Grass, rocks, deadwood, fungi, and fireflies follow habitat fields; four rare bats stay high and peripheral at night.                                             | Austen direction and Gate 10 runtime proof                                             | in visual review              |
| C-010 | invention | The approved camp moves as one unit to a separate east-rim shelf while the central clearing becomes audience meadow and three named habitat zones.                | Gate 10.1 measured contract and Gate 10.2 playable proof                               | implemented; in visual review |
| C-011 | invention | Revision 36 is the canonical Forest Night Master; the same clearing will carry Dawn, Day, Golden Hour, Dusk, and Night atmosphere anchors.                        | Austen Gate 12 and atmosphere-plan approval                                            | locked; Gate 13A active       |
| C-012 | invention | A rare distant UFO may cross the night Forest without confirming any explanation.                                                                                 | Austen atmosphere-plan approval and story-bible guardrail                              | approved for Gate 13C         |
| C-013 | invention | The registered Forest day runs through 05:45 Dawn, 12:30 Day, 18:15 Golden Hour, 20:15 Dusk, and the locked 23:00 Night Master without moving the clearing.       | Gate 13A fixed-camera runtime sheet and verification report                            | ready for visual verdict      |
| C-014 | invention | The algae-coated mature canopy tree is replaced by an approved Meshy 6 oak with dry brown-gray bark and foliage-only green.                                       | Austen approval and `./evidence/tree-regeneration/forest-tree-regeneration-verdict.md` | implemented                   |
| C-015 | literal   | SpeedTree commercial adoption is shelved; the current Forest placement and production tree pipeline remain canonical, while the ORCA pilot stays evaluation-only. | Austen direction and tracker decision `IfXvzjoulL4tBTuSfY9j`                           | locked                        |
| C-016 | invention | Dawn through Dusk project the canonical 2D Celestial cloud system onto one camera-centered world-space sky dome; Night keeps clouds disabled.                     | Tracker decision `eNGUZus1AmY7RDttJu0p` and Gate 13A revision 4 proof                  | ready for visual verdict      |

## Experience sentence

> The player enters along the south woodland path, follows the open ground
> because the stage and warm camp light establish the focal order, interacts by
> performing in the registered clearing, witnesses the forest respond through
> later atmosphere systems, reaches a framed view of camp and canopy, and exits
> through either authored forest route.

## Active registered visual target

- Contemporary tent target: `./forest-modern-tent-family-target.png`
- Final campsite overview: `./forest-campsite-final-overview.png`
- Final human-height tent check: `./forest-campsite-final-close.png`
- Final hero composition: `./forest-campsite-final-hero.png`
- Final tunnel ripstop check: `./forest-campsite-ripstop-tunnel-final.png`
- Final dome ripstop check: `./forest-campsite-ripstop-dome-final.png`
- Final trekking ripstop check: `./forest-campsite-ripstop-trekking-final.png`
- Gate 8 board: `./forest-gate8-review-board.png`
- Gate 9 board: `./forest-gate9-review-board.png`
- Gate 10.1 measured composition: `./forest-composition-revision-plan.png`
- Gate 10.1 verification: `./forest-composition-revision-verification.json`
- Gate 10.2 playable review board:
  `./evidence/gate10-2/forest-gate10-2-contact-sheet.png`
- Gate 13A five-anchor target sheet:
  `./evidence/gate13a/forest-gate13a-five-anchor-registered-targets.png`
- Gate 13A Day/Night fixed-camera proof:
  `./evidence/gate13a/forest-gate13a-day-night-camera-proof.png`
- Gate 13A verification: `./forest-gate13a-verification-report.json`
- Gate 13A revision 4 world-space Celestial-cloud-system hero proof:
  `./evidence/gate13a/forest-gate13a-r4-world-cloud-hero.png`
- Framing target: four approved Forest trees sit upstage of the audience and
  form asymmetric side and canopy walls around the stage. Coven Hub and other
  widened-layout callers omit this conditional layer.
- Campsite target: one modern smokeless fire pit at runtime `(34.0, 2.0)`, three
  durable tent pads in one north/east sleeping arc, five inward-facing chairs,
  and an open west arrival from the camp spur. The stage owns the central
  clearing; the camp occupies its eastern edge beneath the upstage-east elm.
- Rock target: CC0 photogrammetry family already proven in Autumn, adapted with
  Forest ground contact and moss rather than radial placement.
- Deadwood target: approved Autumn fallen log plus Forest-authored split and
  branch variants, each tied to nearby moss, fungi, roots, and litter.

The obsolete `forest-shelter-visual-target.png` is retained only as rejected
revision evidence. It is not an active target and must not enter production.

## Gate boundary

Gate 10.1 is approved. Austen accepted the measured board with “Perfect.” The
production pass keeps the stage at runtime `(0, 0)`, translates the approved
camp by `(17, 0.5)`, and moves the fire from `(17, 1.5)` to `(34, 2)`. The
stage-to-fire distance is now 34.059 m. Every approved tent-to-fire relationship
is preserved.

Gate 10.2 is approved. The camp occupies a 22 m by 19 m durable
east-rim shelf reached by the extended spur. The central field remains low
audience meadow. A fern-and-boulder threshold, a moss-and-deadwood threshold,
and a sedge-and-firefly hollow give the open ground three site-specific causes.
The live review exposes hero, world, arrival, camp, and walk cameras. Its review
board shows the stage clearing, stage-to-camp separation, east shelf, and arrival
threshold. Austen advanced to the next Forest pass on 2026-08-09. The accepted
playable decision is tracked as `lTXVsp1LWwbWMTL02sQK`; the measured-plan
decision remains `Q9wYcOIrKi0DBs3srzgm`.

Gate 12 lighting and depth is approved as the Night Master. `ForestLighting.svelte`
owns one moon-aligned cool key, camera-side canopy fill, low ambient floor, and
a bounded stage pool. The global hemisphere is cool blue over deep green rather
than campfire orange. Warm fire bounce now falls off inside the east campsite,
and blue-green fog preserves the far tree line. A bounded 2048 px moon-shadow
map lets the stage and campsite cast contact shadows onto terrain and the camp
shelf. The 295-tree environment stays out of that depth pass, avoiding another
render of roughly 49 million processed vertices. Locked hero, stage, and camp
targets live in `./evidence/gate12/`. Austen locked revision 36 and approved the
five-gate atmosphere plan on 2026-08-10. Gate 13A now authors registered Dawn,
Day, Golden Hour, Dusk, and Night targets without changing geometry or public
controls. Tracker decision: `2h40cRvXHIL9szNFxb8c`.

The mature-canopy regeneration is integrated without changing the approved
Forest layout. The 62,227-triangle Meshy master remains isolated as evidence;
a 34,151-triangle production LOD now owns all 68 canonical canopy placements in
both optimized Forest GLBs. The corrected export was verified against the
tree-asset, full-environment, near-frame, instancing, and clearance contracts.
The detailed visual and credit record is in
`./evidence/tree-regeneration/forest-tree-regeneration-verdict.md`.

The later SpeedTree ORCA pilot is not a production dependency. Its live
revision 97 review proved that semantic bark and foliage surfaces are valuable,
but the evaluation canopy was over-scaled for the clearing and the licensed
source would require a paid production path. Austen chose to retain the current
placement and tree pipeline. The pilot GLBs, scripts, metrics, and verdict stay
quarantined under `./evidence/speedtree-pilot/` and
`static/models/forest/trees/candidates/evaluation-only/`; no SpeedTree asset is
mounted by the runtime. Tracker decision: `IfXvzjoulL4tBTuSfY9j`.

Gate 13A is ready for Austen's visual verdict. One Forest-owned profile now
registers 05:45 Dawn, 12:30 Day, 18:15 Golden Hour, 20:15 Dusk, and the exact
23:00 Night Master. The shared sky accepts an optional solar disk; callers that
omit it retain their existing sky. Forest-only material grading keeps the same
terrain, tree, stage, and camp geometry legible as the key and hemisphere
change. Day and Night were checked through hero, walk, world, stage, and camp
cameras in the in-app browser with no runtime warnings or errors. The rejected
generated cloud bank and its Forest-only texture were removed from production
and preserved under `./evidence/gate13a/rejected-r2/`. Revision 3
adapts the existing `CelestialBackgroundSystem` into an equirectangular texture
on a camera-centered world-space sky dome, so Forest receives the same 2D
cumulus, cirrus, and stratus system already used by Celestial rather than
another authored cloud implementation. The rejected screen-space projection
made the clouds follow the viewport like a windshield decal; revision 4 keeps
their orientation in world space while the dome follows camera translation. A
wrapped midpoint crossfade makes the panorama's 0-degree/360-degree meridian
continuous instead of exposing the 2D canvas edge as a vertical line.
Per-anchor phase, tint, and opacity remain Forest-owned while Night stays
cloudless. The approved-direction hero proof is
`./evidence/gate13a/forest-gate13a-r4-world-cloud-hero.png`; rejected
screen-space captures remain under
`./evidence/gate13a/rejected-r2/screen-space-r3/`. The original target sheet,
fixed-camera proof, and verification report remain in `./evidence/gate13a/` and
`./forest-gate13a-verification-report.json`. No public clock or time control
enters until Gate 13B.

Gates 8 and 9 remain approved. Austen reopened their framing direction for the
Gate 10 composition revision: intimate trees move upstage, the northwest exit
becomes a legible trail, and habitat-led ecology fills the performance bowl.
The stage form, four tree anchors, eight static props, six grass patches, four
mushroom colonies, five firefly fields, four restrained canopy bats, and the
modern campsite are now implemented. The authored Forest mounts three distinct
Meshy tent models on durable pads, five inward-facing chairs, and a Meshy
smokeless steel fire pit at runtime `(34.0, 2.0)`. Existing volumetric flame,
smoke, and camp lights remain the runtime behavior owners. The tent build applies
the deterministic `forest-clean-ripstop-v3` material. It replaces the Meshy
color atlases completely with a neutral seamless ripstop source, then tints a
fresh copy for each shelter. No source luminance, studio highlight, dark-mask
classification, or emissive texture survives. The exported material is
nonmetallic with 0.94 roughness, 0.10 specular response, restrained normal
strength, and a small uniform night color floor. Both camp lights remain warm
and local while the global Forest rig stays cool. The day-to-night control
remains a later gate. The approved Meshy pass used 120 credits total; its
paid-generation phase is closed.

The revised near-frame layer is a separate 12,083,200-byte production GLB. It
contains the Forest camp shelf, two distinct habitat anchors, four frame trees,
the worn trail, grass, and fungi. The default Forest route and Scene Lab mount
this same layer. Widened-layout callers supplying `clearingRadius`, including
Coven Hub at 28 m, omit it and make no network request for it. The main
environment export is a separate 17,177,092-byte GLB containing 295 trees across
13 authored clusters and masses. The former four procedural
`FOREST_TREE_RINGS` no longer exist, so Lab and production cannot disagree about
the woodland.

The Living Ground pass replaces the former flat olive clearing with one
continuous 4096 px world-space ecological atlas and a separate four-family
walking-distance detail system. Meadow, transition soil, canopy litter, and
damp runoff are blended by a 1024 px mask derived from the authored paths,
trees, habitat patches, stage, campsite, and props. Physical grass now forms
3,292 fuller summer clumps across 15 habitat patches while keeping the
performance core and paths clear. The runtime terrain remains one material, so
ecological variation cannot expose the rejected polygon islands. The current
optimized environment is 17,067,076 bytes and the near-frame layer is
12,351,892 bytes. Day, walking-distance, and locked-Night proof plus the exact
contract results live in `./evidence/living-ground/forest-living-ground-verdict.md`.

The first production Night review exposed a specular regression in that pass:
the moon key turned the meadow normal and roughness variation into a silver,
frost-like field. The Forest ground owner now applies atmosphere-specific
surface response. Night reduces baked and procedural normal relief and clamps
terrain roughness to a dry 0.96 minimum; Day keeps the stronger detail response.
No Night light, shadow, atmosphere, tree, stage, campsite, or placement value
changed.

Ground Ecosystem R1 replaces the colony ribbons with 6,620 authored plant
populations across the same 15 ecological habitats. The two grass families are
5,253 deterministic, tapered blade clumps with per-blade summer colour,
continuous root-to-tip wind weight, and true geometry silhouettes. They no
longer use whole-plant photo cards, which produced dark brush-stamp hedges at
middle distance. The other six families remain 1,367 GPU-instanced Poly Haven
scans: summer forbs, bracken, nettles, periwinkle, moss, and dandelions. Their
authored alpha, normal, and surface-response maps remain intact. Habitat
suitability, moisture, colony centres, priority competition, protected path and
performance cores, and distance bands all come from the static placement
contract rather than uniform scatter. The optimized near-frame layer is
14,679,272 bytes and retains Draco, WebP, and GPU instancing. The stage,
campsite, paths, trees, cameras, composition, and Gate 12 Night Master remain
outside the pass. Day, Night, human-height, path, and responsive proofs are in
`./evidence/ground-ecosystem-r1/`. The governing tracker decision is
`90nJzrs68M97RhzjzmFg`.

Lush Grass Floor R1 supersedes the visible botanical-patch interpretation of
that pass. The near-frame ground population is now 127,498 deterministic,
GPU-instanced grass clumps across a continuous 112 m summer sward. Its only
species are summer sward and shade-tolerant woodland grass; fern, forb, nettle,
periwinkle, wildflower, and moss populations are absent from this floor layer.
Habitat data still controls blade palette and scale, but cannot open gaps or
form visible foliage islands. The world-space ground atlas is meadow-dominant
from the performance bowl through the distant hills, while authored paths,
the camp shelf, stage contact, and mushroom clearances remain legible. The
optimized near-frame layer is 17,139,876 bytes and the main environment is
16,438,504 bytes. Day hero, walking-height, campsite, and locked-Night proof
live in `./evidence/lush-grass-floor-r1/`. The governing tracker decision is
`QPrseVHJrkNlGKbehXBl`.

Grass Fidelity R2 preserves that approved lush floor and replaces its
single-height silhouette with three continuous ecological strata: 66,658
ground-carpet clumps, 50,650 meadow clumps, and 11,322 sparse seed-height
clumps. The complete 128,630-clump population still uses only summer sward and
shade-tolerant woodland grass. Paths, the stage apron, and the campsite now
compress and thin the sward through feathered traffic gradients instead of
cutting visible holes through it. Each stratum has its own height, lean,
palette, and wind response; all three share one traveling gust field so the
floor moves as a connected meadow rather than as synchronized props. The
night atmosphere retains a dry, matte response and does not revive the former
silver-frost failure. Both production GLBs remain below the 18 MiB ceiling:
16,438,456 bytes for the environment and 17,320,832 bytes for the near-frame
layer. Matched Day floor, Day hero, and Night floor proof plus the contract
results live in `./evidence/grass-fidelity-r2/`. This is a refinement of tracker
decision `QPrseVHJrkNlGKbehXBl`, not a new scene gate.

The subsequent tree diagnosis established that the washed-out western canopy
is not a broken Poly Haven asset channel. The current Day foliage grade lifts
82.9% of visible Jacaranda pixels and collapses p90/p10 contrast from 3.25 to
1.61; high fill, missing near-frame canopy shadows, and two overlapping uses of
the same Jacaranda silhouette compound the result. The correction order is to
restore luminance-preserving green-gated grading, recover foliage-aware near
occlusion, then replace the repeated west-depth silhouette. No tree file was
changed during the Meadow System pass.

The campsite is a separate 2,153,112-byte Meshopt-compressed production GLB with
three Meshy tents, three tent pads, one Meshy smokeless fire pit, and five
chairs. Layout version 5 fits the shelter bodies independently on each axis,
rather than scaling their generated bounding boxes from height alone: the dome
is 2.25 x 2.45 x 1.10 m, the tunnel is 2.40 x 4.40 x 1.05 m, and the trekking
tent is 1.65 x 2.54 x 1.19 m. Its verifier confirms those final dimensions,
pad containment, the approved item IDs, runtime feature roles, a 34.059 m
stage-to-fire center distance, three graded tent materials, and positive safety
margin beyond the required tent-to-fire clearance for every shelter. The former
canvas tent, procedural fire ring, and their load-failure fallback have been
removed from the Forest runtime entirely.

Placement checks preserve the stage as the unobstructed center, keep the west
side of the camp open to the authored spur, and place the sleeping arc on its
own shelf beyond the audience meadow. The nearest approved frame tree remains
24.593 m from the fire. The direction is recorded under tracker decision
`cYHeDvPZV5zgbGyCTbh7`; the Gate 10.2 runtime visual verdict is pending.

Safety references:

- USDA Forest Service: campfires at least 15 ft from tents and other flammables
  when an existing ring is unavailable and fires are permitted.
- National Park Service: clear burnable material within a 10 ft circle and keep
  the fire small.
- Leave No Trace Center: prefer an established fire ring and durable campsite
  surfaces.

## Grass Fidelity R3: dry meadow and lived-in paths

Approved and verified 2026-08-13. The ground pipeline now stabilizes grass
shading across camera angles, softens the daytime substrate normal response,
and replaces deleted path cores with directionally flattened grass over visible
soil. The first 27.3 percent path-retention build was visually rejected as too
bare. The accepted build retains 49.2 percent of eligible path samples and
keeps Night matte without changing its locked atmosphere.

Evidence: `evidence/grass-fidelity-r3/grass-fidelity-verdict.md` and
`evidence/grass-fidelity-r3/grass-fidelity-metrics.json`.

## Summer canopy diversity and release parity

Verified for release 2026-08-13. The authored 295-tree woodland now uses 11
structural sources across broad-canopy, gnarled, slender, riparian,
understory, and fir families. No one source exceeds 20 percent of the layout.
The rebuilt near-frame layer retains 128,855 instanced grass clumps after the
current tree and path contracts are applied. The environment GLB is
20,887,772 bytes and the near-frame GLB is 18,846,964 bytes, keeping both
inside their production ceilings.

The release proof covers the current Day hero at every required viewport and
the locked Night hero at 1920 x 1080. Evidence and command results are indexed
in `evidence/production-release-2026-08-13/production-release-verification.md`.

## Tree and grass parity R1

Verified 2026-08-14. The accepted forest preserves the natural 11-silhouette
Poly Haven population after a live Meshy oak trial failed the production visual
gate. The oak's semantic bark/foliage split worked, but its sculpted crown read
as a bright foam mass beside photographic leaf canopies, so all four live oak
placements were removed and the natural baseline was rebuilt from source.

The production world contains 295 trees across 13 ecological clusters, with no
source above 20 percent. The near-frame meadow contains 128,855 instanced grass
clumps, including 7,277 flattened worn-path clumps. Day hero, path, and tree
cameras retain dry grass and brown trunks; the locked Night frame remains dark
and matte without silver-frost shine. The environment is 20,887,796 bytes and
the near-frame layer is 18,846,988 bytes, both inside their delivery ceilings.

The semantic-tree program spent 470 Meshy credits. Six R2 species remain
candidate-only, led by beech, birch, and tulip tree. Exact runtime proof,
candidate sheets, credit ledger, and contract results are indexed in
`evidence/tree-grass-parity-r1/tree-grass-parity-verdict.md`.

## Semantic canopy integration R2

Verified 2026-08-14. The six semantic Meshy families are now integrated into
the production population, bringing the Forest to 294 trees across 17 source
silhouettes. Meshy owns bark and branch structure only. Poly Haven leaf
clusters provide close and middle-distance texture, while an authored,
alpha-hashed crown shell restores low-frequency canopy mass from 24 to 48
metres. The original fused Meshy foliage texture is not used.

The first photographic-leaf build was rejected because its half-metre clusters
dissolved into speckles. The first two-tier build was rejected because the
optimizer renamed the crown role and exposed a bright foam surface. The
accepted build preserves the role through palette optimization, darkens the
shell, punches object-anchored gaps through it, and caps shell coverage at 72
percent.

The final world GLB is 20,885,804 bytes, the near-frame GLB remains 18,846,988
bytes, and both production verifiers pass. Visual, structural, and performance
evidence is indexed in `evidence/tree-hybrid-r2/tree-hybrid-r2-verdict.md`.
