# Learn lesson quality review — October 14, 2026

## Decision

Withdraw **Staff Placements** and **TKA 1: Learning Letters** from the public lesson registry. Keep the other ten available. Preserve the withdrawn implementations, curriculum entries, written Guide pages, and saved progress for rebuilding.

The strongest lessons make a relationship visible and let the learner change it. The weaker ones present a sequence of screens and call reaching the end completion. These are different experiences even when both use attractive graphics.

Start the next improvement pass with **Hand Placements**: its construction exercise is already worthwhile, it immediately follows Grid, and clearer correction feedback would strengthen the beginning of the journey. Give **Type 1's mobile containment** a small, separate repair. Then rework **Dual-Shifts and Gamma** together around a distinct learning task.

## Review basis

- **Audience/task:** a newcomer learning to read and make TKA, including on a phone. A useful lesson shows the current idea, makes the next action clear, and keeps the artifact and its feedback together.
- **Owner preferences:** Austen explicitly values Grid and Timing & Direction, dislikes Staff Placements, wants Staff removed, and wants a cohesive journey using established primitives. These are owner preferences, not claims of universal taste.
- **Method:** direct browser interaction with all twelve published lessons, plus a separate source review. Visual judgments are the primary reviewer's observations; the source reviewer did not independently evaluate screenshots. No redesign was performed in this pass.
- **Rubric:** VR-1 (2026-09-21); research ledger checked, last review 2026-09-21; reviewer calibration **not calibrated**. No numerical quality score or claim to detect AI authorship.
- **Environment:** existing local development server, anonymous `https://[::1]:5173` origin, with separate browser-local progress. Austen's signed-in lesson progress was not used for the exercises.
- **Evidence:** desktop 1440×900 and phone 390×844 for every lesson; additional Hand Motions tablet 768×1024, Type 1 landscape 844×390, and Timing & Direction narrow-phone 320×568 checks. Screenshot files are in the local `.artifacts/learn-quality/` directory. This is an inventory review with representative states, not certification of every state at every device size.

## Comparison of all twelve

“Keep” means retain public availability; it does not mean defect-free or owner-approved. “Upgrade” identifies the next investment while retaining availability. References do not need an artificial quiz merely to qualify as useful.

