# The center point: what exists beyond Level 3, and how to get there

Status: research and phase plan, 2026-10-22. No product code changed. (The
brief asked for `docs/plans/active/`; that folder is gitignored as private
strategy, so this lives with the other tracked specs.) Every
domain statement cites a file and line in this repository at commit
`ee81e83f7a` (the base of `codex/center-point-research`). Where the code and
data do not settle a question, it is in section 5 as a question for Austen.

The Flow Arts MCP server (`tka-pictograph`) failed to connect in this session,
so this document reads its source and data files directly instead of calling
it. That is the same ground truth the server serves, but no tool output was
captured. After a file's first full path, later citations use its bare name.

## 1. Level definitions as the code has them

**Levels 1-3 (consistent everywhere).** The builder's turn pools are
`[0]`, `[0,1,2,3]` and `[0,0.5,…,3,"fl"]`
(`packages/sequence-engine/src/generation/turns/TurnAllocator.ts:21-32`). The
MCP `generate_sequence` tool caps `level` at 3 with the same wording
(`mcp-server/src/tools/sequence-tools.ts:807-815`). Any level above 3 falls to
`default: return [0]` (`TurnAllocator.ts:30-31`), so a request for level 4
silently produces level 1 turns.

**Levels 4-6: the current ladder.** Commit `da97059534` (2026-08-27, "levels:
interradials move to 4, the center point to 6") reconciled four contradictory
orderings into one: L4 interradial orientations and quarter turns, L5 skewed
grid (zeta, eta), L6 centric grid (center point, hash hand path, tau and terra
placements), L7 conjoined grids. Its stated reason: center is where
"orientation there is absolute, not center-relative" and a new hand-path family
(hash) appears. Sources that follow it:

- `packages/domain/src/data/glossary.ts:225` (the level ladder), `:664` (L4 =
  quarter turns), `:886` (center = 9th point, L6), `:1404` (hash, L6), `:1573`
  (τ- is L6).
- `packages/domain/src/curriculum/knowledge-graph.ts:167-280` (L4 interradials,
  L5 skewed, L6 nodes 6.1-6.4: center point, hash, tau/terra, center
  orientations).
- `packages/domain/src/curriculum/level-constraints.ts:18,21,24`.
- `packages/domain/src/constants/placement-groups.ts:57,70` (zeta, eta = 5),
  `:83,95` (tau, terra = 6).
- `src/lib/shared/domain/curriculum/level-feature-detector.ts:11-21` (L4 quarter
  turns, L5 zeta/eta and skew, L6 center location, tau/terra, centric mode,
  hash).
- `packages/render-core/src/constants/rotation-maps.ts:105` ("Centric
  orientations (Level 6 …)").

**Contradictions still in the tree:**

| Source                                                                                                                                           | Says                                                                                          | Conflict                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `mcp-server/src/tools/educational-tools.ts:43,52,72,77,85-86,95` and its published twin `mcp-server-pkg/src/tools/educational-tools.ts:38,46,71` | center, centric, tau, terra, hash = **Level 4**; ladder "4=centric, 5=skewed, 6=interradials" | pre-August order; the MCP's own `get_alphabet_info` text is stale in both packages                                                 |
| same file `:50,107`                                                                                                                              | interradials = **Level 6**                                                                    | same                                                                                                                               |
| same file `:141-142`                                                                                                                             | τ- is a "Level 4 extension"                                                                   | `glossary.ts:1573` says Level 6                                                                                                    |
| `packages/domain/src/constants/placement-groups.ts:116-119`                                                                                      | `getPlacementsAtLevel`: level ≥4 adds tau/terra, ≥5 adds zeta/eta                             | its own `level:` fields (lines 57-95) say zeta/eta 5, tau/terra 6                                                                  |
| `knowledge-graph.ts:252-253`                                                                                                                     | center is the "5th grid location", "5-point grid"                                             | `glossary.ts:886` and `level-constraints.ts:24`: "9th grid point", "9-point grid" (5 is right only for diamond or box plus center) |
| Austen's framing for this task                                                                                                                   | "Level 5 and up is the center point"                                                          | every code source above puts center at 6, skewed at 5                                                                              |

**What "Level 4" means in the engine today.** Interradial orientations and
quarter-turn arithmetic exist (`packages/render-core/src/calculations/orientation.ts:140-143`
radial 8-cycle; `packages/sequence-engine/src/core/orientation/layer-signature.ts:107-120,162-168`),
but no turn pool offers 0.25 (`TurnAllocator.ts:21-32`). Level 4 is reachable
only by hand, which matches Austen's "Level 4 needs human work".

## 2. What exists for center today

Verdicts: **works**, **partial** (pieces exist, path not wired or not right),
**absent**.

### Data

- **Absent.** The canonical pictograph tables contain no row with a center
  location. Counted over `mcp-server-pkg/assets/data/pictographs/`:
  `DiamondPictographDataframe.csv` (576 rows; locations n/e/s/w only),
  `BoxPictographDataframe.csv` (576 rows; ne/se/sw/nw only),
  `SkewedPictographDataframe.csv` (6,272 rows; the 8 perimeter points only).
  Center (`c`) count is 0 for every letter in all three. Placement families in
  the start column: diamond and box are alpha 144, beta 144, gamma 288 each;
  skewed adds zeta 576 and eta 576. No tau or terra rows exist anywhere.
- So no letter exists "only with center" and none "with both". The one letter
  registered for center, **τ- (Tau-Dash)**, has zero rows
  (`packages/domain/src/constants/letter-registry.ts:22,40`;
  `glossary.ts:1573`: "its variations are not part of the current Level 1
  pictograph dataframe"). τ- is a perimeter dash with the static hand already
  at center (`glossary.ts:815`), so it moves tau to tau; it does not enter or
  leave center.
- **No letter covers a hash** (perimeter ↔ center). Hash is defined
  (`glossary.ts:1404`: "Hash is dash- … covering half the distance … Same
  rotation physics as dash") but no registry entry names the letter of a step
  whose hand hashes.
- Zeta and eta are on the perimeter, not at center: e.g. `ζ,zeta4` is n + se,
  `η,eta2` is n + ne (`SkewedPictographDataframe.csv:5150,5186`). Only tau and
  terra involve center (`placement-groups.ts:73-97`).
- Precedent for authoring a new table: skewed rows are generated by
  `scripts/generate-skewed-dataframe.ts` from diamond/box rows plus a letter
  classifier (`src/lib/shared/pictograph/skew/skewed-frame-letter.ts`), pinned
  by `tests/unit/pictograph/skewed-frame-dataframe.test.ts` (header,
  lines 1-22).

### Enums, coordinates, grid modes

- **Works.** `GridLocation.CENTER = "c"` (`mcp-server/src/core/enums.ts:42`;
  engine type `packages/sequence-engine/src/core/types/sequence-engine-types.ts:81`).
  Center point (475, 475) in both grid modes
  (`mcp-server/src/core/grid-coordinates.ts:65,102,169`).
- **Partial.** The app has `GridMode.CENTRIC = "centric"`
  (`src/lib/shared/pictograph/grid/domain/enums/grid-enums.ts:130`), but the
  shared render type is `"diamond" | "box" | "skewed"`
  (`packages/render-core/src/types.ts:22`), the MCP tool accepts only those
  three (`sequence-tools.ts:801-805`), and so does the builder
  (`SequenceBuilder.ts:371`). Two app derivers return CENTRIC for a path that
  touches center (`src/lib/shared/foundation/services/hand-path-factory.ts:22-25`,
  `step-deriver.ts:44`); a third, `grid-mode-deriver`, has no center branch
  (`docs/reports/opus-batch-2026-09-12/fuse-correctness.md:261-263`).

### Orientation at center

- **Partial.** Eight center orientations `centerN … centerNW` exist with
  rotation angles at `c` (`rotation-maps.ts:105-114`, box copy `:213-222`),
  an opposite map (`orientation.ts:110-118`) and a fractional-turn compass cycle
  (`orientation.ts:130-133,176-196`). Whole turns use the switch logic,
  fractional turns the compass cycle (`orientation.ts:311-318`; engine copy
  `OrientationCalculator.ts:298-304`).
- **Absent in the engine, present in two app corners: the hand-off between
  the two frames.** Hand-path pairs for `hashIn`/`hashOut` exist
  (`orientation.ts:56-66,86-92`), but `calculateEndOrientation` never converts
  a radial orientation (`in`, `clock` …) into a center orientation when a hand
  arrives at `c`, or back when it leaves. A radial orientation at `c` renders at
  angle 0 whatever it is (`rotation-maps.ts:16-25`: `in` → `c: 0`), and a
  center orientation at a perimeter point also renders at 0 (`:107-114`).
  The app already has the bridge by absolute staff angle:
  `staffAngleToCenterOrientation` and `centerOrientationToDegrees`
  (`src/lib/shared/render/core/calculations/orientation-angle.ts:72-87`), used
  by Assemble for a hand ending at center
  (`src/lib/features/assemble-lab/services/builder-motion-geometry.ts:123-127`)
  and by the halved-step builder at a dash's midpoint, whose comment states
  "the center-family (L6 centric) orientations are ABSOLUTE"
  (`src/lib/shared/animation-engine/services/build-halved-step.ts:166-176`).
  That is the owner to extend, not a third copy.
- **Absent in the layer signature.** `orientationClass` returns null for
  center orientations and `layerOf` returns null if either prop is off-cycle
  (`layer-signature.ts:107-141`), so a step at center has no layer.

### Placement names

- **Absent.** `GridPlacementDeriver` maps 64 perimeter pairs (alpha, beta,
  gamma, zeta, eta) and throws for any other pair, including every pair with
  `c` (`packages/sequence-engine/src/core/placements/GridPlacementDeriver.ts:11-85,98-109`).
  The app's twin throws the same way
  (`src/lib/shared/pictograph/grid/services/grid-placement-deriver.ts:10-87,114-126`).
- **The numbering exists in the app.** `GridPlacement.TAU1-16` and `TERRA1`
  are enum members, and two tables give their locations: tau1-8 blue at center
  with red at N, NE, E, SE, S, SW, W, NW; tau9-16 the same with red at center;
  terra1 both at center
  (`src/lib/features/levels/level5-lab/domain/level5-placement-data.ts:14-30`,
  repeated in `src/lib/shared/components/placement-picker/start-placement-utils.ts:78-91`).
  Neither deriver uses them.

### Builder and generator

- **Absent.** Candidates come from `IVariationProvider.getVariations/getAllVariations`
  (`packages/sequence-engine/src/generation/data/IVariationProvider.ts:8-16`),
  which serve the dataframe rows, so no center step can ever be proposed.
  The only center-aware line is a placeholder static letter (`τ`, `⊕`) the beam
  search fabricates for tau/terra starts
  (`BeamSearch.ts:1054-1063`; acknowledged in
  `packages/sequence-engine/src/core/letters/LetterClassifier.ts:13-19`).
- LOOP extension throws when a transformed motion pair has no letter in the
  grid's data (`SequenceBuilder.ts:2025-2036`), so even a hand-supplied center
  step could not be LOOP-extended.
- `MotionPathValidator` already encodes that only a dash passes through center
  (`packages/sequence-engine/src/core/placements/MotionPathValidator.ts:1-8`).

### LOOP detection and closure

- **Partial, and partly wrong.** The rotation maps carry `tau1-16` and `terra1`
  (`packages/sequence-engine/src/loop/placement-maps/circular-placement-maps.ts:185-203,283-300,383-399`),
  but they disagree: a quarter turn is +2 within tau1-8 (`:284` tau1→tau3), which
  matches the app's numbering (45° per index), so a half turn should be +4
  (tau1 = blue c, red N → tau5 = blue c, red S); the half map instead sends
  tau1→tau9, "switches which hand is at center" (`:108-111,186`).
  That is what the swap map does (`strict-loop-placement-maps.ts:215-221`), not a
  rotation. Mirror and flip maps are identity placeholders with
  `TODO: proper mirror logic when Level 6 is fully specified`
  (`strict-loop-placement-maps.ts:78-83,123-128`). Location maps already send
  `c → c` (`circular-placement-maps.ts:431-500`), which is right for every
  rotation and reflection.
- **Absent in detection.** `LOOPDetector.deriveStartPlacement` catches the
  deriver's throw and returns null for any center location
  (`packages/sequence-engine/src/loop/detection/LOOPDetector.ts:356-368`).
- **Works.** The seam check compares placements, falls back to per-hand
  locations, then compares orientations as strings
  (`src/lib/shared/foundation/services/sequence-loopability-checker.ts:38-120`).
  Nothing in it excludes `c` or `centerN`.
- The builder's "end in a variation of the start" rule is the LOOP end-placement
  selection: quartered rotations take `QUARTER_PLACEMENT_MAP_CW/CCW`, others go
  through `loopEndPlacementSelector`
  (`SequenceBuilder.ts:2248-2299`). For a perimeter start this already works;
  it only needs center steps in the middle.

### App surfaces

The app has more center work than the engine, but it sits in Assemble and the
Levels lab, not in Construct.

- **Assemble (Create → Assemble): works, letterless.** A "Center" chip
  (`src/lib/features/assemble-lab/components/GridModePicker.svelte:45-53`)
  adds the center hit target (`InteractiveGrid.svelte:136,143`; Numpad 5). A
  hand can hash in or out (`src/lib/features/create/assemble/services/hand-path-motion-calculator.ts:76-82`);
  hashes are stored as `MotionType.DASH` (`builder-step-converter.ts:50-53`),
  the end orientation at center comes from the absolute-angle bridge above, and
  geometry uses radius 0 at center (`builder-motion-geometry.ts:44-72`). Letter
  lookup goes through the CSV query, which has nothing for center
  (`src/lib/shared/pictograph/shared/services/motion-query-handler.ts:81`), so
  center steps have no letter.
- **Levels lab, Level 6 tab: works as a reference.** The tab "Centric
  positions (Tau & Terra)" (`src/lib/shared/navigation/config/tab-definitions.ts:810-817`)
  loads `levels/level5-lab` (`src/lib/features/levels/LevelsModule.svelte:15`;
  the directory names predate the August reorder) and shows the tau/terra
  table cited above.
- **Data loading: absent, and center is coerced silently.** The app fetches
  Diamond, Box, Skewed and Trigrid CSVs from `static/data/pictographs/`
  (`src/lib/shared/foundation/services/data/csv-loader.ts:144-148`); none has a
  `c` cell. `mapLocation` turns an unknown `c` into NORTH with a warning
  (`src/lib/shared/foundation/services/implementations/data/enum-mapper.ts:58-62`)
  and `mapOrientation` turns center orientations into `in` (`:66-83`), so a
  center row added to a CSV today would load as a wrong perimeter row.
- **Construct start positions: absent.** Start options are a fixed
  alpha/beta/gamma list (`src/lib/shared/create/services/start-placement-manager.ts:74-132`),
  and a tau/terra start throws `Unsupported Construct start position`
  (`:236-243`). The build-your-own start picker drops center poses because
  "Construct still requires" a placement name
  (`src/lib/features/create/construct/start-placement-picker/components/BuildStartPlacement.svelte:98-108`).
- **Construct next steps: absent.** Options come from the CSV rows via
  `option-loader.ts`; a sequence ending at center gets no end placement
  (`placement-analyzer.ts:36-50`) and so an empty option list
  (`src/lib/features/create/construct/option-picker/services/option-loader.ts:35-37`).
  When a transition matches nothing, the query returns every option as a
  fallback (`motion-query-handler.ts:288-295`), which would show unrelated
  steps if center rows were half-wired.
- **2D prop at center: works.** `PropRotAngleManager.CENTRIC_ANGLE_MAP`
  draws center orientations by compass angle
  (`src/lib/shared/pictograph/prop/services/prop-rot-angle-manager.ts:104-122,217,251`);
  the prop sits at (475, 475) in any grid mode
  (`default-prop-positioner.ts:30-43,90-93`). Unverified: terra counts as beta
  and gets a beta offset (`beta-detector.ts:58-60`, `prop-placer.ts:155`); how
  that offset behaves at `c` was not checked.
- **2D hash arrow: partial.** `from_center_*` arrow art exists only for 0.25
  turns (`static/images/arrows/dash/from_center_n/dash_0.25.svg` and siblings;
  path logic `packages/render-core/src/calculations/arrow-asset-path.ts:62-82`).
  A 0-turn hash falls back to perimeter dash art, placed at its start
  location, with no tuned adjustment; `static/data/arrow_placement/` has no
  center keys. No straight half-length hash arrow is drawn.
- **2D animation and 3D: partial, wrong for hashes.** `LOCATION_ANGLES[CENTER] = 0`
  (`src/lib/shared/foundation/domain/math-constants.ts:26`) is used as a
  unit-circle angle by the main interpolator
  (`src/lib/shared/animation-engine/services/prop-interpolator.ts:157-160`) and
  the 3D one (`src/lib/shared/3d/services/prop-state-interpolator.ts`), so a hand
  "at center" is drawn at East on the rim (inferred from the cos/sin of 0; not
  observed in a browser). Assemble's own animator gets it right with radius 0.
- **Mandala: partial, same flaw.** `c: 0` in
  `packages/render-composition/src/card-mandala.ts:24-25` and in
  `src/lib/shared/mandala/services/mandala-geometry-calculator.ts:67-91`, with
  no radius-0 case (inferred, as above).
- **Level label: works, not shown.** `level-feature-detector.ts` reports L6
  for a `c` location, center orientation, tau/terra or centric mode
  (lines 83, 114-115, 123-124, 134). Its only consumer stores the result on
  choreo-card catalog entries
  (`src/lib/features/choreo-card/domain/catalog-membership.ts:43-47`); no UI
  shows it.

## 3. Gap list (in the order the builder needs them)

Size: S under a day, M a few days, L a week or more. "Fact" means the code
settles it; "Austen" means a domain decision is needed first (section 5).

| #   | Gap                                                                                                                                  | Size | Owner files                                                                                                                                       | Kind                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| 1   | One level number for center; stale MCP text (both packages) and `getPlacementsAtLevel` brought in line                               | S    | `educational-tools.ts` (×2), `placement-groups.ts:116-119`, `knowledge-graph.ts:252-253`                                                          | Austen (Q1), then fact      |
| 2   | Tau and terra names in both placement derivers, from the app's existing table                                                        | S    | engine `GridPlacementDeriver.ts`, app `grid-placement-deriver.ts`, `level5-placement-data.ts`                                                     | fact (Q4 confirms)          |
| 3   | Orientation through a hash in the engine: radial → center on the way in, center → radial on the way out, what turns do during a hash | M    | `orientation.ts` (render-core) and engine `OrientationCalculator.ts`, reusing `orientation-angle.ts:72-87`                                        | Austen (Q3)                 |
| 4   | Which two-hand steps into and out of center are legal                                                                                | M    | new rules beside `MotionPathValidator.ts`                                                                                                         | Austen (Q5)                 |
| 5   | Letters for center steps (only τ- exists, with no rows; nothing names a hash step)                                                   | L    | `letter-registry.ts`, a classifier like `skewed-frame-letter.ts`                                                                                  | Austen (Q2)                 |
| 6   | Center rows in the data: a generated table with a pinned test, mirrored into `mcp-server-pkg`                                        | M    | new `scripts/generate-centric-dataframe.ts`, `static/data/pictographs/`, `mcp-server-pkg/assets/data/pictographs/`                                | fact once 3-5 are decided   |
| 7   | CSV parsing of `c` and center orientations instead of coercing them; load the rows where `motion-query-handler.ts:81` has `[]`       | S    | `enum-mapper.ts:41-83`, `csv-pictograph-parser.ts`, `motion-query-handler.ts`                                                                     | fact                        |
| 8   | Grid mode for a sequence that visits center, through the builder, render types and MCP schema                                        | S    | `render-core/src/types.ts:22`, `SequenceBuilder.ts:371`, `sequence-tools.ts:801-805`, `grid-mode-deriver`                                         | Austen (Q7), then fact      |
| 9   | Construct start positions (tau/terra) and next-step options at center                                                                | M    | `start-placement-manager.ts`, `BuildStartPlacement.svelte`, `placement-analyzer.ts`, `option-loader.ts`                                           | fact once 2, 6, 7 exist     |
| 10  | Radius 0 at center in the 2D and 3D interpolators and the mandala                                                                    | M    | `prop-interpolator.ts`, `prop-state-interpolator.ts`, `card-mandala.ts`, `mandala-geometry-calculator.ts`, following `builder-motion-geometry.ts` | fact                        |
| 11  | Hash arrows (straight, half length, 0 and whole turns), their placement data, and the terra prop offset                              | M    | `arrow-asset-path.ts`, `static/images/arrows/dash/`, `static/data/arrow_placement/`, `beta-detector.ts`                                           | fact, with Q3               |
| 12  | Tau LOOP maps: half map made consistent with the quarter map, real mirror and flip entries                                           | S    | `circular-placement-maps.ts`, `strict-loop-placement-maps.ts`                                                                                     | fact                        |
| 13  | LOOP detection reads tau/terra placements                                                                                            | S    | `LOOPDetector.ts:356-368` (follows from 2)                                                                                                        | fact                        |
| 14  | Builder option to serve center rows; scorers checked on center data                                                                  | M    | `SequenceBuilder.ts`, `BeamSearch.ts`, variation provider                                                                                         | fact, with Q6               |
| 15  | Layer at center                                                                                                                      | S    | `layer-signature.ts:107-141`                                                                                                                      | Austen (Q8)                 |
| 16  | A level ≥4 turn pool instead of the silent fallback to `[0]`                                                                         | S    | `TurnAllocator.ts:21-32`, `sequence-tools.ts:807-815`                                                                                             | fact (refuse until defined) |
| 17  | Level label shown in the UI                                                                                                          | S    | `level-feature-detector.ts` consumers                                                                                                             | Austen (Q1)                 |

## 4. Phase plan

Each phase lands on `main` alone and is checkable in the app. Nothing here
starts until the questions it depends on are answered.

### Phase 0 — decisions and naming (half a day, needs Q1, Q2, Q3, Q4, Q5, Q7)

- Write Austen's answers into the domain package: level number, hash
  orientation rule, legality table, letter names (gaps 1, 3-5, 8). Fix the
  stale MCP text and `getPlacementsAtLevel`.
- Tests: a domain test that every level statement in `educational-tools.ts`,
  `glossary.ts` and `placement-groups.ts` agrees (string-level contract test);
  a deriver round-trip test over all tau/terra placements.
- Check in the app: Learn/Guide level text and `get_alphabet_info` say the same
  level for center.

### Phase 1 — Construct steps into center and back out (no generator change)

- **Data (gaps 6, 7).** `scripts/generate-centric-dataframe.ts` enumerates
  every legal center step from the Q5 table for diamond + center (box + center
  if Q7 says so), letters them per Q2, and writes the CSV to
  `static/data/pictographs/` and the `mcp-server-pkg` mirror, pinned by a test
  like the skewed one. The CSV mappers learn `c` and the center orientations.
- **Engine (gaps 2, 3).** Tau/terra in both derivers from the existing table.
  The hash orientation rule in `calculateEndOrientation` (render-core and
  engine copies), built on `orientation-angle.ts` so Assemble, the halved-step
  builder and Construct share one rule.
- **App (gaps 9, 10).** Tau/terra start positions; options at center via
  `placement-analyzer.ts`; radius 0 at center in the 2D interpolator, so the
  Construct preview does not draw the hand at East.
- **Tests.** Orientation table (every radial orientation × 8 perimeter points →
  center and back, 0 and whole turns), one table shared by both copies;
  deriver round-trip over all 17 center placements; dataframe pin; an
  option-source test that alpha1 offers a step into center and tau offers the
  way out; the enum mapper rejecting nothing it should accept.
- **Austen's check.** Create → Construct, start at alpha1 (N/S), pick a step
  where one hand goes to the middle, then one that comes back out. The prop
  sits on the center dot pointing the way Q3 says, the animation goes through
  the middle, and the word shows the letters from Q2.
- **Risks.** Short codes and thumbnail keys already name hash
  (`src/lib/shared/qr/services/short-code-manager.ts`,
  `src/lib/shared/browse/services/thumbnail-key-deriver.ts`); old saved
  sequences must still decode. The option picker may need a new row for center
  options. The "return every option" fallback (`motion-query-handler.ts:288-295`)
  must not fire for center.

### Phase 2 — generator goes through center and closes the LOOP

- **Engine (gaps 12, 13, 14).** Fix the tau maps; LOOP detection on tau/terra;
  a builder option (center allowed, per Q7) that lets the variation provider
  serve center rows. Start and end stay on the perimeter (Q6, recommended) so
  `getAllValidEndPlacements` is unchanged; the beam search gets more middle
  steps. The MCP `generate_sequence` schema gains the same option.
- **Tests.** Generate 8 and 16 step LOOPs of each type (rotated halved and
  quartered, mirrored, flipped, swapped, inverted) from alpha, beta and gamma
  starts with center allowed, and assert: some step touches `c`; every step is
  a dataframe row; `isSeamlesslyLoopable` holds; `LOOPDetector` names the
  requested LOOP type. Property test: the half map equals the quarter map
  applied twice for every placement.
- **Austen's check.** Generate with center on, several times, from different
  starts; each result passes through the middle and plays round with no jump
  at the seam.
- **Risks.** The scorers (`packages/sequence-engine/src/generation/builder/bridge-scorer.ts`,
  `variation-scorer.ts`) were tuned on perimeter-only data and may avoid or
  overuse center; `generation-infeasible-error.ts` needs a center-aware
  message. Full engine suite runs on d2.

### Phase 3 — fidelity and labels

- **Rendering (gaps 10, 11).** Straight half-length hash arrows with placement
  data, terra prop offset, radius 0 in the 3D performer and both mandala
  renderers.
- **Labels (gaps 15, 16, 17).** Show the detector's level (Q1's number) on
  cards and in Construct instead of letting the difficulty calculator guess L1
  (the detector's header, lines 4-8, calls itself an escape hatch for that).
  The level ≥4 turn pool is independent and can ride here or wait.
- **Tests.** A render test that a hash arrow runs from the perimeter point to
  (475, 475); browser check of the Construct center row at the seven viewports;
  a 3D and mandala check by eye on one generated sequence.
- **Austen's check.** One sequence through center looks right in the 2D
  pictograph, the 3D performer and the mandala, and its card shows the level.

## 5. Questions for Austen

Recommended answer first in each.

**Q1. What level number does center work get?**
A. Level 6, as set on 2026-08-27 (`da97059534`) and followed by the glossary,
knowledge graph and detector. Fix the MCP text to match. _(recommended)_
B. Level 5, as in your framing tonight; skewed would then move to 6 and the
August reasoning would be reversed.
C. Level 4, as the MCP's `get_alphabet_info` text still says.

**Q2. What is the letter of a step where a hand hashes into or out of center?**
A. For Phase 1, show these steps without new letters (a neutral mark), and
name them in a separate session with you. _(recommended: keeps letters yours)_
B. Name them now, by family: each hash pairing gets one new letter like τ-.
C. Reuse the dash-family letters with a hash marker, since the glossary calls
hash "dash-" (`glossary.ts:1404`).

**Q3. When a prop hashes into center with 0 turns, what is its orientation
there?**
A. It keeps the angle it had: `in` at N (drawn pointing south,
`rotation-maps.ts:16-17`) arrives as `centerS` (also drawn south,
`:111`), and leaves the same way. Turns add rotation as for dash. _(recommended:
it is what Assemble and the halved-step builder already do, it matches
"orientation at center is absolute" in `da97059534`, and "same rotation
physics as dash" in `glossary.ts:1404`)_
B. Something else; you supply the table.

**Q4. Keep the tau numbering the app already uses?**
A. Yes: tau1-8 blue at center, red at N, NE, E … NW clockwise; tau9-16 the
same with red at center; terra1 both at center (`level5-placement-data.ts:14-30`).
It fits the quarter and swap maps. _(recommended)_
B. Renumber; you supply the order.

**Q5. Which two-hand steps into or out of center are legal?**
A. One hand hashes (in or out) while the other does anything already legal on
the perimeter (static, shift, dash), plus both hands hashing together (to or
from terra). _(recommended as the starting set; Phase 1 can begin with only the
"other hand static" subset)_
B. Only one hand moves on a hash step; the other stays static.
C. Wider: also allow a hand to pass straight through center as one step
(that is a dash, already covered).

**Q6. For LOOPs, what counts as "ending in a variation of the start" once
center is in play?**
A. Sequences start and end on the perimeter (alpha, beta, gamma), visit
center in the middle, and close by today's LOOP rules. _(recommended)_
B. Also allow starting at tau or terra; then the tau maps must be complete and
verified first.

**Q7. Which grids get center first?**
A. Diamond + center only, then box + center. _(recommended)_
B. Diamond and box together.
C. Skewed as well.

**Q8. What layer is a prop in at center?**
A. Leave the layer blank at center and resume when the prop returns to the
perimeter. _(recommended until you decide)_
B. Treat centerN/E/S/W as radial and the diagonals as halfway.
C. A fifth layer of its own.

## 6. What this research could not settle

1. Which letters exist for center steps. The code registers only τ-, with no
   rows; no source names the letter of a hash step (Q2).
2. The orientation rule at the moment a hand reaches or leaves center (Q3).
   Two app features already keep the absolute angle, but no domain source
   states the rule, and none says what a turn during a hash does.
3. The level number. Code says 6, the MCP text says 4, Austen said 5 tonight
   (Q1).

## 7. Groundwork landed 2026-10-22

These "fact" gaps from section 3 are closed on branch
`codex/center-point-groundwork`. No domain question was decided.

- **Gap 2.** Both placement derivers name tau1-16 and terra1 from one table,
  `packages/sequence-engine/src/core/placements/centric-placement-locations.ts`
  (the Levels lab numbering, Q4 option A). The Levels lab and the
  start-placement fallback read it too.
- **Gap 13.** `LOOPDetector.deriveStartPlacement` names center starts
  (follows from gap 2; pinned by a test).
- **Gap 12.** The tau half map is two quarter turns (tau1 → tau5,
  tau9 → tau13), held by a property test over all 81 placements. Mirror and
  flip at center are still identity placeholders, pinned by a test.
- **Gap 7.** `mapLocation` reads `c` and `mapOrientation` reads
  `centerN … centerNW`. The centric slot in `motion-query-handler.ts` stays
  empty until gap 6.
- **Gap 16.** The turn allocator throws for level 4 and above; the MCP
  `generate_sequence` schema already capped level at 3.
- **Gap 10** (branch `codex/center-point-radius-zero`). All four sites did
  draw center on the rim at East, as inferred. `locationRadius`,
  `locationUnitPoint` and `touchesCenter` beside `LOCATION_ANGLES` in
  `math-constants.ts` put center at radius 0; a motion with a center end runs
  the straight line to or from the grid center in the 2D and 3D
  interpolators and the app mandala, whatever its motion type or path shape.
  `card-mandala.ts` keeps its own copy (the package cannot import app code).
  Every perimeter output is byte-identical (swept before and after); each
  site has a test. Orientation at center is untouched (gap 3).
