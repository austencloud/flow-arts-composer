# Earth Root Observatory production contract

**Status:** Gate 1.1 sightline amendment ready for review; Gate 2 rejected and frozen; Gate 3 locked

**Scene ID:** `earth-root-observatory`

**Gate manifest:** `./scene-gates.json`

**Creative provenance:** `fsJqYPYkMjY2BESGuIBC`, `jjjRDt6uwrzf9pBOFD3C`,
`zf0pfUAmW4ODnjFJnep5`, `LUF8Uggz1uwbBrmvhOQp`, `ssnUksPqHir2Nr1fk65b`,
`s278g83rbcQybhjZnIfO`, `2VNrQh8GQClDvq9r9wXp`,
`lbzhhpX5y3UXsXU2jy3B`, `WWXT4vkB3zd3AQdHt2CO`,
`IL6B5Bnwz3moI7ZFFmu3` (proposal pending Gate 1.1 approval)

## Outcome

The visitor should leave Earth understanding that G, H, and I share one
continuous hand route but produce different rotational structures. The room
expresses that distinction through living roots. The visitor first encounters
each performer alone, then completes a horseshoe path and sees all three around
one tree from above.

## Authority ledger

| Concern                     | Canonical owner                           | Evidence path                                                             | Current conflict                                                                                  |
| --------------------------- | ----------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Creative direction          | Museum tracker and current user direction | `fsJqYPYkMjY2BESGuIBC`                                                    | None for Earth performer count                                                                    |
| Story canon                 | Story bible                               | `E:/flow-arts-private/museum/story-bible.md`                              | Corrected on 2026-08-08; older tracker text still describes Fire as an exception                  |
| Room shell and transitions  | Compiled cave floor plan                  | `src/lib/features/museum/data/vulcan-cave-floor-plan.ts`                  | Live description still names the Canyon Overlook                                                  |
| Performer roster            | Live museum data                          | `src/lib/features/museum/data/vulcan-cave-floor-plan.ts`                  | Earth is correct at G/H/I; Sun still carries four performers and needs a separate roster decision |
| TKA motion                  | Flow Arts MCP                             | Calls recorded 2026-08-08                                                 | None                                                                                              |
| Selected sequence variants  | Tog-Same catalog entries                  | `static/data/hero/tnd-base-words.json`                                    | Generator defaults are not variation authority                                                    |
| Spatial geometry            | Root Observatory plan contract            | `src/lib/features/museum/data/earth-root-observatory-plan.ts`             | The first Gate 1 approval was invalidated by the free walk; Gate 1.1 is the current candidate      |
| Blender output              | Gate 2 build and coordinate contract      | `scripts/build-earth-root-observatory-graybox.py`                         | The current Observatory graybox is rejected and remains frozen until Gate 1.1 passes              |
| Graybox performer playback  | `MuseumPerformerStation3D`                | `src/lib/features/museum/components/game/MuseumPerformerStation3D.svelte` | Gate 2 composes the shared avatar owner; the integrated museum still renders the canyon           |
| Integrated runtime behavior | Pending Gate 5                            |                                                                           | Live museum still renders the canyon implementation                                               |

## Claim ledger