| Lesson                        | Feel and ease                                                                                                                                                               | Device evidence                                                                                                                                                                          | Primitive use                                                                                              | Decision                                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **The Grid**                  | Coherent, restrained, satisfying transformation. One visual idea develops into the next; little explanatory overhead.                                                       | Clear desktop stage. Phone split-grid phases make labels and boards small while leaving sizable vertical gaps.                                                                           | Shared lesson frame/controls, grid display and merge animation.                                            | **Keep — benchmark.** Tune the split-grid phone proportions later.                                                     |
| **Hand Placements**           | One of the best learning tasks: place hands, see the relationship, correct the actual arrangement. Toolbars and references compete with the main task.                      | Desktop reference sits beside the board; phone shows the current reference above it. Visible wrong-answer guidance is much weaker than the screen-reader message.                        | Canonical `PropPlacementGrid`, `PictographContainer`, shared frame/controls.                               | **Upgrade first.** Preserve the exercise; simplify control hierarchy and show the useful correction beside the board.  |
| **Hand Motions**              | Strong discovery payoff: move a hand, learn its name, then combine two motions. The merged diagram makes the result tangible.                                               | Opening phone diagram is dense. Tablet paired-motion result is clear and generously sized.                                                                                               | `HandCombinationBoard`, shared lesson frame/controls and transitions; substantial local interaction logic. | **Keep — strong.** Refine the dense opening, rather than replacing the discovery sequence.                             |
| **Timing & Direction**        | Strongest controlled comparison. Choosing rhythms, reversing direction and focusing a pair all change a meaningful visual relationship.                                     | At 390×844 the examples and focused mode remain legible; desktop uses width well. At 320×568, the constrained board crops the overview and focused player into a short scrolling window. | Shared frame/controls, synchronized timing board, canonical animation player.                              | **Keep — benchmark.** Reuse its comparison grammar; fix the short-screen board before claiming universal phone fit.    |
| **Reading a Choreo Card**     | Quiet, useful guided reference. The spotlight explains the real artifact directly.                                                                                          | Desktop artifact and example chooser work well. On phone, six example choices occupy space before the card and push Next below the initial view.                                         | `CardAnatomyExplainer`, `SegmentedControl`, shared lesson frame/controls.                                  | **Keep as reference.** Reduce the prominence of optional example switching on phone.                                   |
| **Rotation Direction**        | Attractive desktop presentation, real examples, and specific corrective feedback. More reading and recognition than direct exploration.                                     | Phone question, pictograph, replay, choices and feedback form a long stack; comparison requires scrolling.                                                                               | Canonical `LessonPictographStage`; custom layout and quiz controls.                                        | **Upgrade.** Keep the correct-answer gate and examples; tighten the phone task and share navigation/answer primitives. |
| **Dual-Shifts: Alpha & Beta** | Visually clean but thin as a standalone lesson: four animations, Next, recap. Its distinct purpose after Timing & Direction is unclear.                                     | Phone fits the core stage; desktop gives a very large area to one animation. Separate example and lesson counters disagree in total.                                                     | Shared `TimingDirectionExperience`, canonical hand/animation players; local shell.                         | **Upgrade with Gamma.** Establish what the learner should do here that they have not already done.                     |
| **Gamma Motions**             | Same clean but passive template as Dual-Shifts, with only two examples before a completion recap.                                                                           | Phone is legible, but large gaps separate property labels, animation and controls. Two progress systems again.                                                                           | Same shared foundation template and player as Dual-Shifts.                                                 | **Upgrade with Dual-Shifts.** Add a purposeful quarter-relationship comparison or construction task.                   |
| **Staff Placements**          | Visually disconnected: small custom neon diagram, large explanatory panels and preset cycling. Wrong answers advance automatically.                                         | Small diagram does not justify the desktop space; long phone sequence. The overall treatment differs sharply from stronger lessons.                                                      | Parallel SVG staff/grid renderer plus local page/button systems, instead of canonical rendering owners.    | **Withdraw now.** Rebuild before returning it to the public path.                                                      |
| **Pictograph Anatomy**        | Clear artifact spotlight with concise region labels. Useful as an illustrated reference; seven Next presses do not establish reading skill.                                 | Phone keeps the artifact readable. Desktop uses a very large pictograph beside sparse explanation.                                                                                       | Canonical `PictographContainer`, `ArtifactRegionSpotlight`, shared controls.                               | **Keep as reference.** No urgent rebuild; modest sizing refinement and a later application task if needed.             |
| **Type 1: ABC & GHI**         | Strong desktop comparison of letter families. Wrong answers describe the selected letter and the target, and permit correction. Some prose exposes implementation language. | Phone diagram appears before the explanatory/selection area; nested scrolling separates them. Progress overlaps text/feedback. Landscape recap has the same overlay concern.             | Real mapped pictographs and `LessonPictographStage`; local layout/answer controls.                         | **Keep, repair mobile next.** Preserve its useful recognition task and comparison structure.                           |
| **TKA 1: Learning Letters**   | Canonical animation/card pairing has promise, but the published lesson is visibly unfinished. All six examples have missing video and explanatory notes.                    | Large empty video pane dominates desktop. Phone stacks media in a constrained scrolling region, separating animation, card and notes.                                                    | Canonical `InlineAnimationPlayer`, `ChoreoCard`, `TKAWordGlyph`, `PanelGroup`, shared lesson controls.     | **Withdraw now.** Content readiness and mobile composition must precede republication.                                 |

## Findings that determine the decisions

### Staff: rebuild the interaction and renderer

The intro, thumb-orientation, pro-spin and anti-spin pages were inspected. Cycling presets changes the example, but it is not the direct spatial exploration seen in Hand Placements. The desktop first impression is a small diagram surrounded by explanation and unused lateral space (`staff-desktop.jpg`).

In the quiz, choosing Anti for a question whose answer was Pro showed a correction, then advanced automatically to the next question. Source confirms the 1.5-second delay and that every score can reach Finish. The learner cannot stay with the mistake and repair it. The coordinator saves the page; quiz answers are not restored after refresh.

Sources: [visualizer](../../src/lib/features/learn/components/interactive/staff/StaffPlacementVisualizer.svelte), [quiz](../../src/lib/features/learn/components/interactive/staff/StaffIdentificationQuiz.svelte), [completion](../../src/lib/features/learn/components/interactive/staff/staff-quiz/StaffQuizCompleteSection.svelte), [coordinator](../../src/lib/features/learn/components/interactive/staff/StaffConceptExperience.svelte).

The visualizer also exposes an interactive callback that its click handler does not call. No current page enables that mode, so this is a dormant contract defect, **not** evidence that an active live drag interaction failed.

Republication criteria: canonical staff/pictograph rendering; one meaningful placement or rotation action; mistake preserved with visible guidance; explicit learner-controlled advancement; phone artifact and action visible together; coherent saved checkpoint behavior.

