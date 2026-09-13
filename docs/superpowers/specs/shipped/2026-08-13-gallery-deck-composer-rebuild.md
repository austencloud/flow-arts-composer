# Canonical Gallery Workspace in Deck Releaser

**Date:** 2026-08-13  
**Status:** Shipped. Moved out of `active/` on 2026-09-13 during spec
reconciliation.

**Reconciliation evidence (2026-09-13):** all six named owners resolve.
`06d178647` (_feat(deck-releaser): add gallery composition and turn review_)
rewrote `GalleryComposeBoard.svelte` and `gallery-deck-source.ts`. The
composition contract is literal in the source: the engine is ephemeral and
library-only (`persistKey: null`, single `my-library` source, `engine.destroy()`
on unmount), the saved spec replays before `engine.initialize()`, the shared
`FilterWorkspace`/`GalleryDrill`/`BrowsePanel` operate on that engine directly,
the card cap is applied after ordering, and Compose hands over the visible slice
with no second query. `gallery-deck-source.ts` exports nothing beyond the deck
boundary. `gallery-deck-source.test.ts`: 14 tests pass, covering canonical order,
the cap, legacy-filter normalization and the legacy-to-spec migration. The
seven-viewport responsive contract remains browser-only evidence.

## Outcome

Deck Releaser does not own a second Gallery browser. Its Gallery source hosts
the same `FilterWorkspace`, `GalleryDrill`, and `BrowsePanel` used by Gallery and
Library, pinned to the signed-in user's library. Deck-specific UI is limited to
the card limit and the Compose action.

The visible result order is the order committed to Review. Compose does not
translate the rule into a second query or maintain a second filter model.

## Capability ownership

- `BrowseEngine` owns source loading, search, structured filters, connectives,
  sorting, result order, and counts.
- `FilterWorkspace` and `GalleryDrill` own the canonical filter interaction,
  including LOOP colors, icons, period variants, Level 1–3 controls, and length
  language.
- `BrowsePanel` owns the canonical result grid and sequence-viewer handoff.
- `GalleryComposeBoard` is a thin Deck Releaser host. It pins the engine to
  `my-library`, supplies collections, and adds the deck-size and Compose
  controls through the workspace's host-action seam.
- `SmartFilterSpec` is the persisted Gallery recipe. It stores filters, search,
  sort, direction, and connective choices.
- `gallery-deck-source.ts` owns only the deck boundary: cap an already ordered
  sequence list, stamp release cards, refresh a saved canonical rule, and
  migrate reusable fields from legacy recipes.

## Composition contract

1. Gallery mode creates an ephemeral, My Library-only Browse engine.
2. A saved `SmartFilterSpec` replays onto that engine before initialization.
   Older `GalleryFilters` recipes are translated where their axes have a
   canonical Browse equivalent.
3. The shared filter workspace and result grid operate directly on the engine.
4. The result pane shows the current engine ordering and count.
5. Deck size caps that ordered list; it does not change filter membership.
6. Compose serializes the current engine rule and hands the exact visible
   ordered sequence slice to Deck production.
7. Review receives cards and sequences built from that slice without a second
   query, and presents the saved rule through a read-only `FilterRuleStrip`.
   The Gallery recipe remains visible beside the resulting deck instead of
   collapsing into generic card-count metadata.
8. Refresh recreates the same My Library engine from the saved rule and applies
   the current library contents.

## Recipe migration

New Gallery recipes write `galleryFilterSpec`. Legacy `galleryFilters` remains
readable so previously released decks can refresh. Opening an old recipe seeds
the canonical workspace with collection, word search, active levels, lengths,
and LOOP components. The legacy tag field remains available to the legacy
refresh path because Browse does not expose a tag rule.

Once the operator composes from the canonical workspace, the recipe writes the
canonical spec and clears the legacy filter payload.

## Responsive contract

- Wide desktop and 4K use the shared split workspace: filter catalog and value
  editor beside live results.
- Desktop preserves the same interaction with fewer result columns.
- Tablet and mobile use the workspace's established step-through drill and
  pinned result action.
- Short landscape remains scrollable and keeps the Compose action in normal
  flow.
- No Deck Releaser-only filter tray, duplicate chip system, or floating card
  stack is introduced at any size.

## Silent-bug verification

- Search text serializes and replays with the structured rule.
- Filters, connectives, and sort replay through the Browse engine.
- Legacy Level 4–6 values are removed during migration.
- Legacy LOOP components and period variants seed canonical Browse values.
- Card construction preserves the workspace order and caps after ordering.
- Gallery recipe round-trip restores the canonical rule and card limit.
- Review preserves every filter label, color, search term, and connective from
  the composed rule; released Gallery decks read that rule from their recipe.
- Compose receives the current engine slice and does not query again.

## Visual verification

Inspect the production surface at 1920×1080, 2560×1440, 3840×2160,
1440×900, 820×1180, 960×412, and 375×667. Verify canonical LOOP/period
presentation, visible result counts, 44px controls, no horizontal overflow,
stable grid geometry, and an unobscured Compose action.
