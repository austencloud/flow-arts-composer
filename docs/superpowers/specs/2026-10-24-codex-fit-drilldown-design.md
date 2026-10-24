# The Codex fits the screen, or drills down

Approved by Austen on 2026-10-24, after the rotate fix (`codex/codex-rotate-grid`) was briefed. His rule, stated for every screen: "the whole thing needs to fit exactly on the device the user's on, and if it doesn't fit, it should have a drill down. Drill downs are superior to scroll bars in almost every circumstance."

## The rule

`/codex` never scrolls. On every device the page is one fixed frame under the site header: a header, one content area that takes the remaining height, and the primary controls. The page's `scrollHeight` equals its `clientHeight` at every size in the check list below.

The page has two modes, decided by one pure function from the window:

- **Full board.** The whole Atlas board (all six type bands, `BoardAtlas`) with the controls in a rail beside it, when every cell can be at least 80 px and nothing scrolls. This is today's desktop view minus the scroll and with the controls moved from above the board to its side.
- **Drill-down.** A stack of screens, one job each: Home (prop and types), Type (its letters), Letter (its variations), Adjust (every edit control) and Links (where the letter is used). Phones, the Z Fold6 inner screen, tablets and small laptop windows get this.

There is no third mode and no breakpoint. A window that cannot hold 80 px cells drills down, whatever its width.

## The fit function

`src/routes/(public)/codex/_data/codex-fit.ts`, pure and tested:

```ts
export const MIN_FULL_BOARD_CELL = 80;   // px, Austen's floor
export const BOARD_COLUMNS = 12;         // Type 1's A-L row
export const BOARD_ROWS = 5;             // BoardAtlas: A-L, M-V, Type 2, Type 3, Types 4-6
export const BAND_CHROME_REM = 21;       // BoardAtlas's --atlas-band-chrome, moved here and imported there

export interface CodexFitInput {
  viewportWidth: number;
  viewportHeight: number;
  siteHeaderHeight: number;   // --marketing-header-h, measured
  pageChromeHeight: number;   // TopicHeader + page padding in full-board mode, measured
  railWidth: number;          // the controls rail, measured
  remPx: number;
}

export function fullBoardCell(input: CodexFitInput): number;   // the cell the board would get
export function codexLayoutMode(input: CodexFitInput): "full-board" | "drill-down";
```

`fullBoardCell` is the smaller of the width term `(boardWidth - 5rem) / 12` and the height term `(boardHeight - 21rem) / 5`, where `boardWidth` is the page column minus the rail and `boardHeight` is the viewport minus the site header and the measured page chrome. These are the two terms BoardAtlas's `codex-atlas-fit` container block already uses; the constants move into this module so the CSS and the decision read one number. `codexLayoutMode` is `"full-board"` when `fullBoardCell >= MIN_FULL_BOARD_CELL`.

The page measures its inputs with `bind:clientHeight` and `svelte:window` bindings and re-decides on every resize. A mode change keeps all state (it lives in the URL and localStorage), so resizing a desktop window across the threshold swaps the view and loses nothing.

Expected outcomes, to be confirmed by the tests: 1920 by 1080 and larger give the full board; 1366 by 768, 1280 by 720, every phone and both Fold screens drill down.

## Full-board mode

Today's page with three changes:

- The controls (`CodexBoardControls`: Turns, Transform, Show) stand in a column to the right of the board, as a rail, instead of a row above it. The rail also holds the prop row and the two start cyclers, stacked. `CodexBoardControls` takes a `layout` prop, `"row"` (today) or `"rail"`.
- The board is sized from `fullBoardCell`, never from a media query. The `@media (min-width: 80rem) and (min-height: 700px)` block in `+page.svelte` and the `max(3rem, ...)` floor in BoardAtlas go; the page sets `--codex-picto-size` from the function.
- The Print link sits at the bottom of the rail.

The explorer stays the dialog it is today (`BaseModal`, `LetterExplorer`, the fan from the clicked cell). The dialog already fits on any screen that passes the full-board test.

## Drill-down mode

