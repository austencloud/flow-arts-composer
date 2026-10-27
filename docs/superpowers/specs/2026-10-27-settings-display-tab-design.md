# Settings Display Tab — Design

**Date:** 2026-10-27
**Status:** Approved by Austen in chat (2026-10-27)
**Author:** Austen + Claude (Fable 5.1)
**Branch:** `codex/settings-display-tab`
**Supersedes:** `docs/superpowers/specs/2026-06-17-visibility-tab-retirement-design.md`
(its "Edit without a loaded sequence → not a real gap" finding is reversed below)

## Problem

On 2026-06-17 the Settings → Visibility tab was retired as a "redundant third
front-end" because the right-click / long-press menus and the viewer drawer
already drive the same global state. Four months on, Austen hit the gap that
spec dismissed: a grid switched off in an earlier session has no visible way
back on. The only routes are

- a long-press or right-click on a step cell / option card / choreo card, a
  gesture nothing in the app advertises; or
- opening the full sequence viewer, which is expensive to load, and finding
  the Display panel inside its drawer.

Two further facts make this worse than it looks:

- **There are two grid settings, not one.** The pictograph grid
  (`VisibilityStateManager.showGrid`, persisted through the settings service)
  and the animation-canvas grid (`AnimationVisibilityStateManager.gridMode`,
  persisted in `localStorage`). Turning one back on does not touch the other,
  and each has its own hidden menu.
- **The old tab failed for a fixable reason.** It re-typed every label and
  handler for ~25 switches in 2,860 lines, grew two parallel desktop/mobile
  control blocks, and drifted into seven dead controls (an unmounted animation
  preview, a start-placement handler with no button, an elemental toggle whose
  click did nothing, etc.). The fix is one owner per switch list, not the
  absence of a tab.

## Decision

Restore a **Display** tab in Settings, built on three live stages, each a real
renderer bound to the real global state, with the switches sitting under the
thing they change. A tap changes the stage in front of you and every
pictograph, canvas and card in the app at once. Nothing is example-only state.

Austen's choices in the design conversation:

- Keep the pictograph grid and the canvas grid **separate**, and surface both.
- Cover **everything the sequence viewer can toggle** as a display preference,
  as the old tab did; build it better rather than smaller.

## The tab

### Placement

`SETTINGS_TABS` in `src/lib/shared/navigation/config/tab-definitions.ts`
gains a `display` Section after `preferences` and before `theme`:

