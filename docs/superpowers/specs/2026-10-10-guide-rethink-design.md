# Guide Rethink: One Topic, Three Views

**Status:** Direction approved by Austen on 2026-10-10. The pilot's page layout
still needs his approval in the browser before anything beyond it is built.

**Audit and wireframes:** [Guide Rethink artifact](https://claude.ai/artifact/LqbQEQ6puk8nAaVLXxdyez)
(Claude browser audit plus a source audit by Codex Astra, 2026-10-10).

## Problem

The written Guide (`/guide/level-1/*`) was authored as a fixed-layout PDF. The
reflowable web version kept the words and lost the teaching devices:

- labeled diagram callouts (The Grid's center, hand and outer points; Staff
  Placements' column labels);
- figure-adjacent captions (FlowFrame groups trailing prose into the previous
  showcase on hm-type2, examples-abc and examples-acac);
- composed comparisons (the drawn Diamond + Box = 8-point equation became a
  toggle; Staff Motions and Type 3 letters lost their halfway frames);
- the welcome (the "Read Me First" letter exists only in print front matter).

Most pages carry 70–200 words, so text volume is not the cause. The web pages
also use three visual styles that differ from the lessons, and 24 of the 34
Level 1 pages have no linked lesson.

## Decisions

| #   | Question                      | Decision                                                                                                                                                                    |
| --- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Guide and lesson relationship | **One topic, three views.** Shared teaching content, with composition specific to each medium.                                                                              |
| 2   | The Grid web layout           | **Labeled overview first**: one annotated figure with adjacent definitions, then the Diamond + Box = 8-point comparison, then a short "Remember" summary and a lesson link. |
| 3   | Front door                    | **Lesson first.** A short welcome built from "Read Me First", with "Start the first lesson" as the primary action and "Read the guide" second.                              |
| 4   | Print                         | **New handbook.** Freeze the current faithful book as Level 1 first edition and build an edited handbook from the shared content, with a few practice pages.                |
| 5   | Job of a web topic page       | Default (open): a quick answer first, then the readable explanation, then optional practice. It is not an unrolled lesson.                                                  |
| 6   | Example collections           | Default (open): Learn and Reference shelves, plus an "Examples and practice" group linked from each topic.                                                                  |

Decisions 5 and 6 use the recommended defaults until Austen reviews the topic
pages and shelves they affect.

## Architecture

### Shared topic content

Each teachable topic owns one content record of shared teaching units:

- explanation units: a heading plus 1–3 sentences, each with a stable ID;
- terminology: terms and definitions, using one name per concept (for example
  "placements", never "positions");
- example identities: the sequences and pictographs the topic uses, by ID;
- figure states: static annotated compositions (callouts, highlights, multiple
  frames), each with a stable ID.

The record does not own interaction, feedback, completion or resume state.
Bespoke lesson components keep those (for example
`grid-experience-state.svelte.ts`) and look up explanation and figure IDs from
the record.

Topics relate to lessons and Guide pages through explicit relationships, not
matching slugs. Three lessons map to `hand-motions` today, so the relationship
is many-to-one.

### Three views

| View           | Composition                                                                                                                                                                                    | Owner                                                           |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Lesson         | Step-by-step stage, interaction and checks                                                                                                                                                     | Existing `/learn/concepts/<id>` components                      |
| Web topic page | Compact answer first, descriptive headings and anchors, figure beside its text, optional practice after. Static figures render first; motion loads progressively.                              | New topic page template replacing FlowFrame for migrated topics |
| Print handbook | Annotated figures, comparisons shown together, captions kept with figures, paper exercises with answers, hand-chosen page breaks. A QR code may add motion but never supplies missing meaning. | New handbook renderer; pagination authored separately           |

Wording is shared where the meaning is identical. Lesson prompts, reference
summaries and print instructions may differ.

### Information structure

- **Start here** is orientation, separate from both shelves.
- **Learn** is an ordered path in three sections: Foundations, Letters, Words.
  Its order follows `concepts.ts`, and the Guide does not define a second
  curriculum. Level 2 follows as the advanced path.
- **Examples and practice** holds the word collections, worked reversal
  examples and LOOP collections. Each is reached from the topic it practices.
- **Reference** holds the Codex, Prospin and Inspin, Ratios, Motion paths and a
  glossary.

The proposed shelf for each of the 34 Level 1 pages is in the artifact's page
table. That table is a proposal, revised as each topic is migrated.

### Visual language

The lessons' visual language applies to every Guide page: left-aligned modern
headings, prose beside its figure, larger pictographs than today's ~60 px
tiles, and calligraphy only in the brand mark. Density varies by page type. A
lookup grid such as the Codex does not use lesson-stage spacing.

## Pilot scope (milestone 1)

1. **Start page** at the Guide front door, built from the "Read Me First" copy
   (`GuideDocument.svelte` TX.readme). Draft headline wording goes to Austen
   for approval.
2. **The Grid in all three views from one record:**
   - extract its approved explanation units and annotated figure states;
   - the existing Grid lesson consumes those units without replacing its state
     machine;
   - a web topic page in the approved "labeled overview first" layout;
   - one composed print handbook page.
3. **Proof:** a test shows that changing one shared explanation or annotation
   updates the lesson, the web page and the print page. Lesson progression and
   resume still work. The web and print versions explain the Grid without
   animation.

Milestone 1 does not include the five-template system, the Codex restyle,
reference migration, or retiring any existing route.

## Milestone 2

**Hand Motions**, the first topic with motion. Before migrating it, reproduce
and find the cause of the empty animation boxes seen on first view on
hand-motions, hm-type1, hm-type2 and permutations (owner:
`SequenceShowcase.svelte` proximity and visibility mounting). Then test
playback, halfway-frame figures and the three lessons that share this topic.

## Later

Remaining Foundations, then Letters, then Words, then the Examples and practice
and Reference shelves, then the full print handbook. Each topic's layout goes
to Austen before it ships.

## Retirement rules

- Keep `built-pages.ts`, `/print` and `/book` working until the new handbook is
  complete and approved. Publish the frozen faithful book as a versioned
  first-edition PDF.
- Retire legacy `_sections/ch*`, FlowFrame's caption-grouping logic, duplicate
  topic lists and the in-app GuideReader only after their replacements are
  live and approved.
- This direction changes `docs/architecture/canonical-learning-experience.md`:
  the written reference and print authority move from the faithful pages to
  the shared topic record. Amend that ADR when the pilot is approved; do not
  amend it beforehand.

## Acceptance for the pilot

- The shared-edit test above passes.
- The Grid web page renders its annotated figure and definitions in the first
  viewport at 1440×900 and 375×812, with no layout shift.
- Server-rendered HTML contains every definition (crawlable).
- The seven-viewport matrix and a ui-bust review pass for the new Start page
  and topic template.
- Austen approves the Grid page and the Start page in the browser.