| ID    | Class     | Statement                                                                                                    | Evidence or proposal source                                      | Status   |
| ----- | --------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | -------- |
| C-001 | literal   | Earth stages the exact museum performers and sequences GGGG, HHHH, and IIII.                                 | Live roster and selected catalog entries                         | verified |
| C-002 | literal   | All three selected loops follow south to west to north to east to south.                                     | Catalog `handPathId` values and Gate 1 report fingerprints       | verified |
| C-003 | literal   | G is pro/pro, H is anti/anti, and I combines blue anti with red pro.                                         | Flow Arts MCP calls made 2026-08-08 and selected catalog entries | verified |
| C-004 | metaphor  | G becomes a ring, H becomes a four-lobed trace, and I combines both traces.                                  | Gate 1 board                                                     | approved |
| C-005 | invention | Proximity reveals each local trace and a completed visit leaves that trace faintly present.                  | Gate 1 board                                                     | approved |
| C-006 | invention | Completing the horseshoe makes the three traces converge up the tree and turn the canopy toward the visitor. | Gate 1 board                                                     | approved |
| C-007 | invention | An ancient tree breaks through the roof and serves as the room's visual hero.                                | Current user direction and Gate 1 board                          | approved |
| C-008 | invention | H and I sit farther below and away from the route so their complete bodies remain visible while walking.     | `s278g83rbcQybhjZnIfO` and Gate 1.1 board                        | review   |
| C-009 | invention | Five measured root and vegetation fields occupy the basin without replacing the protected sightline lanes.  | `2VNrQh8GQClDvq9r9wXp` and Gate 1.1 board                        | review   |

## Experience sentence

> The player enters from Fire, follows a rising horseshoe around the west,
> north, and east walls because retained root traces point forward, interacts
> by approaching G, H, and I, witnesses their continuous motion become three
> different root structures, reaches a south overlook where the full room
> recognizes the completed circuit, and exits toward Air.

## Gate 0: Evidence preflight

### Sources and conflicts

- Room shell: 34 by 24 metres from the compiled `cave-earth` room.
- Entry: two-metre west door centred 12 metres from the north interior wall.
- Exit: two-metre south door at the south-east corner.
- Adjacent transitions: First Fire enters from the west; Air begins beyond the
  south-east door at museum datum zero.
- Performer roster: exactly three, using `cave-earth-automaton-g`,
  `cave-earth-automaton-h`, and `cave-earth-automaton-i`.
- Exact sequences: `cave-earth-seq-g`, `cave-earth-seq-h`, and
  `cave-earth-seq-i`, sourced from the three selected Tog-Same catalog entries.
- Production stack: the current museum prototype runs in the existing Svelte,
  Threlte, Three.js, and Rapier application.
- Canon conflict resolved: the one-performer rule and Fire-exception clause are
  superseded by `fsJqYPYkMjY2BESGuIBC`.
- Remaining global conflict: the live Sun roster contains four performers.
  Earth work does not select which three Sun performers survive.
- Spatial conflict: the live canyon, Blender Root Chasm, and Compression study
  remain reference material. None governs this proposed interior.

### Live motion proof

The current Flow Arts MCP returned:

- G: Type 1 Dual-Shift, blue pro, red pro.
- H: Type 1 Dual-Shift, blue anti, red anti.
- I: Type 1 Dual-Shift, blue anti, red pro.
- Together Same: together timing and same direction.
- Isolation: pro motion at zero turns.
- Antispin: prop rotation opposite the hand arc, producing petal-like patterns.

The selected museum loops are not newly generated variants. Their catalog
fingerprints appear in `earth-root-observatory-gate1-report.json`. The motion
panel on the review board shows the shared circular hand route beside the
proposed environmental traces.

## Gate 1: Measured plan

### Player route

| Stop | Player position and action     | First focus                    | Environment response                                         | Next cue                           |
| ---- | ------------------------------ | ------------------------------ | ------------------------------------------------------------ | ---------------------------------- |
| 1    | Cross the west threshold       | Last green seam from Fire      | Heat and orange light fall away                              | Cool daylight around the bend      |
| 2    | Enter the root basin           | Tree breaking through the roof | Room opens vertically around the trunk                       | Circular root current toward G     |
| 3    | Approach the west ledge        | G alone                        | Ring trace becomes visible and remains faintly lit           | Trace climbs north                 |
| 4    | Cross the north bridge         | H alone                        | Four-lobed trace becomes visible and remains                 | Trace turns east                   |
| 5    | Round the east wall            | I alone                        | Ring and petal traces interlock and remain                   | All traces point south             |
| 6    | Step onto the south overlook   | G, H, I, and tree together     | Traces converge up the trunk; canopy inclines toward visitor | Cool Air opening appears           |
| 7    | Descend to the south-east door | Bright Air threshold           | Response settles; one new leaf remains                       | Rising air replaces damp stillness |

