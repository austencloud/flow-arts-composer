---
status: active
value: null
effort: null
remaining: "Verify Feedback Manage layout, focus, and capability ownership against current adaptive workspace."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Feedback Manage Adaptive Workspace

## Outcome

The Manage tab uses the workflow representation that fits its container. A
four-lane Kanban remains available when every lane can hold a useful card. Fold
portrait, tablets, phones, and short landscape windows use a focused status
queue instead of shrinking four lanes until their content disappears.

## Composition

| Container        | Composition                                                                      | Interaction                                                   |
| ---------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `< 600px`        | Search/filter toolbar, horizontally scrollable status tabs, one full-width queue | Select a card, then use the existing detail status selector   |
| `600–1319px`     | Vertical workflow rail and one full-width queue                                  | Status rail remains visible while the queue scrolls           |
| Height `< 480px` | Dense rail-and-queue composition, regardless of width                            | Preserves working height on Fold/phone landscape              |
| `1320–2599px`    | Four-lane Kanban and the existing action rail                                    | Existing drag, defer, archive, trash, undo, and redo behavior |
| `>= 2600px`      | Four expanded lanes with two card tracks per lane                                | Same Kanban behavior with useful 4K density                   |

The mode is derived from the rendered board container with `ResizeObserver`,
not from a named device, user agent, or global viewport query. Fold/unfold and
orientation changes therefore recompose without resetting the selected item,
active status, filters, or search.

## Capability ownership

Search terms: `KanbanMobileView`, `FeedbackStatusSelector`, `onOpenArchive`,
`getDeferredItems`, `FeedbackFilterBar`, `setActiveStatus`, and `updateStatus`.

- Layout classification is new feature-local pure domain logic owned by
  `feedback-manage-layout.ts`.
- Board state remains owned by `kanban-board-state.svelte.ts` and is extended
  with the current layout mode.
- Status changes continue through `FeedbackManageState.updateStatus` and the
  existing detail selector. The queue does not introduce swipe-to-delete or a
  second transition implementation.
- Search and filtering reuse `FeedbackFilterBar` and the existing manage-state
  filters.
- Archive and deferred access compose the existing archive view callback.
- Wide drag/drop continues to use `KanbanDesktopView` and its existing dialogs.

## Accessibility and layout constraints

- Essential labels remain at least 14px; supplementary counts remain at least
  12px.
- Navigation controls retain the project touch-target floor.
- Queue tabs are scrollable on the narrowest phone instead of compressing their
  glyphs and labels.
- The status rail uses semantic tabs and the active queue remains the associated
  region.
- No destructive gesture is added. Delete remains behind the existing detail
  confirmation.
- Reduced-motion behavior is retained.

## Verification contract

The pure classifier is unit tested at every width and height boundary. Runtime
verification covers authenticated live feedback at 3840×2160, 2560×1440,
1920×1080, 1440×900, 820×1180, 749×750, 960×412, and 375×667. Each frame is
checked for clipped titles, usable controls, horizontal overflow, dead space,
and the expected composition mode.
