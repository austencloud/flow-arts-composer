# Browse header chrome

Austen, 2026-10-20: the Browse screens keep a minimalist look, but their chrome
does not match. The Browse pill sat inside each screen next to that screen's
own controls, three screens drew three different headers, and the collections
list printed its title twice. He wants one consistent navigation bar across
Browse, especially since navigation is the point of browsing. Scope: Browse
only. Approach A (one fixed owner) chosen 2026-10-21.

## The bar

- One strip across the top of the Browse pane, edge to edge, right of the
  sidebar, rendered once by `BrowseModule` above the screen Crossfade. It
  never fades or moves when the content changes.
- Fixed logical size (the 4K rule forbids scaling controls with the window):
  44px controls, 64px tall on desktop, 56px on phones. Theme background at
  88% with a hairline underneath, the same look the Community strip had.
- Left: a 44px back box with a chevron, labelled for screen readers with the
  parent crumb's name. It opens the crumb before the current one. On Browse
  home it is not rendered and its space is kept.
- Trail: earlier crumbs are pressable pills; the current crumb is plain bold
  text (only clickable things get the box look). Separators are quiet
  chevrons. On phones the earlier crumbs hide and only the back box and the
  current crumb remain.
- Right: each screen's own actions as pill buttons, icon plus label on
  desktop, icon only on phones. A screen in selection mode hands over its
  selection toolbar, which replaces the trail row through a Crossfade.
- The Community sibling switcher (Sequences / Collections / Visuals) on
  phones moves out of the header into a row directly under the bar.

## The trail

`buildBrowseTrail` in `src/lib/shared/browse/navigation/browse-trail.ts` is a
pure function of the Browse location, whether Browse home is open, and an
optional leaf label. Labels come from the sidebar's tab and group definitions
so the bar and the sidebar always agree.

| Screen | Trail | Back |
| --- | --- | --- |
| Browse home | Browse | none |
| Community sequences, collections, visuals | Browse > Community > Sequences | Browse home |
| A visuals type | Browse > Community > Visuals > Tunnels | Visuals |
| A public collection | Browse > Community > Collections > name | Collections |
| Saved work, Drafts, Your visuals, Your videos, Following | Browse > Your library > Saved work | Browse home |
| Your own, shared or smart collection | Browse > Your library > Saved work > name | the collections list |
| A collection opened from Following | Browse > Your library > Following > name | Following |
| Your visuals type | Browse > Your library > Your visuals > Tunnels | Your visuals |

The Community and Your library crumbs open Browse home scrolled to that
group. A leaf name that arrives late (a collection loading) gets its slot
reserved and fades in; the route's `collectionName` filter seeds it.

## Plumbing

- `BrowseHeaderState` (`src/lib/shared/browse/state/browse-header-state.svelte.ts`),
  provided through `browse-header-context.ts` from `BrowseModule`. A screen
  calls `register(entry)` in an effect; the entry's fields are getters so the
  bar follows the screen's state without re-registering; the effect cleanup
  clears the slot. Entries carry `leaf`, `leafContent` (a snippet while
  renaming), `actions`, `toolbar` and `accent`.
- `BrowseHeaderBar.svelte` (`src/lib/features/browse/shared/components/`)
  reads the navigation context, the header state and a `compact` flag and
  owns all bar styling.
- Lists register nothing. Collection pages register their name, their
  action buttons and their selection toolbar; their owner / count /
  permission line moves to the first row of the content area with the icon.
- Removed: `BackToBrowseButton` and its call sites, the Community strip, the
  Your library list headers, the art and performances bars, the back buttons
  in the collection and smart-collection detail views, the duplicate
  "Collections" heading in the community list, and BrowsePanel's back pill
  where the bar now covers it.

## Verification

Unit tests for the trail builder (every table row, back target, leaf seeding).
Browser pass at 375x667, 960x412, 820x1180, 1440x900, 1920x1080, 2560x1440 and
3840x2160 on the collections list, a collection, Saved work and Browse home,
plus reduced motion. Nearest existing Browse tests rerun.
