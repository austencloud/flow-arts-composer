# Unified Learn and Atlas - Handoff (2026-08-28)

## First journey implemented, October 14, 2026

The course entry now offers one current lesson and its next topic. **Browse topics** reveals the existing catalog; the optional map precedes the catalog, and a place link opens and scrolls to its selected place.

Grid and Hand Placements now open their existing Guide topic inside the lesson. **Back to lesson** and Escape return to the mounted interaction. Placement practice pauses its success timer during reading. Continuing from Grid preserves both its final step and any saved Hand Placements round. Hand Placements ends with one continuation to Hand Motions.

### Composition and ownership

The selected composition keeps the lesson artifact central and opens reading on demand. An always-visible reading column would crowd the phone grid. The entry similarly prioritizes the current lesson, with the catalog available through a disclosure.

- Course entry: existing `ConceptPathView`, `HeroConceptCard`, `PanelButton`, and `ConceptLevelMap`.
- Lesson and practice: existing `LessonStageFrame`, `LessonStageControls`, `PropPlacementGrid`, and `PictographContainer`.
- Reading: `ConceptTopicReading` composes `BaseModal` and the existing `GridTopicPage` / `PlacementsTopicPage`; those pages remain the source of instructional copy and diagrams.
- Continuity: existing experience persistence and placement workshop state. Opening reading keeps the interaction mounted; no parallel progress model was added.

### Verification and bounds

Browser checks exercised Grid steps, reading and Escape return, reload at the saved step, direct continuation to Hand Placements, preservation of a later practice round, reading during the success hold, all six placements, and continuation to Hand Motions. Entry and reading layouts were inspected at 375×667, 960×412, 820×1180, 1440×900, 1920×1080, 2560×1440, and 3840×2160. Topic disclosure and the selected-place link were also checked on a phone viewport.

An independent VR-1 review found the hierarchy and product continuity supported. Its phone practice concern prompted a correction: only the current target appears beside the instruction above the board during practice; free play retains the three examples. A second phone/desktop inspection found that concern resolved with no new material visual issue. The research ledger was current (September 21). Reviewer calibration remains **NOT CALIBRATED**; this is agent inspection, not learner testing or human acceptance of the teaching experience.

The focused workshop, Grid state, and experience registry suites passed all 53 tests. Changed styles passed stylelint. Browser consoles reported no warnings or errors on the checked entry/map and practice routes.

This delivery covers the first two lessons. Printing, remaining lesson-to-reference mappings, and exact-step sync across devices remain separate work. Grid and Hand Placements retain their existing human-review status.

## Recovery pass, October 13, 2026

Austen requested reliable lesson exit, truthful resume, and progress that survives device sync. He also requested a cohesive approach across lessons, the Guide, quiz/practice, and printable material, with fewer competing numbers and choices. The implementation in this pass covers the three reliability problems and removes the misleading lesson ordinal and whole-level completion claims. The product changes below are the proposed next slice.

### What exists now

| Surface                | Current owner and role                                                                                | Connection to repair                                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Interactive lessons    | [Course](../../../src/lib/features/learn/components/ConceptPathView.svelte), 12 published experiences | Resume and next action should lead; the full catalog is optional browsing.                                                                |
| Written Guide          | [Guide hub](<../../../src/routes/(public)/guide/+page.svelte>), published topic pages                 | Open the relevant explanation from the current lesson, preserving the return destination.                                                 |
| Printable pages / PDFs | Existing Guide manifests and reader                                                                   | Offer printing from the same topic so a learner need not discover a separate curriculum.                                                  |
| Quiz / Play            | [PlayHub](../../../src/lib/features/learn/play/components/PlayHub.svelte) and game registry           | Recommend a relevant practice activity only when its concept mapping is supported. Current quiz attribution still uses a coarse fallback. |
| Course map             | [Concept-place registry](../../../src/lib/features/learn/domain/concept-place-registry.ts)            | The collapsible map sits below all 12 lesson cards. Seven lessons are attached to places; five published lessons have no binding.         |
| Public Atlas           | [Atlas route](<../../../src/routes/(public)/atlas/+page.svelte>)                                      | Development shows the map; production currently shows Coming Soon. Do not promise it as a finished destination.                           |

These are observations of the October 13 source. Earlier verification entries below are historical snapshots.

### Delivery order

