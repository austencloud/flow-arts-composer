# ADR 003: Level-1-Base Float Classification

**Date:** 2026-04-18
**Status:** Accepted
**Supersedes:** `docs/archive/swarm-2026-10-14/reference/float-float-naming-analysis.md` (open research from 2026-03-26)

---

## Decision

**A pictograph's letter is derived from each hand's canonical Level 1 base motion type — not from the current display motion type.** Float is a modifier on a base shift (pro or anti), never a base type itself. Every float motion carries two pieces of load-bearing data:

- `prefloatMotionType` — the pro or anti that this hand _is_ at Level 1
- `prefloatRotationDirection` — the cw or ccw that hand would rotate if turns were added

Letter classification and turn-column color interpretation both read the base type: for any hand, the "classification type" is `motionType === "float" ? prefloatMotionType : motionType`.

Float is transparent to classification. If you see `R(fl, 0)` on a card, it means the R classification is intact — one hand is pro, the other anti — and the `fl` marker sits in the high slot because pro occupies the high slot in hybrids per PADS (Pro-Anti-Dash-Static priority order, defined in the Level 2 Guide).

---

## Context

The 2026-03-26 deliberation (`docs/archive/swarm-2026-10-14/reference/float-float-naming-analysis.md`) laid out the "0:1 ratio problem": when both hands float, the rotation-direction axis that distinguishes A/B/C-like letters collapses. The doc listed five approaches:

1. Context-dependent naming (sequence-level pass)
2. C-slot assignment (float-float → hybrid letter)
3. A new symbol for float-float
4. Type 6 variant (kinetic static)
5. Notional direction convention (each float carries its Level 1 base)

Approach 5 was flagged as "the most promising if it can be validated."

On 2026-04-18 a rendering bug surfaced: in a generated LOOP sequence, step 7 showed letter R with the `fl` turn marker rendered in red even though the float was on the blue (pro) hand. The root cause was that the sequence engine dropped `prefloatMotionType` when it converted a shift to a float via turn allocation, so `TurnColorInterpreter` had no way to resolve the PADS high slot (pro for hybrids) to the correct hand, and both slots collapsed to the same color.

The fix surfaced the classification question implicitly. Resolving it required picking one of the five approaches.

---

## The Deliberation

Two candidate rules were considered:

**Partner-based (initial proposal):** The visible non-float hand determines the classification. Float + anti → Q (anti variant). Float + pro → P (pro variant). Float + float → defaults to P (pro is the canonical shift type).

**Level-1-base (final choice):** Each hand's base type drives classification, independent of current float status. Float + anti (base pro) → still R. Float + float (base pro+anti) → still R. No letter ever reclassifies when a hand floats.

### Why Partner-based was rejected

- **Double-float forces an arbitrary tiebreaker.** If float+float defaults to P, the same visual pictograph gets labeled P, Q, or R depending on which base it came from — and there's no way to know. The invariant "label is a pure function of visible state" breaks at exactly the edge case it was invented to handle.
- **Label jumps on every edit.** Adding one turn to a float flips the classification from P → Q (or back) depending on which rotation direction the turn resolves to. Users editing sequences see the glyph swap under them.
- **Pedagogically misleading.** Two beats that are structurally the same motion (float + anti in context X) can get different labels depending on whether the anti came from a base R or a base Q. Choreographers who converged on the same motion via different paths end up with differently-labeled cards for identical movement.
- **Doesn't match how people compose.** When you float a pro hand, you're modifying an R, not re-conceiving it as a Q. The base _is_ the thing being edited.

### Why Level-1-base was accepted

- **Deterministic for every case.** Single-float, double-float, triple edits, round-trips through the editor — all produce stable labels. No special rules for edge cases because there are no edge cases.
- **Float's ontology is historical.** Every other motion type (pro/anti/static/dash) is self-describing. Float is definitionally "a shift with its rotation zeroed." Modeling it as a modifier on a base, rather than a peer of pro/anti, matches the physics.
- **Composer mental model.** Users starting from a Level 1 sequence and adding floats are editing the base, not replacing it. The label following the base matches the composition workflow.
- **Round-trips cleanly.** A user can remove turns from a pro to make it a float, then add turns back to get the pro back — with its original rotation direction — because `prefloatMotionType` and `prefloatRotationDirection` are preserved. The letter never changes.

