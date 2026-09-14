# Hand Positions UX audit, September 5, 2026

Scope: the shipped hand-positions experience, not a repository-wide code-quality grade.

## Canonical pictographs and anchored feedback, September 8

Austen accepted improved clarity but rejected the top-left glyph overlays,
board-only centering, misaligned example rail, unfamiliar action chrome, and
competing movement on success. This supersedes the glyph and success-motion
choices below; previous verification was not acceptance of those choices.

The lesson now supplies static Alpha/Beta/Gamma letters to the normal
PictographContainer/TKAGlyph renderer, including the live placement board.
No lesson-owned glyph positioning remains. The mode switch and instructions
center across the composition; square examples align with the board's top and
bottom edges. Narrow layouts put Next directly after the board, before examples.
Tablet panes use the rail from 42rem of available width. Full 4K uses a 1152px
board; the reported tall split pane retains the 896px board.

The actual workspace UndoButton and ClearSequenceButton are reused through
narrow, backward-compatible input extensions. Practice again uses PanelButton;
Next remains LessonStageControls, as in Grid. Placement, history, exact example
memory, selection, and grid rotation keep their existing owners. Success no
longer shrinks the board or hides guided references. Title/instruction swaps
crossfade in reserved space. Explicit disclosure and phase changes recompose
one workshop through createLayoutMotion instead of flying each child separately.
An incorrect answer highlights the corrective reference; independent practice
shows its corrective pictograph within the board without shifting the stage.

Verification: 34 focused tests pass, including all position-pair letter metadata;
Svelte check has zero errors/warnings. Browser testing exercised all six builds,
incorrect correction, exact example selection, grid switching, Clear, pointer
drag and Undo. Drag release remains at the destination with zero interpolation.
All seven CSS viewport tiers, the tall split pane and 640×450 zoom-equivalent
reflow were inspected. Mobile controls and landscape actions remain reachable;
reduced-motion controls settle immediately. Native touch and actual 200% browser
zoom remain unverified. This presentation is pending Austen's hands-on review.

## Integrated playground and background recovery, September 8

Austen accepted the drop correction, then rejected the family-only highlight,
padded example outlines, duplicate glyph/name label, and disconnected spacing.
The examples now retain the last complete pair per family and grid for this
lesson session. Clearing does not erase them. A highlighted example matches
both hand locations; selecting it restores that exact arrangement, including
either Gamma handedness. Practice progression remains independent of examples.

Canonical TKAWordGlyph art labels the board and examples inside their rectangles.
The existing selection.css full-perimeter treatment and hit target cover the
actual example pictograph, without an extra padded card or separate text button.
The narrower mode switch, quieter instruction, larger desktop artifact and
proportional example column compose the same existing workshop/stage owners.

The recurring gradient-only background has a reproduced package cause:
backgrounds 0.7.12 Cosmic.setQuality constructs new, uninitialized star and
nebula systems. Its star update path cannot seed these empty layers. BackgroundHost
now adapts the controller's quality-change event to its public forceRefresh API,
after the active frame completes. Adaptive quality and pause/suppression owners
remain intact; no polling, extra render loop, package mutation, or forced high
quality is introduced. A live singleton is also repaired when the host remounts.

Focused tests reproduce the real cosmic star loss/reseed and cover deferred,
coalesced recovery, disposal, non-cosmic exclusion, exact example memory,
placement history and existing practice transitions: 37 tests pass. The browser
exercise covers all six builds, incorrect-answer correction, Gamma recall,
clearing and grid switching. Final presentation remains pending hands-on review.
All seven CSS viewport tiers and the reported 1660×1540 pane were inspected;
the tall-pane board is about 896px wide with a proportional example column.
Phone and short landscape retain scroll access to editing and examples. The
final laptop and wider tiers keep the action/editing controls in the viewport.
Drag release still has zero prop interpolation and the selected preview matches
both hand locations. Reduced motion and a 640×450 zoom-equivalent reflow check
retain a 16px root and keyboard access (not an actual browser-zoom test).
The background remained painted after leaving the task tab and returning.

## Drop continuity and adjacent examples, September 8

Austen found that release replayed the move from the original point and that
the vertical-only composition wasted the available width. The shared renderer's
existing direct-positioning mode is now exposed through PictographContainer and
enabled during a location drag and its landing. Click-driven changes, Undo,
and Construct orientation/motion controls retain their existing interpolation.
No second gesture or prop renderer is introduced.

The lesson composes the board, its toolbar, Next, and editing controls beside
a compact column of the same canonical example pictographs when the available
container is at least 48rem wide. Columns size around the actual board, not an
empty flexible track. Examples and board respect available height. Narrow
containers stack; practice without references returns to a centered board.
The existing stage motion owns success and reference-disclosure recomposition.