### Spatial artifacts

- Annotated floor plan: `./earth-root-observatory-gate1-board.svg`
- Vertical section: panel 2 of the board
- Route storyboard: panel 4 of the board
- Sightline study: final-view rays and automated report
- Plan contract: `src/lib/features/museum/data/earth-root-observatory-plan.ts`
- Automated report: `./earth-root-observatory-gate1-report.json`
- Raster review copy: `./earth-root-observatory-gate1-board.png`

### Measured checks

- Shell: 34 by 24 metres.
- Clear route width: 2.4 metres.
- Route length: 79.4 metres.
- Maximum grade: 4.2 percent.
- Performer floor: 2.4 metres below museum datum.
- Final overlook: 0.6 metres above museum datum.
- Final camera: 75-degree horizontal field of view.
- G, H, and I each have one isolated close read.
- G, H, I, and the tree are unobstructed in the final frame.

### Main risk

The tree can become a generic fantasy centerpiece or visually swallow the
performers. Gate 2 should fail if the trunk blocks H, if roots turn the route
into clutter, or if the final frame reads as "large tree with three decorations"
instead of one composition driven by G, H, and I.

### Original approval and invalidation

Approved by Austen Cloud on 2026-08-08 with the exact quote, "Love it. Gate
passed." Museum tracker item: `aN8CmfibQLjWC24E0lmJ`. The later free walk
invalidated that approval because the fixed-stop study did not model the route
lip hiding H and I.

## Gate 1.1: Sightline and habitat amendment

Ready for Austen's spatial-comprehension review. Blender remains unchanged.

### What changed

- H moves from room-relative `(15.0, 4.8)` to `(15.0, 6.5)`. Its distance
  from the named review stop increases from 2.6 to 4.2 metres.
- I moves from `(26.5, 10.5)` to `(25.5, 11.5)`. Its stop distance increases
  from 3.0 to 4.1 metres.
- G, the shell, tree, doors, route, stops, final camera, and seven-part
  experience order do not move.
- Five habitat mass fields reserve 67.2 square metres of ferns, root
  understory, and low moss. The central final-view lane accepts only a
  0.25-metre moss carpet; taller understory stays on the basin shelves.

### Moving sightline proof

Each performer now owns a measured viewing window on the route rather than a
single camera ray. Seven samples span each window.

| Performer | Moving samples | Blocked samples | Minimum foot-line clearance above route lip | Habitat edge beyond route edge |
| --------- | -------------- | --------------- | -------------------------------------------- | ------------------------------ |
| G         | 7              | 0               | 0.24 m                                       | 0.14 m                         |
| H         | 7              | 0               | 0.42 m                                       | 0.64 m                         |
| I         | 7              | 0               | 0.31 m                                       | 0.60 m                         |

The amendment keeps the original isolated-read and final-frame checks green.
The long section explicitly aims each visitor-eye ray at the performer floor,
not the avatar centre, so a passing number means the route lip cannot hide the
feet from the sampled centreline positions.

### Review artifacts

- In-app review: `/test/earth-root-observatory-gate1-amendment`
- Amendment board: `./earth-root-observatory-gate1-amendment-board.svg`
- Raster copy: `./earth-root-observatory-gate1-amendment-board.png`
- Automated report: `./earth-root-observatory-gate1-amendment-report.json`
- Plan contract: `src/lib/features/museum/data/earth-root-observatory-plan.ts`

Gate 1.1 passes only when Austen can identify the rejected H/I positions, the
new continuous viewing windows, the lower-basin habitat fields, and the final
recognition overlook from the board without relying on prose.

## Gate 2: Playable graybox

