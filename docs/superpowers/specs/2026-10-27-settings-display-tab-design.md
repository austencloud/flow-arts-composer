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

## Revision: audit (2026-10-31)

Austen's review of the 4K revision:

> "on some choreo cards there is enough space to show both a QR code and a
> mandala. So maybe it should be QR code / mandala / both if possible / none."

> "Maybe we should have an example of a card which is 16 counts so that we
> can actually see the other options. Or you should be able to select the
> length of the card here."

> "it looks pretty bad and it gives me pictographs that have this awkwardly
> yucky gray background."

What changed:

- **Hand key and Reversals are card switches.** Only a card draws them, so
  they left the pictograph menu (`buildPictographContextMenuItems` and the
  section's order) and joined `buildCardContentToggles`, still stored in
  `VisibilityStateManager`. The card groups are Header (Word, Level, LOOP),
  Steps (Step numbers, Reversals), Start (Show, Hand key), Info and Theme.
  `ExportImagePanel` lost its duplicate rows and renders the shared groups;
  `ChoreoCardContextMenuHost` and `ChoreoCard`'s fallback menu take the same
  marks through `cardMarkMenuItems`. Card Reset restores the card's own
  switches, its theme and the two visibility keys
  (`CARD_VISIBILITY_KEYS`); Pictograph Reset restores only
  `PICTOGRAPH_VISIBILITY_KEYS`.
- **One Info chooser: QR / Mandala / Both / None.** `buildInfoCellChooser`
  shows what the card resolves to (through `resolveInfoCellDisplay`). Both
  appears only where the card has two or more info cells, QR and Both only
  for a signed-in account. On a one-cell card a pick turns both globals on
  and stores the per-count choice; on a multi-cell card it writes the
  globals (`planInfoCellPick`). Zero info cells hide the chooser. All three
  `ExportImagePanel` layouts use it. Four picks run in one row at compact
  density where each segment has 4.5rem, otherwise two rows of two.
- **Card length 4 / 8 / 16.** A view choice in the card section (component
  state, not stored), first in the switches beside Theme. The context-menu
  host gets the same `stepCount`. Decision: one frame for all three lengths
  (1.2 : 1); each card contains itself in it, measured unclipped at 4, 8 and
  16 at every viewport below.
- **Light cells are white, as in the export.** The live light card drew its
  cells on the standalone pictograph's #d8d8d2 panel; `LiveCardPictograph`
  now draws them transparent over white, the export's paper. Checked by
  exporting the 16-count card as a PNG with `darkMode: false`: the cells
  sample 255,255,255 (the header and info cells 240–245), no 216,216,210.
  The standalone pictograph palette is unchanged.
- **No scrolling below 64rem.** The stacked tier became three drill-down
  boxes (icon, title, a one-line summary of what is on, chevron), the
  PostShareSheet File/Show pattern. A box opens its section as its own
  screen, crossfaded by the shared `Crossfade` (`DURATION.normal`): back
  arrow and the quiet Reset in the header, the stage takes the height the
  switches leave, five tiles to a row with the picture capped by width and
  height, caption kept. A landscape screen puts the switches beside a
  full-height stage (2 : 3, or 1 : 2 under 26rem tall with a tighter
  header and rhythm); an upright screen stacks. The three-column tier at
  64rem and up is unchanged apart from the card's new groups (four columns:
  Length + Theme, Header, Steps + Start, Info).

Measured as scrollHeight / clientHeight in px (the columns tier shows every
section at once, so it has no open screen). "Worst" is the 16-count card with
QR and Both offered (sign-in simulated in the page for inspection; component
tests cover it with auth mocked).

