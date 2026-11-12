# Layout Law

Every layout rule for Flow Arts Composer, one line each. Read this page before
you arrange, size or resize anything on a screen.

Each rule is stated once, here. The files named in brackets explain how to do
it and why. If one of them disagrees with this page, this page is right: fix
the other file in the same change. Numbers such as the tap size and the device
list live only on this page.

Austen's layout calls are the source of these rules. A new call changes this
page the day he makes it.

## Size and type

- **One type size.** Words and controls are the same size on every screen. The
  root is 16px. Nothing ties a font size to the width of the window, and a
  wide-screen query never sets one. [`.claude/rules/4k-native-layout.md`]
- **Type roles.** Font sizes come from the `--font-size-*` roles in
  `src/app.css`. Text a person needs is 14px or more. Small supporting labels
  may be 12px. Do not redefine a role inside a component or a query.
  [`docs/architecture/responsive-design.md`]
- **Only the artwork scales.** A stage, pictograph, map, timeline or guide
  figure may grow and shrink with its box. Labels drawn as part of the artwork
  scale with it and use its font, such as the letters on a pictograph. The
  words and controls around it do not. On guide screens only figures read
  `--fit`.
- **Tap size.** On a phone, a control is at least 36px, or 32px where the
  animation or the pictographs need the room. On tablet and desktop it is at
  least 44px. A phone here is a touch screen whose short side is under 600px.
  Tokens: `--alt-touch-target` (36), `--min-touch-target-compact` (32),
  `--min-touch-target` (44).

## Fit and scroll

- **The page never scrolls.** Every screen is a fixed frame: header, one
  content area, primary actions. [`.claude/rules/no-page-scroll.md`]
- **Controls never scroll.** When they do not fit, split them into tabs or
  drill-down boxes.
- **Long content scrolls in its own area.** A library, a log or release notes
  may scroll. Only that area moves. One region owns each scroll direction, with
  no scroll inside a scroll. A new scrolling area says what it holds on its
  `overflow` line: `/* scrolls: release notes, long text */`.
- **Reach comes first.** Never remove scrolling if that leaves something out
  of reach. Keep it reachable, then fix the layout.
- **Everything fits.** Nothing spills out of its box or is cut off, at every
  size on the device list.
- **No sideways strips.** Do not make a person scroll a row left and right to
  find options, least of all on a phone. Wrap them, put them in a grid, or
  show a count that opens the full set.
- **A dragged surface owns the drag.** When a person drags a map or a canvas,
  the page behind it does not move.

## Space and arrangement

- **Hero first.** Size the thing the person came for first: the animation, the
  pictographs, the grid. Fit everything else into what is left. Extra room
  goes to the hero, not to bigger controls.
- **No leftover space.** Empty space is placed on purpose or filled. No panel
  sits in a blank region and no blank strip runs beside a column of text.
- **Text fills, then the screen rearranges.** Text fills its box at normal
  size. When lines get too long, give the screen a second column or put a
  figure beside the text. Never cap a paragraph's width and never enlarge type
  to fill. As a guide, body text past about 90 characters a line means the
  arrangement should change.
- **Shape follows the box.** A component arranges itself from the width and
  the height of the box it is given, using container queries. Window queries
  are for the page shell and for touch versus pointer.
- **One band, two wide seams.** A page has one composition band (`--shell-w`).
  Wide-screen arrangement changes at 1680px and 2600px only. A wide tier must
  add a column, a rail or a new arrangement. It never only makes things bigger.
- **Seven window widths.** A window-width query uses 480, 600, 768, 1024,
  1440, 1680 or 2600px and no other value. The first five are `BREAKPOINTS` in
  `src/lib/shared/device/domain/constants/device-constants.ts`. The last two
  are the wide seams. Any other width means the component should measure its
  own box with a container query.
- **Centre a group in its box.** Letters, presets, chips and guide headings sit
  centred in the space they are given.
- **Pairs share a row.** Two controls that work together sit on one row. A
  header holds only what it needs and keeps no room for things that are absent.
- **Width shows weight.** A wider tile is a more important tile. Do not stretch
  a leftover tile to fill its row.
