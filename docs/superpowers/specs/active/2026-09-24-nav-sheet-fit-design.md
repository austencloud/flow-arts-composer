# Navigation Sheet Fits Its Contents

Date: 2026-09-24
Status: approved by Austen in conversation ("go for it")

## Problem

The module navigation sheet (`ModuleSwitcher.svelte` + `ModuleList.svelte`) has
a fixed height: `100dvh` below 700×500 and `85dvh` above it. Tiles sit at the
top and the rest of the sheet is empty. Measured in the running app:

| Case                                      | Result                                                  |
| ----------------------------------------- | ------------------------------------------------------- |
| Guest, 3 modules, 820×1180                | 76px of tiles in a 739px content area (about 90% empty) |
| Admin, 13 modules, 820×1180               | 4 columns, 4+4+4+1, content 372px of 739px              |
| Admin, 13 modules, 1270×1300 (screenshot) | same, tiles stretched to 440px wide                     |
| Admin, 13 modules, 375×667                | 2 columns, needs 664px, gets 402px, footer takes 164px  |
| Guest on a phone, any landscape phone     | acceptable                                              |

Contributing causes:

1. `Crossfade fill` makes the list layers `position: absolute`, so the content
   has no intrinsic height and the sheet must be given one.
2. At container width ≥660px every count is forced to 4 columns, creating
   orphan rows (5 → 4+1, 13 → 4+4+4+1). The count-specific layouts
   (`layout-few/quad/five/six/many`) only matter below that width.
3. The bottom sheet runs full width at every size.
4. Icon, label, and tile sizes use `vh` clamps, which the 4K layout rule forbids
   for ordinary controls.

The sheet is used on phones, tablets, any viewport under 1280px wide, and any
non-side-by-side (portrait-shaped) desktop window. Landscape phones get the
left side drawer.

## Design

### Sheet (bottom placement)

- Height is content-sized: header + list + footer. The fixed `height` rules in
  `ModuleSwitcher.svelte` are removed. The existing caps remain
  (`--sheet-max-height`: `100dvh` on small viewports, `85dvh` at ≥700×500).
  When content exceeds the cap, only the list region scrolls; header and footer
  stay in place.
- Width caps at 720px and the sheet centers horizontally. Phones are narrower
  than the cap and are unchanged.
- `Drawer.css` gains two opt-in custom properties on the bottom placement:
  `--sheet-max-width` (default `100%`) and `--sheet-min-height` (default
  `50dvh`, the current value). Horizontal margins become `auto` so a capped
  sheet centers. Other sheets keep today's behavior because the defaults match
  the current values.
- The module switcher sets `--sheet-max-width: 720px` and
  `--sheet-min-height: 0`.

### Side placement (landscape phones)

Unchanged: full-height left drawer, 280–320px wide. The new tile grid applies
inside it (2 columns at that width).

### Tile grid

- A pure function owns the column choice:
  `src/lib/shared/navigation/domain/module-grid-layout.ts`.
  - `maxCols = clamp(floor((width + gap) / (minTileWidth + gap)), 1, 5)`
  - `rows = ceil(count / maxCols)`, `cols = ceil(count / rows)`
  - This picks the fewest rows, then the fewest empty slots.
- Expected results:

  | Modules | 720px sheet | 375px phone |
  | ------- | ----------- | ----------- |
  | 3       | 3           | 3           |
  | 5       | 5           | 3 + 2       |
  | 7       | 4 + 3       | 3 + 3 + 1   |
  | 13      | 5 + 5 + 3   | 3+3+3+3+1   |

- Layout is a CSS grid on half-column tracks (`2 * cols` tracks, each tile
  spans two). Full rows fill the width; the first tile of a short last row
  starts after `cols - lastRowCount` half-tracks, which centers that row
  exactly without rounding wraps.
- `ModuleList` measures its own width (`bind:clientWidth`) and passes it with
  the module count to the function, writing the track count and gap on the
  grid. The dev section, when present, uses the same function with its own
  count.
- One tile size everywhere: fixed minimum height, icon and label on the global
  type tokens (`--font-size-sm` label). Tiles may grow if a translated label
  wraps. A short-viewport media query (`max-height: 500px`) may reduce tile
  padding for landscape phones; it must not change type or icon size.
- Removed: `layout-few/quad/five/six/many` classes, `data-module-count`
  selectors, the ≥660px 4-column override, and every `vh`/`vw` clamp in
  `ModuleList.svelte`.
- Kept: tile colors, glow, active state, entrance stagger, reduced-motion and
  high-contrast handling, link-out tiles, drag-vs-tap guard.

### Drill-in

`ModuleSwitcher` switches its `Crossfade` from `fill` to `animateHeight`
(still `mode="swap" motion="step"`). The scroll container moves from inside
each layer to the content region around the `Crossfade`, and resets to the top
on drill-in and back. The sheet eases between the module-grid height and the
destination-list height instead of snapping.

### Footer

Same buttons and labels. Tighter spacing: smaller vertical padding and gaps
around the account row and action row, bottom padding
`max(12px, env(safe-area-inset-bottom))`. The landscape-phone icon-only footer
stays as is.

## Verification

- Unit tests for `module-grid-layout.ts`: counts 1–16 across phone, side
  drawer, and 720px widths; no row except the last is short; `cols ≤ maxCols`.
- Dev harness `src/routes/test/module-switcher/` renders the real
  `ModuleSwitcher` with a selectable module count (3, 5, 7, 13) built from
  `MODULE_DEFINITIONS`, so admin-sized lists can be checked as a guest.
- Browser check on the harness at the seven viewports from
  `4k-native-layout.md` (375×667, 960×412, 820×1180, 1440×900, 1920×1080,
  2560×1440, 3840×2160) for 3 and 13 modules, plus 200% zoom at 1440×900,
  plus drill-in and back with and without reduced motion. Record sheet size,
  columns, and whether the list scrolls.
- Nearest type/lint gate for the changed files.

## Out of scope

- When the desktop sidebar replaces the sheet (the 1280px / side-by-side rule).
- Footer contents, labels, or ordering.
- Module order and role gating.
