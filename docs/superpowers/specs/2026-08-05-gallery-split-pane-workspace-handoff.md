# Gallery Split-Pane Workspace — Handoff (2026-08-05)

## Mission

The gallery's filter workspace became a Library-style split pane: category
catalog and value editor in a left column, rule strip and a **live results
grid** on the right. Filtering updates the grid in place — the old "View N
results" button and the separate full-page grid screen are gone from the
gallery's desktop flows. Collections converted from a door (which ejected you
to the Library tab) into a stackable filter.

Design spec:
[2026-08-04-gallery-split-pane-workspace-design.md](2026-08-04-gallery-split-pane-workspace-design.md)
Plan + all task ledgers and closeouts (Tasks 0–10):
[2026-08-04-gallery-split-pane-workspace.md](../plans/shipped/2026-08-04-gallery-split-pane-workspace.md)

Origin: the 2026-08-04 unified-filter-workspace work left results behind a
top-right button. Austen, looking at a value screen at 1920: a newcomer picking
variables sees two cards adrift in an empty stage with only a small corner
button as a way forward, despite ample width to render results live.

## Done — verified

All commits are on `main` and **pushed to `origin/main`** — verified per SHA with
`git branch -r --contains`. `main` and `origin/main` are identical as of this
writing. (They were held local all session at Austen's instruction; a parallel
session pushed near the end — see the note under Loose ends.)

| What | SHA | Evidence |
|---|---|---|
| Landing grid-mode mini-tile pinned to its icon slot (art was falling back to `LessonGridDisplay`'s 180px max and floating over the "More ways to browse" header) | `907b9778c1` | Measured box 32×32 with SVG contained, at 1920 and 3840 |
| **Task 1** — `GalleryDrill.svelte` (6,248 lines) split into `GalleryLanding` + `GalleryWorkspace` + shared `CategoryTile`, behind an unchanged prop seam | `eb02237788` | `npm run check` 0/0; browse suite baseline; screenshots composition-identical to pre-split baselines (drill width 1847 before and after) |
| **Task 2** — split-pane layout with live results | `6854d7e845` | At 1920: `split: true`, left 440 / right 1359, 11 catalog tiles. Live-toggle walk with card + header counts changing per tap, no button press: 7→19→19→11 cards, 515→712→704→249 matches |
| **Task 3** — landing tiles morph into the catalog via View Transitions | `5ff9219008` | `transition.ready`/`finished` resolved, `error: null`, all 11 `gallery-cat-*` names present exactly once at capture; no `InvalidStateError` |
| **Task 4** — collection membership as a stackable filter | `681f979aaa` | 7/7 new unit tests; walk 1412→7 on "In: Poi-Legal", 7→6 stacking Level 1, 6→197 removing via × |
| **Task 5** — 375px collections fix + closeout | `32417bf1b3` | Rows measured 261/311/360/410, `overlap: false` |
| **Task 6** — Austen's review punch list: tile breathing room, contained art, unified surface, search bar removed, search/Show-all stay in the workspace | `dcbadffea7` | T&D dots measured 56px content in a 28px slot before → zero overflow on all 11 after; surface `rgba(0,0,0,0.719)` vs `rgba(0,0,0,0)` before → one token at 72% after; `.drill-search` absent from DOM; **I verified independently**: no "Start here" screen reachable, workspace retained through value-tap and chip-removal |
| **Task 7** — one morph seam for every filtering path + whole category labels | `63e6241d38` | 5 paths were silently not animating (connectives, chip ×, search apply/clear, sort); after: every path has non-zero animation count. **I verified independently**: 94 live view-transition animations on a T&D tap at 3840; zero truncated labels at 1920 and 3840 (was 3 and 6) |
| **Task 8** — filter motion system: sequenced exits/moves/staggered enters | `e86f95f548` | **I verified independently**: enter delays step 110/132/154/176/198 ms; durations 180 (exit) / 240–260 (enter) / 300–320 (move) |
| Turn slider applies live, confirm button removed | `d45fa92ef9` | ≤1→147, ≤0.5→71, back to ≤1→147 exactly (proves replace, not stack) |
| **"No limit" slider stop + engine removal-key fix** | `9bd20c27ae` | Stepping to "Any": header 71 → 700 matches with the turn chip **gone**. `.turn-limit` min-width holds 105px across every numeric stop (no re-centring) |
| **Task 9** — left column is a shared height budget | `e46bf28709` | Dead air at 2560: Grid mode 582→73, Length 730→89, T&D 542→68. **I verified independently**: catalog tiles 64→191px in a 3-col portrait grid; start-position art 76→191px, grid preview 144→220px |
| **Task 10** — Collections card overflow + LOOPs stale composition | `3fed1ca0ec`, `46d622232c` | **I verified independently**: `--editor-need` now 1036px on LOOPs from all four arrival paths tested (was 634 / 655 / 878 / 580); Collections cards contain all art, label, bar and count; LOOPs = 3 rows of 2 + Rewound spanning the width |
| **Catalog art scales with its tile; turn intensity gets a gauge** | `0bf45584dc` | Measured at 1920: icon glyphs 17px → 31px (35% → 65% of their box), dots → 100%, avatars 43% → 50%. At 2560: icons 68%, dots 100%, avatars 52% → 73%. `fa-gauge-high` confirmed live on the tile. `npm run check` 0/0 |

### The two root causes worth remembering

**The engine's filter key is not uniform.** Stacking categories (LOOPs, T&D,
and `OR_STACKING_TYPES`) key per value as `type:value`; single-valued ones key
by **bare type**, because re-adding replaces. The workspace's toggle-off always
removed the per-value key, so for a single-valued category it removed *nothing*.
Replace still looked correct because the following add overwrote; clearing has
no add, so it silently did nothing. Fixed in `BrowseModule`'s `onToggleValue`
(remove whichever key the engine actually holds). This was latent for **every**
non-stacking category, not just turns.