- `id: "display"`, `labelKey: "tab_settings_display"` ("Display"),
  `descKey: "tab_desc_settings_display"` ("What pictographs, playback and
  cards show"), icon `fas fa-eye`, its own colour/gradient in the existing
  style.
- `SettingsModule.svelte` renders `DisplayTab` for `activeTab === "display"`.
- Guest access: same as `preferences` (check `guest-access-config.ts` and
  mirror whatever `preferences` has).

Theme stays what it is (background + dark mode). Display is what the notation
shows.

### Three sections, one pattern

Each section is a `workspace-section` with a `SettingsSectionHeader`, a
`<figure class="stage">` reserving its geometry (fixed aspect ratio before
any renderer mounts), the control group under the stage, a one-line caption
teaching the gesture, and a quiet "Reset to defaults" `PanelButton` in the
header's `action` snippet. Follow `PropTypeTab.svelte` for the section,
stage and figcaption structure and its container-query tiers.

#### 1. Pictograph

- **Stage:** one real `PictographContainer` showing letter A (build the data
  the way `PictographAnatomyConceptExperience.svelte` does:
  `letterQueryHandler` + `createSequenceData`, blue and red motions, 8-point
  grid). It reads the global `getVisibilityStateManager()` like every other
  pictograph, so it needs no wiring to react. Square, capped around 280px.
- **Controls:** chips rendered **from the same builder the long-press menu
  uses**, `buildPictographContextMenuItems` in
  `pictograph-context-menu-builder.ts`. Flatten its "Grid & Points" and
  "Glyphs" submenus plus the Step Numbers item into one grid of
  `FilterChipBase mode="toggle"` chips through a small new shared component
  `MenuItemChipGrid.svelte` (owner: `src/lib/shared/components/context-menu/`)
  that takes `ContextMenuItem[]` and renders `label` / `checked` / `action`.
  Order: Grid, Hand points, Non-radial points, Step number, TKA, Hand TnD,
  Prop TnD, Placements. Then two chips the menu does not carry but the export
  panel does: Reversals (`reversalIndicators`) and Hand colour key
  (`handColorKey`) — add both to the builder's Glyphs submenu so the menu and
  the tab stay one list (the menu grows two rows; that is intended).
- The builder's labels are hardcoded English today. Route them through `t()`
  as part of this work (reuse `playback_audit_visual_grid`,
  `learn_ui_hand_points`, `viewer_ui_non_radial`; add keys for the rest).
- **Flash guard:** await `vm.ensureSettingsLoaded()` before rendering the
  chip grid (render the stage immediately; chips fade in with `growFade`).
- **Reset:** add `resetToDefaults()` to `VisibilityStateManager` (the
  defaults are already the literal in its constructor; lift them to a
  `DEFAULT_VISIBILITY_SETTINGS` constant). Notify observers and persist.
- **Gesture caption:** "Long-press or right-click any pictograph in the app
  for these same switches." The stage itself hosts
  `PictographContextMenuHost`, so the caption is true of the stage too.

#### 2. Animation

- **Stage:** the real `AnimatorCanvas` playing a short 4-step loop built from
  the same letter data (no Firestore load; the old tab's orphaned preview
  fetched sequence "B" from the network). Bound to the **global**
  `getAnimationVisibilityManager()`, mirroring its settings into the canvas
  props through its observer the way `DisplayPanel.svelte` already does
  (`let gridVisible = $state(vm.isGridVisible())` + observer refresh).
  Landscape, reserved aspect ratio.
- **Lazy and quiet:** `DisplayTab` imports the animation stage with a dynamic
  `import()` so Settings pays nothing for the engine until this tab opens.
  The loop pauses when the stage leaves the viewport (`IntersectionObserver`)
  and is destroyed when the tab unmounts. Stepping/continuous follows the
  user's stored playback mode; speed follows their stored BPM.
- **Controls:** mount the viewer's existing `DisplayPanel` as is
  (`showWordToggle` on, `showMotionVisibility` off, no `sequence`), which
  gives Grid (on/off), Props, Step numbers, TKA glyph, Hand TnD, Prop TnD,
  Word header, Mandala, Paths, Progress bar. Its on/off Grid chip sets
  `gridMode` to `"8point"` / `"none"`; the canvas menu's `auto` mode still
  reads as on and is not surfaced here.
- **Deliberately excluded** (behaviour, not display; they stay in the viewer
  and the canvas menu): effort, playback mode, tempo, effects and presets,
  trails and tracking, path shape, dark mode (Theme owns it), grid join
  (per-sequence), 3D view.
- **Reset:** add `resetDisplayDefaults()` to
  `AnimationVisibilityStateManager` that resets only the visibility keys and
  `gridMode`, leaving effort, path policy, playback mode, speed, effect and
  dark mode alone. The existing `resetToDefaults()` is too broad for this
  button and must not be used here.
- **Gesture caption:** "Long-press or right-click the playing canvas anywhere
  for these and more." The stage hosts `CanvasContextMenuHost` with no
  `gridJoin` controller.

#### 3. Card

- **Stage:** a real `ChoreoCard` (the shared sequence-viewer one) of the same
  4-step example sequence, with `userName` from `authState` and a translated
  "Your name" fallback, honouring the stored image theme. Landscape, reserved
  aspect ratio.
- **Controls:** lift the card-content rows out of `ExportImagePanel.svelte`
  into one shared component `CardContentToggles.svelte`
  (owner: `src/lib/shared/share/components/`), mounted by both the export
  panel and this tab. It exposes: Word, Steps, Level, LOOP glyph (header
  row); Start placement (show / hide only — the row/column layout and the
  column count are per-step-count overrides and stay in the export panel);
  QR and Mandala (info cell); and the image theme `SegmentedControl`
  (Light / Dark via `ExportOptionsStateManager.setImageDarkMode`). The export
  panel's pictograph-glyph row is **not** part of this component: those are
  the pictograph manager's switches, already covered by section 1.
  Notes text, creator name, birthday and custom name are content, not
  display; they stay in the export panel.
- **Reset:** add `resetDisplayDefaults()` to `ImageCompositionStateManager`
  resetting the fields above to `DEFAULT_IMAGE_COMPOSITION_SETTINGS`, plus
  `ExportOptionsStateManager.setImageDarkMode(default)`. Column and layout
  overrides are untouched.
- **Gesture caption:** "Right-click or long-press a card in the viewer for
  the same switches." The stage hosts `ChoreoCardContextMenuHost`.

### Layout

- Container query on the tab (`display-tab`). Three equal columns side by
  side from about 64rem; two-plus-one is not used — below that, one stacked
  column with **all three sections visible**. No segment control hiding two
  thirds of the controls (the old mobile layout did this and users never
  found the other panels).
- Stages reserve geometry (`aspect-ratio` + max width) so the renderers
  mounting late never shift the chips. Stacked, each stage is capped so three
  sections fit a phone screen in roughly two scrolls.
- Chips wrap in a `chip-wrap` row like the export panel's. Controls do not
  grow with viewport width; on 2560/3840 the band widens per `--shell-w` and
  nothing enlarges (see `4k-native-layout.md`).
- Motion: chips entering after the flash guard use `growFade`; the stage
  content swap for the lazy animation stage uses `Crossfade`; nothing else
  animates on first paint.

### Files

New

- `src/lib/shared/settings/components/tabs/DisplayTab.svelte` (beside the
  other settings tabs; its sections live in `tabs/display/`)
- `src/lib/shared/settings/components/tabs/display/DisplaySection.svelte`
  (the frame the three sections share)
- `src/lib/shared/settings/components/tabs/display/PictographDisplaySection.svelte`
- `src/lib/shared/settings/components/tabs/display/AnimationDisplaySection.svelte`
  (dynamically imported)
- `src/lib/shared/settings/components/tabs/display/CardDisplaySection.svelte`
- `src/lib/shared/settings/components/tabs/display/display-example-data.ts`
  (letter A pictograph + the 4-step example sequence; one source for all three
  stages)
- `src/lib/shared/components/context-menu/MenuItemChipGrid.svelte`
- `src/lib/shared/share/components/CardContentToggles.svelte`

Changed

- `tab-definitions.ts` (new Section), `SettingsModule.svelte` (render
  branch), `guest-access-config.ts` if needed
- `pictograph-context-menu-builder.ts` (translated labels; Reversals and Hand
  colour key rows)
- `visibility-state.svelte.ts` (`DEFAULT_VISIBILITY_SETTINGS`,
  `resetToDefaults()`)
- `animation-visibility-state.svelte.ts` (`resetDisplayDefaults()`)
- `image-composition-state.svelte.ts` (`resetDisplayDefaults()`)
- `ExportImagePanel.svelte` (mounts `CardContentToggles`)
- `messages/*.json` — new keys in all nine locales: tab label and
  description, three section titles, three gesture captions, "Reset to
  defaults", "Your name", and the pictograph menu labels that lack keys.
  Wording in languages Austen cannot read is the implementer's call
  (`feedback_language_decisions_are_coordinators`).
- `docs/architecture/canonical-capabilities.md`: record `MenuItemChipGrid`
  (menu entries rendered as chips) and `CardContentToggles` (card content
  switches) as owners.

### Ownership statements (primitive-discovery)

- Reusing `DisplayPanel` for the animation switches.
- Reusing `buildPictographContextMenuItems` as the single list of pictograph
  switches; composing it in new shared presentation `MenuItemChipGrid`.
- Extending `ExportImagePanel`'s card-content rows into shared owner
  `CardContentToggles`, consumed by both.
- Reusing `PictographContainer`, `AnimatorCanvas`, `ChoreoCard` and the three
  context-menu hosts for the stages.
- Extending the three state managers with reset methods.

### Not in scope

- Merging the two grid settings. Austen chose to keep them separate.
- Any change to the viewer drawer's layout.
- The `stepNumbers` animation key being forced true on load (pre-existing;
  note it in the handoff, do not fix here).
- Surfacing the canvas grid's `auto` mode.

## Verification

- `MenuItemChipGrid.svelte.test.ts`: renders one chip per item, `checked`
  drives `active`, click calls `action`, `keepOpen` items do not close
  anything (there is nothing to close).
- `CardContentToggles.svelte.test.ts`: each chip calls the right manager
  method; `ExportImagePanel`'s existing tests stay green after the lift.
- Unit tests for the three reset methods: display keys return to defaults,
  non-display keys (effort, path policy, column overrides, notes text) are
  untouched, observers fire once, persistence written.
- `pictograph-context-menu-builder` test (exists or add): the two new rows
  appear and toggle the right keys.
- Browser: full seven-viewport pass on `/settings` → Display (new surface),
  both container tiers, stacked and side by side; both endpoints of at least
  one chip per section with the stage visibly changing; reduced motion;
  200% zoom reflow. Then the `ui-bust` aesthetic review, since this is a new
  surface.
- Performance evidence: opening Settings → Preferences loads no
  animation-engine chunk (network list); opening Display does; leaving the
  tab stops the render loop (no further `requestAnimationFrame` callbacks
  from the stage).
- `npm run test:changed` before `wt:finish`; `wt:finish` runs the gate.

## Delivery

Implementation runs in `E:/worktrees/tka-platform/settings-display-tab` on
`codex/settings-display-tab`. Finish with
`npm run wt:finish -- codex/settings-display-tab --route /settings/display`
from the primary checkout, then verify the Display tab on
`https://localhost:5173/settings/display` (the tab has its own route) and hand
Austen that link.

## Revision: 4K composition (2026-10-27)

Austen reviewed the merged tab on a 3840×2160 viewport at 100% scaling: "Looks
pretty bad on 4K. We have to make sure this feels native on every single
device. Look how small a lot of these options are. Look how much empty space
is underneath."

What changed:

- **The columns fill the height.** At the three-column tier (tab ≥ 64rem) the
  workspace takes the tab's full height, each section takes its column, and
  the stage takes every pixel the switches leave. The stage area is a size
  container; the frame is the largest box of its ratio that fits it
  (`min(100cqi, 100cqb × ratio)`), so the old `--stage-max-w` caps are gone at
  this tier. Below 64rem the stacked layout and its 15rem stage cap stay; a
  wide stacked section puts its switches beside the stage on a fixed 2 : 3
  split so every section's switches get the same width.
- **The band grows with the window's height.** A 2600px shell makes 4K
  columns ~830px wide and ~2000px tall, which no stage can fill. At the
  column tier the tab's band is `max(--shell-w, (100dvh − 12rem) × 2.6)`, so
  it stays the shell on a laptop and approaches full width on tall 4K and
  1440p windows. The Display tab is therefore wider than the other settings
  tabs there.
- **One switch style: picture tiles.** All three sections use `.rt-chip`
  tiles in the shared `.rt-tile-grid` (rail-tile.css): the pictograph and
  card switches through the new `MenuItemTileGrid` (each menu item's icon is
  its picture; every pictograph menu item and card toggle now has an icon),
  the animation switches through DisplayPanel's new `hostSized` mode. The
  host sets one ladder on each section's switch box: 3 columns on a phone,
  4 from 22rem, 5 from 30rem, with the picture size a registered length
  computed from that box, so equal widths give identical tiles. Ten tiles run
  5×2, 4+4+2 centred, or 3-wide on a phone. The card groups its seven tiles
  under quiet Header / Start / Info labels, flowing on the same columns
  (5: Header + Start, then Info + Theme; 4: Header, then Start + Info, then
  Theme; 3: Header 2×2 beside Start). The Light / Dark control is two tiles
  wide. `MenuItemChipGrid`, the chip presentation, had no consumer left and
  was removed in review.
- **The card stage is 1.2 : 1**, the example card's own shape, instead of
  1.5, so the card is not letterboxed in its frame.
- **Card footer on small cards.** The footer's type floors at 12px, but a
  small card's band is ~12px and Georgia needs ~1.15em, so the line clipped
  at the card's edge (375×667). `CardFooter` now floors the type at the
  smaller of 12px and band ÷ 1.15, with a 1.15 line height.

Evidence (replaced, same names) in
`evidence/2026-10-27-settings-display-tab/`. Measured at root 16px:

| Viewport              | Tab scroll       | Stage frames (pictograph / animation / card) | Tiles                 |
| --------------------- | ---------------- | -------------------------------------------- | --------------------- |
| 3840×2160             | none             | 1167² / 1167² / 1167×972                     | 5×2, 227px, art 128px |
| 2560×1440             | none             | 741² / 740² / 740×617                        | 5×2, 142px            |
| 1920×1080             | none             | 536² / 535² / 535×446                        | 5×2, 101px            |
| 1440×900              | none             | 344² / 345² / 381×318                        | 4+4+2, 89px           |
| 820×1180              | stacked, scrolls | 240² beside switches                         | 4+4+2                 |
| 960×412               | stacked, scrolls | 240² beside switches                         | 4+4+2                 |
| 375×667               | stacked, scrolls | 240² over switches                           | 3-wide                |
| 200% zoom of 1440×900 | stacked, scrolls | 240²                                         | 5×2                   |

`1440x900-toggled.webp` shows Grid off in the pictograph and animation and
Word off on the card; each section's Reset restored its tiles.
