# Generate Card Morph

Date: 2026-09-17
Status: design approved in conversation ("send it"); ready for an
implementation plan
Companion: `2026-09-17-tnd-card-design.md` adds a fourth card that uses this
morph. Build this spec first.

## Problem

Customize, LOOP and Setups are bento cards on `/create/generate`. Tapping one
opens a `Drawer`: a 480 to 620 px right panel on side-by-side layouts, an
85dvh bottom sheet on stacked ones. The panel slides in over the workspace,
dims everything behind a backdrop, and covers part of the sequence the user
is generating. Nothing connects the card that was tapped to the panel that
appears.

The settings grid already has the room. At 1920x1080 the grid is 755 px wide;
the drawer that covers it is 576 px. The grid's container is
`position: relative` with a comment that reads "for LOOP expanded overlay",
and `GenerationSettingsOverlay` (`position: absolute; inset: 0`,
`entrance="scale"`) still describes itself as covering "a card that is
already there". The in-grid overlay was the original design; the drawer
replaced it.

## Decision

A tapped card grows into its workspace and its options appear inside the
grown card. An X (or Escape) shrinks it back into its slot. No drawer, no
backdrop, no bottom sheet.

One morph, two destinations:

- Side-by-side layouts (`isDesktopLayout`): the card fills the bento grid
  stage (`.card-grid-stage`). The Level toolbar above the grid stays visible.
- Stacked layouts (portrait phones, portrait tablets): the same card fills
  the viewport, bottom nav included. Measured on 2026-09-17 at 375x812 with a
  sequence on screen, the settings panel is 375x341; a Customize drill or
  the TnD grids do not fit there.

The hosts are Customize, LOOP, Setups, and TnD (companion spec). Word input
keeps its own full-viewport overlay; it is not a card that grows.

## Motion owner

Same-document View Transitions through `startMorph` from
`src/lib/shared/transitions/results-morph.ts`, with names stamped by
`claimedViewTransitionName`. This is the owner the gallery landing to
workspace morph and the shape matrix mandala morph already use, and it is the
only route that animates one element between two DOM positions (a grid
child and a body-level portal) without a feature-local FLIP.

Alternatives considered and rejected:

- `createLayoutMotion` (`layout-flip.ts`) FLIPs survivors of a recomposition.
  It cannot carry a card into a portaled viewport element, and it would have
  to fake a content swap inside the card.
- A manual FLIP from the card rect to the panel rect is a feature-local
  animation stack, which `no-layout-shift.md` forbids.

Mechanics:

1. Each host card's `.card-wrapper` claims `generate-card-<id>` while its
   panel is closed (`enabled: !open`).
2. The expanded panel root claims the same name while open.
3. Opening and closing call `startMorph(() => panelState.open…())` and
   `startMorph(() => panelState.close…())`. The claim moves inside the same
   `flushSync` the browser captures, so the card releases the name and the
   panel takes it in one pass.
4. The browser animates the group between the two rects and cross-fades old
   content into new. `::view-transition-group(generate-card-*)` gets
   `--duration-dramatic` and `--ease-in-out` in `view-transitions.css`, next to
   the other named groups.
5. `startMorph` returns `null` when it ran plainly (no View Transitions
   support, `prefers-reduced-motion`, or a morph already in flight). The host
   then passes `GenerationSettingsOverlay entrance="scale"` on browsers
   without support and `entrance="none"` under reduced motion, so the panel
   appears immediately there. With a transition it passes `entrance="none"`
   as well; the transition is the entrance.