**The height budget was reading its own output.** A `minmax()` grid track is
maximised into its container's free space before alignment runs, so
`.value-list` was exactly as tall as the stage allowed — and the stage's
flex-basis was `--editor-need`, which the budget read back off that same list.
Every allocation was a valid fixed point, so you landed on whichever one the
previous screen produced. That is why LOOPs composed differently depending on
where you came from. The file's own header comment claimed it was "invariant to
the zone height it feeds"; it was wrong. Now measured from quantities the
allocation cannot move (row count × track ceiling, floored per row by content).

## Believed done — unverified

- **The no-category catalog "fill" state** (reached via Show all / backing out
  of a category). Task 9's executor reports it keeps a multi-column grid with
  the 11th tile spanning the row. I could not confirm it myself — my automation
  kept mis-clicking into the nav rail (see Gotchas). Worth one look.
- **Task 8's frame-series tuning** rests on the executor's filmstrip harness.
  I confirmed the timings and stagger numerically, not the felt quality of the
  motion frame by frame.
- **Below-the-seam behavior** (<~1200px) is claimed unchanged throughout and was
  screenshotted by executors at 960×412 and 375×667, but I did not personally
  re-walk the phone step-through flow after Tasks 9–10.

## In flight

**Nothing.** Every gallery file is committed and pushed; the working tree is
clean of this project's paths. No branches, no worktrees — all work is on
`main` in the primary checkout.

Earlier in the session a parallel session had `results-morph.ts` +
`BrowseModule.svelte` dirty (adding `registerResultsLayoutStabilizer`, so a
virtualized results layout gets a final measurement before Chrome captures the
new side of a transition). That session has since committed its own work. If
you are reading this and those files look unfamiliar, that is why.

## Resolved during the session (context, not work)