Verification: all six practice rounds, incorrect-answer correction, completion,
both grid modes, overlapping hands, drag release and Undo were exercised in the
browser. Immediate post-release samples stay at the target with zero prop
transition duration; Undo restores normal interpolation. The 32 focused tests
pass and Svelte check reports zero errors and warnings. This continues the same
Teacher task, using the briefing inline; hands-on acceptance remains pending.
Seven viewport tiers (375×667 through 3840×2160) and the reported 1660×1540
pane were inspected with no horizontal overflow. A 640×450 zoom-equivalent
reflow check retains a 16px root and keyboard access; this is not an actual
browser-zoom test. Short screens scroll rather than shrinking touch targets.

## Drag feedback and unambiguous completion

Austen's next September 5 review found insufficient visual response during
dragging and mistook the completed progress line below Beta for selection.
This revision remains pending hands-on acceptance.

The existing PropPlacementGrid location-drag path now shows a hand-colored
pickup ring and shadow, legal destinations, an origin marker, and a contrasting
nearest-target ring linked to the moving hand. The canonical hand stays attached
to the pointer. Preview and commit share one nearest-point decision; release
commits once and briefly marks the landing. Escape, pointer cancellation, and
out-of-board release restore the original construction without adding history.
Reduced motion retains immediate hand/target feedback and suppresses the landing
animation. No new gesture owner, renderer, toolbar, or lesson layout is added;
orientation aiming remains separate. Completed practice no longer renders its
progress bar beneath the reference choices.

Browser checks on the task preview cover both hand colors, overlapping Beta
hands, pointer tracking, target preview, landing fade, Undo, Escape/outside
cancellation, all six rounds, and completion clear/rebuild. Seven CSS viewport
tiers from 375×667 through 3840×2160 plus the reported 1660×1540 pane show no
horizontal overflow. Phone and tall-pane held-drag states were inspected.
Reduced-motion inspection caught a global animation override; the landing
decoration is now explicitly hidden in that mode while static drag cues remain.
Native touch injection is unavailable; physical touch remains unverified.
The 32 focused placement/workshop tests pass using the repository Vitest config,
including preview/commit agreement, target-change haptics, and cancellation.

## Completion playground and direct dragging

Austen accepted the lower-control-load revision, then found that clearing and
rebuilding after completion stopped identifying the current position. He asked
for direct hand dragging and an immediate Box/Diamond choice on that page.

Completion now retains its Continue action and six completed builds while the
board keeps reporting Alpha, Beta, or Gamma. The existing grid-mode control sits
above the board; changing mode rotates the actual pair, including an incomplete
pair, instead of substituting an example. Matching examples share the current
mode, highlight the current relationship, and can load a new construction.
The separate Keep exploring gate is removed. This continues the same Teacher
pilot; the new revision remains pending hands-on acceptance.

Ownership stays with PropPlacementGrid and its placement/aim state. Location
dragging is opt-in, distinct from orientation aiming, and commits through the
existing placement/history owner only on release. The canonical rendered hand
follows the pointer; cancelled and out-of-board drags leave history unchanged.
Tap and keyboard editing remain available. Position labels use TKAWordGlyph and
Crossfade, references use PictographContainer, and mode choice uses the existing
SegmentedControl. No new renderer, persistence owner, or progression timer.

Verification: 31 focused tests pass, including grid-mode round trips, completion
retention after clearing, single-commit drag history, cancellation/reset/outside
release, and separation from orientation aiming. Browser checks cover all six
rounds, completion clear/rebuild, live classification, mouse drag tracking/drop,
undo, independently selecting both overlapping hands, reload, reduced-motion
editing, and keyboard editing. The Svelte check reports zero errors and warnings.
Seven CSS viewport
tiers from 375×667 to 3840×2160 show no horizontal overflow. Native touch-event
injection is unavailable in the in-app browser; physical touch remains unverified.

## Visual correction and lower control load

Austen liked the achievement/progression flow but could not recognize a wrong
answer quickly or retry without choosing another tool. He rejected repeated hand
identity and stage/count labels, the verbose correction, and noncanonical action
presentation. This supersedes those portions of the historical revisions below.

Practice retains the wrong construction, presents an explicit Try again cue at
the board, and renders a target pictograph with the learner's left hand held in
place. The right hand is already selected for correction; another point tap
rechecks the answer. Selecting a hand directly replaces the two Move buttons.
Undo reuses UndoGlyph, Clear reuses the workspace eraser icon, and progress is a
small native accessible bar. Next and the existing coordinated success response
remain directly below the board. Practice no longer repeats classification prose
or an Explore control (the lesson Back action still returns to exploration).

