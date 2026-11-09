# Browse phone chrome: two bands above the grid

Austen, 2026-11-06, on his unfolded Fold: "i hate this layout for gods sake fix
it." From his screenshot the grid had about 37% of the screen under six stacked
bands, with "Sequences" written three times and one filter spread over three
rows. He picked this layout from sketches.

## What changes (phones and tablets, not held sideways)

- The header holds back, the title, the Filters pill and a search button.
- One band stays under it: the scope chips, on one row.
- Everything else is the grid. The Sequences / Collections / Visuals tab row
  goes, because the bottom navigation pill lists all three.
- The sort row, the prop viewing button, the applied filters, Clear all, Save
  Smart Collection, Select and zoom move into the one Filters sheet, above the
  drill. All visible buttons, no dropdowns.
- The search button swaps the header row for the search field. The field stays
  while there is text, so a search is never hidden. Its back button clears and
  closes.

Desktop keeps today's chrome. A phone held sideways keeps its side column.
Pickers and modals that reuse the panel keep their own toolbar: the new mode is
opt-in, per host.

## Cards

The black cards were the loading skeleton, not failed thumbnails. Real
thumbnails paint a few seconds later (reproduced at 707 by 772). The skeleton was
near black on a near-black scene, used random heights on purpose, and had two
columns where the grid draws three.

- The skeleton takes the grid's own column count, one even shape, and a tone
  that reads as loading. This one is everywhere the skeleton shows.
- In the new chrome, cards in one row share the row's height, with the shorter
  art centered. The art keeps its proportions: square cards would shrink long
  sequences to fit. Desktop keeps today's heights.

## Owners

Reusing: `BrowseHeaderBar`, `ExpandableSearchBar` (pinned), `SortChoice`,
`PropViewingControl`, `BrowseFilterBar` (chipsOnly), `FilterChipBase`,
`GalleryFilterSheet`, `PanelButton`, `Crossfade`, `growFade`, `flyFade`.

Extending:

- `browse-header-state`: a compact flag from `BrowseModule`, plus search and
  filters slots beside the screen's entry, so a collection's own header
  actions keep working.
- `ExpandableSearchBar`: `autofocus`.
- `BrowseThumbnailSkeleton`: even shape and tone.

Extracting from `BrowseToolbar`, which has its second consumer now:
`BrowseFiltersPill`, `BrowseZoomControl`, `browse-sort-options`.

Composition: `BrowseSheetControls`, the sheet's arrangement of the owners above.

## Hosts

Opted in with `headerChrome`: `GalleryTab`, `AllLibraryView`,
`CollectionDetailView`. Left alone: `AddSequencesSheet`,
`SmartCollectionBuilderSheet`, the sequence pickers, the workspace results panes.
