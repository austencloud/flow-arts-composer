---
status: active
value: null
effort: null
remaining: "Verify library date normalization, recent filtering and sorting, and all-results-first UI against current browse code and runtime."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Library All: Results First

**Date:** 2026-08-06  
**Status:** Approved by Austen in the originating conversation

## Decision

`Library > All` opens on the user's sequences, sorted by the date they entered
that library. Filtering remains available from the grid, but the Gallery's
discovery chooser is no longer the Library's front door.

The Browse engine and filter components stay shared. Gallery and Library differ
only in their entry composition and the meaning of "recent":

- Gallery recent means the public browse date.
- Library recent means `dateAdded`, populated from the owning library record's
  `createdAt` when a legacy document has no explicit `dateAdded`.

An explicit sort choice continues to persist. New Library engines start on
Recent, newest first.

## Interaction

1. Selecting **All** renders the existing full-page `BrowsePanel` immediately.
2. **Filters** opens the existing `FilterWorkspace` over the same engine. Wide
   screens keep live results beside the filter editor; narrow screens keep the
   existing step-through handoff.
3. A visible **Done** button closes the filter workspace without clearing its
   rules. The full-page grid reappears with the same result set and sort.
4. Empty libraries keep the existing "Make your first sequence" action.

## Split-pane height contract

The active editor's row maximum is a ceiling, not a promised allocation. The
pane budget must:

1. reserve the catalog's natural minimum and the gap between zones;
2. give the editor enough room for its header and every bounded row at the
   largest height that fits;
3. clamp row height between the screen's declared minimum and maximum;
4. give true surplus back to the catalog; and
5. scroll only when the rows cannot fit at their declared minimum.

This replaces the current calculation that charges every row its maximum and
then relies on flex shrink, which can hide the last option in an internal
scroller.

## Reuse audit

Internal searches covered `BrowsePanel`, `FilterWorkspace`,
`GalleryFilterSheet`, `PanelButton`, `SortJumpSheet`, and the browse engine.
This work reuses `BrowsePanel` for the Library grid, extends
`FilterWorkspace` with a close outcome, and reuses `PanelButton` for the Done
control. No new UI component is justified.

The height calculation is feature-specific pure math. It belongs beside
`pane-height-budget.ts` as a named function with unit tests, not in a service.

Current Material guidance treats a feed as the quick view of many cards and a
supporting pane as secondary task UI. GOV.UK guidance likewise puts filtering
and sorting on the result collection and recommends defaults that reduce the
work needed to reach useful items. No external dependency fits this local DOM
measurement problem.

## Risks

- Persisted Library sort state must keep winning over the new initial default.
- Library normalization must not change community publication dates.
- The pane allocator is shared by Gallery and Library, so every filter category
  must be checked across all desktop tiers.
- The Done action must not clear filters or cause a sibling layout shift.

## Verification

- Unit tests for library date normalization, recent filtering, recent sorting,
  and fit-first pane allocation.
- Focused browse tests and one full `npm run check` after the implementation.
- Chrome DevTools verification of `Library > All`, Filters, Done, and Start
  position at 1920x1080, 2560x1440, 3840x2160, 1440x900, 820x1180,
  960x412, and 375x667.
- At desktop widths, measure catalog, editor, list, row, and art rectangles.
  Alpha, Beta, and Gamma must all be visible without scrolling when the three
  minimum-size rows fit.
