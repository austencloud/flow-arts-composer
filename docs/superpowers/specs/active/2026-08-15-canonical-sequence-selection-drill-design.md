---
status: active
value: null
effort: null
remaining: "Verify shared canonical selection behavior and the specified seven viewports before implementing any missing drill."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Canonical Sequence Selection Drill

**Date:** 2026-08-15  
**Status:** Approved

## Outcome

Every generic request to choose one sequence uses the canonical Gallery filter
drill. `SequencePickerModal` keeps its public callback contract, but no longer
renders the legacy compact picker directly.

## Capability ownership

- `BrowseEngine` owns source loading, locked constraints, search, sorting, and
  the filtered sequence order.
- `FilterWorkspace` and `GalleryDrill` own every filter interaction.
- `BrowsePanel` owns the selectable result grid.
- `SequencePickerModal` owns only modal chrome, the compact-screen transition
  between drill and results, full-sequence hydration, and the `onSelect`
  callback that its callers already use.

## Interaction contract

1. Opening a picker enters the filter drill.
2. Wide layouts show the drill and the live selectable grid together.
3. Compact layouts use the drill's existing `onEject` seam to enter the same
   result grid; its Back control returns to filters without clearing them.
4. Selecting a card hydrates it, invokes `onSelect`, and closes the modal.
5. `requiredBeatCount` remains a locked filter. Source selection,
   `initialSource`, and `showSourceToggle` retain their existing behaviour.
6. The modal expands at the project's 1680 and 2600 wide-screen seams so its
   filter catalog and result grid are not stranded in a narrow central rail.
7. Phone layouts suppress only the unfiltered duplicate Done shortcut; the
   visible Show all route remains available and filtered screens retain Done.

## Scope

Changing the one `SequencePickerModal` owner updates all generic consumers,
including Video Lab, Train, Labs, Arrange, 3D, Inbox, and Guide. Purpose-built
curated pickers, such as the Personal Museum favourites placement grid, remain
separate because their host-defined sequence set is a different contract.

## Verification

- Run the focused type/style checks for the shared component.
- Inspect the picker at 1920×1080, 2560×1440, 3840×2160, 1440×900, 820×1180,
  960×412, and 375×667.
- Confirm source switching, a locked-length caller, compact Back navigation,
  and card selection through the Video Lab entry point.