Rejected after free-walk review. Gate 3 remains locked. The package below is
preserved as failure evidence; it is not the current spatial target.

The first Gate 2 review exposed three failures: static Blender mannequins stood
in for a finished runtime system, the inner route edge hid too much of H and I,
and the open basin did not explain why the visitor should enter the final
circle. That evidence is superseded by this revision, but the feedback remains
part of the gate record.

### Package

- Blender source: `blender/earth-root-observatory-graybox.blend`
- Derived coordinate manifest: `./earth-root-observatory-gate2-blender-plan.json`
- Runtime GLB: `static/models/museum/cave/earth-root-observatory-graybox.glb`
- First-person review: `/test/earth-root-observatory-graybox`
- Measured walkthrough: `artifacts/earth-root-observatory-gate2-first-person-walk.mp4`
- Nine-view evidence board: `./earth-root-observatory-gate2-contact-sheet.png`
- Build report: `./earth-root-observatory-gate2-report.json`

The package contains the 34 by 24 metre shell, both real doors, 11 measured
route segments, the 6.5 metre ceiling and roof break, the 15 metre tree, three
0.62 metre flat motif stages, two tapered root fins, three interaction volumes,
the recognition platform, nine fixed review cameras, and one animated
eye-height walk camera. The web review mounts the shared live avatar owner on
those stages and autoplays the exact GGGG, HHHH, and IIII museum sequences.
Their IDs and selected catalog fingerprints remain GLB metadata.

### Ownership

- The approved Gate 1 plan owns room geometry and route coordinates.
- The Gate 2 Blender contract converts plan X/Z into Blender X/Y with Z up.
  It does not maintain a second hand-copied layout.
- `MuseumPhysicsProvider` owns collision and floor height in the live review.
  A feature-local terrain program clears only the approved route and removes
  stale canyon colliders inside Earth.
- `UnifiedCameraController` owns first-person movement and mouse look. The
  route controls only teleport the player and register the intended review
  yaw and pitch.
- The Blender GLB owns architecture, stages, root traces, interaction marks,
  and the recognition approach. QA cameras, lights, labels, and performer
  locators remain in the `.blend` and are excluded from the GLB.
- `MuseumPerformerStation3D` owns the visible bodies, props, floor contact, and
  looping sequence playback. The room disables its default pedestal and passes
  the authored stage height instead of duplicating the performer system.
- Three colored root seams run along the final approach, narrow together, and
  terminate inside a five-metre standing disc. The widening route and smaller
  inner mark give the visitor a physical destination before the ensemble view.

### Checks

- Route width: 2.4 metres.
- Route length: 79.4396 metres.
- Walking time at 3.2 metres per second: 24.8249 seconds.
- Captured walkthrough with performer-view dwells: 30.75 seconds at 12 fps.
- Runtime asset: 125,652 bytes, one scene, 68 nodes, 64 meshes, 16 materials,
  no exported QA cameras or lights, and Draco compression.
- Focused graybox contract and terrain tests: 5 passed.
- In-app runtime review: all three shared avatar rigs loaded on their authored
  surfaces, played the expected sequence IDs, and produced no browser warnings
  or errors. The G, H, I, and recognition frames are recorded on the evidence
  board as live captures rather than Blender stand-ins.

### Human approval questions

Gate 2 passes only if Austen can correctly read the experience from the live
graybox: Fire withholds the tree until the bend; the tree becomes the reveal;
G, H, and I each receive a separate lower-basin read; the horseshoe ends with
three converging root seams and a clear place to stand; all three performers
and the tree form one composition; and the Air opening is the final cue. Any
incorrect read returns the room to Gate 2.

## Gate 3: Registered visual target

Pending Gate 2 approval.

## Gate 4: Production slice

Pending Gate 3 approval.

## Gate 5: Integrated room

Pending Gate 4 approval.

## Gate 6: Final acceptance

Pending Gate 5 approval.
