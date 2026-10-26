# Hand Motions: the written page as the lesson's script

**Status:** Design approved by Austen on 2026-10-25. The rebuilt page goes to
him in the browser before it ships; chip wording goes to him before that.

**Parent specs:**
[Guide rethink: one topic, three views](2026-10-10-guide-rethink-design.md)
and [Hand Motions rebuild](2026-10-10-hand-motions-rebuild-design.md).

## Problem

Austen, reading `/guide/level-1/hand-motions` on 2026-10-25:

- The page shows the three motions and the six combinations "as one info
  dump": a row of three stills, then the six-card board, with nothing between
  them that introduces the motions first.
- "Learn this interactively" sits once at the bottom and always opens the
  lesson from its first stage. Clicking it while reading the combinations
  lands on the three-motions chart, which feels like being sent back.
- The written page and the lesson read as two versions of the same thing.
  Readers either stay on the written page and never try the lesson, or
  wonder why there are two and feel the doubling.

What exists today:

- The lesson (`hand-motions-intro`) has four stages: the three-motions
  flowchart, the motion map, two hands finding the six, and a which-one-is-this
  quiz. Both surfaces read `src/lib/shared/guide-topics/hand-motions-topic.ts`
  for every word and picture, so the content is already one record; only the
  composition differs.
- The lesson's "Read this topic" button opens the written page inline for
  The Grid and Hand Placements (`ConceptTopicReading.svelte`) and links out to
  the Guide route for Hand Motions.
- Lesson links carry one flag, `?from-start`, which clears the saved place
  (`concept-routes.ts`, consumed in `PublicConceptCourse.svelte`).

## Decisions

| #   | Question                                   | Decision                                                                                                                                                                                                   |
| --- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | What the written page is, next to a lesson | **The lesson's script.** Same beats as the lesson, in the lesson's order, with the lesson's own figures composed for reading. Each beat offers the matching lesson stage. The page reads; the lesson does. |
| 2   | Scope                                      | **Hand Motions first, as the pattern.** The Grid, Placements and the other migrated topics follow one at a time after Austen approves this page in the browser.                                            |
| 3   | How a stage link opens the lesson          | **At that stage, earlier stages left alone.** The saved place moves to the linked stage. Moves and pairs already found are kept; nothing is marked done for the reader. Previous still walks back.         |
| 4   | A chip at the top of the page              | **No.** The in-flow chips are the invitations, each at the moment the reader is curious. (Austen chose "write the spec" over "add a chip at the top".)                                                     |

## The page

`/guide/level-1/hand-motions` (`HandMotionsTopicPage.svelte`) keeps its
header (kicker, title, lede) and becomes four sections in the lesson's order.

1. **The three motions.** The lesson's flowchart in place of today's row of
   three stills: the Start box with the blue hand at West, branching to Shift,
   Dash and Static, each with its name, its caption and the real pictures of
   the move from that start (both shifts, the dash, static). It plays its
   cascade once when it scrolls into view and replays a picture on hover or
   tap, as the lesson's first stage does. Under the chart sit the book's two
   lines: the arrow shows the direction of motion, the hand shows the end
   position. Reduced motion shows the finished pictures.
2. **The motion map.** One diamond grid and the blue hand, its self-build
   playing once when it scrolls into view (`MotionMapFigure`, not
   interactive), with the three captions beside it. This is the stage where
   the lesson hands the reader the hand, so the section is short and carries
   the first stage chip, into the map stage.
3. **The six combinations.** The lead sentence, then the board as it is today
   (`HandCombinationBoard`: names in letter-type colors, descriptions, each
   cell replaying on hover or tap, 3 × 2 on wide screens, 2 × 3 on tablets,
   one column on phones). Second stage chip, into the two-hands stage.
4. **Test yourself.** The page ends on one chip into the quiz stage, in place
   of today's bottom "Learn this interactively".

Every chip is a `LinkChip` (`no-text-links.md`). Draft wording, for Austen's
approval before it ships:

| Where           | Draft           |
| --------------- | --------------- |
| After the map   | Try it yourself |
| After the six   | Try it yourself |
| End of the page | Test yourself   |

The chips use the page's ink palette the way the current lesson chip does.
Static figures render first and the server HTML carries every name, caption
and description, as today.

Layout follows the Grid page's "labeled overview first" composition: one
centered axis, prose on the editorial measure, figures allowed to grow with
the page (`4k-native-layout.md`). The chart lays out left to right on wide
screens and stacks Start over the three branches on narrow ones, as the
lesson stage does.

## Stage links

A lesson link can name a stage by word. `concept-routes.ts` gains:

- `buildConceptStagePath(conceptId, stage)` →
  `/learn/concepts/<id>?stage=<name>`;
- `conceptStageFromUrl(url)` → `{ conceptId, stage, cleanHref } | null`,
  mirroring `conceptRestartFromUrl`.

Stage names are words, not numbers, so a renumbered lesson never breaks a
page link. Each lesson that can be entered mid-way lists its names in its
registry entry (`ConceptExperienceDefinition.stages`, optional):

| Hand Motions stage name | Stage (1-based saved step) |
| ----------------------- | -------------------------- |
| `motions`               | 1, the chart               |
| `map`                   | 2, the motion map          |
| `two-hands`             | 3, two hands               |
| `quiz`                  | 4, the quiz                |