1. **Protect continuity.** Header Back leaves the lesson immediately. Internal Previous changes steps. Resume follows the latest visited unfinished lesson. Sync combines independent completions, respects a deliberate reset, and reports a failed save.
2. **Make the beginner entry coherent.** Refine the existing course route around one start/continue action. Keep topic browsing available without requiring it for the first interaction. The useful context is the current topic and next action; registry IDs and competing course ordinals should stay out of the beginner presentation.
3. **Prove one complete learning loop.** Use Grid and Hand Placements: enter a lesson, interact, read its corresponding Guide explanation, return to the same step, complete it, and continue. Attach a practice activity only when it exercises that topic. Keep independent Guide and Play browsing available for people who came looking for them.
4. **Extend the proven relationship.** Reconcile all 12 published lessons with the canonical concept graph and truthful coverage labels, then apply the same return and progress rules across the remaining topics. Keep official TKA level meaning intact. Completing currently published lessons must not claim mastery or completion of the whole TKA level.

### Proposed first screen and behavior

The existing Learn entry should offer **Start learning** for a new learner or **Continue [topic]** for a returning learner. That action opens the interaction directly. A secondary **Browse topics** path holds the full course overview. Reading, printing, and relevant practice appear beside the topic they help with.

The course overview should use readable topic names, show actual completion, and bring a linked selection into view. One concept may have several activities; activity completion and concept understanding remain distinct. Official levels belong where they explain the material's scope. A local lesson counter must count the actual lesson sequence, never the concept-place graph.

This is a proposal for the next design pass, not a claim that the entry screen, map, or practice mapping has been rebuilt by the reliability patch. Any change to teaching content still follows the existing concept and copy approval process.

### Acceptance for the next slice

- A new learner reaches a meaningful interaction through one clear action.
- A returning learner recognizes the saved topic and resumes the same step.
- Guide and print access preserve the originating topic and return destination.
- Practice names the skill it exercises and requires an explicit start.
- The learner never has to interpret internal IDs to choose the next action.
- Topic links bring their selected item into view on a phone.
- A completion message states exactly what was completed and offers one useful next action.

### Persistence scope

The reliability patch synchronizes lesson completion and progress records. Internal lesson steps still belong to the existing browser-local experience persistence owner. Cross-device step-by-step continuation is a separate implementation task and must not be advertised as delivered here. Concurrent attempts on the same lesson use conservative cumulative maxima because the current records have no individual attempt IDs; exact combined attempt history requires a different data model.

### Display ownership for this pass

The label search (`learn_motion_curriculum_label`, `getConceptPlacesByLevel`, and `learn_ui_level_complete`) found the wrong course ordinals in Hand Motions and Timing and Direction. Their existing `LessonStageHeading` remains the display owner; the shared i18n owner supplies the existing `learn_ui_level_one` label, also used by `GuideTab`. This is reuse. The map-place count is rejected as a lesson ordinal because several lessons share a place. This correction changes text only: the existing lesson components continue to own rendering, inspectable choices, and phone, tablet, tall, and wide composition.

## Mission

Unify Interactive Lessons, Play, the written Guide, the Kinetic Atlas, the
Letter Codex, TIKA, and Composer handoffs around one concept graph. The Atlas is
the bird's-eye map of the same journey the lessons teach. The governing design
is [`active/2026-08-28-unified-learn-atlas-design.md`](active/2026-08-28-unified-learn-atlas-design.md).

## Done - verified

- The governing design is committed in `b2cb81c741`. It defines the Atlas as
  the bird's-eye map, lessons as the guided journey, one concept-place contract,
  official TKA level vocabulary, and human confirmation gates.
- Game-local progression was renamed from levels to challenges in
  `6edf5e581c`. Current games are explicitly `unclassified` against TKA levels;
  legacy local and Firestore progress still migrates without data loss.
- The first official Level 1 concept map was implemented in `69c34007ec`.
  Stable `?place=1.x` routes select official knowledge-graph nodes and compose
  the real lesson, Guide, Letter Atlas, and Composer owners where evidence
  exists. Unmapped and partial places say so instead of inventing coverage.
- The public Atlas landing now renders that same official Level 1 concept map.
  The arbitrary six-region glossary board and its hand-written decorative SVGs
  were removed. Search temporarily yields the canvas to matching terms, then
  restores the selected concept place when cleared. Live verification covered
  the required compact, tablet, desktop, 4K, and 200% layouts with no page-width
  overflow. Selection, reload, Back/Forward, the Letter Atlas handoff, and the
  `type1-abc-ghi` lesson handoff all preserve the canonical `?place=1.5` state.