**The push.** It was held all day at Austen's instruction pending a history
question, then a parallel session pushed near the end: `main` and `origin/main`
are now identical and every commit in this handoff is on origin. That carried
`dfbb820cd3` out with it — a **mislabeled** commit, where an `index.lock`
collision during a `pull --rebase` folded three unrelated files
(`LOOPExpandedOverlay.svelte`, its test, `combination/domain/types.ts`) into a
"letter-calculus selection" commit. Content is intact and verified: the real
letter-calculus changes are byte-identical to the pre-rebase tip; only the label
is wrong. It is **published history** now, so leave it — rewriting would need a
force-push against a repo other sessions pull from. Austen's call if he ever
wants it cleaned.

## Loose ends (ranked)

1. **4K@100% — the app does not scale. Start here.** At a 3840 viewport
   `getComputedStyle(document.documentElement).fontSize` is still **16px**,
   because the lockstep root ramp in `src/app.css` is scoped to
   `html:has(.mkt-shell)` / `html:has(.legal-container)` — marketing and legal
   only. The whole app renders at 1080p proportions on a 4K monitor at 100%
   scaling. This is the systemic cause behind the "now make it work on 4K" cycle
   Austen has been in for weeks, and it is one ramp away from fixed — but the
   blast radius is every app surface (create, browse, learn, museum, practice),
   so it needs its own spec and sweep. **Recommended next project.**
2. **BrowsePanel sparse-results pass.** Sections holding 1–4 sequences leave
   most of their row empty at 2560/3840 — now the dominant visual defect in the
   results pane. Named as a fast-follow since Task 5; BrowsePanel internals were
   explicitly out of scope for this project.
3. **Phone-sheet feel test** (open since the 2026-08-04 handoff): decide on a
   real phone whether `GalleryFilterSheet` stays or phones also get the in-page
   workspace. Two `TODO(phone-sheet-feel)` markers in `GalleryTab.svelte`.
4. **Task 9/10 knock-ons, all designed behavior but worth a look:** the catalog
   compacts to 54px tiles on Collections and Creator at 2560/3840 (those screens
   claim their full ceiling); Level at 1920 scrolls further than before (108px
   hidden vs 23px) because its cards grew so the peek art fits inside.
5. **Max turn intensity still holds dead air** (68 / 144 / 544px at
   1920/2560/3840). It is one slider; more height only adds padding. Filling it
   means a comic slider or comic tiles. Deliberately left.
6. **The dense Length chip grid** sits outside the row-ceiling system, so its
   surplus all flows to the catalog. Reads fine; chips could be bigger if wanted.

## Decisions already made

Austen's calls — do not re-litigate:

- **2026-08-04, split pane approved.** Filters left, live results right, in-page
  (not modal). Value editor stacks *below* the category grid in one left column
  — his proposal, chosen over a three-column catalog|editor|results.
- **Category section = wrapping compact tiles**, all eleven always visible with
  labels (over an icon row or a collapsing list).
- **Rule strip lives atop the results column** as its header, not page-top.
- **Landing tiles morph into the workspace catalog**; one shared component, two
  compositions.
- **Collections is a stackable filter**, not a door. The Library tab stays the
  management home.
- **Narrow screens (<~1200px) fall back to today's step-through flow.** The
  split pane is a wide-screen enhancement only.
- **2026-08-05: the page-top search bar is removed from the gallery.** *"Search
  is not necessarily the primary way people will find sequences."* The results
  toolbar's own search is the search.
- **2026-08-05: search and "Show all" stay in the workspace.** This reversed an
  executor's earlier deviation; the "Start here" screen is no longer a
  destination of the gallery's desktop flows.
- **2026-08-05: the turn slider applies live** — no confirm button — and **"No
  limit" belongs in the editor**, not only on the chip's ×.
- **2026-08-05, on animation:** *"the most modern, best possible, most
  informative, most useful, most gorgeous animations you can bring to the
  table."* An animation that runs but does not communicate is a failure — a
  default 250ms opacity fade reads as a pop.