`PublicConceptCourse.svelte` handles the flag beside `from-start`: before the
lesson creates its state, it looks the name up in the registry entry and, when
found, writes that step and the lesson's current stage schema version through
`getExperiencePersistence(id)` (`saveStep` and the schema phase key), then
drops the flag from the address bar once the navigation settles. An unknown
name, or a lesson without `stages`, is ignored and the lesson opens at its
saved place. `from-start` and `stage` together: reset first, then the stage.

Found moves (`mapMoves`), found pairs (`pairsFound`) and quiz answers are not
touched, so a reader who already played part of the lesson keeps it. Opening
the quiz stage shows the quiz; the lesson is done only when it is passed, as
today. Back at the lesson's first step returns to the page it came from
(`enteredCourseFromOutside` already does this).

The schema version comes from the lesson's own module
(`HAND_MOTIONS_STAGE_SCHEMA_VERSION`), carried on the registry entry next to
the names, so the course never hard-codes a lesson's internals.

## One chart, two owners

The flowchart lives inside `HandMotionsIntroStage.svelte` today, wired to the
live lesson board (`LessonBoardSlot`, `liveBoard.follow`). It moves to a
shared figure, `src/lib/shared/guide-topics/HandMotionsChart.svelte`, beside
`MotionMapFigure` and `HandCombinationBoard`:

- The figure owns the branches, the pictures, the cascade (`whenOnScreen`,
  stagger, hover and tap replay, the static ring) and reduced motion.
- The Start box is a snippet prop. The lesson stage passes its live-board
  slot and following hand; the page passes a plain static picture.
- `darkMode` and `printMode` props set the pictures' colors the way the board
  does, so the page's light and dark palettes both work.
- The lesson stage becomes the figure plus its board slot and Next behaviour;
  the stage's heading, notes and grow-into-the-map morph stay where they are.

## The lesson side

`ConceptTopicReading.svelte` adds `hand-motions-intro` to the pages it opens
inline, so "Read this topic" in the lesson opens this page in the sheet the
way The Grid and Placements do, and the pair reads as one topic from either
side.

## Capability ledger

| Capability                     | Owner                                                    | Relationship                                      |
| ------------------------------ | -------------------------------------------------------- | ------------------------------------------------- |
| Three-motions flowchart        | `HandMotionsIntroStage.svelte` (lesson-local, first use) | second use: **extract** `HandMotionsChart.svelte` |
| Motion map figure              | `MotionMapFigure.svelte`                                 | reuse, not interactive, demo on view              |
| Six-combination board          | `HandCombinationBoard.svelte` + `CombinationPlayback`    | reuse                                             |
| Lesson entry from a page       | `concept-routes.ts` (`from-start`)                       | **extend** with a named stage                     |
| Lesson stage names             | `concept-experience-registry.ts`                         | **extend** the definition with optional `stages`  |
| Saved place                    | `experience-persistence.svelte.ts`                       | reuse (`saveStep`, phase data)                    |
| Standalone links               | `LinkChip`                                               | reuse                                             |
| Topic header                   | `TopicHeader.svelte`                                     | reuse                                             |
| Inline reading from the lesson | `ConceptTopicReading.svelte`                             | **extend** with the Hand Motions page             |
| Shared words and figure states | `hand-motions-topic.ts`                                  | reuse, unchanged                                  |

Search terms used: from-start, conceptRestartFromUrl, saveStep,
HandCombinationBoard, MotionMapFigure, LessonBoardSlot, TOPIC_PAGES,
ConceptTopicReading, lessonHref.

## Wording

No new teaching explanation. Every sentence on the page is already in the
shared record (`verified_level1_hand_motions_*`, `learn_motion_*`). The only
new strings are the three chip labels above, which go to Austen before they
ship and are added to `messages/*.json` with the other locales following the
translation program's usual pass.

## Out of scope

- `/print`, `/book` and the handbook page: unchanged.
- The other migrated topic pages (The Grid, Hand Placements, Staff
  Placements, Type 1 Dual-Shifts): they take the same pattern later, one at a
  time, each with Austen's look.
- The lesson's stages, order and interactions: unchanged. Only the chart's
  home moves.
- Any change to the Guide hub or its "Start the first lesson" door.

## Build order

1. Stage links: routes helper, registry `stages`, course handling, tests.
2. Extract the chart figure; the lesson stage consumes it. Lesson plays as
   before (visual check of stage 1, the cascade and the grow into the map).
3. Rebuild the page on the four sections with the three chips.
4. Inline reading for Hand Motions in the lesson.
5. Shared-edit test still passes; viewport pass; ui-bust review; Austen's
   look in the browser; integration.

## Acceptance

- Austen approves the page and the chip wording in the browser.
- Each chip opens the lesson on its own stage; found moves and pairs survive;
  Previous walks back; Back at the first stage returns to the page.
  `?from-start` still resets. A bad stage name opens the saved place.
- The lesson's first stage looks and plays as it did (cascade, hover replay,
  static ring, reduced motion, board flying in from Hand Placements, Next
  growing into the map).
- Server HTML contains every name, caption and description.
- The existing shared-edit test passes; `concept-routes.test.ts` covers the
  stage flag; a focused test covers the course's stage handling.
- Seven-viewport pass at 375×667, 960×412, 820×1180, 1440×900, 1920×1080,
  2560×1440, 3840×2160, plus 200% zoom reflow, and a ui-bust review of the
  page.
- `/print` and `/book` are unchanged.