Ownership: the existing placement/aim state gains non-aiming direct selection;
orientation-aiming interactions retain their path. Workshop validation retains
wrong feedback during retry selection. Canonical grid derivation selects the
target pair and PictographContainer renders it. No new gesture/history/renderer
owner or timer. This is a continuation of the same Teacher pilot task, not a new
comparison trial. Hands-on acceptance remains pending.

Verification: 24 focused tests pass, including fixed-left targets on both grids,
wrong-feedback retention during retry, direct pointer/keyboard selection, and
undo history. All six browser rounds complete; wrong answers cannot advance,
same-point correction succeeds, and Clear returns to first-hand placement.
Seven CSS viewport tiers (375×667 through 3840×2160) plus 1660×1540 were visually
inspected with no horizontal overflow. Editing controls retain 44px targets;
short screens scroll. Reduced-motion correction and completion remain operable.
The broader concept composition suite has one pre-existing stale expectation
for literal hand-motion player props; the same failure was reproduced on main
and is outside this change. Initial Svelte check: zero errors and warnings.

## Achievement and progression revision

Austen rejected the automatic-confirmation presentation below: the centered heading, narrow grid, and wider left-aligned feedback did not form one composition, and success was repeated above and below the board. He approved a single activity column and asked for the Grid lesson's prominent Next and coordinated spatial response. A static checkmark plus a distant action is not an acceptable achievement state. This requirement was relayed to Agent Domain Architecture and incorporated in the Teacher briefing and achievement gate; it is not a claim about measured dopamine.

The shared `LessonStageControls` now supports an optional disabled action and focus reference, preserving existing defaults. Hand Positions reuses that large action directly below the board in practice, exploration, and completion. Successful practice changes the heading from Build Gamma to Gamma ✓ and removes both Yes, Gamma messages and the separate success paragraph. The board settles to 86% of its working size while its action and editing controls move with it through `createLayoutMotion`; Next expands the same mounted board into the next challenge. Shared Crossfade handles text replacement and reference disclosure. Editing and reference controls stay secondary and below progression. Guided references remain available and collapse after success unless explicitly opened. Free exploration keeps all examples inspectable.

Capability ledger: `PropPlacementGrid` retains pointer/keyboard placement, undo, and hand rendering; the workshop state retains validation and progress; `PictographContainer` and `TKAWordGlyph` retain reference/notation rendering; `LessonStageFrame` retains the shell; `LessonStageControls` is extended for disabled/focus state; `createLayoutMotion`, `motionDuration`, and Crossfade own movement. No lesson-local renderer, transition clock, or validation owner is introduced. Existing definitions and correction text are retained; the approved single-label success presentation replaces repeated prose.

Browser checks cover the seven viewport tiers plus the reported 1660×1540 pane. Phone Next is 240×51 CSS pixels and visible immediately below the board; short landscape scrolls the same ordered column. No horizontal overflow. Native animation inspection confirms board, action, and secondary controls use the same 280ms shared motion token; reduced motion produces immediate success with no layout animations. All six builds completed; keyboard placement and progression retain grid focus. Editing revokes confirmation; correction and same-point recommit remain supported. At 640×450 (200%-zoom reflow equivalent, not actual browser zoom), the root stays 16px and completion remains reachable. Focused validation tests: 30 passed. Svelte check: zero errors and warnings. The browser reload check caught an initialization-order defect in the added motion observer; it was corrected and the clean-load flow replayed before integration. Hands-on acceptance remains pending.

## Automatic confirmation follow-up

Austen reported that a correctly built Gamma still required an unnecessary Check position click. Practice now evaluates each completed, committed placement through the existing workshop state owner. Correct answers immediately show the existing “Yes, {name}.” confirmation, checkmark, and updated built count. Next remains deliberate so the learner can inspect the result. The Check position action and its obsolete instruction are removed; existing approved placement and editing prompts are reused.

Selecting a hand to edit invalidates confirmation until its placement is committed again, including when recommitting the same point. Incorrect answers retain the existing identification and one-hand correction. Incomplete placements and free exploration are not graded. Automatic confirmation preserves grid focus; Next still focuses the grid for the following round. No timer, shared-grid changes, or layout redesign.

Verification: 30 focused tests passed; Svelte check reported zero errors and warnings. Browser checks covered all six builds through deliberate completion, Gamma correction and same-point recommit, and immediate progress updates. Inspected wide, 375×667 phone, and 1660×1540 tall-pane layouts with no horizontal overflow. The new behavior remains BUILT pending hands-on review.