| Viewport              | Tier    | Tab (boxes)         | Pictograph, frame | Card, frame (4)    | Worst card          |
| --------------------- | ------- | ------------------- | ----------------- | ------------------ | ------------------- |
| 375×667               | drill   | 595/595             | 569/569, 226²     | 569/569, 131×109   | 569/569, 109×90     |
| 412×915 (Fold cover)  | drill   | 842/842             | 817/817, 325²     | 817/817, 325×271   | fits                |
| 707×772 (Fold inner)  | drill   | 674/674             | 648/648, 339²     | 648/648, 239×199   | fits                |
| 820×1180              | drill   | 1075/1075           | 1050/1050, 686²   | 1050/1050, 672×560 | fits                |
| 960×412               | drill   | 356/356             | 331/331, 198²     | 331/331, 246×205   | 331/331             |
| 200% zoom of 1440×900 | drill   | 351/351             | 325/325, 185²     | 325/325            | 337/325 (12px over) |
| 1440×900              | columns | 844/844, doc 900    | 382²              | 269×224            | fits                |
| 1920×1080             | columns | 1024/1024, doc 1080 | 536²              | 535×446            | not measured        |
| 2560×1440             | columns | 1384/1384, doc 1440 | 741²              | 740×617            | not measured        |
| 3840×2160             | columns | 2104/2104, doc 2160 | 1167²             | 1167×972           | not measured        |

The animation screen also fits at every drill size (frames 226², 325², 339²,
686² and 218²). Open item: at 200% zoom the worst card (signed in, 8 or 16
counts, Info in two rows) overflows its screen by 12px; the guest card fits.

Every tile click changed the stage DOM except Reversals, whose example loop
has no reversals; its key was checked flipping and restoring in
`VisibilityStateManager`. Evidence replaced at the same names in
`evidence/2026-10-27-settings-display-tab/`, plus `412x915.webp` and
`707x772.webp`. The columns-tier shots show the Light card theme;
`1440x900-toggled.webp` shows the 16-count card with Both picked.

## Revision: phone pass (2026-11-01)

Austen looked at the drill tier on an iPhone SE (375×667): it "looks pretty
ugly all around", and he wanted "a whole pass for iPhone SE". Titles wrapped
letter by letter beside a 132px "Reset to defaults", five 53px tiles to a
row wrapped their labels, and the 4-step card was 114px wide. His phone rule
decides the pass: the hero stays big, controls get small (about 32px), and
nothing scrolls. The three-column tier at 64rem and up is unchanged.

What changed, drill tier only:

- **Header.** Back arrow, a one-line title, and Reset as an icon-only button
  (`fa-rotate-left`, labelled with `settings_display_reset` and the title).
  No icon tile; the box that opened the screen showed it. No caption.
- **Stage.** Full width, all the height the switches leave; the screen
  lowers `--min-touch-target` to 2rem. The card frame is 1.1 here (1.2 in
  the columns tier) so the squarer 16-step card fills the width too, and
  its mat is 0.25rem.
- **Switches as chips.** A new shared `MenuItemChipRow` (FilterChipBase
  toggles, sm) draws the pictograph switches; `DisplayPanel chips` draws the
  animation's ten through it; `CardContentToggles compact` draws five
  labelled rows: Card length + Theme, Header, Steps, Start, Info (always one
  row of Info picks at 4rem a pick). The deck is 189px tall.
- **Landscape.** Stage and switches side by side at 1 : 1 (the chips need
  less width than the tiles did).
- **Tab.** Three boxes share the height (14rem cap, top-aligned), each with
  a live, inert thumbnail of its stage on the left: the pictograph, a
  second `InlineAnimationPlayer` (lazy, through `AnimationDisplayStage`),
  and the 4-step `ChoreoCard` (through `CardDisplayStage`, shared with the
  section). The thumbnail column is sized by the card's ratio in every box
  so the titles line up. Title 1rem/650, summary clamped to two lines,
  chevron. Landscape puts the boxes in one row, thumbnail above the title.
  The card thumbnail follows a Theme change (checked: `dark-mode` class off
  on the screen and on the box after picking Light).
- **One step-number label.** The animation panel now uses
  `animation_menu_step_numbers` ("Step numbers"), the pictograph menu's key,
  instead of `animation_display_step_number` ("Step #").

