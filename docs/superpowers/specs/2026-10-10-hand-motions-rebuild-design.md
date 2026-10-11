# Hand Motions Rebuild: Motion Map and Six Combinations

**Status:** Design approved by Austen on 2026-10-10. The motion map draft needs
his approval in the browser before the two-hand stage is built.

**Parent spec:** [Guide rethink: one topic, three views](2026-10-10-guide-rethink-design.md).
This is its milestone 2.

## Problem

Austen called the current lesson "pedantic": it shows one motion at a time.

- **Lesson** (`hand-motions-intro`, five steps): Shift, Dash and Static each get
  a step with one blue hand in one player. Then come the Timing and Direction
  instruments and the six-up elemental board.
- **Guide page** (`/guide/level-1/hand-motions`): the reflowed PDF layout. The
  captions sit below all the boxes instead of beside their figure, and the
  animation boxes take seconds to draw.
- **Missing:** the Guide's six combinations (Dual-Shift, Shift, Cross-Shift,
  Dash, Dual-Dash, Static) are not taught in any lesson. Flow Arts MCP confirms
  these are the six letter types (1 Dual-Shift … 6 Static).
- **Duplicated:** Timing and Direction is taught at the end of this lesson and
  again in the `timing-and-direction` lesson.

## Decisions

| #   | Question                         | Decision                                                                                                                                              |
| --- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | How the three motions are shown  | **Motion map.** One grid, one blue hand at West, all three moves drawn at once. It builds itself, and in the lesson you drag the hand to name a move. |
| 2   | Where Timing and Direction lives | **Its own lesson.** Hand Motions ends on the six combinations. Continue opens the existing Timing and Direction lesson.                               |
| 3   | Overall design                   | Approved as presented (lesson stages, Guide page, handbook page, one shared source).                                                                  |

## The two pictures

### Motion map (one hand)

One diamond grid. The blue hand rests at West. All three moves are drawn at
once with the real arrow renderer:

- **Shift:** two float arcs, West to North and West to South;
- **Dash:** the straight dash arrow, West to East;
- **Static:** no arrow, as in the book. A soft halo on the hand's own point
  marks it. The halo is a figure annotation in the Grid callout style, not
  notation, and Austen judges it in the draft.

The map builds itself once, like the Guide front page: grid, then hand, then
arrows fade in, then the hand runs each move in turn (shift north, dash, static
hold), each time lighting its caption beside the figure. Under reduced motion it
shows the finished map with all arrows drawn.

### Six combinations (two hands)

Each hand makes one of three moves, so two hands give nine pairs. Mirror pairs
(blue shifts and red dashes, or the reverse) are the same combination, which
leaves six. Each combination is a real two-hand pictograph, named in its
letter-type color from `LETTER_TYPE_COLORS`:

| Combination | Blue   | Red    | Guide page that teaches it |
| ----------- | ------ | ------ | -------------------------- |
| Dual-Shift  | shift  | shift  | `hm-type1`, `hm-gamma`     |
| Shift       | shift  | static | `hm-type2`                 |
| Cross-Shift | shift  | dash   | `hm-type34`                |
| Dash        | dash   | static | `hm-type56`                |
| Dual-Dash   | dash   | dash   | `hm-type56`                |
| Static      | static | static | `hm-type56`                |

The six example pictographs start from the authored `COMBO_DEMOS` in
`HandMotionsPage.svelte`, moved into the shared record.

## Lesson (`hand-motions-intro`)

Three stages replace the five. The lesson keeps its concept ID, place in the
curriculum and registry entry.

1. **Motion map.** Opens with the map drawn and the self-build playing. The
   hand can be grabbed at once; grabbing it ends the demonstration. Dropping it
   on a neighboring point plays a shift, on the opposite point a dash, and back
   on its own point a static hold. The move's caption lights and gets a found
   mark. Every drop is one of the three moves, so no answer is wrong. The hand
   stays where it lands, and the next drag starts from there. The stage is done
   once all three moves are found.
2. **Two hands.** The stage starts with blue at West and red at East. The
   learner drags each hand to a target (dropping a hand on its own point
   chooses static). A target shows a ghost hand and its arrow. When both hands
   have targets, they move together and the combination's name appears in its
   letter-type color. Both hands stay where they land, and the next round
   starts from there. The combination's cell on a
   six-cell board beside the grid fills. A mirrored pair lands on the cell it
   already filled, so the learner finds out without being told that it does not
   matter which hand does which move. The stage is done once all six are found.
3. **Wrap-up.** The full six-cell board. The primary action continues to Timing
   and Direction.

Saved progress: bump `HAND_MOTIONS_STAGE_SCHEMA_VERSION` to 3. Older saved
places restart at stage 1.

Keyboard: the placement grid's existing keyboard targets carry the drags. Each
found move and combination is announced through its existing live region.

The draft settles the timing values (demonstration pace, hold before the next
try) with Austen; they use `DURATION` tokens.

## Timing and Direction lesson

`TimingDirectionConceptExperience` currently renders
`MotionsConceptExperience` with `timingDirectionOnly`. The split gives it its
own orchestrator, built from that branch of the code, so its five topics and
comparison board behave exactly as they do today. Hand Motions no longer
contains any Timing and Direction stage.

