# Hand Motions Overview Copy Review

**Concept ID:** `hand-motions-intro`

**Review state:** APPROVED TERMINOLOGY / IMPLEMENTED

**Implementation gate:** OPEN for previously approved text and terminology;
CLOSED for new teaching explanation pending exact-copy approval
**Last reviewed:** 2026-10-11

## Approved Text

The lesson quotes the Level 1 Guide's Hand Motions page:

> There are three fundamental hand motions in the Alphabet.
>
> The arrow shows the direction of motion.
>
> The hand shows the end position.

The three step captions are also verbatim:

> Move to an adjacent point
>
> Move to the opposite point
>
> Remain at the same point

Sources: `src/routes/(public)/guide/level-1/_pages/HandMotionsPage.svelte` and
`src/routes/(public)/guide/level-1/_data/content/hand-motions.content.ts`.

## Boundary

Routine labels such as “Blue hand,” “Previous,” and “Next” are exempt. No
additional explanation of how to perform these motions is approved.

## Rebuilt Lesson (2026-10-11) — Exact UI Copy

The three stages share the heading “Hand Motions” (the Guide page title). Each
stage's line under it:

> Drag the hand to a point.

> Drag both hands. Find all six.

> Using these, we can make six combinations, named below.

The third is the first sentence of the book's line above its combinations
(`verified_level1_hand_motions_76`), kept as `learn_motion_combinations_lead`
with “make” for the book's “derive.”
The book goes on “We’ll explore each one individually:”, which the lesson drops
because it continues to Timing and Direction instead.

Stage 1 lists the three moves with the approved step captions (“Move to an
adjacent point,” “Move to the opposite point,” “Remain at the same point”).
Stages 2 and 3 name each combination with the book's name and description
(`verified_level1_hand_motions_77` to `_87`, and `_70` for Static). The book's
Dash and Dual-Dash descriptions end without a full stop; the app adds one
through its own keys (`learn_motion_dash_description`,
`learn_motion_dual_dash_description`), so the book's keys and the printed
edition keep the book's text.

A pair already found with the hands swapped adds:

> Same pair, hands swapped.

The last stage's button reads “Continue to Timing and Direction,” following
the existing “Continue to Hand Motions” label.

## Timing and Direction Comparison — Exact UI Copy

The concept heading is exactly:

> Timing and Direction

Since 2026-10-11 this is its own lesson (`timing-and-direction`), which the
Hand Motions lesson continues to. Its copy below is unchanged by the move.

### Bridge

> Compare when your hands move and which way they travel.

On narrow screens, the preferred break is after “move,” keeping the two
phrases intact. The controls already name the available relationships.

The two concept labels are exactly:

> Timing
>
> Direction

“Timing” names the concept as a whole. The individual relationships continue
to use “together time,” “split time,” and “quarter time.”

### Six demonstrations

> SS
>
> Split time, same direction.

> TS
>
> Together time, same direction.

> QS
>
> Quarter time, same direction.

> SO
>
> Split time, opposite direction.

> TO
>
> Together time, opposite direction.

> QO
>
> Quarter time, opposite direction.

The full relationship name may appear when a mode is focused: `Split-Same`,
`Together-Same`, `Quarter-Same`, `Split-Opposite`, `Together-Opposite`, or
`Quarter-Opposite`. Element identity is communicated by its established icon;
the lesson does not repeat Water, Earth, Sun, Fire, Air, or Moon as headings.

### Approved Attribution (not shown in the current four-step lesson)

> Vulcan Tech Gospel codified and widely distributed Split-Same,
> Together-Same, Split-Opposite, and Together-Opposite as time-and-direction
> categories.
>
> The four elemental names are community-developed extensions of those
> categories. Their original creator is not yet documented.
>
> The Kinetic Alphabet adds Sun and Moon for Quarter-Same and
> Quarter-Opposite.

## Evidence Map

| Proposed claim                                                                                                                         | Current evidence                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Shift, Dash, and Static are the three fundamental hand motions                                                                         | Level 1 Guide Hand Motions page; Flow Arts MCP topic `hand path modifiers and hand motion types`                                    |
| Time categories are together, split, and quarter; direction categories are same and opposite                                           | Flow Arts MCP `list_vtg_categories`; Level 1 Guide `hm-type1` and `hm-gamma` pages                                                  |
| Water = Split-Same; Earth = Together-Same; Sun = Quarter-Same; Fire = Split-Opposite; Air = Together-Opposite; Moon = Quarter-Opposite | Flow Arts MCP topic `elementals timing direction sun moon`; `TND_BY_FAMILY` in `src/lib/features/choreo-card/domain/tnd-element.ts` |
| VTG codified and distributed the original four time/direction categories                                                               | _Vulcan Tech Gospel V.1_, compiled by Noel Yee; Flow Arts MCP VTG category and contributor records                                  |
| The four elemental names circulated as community extensions; their original creator is not established                                 | Austen's 2026-09-04 authorship correction; current MCP records establish later use and teaching but do not identify an originator   |
| TKA adds Sun and Moon for quarter time                                                                                                 | Flow Arts MCP elemental topic; Quarter-Same and Quarter-Opposite are identified as community extensions by the VTG category record  |

## Approval Record

- 2026-09-03 — Austen approved a pre-letter tutorial that teaches time and
  direction as animated hand motions, grounded in the book.
- 2026-09-04 — Drafted the combined Hand Motions + Elementals chapter and
  attribution for Austen's explicit copy approval.
- 2026-09-04 — Austen rejected personal attribution for the original four
  element names: known practitioners used and taught them, but the original
  creator is not established. Revised the draft to say they are
  community-developed extensions and leave authorship unknown.