Measured as scrollHeight / clientHeight in px, guest (no QR). Card widths
are the rendered card at 4 / 8 / 16 steps. Every title is one line.

| Viewport              | Tab       | Boxes   | Screens   | Card 4 / 8 / 16 | Deck |
| --------------------- | --------- | ------- | --------- | --------------- | ---- |
| 375×667               | 595/595   | 304×176 | 569/569   | 282 / 282 / 282 | 189  |
| 412×915               | 842/842   | 338×224 | 817/817   | 316 / 316 / 316 | 189  |
| 707×772               | 674/674   | 605×203 | 648/648   | 398 / 398 / 398 | 189  |
| 820×1180              | 1075/1075 | 688×224 | 1050/1050 | 676 / 676 / 676 | 189  |
| 960×412               | 356/356   | 252×307 | 331/331   | 279 / 279 / 279 | 189  |
| 200% zoom of 1440×900 | 351/351   | 200×301 | 325/325   | 273 / 273 / 273 | 189  |

1440×900 (columns) measured against the primary server: identical section,
frame and control geometry; only the animation tile label changed.

Every chip changed its own stage's DOM, except Reversals (the example loop
has no reversals, as before). Animation chips draw on a canvas, so a few
runs missed a change in the readback; Props was confirmed by screenshot.
Evidence: `evidence/2026-10-27-settings-display-tab/phone-*.webp` (tab and
three screens at 375×667 and 960×412, tab at 412×915 and 707×772).

## Revision: Theme folds in (2026-11-02)

Austen, looking at the phone pass in a window about 690×830: "It's better,
but there's still a big-ass empty space underneath the last option. Also,
maybe themes should be folded into the display area, don't you think?" He
picked folding Theme in. A minute later he asked for switches for the level,
LOOP, turn and reversal parts of the animation header.

What changed:

- **Boxes fill the frame.** The 14rem cap on each drill box is gone; the four
  boxes share the whole height. The thumbnail grows with the box but never
  past 60% of its width, so the title and summary keep at least 7rem beside
  it. Landscape keeps one row of four.
- **Theme is the first Display item.** Order on both tiers: Theme,
  Pictograph, Animation, Card. On the drill tier it is a fourth box (static
  preview image over the theme's gradient, title "Theme", the theme's name as
  summary) opening the Theme screen: `BackgroundTab` with `onBack` and
  `compact`, in the same header grammar as the other screens, with Use theme
  / Current theme where Reset sits. On the columns tier a Theme band sits
  above the three columns (thumbnail, title, theme name, a `PanelButton`
  Change); Change swaps the columns for the showroom ("Choose a theme") in a
  `Crossfade`, and the band stays above it.
- **The thumbnail is a static image, not a live canvas.** Four boxes with a
  live theme canvas beside the animation player measured 56 fps unthrottled
  but 33 fps (p95 50 ms) at 4× CPU throttle at 412×915; the static image
  measured 50 fps (p95 33 ms) under the same throttle. 33 fps is too close to
  the 30 fps floor. `LIVE_THEME_THUMBNAIL` in `DisplayTab.svelte` flips it.
- **The Theme tab left the bar.** `/settings/theme` is an alias: the section
  migration maps `theme` to `display` and asks the Display tab for its Theme
  screen (`navigationState.requestedScreen`), which opens the screen on the
  drill tier and the showroom on the columns tier. The account-setup theme
  task, the screenshot orchestrator, the capabilities manifest and guest
  access point at the alias.
- **Header parts are preferences.** `headerLevel`, `headerLoop`,
  `headerTurns` and `headerReversals` (default on) join the animation
  preferences and Reset. The canvas uses a file's own override when it has
  one and the preference otherwise. On the phone screen they are chips after
  Word; on the columns tier the ten tiles stay and the four parts are one row
  of small chips labelled Header under them, so the animation stage keeps its
  height. Either way they are disabled while Word is off. The Download video
  screen starts its Show list from them and its own choice still wins.
