# Sequence engine review, 2026-10-22

A review of tonight's six engine commits and an invariant sweep over the
public builder. The sweep is
`packages/sequence-engine/tests/generation/invariant-sweep.test.ts` (commit
8e8177df3f). To regenerate the tables below, run it with `SWEEP_REPORT=<file>`.

## Summary

None of the 3,300 requests in the sweep breaks an engine invariant. That
covers closure, the requested LOOP label, the turn pool, turned bridges, statics
and the seed's end placement. Every infeasible error names only settings the
request set.

To see whether the generator now refuses requests it used to build, I ran the
same sweep against the engine as it stood before tonight (4aa8717649):

- The length-based groups (base, prop relationships, hand relationships)
  give identical results: the same cells build, fail, and are refused, with
  the same messages.
- Of the 825 word cells the old engine could run, none built before and
  fails now. 244 cells build now that did not before.
- The old engine built 24 word cells whose bridges had no turns. It also ran
  out of memory on the WXYZ word cells. Tonight's engine does neither.

I made no source fixes. The one confirmed gap is latent and could not be
reproduced through the public API, and the remaining findings are domain
calls (see Decisions).

The Flow Arts MCP server (`tka-pictograph`) failed to connect this session, so
domain statements below cite data files and code instead of MCP output.

## Findings