6. A second tap during a morph applies plainly (the owner's in-flight guard).
   State is always consistent; only the motion is skipped.

`docs/architecture/canonical-capabilities.md` gets a row: "A card growing
into its workspace" routes to `startMorph` plus `claimedViewTransitionName`.

## Components

### `ExpandedCardStage.svelte` (new, `cards/`)

Renders whichever card is open. Props: `panelState`, `isDesktopLayout`, and
the content callbacks each panel needs today (the same values
`GeneratePanel` passes the three drawers).

- Reads `panelState.openGenerateCard` (see state below) and renders exactly
  one of `CustomizeExpandedOverlay`, `LOOPExpandedOverlay`, `SetupsPanel`, or
  `TnDPanel` (companion spec).
- Destination: on side-by-side it renders in place as a child of
  `.card-grid-stage`, `position: absolute; inset: 0`. On stacked layouts it
  renders through the existing `portal` action (`modals/portal.ts`) at body
  level, `position: fixed; inset: 0`, above the bottom nav at the z-index the
  retired drawers used. A `position: fixed` element cannot live inside the
  settings container: `container-type: size` applies layout containment,
  which makes the container the containing block for fixed descendants.
- Stamps `generate-card-<id>` on its root with `claimedViewTransitionName`.
- Focus moves into the panel on open (`GenerationSettingsOverlay` already has
  the close button; the stage focuses the panel root) and returns to the card
  that opened it on close.
- Escape closes. There is no backdrop and no outside-click dismissal; the
  workspace beside the grown card stays interactive.
- Reuses `GenerationSettingsOverlay` as the panel chrome (title, X, accent
  surface). Fuse keeps using it and `GenerationSettingsDrawer` unchanged.

### Host cards

`CustomizeCard`, `ConsolidatedLOOPCard`, `PresetCard` (Setups) and the TnD
card stay as they are, except the wrapper in `CardBasedSettingsContainer`
carries the claimed name and the open handlers route through `startMorph`.

### `SetupsPanel.svelte` (new, `presets/`)

`PresetDrawer.svelte` is 630 lines with its content inline inside `Drawer`
and `DrawerHeader`. The content (segmented source control, saved rows,
community rows, sign-in prompts, ConfirmDialog, skeletons) moves into
`SetupsPanel.svelte` unchanged. `PresetDrawer.svelte`,
`PresetDrawer.svelte.test.ts` and its screenshots retire; the test moves to
the panel.

### Retired

`modals/CustomizeDrawer.svelte`, `modals/LOOPDrawer.svelte`,
`presets/PresetDrawer.svelte`, and the three `<…Drawer>` mounts in
`GeneratePanel.svelte`. `GenerationSettingsDrawer.svelte` and
`modals/portal.ts` stay (Fuse and the stacked destination use them).

## State

`src/lib/shared/create/state/panel-coordination-state.svelte.ts` keeps its open flags and methods
(`isCustomizeOverlayOpen`, `isLOOPPanelOpen`, `isPresetDrawerOpen`, the
`open…`/`close…` pairs, `closeAllPanels`, `isAnyPanelOpen`) so every existing
caller, the HMR bridge in `customize-overlay-hmr.ts`, and the bottom-nav
hiding logic keep working. It adds one derived getter:

```ts
get openGenerateCard(): "customize" | "loop" | "preset" | "tnd" | null
```

At most one card is open; opening one closes the others (today's drawers
already behave that way through `closeAllPanels`).

## Layout while a card is open

The grid keeps rendering underneath the grown card on side-by-side layouts.
Level changes still reflow the grid; the panel is a sibling of `.card-grid`
inside the stage and is not part of the `{#each}` flip. The grown card's
inner layout is the panel's own (`LOOPExpandedOverlay layout="responsive"`,
`SettingsDrillPanel` in Customize), sized by the stage instead of the drawer
width. Both were designed for a card-sized region before the drawer existed.

## Verification

- Vitest: `openGenerateCard` derivation and exclusivity;
  `ExpandedCardStage` renders the right panel per id and destination per
  layout; the claim moves from wrapper to panel on open and back on close
  (`countViewTransitionNameClaims`); Escape closes; focus returns to the
  card.
- Browser, the seven-viewport matrix (375x667, 960x412, 820x1180, 1440x900,
  1920x1080, 2560x1440, 3840x2160): open and close each of the four cards,
  screenshot both endpoints and one mid-transition frame per viewport tier,
  confirm the destination (stage vs viewport) per layout mode, confirm no
  console errors and no `InvalidStateError` from duplicate names.
- Reduced motion: open and close with `prefers-reduced-motion: reduce`
  emulated; state changes immediately, nothing animates.
- Interrupt: tap open then immediately tap X; final state is closed, no
  stuck claim.

## Out of scope

Word input overlay, the Fuse settings drawer, and any change to what the
panels contain. The TnD card's content is the companion spec.
