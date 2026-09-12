# Hand Relationship in Generate

Date: 2026-09-12
Status: reviewed by Austen 2026-09-12 (decisions below); ready for an
implementation plan
Feedback: `f2SKgV5rqEMJoHhTGggD` (create / generate), submitted by ssnss
(Krysten and Ryan), transcribed by Austen

## Problem

Kristen wants Generate to produce sequences where the left hand traces the
mirror image of the right hand on every step, so the two trails form one
bilaterally symmetric mandala. Generate picks whole pictographs and scores
them on prop continuity, hand-path continuity, and dash preference. Nothing
constrains how the two hands relate to each other inside a step, so the only
way to get a mirrored sequence today is to build it by hand in Construct.

The word "Mirrored" already exists in Generate as a LOOP type, where step
N+k reflects step N later in time. That is a different relationship (between
steps) from the one Kristen wants (between hands, inside one step). The two
compose but must not share a control or a label.

## Decisions from review

Austen, 2026-09-12, after Kristen's answers:

- Mirror means across the body's vertical axis. Top/bottom symmetry is its
  own option (Flipped), not a variant of Mirrored.
- Turns stay independent per hand. The relationship constrains hand paths
  and motion types, not turn counts, floats, or dash directions.
- The inverted variant ships.
- Freeform is the target. LOOP combinations that cannot close are coerced
  to the nearest valid option, never blocked. A section below explores how
  the remaining combinations could become possible later.
- Diamond and box both matter.
- The row is called **Hand Relationship**.
- The full picker ships: Free, Mirrored, Flipped, Unison, Opposite, plus an
  Inverted toggle.

## Decision

Add a **Hand Relationship** setting to Generate's Customize drawer. It is a
hard, per-step constraint on how the left motion relates to the right motion,
enforced inside the engine's existing beam search by one new constraint.
Saved Setups carry it automatically, which covers "save that as a preset".

The engine side is written against a location map, not a letter list, so the
grid-mode dependency (D/E/J/K in diamond, M/N/P/Q in box) is emergent and
every relationship is the same code with a different map.

## Semantics

A relationship holds for a step when the left motion's locations are the
right motion's locations passed through the relationship's map, and the
motion types match (or are swapped when Inverted):

