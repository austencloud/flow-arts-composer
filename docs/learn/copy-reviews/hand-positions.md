# Hand Positions copy review

**Repository status (2026-10-14):** This approval record retains its historical title and September 5 text. The current lesson is Hand Placements (`hand-placements`), owned by `src/lib/features/learn/components/interactive/placements/PlacementsConceptExperience.svelte`. Current topic prose is `src/lib/shared/guide-topics/placements-topic.ts`, with the Guide content adapter at `src/routes/(public)/guide/level-1/_data/content/hand-placements.content.ts`. The former `hand-positions.content.ts` reference below is historical. Current practice progression uses `PLACEMENT_SUCCESS_HOLD_MS = 1200` in `placement-experience-state.svelte.ts`; earlier explicit-Next observations do not override that behavior.

State: APPROVED for the September 5 clarity revision below. The earlier domain definitions remain verbatim Guide text.

## Later September 5 correction request

Austen subsequently rejected the repeated hand-color key, stage/count text, and
prose correction in practice. Those earlier approvals do not require retaining
the rejected presentation. The revision reuses Try again, Build {name}, and the
existing control names; Clear uses the workspace's visible label with Clear both
hands as its accessible name. The approved hand-selection instruction now refers
to selecting the hand on the artifact instead of a separate Move button.
Target locations are produced by canonical grid derivation and rendered with
the production pictograph component. No new domain explanation is introduced.

## Approved clarity revision (2026-09-05)

Austen approved the proposed layout and exact wording: “I'll take all of your recommendations for the layout and wording and fixes”. This followed hands-on feedback about hand identity, editing after Gamma, the next-step button, and tall split-screen balance.

| Approved text                                                                    | Evidence / interaction                                                                                |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Place both hands and see the position’s name. Next, try six practice challenges. | Existing canonical classifier and six authored construction rounds.                                   |
| Tap a point for your left hand.                                                  | Shared placement state selects the left hand first, and reselects it through Move left hand.          |
| Now place your right hand.                                                       | Shared placement state advances to the right hand after the first placement.                          |
| Choose a hand to move, then tap another point.                                   | Existing edit/select-point interaction; does not clear either hand.                                   |
| Left = blue · Right = red                                                        | Verbatim identity mapping from the Guide; explicitly requested by Austen.                             |
| Move left hand / Move right hand                                                 | Existing Move blue / Move red actions, renamed by identity rather than color.                         |
| Clear both hands                                                                 | Existing Clear grid action; preserves completed practice rounds.                                      |
| Next: Practice →                                                                 | Existing exploration-to-practice transition, now separated from editing.                              |
| Keep the left hand where it is. Move the right hand to {point}.                  | Same tested correction destination; hand identities follow the approved left/right naming throughout. |

The exploration counter is removed from the presentation; no new prerequisite is introduced. No further wording choice is outstanding for this revision. Final visual approval remains separate from wording approval.

## Domain evidence

Current-turn Flow Arts Knowledge MCP queries for Alpha, Beta, Gamma confirmed opposite points, same point, and right angle. The canonical written Guide is `src/routes/(public)/guide/level-1/_data/content/hand-positions.content.ts` (Level 1 page 8).

| Exact text                                                    | Evidence                                                                                                                                           |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| In Alpha, the hands occupy the points across from each other. | Verbatim Guide definition; Alpha MCP result: 180 degrees.                                                                                          |
| In Beta, the hands occupy the same point.                     | Verbatim Guide definition; Beta MCP result: same location.                                                                                         |
| In Gamma, the hands form a right angle.                       | Verbatim Guide definition; Gamma MCP result: 90 degrees.                                                                                           |
| Tap two grid points. You can use the same point twice.        | Placement interaction accepts repeated locations; Beta evidence above.                                                                             |
| Place the hands. See which position you make.                 | Implemented placement/classification interaction.                                                                                                  |
| Place both hands, then check your position.                   | Implemented explicit-check workflow.                                                                                                               |
| Keep the blue hand where it is. Move the red hand to {point}. | Guide: Blue = Left, Red = Right. Destination selected through canonical position lookup; exhaustively tested for every wrong answer on both grids. |
| You built {name}. / Yes, {name}. / Still {name}.              | Derived from actual canonical location pair, not an assumed orientation.                                                                           |
| The hands are already in those locations. Still {name}.       | Exact equality of before/after transform, plus canonical family derivation.                                                                        |
| Alpha, Beta, and Gamma on both grids.                         | Completion requires all six authored challenges.                                                                                                   |
| Keep exploring, or continue to Hand Motions.                  | Both actions implemented; next concept is hand-motions-intro.                                                                                      |

Other UI text names controls, modes, and measured progress: Explore, Your position, Your turn, With a reference, On your own, Practice complete, All six built, Build {name}, Diamond grid, Box grid, Try an example, Reference, Need a reminder?, Show reference, Move blue, Move red, Undo, Rotate, Mirror, Swap, Clear grid, Practice positions, Resume practice, Check position, Next position, Finish practice, Keep exploring, Continue to Hand Motions, Ready to check, Try again.

No claims that a position is easier, natural, or smoother. Timing vocabulary is not introduced here. Only construction challenges have answer concealment; exploration examples remain visible before selection.

## Earlier review context

The initial implementation was authorized by the autonomous audit-and-implement request. Austen subsequently tried it, approved the overall interaction pattern, and requested the clarity revision above. Keep the revised lesson BUILT pending its hands-on review.