- **One decision at a time.** No dialog on top of a dialog and no chain of
  dialogs. One tap gives one result. A dialog with a single choice closes when
  the choice is made.
- **No box in a box.** Items in a scrolling list are not wrapped in a second
  container.

## Movement

- **Nothing moves by accident.** Reserve the room before content arrives, so
  nothing shifts under the person. [`.claude/rules/no-layout-shift.md`]
- **Every caused change is animated.** When the person causes a change in
  arrangement or size, it moves through a shared motion owner. That includes a
  dialog or panel changing size. [`.claude/rules/no-layout-shift.md`]
- **Repeat buttons stay put.** A button a person presses several times in a
  row, such as add or plus, does not move between presses.
- **Placeholders match.** A loading placeholder has the shape of what loads.
- **A loading screen leaves when the page is drawn.** It never leaves because
  a timer ran out, and it never hands over to an empty screen or to a second
  loader. When the wait is long it says so and offers a reload.
- **Reduced motion.** With reduced motion on, the screen goes straight to the
  end state.

## Menus, dialogs and drawers

- **Shared owners.** Dialogs, drawers and panels use `BaseModal`, `Drawer` and
  `PanelGroup`. [`.claude/rules/never-hand-roll.md`]
- **Opaque.** A menu, dropdown or drawer does not let what is behind it show
  through.
- **Never taller than the screen.** A menu or dialog fits the screen it opens
  on.

## Proof

- **Measure, then look.** Before reporting, check the changed screen at every
  size on the device list and at 200% browser zoom.
  [`.claude/rules/visual-verification-mandatory.md`]
- **A pass means all of it.** Every screen of the surface at every size, not
  the one that happened to be open.
- **One sheet.** Show Austen every size side by side in one picture.

## Device list

This is the only list of sizes. Other files point here. Sizes are CSS pixels.

| Screen               | Size      |
| -------------------- | --------- |
| Small phone          | 375×667   |
| Fold cover, upright  | 412×915   |
| Fold cover, sideways | 915×412   |
| Phone, sideways      | 960×412   |
| Fold unfolded        | 707×772   |
| Tablet, upright      | 820×1180  |
| Laptop               | 1440×900  |
| 4K at 200% scaling   | 1920×1080 |
| 4K at 150% scaling   | 2560×1440 |
| 4K at 100% scaling   | 3840×2160 |

A full pass covers every row. Skip a row only when the surface cannot appear
there, and say why in the evidence.

## What checks these rules

A rule that only exists as words gets broken again. These checks exist today:

- Caused changes are animated: `src/lib/shared/transitions/motion-coverage.test.ts`.
- Reduced motion: `src/lib/shared/transitions/reduced-motion-css.test.ts`.
- Guide words never scale: `tests/unit/guide-fit-type-roles-contract.test.ts`.
- One type size, type roles, seven window widths, the page never scrolls, text fills and shared owners in source: `npm run layout:scan` (`scripts/layout/scan.mjs`). A branch may not add breaks: for each rule, the count across the files it changed may not go up from where it left `main`. `wt:finish` runs it on style changes. `npm run layout:scan -- --totals` prints today's counts.
- Fit, scroll, cut-off text, small text, tap size and hero share on real screens at every size: `npm run layout:sweep` (`scripts/layout/sweep.mjs`), run on demand and before a ship.
- The device list matches `scripts/layout/device-list.json`: `tests/unit/layout/device-list.test.ts`.
- A loading screen leaves when the page is drawn, for the boot screen only: `tests/unit/boot-bar-self-timing.test.ts`, `tests/unit/startup-splash-handoff.test.ts` and `tests/unit/shared/application/boot-screen.test.ts` (no timer in `src/app.html` takes the screen away; a long wait shows the message and Reload). `node scripts/boot-handoff-check.mjs` proves it in a real browser with the app's code held back 30 s, at 1280×800 and 390×844; run it on demand after a change to the boot screen. Loaders inside the app are still checked by eye.

Every other rule on this page is checked by eye. When you add a check for one,
list it here.