- Focused verification is green: six test files, 49 tests, plus
  `svelte-check` with 0 errors and 0 warnings. Source-copy tests also guard
  against reintroducing game-local Level labels.
- The three implementation commits were merged into `main` as `38bdf03b22`
  without changing Austen's existing `pnpm-lock.yaml` edit.
- The broken primary dependency install was repaired from the existing frozen
  lock without changing its hash: `@ai-sdk/svelte@4.0.70` and `zod@4.3.6` now
  resolve correctly from a fresh Node process.
- The first live Atlas correction is committed in `7c8d41a42f`. The Level 1
  concepts now read as one connected route, including the truthful 1.5/1.6
  prerequisite branch, instead of eight generic cards. The selected 1.1 place
  uses the real shared Diamond and Box grid renderer. Compact layouts use a
  scrollable stop rail; the public landing uses normal page flow instead of a
  viewport-height inner scroller.
- The Atlas-to-lesson return contract is verified in `7c8d41a42f`: selecting
  1.5 produced `?place=1.5`, opening its lesson produced
  `/learn/concepts/type1-abc-ghi?place=1.5`, and Back plus reload both returned
  to the Atlas with 1.5 selected. Type 1, Motions, and Positions now return to
  the Atlas when their internal lesson navigation is already at the first step.
- Follow-up verification for `7c8d41a42f` is green: `svelte-check` reported 0
  errors and 0 warnings; the focused concept-place suite passed 6/6; live
  in-app browser checks covered 375x667, 960x412, 820x1180, 1440x900,
  1920x1080, 2560x1440, and 3840x2160 with no page-width overflow and no
  console errors. The only console messages were the expected local PostHog
  no-key warnings.
- Level 1.4 Rotation Direction is implemented in `8e946a002f`. It uses the
  canonical A/B pair to compare pro and anti on the same hand paths, lets the
  learner switch relationships immediately, checks both directions, and keeps
  base rotation distinct from additional turns. Wide canvases reveal both real
  pictographs together; narrower layouts preserve the focused selector-first
  flow.
- The explicit Atlas route now outranks saved lesson progress. A direct
  `/learn/concepts?place=1.4` link stays on the Atlas with 1.4 selected instead
  of being hijacked by an old persisted lesson. The route was also opened in a
  fresh tab with existing saved progress and resolved to the same place.
- Verification for `8e946a002f` is green after rebasing onto the current
  `main`: four focused files passed 23/23 tests, and `svelte-check` reported 0
  errors and 0 warnings. Live checks covered 375x667, 960x412, 820x1180,
  1440x900, 1920x1080, 2560x1440, and 3840x2160. There was no horizontal
  overflow, the root remained 16px at compact and 4K widths, and the console
  reported no errors.
- The landing hierarchy and responsive composition were corrected in
  `8cd3cfa4b1`. The course introduction and current lesson now form one launch
  zone, Continue is the only saturated primary action, and the Guide plus
  selected Atlas resources remain available without competing for the first
  click. The current lesson category no longer collapses into a thin sliver.
- The Atlas detail layout in `8cd3cfa4b1` uses the real shared Diamond and Box
  grids at a readable bounded size, compact resource actions, a rail wide enough
  to preserve every concept name, and a compact reference card for places such
  as 1.4 that do not have an honest visual preview. It no longer stretches
  controls or empty detail surfaces across the available width.
- Level 1.6 Orientations is connected in `c211be2814` as a reference-only place.
  It links to the existing Staff Positions Guide section with explicit partial
  coverage, while leaving lessons, practice, exploration, and Composer handoffs
  empty until those capabilities have truthful focused owners. The legacy Staff
  lesson is not presented as the 1.6 lesson because it also teaches prospin,
  antispin, and a quiz.
- Focused verification for `c211be2814` passed 13/13 registry and experience
  tests. Live `?place=1.6` checks covered 375x667, 960x412, 820x1180,
  1440x900, 1920x1080, 2560x1440, and 3840x2160. Every viewport kept a 16px
  root and zero page-width overflow; the route exposed the partial Guide action
  without stretched or clipped controls, and the console reported no errors.