- **2026-08-05, on height:** the allocation between catalog and editor should
  *"morph up and down"* per screen rather than being a fixed split.
- **2026-08-05, on the catalog art:** the icons *"are really small, like you can
  barely read the creator avatar"* — art must scale with its tile, not sit at a
  constant. And Max turn intensity must not wear the LOOPs rotation glyph:
  *"I don't know why we're using the rotated loop label for the max turn
  intensity, that's not appropriate."* It is now `fa-gauge-high`.

## Gotchas

**Environment**

- **The chrome-devtools MCP disconnected mid-session and did not return.** Drive
  Chrome over CDP on port 9222 instead: `pwsh -NoProfile -File
  scripts/launch-chrome-debug.ps1 -Url about:blank`, then a Node script using
  the built-in `WebSocket`, `PUT /json/new`,
  `Emulation.setDeviceMetricsOverride`, `Runtime.evaluate`,
  `Page.captureScreenshot`. This worked reliably ~10 times today. Scratchpad
  only, never the repo. A disconnected tool is not an excuse to skip verifying.
- **Emulate at dimensions ×1.1 with `deviceScaleFactor: 1.1`** to compensate the
  110% localhost zoom (`reference_devtools_emulate_dpr`), or every sweep lands a
  tier low.
- **:5173 is Austen's dev server.** Never start, restart, or kill it.

**Shared checkout — this bit twice today**

- A parallel session's `git` process collided with a `pull --rebase` via
  `index.lock`, killing the rebase mid-pick and entangling that session's staged
  files into the conflict (→ loose end #1).
- A parallel session (or hook) committed a Task-10 executor's *in-progress*
  edits out from under it as `3fed1ca0ec`. Scoped to the right two files, so
  nothing else was swept, but nobody wrote that commit deliberately.
- **A Vite HMR full reload landing mid-measurement kills a view transition** —
  it shows as `finished ≈ ready + 15ms` with animations cancelled at
  `currentTime: 0`, and can blank the gallery. If numbers look impossible,
  re-sample rather than reporting them.

**Automation**

- The gallery takes several seconds to render and **the browse tab restore
  fights programmatic navigation** — poll until `document.body.innerText`
  matches `/matches|How do you want/` before clicking.
- **A naive "back button" selector matches a nav-rail button and navigates you
  clean out of the gallery** (I landed on the Submit Feedback page twice this
  way). Scope selectors to the left pane and assert `location.pathname` still
  starts with `/browse` after each click.
- A `header()` helper that regexes the whole body for `/\d+ matches/` will match
  the **left column's** summary, not the results header. Query
  `.pane-results-header` explicitly.

**Code**

- **The GalleryDrill line cap in
  `tests/unit/browse/gallery-drill-split-contract.test.ts` is a real
  constraint,** not a nuisance. It has been raised twice (600→800→900). When I
  hit 901 I trimmed a comment; when a Task-9 executor hit it, they extracted
  `GalleryPaneLeft.svelte` and the file went *down* to 855. Do not raise it.
- **The app globally disables `::view-transition-old/new(root)`**
  (`src/lib/shared/transitions/view-transitions.css`), so only **named**
  elements animate. Anything unnamed snaps. That is why naming the section
  headers mattered.
- **`sibling-index()` does not work inside `::view-transition-group()`.** It
  parses, is reported as supported, and creates the animation — but every group
  resolves it to `1`. Stagger is done with WAAPI on the pseudo-element after
  `transition.ready`.
- **View-transition names must be unique per document**;
  `src/lib/shared/transitions/view-transition-name-registry.ts` exists to
  arbitrate that (claim/release). Use it rather than assigning names raw.
- `--ease-out` is expo-out: an entering element is ~85% opaque by t=180ms and
  reads as "always been there". Use symmetric easing for enter/exit.
- Baseline test failures on `main`: two protobufjs import failures in
  `tests/unit/browse/`. Not yours; do not chase them.
