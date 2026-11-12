# Mandala climb: Browse's "By mandala", simple to complex

**Screen superseded, 2026-11-11.** The six-box picker, its paging window and
picking several mandalas were replaced by the wall and the mandala page in
`2026-11-11-mandala-wall-design.md`. The engine sections here still hold and
that spec uses them by reference: families, the order, the worker build, the
saved book, the Mandala filter's value and matching, and the Mandala sort.

Austen, 2026-11, on the shipped screen (494 boxes for 1,577 sequences, 275 of
them holding one sequence, in Sparse / Medium / Dense bands): "robot
information overload ... I just don't foresee anybody using it."

This replaces the screen from `2026-10-20-mandala-browse-design.md` and the
bands from `2026-10-20-mandala-density-design.md`. The measure, the index and
the Mandala filter type stay; what a box is, how boxes are ordered and how
you move through them all change.

## Settled by Austen

1. Colour is not part of a mandala's identity. Boxes draw in one neutral
   colour. Each sequence card keeps its own hand colours.
2. Look-alike shapes, including turned and flipped copies, share one box (a
   family). The box shows the family's most-drawn shape and the count of all
   its sequences. Tapping lists the sequences directly.
3. The screen is a climb from easy to hard: the plainest figures first, each
   step a little busier than the last.
4. His starting idea for the control: a slider from simple to complex.

## Chosen by eye on the real pool (2026-11-11)

Looked at on `/test/mandala-families` at 1440 by 900, 707 by 772 and 412 by
915, with the community pool (494 distinct shapes, 1,578 sequences).
Screenshots are in `assets/2026-11-mandala-climb/`.

- **How alike: 0.35.** It gives 146 families, 41 with one sequence. Its
  largest families hold together: the ring with a cross (8 shapes, 126
  sequences) and the busy rosettes (25 shapes, 99 sequences) are each one
  picture (`threshold-035-largest-family.webp`). At 0.42 a 37-shape family
  already mixes ring lattices with flowers, and at 0.50 one box swallows 74
  shapes (`threshold-050-largest-family.webp`). Tighter cuts (0.25: 218
  families, 83 with one sequence) bring the overload back.