- 2026-09-04 — Austen approved the revised wording.
- 2026-09-04 — Austen replaced the six serial demonstrations with one six-up
  comparison board and established the learner-facing terminology: “split
  time, same direction,” not “split timing, same direction.” He also approved
  icon-first mode labels and removing repeated element-name headings.
- 2026-09-04 — Austen clarified that the system is called “Timing and
  Direction,” while an individual relationship uses “split time,” “together
  time,” or “quarter time.” This supersedes the current `Time + Direction`
  screen heading. He requested a slower introduction before the six-up board,
  larger labels, a production Choreo Card hand-path breakdown after selecting
  a relationship, and removal of the duplicated top-left element icon when the
  canonical glyph is already visible at bottom right. No new explanatory prose
  was approved.
- 2026-09-04 — Implemented the approved five-stage flow and exact bridge copy.
  The six-up board now opens each relationship into a synchronized live
  animation and production hand-path Choreo Card; the duplicate focused icon
  is removed. The lesson remains BUILT pending Austen's hands-on confirmation.
- 2026-09-04 — Austen replaced the bridge's inert panels and plus sign with
  simple animated examples: paired bouncing balls show together, split, and
  quarter timing, while paired tracks show same and opposite direction. He
  specified “Timing” as the whole-concept label and required “Timing” and
  “Direction” to remain on the same line. No new teaching prose was added.
- 2026-09-04 — Austen rejected the vertically stacked, slow synchronized
  treatment because it made the three timing relationships read as one
  comparison. The bridge now gives Together, Split, and Quarter separate
  side-by-side motion bays, offsets their clocks, and uses a quicker
  gravity-shaped bounce with impact squash and rebound. No learner-facing copy
  changed.
- 2026-09-04 — Austen rejected bouncing balls as a timing metaphor because
  unbelievable physics competed with the concept. The bridge now uses one
  selectable phase dial for Together, Split, and Quarter and one selectable
  arrow runway for Same and Opposite. The dial states the selected relationship
  as the same point, half a cycle apart, or one quarter of a cycle apart. The
  five relationship names are unchanged.
- 2026-09-04 — Austen asked for one shared track, a more native composition,
  and sentence-aware wrapping without overexplaining. The bridge now uses one
  shared circle in each instrument, matched diagram sizes, native segmented
  controls, and the shorter bridge sentence above. Together's coincident hands
  form a blue/red marker; Split and Quarter separate on that same radius.
  Direction uses tangent arrowheads and short tails, with the red hand reversing
  for Opposite. Timing captions are “In sync,” “½ cycle apart,” and “¼ cycle
  apart”; direction captions are “Same way” and “Opposite ways.” These are
  implementation choices under the delegated redesign, pending Austen's review.
- 2026-10-10 — Austen approved the rebuild design
  (`docs/superpowers/specs/2026-10-10-hand-motions-rebuild-design.md`): one
  motion map instead of one player per motion, the six combinations taught in
  the lesson, and Timing and Direction moved to its own lesson. No new
  teaching explanation was approved.
- 2026-10-11 — Austen chose “Remain at the same point” as the Static caption
  for the lesson, the Guide web page and the handbook (over the book's “Stay at
  the current point”). The frozen first edition keeps its wording.
- 2026-10-11 — Austen approved three lesson prompts exactly as written:
  “Drag the hand to a point.” (motion map), “Drag both hands. Find all six.”
  (two hands), and “Same pair, hands swapped.” (a mirrored pair lands on a
  cell it already filled).
- 2026-10-11 — Implemented the three-stage lesson with the approved prompts,
  the book's combination names and descriptions, and the routine label
  “Continue to Timing and Direction.” The lesson is BUILT pending his
  hands-on confirmation.
- 2026-10-11 — Austen chose the book's first sentence alone for the wrap-up
  (“Using these, we can derive six combinations, named below.”) and full
  stops on the Dash and Dual-Dash descriptions in the app, with the printed
  first edition unchanged.
- 2026-10-11 — Austen replaced “derive” with “make” in that line for
  non-technical readers: “Using these, we can make six combinations, named
  below.” (German “bilden” for “ableiten”). Relayed by the Guide page session;
  the book key and the printed edition keep “derive.”

## Shared-path Refinement Verification — 2026-09-04

Record: `hand-motions-shared-path-polish-2026-09-04`.

- Flow Arts MCP's current `vtg` topic verified together, split, and quarter
  phase relationships and that direction compares hand paths.
- Inspected the running lesson in Chrome at 375×667, 960×412, 820×1180,
  1440×900, 1920×1080, 2560×1440, and 3840×2160. Both headings aligned,
  circle diameters matched, all five labels stayed inside their controls, and
  all controls retained 44px height. No horizontal page overflow.
- Also inspected 720×450, the reflow-equivalent CSS viewport for a 1440×900
  window at 200%. This caught and fixed cramped landscape selectors. A native
  browser-zoom shortcut did not change the emulated viewport; this is viewport
  reflow evidence, not a claim of native browser-zoom verification.
- Runtime checks confirmed 0°, 180°, and 90° timing offsets. Same-direction
  markers advanced together; Opposite advanced with opposite signs. Keyboard
  arrow selection stayed on lesson step four.
- Targeted reduced-motion emulation stopped both instruments while preserving
  instant selection and the selected timing offset. No runtime errors; only the
  development environment's disabled-analytics warning.
- Eleven canonical lesson tests passed; Svelte check reported zero errors and
  zero warnings; scoped CSS lint passed. Screenshots were inspected inline;
  the browser tool denied the requested local screenshot output directory.