### Words: canonical primitives cannot compensate for missing teaching content

All six A/B/C/G/H/I word stages displayed **“Video coming soon”** and **“Explanation coming soon.”** The placeholder occupies an entire desktop media column (`words-desktop.jpg`). On phone the media live inside a constrained stack, while navigation and notes are separated from the card (`words-stage-phone.jpg`).

The actual animation and choreo cards render. This is not a broken-data diagnosis. The problem is a published teaching surface devoting major space to absent content, then allowing the learner to reach its recap.

Sources: [word coordinator](../../src/lib/features/learn/components/interactive/words/WordsConceptExperience.svelte), [media stage](../../src/lib/features/learn/components/interactive/words/LearningWordStage.svelte).

Republication criteria: each required teaching slot contains usable material; optional absent media consumes no primary teaching space; animation and notation can be compared on a phone; a clear task accompanies the example; intro, six examples and recap receive an end-to-end review.

### Hand Placements: the foundation worth improving first

Building North/East when asked for Alpha retained the Gamma arrangement and allowed correction. Choosing South then produced the correct Alpha state and enabled progression. That is a valuable learning loop.

However, the detailed corrective sentence is in an `sr-only` live region. The visible presentation relies on **Try Again** and the outlined reference. Give sighted learners the same useful direction without hiding the board or replacing their work (`placements-feedback.jpg`, `placements-phone-feedback.jpg`). Keep Undo/Clear accessible, but subordinate optional references and transformations.

Sources: [experience, especially live feedback and reference markup](../../src/lib/features/learn/components/interactive/placements/PlacementsConceptExperience.svelte), [construction state](../../src/lib/features/learn/components/interactive/placements/placement-experience-state.svelte.ts).

Persistence boundary: the saved checkpoint retains phase/round, not the exact unfinished hand coordinates. A redesign should explicitly decide the desired resume behavior rather than promise more than is saved.

### Type 1: a contained mobile repair

Desktop has a clear two-column relationship between letter choices and the real pictograph (`type1-desktop.jpg`). Selecting I changed the artifact to I. Choosing A for the hybrid-in-alpha question produced an explanation, stayed on the question, and required C before proceeding. All three checks and the final letter map were visited.

On phone, the progress pill crossed introductory text and feedback; the landscape recap also placed it over table content (`type1-phone.jpg`, `type1-phone-feedback.jpg`, `type1-landscape.jpg`). DOM inspection found both the experience and its containing detail region using constrained scrolling. Repair that containment and progress placement before redesigning the teaching mechanic.

Some visible copy talks about “canonical pictographs” and “source of truth.” Those are implementation concerns; a future copy pass should describe what the learner can see or do. This review does not rewrite educational copy.

Source: [Type 1 experience](../../src/lib/features/learn/components/interactive/letters/type1/Type1ConceptExperience.svelte).

### Dual-Shifts and Gamma: decide the learning purpose together

These are two wrappers around the same template, so one coherent improvement can serve both. Four dual-shift examples and two quarter examples lead directly to recaps. No construction or diagnosis is required. Their content overlaps the much stronger Timing & Direction comparison.

The display also presents an example counter and a different overall step count, such as **1 of 4** alongside **1/5**. That recreates the numbering confusion Austen already rejected (`dual-phone.jpg`, `gamma-phone-top.jpg`).

Keep the working canonical players. Either integrate these examples into a purposeful continuation of Timing & Direction, or give each a distinct task. Do not add another navigation menu to justify separate lesson pages.

Source: [shared foundation template](../../src/lib/features/learn/components/interactive/foundations/TimingDirectionExperience.svelte).

## Shared quality standard

| Dimension                   | Assessment                                                          | Evidence and consequence                                                                                                             | Bounded next action                                                                                                  |
| --------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Project specificity         | **Supported** in most lessons; **concern** in Staff                 | Real grids, pictographs and movement comparisons carry the product. Staff's independent diagram grammar breaks continuity.           | Retain canonical artifacts; replace Staff's parallel renderer when rebuilding.                                       |
| Hierarchy                   | **Supported** in Grid/Timing; **concern** in Words and Type 1 phone | One idea and one action work well. Empty media panes and overlaid progress compete with the task.                                    | Withdraw unfinished Words; contain progress and scrolling in Type 1.                                                 |
| Grouping and spacing        | **Concern**, uneven                                                 | Dual/Gamma gaps separate labels and action; Cards' phone example chooser precedes the important artifact.                            | Group the current artifact, action and feedback; demote optional exploration.                                        |
| Real evidence and artifacts | **Supported** except unfinished Words media                         | Real notation appears throughout the retained lessons. Words promises unavailable demonstration/explanation.                         | Require populated teaching material before republication.                                                            |
| Craft                       | **Concern**, specific                                               | Type 1 progress overlap; small phone split-grid labels; Staff auto-advance; visible Placements correction lacks the useful sentence. | Fix those observed states, preserving working learning interactions.                                                 |
| Product continuity          | **Concern**                                                         | Shared artifacts are common, but navigation, quiz controls, spacing and progress have several owners.                                | Reuse shared lesson controls/frame where appropriate; avoid a generic shell that prevents task-specific composition. |