| #   | Severity            | Commit     | Where                                               | What breaks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | What I did                                                                                                                                                                                                                                                               |
| --- | ------------------- | ---------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Medium (latent)     | 58e2a3ad29 | `SequenceBuilder.ts:822`, `:1052`                   | The symmetric fallback is recorded after any validation failure, not only an identity mismatch. `equivalentDetectedLabels` checks placement closure (via the detector's `isCircular`) and the motion rebuild, but never prop orientation, so a fallback could return a sequence whose orientations do not close.                                                                                                                                                                                      | Probed 936 symmetric-word builds: all 476 fallback candidates followed an identity mismatch, and none was open. Not fixed: there is no public reproduction for a regression test. Recommended guard: record a fallback only when placement and orientation closure pass. |
| 2   | Medium (domain)     | 58e2a3ad29 | `SequenceBuilder.ts:850`, `:1064`, `:1089`          | The no-op swap policy is inconsistent. At level 2, GG/GH build as `rotated_swapped` (relabelled `rotated`) and as `mirrored_swapped` (relabelled `mirrored`), but are refused as `swapped` and `mirrored_rotated_swapped`. The halved-only equivalence check can never match the nested mirrored/rotated family. "Swapping them changes nothing" ignores turns: at level 2 the hands carry different turn values, and at level 3 GG swapped builds plainly.                                           | Recorded. Decision B.                                                                                                                                                                                                                                                    |
| 3   | Low                 | a9dd29d416 | `SequenceBuilder.ts:2351`, `:840`, `:2444`          | For `rotated_swapped(_inverted)`, the closure proof runs from one randomly pinned beta start, and the infeasible error ends the 40 rerolls. That is safe only because the diamond data is rotation-symmetric: D, DE, EF, GH, Θ, AJGE and A gave the same outcome on 12 of 12 seeds. Words whose first letter cannot start at beta (A, J, P, WXYZ, ABCD…) are now refused as infeasible, although the code's own comment says gamma starts are fine. Before tonight these failed with a generic error. | Recorded. Decision C.                                                                                                                                                                                                                                                    |
| 4   | Domain              | a9dd29d416 | `BeamSearch.ts:1020`                                | A word can now close as a LOOP by appending a bridge letter that is not in the word. The lone letter D builds in 71 of 75 cells (3 before).                                                                                                                                                                                                                                                                                                                                                           | Recorded. Decision A.                                                                                                                                                                                                                                                    |
| 5   | Low                 | a9dd29d416 | `word-closure-reachability.ts:48`                   | "Cannot close" is proven only for the search's own moves: each single-letter bridge, or the graph's one multi-letter path when no single bridge exists. A longer bridge chain is never considered, so the message states more than the check proves.                                                                                                                                                                                                                                                  | Recorded.                                                                                                                                                                                                                                                                |
| 6   | Low                 | 58e2a3ad29 | `SequenceBuilder.ts:850`                            | The no-op-swap verdict needs all 40 attempts to reach validation. One attempt that throws turns it back into the generic error.                                                                                                                                                                                                                                                                                                                                                                       | Recorded.                                                                                                                                                                                                                                                                |
| 7   | Low                 | c1759d0f71 | `TurnAllocator.ts:36`                               | Level 0, negative and fractional levels still fall back to `[0]` without an error. The app clamps (`config-mapper.ts:92`) and the MCP schema caps at 3, so no current caller reaches this.                                                                                                                                                                                                                                                                                                            | Recorded.                                                                                                                                                                                                                                                                |
| 8   | Info (pre-existing) | —          | `SequenceBuilder.ts` (hand-relationship validation) | The detector reads 326 of 711 built hand-relationship cells as a different LOOP label, and 39 of those as a plain repeat (for example identity hands + `swapped`, or north-south hands + `mirrored_swapped`). The builder accepts them because they match the requested construction. Same results before tonight.                                                                                                                                                                                    | Tabled in the sweep (`RELABELLED`), not failed. Decision D.                                                                                                                                                                                                              |

Reviewed with no issues found:

- a9deee6196 (bridge turns). Across the sweep, 487 bridge steps all carry
  turns, 310 of them nonzero. Turns are indexed by path position in both the
  direct and bridged branches.
- 9b91451383 (tau half map). It agrees with `CENTRIC_PLACEMENT_LOCATIONS`:
  tau1 = [c, n] turned 180° is [c, s] = tau5.
- d49aafcfd3 (one table for centric placements). The numbering comes from the
  Levels lab file the commit names. I could not cross-check it with MCP.

## Sweep matrix

| Group                                                             | Cells | Built | Refused by adapter (length % multiplier) | Infeasible | Failed (40 rerolls) |
| ----------------------------------------------------------------- | ----- | ----- | ---------------------------------------- | ---------- | ------------------- |
| LOOP rhythm × length {4,8,12,16} × level {1,2,3} × dashes         | 600   | 479   | 84                                       | 0          | 37                  |
| 8 prop relationships × rhythm × level (length and dashes rotate)  | 600   | 460   | 84                                       | 0          | 56                  |
| 16 hand relationships × rhythm × level (length and dashes rotate) | 1200  | 711   | 168                                      | 264        | 57                  |
| 12 words × rhythm × level                                         | 900   | 508   | 0                                        | 342        | 50                  |

There are 25 LOOP rhythms: the 17 legacy types at a half turn, plus the 8
rotated types at a quarter turn. Each cell seeds Math.random from a hash of
its key. Requests are shaped as the MCP adapter shapes them. Run time is about
15 s locally. The failed cells are the same set as before tonight; they are
mostly 4-step seeds that are too short to show the compound label, and seeds
without dashes that have no first step.

## Infeasible cells

Every infeasible relaxation and every named word or LOOP checked out. The
error texts are in the sweep's `INFEASIBLE` rows.

**Hand relationships.** Every infeasible cell names `handRelationship`, with
the message "No N-step seed can close a … LOOP from any allowed start":

| LOOP rhythm                                                                                                                                        | Hand relationships that make it infeasible (each also with /inv) |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| mirrored, flipped, mirrored_inverted (half turn)                                                                                                   | rotate-90-cw/ccw, both diagonal reflections                      |
| mirrored_swapped, mirrored_swapped_inverted (half turn)                                                                                            | both diagonal reflections                                        |
| swapped, swapped_inverted, rotated_swapped, rotated_swapped_inverted (half turn)                                                                   | rotate-90-cw/ccw                                                 |
| rotated, rotated_inverted, mirrored_rotated, mirrored_inverted_rotated, mirrored_rotated_swapped, mirrored_rotated_inverted_swapped (quarter turn) | all four reflections                                             |
| rotated_swapped, rotated_swapped_inverted (quarter turn)                                                                                           | all four reflections, rotate-90-cw/ccw                           |

**Words.** The infeasible word cells, by reason:

| LOOP rhythm                                                                              | Reason                                                   | Words                                             |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------- |
| rotated_swapped, rotated_swapped_inverted (both periods)                                 | first letter cannot start at the pinned beta (finding 3) | A AA ABCD AJGE BA J MNOP P WXYZ WY                |
| every quarter-turn rotated rhythm                                                        | last letter cannot reach the closing placement           | AA AJGE BA GG MNOP P (+ GG for rotated_swapped/4) |
| rotated, rotated_inverted, mirrored_rotated family (half turn)                           | last letter cannot reach the closing placement           | A P                                               |
| mirrored, flipped, inverted, mirrored_inverted, mirrored_swapped(\_inverted) (half turn) | last letter cannot reach the closing placement           | A MNOP P                                          |
| swapped, swapped_inverted (half turn)                                                    | last letter cannot reach the closing placement           | A MNOP                                            |
| swapped, mirrored_rotated_swapped, mirrored_rotated_inverted_swapped (half turn)         | the swap is a no-op (levels 1 and 2)                     | GG                                                |

## Decisions for Austen

**A. Can a word LOOP end on an extra bridge letter that isn't in the word?**
Commit a9dd29d416 lets WXYZ, WY and lone letters close this way.

1. Yes, keep it (recommended). The seam needs that bridge anyway.
2. Allow it only when the caller opts in.
3. No. Refuse words that can only close through an added letter.

**B. When swapping hands changes no location or motion type (GG, GH), what
should the swapped LOOP types do?**

1. Refuse every swapped type the same way, whatever else is combined with it
   (recommended).
2. Accept every one, labelled with the components that remain (rotated_swapped
   becomes rotated), and fix the check so the mirrored/rotated family qualifies
   as well.
3. Count a swap of turn values as a real swap, so level 2 GG builds.

**C. For rotated_swapped words whose first letter cannot start at beta (A, J,
P, WXYZ…):**

1. Also try gamma starts, which the code's comment says are fine (recommended).
2. Keep beta only and leave them refused as infeasible.

**D. When a hand relationship cancels the LOOP and the result is a plain
repeat (39 sweep cells, the same before tonight):**

1. Refuse it, as GG swapped is refused (recommended).
2. Keep accepting it because it matches the requested construction.