Every screen uses one frame component, `CodexScreenFrame`: a header row (Back pill on the left, title and a one-line subtitle in the middle, the frame's own action pills on the right), a content area (`flex: 1; min-height: 0`), and the screen's primary controls at the bottom when it has any. The frame is `height: 100dvh - site header`, `overflow: hidden`.

### Home

- Title "Codex", subtitle the page's lede in one line.
- The prop row (`PropChoiceRow`, icon-only, as today) across the top of the content area.
- Six type tiles filling the rest: each a pressable box (`CodexTypeTile`) with the type's label (`codexTypeLabel`), its two band colours as the box's ring and wash (the same treatment `BoardAtlas` gives a band), and the first three letters as glyphs (`CodexLetterGlyph`). The tile grid is 2 by 3 or 3 by 2, whichever gives the larger tile for the area (`typeTileGrid(width, height)` in `codex-fit.ts`).
- Bottom controls: Adjust (opens the Adjust screen) and Print (`/codex/print`).
- The edit summary chip (below) sits in reserved space between the prop row and the tiles.

### Type

- Back to Home. Title the type's label, subtitle its transition word.
- Content: the type's letters as `CodexCell`s (letter glyph, name and transition caption on the cell, as today) in the largest square cells that hold all of them: `fitVariationColumns(count, width, height, gap, maxCell)` from `variation-columns.ts`, which already does this for the explorer. Type 1 keeps its two placement lands as two row groups when the grid has room for the break; otherwise it flows. Cells use the current board data (`boardData`), so a rotated board shows rotated letters here.
- Tapping a cell opens the Letter screen, dealt from the cell with the existing fan (`codex-fan.ts`).
- Header pills: Adjust. Reserved space under the header for the edit summary chip.

### Letter

- Back to its Type screen. Title the letter glyph and name, as the dialog header shows today (`CodexLetterGlyph`, `shownInfo.name`).
- Content: the variations only, in the largest cells that hold all of them (`fitVariationColumns`, floor 72 px). Below the floor, on a very short landscape window, the grid becomes one row that pans sideways inside its own area; the page still does not scroll.
- Header pills: Adjust, Links.
- The variations, the fan, the shimmer and the shared edit clock (`announcePictographEdit`) are the explorer's existing pieces. `LetterExplorer.svelte` is split so the variation grid and its fit become `LetterVariations.svelte`, used by both the dialog and this screen; the dialog keeps its toolbar and footer around it.

### Adjust

- Back to whichever screen opened it (Home, Type or Letter). Title "Adjust".
- Content, top to bottom: the live preview cell (the Home and Type screens preview the first letter of the open type or of Type 1, as the phone preview does today; the Letter screen previews the selected variation), then the start cyclers (the two `OrientationCycler`s with their "Start" label), then `CodexBoardControls` in `layout="stack"`: Turns, Transform (with Invert when opened from the Letter screen), Show. Every control is a visible button group, as today. Nothing starts disabled.
- The preview cell takes the width left after the groups, capped so every group stays on screen: the frame measures the groups and gives the preview the rest. If the groups alone do not fit the area (a 360 by 640 phone in landscape), the groups pan inside their area and the preview keeps a 96 px floor.
- Bottom control: Reset all (board transforms, explorer transforms, turns, spins and start orientations back to their defaults).

### Links

- Back to the Letter screen. Title "Where to find" with the letter.
- Content: the four things the dialog's footer holds today, as boxes and pills: the "In TKA 1" sequence cards (`LinkChip`s), Find in Gallery, Copy link, Continue in Composer. When the cards do not fit, the card row pans sideways inside its own area.

### The edit summary chip

`describeCodexEdits(transforms, edits, startOrientations)` in `src/routes/(public)/codex/_data/codex-edit-summary.ts` returns one short line or null: "Rotated 45°", "Mirrored", "1 turn L", "Start: red out", joined with commas in that order (transforms, turns, starts). The chip shows the line with a Reset pill beside it on the Home and Type screens, and on the Letter screen it also counts the explorer's own transforms. Its row is reserved space: an empty chip row keeps its height so the tiles and cells do not move when an edit arrives or clears (layout-motion: movement that means nothing gets reserved space).

## Navigation and state

Screens are URL state, so a link opens on the right screen and the Android back button goes up one level:

| Screen | URL |
| --- | --- |
| Home | no screen params |
| Type | `?type=1` to `?type=6` |
| Letter | `?letter=K` (today's explorer params) |
| Adjust | `?adjust=1` added to any of the above |
| Links | `?letter=K&links=1` |

`src/routes/(public)/codex/_data/codex-screen.ts`, pure and tested: `codexScreen(params, mode)` resolves the screen (in full-board mode `type`, `adjust` and `links` are ignored and `letter` means the dialog); `codexScreenParent(screen)` gives the Back target; `codexScreenDepth(screen)` gives the nesting level, as `direction-drill-route.ts` does for Generate's Customize panel. The letter's own type is `CODEX_LETTERS.get(id).typeNumber`, so `?letter=K` alone still knows its parent.

Every drill press pushes a history entry (`mutateCurrentUrl` with `mode: "push"`, as `select` does today). Back calls `history.back()` when the page pushed the current entry, else rewrites the URL to the parent with a push. `popstate` runs the existing `syncFromUrl`, extended to the new params. Transforms (`tf`), explorer transforms (`xf`), turns, spins, `prop`, `ori` and the layer visibility in localStorage are unchanged.

Letter links published before this change (`/codex?letter=K&grid=box...`) open the Letter screen in drill-down mode and the dialog in full-board mode.

## Motion

- Screen swaps are a `Crossfade` keyed by the screen, `DURATION.normal`, from `#lib/shared/transitions/motion.js`. The Letter screen's entrance from a tapped cell is the existing fan; the dialog in full-board mode is unchanged.
- The type tiles and letter cells reflow with `animate:flip` on the shared clock when the area changes size.
- Durations come only from `DURATION` and the `--duration-*` tokens; `motion-coverage.test.ts` stays green. Reduced motion is honoured by the owners.

## Code shape

- `LetterCodex.svelte` (768 lines) keeps the explorer's state machine but hands its template to two hosts: `CodexBoardView.svelte` (full board, rail, dialog) and `CodexDrill.svelte` (the screen stack). The state (grid loading, variations, edits, explorer transforms, URL sync, fan) moves into `codex-explorer-state.svelte.ts` so both hosts and the Adjust screen read one object instead of prop-drilling two dozen callbacks.
- New, under `src/routes/(public)/codex/_components/`: `CodexScreenFrame.svelte`, `CodexHomeScreen.svelte`, `CodexTypeTile.svelte`, `CodexTypeScreen.svelte`, `CodexLetterScreen.svelte`, `CodexAdjustScreen.svelte`, `CodexLinksScreen.svelte`, `CodexEditSummary.svelte`.
- New, under `src/routes/(public)/codex/_data/`: `codex-fit.ts`, `codex-screen.ts`, `codex-edit-summary.ts`, each with a test beside it.
- `LetterExplorer.svelte` splits out `LetterVariations.svelte` (grid, fit, fan, shimmer).
- `CodexBoardControls.svelte` gains `layout: "row" | "rail" | "stack"`; its `@media (max-width: 600px), (max-height: 500px)` phone block and the `phoneControls` MediaQuery in LetterCodex go, because the drill-down mode replaces what they did.
- `/atlas` keeps using `LetterCodex` without `boardControls` and is unchanged in behaviour: board plus dialog.
- No new dependency. No checkbox, no native select, no dropdown.

## Checking

Done means all of these, measured in a real Chrome (chrome-devtools MCP, not the in-app browser, which freezes animation frames):

1. `document.scrollingElement.scrollHeight === clientHeight` on every screen (Home, each Type, a Letter with the most variations, Adjust from each, Links) at 360 by 640, 412 by 915, 707 by 772, 823 by 600, 1366 by 768, and in full-board mode at 1920 by 1080 and 2560 by 1440.
2. The mode at each size matches the table above; `codex-fit.test.ts` pins the same numbers.
3. Type-screen cells and Letter-screen variations are at least their floors at every size, and the full board's cells are at least 80 px at 1920 by 1080.
4. `?letter=K`, `?type=3`, `?type=3&adjust=1`, `?letter=K&links=1` each open on their screen on a cold load; Back from each lands on its parent; Android back (history.back) does the same.
5. The rotate fix holds: pressing Rotate on the Adjust screen turns the preview's grid and props the same way, and the Type screen's cells draw `data-grid-mode="box"` at 45° after one rotate.
6. Reduced motion on: every screen still swaps.
7. Screenshots of each screen at 360 by 640 and 707 by 772, and of the full board at 1920 by 1080, saved and named in the report.

Focused tests run locally (`pnpm vitest run --config tests/config/vitest.config.ts` on the new tests, `letter-explorer-url.test.ts`, `variation-columns.test.ts`, `codex-fan.test.ts`, `motion-coverage.test.ts`); the full check runs on d2.