Hard requirements with observed concerns: Staff's parallel rendering ownership; unfinished public Words content; Type 1's phone containment; and useful visible feedback in Placements. Full keyboard, screen-reader, reduced-motion, physical-touch, and cross-device persistence behavior remain **unassessed** in this pass. Source presence alone is not a pass.

## Upgrade sequence

1. **Hand Placements:** make corrective feedback visible and local; prioritize the board and next action. Keep Grid → reading → placement practice coherent. Acceptance: a wrong arrangement stays editable, the visible message explains the useful next move, and correction/progression work on phone and desktop.
2. **Type 1 mobile repair:** one intentional scrolling region and progress in normal layout; keep question, relevant artifact, choices and feedback close. Recheck phone portrait and landscape plus desktop.
3. **Dual-Shifts + Gamma:** establish a distinct learning action and remove conflicting counters. Prefer extending the strong comparison vocabulary of Timing & Direction.
4. **Rotation Direction:** improve phone composition and common control behavior; consider direct manipulation only if it makes the relationship easier to understand.
5. **Staff rebuild and Words completion:** remain withdrawn until their specific republication criteria above pass. These are larger pieces of work, not the fastest first improvements.

Cards and Anatomy remain useful references. Grid, Hand Motions and Timing & Direction should receive focused refinements only where observed issues justify them.

The extra 320×568 check found a limitation even in the Timing & Direction benchmark: the board becomes a short inner scrolling window, cropping both the overview and focused view (`timing-narrow-phone.jpg`, `timing-narrow-focus.jpg`). Include short screens in the shared stage-sizing refinement. A benchmark can have a strong teaching interaction and still need responsive work.

## Coverage and limits

| Lesson                | Browser interactions reviewed                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Grid                  | Grid modes, diamond/box labeling, merged eight-point grid and center-point phase; not every terminal subphase.                     |
| Hand Placements       | Discovery; first practice task; wrong Gamma arrangement for Alpha; correction and progression.                                     |
| Hand Motions          | Opening map; discovery of shift/dash/static; paired-hand hint and one successful dual-shift combination; not all six combinations. |
| Timing & Direction    | All four stages: placements/transform, rhythms, direction/reversal, six-mode overview and focused comparison.                      |
| Reading a Choreo Card | All three spotlight stages and example chooser; QR not scanned.                                                                    |
| Rotation Direction    | Pro/anti selection; first quiz question wrong and corrected; remaining questions not exhaustively exercised.                       |
| Dual-Shifts           | All four mode pages and recap.                                                                                                     |
| Gamma                 | Both mode pages and recap.                                                                                                         |
| Staff                 | Intro, thumb examples, pro/anti pages, first wrong quiz response and automatic advancement; not every quiz question.               |
| Anatomy               | All seven spotlight stages.                                                                                                        |
| Type 1                | Alpha/beta selection, wrong/correct response, all three checks and final letter map.                                               |
| Words                 | Intro, all six examples, missing media/notes, recap.                                                                               |

Screenshots capture representative states, sometimes after an interaction scrolls the viewport. Missing content in a cropped frame was not treated as absent from the lesson. Device findings describe the inspected layouts, not universal device support. No claim about actual newcomer comprehension, physical performance, or measured learning outcomes is made.

## Implementation in this review

The public experience registry removes `staff-placements` and `words-alpha-beta`. Direct public lesson routes now reject unavailable experiences with 404, so a saved URL cannot bypass withdrawal. Availability-based discovery, resume/next selection and Guide launch links use that registry. Written Guide content and source implementations remain intact.

Focused tests cover the ten published IDs, both withdrawn IDs, prerender entries, direct-route rejection and retained curriculum/Guide records. Existing progress/persistence tests were also exercised. This is a local code change; production removal requires a separately authorized release.