## Proportion correction after hands-on rejection

Austen rejected the September 5 alignment pass: the oversized grid still left a largely empty right rail. The earlier measurements below established fit, not appropriate proportions, and do not constitute approval of that composition.

The follow-up keeps the existing `PropPlacementGrid` input/state owner, `PanelButton` actions, `SegmentedControl` choices, `TKAWordGlyph` notation, `PictographContainer` examples, and `Crossfade` feedback. Only the positions lesson's composition changes. Phones and viewports at or below a 6:5 aspect ratio use one vertical flow: task, bounded square grid, hand controls, feedback, three visible references, optional exploration tools, and lesson navigation. Instructions align with the grid. Practice has no empty exploration-tools row. Landscape keeps two columns but caps the grid at 32rem instead of 58rem and sizes the whole band to its content. No new panels, renderers, motion system, or explanatory copy.

Browser evidence: all seven required viewport tiers inspected, plus 1800×1950 and the user's actual 1660×1540 pane. The latter uses a roughly 431px grid rather than a 928px grid, with feedback and references below instead of a vacant right rail. Phone/tablet/short landscape preserve all controls through scrolling; desktop navigation remains in view. No horizontal overflow. Checked empty placement, a correct Alpha answer, exploration, keyboard example selection, and rotation with reduced motion. A 640×450 reflow check retains controls and a 16px root; this is the 200%-zoom viewport equivalent, not an actual browser-zoom test. Focused lesson tests: 23 passed. Svelte check: zero errors and warnings. This remains BUILT pending hands-on review.

## September 5 hands-on clarity follow-up

Austen confirmed the spatial construction pattern, then reported unclear hand identity, an unclear way to build another position, ambiguous progression, and poor balance in a tall half-screen browser on a 4K monitor. Approval: “I'll take all of your recommendations for the layout and wording and fixes”.

The approved revision keeps `PropPlacementGrid` and its state/keyboard/history owners. Its optional `promptText` prop lets the lesson position its approved instructions outside the board without hiding content through consumer CSS. The existing shared `LessonStageFrame` workshop presentation now centers the complete authored group in surplus height and provides a full-width navigation region. Square/wide lesson layouts remain unchanged. `PanelButton`, `SegmentedControl`, `PictographContainer`, `TKAWordGlyph`, and `Crossfade` remain the presentation owners.

The hand controls say Move left hand / Move right hand, with a persistent left/blue and right/red key. Clear both hands belongs with editing. Next: Practice belongs in lesson navigation. The unexplained exploration counter is removed without adding a completion requirement. The references align with the top of the grid; the oversized reference spacer is removed. Phones put the live result immediately after the board, retain every edit action, and keep navigation in a sticky footer.

Geometry: the board retains a fixed square, instructions reserve two text lines, and the optional reference uses the existing animated-height Crossfade. There are no decorative panels, custom pictographs, edge accents, or viewport-driven control magnification. The native wide composition uses a broader content band; a tall pane centers the whole lesson, not the reference column independently.

Focused checks: 34 tests passed across the lesson, placement state/view-model, canonical ownership, and decomposition contracts; Svelte check has zero errors and zero warnings.

Direct browser verification on the task-owned preview covered all seven CSS viewport tiers (375×667, 960×412, 820×1180, 1440×900, 1920×1080, 2560×1440, 3840×2160), plus the reported tall-pane shape at 1800×1950. No horizontal overflow. At 1440×900, exploration navigation ends at y=881 and the lesson has no vertical overflow. At 1800×1950, the grid and feedback both begin at y=601; the whole authored group runs from y=397 to y=1665, distributing surplus space above and below. The phone stacks feedback immediately after the grid, with all edit controls and references reachable above the sticky navigation; grid targets measure 46.7 CSS pixels. Browser inspection also caught and corrected low-contrast blue legend text, an underspaced key, and desktop navigation falling below the viewport.

Replayed Gamma construction, moving a hand, clearing both hands, entering practice, a wrong Beta answer corrected into Alpha without clearing, and all six rounds through completion. Correct-answer focus reaches Next, the next round focuses the grid, and completion focuses Continue to Hand Motions. The optional reference remains available in independent practice. Reduced-motion emulation retains these results. At 640×450, the 200%-zoom reflow equivalent, navigation remains reachable with no horizontal overflow; actual browser zoom was not tested. No primary dev server or other task's preview was restarted or stopped.

## Adversarial findings