## Guide web page

`/guide/level-1/hand-motions` moves to the topic page template (`TOPIC_PAGES`),
in the Grid page's "labeled overview first" layout:

1. kicker, title "Hand Motions", the Guide's opening sentence;
2. the motion map beside its three captions plus "The arrow shows the
   direction of motion. The hand shows the end position.", playing its build
   once when it scrolls into view;
3. the six combinations: six two-hand pictographs (3 × 2 on wide screens,
   2 × 3 on tablets, one column on phones), each with its colored name and the
   Guide's description underneath, each one a link to its Guide page;
4. "Learn this interactively" (`LinkChip`) into the lesson.

Static figures render first and the server HTML carries every caption and
description.

## Handbook page

A second page after The Grid in `/guide/level-1/handbook`: the motion map as a
still with all arrows drawn and the three captions as callouts, then the six
combinations table with its pictographs. The printed first edition had that
table as words only. A QR code may add motion but never supplies missing
meaning.

## Shared source

`src/lib/shared/guide-topics/hand-motions-topic.ts`, following `grid-topic.ts`:

- explanation units: translation keys for the approved sentences;
- figure states: the motion map's three moves and the six combinations, each
  with a stable ID, combination name, letter type and Guide link;
- no interaction, feedback or progress state.

A shared-edit test proves that one edit to a unit reaches the lesson, the web
page and the handbook page.

## Capability ledger

| Capability                              | Owner                                                           | Relationship                                                                                     |
| --------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Drag a hand to a grid point             | `PropPlacementGrid` (`dragLocations`, keyboard targets)         | reuse                                                                                            |
| Play a committed move in place          | `prop-placement-motion.svelte.ts` (plays only the pro arc)      | **extend** with a straight dash and a static hold                                                |
| Hand travel rendering                   | `PictographContainer` `motionStartData` / `motionProgress`      | reuse                                                                                            |
| Self-building figure                    | `HubHeroBuild.svelte` (page-local, first use)                   | second use: **extract** a shared build sequence; the front-page hero moves onto it               |
| Several arrows for one hand on one grid | `PictographContainer` (one motion per hand)                     | **extend**: an arrow-only layer over one grid. The first plan task proves which seam is cleanest |
| Combination name colors                 | `LETTER_TYPE_COLORS`                                            | reuse                                                                                            |
| Lesson frame, heading, controls         | `LessonStageFrame`, `LessonStageHeading`, `LessonStageControls` | reuse                                                                                            |
| Board fill and stage changes            | `createLayoutMotion`, `Crossfade`                               | reuse                                                                                            |
| Topic content record                    | `grid-topic.ts` pattern                                         | compose a new record                                                                             |
| Topic page routing                      | `TOPIC_PAGES` in `_topics/topic-pages.ts`                       | extend with `hand-motions`                                                                       |
| Saved place                             | `getExperiencePersistence`                                      | reuse                                                                                            |

Search terms used: drag, dragLocations, motionMove, motionProgress, placement
motion, hero build, LETTER_TYPE_COLORS, TOPIC_PAGES, combination.

## Wording

Everything shown comes from approved copy in `messages/*.json`
(`verified_level1_hand_motions_*`) and the lesson's approved captions. No new
teaching explanation is added.

New lesson prompts need Austen's exact approval before they ship (copy gate in
`docs/learn/copy-reviews/hand-motions-intro.md`). Drafts:

- Stage 1: "Drag the hand to a point."
- Stage 2: "Drag both hands. Find all six."
- Mirror pair: "Same pair, hands swapped."

**Copy conflict to resolve:** the book says "Stay at the current point" for
Static, and the lesson says "Remain at the same point". The shared record holds
one sentence. The default is the book's wording.

## Build order

1. **Motion map draft** (the figure alone, self-build plus drag) on a task
   preview. Austen approves it in the browser before anything else.
2. Lesson stage 1, then the two-hand stage and wrap-up; the Timing and
   Direction split lands with it.
3. Guide web page, then the handbook page.
4. Shared-edit test, viewport pass, ui-bust review, integration.

## Acceptance

- Austen approves the motion map draft, then the finished lesson and Guide
  page, in the browser.
- The shared-edit test passes.
- All three moves and all six combinations can be found by dragging and by
  keyboard. A mirrored pair lands on its existing cell. Reduced motion shows
  each result without travel.
- The Timing and Direction lesson behaves as before, and its tests pass.
- The Guide page shows the motion map and its captions in the first viewport
  at 1440×900 and 375×812 without layout shift. Server HTML contains every
  caption and description.
- Seven-viewport pass and a ui-bust review for the lesson stages and the Guide
  page.
- `/print` and `/book` (first edition) are unchanged.

## Out of scope and retirement

- `HandMotionsPage.svelte` stays for `/print` and `/book` only.
- The hand-path carousel and the Timing and Direction stages inside
  `MotionsConceptExperience` are removed once the new lesson ships.
- The slow, blank animation boxes seen on `hm-type1`, `hm-type2` and
  `permutations` (`SequenceShowcase.svelte`) stay a separate fix. This rebuild
  removes that component from the Hand Motions page only.
- The other Hand Motions chapter pages (Type 1 through Type 6) are later
  topics. Their layout comes to Austen one at a time.