- Verification for `8cd3cfa4b1` is green after rebasing onto the then-current
  `main`: `svelte-check` reported 0 errors and 0 warnings, and the focused
  concept-place suites passed 11/11 tests. Live checks covered 375x667,
  960x412, 820x1180, 1440x900, 1920x1080, 2560x1440, and 3840x2160. The 1.4
  deep link retained its selection, all checked widths had zero page overflow,
  the root stayed 16px, and the console reported no errors. The broader landing
  morph suite still has its pre-existing `/glossary` participant failure on
  both the task branch and the baseline `main` checkout.
- The standalone Grid Guide topic was recomposed as a compact overview in
  `d4ce6a0b4b`, `0b30889e9e`, `e01a38f084`, and `0894d8d9a2`. The topic no
  longer asks readers to choose Page versus Reflow: it uses the semantic reflow
  content directly, keeps the print/book sheet as the separate print owner, and
  places the contextual Grid lesson link in the title row instead of a dedicated
  vertical band. The authored explanation now pairs its opening and point
  definitions with the real hand pictograph, then compares Diamond, Box, and the
  combined 8-point grid in one row on wide layouts. At 1440x900 the teaching
  content ends at 826px instead of producing the previous 2967px document.
  Focused Guide contracts passed 14/14, both changed Svelte components compiled
  with 0 warnings, the root stayed 16px through 3840x2160, and every checked
  viewport had zero page-width overflow.

## Believed done - unverified

- The revised route, 1.4 lesson, and landing hierarchy have objective responsive
  and interaction proof, but Austen has not yet completed the required human
  confidence pass on the latest layout. Do not mark any lesson `CONFIRMED` from
  the automated checks.

## In flight

- No implementation is in flight. The verified 1.6 reference-only connection
  `c211be2814` was fast-forwarded into `main` on 2026-08-30.
- The task-owned 5188 preview was stopped and its Chrome DevTools tab was
  closed after the final rebase check.

## Loose ends (ranked)

1. Have Austen physically test the landing route and the existing 1.1, 1.2,
   1.3, 1.4, and 1.5 lessons before changing any status to `CONFIRMED`.
2. Connect 1.7 and 1.8 one at a time through the same registry and route
   contract. Each needs a real lesson/reference owner or an honest map-only
   state. Keep 1.6 reference-only until a focused orientation lesson is built
   and approved.
3. Add higher-level Atlas navigation only when the official knowledge graph and
   available resources can support a useful destination without pretending the
   material is taught.
4. Classify games against official TKA levels only after the concept and level
   evidence exists; keep unknown games `unclassified`.
5. Extend the same concept-place contract beyond the first Level 1 slice rather
   than creating another navigation system.

## Decisions already made

- On 2026-08-28, Austen approved unifying Learn, games, Atlas, Guide, Codex, and
  related tools into one interwoven product.
- On 2026-08-28, Austen required that "Level 2" mean TKA Level 2. Game-local
  progression must use distinct language so it cannot be confused with TKA
  curriculum levels.
- On 2026-08-28, Austen approved reliable human approval gates and requested a
  durable handoff so deep lesson polish cannot erase the bird's-eye goal.
- The Atlas is a map and review layer, not a prose glossary or a second lesson
  path.
- The Guide owns the linear journey and authored reference; concept places link
  to it contextually.
- Games are concept practice. Their global arcade can remain as an alternate
  entry point, but it is not a separate curriculum.
- Real artifacts and existing capability owners replace invented decorative
  diagrams.

## Gotchas

- `src/lib/features/learn/domain/concepts.ts` and
  `packages/domain/src/curriculum/knowledge-graph.ts` define different ID
  vocabularies. Do not merge them by string inference.
- `ConceptProgressTracker` and `PlayProgressStore` persist different progress
  shapes. Do not call either one unified mastery without a tested projection.
- Historical persisted game fields such as `levelNumber`, `starsByLevel`, and
  `levelsUnlocked` are migration inputs only. New UI and state use challenge
  vocabulary.
- The public Atlas landing uses the official Level 1 concept graph. Glossary
  categories remain search and reference metadata, not curriculum structure.
- As of October 13, 12 lesson experiences are published in
  `concept-experience-registry.ts`. `docs/learn/concept-status.md` records review
  status; `CONFIRMED` requires human interaction.
- The public Learn route pulls a large client graph on a cold Vite start. The
  task-owned preview required one dependency-optimization reload before the
  interactive course replaced its prerendered fallback. Do not mistake that
  local cold-start cost for a missing Atlas render without checking the server
  and browser logs.
