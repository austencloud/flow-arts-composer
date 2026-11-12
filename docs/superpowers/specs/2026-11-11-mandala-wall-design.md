# By mandala: the wall and the mandala page

Date: 2026-11-11. Supersedes the screen in
`2026-11-11-mandala-climb-design.md` (the six-box picker in the filter rail).
That spec's engine sections still hold and are used here by reference:
Families, the order (enclosed spaces, then ink), the worker build, the Dexie
book, the Mandala filter's value and matching, the Mandala sort.

Austen's verdict on the climb: "this is the right concept", but a person who
chose to browse by mandala got six boxes in a corner and a wall of step
diagrams. Approved redesign: By mandala is a place with two screens.

## Flow

```
front door "By mandala" ─┐
rail Mandala tile ───────┼─> the wall ──tap a box──> one mandala's page ──Open──> sequence viewer
sheet Mandala tile ──────┘      ^                         │  ^                         │
                                └────── All mandalas ─────┘  └────── viewer's back ────┘
```

The place is a third view of Browse's Sequences screen, beside the front
door/workspace (`start-here`) and the grid (`browse-all`). It takes the whole
content area under the source chips: no rail, no results.

## Where it lives

`src/lib/features/browse/mandala-place/`

| File | Owns |
| --- | --- |
| `mandala-place-state.svelte.ts` | Which screen shows and where it is: `open`, `familyValue`, `sequenceId`, `wallAnchor` (the first family in view). `openWall()`, `openFamily(value)`, `chooseSequence(id or null)`, `backToWall()`, `close()`. Mirrors itself into the address and the session. |
| `MandalaPlace.svelte` | The frame: feeds the engine's pool to `mandalaIndex`, reads `mandalaClimb`, swaps wall and page with the shared `Crossfade` (`fill`). |
| `MandalaWall.svelte` | The grid and its scrubber. |
| `MandalaPage.svelte` | The hero, the step buttons, the list, opening a sequence. |

`BrowseModule.svelte` renders `MandalaPlace` when the place is open, on every
host size; phones no longer go through the filter sheet for this.

**Address.** `/browse/explore/sequences?mandala` is the wall,
`?mandala=<family value>` a mandala's page, `&seq=<sequence id>` the chosen
row. Opening the wall and opening a page each push a history entry; stepping
Simpler/Busier and choosing a row replace the current one. So the browser's
back goes page, wall, where he came from, and a reload lands on the same
screen. The family value is the filter's own `<shape key>~<sequence id>`, so
it survives a re-measure the way the filter does. A value that no longer
resolves opens the wall. The wall's place (`wallAnchor`) is kept for the
session.

**Pool.** The place hands `engine.allSequences` to the index, the pool the
gallery drill already hands it, so Everyone, Saved and the other source chips
narrow the wall. Other filters and the search do not narrow it in this
version.

## The wall

A fixed frame, top to bottom: a heading row, the grid, the scrubber. The page
never scrolls; the grid pans inside its own area, vertically (native wheel,
touch and keys; no hand-rolled panning).

- **Heading row.** A back box (to where he came from), "Mandalas", and one
  line: "Tap one to see the sequences that draw it."
- **Grid.** Every family, simplest first, row by row. Each is a pressable
  square (background, border, hover, focus) holding the representative as a
  still in the text colour (`MandalaStill tone="ink"`). No badge. Accessible
  name "Mandala, 23 sequences". Every family is in the page at all times;
  nothing is virtual, added or removed while panning, so what is in the DOM
  is what is on the wall. Off-screen stills may skip painting
  (`content-visibility`), not exist less.
- **Box size.** `repeat(auto-fill, minmax(<min>, 1fr))`, the minimum chosen by
  eye so the last third of the climb still reads as different pictures. See
  As built for the sizes chosen. Wide screens get more columns, not bigger
  type.
- **Scrubber.** Austen's slider, the shared `ValueSlider` with `ends`
  ("Simple", "Complex"), under the grid, with a step box at each end. It is
  the grid's scroll position: dragging pans the grid at once (no easing
  behind the hand), panning the grid moves the thumb. A step box moves one
  screenful of whole rows with the browser's own smooth scroll (instant under
  reduced motion) and is absent, its slot kept, at that end. Value text for
  assistive technology: "Mandalas 13 to 24 of 146".
- **Coming back** from a page returns to the same place, with focus on the
  box that was opened.