The baseline browser shows a static Alpha pictograph with a Next button, then Beta, Gamma, and a comparison. A learner can reach Finish without placing either hand. The source's Review mode ignores the selected review presentation. Exploration is three clicks deep, and its 8/16-cell discovery tray records transformations rather than checking whether someone can construct a relationship. Timing synonyms add a second vocabulary before timing is taught. The entire application region intercepts arrow keys, including keys originating from child controls. On narrow layouts the comparison captions fall below the project's text-size floor.

| Interaction principle        | Baseline                                           | Redesign                                                                               |
| ---------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Hands on in five seconds     | Next is the only first-screen action.              | Live placement grid on entry.                                                          |
| Discovery before instruction | Names and definitions precede action.              | Actual placement determines the displayed name; examples are optional.                 |
| Mistakes teach               | No construction check exists in the live lesson.   | Keep the wrong placement, identify it, and give a valid one-hand correction. No timer. |
| Meaningful transformations   | Rotate/mirror/swap in a hidden playground.         | Keep transforms beside the editable board; canonical prop renderer owns motion.        |
| Difficulty ramp              | Three explanations, then optional transformations. | Three guided diamond builds followed by three box builds with optional reference.      |
| Restrained celebration       | Discovery counters reward button presses.          | A checkmark follows a checked construction; completion follows six. No interruptions.  |
| Spatial interaction          | Only transformations of preselected positions.     | Place and move each hand using the shared spatial interaction.                         |
| Earn complexity              | TKA and timing names presented together.           | Positions only; grid choice explicit; independent practice follows guided practice.    |

## Capability ownership ledger

| Capability / searches                    | Owner                                               | Current consumer           | Decision                                                                         |
| ---------------------------------------- | --------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------- |
| placement, onPlacementComplete, moveProp | PropPlacementGrid and its placement/aim state       | BuildStartPosition         | Compose unchanged, with external PanelButton move/undo controls.                 |
| position, location pair, grid derivation | grid-position-deriver                               | StartPositionDeriver       | Reuse; no lesson-local geometry classifier.                                      |
| rotateLocation, mirrorLocation, swapped  | rotation-helpers / mirror-vertical                  | motion-transforms          | Reuse canonical transforms.                                                      |
| pictograph, hand, preview                | PictographContainer / prop-placement-view-model     | PropPlacementGrid          | Reuse production render and hand identities.                                     |
| choice, selected, radiogroup             | SegmentedControl                                    | TimingDirectionIntro       | Reuse for grid mode; canonical PanelButton for actions.                          |
| heading, stage, controls                 | LessonStageFrame / LessonStageHeading               | GridConceptExperience      | Keep stage ownership; allow lesson scrolling and board/reference composition.    |
| phase, persistence, quiz                 | positions-experience-state / experience-persistence | legacy positions exercises | Extend state owner with the new self-paced workshop; isolate checkpoint version. |
| glyph, word identity                     | TKAWordGlyph                                        | Choreo Card headers        | Reuse glyph renderer, no raw notation text.                                      |

Visual contract: pictographs own their rectangles, with no second decorative card. All three examples remain inspectable before selection. The selected example's control has a full outline and aria-pressed. Wide/tablet use a board and reference band; phones stack the same capabilities, retaining target sizes through scrolling. Short screens scroll rather than compressing the board. Feedback reserves a text region. Shared prop motion and Crossfade own visual changes. Reduced motion reaches the same state.

## Verification

Passed 23 focused tests covering every same-grid location pair, transform invariance, valid one-hand corrections, invalid checkpoints, guarded progression, resumed rounds, review isolation, and exploration after completion. Svelte check: zero errors and zero warnings.

Direct browser verification completed all six rounds, including a deliberately wrong Beta answer to an Alpha challenge, correction without clearing, keyboard placement, an optional reference, and reload into round five with four rounds retained. Check focuses Next; advancing focuses the placement grid; completion focuses Continue. Keep exploring retains the Continue action.

Inspected all seven CSS viewport tiers: 375×667, 960×412, 820×1180, 1440×900, 1920×1080, 2560×1440, and 3840×2160. No horizontal overflow. Phone targets measured 51 CSS pixels; short-landscape targets 49. Phone references and controls remain reachable by scrolling. The shared frame has an opt-in natural-height workshop variant; existing square/wide consumers retain their sizing. Tablet board height is capped by its width so the prompt and controls do not drift away from the grid.

At a 640×450 CSS viewport (the reflow equivalent of a 1280×900 surface at 200%), controls remained reachable without horizontal overflow. This is a reflow check, not a claim of testing the browser's actual zoom setting. Reduced-motion emulation retained the correct classification after rotation, with prop transitions reduced to 0.00001 seconds.

The lesson remains BUILT until Austen's hands-on approval. No deployment or external-account mutation is included.