- **The columns tier's stage floor is 9rem, down from 14rem.** The band takes
  76px from every column; the card's switches are 415px tall, which leaves its
  stage 144px at 1440×900. Any higher floor pushes the card's caption over its
  switches.

Measured on the task preview (scroll = `scrollHeight/clientHeight`; last-box
gap is the distance from the last box to the frame's bottom padding):

| Viewport              | Tab       | Last-box gap | Boxes (w×h) | Theme screen / showroom | Stage   |
| --------------------- | --------- | ------------ | ----------- | ----------------------- | ------- |
| 375×667               | 595/595   | 0            | 304×130     | 569/569                 | 291×361 |
| 412×915               | 838/838   | 0            | 338×191     | 813/813                 | 325×604 |
| 690×830               | 733/733   | 0            | 589×165     | 707/707                 | 568×541 |
| 707×772               | 674/674   | 0            | 605×150     | 648/648                 | 584×482 |
| 820×1180              | 1075/1075 | 0            | 688×250     | 1050/1050               | 686×883 |
| 960×412               | 356/356   | 0            | 189×307     | 331/331                 | 370×262 |
| 720×450               | 351/351   | 0            | 149×301     | 325/325                 | 289×257 |
| 200% zoom of 1440×900 | 351/351   | 0            | 148×301     | 325/325                 | 288×257 |

Columns tier: band 75.8px at 1440×900 and 79.1px at 1920×1080 and
2560×1440; tab 844/844, 1024/1024 and 1384/1384; showroom 730/730, 894/894
and 1248/1248. Stages (pictograph / animation / card): 367 / 216 / 173×144
at 1440×900, 510 / 457 / 446×372 at 1920×1080, 741 / 740 / 740×617 at
2560×1440. Animation tiles plus the Header row: 302 + 32px at 1440×900. Applying a theme updates the band's image and name
immediately.

Header DOM diffs on the animation stage: Level removes only the level badge,
LOOP only the LOOP badge, Turns only the turn pattern, Reversals only the
reversal pattern (turns and reversals were checked at 820×1180 with patterns
injected into the example for the run; the example has none of its own, and
at 375 wide the patterns do not fit the header). Word removes the whole
strip and disables the four part switches. With Level off in Settings, the
Download video Show list starts with Level off; turning it on there brings
the level badge back in that preview.

Evidence: `evidence/2026-10-27-settings-display-tab/theme-*.webp` (tab at
375×667, 690×830, 820×1180, 1440×900, 1920×1080 and 2560×1440; Theme screen at 375×667
and 960×412; showroom at 1440×900; animation screen with Level off at
375×667).

## Revision: Theme is the fourth column (2026-11-02)

Austen, looking at the merged Theme band at 1440×900: "It's good, but now
it's weird that the theme is so understated when we're on the actual larger
page, like you can't really tell very easily because it's such a very small
section."

What changed:

- **Theme is a full column.** The columns tier is four equal columns: Theme,
  Pictograph, Animation, Card. The Theme column is `BackgroundTab` with
  `column` set, rendering through `DisplaySection` without a back arrow:
  palette icon tile, title, Use theme / Current theme where the others show
  Reset, the live `ThemePreview` over the column's free height with the
  name and description, and the ten choices under it. The choices are 2×5
  short bands on a column under 22rem of content and 5×2 near-square tiles
  from 22rem, so no row strands one tile. Picking previews on the stage;
  Use theme applies it. The band, its Change button and the showroom swap
  are gone. The drill tier is unchanged.
- **The page background follows Use theme.** A screen holds the page's
  background still for its whole visit; the column is on screen for the
  whole visit to Display, so it holds only while it previews a theme other
  than the current one, and the page runs the new theme once it is applied.
- **Threshold rule.** The columns tier is used only when each of the four
  columns keeps at least 17rem (272px) of content width. The tab loses its
  side margins (2cqi each), the workspace border (2px) and three 1px
  hairlines, and each section body pads 1.15em on both sides, so
  0.96W − 5 ≥ 4 × (272 + 36.8) gives W ≥ 1292px. The tier starts at a tab
  width of **81rem** (1296px, 273px of content a column); below it the drill
  tier's four boxes show. 1280×800 (tab 1150) is drill; 1440×900 (tab 1310)
  is columns.
- **Stage floor back to 14rem.** With the band gone the columns tier's stage
  floor returns from 9rem to 14rem.
- **Tile ladder starts at four.** Only the columns tier draws tiles, and its
  columns are at least 17rem, so the ladder is 4 columns below 30rem of
  content and 5 from there: the animation's ten run 4+4+2 or 5×2 (never
  3+3+3+1) and the pictograph's eight 4×2 or 5+3. Below 22rem of content the
  animation's four Header chips sit 2×2 instead of 3+1.