| Relationship | Map on the right hand's locations          | Hands look like                        |
| ------------ | ------------------------------------------ | -------------------------------------- |
| Free         | none (today's behavior)                    | anything                               |
| Mirrored     | reflect across N-S: e/w, ne/nw, se/sw swap | left and right mirror images           |
| Flipped      | reflect across E-W: n/s, ne/se, nw/sw swap | top and bottom mirror images           |
| Unison       | identity                                   | both hands at the same point, same arc |
| Opposite     | rotate 180: n/s, e/w, ne/sw, nw/se swap    | hands opposite each other, same arc    |

| Field                 | Plain                                          | Inverted                           |
| --------------------- | ---------------------------------------------- | ---------------------------------- |
| start / end locations | left = map(right)                              | same                               |
| motion type           | equal                                          | pro and anti swapped               |
| turns                 | independent                                    | independent                        |
| rotation direction    | implied for shifts; free for dash/static turns | implied for shifts; free otherwise |

The maps are `REFLECTION_LOCATION_MAPS["north-south"]` and `["east-west"]`
from `strict-loop-position-maps.ts` and the `IDENTITY` and `ROTATE_180` tables
in `pair-relation.ts`. For a shift, rotation direction follows from locations
plus motion type (a reflection flips the hand path, so Mirrored and Flipped
give opposite directions and Unison and Opposite give the same), so it is
checked as an assertion, not a second rule. Dash and static steps qualify
when both hands dash or both stay. Once turns are allocated, a dash or static
gets its direction from continuity or a coin flip exactly as today; the
relationship does not reach into turn allocation or materialization.

Because turns are independent, the two hands' orientations diverge freely.
Start orientation is not linked either.

### What the dataframes say

Counted directly from `static/data/pictographs/*PictographDataframe.csv`
(576 rows each). Every relationship selects 24 rows plain. Inverted swaps
the pro/anti letters for their one-pro-one-anti counterparts and keeps the dash and
static rows, so it is 24 rows as well:

| Grid    | Relationship | Letters (plain)   | Inverted (plus the same dash/static rows) | Eligible start positions |
| ------- | ------------ | ----------------- | ----------------------------------------- | ------------------------ |
| Diamond | Mirrored     | D E J K Φ- Ψ- α β | F L                                       | α3, α7, β1, β5           |
| Diamond | Flipped      | D E J K Φ- Ψ- α β | F L                                       | α1, α5, β3, β7           |
| Diamond | Unison       | G H Ψ- β          | I                                         | β1, β3, β5, β7           |
| Diamond | Opposite     | A B Φ- α          | C                                         | α1, α3, α5, α7           |
| Box     | Mirrored     | M N P Q Λ- γ      | O R                                       | γ2, γ6, γ12, γ16         |
| Box     | Flipped      | M N P Q Λ- γ      | O R                                       | γ4, γ8, γ10, γ14         |
| Box     | Unison       | G H Ψ- β          | I                                         | β2, β4, β6, β8           |
| Box     | Opposite     | A B Φ- α          | C                                         | α2, α4, α6, α8           |

In the 6-element model (Flow Arts MCP, `elemental-model`): Unison is Earth,
Opposite is Water, both grid-invariant. Mirrored and Flipped are the
opposite-direction pair, Air or Fire in diamond and Moon in box; the same
geometry reads as a different element depending on the grid, which is the
grid-mode dependency rule.

In diamond, Mirrored alternates alpha at the sides (hands at E and W) with
beta at top or bottom; Flipped is the same vocabulary rotated a quarter turn.
Gamma is never reflection-symmetric in diamond, and alpha and beta never are
in box. Classic 3 (α1, β5, γ11) leaves one usable start in diamond for each
relationship: β5 for Mirrored and Unison, α1 for Flipped and Opposite.

## Engine

`packages/sequence-engine/src/generation`

- `ConstraintOptions.handRelationship?: { map: HandRelationshipMap; inverted?: boolean }`
  where `HandRelationshipMap` is `"identity" | "rotate-180" | "reflect-north-south" | "reflect-east-west"`.
  The map table lives next to `pair-relation.ts`, which already holds the
  rotation tables; export them instead of copying.
- New `HandRelationshipConstraint` (hard, `IVariationConstraint`) in
  `constraints/style/hand-relationship-constraint.ts`. `evaluate` checks the
  tables above against `candidate.leftMotion` and `candidate.rightMotion`.
  `couldSatisfy` is the same predicate, so the reachability pre-filter in
  `buildByLength` and the first-step scoring in `BeamSearch` (hard failures
  score 0 and sort last) exclude every ineligible start without new
  start-selection code. A test proves it: N seeded diamond builds under
  Mirrored all start at α3, α7, β1 or β5.
- `buildConstraintSet` pushes the constraint when `handRelationship` is set.
- Turn allocation, materialization, and orientation are untouched.

### LOOP compatibility

A relationship survives a LOOP component exactly when the two transforms
commute. Identity and rotate-180 commute with everything, so Unison and
Opposite work with every LOOP. For the two reflections:

| LOOP component                           | Mirrored (N-S) | Flipped (E-W) |
| ---------------------------------------- | -------------- | ------------- |
| rotated 180 (halved)                     | closes         | closes        |
| mirrored, axis north-south               | closes         | closes        |
| flipped (axis east-west)                 | closes         | closes        |
| swapped, inverted, rewound               | close          | close         |
| rotated 90 (quartered rotation)          | cannot close   | cannot close  |
| mirrored, diagonal axis (NE-SW or NW-SE) | cannot close   | cannot close  |

"Cannot close" is structural. The seed would have to end at a position that
is not symmetric under the relationship's own axis, and the hard constraint
forbids every step that lands there. Moving between the N-S-symmetric class
(α3, β1) and the E-W-symmetric class (α5, β3) always takes at least one step
that is symmetric under neither, such as one hand static at N while the
other dashes N to S.

Per Austen: coerce, do not block. `resolveLoopConfig` in
`loop-type-utils.ts` already coerces quartered to halved for non-rotation
LOOP types; it gains a `handRelationship` argument and applies two more
rules when the relationship is a reflection:

- `period: "quartered"` becomes `"halved"`.
- A diagonal `reflectionAxis` becomes the relationship's own axis
  (`north-south` for Mirrored, `east-west` for Flipped).

The LOOP card's summary reads the resolved config, so it shows what will
actually run. No toast, no disabled control. The engine is unchanged here:
if a caller forces a non-commuting combination through the MCP or a lab,
the search fails with its normal closure error.

LOOP extension itself needs no change: the executors transform both hands of
each seed step with one map, so a relationship that survives the seed
survives the loop.

### Exploration: loops beyond the commuting set

Austen asked how the coerced combinations could become possible later.
Two candidates, neither in this change:

1. **Loose relationship.** Run `HandRelationshipConstraint` as a heavily
   weighted soft constraint instead of a hard one. The beam keeps every
   step symmetric except the one or two where closure needs a
   symmetry-breaking step, so a quartered rotation of a Mirrored seed
   becomes a four-fold rotational mandala with a brief asymmetric seam each
   quarter. This is a `strict | loose` switch on the setting and a weight,
   and reuses the dash-preference precedent for a soft constraint that
   outranks the others.
2. **Relationship that rotates with the loop.** Define the reflection axis
   relative to the seed's own frame: the seed is generated Mirrored, and the
   quartered rotation is applied to the finished seed rather than targeted
   by it. That is what a rotated LOOP of a symmetric seed would look like
   if the seed did not have to land on rotate-90(start). It needs the
   extender to accept a seed that does not close on its own and to close
   the loop by construction instead, which today's `LOOPExecutor` contract
   does not offer.

The first is small and testable; the second changes the LOOP contract.
Neither blocks launch.

## App

`src/lib/features/create/generate` and `src/lib/shared/create`

- `UIGenerationConfig.handRelationship: HandRelationship` with values
  `"free" | "mirrored" | "flipped" | "unison" | "opposite"`, and
  `UIGenerationConfig.handRelationshipInverted: boolean`, ignored while
  `free`. Types in `src/lib/shared/create/domain/hand-relationship.ts`,
  next to `generation-style.ts`, but not part of `GenerationStylePolicy`,
  so Fuse is untouched. Defaults `"free"` and `false` in
  `GENERATE_DEFAULT_CONFIG`.
- Persist both in `SerializedConfig` (save and load). The persistence
  normalizer passes them through; Saved Setups and community favorites
  store the whole config record already, so a setup saved with Mirrored on
  restores Mirrored on. Reset All restores Free.
- `GenerationOptions` (foundation `generate-models`) gains both fields;
  `uiConfigToGenerationOptions` copies them and passes the relationship to
  `resolveLoopConfig`; `GenerationOrchestrator.mapConstraints` maps them to
  `ConstraintOptions.handRelationship`.
- The MCP `generate` tool reaches the engine option for free. Exposing it as
  a tool parameter is a follow-up, not part of this change.

### Customize drawer

- A fourth drill row after End Position: label **Hand Relationship**, value
  "Free", "Mirrored", "Flipped", "Unison", "Opposite", with ", inverted"
  appended when the toggle is on. "Hands" is already the label of the
  hand-path continuity axis inside Style, so this row is never shortened to
  Hands.
- Drill screen: five option buttons in the `GenerationStylePanel` pattern
  with a stacked hint line:
  - Free: "Each hand is chosen on its own."
  - Mirrored: "The left hand traces the mirror image of the right, side to
    side."
  - Flipped: "The left hand traces the mirror image of the right, top to
    bottom."
  - Unison: "Both hands move through the same point in the same direction."
  - Opposite: "Hands stay across from each other and arc the same way."
- Below the options, disabled while Free, a toggle **Inverted** with the
  hint "The left hand uses the other motion type. Pro on the right is anti on
  the left."
- No option or hint uses the word "hybrid".
- Collapsed Customize card: `buildCustomizeSummary` adds the fact
  "Relationship: Mirrored" (or "Mirrored, inverted"). "Hands: Mirrored"
  would collide with the Style axis. The card leaves the Default badge the
  same way it does for Props or Dashes.
- Start Position screen: unchanged. Position cells are not filtered at
  launch; the engine excludes ineligible starts and the user sees the
  ordinary generation error only if they block every eligible one.
- End Position: an end position the relationship cannot reach surfaces as
  the ordinary generation error. Filtering the picker is a follow-up.
- LOOP card: unchanged controls. Its summary reflects the coerced period
  and axis when a reflection relationship is on.

## Testing

Engine (Vitest, `packages/sequence-engine`):

- `HandRelationshipConstraint` against the real diamond and box dataframes:
  exactly the letters and counts in the census table for all four
  relationships, plain and inverted.
- Seeded builds: diamond L1 length 8 under each relationship, every step
  satisfies the predicate and starts at an eligible position; L3 with turn
  intensity 3 still satisfies the predicate (turns and floats vary
  independently); Mirrored plus rotated 180 halved closes; Unison plus
  quartered rotated closes; Mirrored plus quartered rotated, forced past
  the coercion, returns the closure error.

App:

- `customize-summary` fact for the new row; `generate-config` save and load
  round trip for both fields; `resolveLoopConfig` coercion for the two
  reflection rules and no change for Unison, Opposite, and Free.
- Browser: Customize drawer row and drill screen at the phone tier (bottom
  sheet) and the desktop tier (side panel). Generate one Mirrored sequence
  in diamond and one in box, read the steps' motions from the workspace to
  confirm the predicate on real output, then look at the mandala trail.

## Addendum 2026-09-12: Match turns

Austen, after the first ship: "we should have the option to match left-right
turns versus allow them to be different." Shipped as a second toggle on the
Hand Relationship screen, **Match turns**, off by default so the launch
behavior (independent turns) is unchanged.

- On: `allocateTurns({ matchHands })` rolls one lane and gives both hands the
  same value every step, float included. With a relationship active, a left
  dash or static that gains turns takes the spin the relationship implies from
  the right hand (a reflection flips it, inversion flips it back), applied in
  the beam search enrichment and again in postProcess so the direction the
  constraints scored is the one that ships. Free plus Match turns only matches
  the counts; there is no relationship to derive a spin from.
- Random allocation only. A `turnPattern` (MCP, labs) keeps its own lanes.
- Disabled at level 1 with the hint "Level 1 has no turns to match."
- `UIGenerationConfig.matchHandTurns`, `GenerationOptions.matchHandTurns`,
  `BuildOptions.matchHandTurns`. Summary fact "Turns: Matched"; the drill row
  value appends ", matched turns".
- Start orientation is still the user's choice on both hands; at levels 1 to 3
  the default in/in is already symmetric.

## Not in scope

- Loose (soft) relationships and rotating-frame loops (see Exploration).
- Quarter-turn relationships (left = right rotated 90, the S/T/U/V family)
  and diagonal reflections. The engine's map type can grow to take them.
- A relationship badge on sequence cards or in sequence metadata.
- Filtering the start and end position pickers to eligible positions.
- Fuse.
- MCP tool parameter.

## Open questions

None blocking. Optional: Kristen may want to read the five option names and
hints before they ship, since the picker is for her.