- **Loading.** Before families exist the grid shows placeholder squares in
  the final geometry (the other doors' card with `ShimmerBlock`), enough for
  the area, `aria-busy`, scrubber inert. Never an empty message while a
  build runs. A pool with nothing to draw says "No mandalas to show".

## One mandala's page

The picture is the page.

- **Head row.** A back box "All mandalas", then "Simpler" and "Busier" boxes
  that step one family along the climb. At an end the box with nowhere to go
  is not drawn; its slot stays so nothing moves.
- **Hero.** The representative, in the text colour, as large as the area
  allows, centred in a square. Stepping changes it through `Crossfade`.
  From the wall the page arrives with the standard panel swap: the app's
  tile flight is the homepage's route-to-route window and does not fit a
  swap inside one page.
- **The list.** Headed "23 sequences draw this" ("1 sequence draws this").
  Easiest level first, then shorter, then by word. Each row is one pressable
  box: the level badge, the word through `simplifyRepeatedWord`, the length
  ("8 steps"). Rows that share a word carry the app's existing variation
  label where one exists, else "Version 2". No step diagrams. The list pans
  inside its own area.
- **Choosing a row** tints the whole row (`aria-pressed`) and redraws the
  hero as that sequence's own mandala in its hand colours (`tone="hands"`),
  through `Crossfade`. Under the hero one slot of fixed height holds either
  the line "Pick a sequence to see how it draws this mandala" or, once a row
  is chosen, the primary button "Open sequence". Tapping the chosen row
  again returns to the plain mandala. On a fine pointer, hovering a row
  previews it in the hero without choosing it.
- **Opening** goes through the app's own way of opening a sequence from
  Browse, with the return path set to this page's address, so the viewer's
  back lands here with the same row chosen.
- **Watch it drawn.** Offered on the hero only if an existing component
  already draws a sequence's mandala progressively without new clockwork.
  See As built.
- **Layout.** Desktop and the Fold's inner screen: hero beside the list.
  Phone: hero on top, the list panning under it. Only the list pans.
- **States.** While families build: the hero's square and list rows as
  placeholders. A one-sequence family: the same page with one row. Ends of
  the climb: one step box.

## The Mandala filter

- The Mandala tile in the rail and in the phone sheet opens the wall.
  `GalleryMandalaEditor.svelte`, `mandala-window.ts` and its test, the
  drill's `mandala` section and the `activeMandalaValues` plumbing are
  deleted. Picking several mandalas goes away.
- Hosts that build a rule set and have no wall (Smart Collection builder,
  Add sequences, the sheet browser dock) no longer offer a Mandala tile.
- The filter type, its value and its matching stay in the engine. A restored
  filter or a saved Smart Collection that names a mandala resolves as
  before, reload fixes included.
- Its chip shows the family's small still in the text colour in place of the
  repeated word; its accessible name stays "Mandala".
- The Mandala sort is unchanged.

## Words

Sentence case, no em dashes, the adjective on the mandala. In all eleven
message files:

| Key | English |
| --- | --- |
| `browse_mandala_wall_title` | Mandalas |
| `browse_mandala_wall_hint` | Tap one to see the sequences that draw it. |
| `browse_mandala_all` | All mandalas |
| `browse_mandala_simpler` | Simpler |
| `browse_mandala_busier` | Busier |
| `browse_mandala_draw_many` | {count} sequences draw this |
| `browse_mandala_draw_one` | 1 sequence draws this |
| `browse_mandala_pick_row_hint` | Pick a sequence to see how it draws this mandala |
| `browse_mandala_open_sequence` | Open sequence |
| `browse_mandala_version` | Version {n} |
| `browse_mandala_watch_drawn` | Watch it drawn (only if built) |
| `browse_mandala_match_count` | {shown} of {total} sequences match |
| `browse_mandala_no_match` | None of these sequences match your search |
| `browse_ui_mandala_no_match` | No mandala has a sequence that matches your search |

Kept: `browse_ui_mandala_simple`, `browse_ui_mandala_complex`,
`browse_ui_mandala_simpler`, `browse_ui_mandala_more_complex` (step boxes'
names), `browse_ui_mandala_range`, `browse_ui_mandala_box_name`,
`browse_ui_no_mandalas`, `browse_ui_by_mandala`,
`browse_ui_simple_to_complex`, `browse_ui_mandala_category`,
`browse_sort_mandala`. Removed when nothing reads them:
`browse_audit_pick_mandala`, `browse_ui_grouping_mandalas`,
`browse_ui_measuring_mandalas`.

## Owners

- Slider: `ValueSlider`, reused. Motion: `Crossfade`, native scroll.
  Stills: `MandalaStill`. Words: `simplifyRepeatedWord`. Level badge: the
  sequence card's own. Opening a sequence: Browse's existing path.
- New: the place's state and its three components, created because no
  existing screen is a full-area record page inside Browse.

## Left out

Names for families; narrowing the wall by other filters; picking mandalas as
rules in the builders; a shared-element flight from box to hero; anything in
the climb spec's Left out list.

## As built

Checked on 2026-11-11 at 412×915, 707×772, 1280×800 and 2560×1440: the page's
scrollHeight equals its clientHeight on both screens at every size.

- **Box size.** Least width `clamp(148px, 9% of the grid, 232px)`, or a
  third of the grid when that is less, so a phone gets three across (121px
  at 412 wide), the Fold four (161px), 1280 seven (155px) and 2560 ten
  (233px): a wide screen gets bigger pictures, not just more of them. Stills
  are drawn at 128, 160, 200, 256 or 320 px, the first at or above the box. At 121px the complex end still reads as different line
  pictures, so the ink stroke is unchanged. Rows are sized from the measured
  column width (`grid-auto-rows`): an `aspect-ratio` button got only its 44px
  touch floor as a row and the squares overlapped.
- **Wall.** All 146 families stay in the DOM through scrubbing and stepping.
  The slider's value is the grid's scrollTop in pixels; a drag writes
  scrollTop, the scroll event writes the value back. Step boxes move
  `floor(view / row)` whole rows.
- **History.** Shallow `goto` through `url-state.ts` (`mutateCurrentUrl`), the
  repo's replacement for the deprecated `pushState`. Opening the wall and a
  page push; Simpler/Busier and choosing a row replace. Browse reads the
  address on load, on every real navigation (`page.url`) and on `popstate`.
  A screen reached by reload or link has no entry of ours under it, so its
  back boxes replace instead of going back. `mandala` is scoped to
  `/browse/explore/sequences` and `seq` is dropped from other Browse screens
  (`url-parameter-policy.ts`).
- **Return.** The wall keeps the family first in view in sessionStorage and
  focuses the opened box on return, scrolling it into view if needed.
  Opening a sequence uses `openSequenceViewer`; the viewer's back leaves the
  page with the same row chosen.
- **Page layout.** Hero beside the list from a 560px wide page (the Fold's
  inner screen is about 680px of page), above it below that; phones and the
  Fold keep Simpler and Busier in the head row. From a 1000px wide page
  (desktop, 2560): Simpler and Busier sit level with the middle of the
  picture, one on each side, the hint or Open slot under it, and the
  picture and list are centred as one pair (the list 20 to 44rem), so no
  empty band opens on one side. At 2560x1440 the hero is 1150px with about
  110px of margin each side. The hint and rows use the global type roles
  (`--font-size-base`, `--font-size-sm`, heading `--font-size-lg`) at
  every size, the hint at 80% of the text colour; no viewport ramp.
- **Hover.** Rows preview in the hero when `pointerType === "mouse"` only;
  touch and pen do not preview. Previews arm only after the mouse has
  travelled 3px from where it was first seen on the page, because a browser
  re-sends hover to a pointer resting where the list appears. Checked with
  a real click at a point over the list: the old page opened in a row's
  hand colours, the new one stays neutral until the mouse moves.
- **Search.** The Browse search bar narrows the place without regrouping
  it, matched by the engine's own `CONTAINS_LETTERS` filter
  (`mandala-search.ts`). The wall hides boxes no matching sequence draws
  (all 146 stay in the DOM, in order), and the scrubber's range and step
  boxes run over the boxes on show; with no match it says "No mandala has a
  sequence that matches your search". A page lists only matching rows,
  headed "7 of 126 sequences match", or "None of these sequences match your
  search". A chosen row keeps the picture and Open while hidden. Clearing
  the search returns the wall to the family first in view before the
  search began, also after opening a page meanwhile.
- **Settled.** `MandalaPage` and `MandalaWall` take `settled` (default
  true): until families are final for the complete pool the page keeps its
  list in placeholders, so its count and rows never change once shown; the
  hero draws as soon as it has paths. The wall only reports `aria-busy`.
- **Bare address.** `?mandala` stays bare. The root layout's arrival
  cleanup pruned route-scoped parameters with `URLSearchParams`, which
  re-serialises `?mandala` as `?mandala=`, took that as a change and wrote
  it back; every later write then started from it. The layout and
  `url-state.ts` (`writeUrl`, `mutateCurrentUrl`) now keep a key bare
  when it is bare in the current address and still empty
  (`url-bare-params.ts`).
- **Watch it drawn.** Left out. `SequenceMandala`'s `traceProgress` is driven
  by its host's clock, so offering it here would need new clockwork.
- **Hosts.** The tile and door appear only where the host passes
  `onOpenMandala` (Browse's workspace and its phone Filters sheet). The Smart
  Collection builder, Add sequences, the sheet browser dock and the library
  sheets (collection detail, all library) show no Mandala tile. A Mandala
  chip's edit reopens the wall.
- **The old picker's stuck boxes.** Not reproduced with scripted drags. The
  two boxes (12 and 17 sequences) are the last two cells of the page before
  the last, and the only cells that appear on two neighbouring pages: the
  last page is pulled back to stay full, so it shares rows with the one
  before it. Every other page change swapped all cells; only there did cells
  survive and slide (`animate:flip`) while others left in pinned grid slots.
  The likely cause is a survivor's slide interrupted by a held drag, leaving
  a pinned copy behind. The wall has no keyed add, remove or flip, so the
  fault has nowhere to occur; its box count is checked after every scrub.
- **Staged pool.** The pool arrives in two stages, so for a few seconds after
  a cold load the wall holds 111 families, then 146, keeping its place.
- **Fix pass checks.** In a private headless Chrome (the shared agent
  Chrome was unresponsive): 412x915, 707x772, 1280x800, 1600x900 and
  2560x1440; the page never scrolls and the wall holds 146 boxes at each.
  Phone and Fold page geometry measured identical before and after.
  Before and after shots: `fix-page-1600-*.webp`, `fix-page-2560-*.webp`.
- **Not verified.** Light theme (the test browser could not be switched to a
  light scene), a real finger drag on the scrubber, and 200% zoom.

Screenshots: `assets/2026-11-mandala-wall/`.