- **A column under 20rem drops the header's icon tile**, so "Pictograph"
  and "Reset to defaults" share one line at the threshold.
- `/settings/theme` and the account-setup theme task still open the Theme
  screen on the drill tier; on the columns tier the request is cleared and
  nothing opens, since the Theme column is already on screen.

The card at the threshold (tab 1296px): Card length (4 · 8 · 16) and the
sun/moon Theme control share one row, and Info (Mandala / None in the
example) is one row, so the labelled rows do not stack.

Measured on the task preview (column = section box; content = inside its
padding; stages are rendered frame sizes; scroll is page and
`.display-workspace` `scrollHeight/clientHeight`; deck bottom is the card
controls' bottom against the workspace bottom):

| Viewport  | Tab  | Tier    | Column × content | Theme / Pictograph / Animation / Card stage | Page      | Workspace | Deck / workspace bottom |
| --------- | ---- | ------- | ---------------- | ------------------------------------------- | --------- | --------- | ----------------------- |
| 1024×768  | 958  | drill   | boxes 220×611    | —                                           | 768/768   | 635/635   | —                       |
| 1280×800  | 1150 | drill   | boxes 266×686    | —                                           | 800/800   | 710/710   | —                       |
| 1426×900  | 1296 | columns | 311 × 273        | 274×372 / 273 / 242 / 269×224               | 900/900   | 806/806   | 833 / 854               |
| 1440×900  | 1310 | columns | 314 × 276        | 277×368 / 277 / 242 / 269×224               | 900/900   | 806/806   | 833 / 854               |
| 1920×1080 | 1790 | columns | 429 × 392        | 392×679 / 392 / 392 / 392×327               | 1080/1080 | 973/973   | 1006 / 1027             |
| 2560×1440 | 2430 | columns | 583 × 546        | 546×966 / 546 / 546 / 546×455               | 1440/1440 | 1327/1327 | 1363 / 1384             |
| 3840×2160 | 3710 | columns | 903 × 866        | 866×1544 / 866 / 866 / 866×721              | 2160/2160 | 2047/2047 | 2083 / 2104             |
| 720×450   | 660  | drill   | boxes 148×301    | —                                           | 450/450   | 325/325   | —                       |

At 1440×900, picking Ocean changed the stage and Use Ocean moved the
Current badge, changed the accent and stored `backgroundType: ocean`; with
the hold change, Use Ember turned the page's background to Ember.

Evidence: `evidence/2026-10-27-settings-display-tab/column-*-tab.webp`
(1024×768, 1280×800, 1440×900, 1920×1080, 2560×1440, 3840×2160).

## Revision: Two-by-two cells (2026-11-02)

Austen, looking at the four columns in a tall window (about 1740×1420):
"no it looks awkward". The four did not share a shape: the Theme column's
preview ran from header to floor while the other three stages floated small
(a 380px square in 900px of height) in the middle of empty columns. He chose
two-by-two cells.

What changed:

- **The wide tier is a 2×2 grid of equal cells**: Theme and Pictograph on
  top, Animation and Card below, split by hairlines in the theme stroke. The
  four-across arrangement is gone, with its 81rem constant, the icon tile
  hiding under 20rem and the cell captions ("Long-press or right-click …";
  the strings stay).
- **A cell** is `DisplaySection` with `cell` set: the header as before (icon
  tile, title, Reset or Use theme / Current theme on one line), then the
  body as a size container laid out stage left, switches right. The stage
  is the body's full height and as wide as its ratio allows there, but the
  switches keep at least 17rem; where both cannot hold the stage gives way
  and its frame is the largest box of its ratio that fits. The Theme stage
  is a 1.2 column (the card's ratio) filled by the live background, never
  taller than a square stage beside it would be, so it cannot run header to
  floor while the others stop short. The switches centre in the pane's
  height and fill its width.
- **Tiles or chips, all four alike, by cell size.** Tall cells draw the
  picture tiles (the `--tile-grid-*` ladder, 4 across, 5 from 30rem of
  pane); short cells draw the drill screens' chips (`MenuItemChipRow`,
  `CardContentToggles compact`, the Animation's Header chips after Word),
  at the drill screens' 2rem touch floor. Theme: ten tiles, 5×2 from a
  22rem pane, 2×5 under it, about 2.25rem tall in chip cells. In a cell the
  tile picture is also capped by the stage height
  (`min((100cqb - 21rem) / 2, (100cqb - 17rem) / 3)`), so a wide, short
  pane never grows its deck past the stage. The card cell narrows its chip
  rows' label column to 3.5rem (each row folded in two at 4.5rem in a 17rem
  pane) and tightens its tile deck's gaps (0.5rem rows, 0.2rem labels).

Thresholds (`DisplayTab.svelte`, beside the old `COLUMNS_MIN_REM`):

- **Width, `WIDE_MIN_WIDTH_REM` = 71.25rem.** The workspace takes 2cqi side
  margins, a 1px border each side and one 1px hairline; a cell body pads
  1rem each side with a 1rem gap and needs 17rem (272px) of switches beside
  a 14rem (224px) stage: (0.96W − 3) / 2 ≥ 32 + 16 + 272 + 224 = 544 gives
  W ≥ 1137px; 71.25rem = 1140px.
- **Height, `WIDE_MIN_HEIGHT_REM` = 44rem.** Block margins of at most 1.75rem,
  the borders and one hairline; a cell's 73px header and 0.75rem body
  padding over a 14rem stage: (H − 56 − 3) / 2 ≥ 73 + 24 + 224 = 321 gives
  H ≥ 701px; 44rem = 704px. Under either threshold the drill tier shows,
  unchanged.
- **Tiles from a cell height of `CELL_TILES_MIN_REM` = 30.25rem.** The card's
  tile deck is the tallest: 388px at its smallest tiles (measured at
  1740×1420), so 388 + 97 (header and padding) = 485px. Where the card's
  pane is under 18rem a signed-in user's four Info picks fold into two rows
  (about 432px), so the cutoff there is `CELL_TILES_NARROW_MIN_REM` = 33rem
  (432 + 97 = 529px). The tab computes the cell's size from its own, with
  the workspace's margins, so the first frame draws the right switches.
  The brief expected tiles from about 26rem; the measured deck needs 30.25.

Measured on the task preview (cell = section box; stage = rendered frame;
pane = switches width; block = switches height; gap = switches to stage
top and bottom; page and workspace are `scrollHeight/clientHeight`):

| Viewport  | Tab       | Tier  | Cell      | Theme / Pictograph / Animation / Card stage | Controls | Panes (T/P/A/C) | Blocks (T/P/A/C) | Gaps (T/P/A/C)  | Page      | Workspace |
| --------- | --------- | ----- | --------- | ------------------------------------------- | -------- | --------------- | ---------------- | --------------- | --------- | --------- |
| 1280×800  | 1150×744  | cells | 551×355   | 231×231 / 231 / 231 / 231×192               | chips    | 272/272/272/272 | 204/147/224/189  | 28/56/17/35     | 800/800   | 710/710   |
| 1366×768  | 1236×712  | cells | 593×338   | 273×242 / 242 / 241 / 272×227               | chips    | 272/302/303/272 | 204/109/186/189  | 19/67/28/26     | 768/768   | 676/676   |
| 1440×900  | 1310×844  | cells | 628×403   | 308×307 / 307 / 306 / 307×256               | chips    | 272/272/274/272 | 204/147/224/189  | 52/80/41/59     | 900/900   | 806/806   |
| 1740×1420 | 1610×1364 | cells | 772×659   | 452×452 / 451 / 452 / 451×376               | tiles    | 272/272/272/272 | 307/197/392/388  | 128/183/85/87   | 1420/1420 | 1318/1318 |
| 1920×1080 | 1790×1024 | cells | 859×486   | 468×390 / 390 / 390 / 468×390               | tiles    | 342/420/421/342 | 380/171/314/388  | 5/110/38/1      | 1080/1080 | 973/973   |
| 2560×1440 | 2430×1384 | cells | 1166×663  | 681×567 / 567 / 567 / 680×567               | tiles    | 438/550/552/438 | 188/218/272/421  | 190/174/147/73  | 1440/1440 | 1327/1327 |
| 3840×2160 | 3710×2104 | cells | 1806×1023 | 1108×923 / 923 / 923 / 1107×923             | tiles    | 650/834/836/650 | 283/332/373/381  | 320/296/275/271 | 2160/2160 | 2047/2047 |
| 1024×768  | 958×663   | drill | —         | —                                           | —        | —               | —                | —               | 768/768   | 635/635   |
| 720×450   | 660×351   | drill | —         | —                                           | —        | —               | —                | —               | 450/450   | 325/325   |

No element in any cell overflows; the header icon tile shows in every cell.
At 1440×900 and 1920×1080, picking Ocean changed the Theme stage to
"Previewing Ocean theme", Use Ocean changed the page accent (#7a73da →
#0891b2; Cosmic restored after), the Animation's Level switch removed the
header's level badge and brought it back, and Card length 16 drew the
16-step card (12 → 38 drawn parts).

Evidence: `evidence/2026-10-27-settings-display-tab/cells-*-tab.webp`
(1440×900, 1740×1420, 1920×1080, 2560×1440, 3840×2160).

## Revision: Cells fill, theme shows through (2026-11-03)

Austen, at about 1740×1420 on the two-by-two tab: "Looks decent, but I
don't think we're utilizing the available space much, because if you look
above and below the whole theme section, there's a bunch of empty space.
And the buttons that you click to change the actual theme could just be
taller in order to fill it, so you see more of the background. I don't
know, it just feels like it's a little over containerized here, and the
gray theme against whatever background we've chosen just feels a little
drab."

### Theme cell fills its height

- The Theme cell is a `fill` cell (DisplaySection: `cell && bleed`). Its
  stage runs the body's full height (`height: 100%`), as wide as a 1.2 box
  at that height where the 17rem pane allows. The other three cells keep
  their square / 1.2 stages centred.
- Its switches pane stretches to the body's height and is a size container
  (`display-controls`). The ten tiles fill it: rows `minmax(0, 1fr)`, no
  aspect ratio, no 104px floor, pictures `object-fit: cover`.
- Columns: 2×5 by default. 5×2 only on a pane of 30rem or more that is 2
  to 2.5 times as wide as tall, so each tile is 0.8 to 1 times as wide as
  tall. The brief's rule (5×2 from 30rem when tiles stay at least as tall as
  wide) gave 124×458 pillars at 3840×2160, where the pane is 650×923 and
  taller than wide; 2×5 there gives 321×178 pictures. No tested viewport
  reaches 5×2.
- Chip mode (1280×800, 1440×900) uses the same fill with shorter tiles; the
  2.25rem compact tile and its dot badge no longer apply to the Theme cell
  (the drill screen keeps them). Labels and the "Current" badge sit as on
  the tile cells; from a 40rem pane the name takes the 14px label size.

### Less box, more theme

- `.display-workspace` is `var(--theme-panel-bg)` (rgba(0,0,0,0.8) on
  desktop, 0.88 on a phone), the translucent panel glass, instead of the
  14% / 86% near-black mix. The bright-luminance override follows suit. The
  settings shell uses no backdrop blur, so none was added.
- The 1px stroke and 1.25em radius stay: on Celestial the bright sky meets
  the panel's edge, and the frame keeps the tab one object there.
- The per-cell 2% tint (`.cell`) and the animation slot's 2% tint are gone;
  the theme-choices band already had none in a cell. The hairlines between
  cells stay. Drill screens keep their section tint; the drill boxes keep
  `--theme-card-bg`, so on the drill tier the glass shows only around them.

Measured on the task preview (Cosmic; page, tab and workspace
`scrollHeight === clientHeight` everywhere; Theme pane and tile grid
`scrollHeight === clientHeight` everywhere; workspace background
rgba(0,0,0,0.8), 0.88 at 375×667; cell background transparent):

| Viewport  | Tier  | Controls | Tab       | Theme stage | Pane / grid | Grid | Tile           |
| --------- | ----- | -------- | --------- | ----------- | ----------- | ---- | -------------- |
| 1280×800  | cells | chips    | 1150×744  | 231×259     | 272×259     | 2×5  | 133×47         |
| 1440×900  | cells | chips    | 1310×844  | 308×307     | 272×307     | 2×5  | 133×57         |
| 1740×1420 | cells | tiles    | 1610×1364 | 452×563     | 272×563     | 2×5  | 132×106        |
| 1920×1080 | cells | tiles    | 1790×1024 | 468×390     | 342×390     | 2×5  | 167×72         |
| 2560×1440 | cells | tiles    | 2430×1384 | 681×567     | 438×567     | 2×5  | 215×107        |
| 3840×2160 | cells | tiles    | 3710×2104 | 1108×923    | 650×923     | 2×5  | 321×178        |
| 1024×768  | drill | —        | 958×663   | —           | —           | —    | —              |
| 375×667   | drill | —        | 345×595   | —           | —           | —    | 68×36 (screen) |

The four cell headers share their top and bottom lines at every cells
viewport. At 1740×1420, picking Celestial set the stage to "Previewing
Celestial theme", Use Celestial applied it and moved the Current badge;
Forest, Ember and Void were applied the same way and their text stayed
white on the panel glass; Cosmic was restored after.

Evidence: `evidence/2026-10-27-settings-display-tab/fill-*.webp`
(1440×900, 1740×1420, 1920×1080, 2560×1440 on Cosmic; 1740×1420 on
Celestial and Forest).

## Revision: Theme applies on click (2026-11-06)

Austen: "Should we have a use button when we choose the theme or should we
just make it so you click your theme and then it immediately changes the
background? I think that would be better, the second one."

- Clicking, or pressing Enter or Space on, a theme tile applies it at once on
  every tier. The Use theme button, the Current theme status and the Current
  badge are gone. The Theme header keeps its icon tile and title, and its
  action slot is empty.
- The selected tile is always the current theme: one mark, the full ring plus
  `aria-pressed`. The stage shows that theme, with its name and description
  swapping through the existing `Crossfade`.
- The drill screen's background hold now ends at the first pick. A held
  controller queues a new theme until release, so the page behind the screen
  would otherwise have kept the old theme until the visitor went back. The
  cell's "hold while previewing another theme" effect is gone, because nothing
  previews without applying now.
- Opening the page still records the setup choice, and so does a click.