### The steel-man against Level-1-base, and why it doesn't bite

**Steel-man:** The label overclaims information not visibly present. Two identical-looking float+float pictographs can carry different labels based on hidden prefloat history. A reader cannot verify the label from the card alone. This violates the notation principle _"the symbol should be derivable from what you see."_

**Why it fails:** PADS makes prefloat visible. Per the Level 2 Guide (_Glyphs / PADS_ section), the turns column for a pro/anti hybrid always places the pro motion in the high slot and the anti motion in the low slot — this is the `C, F, I, L, O, R, U, V` layout rule. So `R(fl, 0)` is unambiguous to a trained reader: the `fl` is in the high slot, which by PADS means it belongs to the pro motion; the `0` is in the low slot, belonging to the anti motion. The card is self-describing _after_ you know PADS — and PADS is already the canonical convention for TKA glyph layout. Level-1-base doesn't introduce hidden state; it relies on a layout invariant that already holds.

---

## Invariants

The following must be preserved everywhere float motions flow:

1. **Construction.** Any code that converts a pro/anti motion into a float MUST record `prefloatMotionType` (the original pro or anti) and `prefloatRotationDirection` (the original cw or ccw). Sites that currently do this correctly:
   - `packages/sequence-engine/src/generation/builder/SequenceBuilder.ts` (generator path)
   - `src/lib/features/create/generate/shared/services/implementations/TurnManager.ts` (interactive fl-turn assignment)
   - `src/lib/features/create/shared/services/implementations/step-operations/TurnsHandler.ts` (step editor)
   - `src/lib/features/create/shared/services/implementations/TurnPatternManager.ts` (pattern apply)

2. **Transport.** Any transformation that passes a motion between subsystems MUST carry the prefloat fields through. The engine → app boundary is covered by `BuildResultTransformer.mapMotion`.

3. **Classification.** Code that needs a motion's "classification type" MUST read the base type:

   ```
   actualType = motion.motionType === "float" ? motion.prefloatMotionType : motion.motionType
   ```

   `TurnColorInterpreter.getActualMotionType()` is the reference implementation.

4. **Round-trip.** Code that reverts a float back to a shift (by adding turns) MUST restore the motion using the preserved prefloat values — not invent a new type.

5. **Stripping.** `SequenceDecomposer` strips prefloat fields when converting to `SoloPropStepData` because those are viewer-only descriptions. `StepDeriver` re-derives them on the way back out. This is a correct strip — the prefloat data must be re-derivable from context, not invented. If this boundary ever needs to round-trip without context, prefloat must be re-added to `SoloPropStepData`.

---

## Implementation Notes

The canonical regression test is `packages/sequence-engine/tests/integration/float-prefloat-preservation.test.ts`. It asserts that every float motion emitted by the engine carries both prefloat fields, and that non-float motions never carry them.

The turn-color interpreter (`src/lib/shared/pictograph/tka-glyph/services/implementations/TurnColorInterpreter.ts`) already implements the base-type read correctly for TYPE1_HYBRID letters. Other letter types currently default to blue-top / red-bottom and are unaffected by this decision.

---

## Migration

Pre-existing published TKA books display the older partner-based labeling in some pictographs (e.g. what this ADR labels "R with a float on the pro hand" may appear as "Q" in some book reprints). These are deprecated and will be revised in a future edition. They are not ground truth for the current notation system.

Saved sequences in storage that predate this decision may have `letter = "R"` with float motions but no `prefloatMotionType`. The render layer handles this gracefully: the letter displays correctly; the turn-column color interpretation falls through to the default (blue-high, red-low), which does not resolve the PADS pro/anti slots but is not wrong — it simply loses the prefloat-derived color nuance. No data migration is required; the issue corrects itself as users regenerate or re-edit.

---

## Related

- `docs/archive/swarm-2026-10-14/reference/float-float-naming-analysis.md` — the 2026-03-26 research doc that framed the five approaches
- `packages/sequence-engine/tests/integration/float-prefloat-preservation.test.ts` — regression test
- Memory: `feedback_level1_base_float_classification.md` (agent behavioral rule)