- **Order: enclosed spaces, then ink** (the test page's Blend). The first
  page is a cross, a ring, a half ring; the last is the densest lattices
  (`order-blend-first-desktop.webp`, `order-blend-last-desktop.webp`). Ink
  alone reads nearly as well at the ends but puts thin six-petal flowers
  before fat rings in the middle. Crossings puts tangled stars beside plain
  figures (`order-crossings-middle-desktop.webp`).
- **Control: a slider that moves a page at a time.** Compared with Steps
  (five named bands and a pager under them: two controls for one idea, and
  the bands are Sparse / Medium / Dense again) and All (146 small boxes in
  a panning grid: today's screen with fewer boxes). The slider keeps a
  handful of large boxes on screen and one control under them
  (`control-slider-phone.webp`, `control-steps-phone.webp`,
  `control-all-fold.webp`).

## The open question, decided

A busy mandala can come from an easy sequence and a plain one from a hard
one. On the pool, level 1 sequences sit almost entirely in the simplest fifth
of the climb, but that fifth also holds 48 level 3 sequences and the busiest
fifth holds 222 level 2. So: **the picture leads the order**; Level stays its
own door; and the sequences a box opens are grouped by level, easiest first.

## The screen

`src/lib/features/browse/gallery-home/value-editors/GalleryMandalaEditor.svelte`

A fixed frame of three parts. Nothing scrolls.

1. The heading: "Pick a mandala" and the host's hint (`valueHead`).
2. The boxes: one page of families, filling the remaining height. The page
   holds as many square boxes as fit at 128 px or wider, up to 24, and then
   makes them as large as the area allows (`fitPage` in `mandala-window.ts`).
   Where fewer than four fit at 128, the minimum drops to 96; where the area
   is shorter than 96, one row of boxes as tall as the area fills it. A
   phone shows 2 across by 3 down, the Fold 4 by 3.
3. The climb bar: a step button, the slider, a step button, with "Simple"
   under the slider's left end and "Complex" under its right.

**On a desktop** the screen sits where every filter's editor sits: the lower
part of the split pane's left rail, 440 px wide, under the category list,
with the live results beside it. The category list keeps its own minimum
height, so the rail leaves the boxes one row of four at 1440 by 900, two
rows of four at 1920 by 1080, 3 by 4 at 2560 by 1440 and 3 by 7 at 3840 by
2160. The boxes' area is the row block the rail's height budget sizes
(`grid-auto-rows: minmax(6rem, var(--pane-row-size, 60rem))`), the same
contract the other editors' value grids use, so the rail gives the height
back after a window is shrunk and grown again. Giving the mandala screen
more of the rail, or the whole pane, means changing the shared rail
(`GalleryPaneLeft` and `pane-height-budget.ts`) for every filter and is left
out of this build.

**A box** is a pressable square (background, border, hover and focus states
as today): the family's most-drawn shape as a still in the text colour
(`MandalaStill tone="ink"`), and the family's sequence count as a badge.
Its accessible name is "Mandala, 126 sequences". Tapping it calls
`onPickValue(BrowseFilterType.MANDALA, value, label)`; the host then shows
the sequences, as it does for Level. In builder hosts the applied box wears
the accent ring and `aria-pressed`. A box is applied when an applied Mandala
value resolves to its family, not when the text matches, so the ring
survives a reload, a legacy value and a change of representative; tapping
the applied box removes the stored value. The hosts pass their applied
Mandala values as `activeMandalaValues`, and the pure `appliedByFamily`
maps each to its family. The phone and Fold sheet passes none, as it does
for every other editor, so no ring shows there; the chip above the results
carries the state.

**The window.** Families are laid out in rows of the page's column count.
The slider's stops are page starts: row 0, then every `rows` rows, with the
last stop clamped so the final page is full and ends on the last family.
Only the last row of the whole climb can be short. A step button or an
arrow key moves one stop; Home and End go to the ends. When the area is
resized the window keeps its first family in view. The position is kept for
the session, so coming back from a box's sequences lands on the same page,
and a host with an applied mandala opens on the page that holds it.

**The slider** is the shared `ValueSlider`
(`src/lib/shared/ui/components/ValueSlider.svelte`), extended with what it
lacks for a track that has no number to show: `ends` (two words in place of
the value box), `valueText` (what assistive technology hears) and `onhold`
(whether the thumb is in the hand). Its default markup is unchanged. It keeps the native range input, so pointer, touch and keyboard
behaviour and slider semantics stay with the owner. Its value text for
assistive technology is "Mandalas 9 to 16 of 146". No number is shown on
screen: there is no 1 to 10 scale.

**The step buttons** are 44 px boxes with a chevron, named "Simpler
mandalas" and "More complex mandalas", disabled at the ends. They are local
to the editor: the shared components have no icon-button primitive to reuse.

**Motion.** Boxes are a keyed list on the family id: `animate:flip` with
`flipDuration()`, `in:arrive`, `out:leave`. A step button or key animates
the change. While the slider's thumb is held the page follows the pointer at
once, with no easing behind the hand; the release settles normally. Reduced
motion is the owners' own. Every box holds an explicit grid cell, so a
leaving box fades where it stood while the arriving one lands over it.

**While it loads.** The fitted grid of empty boxes holds the geometry, the
area is `aria-busy`, the slider and step buttons are disabled, and the hint
reads "Measuring 212 of 560" and then "Grouping look-alikes". Families arrive
into the reserved boxes. A pool with nothing to draw shows "No mandalas to
show" in the area: the index reports `empty`, and the climb treats that as
ready with no families, so the screen never waits on a build that has
nothing to do.

## Families

`src/lib/shared/mandala/services/mandala-family.ts` already measures how
unlike two shapes are (colour-blind, best of 16 turns and flips, as a share
of the tighter shape's gap between lines) and builds a complete-linkage tree
that can be cut at any threshold. This spec fixes the cut at
`MANDALA_FAMILY_ALIKE = 0.35` and adds how it runs and where it is kept.

- **Off the page.** The pairwise distances, 122,000 pairs for today's pool
  and 11 seconds on the main thread, run in a module worker. The worker's
  imports are plain maths with no DOM and no renderer: the page sends each
  shape's traced points and span, the worker returns distances and reports
  progress. Where a worker cannot start (tests, an old browser) the existing
  idle-slice build runs.
- **Kept.** A Dexie table (`mandalaFamilyBooks`, schema version 12) holds
  one distance book in one row: the shape keys it covers and the upper
  triangle of their pairwise distances as a `Float32Array`, with the measure
  version and a family version. On a return visit every pair is in the book, no geometry is made
  and no worker starts; the tree is linked from the book in a few
  milliseconds. When the pool gains shapes, only the pairs that involve them
  are measured. The book holds at most 1,200 shapes; past that, shapes the
  current pool does not draw go first. A pool that itself draws more than
  1,200 shapes (today's draws 494) keeps the simplest 1,200 and measures
  the rest again on each visit; raise the cap before the pool gets there.
- **Started early.** The gallery already feeds the index its pool when
  Browse opens. Families follow by themselves once measuring is done, so the
  build is usually over before By mandala is tapped. No host calls a second
  function.
- **Rebuilding.** The pool arrives in stages. Once families have been ready
  they stay ready: the last finished families keep answering while a new
  build runs, and are replaced in one step when it lands. A build that fails
  falls back to one shape per family so the screen and the filter still
  work.
- **Bumping.** `MANDALA_FAMILY_VERSION` is bumped when the distance, the
  grid or the turns change; a book from another version is ignored and
  rewritten.

**A family** is `{ id, representative, members, sequenceCount }`. The
representative is the member most sequences draw (ties by key), and `id` is
its key.

**The climb** is the families ordered by the representative's enclosed
spaces, then its ink coverage, then its key. It lives in a reactive owner
beside the index (`src/lib/shared/browse/services/mandala-climb.svelte.ts`):
`families`, `ready`, `progress`, `version`, `familyOf(value)` and `fan`.

## The measure

Enclosed spaces join coverage and key in the per-sequence signature
(`sequence-density.ts`), measured in the same idle slice and saved in the
same `mandalaSignatures` row, so the order needs no geometry on a return
visit. `MANDALA_MEASURE_VERSION` goes to 2: rows from version 1 are ignored
and rewritten once. The key's hash and grid are unchanged, so keys saved
under version 1 still name the same shapes.

Crossings and line length stay in `mandala-complexity.ts` for the test page
only.

## The filter and its chip

- The type stays `BrowseFilterType.MANDALA`. The value names one shape and
  one sequence that draws it: `<shape key>~<sequence id>`, the family's
  representative and its first sequence at the moment of the tap.
- A sequence matches when its shape is in the same family as the named
  shape. If no shape in the pool has that key (after a re-measure that
  changes keys), the named sequence's own shape stands in. So the value
  survives a reload, a re-measure, and a change of representative. A value
  saved by the old screen is a bare key and resolves the same way.
- Until families are ready the filter matches the named shape exactly, and
  widens to the family when they land, reading the climb's `version` the way
  it reads the index's.
- The chip reads "Mandala" (`browse_ui_mandala_category`). The band and
  coverage ("Sparse mandala, 24%") are gone: a family has no name, and the
  screen shows which box is applied.
- **Easiest first.** While a Mandala filter is applied the results are
  grouped by level, easiest first, whatever the sort; the sort orders the
  sequences inside each level. An explicit section override still wins.
  This is the Level sort's own layout: a level banner, then the gallery's
  letter and length sub-headings. A small family therefore shows several
  one-card rows; grouping by level alone needs a change to the shared
  results grid and is left out.

## The Mandala sort

`BrowseSortMethod.DENSITY`, labelled Mandala in both sort menus, orders by
the same measure as the climb: each sequence's own enclosed spaces, then its
coverage, then its level. It does not wait for families. Its three sections
are thirds of the pool by enclosed spaces (under 30, under 70, the rest) and
read "Simple mandala", "Busier mandala" and "Complex mandala", replacing
Sparse, Medium and Dense. The adjective sits on the mandala.

## The front door

The By mandala door's subtitle reads "Simple to complex". Its fan is three
families from the climb, the first, the middle and the last, drawn in the
text colour. Before families are ready it fans three shapes picked the same
way from the measured shapes, so the door is never empty. The filter
catalog's Mandala tile opens the same screen.

## Labels

In all eleven message files:

| Key | English | |
| --- | --- | --- |
| `browse_ui_simple_to_complex` | Simple to complex | new; door subtitle and the slider's name |
| `browse_ui_mandala_simple` | Simple | new; slider's left end |
| `browse_ui_mandala_complex` | Complex | new; slider's right end |
| `browse_ui_mandala_simpler` | Simpler mandalas | new; step button |
| `browse_ui_mandala_more_complex` | More complex mandalas | new; step button |
| `browse_ui_mandala_range` | Mandalas {from} to {to} of {total} | new; slider value text |
| `browse_ui_grouping_mandalas` | Grouping look-alikes | new; hint |
| `browse_ui_no_mandalas` | No mandalas to show | new; empty area |
| `browse_ui_mandala_box_name` | Mandala, {count} | changed |
| `browse_ui_sparse_to_dense` | | removed |

`browse_ui_by_mandala`, `browse_ui_mandala_category`,
`browse_audit_pick_mandala`, `browse_ui_measuring_mandalas`,
`browse_ui_mandala_sequences`, `browse_ui_mandala_one_sequence` and
`browse_sort_mandala` stay.

## Owners

- Selection, applied state, the hand-off to results: `GalleryDrill`'s
  `pickValue` and the host callbacks. Kept.
- The slider: `ValueSlider`. Extended (end labels, no value box).
- Motion: `animate:flip`, `arrive`, `leave` from `shared/transitions/motion`.
  Kept. The band headings and their grid are removed with the bands.
- The pool's shapes and their measuring: `mandalaIndex`. Kept, with enclosed
  spaces added to what it measures.
- Families and their order: new, owned by `mandala-family.ts` (the maths),
  its worker, and `mandala-climb.svelte.ts` (the reactive climb). The closest
  existing owner, `mandalaIndex`, groups by exact key and has no notion of
  likeness; the climb reads it and does not copy it.
- The still: `MandalaStill`. Kept; boxes and the fan pass `tone="ink"`.

## Tests

- Family maths: unchanged tests, plus a tree linked from a saved book equals
  the tree built fresh, and a pool that gains one shape measures only that
  shape's pairs.
- Climb: families ordered by spaces then ink; the representative is the
  most-drawn member; `familyOf` resolves a full value, a bare key, and a
  value whose key is gone but whose sequence remains.
- Index: rows carry enclosed spaces; version 1 rows are ignored.
- Filter: matches the whole family once ready and the exact shape before.
- Chip: reads "Mandala".
- Sorter and sections: spaces then coverage; the three new section names
  and their order.
- Engine: with a Mandala filter applied, sections are levels, easiest first.
- Browser, on the worktree's port, at 412 by 915, 707 by 772, 1440 by 900
  and 200% zoom: the page does not scroll; boxes fill the area; the slider,
  step buttons and keys move a page; a tap lands on the family's sequences
  under level headings; the chip clears; a reload opens instantly from the
  book; the door fans three ink stills.

## As built

Measured in the worktree's browser on 2026-11-11, root font 16 px at every
size, page `scrollHeight` equal to `clientHeight` at every size.

| Viewport | Host | Boxes on a page | Box side |
| --- | --- | --- | --- |
| 375 by 667 | sheet | 2 by 2 | 154 |
| 412 by 915 | sheet | 2 by 3 | 168 |
| 707 by 772 | sheet | 4 by 3 | 128 |
| 960 by 412 | sheet | one row of 9 | 90 |
| 820 by 1180 | sheet | 5 by 4 | 149 |
| 1440 by 900 | rail | one row of 4 | 96 |
| 1440 by 900 at 200% zoom | sheet | one row of 4 | 134 |
| 1920 by 1080 | rail | 4 by 2 | 96 |
| 2560 by 1440 | rail | 3 by 4 | 131 |
| 3840 by 2160 | rail | 3 by 7 | 128 |

Screenshots: `assets/2026-11-mandala-climb/built-door-desktop.webp`,
`built-phone-start.webp`, `built-phone-results.webp`, `built-fold.webp`,
`built-desktop-1440.webp`, `built-desktop-2560.webp`.

Known and left as they are:

- Fixed 2026-11-11 (review pass): a restored Mandala filter no longer
  depends on the picker being mounted. The browse engine hands its pool to
  the index while a Mandala filter is active and reports
  `isResolvingFilters` until the index is measured, the families are ready
  and the whole pool (later stages and the T&D extras included) has
  arrived. Until then the results show their skeleton and the counts read
  "Counting matches", never "No sequences found".
- Fixed in the same pass: a family's sequences are grouped by level only
  (`"level"` grouping in `browse-section-manager.ts`), with no letter or
  length sub-headings. The grid shows one card per word, as everywhere in
  the gallery, so a heading's number is cards and the total is sequences.
- Fixed in the same pass: the phone and Fold sheet passes
  `activeMandalaValues`, so the applied box is ringed there too; the door's
  empty slots wear the other doors' card and shimmer until stills exist.
- The remembered page wins over the applied family's page within a
  session, so after paging away (or changing layout) the picker can open on
  a page that does not show the ringed box.
- At a short desktop window (1440 by 760) the rail's screen scrolls inside
  the pane, as the rail's owner rules for every editor.

## The test page

`/test/mandala-families` stays as the place to compare thresholds and orders
by eye, should a choice above be overturned. It is not linked from the app.

## Left out

Names for families; a still on the Mandala chip or on sequence cards; a
second screen of a family's variations; storing a family on the published
record; building families on the server; a Mandala sort that follows family
order exactly; any change to how sequence cards colour their hands.
