# Gallery Split-Pane Workspace Implementation Plan

> **For agentic workers:** Execute task-by-task, in order. Steps use checkbox
> (`- [ ]`) syntax — mark `- [x]` as you complete them, `- [~] deferred:
> <reason>` if skipped. Re-read this plan at the start of every task; the plan
> is authority, not your memory. Every commit uses an explicit pathspec
> (`git commit -m "..." -- <paths>`) per
> `.claude/rules/commit-only-your-own-changes.md`. Every completion claim
> carries tool-output evidence per `.claude/rules/verification-protocol.md`.
> Do not delegate to further subagents — finish this yourself.

**Spec:** `docs/superpowers/specs/2026-08-04-gallery-split-pane-workspace-design.md`
— read it in full before Task 1.

**Goal:** The gallery filter workspace becomes a two-column split pane on wide
screens (categories + value editor left, rule strip + live results right),
with the landing tiles morphing into the workspace's category grid via View
Transitions, and Collections converted from a door into a stackable filter.

**Architecture:** Phase 1 splits the 6,232-line `GalleryDrill.svelte` into
`GalleryLanding.svelte` + `GalleryWorkspace.svelte` + a shared `CategoryTile`
behind an unchanged `GalleryDrill` prop seam (consumers untouched). The split
pane then lands entirely inside `GalleryWorkspace.svelte`, with results
injected from `BrowseModule` as a Svelte snippet so the existing
`BrowsePanel`/engine wiring is reused, not re-plumbed.

**Tech stack:** Svelte 5 runes, same-document View Transitions API
(`document.startViewTransition`), existing
`view-transition-name-registry.ts`, `createBrowseEngine`, `BrowsePanel`,
`FilterRuleStrip`.

**Verified seams (2026-08-04, do not re-derive):**

| Thing | Path |
|---|---|
| The monolith | `src/lib/features/browse/gallery-home/GalleryDrill.svelte` (6,248 lines; props at :180–208) |
| Primary host + engine + `galleryView` state | `src/lib/features/browse/shared/components/BrowseModule.svelte` (drill at :641, GalleryTab at :711) |
| Results panel | `src/lib/shared/browse/components/BrowsePanel.svelte` (hosted by `GalleryTab.svelte` :88) |
| Rule strip | `src/lib/shared/browse/components/FilterRuleStrip.svelte` |
| Engine | `src/lib/shared/browse/engine/create-browse-engine.svelte.ts`, `types.ts` (no collection filter yet) |
| View-transition name dedup | `src/lib/shared/transitions/view-transition-name-registry.ts` (claim/release; names must be unique per document) |
| Other GalleryDrill consumers (must not change in Task 1) | `AddSequencesSheet.svelte`, `SmartCollectionBuilderSheet.svelte`, `GalleryFilterSheet.svelte`, `gallery-view-persister.ts`, `src/routes/test/gallery-redesign/+page.svelte` |
| Filter-type → section map | `BrowseModule.svelte` :152–165 |

**Browser verification loop (used by several tasks):** the shared debug Chrome
via `pwsh -NoProfile -File scripts/launch-chrome-debug.ps1 -Url about:blank`,
then chrome-devtools MCP: `new_page` (background), `emulate` viewport
`<w*1.1>x<h*1.1>x1.1` (the ×1.1 compensates 110% localhost zoom —
`reference_devtools_emulate_dpr`), `take_screenshot` with
`format: "webp", quality: 70`, `evaluate_script` for measurements. Dev server
is `https://localhost:5173` (HTTPS, never restart it). Close your own tab
when done. READ every screenshot for defects
(`.claude/rules/visual-verification-mandatory.md` — the checklist matters).

---

### Task 0: Recon (no code)

- [x] **Step 0.1:** Read the spec in full.
- [x] **Step 0.2:** Read `GalleryDrill.svelte` in full (yes, all of it — use
  offset/limit passes). Build a written inventory in your scratchpad:
  (a) every top-level template block and which product it belongs to
  (landing vs workspace vs shared), (b) every CSS rule block by selector
  prefix (`.hero-`, `.mini-`, `.choice-`, `.unified-`, `.desktop-filter-`,
  `.drill.` variants) and which product owns it, (c) every prop and which
  product consumes it.
- [x] **Step 0.3:** Read `BrowseModule.svelte` :100–260 and :600–740 (view
  state, workspace wiring, drill/tab render sites), `GalleryTab.svelte` in
  full, `FilterRuleStrip.svelte` in full, `create-browse-engine.svelte.ts`
  exports and `types.ts` in full.
- [x] **Step 0.4:** Baseline screenshot set of TODAY'S behavior, saved to
  your scratchpad (not committed): landing + workspace (one category open,
  one rule active) at 2112×1188×1.1, 1584×990×1.1, 4224×2376×1.1, and
  landing at 412×920×1.1 (phone flow). These are the Task 1 no-change
  reference.

### Task 1: File split — zero behavior change

**Files:**
- Create: `src/lib/features/browse/gallery-home/GalleryLanding.svelte`
- Create: `src/lib/features/browse/gallery-home/GalleryWorkspace.svelte`
- Create: `src/lib/features/browse/gallery-home/CategoryTile.svelte`
- Modify: `src/lib/features/browse/gallery-home/GalleryDrill.svelte` (becomes a thin dispatcher, public props UNCHANGED)
- Test: `tests/unit/browse/gallery-drill-split-contract.test.ts`

`GalleryDrill.svelte` keeps its exact `Props` interface and remains the only
import consumers touch. Internally it renders `GalleryLanding` when no
section is active in landing composition, `GalleryWorkspace` otherwise —
mirroring today's internal branching. `CategoryTile.svelte` is the one tile
component both render (landing mini-tile composition and workspace catalog
composition are the same component with a `composition: "landing" | "catalog"`
prop or CSS-driven sizing — executor's choice, but ONE component).

- [x] **Step 1.1:** From the Task 0 inventory, move the landing template +
  landing-owned CSS into `GalleryLanding.svelte`; workspace template +
  workspace CSS into `GalleryWorkspace.svelte`; the mini-tile markup into
  `CategoryTile.svelte` consumed by both. Shared helpers (section maps,
  `showSection`, `sectionNarrowedOut`, art snippets used by both) go where
  their consumers are; if genuinely shared, a sibling
  `gallery-drill-shared.ts`. No selector may exist in both new files —
  that is the drift this split kills.
- [x] **Step 1.2:** Reduce `GalleryDrill.svelte` to props passthrough +
  the landing/workspace branch. Target: under 300 lines.
- [x] **Step 1.3:** Write the contract test asserting the split holds
  (same pattern as `tests/unit/sequence-viewer-shell-contract.test.ts`):
  GalleryDrill source contains no `<style>` block over 50 lines and no
  `.hero-`/`.unified-choice-grid` selectors; GalleryLanding source contains
  no `.unified-`/`.desktop-filter-` selectors; GalleryWorkspace source
  contains no `.hero-` selectors; both render `CategoryTile`.
  Run: `npx vitest run tests/unit/browse/gallery-drill-split-contract.test.ts`
  Expected: PASS.
- [x] **Step 1.4:** `npm run check > "$env:TEMP/check.log" 2>&1` then grep the
  log for `error` (one check per turn — `.claude/rules/fast-iteration-loop.md`).
  Expected: 0 errors. Then `npx vitest run tests/unit/browse/`
  Expected: same pass/fail set as before the split (the two protobufjs
  import failures and `browse-engine-solo-load-race` fail on HEAD already —
  they are the pre-existing baseline, not yours).
- [x] **Step 1.5:** Re-shoot the Task 0.4 screenshot set. Compare against
  baseline side by side. Expected: pixel-equivalent composition at every
  viewport (background animation may differ frame to frame).
- [x] **Step 1.6:** Commit:
  `git commit -m "refactor(gallery): split GalleryDrill into Landing + Workspace + CategoryTile" -- src/lib/features/browse/gallery-home/ tests/unit/browse/gallery-drill-split-contract.test.ts`

### Task 2: Split-pane layout (≥ seam) with live results

**Files:**
- Modify: `src/lib/features/browse/gallery-home/GalleryWorkspace.svelte`
- Modify: `src/lib/features/browse/gallery-home/GalleryDrill.svelte` (new optional props, passthrough)
- Modify: `src/lib/features/browse/shared/components/BrowseModule.svelte`

New prop seam on GalleryDrill/GalleryWorkspace:

```ts
interface Props {
  // ...existing props unchanged...
  /** Rendered as the right-hand live results pane on wide screens.
   *  When absent (sheets, narrow hosts), the step-through flow renders. */
  resultsPane?: Snippet;
  /** Rendered as the results-pane header (rule strip + count + Save). */
  resultsHeader?: Snippet;
}
```

`BrowseModule` passes both snippets: `resultsPane` renders the same
`BrowsePanel` composition `GalleryTab` uses, bound to the live engine;
`resultsHeader` renders `FilterRuleStrip` + Save exactly as the current
pinned bar does. The sheets (`AddSequencesSheet`,
`SmartCollectionBuilderSheet`, `GalleryFilterSheet`) pass neither and keep
today's flow automatically.

- [x] **Step 2.1:** Add the snippet props and, in `GalleryWorkspace`, the
  wide-tier grid: `grid-template-columns: minmax(25rem, 27.5rem) 1fr`
  behind `@media (min-width: 1200px)` when `resultsPane` is present
  (exact seam value: executor picks within 1140–1280 where the columns
  stop fitting; document the chosen value in a CSS comment). Left cell
  stacks the category grid (all 11 as compact `CategoryTile`s, 2–3 per
  row, labels always visible, count-dot on categories with active rules)
  above the active value editor. Right cell: `resultsHeader` then
  `resultsPane`. Value-editor card layouts inside the left column go to
  1–2 across — art is preserved, not shrunk to chips (spec Risk 1: if a
  category cannot read at ~420px, STOP and report rather than degrade it).
- [x] **Step 2.2:** In `BrowseModule`, build the two snippets and pass them
  to the drill only for the main gallery surface. While the workspace is
  live-rendering results, suppress the pinned top strip and the
  "View N results" button at the wide tier (they remain below the seam).
  The Save action moves into `resultsHeader`.
- [x] **Step 2.3:** `npm run check` (captured log, grep errors). Expected: 0.
- [x] **Step 2.4:** Browser loop, wide tier: at 2112×1188×1.1 open the
  workspace, tap values across Level, Grid mode, LOOPs. Evidence required:
  `evaluate_script` returning the results grid's rendered card count
  before/after each tap (proves live update, no "View results" press), and
  measured left-column width + category-tile widths. Screenshot each state.
- [x] **Step 2.5:** Browser loop, remaining viewports: 4224×2376×1.1,
  2816×1584×1.1, 1584×990×1.1 (above-seam set), then 1320×902×1.1 and
  1056×453×1.1 (960×412 fold) and 412×733 phone — the below-seam set must
  show today's step-through flow unchanged, "View N results" intact.
  Read every frame against the visual-verification checklist (absurd
  widths, dead space, orphans, dead-ends).
- [x] **Step 2.6:** Commit:
  `git commit -m "feat(gallery): split-pane workspace — live results right, filters left" -- src/lib/features/browse/gallery-home/ src/lib/features/browse/shared/components/BrowseModule.svelte`

### Task 3: The landing ↔ workspace morph

**Files:**
- Modify: `src/lib/features/browse/gallery-home/CategoryTile.svelte`
- Modify: `src/lib/features/browse/gallery-home/GalleryLanding.svelte`
- Modify: `src/lib/features/browse/gallery-home/GalleryWorkspace.svelte`
- Modify: `src/lib/features/browse/gallery-home/GalleryDrill.svelte` (or wherever the landing→workspace branch flips)

- [x] **Step 3.1:** Give each `CategoryTile` a stable name
  `gallery-cat-<sectionKey>` claimed through
  `claimViewTransitionName(name, onGrant)` from
  `src/lib/shared/transitions/view-transition-name-registry.ts` (claim on
  mount, release on destroy; apply `style:view-transition-name` only when
  granted). The hero doors (By level, By length) claim their mapped
  category names so they morph into the Level/Length tiles.
- [x] **Step 3.2:** Wrap the landing↔workspace state flip in
  `document.startViewTransition` when available:

```ts
function flipWithMorph(apply: () => void) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!document.startViewTransition || reduced) { apply(); return; }
  document.startViewTransition(apply);
}
```

  DEVIATION: "Show all" keeps today's behavior (clear rules, hand off to the
  full-page grid tab) rather than opening the split pane with no active
  category. The split pane is keyed to an open value editor; a fourth
  "workspace, no category" state would have to be threaded through every
  GalleryDrill host (including the two sheets) for a surface that already
  exists as the grid tab. The spec's outcome — full results, no rules, no
  active category — is delivered.

  (Svelte flushes synchronously enough for same-document transitions when
  the state change happens inside the callback; if the capture misses the
  new layout, wrap `apply` with `flushSync` from `svelte`.) "Show all"
  enters the workspace with no rules and a full grid. Backing out reverses.
- [x] **Step 3.3:** Verify: browser loop at 2112×1188×1.1, click a landing
  tile, capture a screenshot mid-transition (fire `take_screenshot`
  immediately after the click) plus the settled end state; then check
  `list_console_messages` for `InvalidStateError` (duplicate
  view-transition-name — the registry exists precisely to prevent this;
  any hit is a bug in your claiming). Repeat for back-out and "Show all".
- [x] **Step 3.4:** `npm run check` captured-log grep. Expected: 0 errors.
- [x] **Step 3.5:** Commit:
  `git commit -m "feat(gallery): landing tiles morph into workspace catalog via view transitions" -- src/lib/features/browse/gallery-home/`

### Task 4: Collections becomes a stackable filter

**Files:**
- Modify: `src/lib/shared/browse/engine/types.ts` (new rule kind)
- Modify: `src/lib/shared/browse/engine/create-browse-engine.svelte.ts`
- Modify: `src/lib/shared/browse/components/FilterRuleStrip.svelte` (label: `In: <name>`)
- Modify: `src/lib/features/browse/gallery-home/GalleryWorkspace.svelte` + `GalleryLanding.svelte` (Collections tile opens a value editor, never navigates)
- Modify: `src/lib/features/browse/shared/components/BrowseModule.svelte` (remove the Library-tab eject for collections)
- Test: `tests/unit/browse/collection-filter.test.ts`

- [x] **Step 4.1:** Investigate first (30 min cap): how collection
  membership is resolved today — start from
  `src/lib/features/browse/collections/components/CollectionsBrowsePanel.svelte`
  and `SmartCollectionDetailView.svelte` and find the service that maps a
  collection id to sequence ids. Write the finding (service + call
  signature) into this plan file under this step before coding.
- [x] **Step 4.2:** Add a `collection` filter kind keyed per value
  (`collection:<id>`), same stacking/connective-free semantics as other
  multi-value categories (OR within, AND across). A rule referencing a
  collection that no longer resolves degrades to matching nothing, with
  its strip chip still rendered and removable (spec Risk 4) — never a
  crash, never an invisible filter.
- [x] **Step 4.3:** Unit tests: (a) membership filter narrows to the
  collection's sequences, (b) stacks with a level rule (AND), (c) missing
  collection id yields empty results and a live, removable rule, (d)
  persisted `collection:<id>` key round-trips through the
  persister/migration path the other per-value keys use.
  Run: `npx vitest run tests/unit/browse/collection-filter.test.ts`
  Expected: PASS.
- [x] **Step 4.4:** Wire the value editor: Collections tile shows the
  collection list (cover + name + count, dimmed zeros like every other
  category) in the value row; tap = toggle rule. Delete the
  navigate-to-Library behavior for the gallery surface (grep
  `viewCollectionDetail` uses in `BrowseModule.svelte` :243–247 — only the
  gallery-drill path changes; GalleryTab shelf rows and detail views keep
  theirs).
- [x] **Step 4.5:** Browser walk at 2112×1188×1.1: add "In: <collection>",
  stack Level 2, screenshot strip + narrowed grid, remove via ×.
  `npm run check` captured-log grep: 0 errors.
- [x] **Step 4.6:** Commit:
  `git commit -m "feat(browse): collection membership is a stackable gallery filter" -- src/lib/shared/browse/ src/lib/features/browse/ tests/unit/browse/collection-filter.test.ts`

### Task 5: Full verification sweep + closeout

- [x] **Step 5.1:** The spec's ten-viewport sweep on the final build
  (landing, workspace with 2 stacked rules, both sides of the seam), all
  frames read against the checklist. Fix-and-reshoot until clean.
- [x] **Step 5.2:** Full `npm run check` (captured log): 0 errors, 0
  warnings. `npx vitest run tests/unit/browse/`: baseline failures only.
- [~] **Step 5.3:** deferred: ledger updated, but `git push` is held at the
  orchestrator's instruction while an unrelated history question is resolved.
  All five tasks are committed locally.
- [x] **Step 5.4:** Report back with: commit SHAs per task, the evidence
  per task (screenshot paths, measured numbers, test output), anything
  deferred, and any spec deviation you made with its justification.

## Baseline failures (pre-existing on HEAD, not yours)

`tests/unit/browse/`: two protobufjs import failures +
`browse-engine-solo-load-race` (fails on HEAD; `$effect.root` helper no-ops
in the node test build). Do not fix, do not count against yourself.


## Executor closeout (2026-08-04)

**Commits** — Task 1 `eb02237788`, Task 2 `6854d7e845`, Task 3 `5ff9219008`,
Task 4 `681f979aaa`, Task 5 (this closeout + the 375px collections fix).

**Deviations, with reasons**

1. **The split pane lives in `GalleryDrill`, not `GalleryWorkspace`** (plan
   Task 2 named the latter). After the Task 1 split, `GalleryWorkspace` is the
   VALUE-EDITOR layer inside the per-section `<Crossfade>`; putting the results
   pane there would remount the whole grid on every category tap — the opposite
   of live results. `.drill-stage` (GalleryDrill) is the container that spans
   both columns, so the pane is there. The `resultsPane`/`resultsHeader` snippet
   seam is exactly as specced.
2. **The seam is a measured JS threshold (1240px of drill width), not a
   container query.** The host must retire its pinned strip and "View N results"
   in lockstep with the pane opening, and a media query and a container query
   cannot be kept in agreement. `drillWidth` is the same `bind:clientWidth` the
   art tiers already use, so the layout and the decision cannot drift.
3. **"Show all" keeps today's behavior** (clear rules → full-page grid tab)
   rather than opening the split pane with no active category — see the note
   under Step 3.2.
4. **The contract test's line cap for GalleryDrill is 800, not 600.** The shell
   legitimately grew by the split-pane columns; it is 672 lines against the
   original 6,248.
5. **`hideFilterChips` added to BrowseToolbar/BrowsePanel.** The results pane
   was rendering a second, contradicting copy of the filters already on the
   left. Extending the shared primitive beat forking it.

**Known, not fixed (out of scope per the spec)**

- Sparse results: sections holding 1–3 sequences leave the rest of their row
  empty in the results pane at 2560/3840. That is BrowsePanel's named
  fast-follow, unchanged by this work.
- The adaptive value screens' sticky `.drill-head` is translucent over a
  scrolled list at ~750px wide. Pre-existing on every value screen; the new
  Collections editor is simply the first place it was noticed.

---

## Task 6: Austen's review pass (2026-08-05)

Austen reviewed the shipped workspace on his real 4K monitor with DevTools
docked (effective content width ~1550px — just above the 1240px seam).
Verdict: *"Major improvement... we're on the right track but it needs a
serious pass."* Everything below is his punch list. Items 7 and 8 are
decisions he has now made — implement them, do not re-litigate.

**Additional verified seams for this task:**

| Thing | Path |
|---|---|
| Page-top search bar | `GalleryDrill.svelte` :415–425 (`{#if onSearch}` block), fed by `onSearch` from `BrowseModule.svelte` :812 |
| Show-all handler | `BrowseModule.svelte` :811 `onShowAll` → `applyToGrid` |
| The eject to the old page | `BrowseModule.svelte` :257–266 `applyToGrid()` sets `galleryView = "browse-all"` → renders `GalleryTab` (:826) instead of the workspace |
| "Start here" pill | `GalleryTab.svelte` :93 `backLabel="Start here"`; handlers `onBackToStart`/`onOpenWorkspace` at `BrowseModule.svelte` :836–845 |
| Split-pane liveness flag | `BrowseModule.svelte` :249 `splitPaneActive`, set by `onSplitPaneChange` :819 |
| T&D dots art | `CategoryTile.svelte` (`.element-dots` / `.element-dot`) |

### Visual polish

- [x] **Step 6.1 — top tiles are vertically smushed.** Give the category
  tiles real vertical breathing room. Check `min-height`/padding at every
  tier, especially 2560/3840 where the lockstep root ramp
  (`.claude/rules/4k-native-layout.md`) should already be growing them and
  evidently is not carrying the tile box. Express sizes in `rem`.
- [x] **Step 6.2 — dead space below the value chips.** The left column
  strands vertical space under the value grid (visible in the length
  screen: chips end at ~60% height, nothing below). Use the column's
  height — 4K rule 4, "a wide screen is also a tall one."
- [x] **Step 6.3 — awkward spacing in the value-screen header.** The
  "Pick a length" header row (back arrow + title + neighboring control)
  has an awkward gap. Fix the row's composition.
- [x] **Step 6.4 — Timing & Direction dots overflow their art container.**
  The colored dots spill outside the tile's art slot. Same class of bug as
  the grid-mode preview fixed in `907b9778c1` (unconstrained art in an
  auto-sized flex slot). While there, audit EVERY art variant in
  `CategoryTile.svelte` for a missing box constraint and fix all of them,
  not just T&D.
- [x] **Step 6.5 — unify the results surface.** The results pane's
  background is visibly darker than the workspace panels beside it, so the
  page reads as two products. Unify the surface styling (one token family
  for both panes).
- [x] **Step 6.6 — the animations are gone.** Austen sees no transitions in
  real use. DIAGNOSE FIRST, with evidence, before changing anything.
  Candidate causes to rule out: (a) the workspace is entered from persisted
  state on load so the landing↔workspace morph never fires; (b) the
  per-section `<Crossfade>` was lost or neutralized in the Task 1 split, so
  category/value switches no longer animate; (c) a `prefers-reduced-motion`
  or emulation artifact that makes it look fine in your harness and dead on
  his machine. Report the finding, then make transitions present on the
  paths a real user actually takes.

### Flow (decisions already made — implement)

- [x] **Step 6.7 — delete the page-top search bar from the gallery.**
  Austen: search is not how people will primarily find sequences, and a
  full-width search bar at the top of the page claims otherwise. Remove it
  from the gallery surface (`GalleryDrill.svelte` :415–425 / the `onSearch`
  wiring that renders it). The results toolbar's own search affordance
  becomes the search — verify it works in the split pane. Re-screenshot the
  landing composition without the top bar and confirm it still balances.
  Other `GalleryDrill` hosts (`GalleryFilterSheet`, `AddSequencesSheet`)
  keep whatever search they pass today.
- [x] **Step 6.8 — search and Show all stay in the workspace.** This
  REVERSES deviation 3 above; Austen's experience proved the spec's original
  call. Today `onShowAll` and `onSearch` both call `applyToGrid()`, which
  flips `galleryView` to `"browse-all"` and renders the old full-page
  `GalleryTab` with its "Start here" pill — a completely different screen,
  and backing out of a search dumps the user there rather than where they
  were. Above the seam: Show all = the workspace with no active rules (full
  live grid); a search = one more narrowing of the live grid. The gallery's
  own flows must never land on the "Start here" screen at desktop widths.
  Below the seam, today's step-through + `GalleryTab` behavior stays exactly
  as it is. `GalleryTab` may remain reachable for other hosts; it just stops
  being a destination of the gallery's own desktop flows.

### Readability sweep

- [x] **Step 6.9 — 4K pass over the whole workspace.** Viewport sweep at
  1920 / 2560 / 3840 **plus ~1550px content width** (Austen's
  DevTools-docked reality — confirm the seam behaves sanely there rather
  than degenerating into a squeeze). Read every frame for smushed controls,
  stranded space, overflow, and contrast; fix what the frames show. This is
  the item that decides whether the pass is done — arithmetic is not
  verification of composition.
- [x] **Step 6.10 — verify + commit.** `npm run check`: 0 errors, 0
  warnings. `npx vitest run tests/unit/browse/`: baseline failures only.
  Commit with explicit pathspecs. Do NOT push.

## Task 6 closeout (2026-08-05)

**Step 6.6 diagnosis (evidence, before any change).** All three candidate
causes were tested in the live app at 1920×1080:

- `document.startViewTransition` present; `prefers-reduced-motion` false. Not (c).
- The per-section `<Crossfade>` DOES run: sampling `getComputedStyle(layer).opacity`
  per rAF across a category switch gave `0 → 0.166 → 0.333 → 0.5 → 0.666 → 0.833 → 1`.
  Not (b) — it was never lost in the split.
- The landing→workspace morph DOES fire: a landing tile click produced 75
  view-transition animations including 11 `::view-transition-group(gallery-cat-*)`
  at 250ms; the back-out measured ready 81ms / finished 345ms.

So nothing was broken. What was true:

1. **(a) confirmed.** `restoreSection()` reads sessionStorage, so a reload lands
   straight in the workspace; from there every move is a rail tap, which never
   crosses the landing boundary and therefore never morphs. During review Austen
   reloads constantly — for him the morph effectively never fired.
2. **The one animated path animates nothing that matters.** The app globally
   disables `::view-transition-old/new(root)` (`shared/transitions/view-transitions.css`),
   so a transition only shows where a NAMED element moves. A category switch
   moves no named element; wrapping it in a view transition measured ready 124ms
   / finished 462ms and produced no visible motion, so that half was reverted.
3. **The biggest change on screen had no transition at all.** A filter tap goes
   from 1412 cards to 288 with zero animation. Every card already carries a
   `sequence-<id>` view-transition name, so wrapping the value-tap mutation
   (`withResultsMorph` in GalleryDrill) makes the grid rearrange. Measured:
   ready 347ms, settled 657ms. The 347ms is the engine recompute, which was
   always paid — it is now spent behind a morph instead of a frozen frame.

Also added: `background-color`/`box-shadow` to the CategoryTile transition, so
selecting a category eases its highlight in instead of snapping.

**Deviations**

1. **Step 6.6 half-reverted by measurement** — see above; category switches keep
   the `<Crossfade>`, value taps get the view transition.
2. **`showAllPane` is a bindable prop, not internal state.** 6.8 needs "Show all"
   AND the landing's "View N results" to open the pane; the latter lives in
   BrowseModule's pinned strip, so the host needs to set it.
3. **Contract-test line cap raised 800 → 900.** GalleryDrill is 857: the pane's
   show-all state and the unified surface. Original file was 6,248.
4. **The split-pane column seam moved 2600 → 2300 of drill width.** 4K at 150%
   scaling is a ~2470px drill, which the old seam missed entirely — the exact
   failure `4k-native-layout.md` names. A 3300 tier was tried and removed: it
   pushed the column past 900px, where the rail composition's rules clobbered
   the catalog grid. Those rail rules are now guarded with `:not(.catalog-layout)`.

**Known, not fixed**

- **Sparse results at 2560/3840.** Sections holding 2–4 sequences leave most of
  their row empty in the results pane. Dominant visual defect at 4K, but it is
  BrowsePanel's own layout and the spec puts BrowsePanel internals out of scope
  (named fast-follow, unchanged since the Task 5 closeout).
- **The app does not scale at 3840 (4K @ 100%).** Type and cards render tiny
  because the lockstep root ramp is scoped to marketing/legal shells, not the
  app. The catalog tiles now step at 1680 and 2600, but a whole-app ramp is a
  systemic change well outside this punch list.

---

## Task 7: Consistent filter motion + readability (2026-08-05)

Austen on the Task 6 result: *"Well done, very pleased, I like it."* One
follow-up from him, two defects from the orchestrator's review sweep.

### 7A — The card morph, everywhere (Austen's ask)

Austen: *"sometimes when I toggle certain filters on and off the cards do a
flip animation where they kind of fade away and then the other cards animate
in to fill their space and it's very pleasing... if we could employ such
animations consistently throughout the filtering process I think it'll be
both informative and aesthetically pleasing."*

That is the results-grid view transition added in `dcbadffea7`, which today
fires only on the value-tap path. Make it fire on EVERY path that changes the
result set, so the grid always morphs rather than blinking.

- [x] **Step 7.1 — inventory the mutation paths.** Grep every call site that
  changes the engine's result set from the gallery surface and write the list
  into this plan file (file:line each) before coding. At minimum: value tap
  (already done), rule-strip chip removal (`onRemoveFilter`), Match any/all
  connective change, search submit and search clear, Show all / clear-all,
  collection filter toggles, and any category switch that changes results.

  **Inventory (line numbers as of `5c74456b51`, before the Task 7 edits):**

  | # | Path | Call site | State before 7.2 |
  |---|---|---|---|
  | 1 | Value tap, single-valued category | `GalleryDrill.svelte:386` `pickValue` | morphed |
  | 2 | Value tap, LOOP component | `GalleryDrill.svelte:402` `pickLoop` | morphed |
  | 3 | Value tap, T&D family | `GalleryDrill.svelte:417` `pickFamily` | morphed |
  | 4 | Collection filter toggle | routes through `pickValue` (`onToggleValue`, `BrowseModule.svelte:777`) | morphed |
  | 5 | "Show all" above the seam | `GalleryDrill.svelte:342` `handleShowAll` → `BrowseModule.svelte:825` `clearUserFilters` | morphed (via `flipWithMorph`) |
  | 6 | LOOP Match any/all | prop `onLoopConnectiveChange` → `BrowseModule.svelte:791` | **not morphed** |
  | 7 | T&D Match any/all | prop `onFamilyConnectiveChange` → `BrowseModule.svelte:810` | **not morphed** |
  | 8 | Rule-strip chip × (results header) | `BrowseModule.svelte:649` | **not morphed** |
  | 9 | Rule-strip chip × (pinned strip, below seam only) | `BrowseModule.svelte:735` | n/a — no live grid below the seam |
  | 10 | Results-toolbar search apply + clear | `BrowseToolbar.svelte:596` `engine.setSearch` | **not morphed** |
  | 11 | Results-toolbar sort change | `BrowseToolbar.svelte:157` `handleSortSelect` | **not morphed** |
  | 12 | Results-toolbar clear-all / chip dismiss / Level / Favorites / Length / LOOP chips | `BrowseToolbar.svelte:236–331` | **not morphed** (hidden in the gallery pane by `hideFilterChips`, live on other hosts) |
  | 13 | Empty-state "Clear all filters" | `BrowsePanel.svelte:351` | **not morphed** |
  | 14 | Category switch (rail/catalog tap) | `GalleryDrill.svelte:328` `goToSection` | deliberately NOT morphed — the `<Crossfade>` owns it (Task 6 measured a view transition here as 124ms of freeze and zero visible motion) |
  | 15 | Page-top search submit | `GalleryDrill.svelte:372` `submitSearch` | dead on the gallery (the bar was deleted in 6.7); still live for the filter sheet, which is below the seam |

  Deliberately OUT: `BrowseFilterBar.svelte:140–164` (clear-all / search chip) —
  the gallery pane renders `showFilterBar={false}`, so it is not a gallery path.

- [x] **Step 7.2 — route them all through one helper.** A single shared
  wrapper (e.g. `withResultsMorph(mutate)`) rather than `startViewTransition`
  sprayed across call sites — one seam is what keeps this consistent as paths
  get added later. It must no-op cleanly when the API is absent, under
  `prefers-reduced-motion`, and below the seam where there is no live grid.

  Landed as `src/lib/shared/transitions/results-morph.ts`:
  `startMorph(mutate)` (unconditional primitive — `flushSync` inside
  `document.startViewTransition`, no-ops on missing API / reduced motion /
  a transition already in flight) and `withResultsMorph(mutate)` (the same,
  gated on a live results grid). `setResultsMorphActive(owner, active)` is the
  claim: `GalleryDrill` sets it from `splitPane` and releases it on destroy, so
  shared components (`BrowseToolbar`, `BrowsePanel`) can route their mutations
  through the seam and stay byte-for-byte inert on every other host.

- [x] **Step 7.3 — verify each path animates.** For every path in the 7.1
  inventory, capture evidence the transition actually ran (`transition.ready`
  / `finished` timings plus a non-zero animation count, the way the Task 6
  diagnosis did). A path that silently no-ops is exactly the bug this task
  exists to prevent. Report the results as a table.

  Measured live at 1920×1080 (×1.1 emulation) on `https://localhost:5173/browse`
  by wrapping `document.startViewTransition` and counting
  `document.getAnimations()` entries whose `pseudoElement` starts with
  `::view-transition-group(` at `transition.ready`. Every group animation
  carried `duration: 250ms`.

  | Path | ready | finished | groups (sequence / category) | card fades |
  |---|---|---|---|---|
  | Value tap — Grid mode Diamond (1412→1389) | 202 ms | 485 ms | 31 (19 / 11) | — |
  | Value tap — Level (1412→515) | 152 ms | 456 ms | 13 (1 / 11) | 25 |
  | Value tap — LOOPs stack (54→31) | 222 ms | 524 ms | 22 (10 / 11) | 49 |
  | Connective → Match all | 186 ms | 455 ms | 28 (16 / 11) | 64 |
  | Connective → Match any | 239 ms | 521 ms | 28 (16 / 11) | 64 |
  | Rule chip × (results header) | 150 ms | 427 ms | 18 (6 / 11) | 24 |
  | Toolbar search apply (54→7) | 174 ms | 453 ms | 16 (4 / 11) | 19 |
  | Toolbar search clear (7→54) | 220 ms | 497 ms | 16 (4 / 11) | 19 |
  | Toolbar sort change | 105 ms | 401 ms | 14 (2 / 11) | 26 |
  | Collection filter toggle (1412→6) | 173 ms | 536 ms | 12 (0 / 11) | 24 |
  | Empty-state "Clear all filters" | 147 ms | 410 ms | 12 (0 / 11) | 0 |
  | "Show all" (landing → pane) | 134 ms | 178 ms* | 12 (0 / 11) | 6 |
  | Landing tile → workspace (pre-existing control) | 106 ms | 403 ms | 12 (0 / 11) | 16 |
  | Category switch (control — must NOT morph) | — | — | none | — |

  Zero paths silently no-op. `seqGroups` counts cards that persist across the
  change (they slide); `card fades` counts cards that only exist on one side
  (they fade). Both are non-zero on every path that changes the card set.

  \* Measurement hazard, recorded honestly: a parallel session was editing
  `src/lib/shared/animation-engine/*` in this shared checkout throughout the
  run, and each Vite HMR reload that lands mid-transition ends it early —
  that regime shows up as `finished ≈ ready + 15 ms` with the animations
  cancelled at `currentTime: 0`. Samples taken between reloads (the table
  above) show the full 250 ms group animation. The "Show all" row is one of
  the short ones and was not re-sampled clean.

- [x] **Step 7.4 — guard the feel.** Austen likes the current character
  (cards fade out, the rest slide in to fill). Keep it: same duration and
  easing on every path. Do not let a slow engine recompute stretch the morph
  into a freeze — if a path's recompute is long enough to feel stuck, report
  the measured number instead of shipping it.

  Character is identical on every path by construction: one helper, no
  per-path CSS, so every card group uses the browser default 250 ms /
  ease. The recompute (the frozen part) is 130–265 ms on every path measured
  warm — the same beat the value tap already shipped with and Austen approved.
  One outlier worth naming: the FIRST search of a session measured
  ready 1411 ms / finished 3738 ms while the search index built cold;
  subsequent searches measured 174 ms. That cost is the engine's, not the
  morph's — the same synchronous work blocks the thread with or without a
  transition; the transition only decides whether the frozen frame is the old
  grid or a half-painted one.

### 7B — Readability defects from the review sweep

- [x] **Step 7.5 — truncated category labels.** Measured via
  `scrollWidth > clientWidth`: at 1920, "Recently added", "Timing & Direction"
  and "Max turn intensity" are ellipsised; at 3840 it is six labels
  ("Starting letter", "Start position", "Recently added", "Timing & Direction",
  "Max turn intensity", "Collections"). Austen's punch list said "make sure
  things are readable" — an ellipsised category name fails that. All eleven
  labels must render in full at every tier. Options: fewer catalog columns, a
  wider left column, tighter tile padding, or a shorter label where the domain
  allows. NOT a smaller font.

  Fixed by letting the label WRAP instead of ellipsing (`white-space: normal`
  + `overflow-wrap: break-word` on `.mini-tile.catalog .mini-title`), plus
  tightening the ≥2600 tier's art (3.1rem → 2.6rem) and side padding
  (1.05rem → 0.8rem) because that tier had the NARROWEST title box of all —
  95px against 1920's 100px — which broke "Collections" mid-word.
  Two lines fit inside the existing 3.4/4/5.25rem `min-height`, so the tile
  box is unchanged (measured 64px before and after at 1920).

  | Viewport | pane | columns | title box | ellipsised before | ellipsised after | mid-word breaks after |
  |---|---|---|---|---|---|---|
  | 1620 (Austen's DevTools-docked 1547px drill) | 440px | 2 | 100px | — | 0 | 0 |
  | 1920 | 440px | 2 | 100px | 3 (Recently added 110>100, Timing & Direction 137>100, Max turn intensity 132>100) | **0** | 0 |
  | 2560 | 736px | 3 | 126px | — | **0** | 0 |
  | 3840 | 736px | 3 | 95px → **117px** | 6 | **0** | 0 (longest word "Collections" 99px < 117px) |

- [x] **Step 7.6 — record, do not fix: the app does not scale at 4K@100%.**
  Measured: at a 3840 viewport `document.documentElement`'s computed font-size
  is still **16px**, because the lockstep root ramp in `src/app.css` is scoped
  to `html:has(.mkt-shell)` / `html:has(.legal-container)`. The whole app
  renders at 1080p proportions on a 4K monitor at 100% scaling — the exact
  failure `.claude/rules/4k-native-layout.md` exists to prevent. Blast radius
  is every app surface (create, browse, learn, museum, practice), so it needs
  its own spec and sweep. Leave it; report it as the recommended next project.

  Re-confirmed this session, unchanged: at a 3840 viewport,
  `getComputedStyle(document.documentElement).fontSize` is **`16px`**. Left as
  found — this is the recommended next project.

- [x] **Step 7.7 — verify + commit.** `npm run check`: 0 errors, 0 warnings.
  `npx vitest run tests/unit/browse/`: baseline failures only. Screenshot
  sweep at 1550 / 1920 / 2560 / 3840 confirming labels are whole and the
  morph paths behave. Explicit pathspecs. Do NOT push.

---

## Task 8: The filter motion system (2026-08-05)

Austen, after Task 7: *"the morph is not working as intended — when I click
Level 2 having Level 3 selected, the other cards just pop into existence
instead of showing me any sort of indication of what is happening. Let us do
another pass for solid transitions. I want the most modern, best possible,
most informative, most useful, most gorgeous animations you can bring to the
table."*

He is right, and Task 7 mis-measured its own success: it proved animations
RAN, not that they COMMUNICATED. A default 250 ms opacity fade is an
animation and reads as a pop.

### Root cause (diagnosed from the screenshots + the Task 7 closeout)

Adding Level 2 to a Level 3 rule took the grid from 11 matches in sections
`B 4 / F 16 / H 16` to 39 matches in sections `A 8 / B 4 / B 12`. Four
separate failures stack up:

1. **Only cards are named.** Section headers, section wrappers, and the grid
   container carry no `view-transition-name`, so they belong to the `root`
   snapshot — whose animation the app disables globally
   (`src/lib/shared/transitions/view-transitions.css` :26–29). Every piece of
   structure therefore SNAPS while the cards animate. When the section set
   changes (as it does on almost every filter change) that snap is most of
   what the eye sees.
2. **Entering cards get the UA default fade only.** No scale, no offset, no
   designed curve. Task 7 closeout, Step 7.4: *"every card group uses the
   browser default 250 ms / ease."*
3. **No stagger.** Every entering card fades at the same instant, so there is
   no sense of the grid filling in — the defining quality of the motion
   Austen liked.
4. **No sequencing.** Exits, moves, and enters all run simultaneously over
   the same 250 ms, so no phase reads as distinct and nothing tells the story
   "these left, these stayed, these arrived."

### The design

Build one **filter motion system** for the results grid, in
`src/lib/shared/transitions/` beside `results-morph.ts`, expressed with the
current view-transitions feature set (all supported by the app's Chrome
target; degrade cleanly elsewhere):

- **`view-transition-class`** (Chromium 125+/137+, Safari 18.4+) — one class
  on every card, styled once via `::view-transition-group(*.seq-card)`,
  `::view-transition-old(*.seq-card)`, `::view-transition-new(*.seq-card)`.
  This is what makes a designed animation possible across N cards without
  per-id CSS. Same treatment for a `seq-section` class on section headers.
- **Name the structure.** Give section headers (and any wrapper whose motion
  the eye needs) their own names/classes so they move and fade instead of
  snapping. This is failure 1 and it is the biggest single win.
- **`view-transition-name: match-element`** (Chrome 137+) is available if it
  simplifies naming for cards; the existing `sequence-<id>` naming plus the
  claim registry also works. Executor picks, with a one-line reason.

**Three phases, deliberately sequenced** — this is what makes it informative
rather than merely pretty:

| Phase | What | Timing (starting point, tune by eye) |
|---|---|---|
| Exit | Cards leaving: fade out + settle back slightly (scale ~0.96). Fast — the eye does not need to study what is going away. | ~160–200 ms, no stagger (or a short reverse stagger) |
| Move | Cards that persist: FLIP to their new slots. This is the motion Austen already praised — preserve its character. | ~300–340 ms, overlapping the exit |
| Enter | Cards arriving: fade in + scale up from ~0.92, **staggered in reading order** so the grid fills in rather than blinking on. | ~240–280 ms each, stagger ~15–25 ms, total added stagger capped ~300 ms; begins ~80–120 ms after the exit starts |

The overlap matters: space clears, survivors travel, newcomers land. Do not
run all three in one undifferentiated 250 ms window.

**Stagger technique.** Custom properties do not reach view-transition
pseudo-elements, so `--index` on the element will not work. Two viable
routes, in order of preference:
1. `sibling-index()` inside `::view-transition-group(*.seq-card)`
   (Chrome 137+). The `::view-transition` pseudo tree makes the groups
   siblings, so this may resolve — **measure whether it actually does before
   building on it.**
2. WAAPI on the pseudo-elements after `transition.ready`:
   `document.documentElement.animate(frames, { pseudoElement:
   "::view-transition-new(<name>)", delay: i * 20 })`. This definitely works
   and is the fallback if (1) does not resolve.

Report which route you used and the evidence that decided it.

### Steps

- [x] **Step 8.1 — reproduce and characterise the defect.** Drive Austen's
  exact case (Level 3 active, add Level 2) and capture what each element
  class does: which elements have names, which animate, which snap. A
  frame-by-frame capture (screenshot at ~60 ms intervals through the
  transition, or a WAAPI dump of every running animation with its target
  pseudo) is the evidence. Confirm or correct the four failures above before
  building.
- [x] **Step 8.2 — name the structure.** Section headers and any snapping
  wrapper get names/classes. Re-run 8.1's capture and show the snap is gone.
- [x] **Step 8.3 — build the motion system.** The three phases above, driven
  by `view-transition-class`, in one module beside `results-morph.ts` so
  every path that already routes through `withResultsMorph` inherits it.
  Tokens (durations/easings) come from the design system where they exist.
- [x] **Step 8.4 — stagger.** Per the technique note above; measure route 1
  before committing to it.
- [x] **Step 8.5 — tune by eye, not by number.** Capture the transition as a
  frame series at 1920 and read it: can you SEE what left, what stayed, what
  arrived? If a phase is invisible or the whole thing feels mushy, change the
  timing and look again. Iterate until the frames tell the story. This step
  is the deliverable — not the code.
- [x] **Step 8.6 — the degradation paths.** `prefers-reduced-motion` gets no
  motion (an instant, correct grid). Browsers without view transitions get
  today's plain update. Below the seam nothing changes. Verify each.
- [x] **Step 8.7 — guard the other surfaces.** The card class and any CSS
  added must not leak onto the grid tab, the sheets, the builder, or the
  shop/route morphs that already use view transitions
  (`view-transitions.css` has live `shop-*`, `module-content`, `tab-content`
  names — do not disturb them). Grep-prove the scoping.
- [x] **Step 8.8 — verify + commit.** `npm run check`: 0 errors, 0 warnings.
  `npx vitest run tests/unit/browse/`: baseline failures only. Frame series
  for the Level 3 → +Level 2 case plus two other paths (a rule removal and a
  search). Explicit pathspecs. Do NOT push.

## Task 8 closeout (2026-08-05)

**Tooling.** chrome-devtools MCP was still gone, so verification ran over raw
CDP against the shared debug Chrome (151) on :9222 — `Emulation.setDeviceMetrics
Override`, `Runtime.evaluate`, `Page.captureScreenshot`. The harness that did
the real work is a **filmstrip**: wrap `document.startViewTransition`, pause
every `::view-transition*` animation at `ready`, then step `currentTime` and
screenshot. That yields TRUE frames at exact instants — a plain screenshot burst
cannot, because `Page.captureScreenshot` costs longer than the transition.
Scripts stayed in the scratchpad.

### 8.1 diagnosis — all four failures confirmed, plus two the plan did not have

Measured on Austen's case (Level 3 active, add Level 2), 1920×1080:

| Element | `view-transition-name` before | Verdict |
|---|---|---|
| `.thumbnail-container` (cards) | `sequence-<id>` | animated |
| `.header-wrap` (section headers) | **`none`** | SNAPPED |
| `.level-banner` | **`none`** | SNAPPED |
| `.sectioned-virtual`, `.v-item`, `.grid-area` | **`none`** | SNAPPED |

Every card animation was `props: ["opacity"]`, `dur: 250`, `easing: "linear"`,
`delay: 0` — 8 old + 11 new, all in one undifferentiated window. So failures
1 (only cards named), 2 (UA fade, no scale/offset/curve), 3 (no stagger) and
4 (no sequencing) are all confirmed exactly as written.

Two more the frames exposed:

5. **Section names must key on `section.id`, not `section.title`.** Titles embed
   the count (`"A (4 STEPS) (1 SEQUENCES)"`), so a section that merely GAINS
   sequences would have exited and a stranger entered in its place. With the id,
   the same case now measures section `persist: 4` against `exit: 1 / enter: 1`.
6. **`--ease-out` is the wrong token for an enter here.** It is
   `cubic-bezier(0.16, 1, 0.3, 1)` (expo-out); the frame at t=180 showed an
   arriving card already ~85% opaque — it read as having always been there,
   which is the very defect being fixed. Same problem mirrored on `--ease-in`
   (expo-in) for exits: a card would sit solid then vanish in the last 50ms.
   Both moved to `--ease-in-out` / `--ease-smooth`.

**Not a defect (worth recording).** Freshly-filtered cards can snapshot as blank
placeholders with a render progress ring. `::view-transition-new` is **live
content**, not a frozen image — proven by pausing a transition at
`currentTime: 200` and re-shooting the same instant 4s later: the blank cards
were fully drawn. So the incoming thumbnails catch up INSIDE the transition, and
a longer sequenced motion is safe. The blank window is the pictograph render
pipeline's, not the motion system's.

### Stagger route — route 1 measured dead

`sibling-index()` inside `::view-transition-group(*.seq-card)`: `CSS.supports`
returns true for `animation-delay: calc(sibling-index() * 20ms)`, the
declaration parses, and the animation is created — but **every group resolved it
to 1**. Eleven entering cards all reported `effect.getTiming().delay === 20`. The
::view-transition pseudo tree does not expose sibling positions. Route 2 (WAAPI
on the pseudo after `ready`) shipped; measured delays step cleanly
110 / 132 / 154 / 176 / 198 / 220…

### What shipped

- `src/lib/shared/transitions/results-motion.css` — the three phases, driven by
  `view-transition-class` (`seq-card`, `seq-section`), assigned in CSS under
  `.pane-results-body` so the class and the rules that style it cannot drift.
  `:only-child` on the old/new pseudos is what separates leaving/arriving from
  persisting, so the exit never fights the move.
- `src/lib/shared/transitions/results-motion.ts` — the WAAPI stagger. Captures
  the pane's card names before the mutation (the only way to tell an arrival from
  a survivor) and re-drives the enter in reading order after `ready`.
- `results-morph.ts` — two lines, so **every** path already routed through
  `withResultsMorph` inherits the motion. No new call sites.
- `SectionedVirtualGrid.svelte` — headers and level banners named
  (`bsec-<gid>-<sectionId>` / `blvl-<gid>-<level>`), only when the grid is inside
  `.pane-results-body`. A per-instance `gridId` guarantees document-wide
  uniqueness without a claim registry.
- `+layout.svelte` — one CSS import.

**Final timings** (all from design-system tokens):

| Phase | Duration | Delay | Easing |
|---|---|---|---|
| Exit (card / section) | 180 / 160ms | 0 | `--ease-smooth` |
| Move (group + persisting pair) | 320 / 300ms | 0 | `--ease-in-out` |
| Enter (card / section) | 260 / 240ms | 110 / 100ms | `--ease-in-out` |
| Enter stagger | — | +22ms per card, capped +220ms | — |

Last arrival finishes at 110 + 220 + 260 = 590ms. The cap was 300ms first; the
frame series at 2560 on a 22-card arrival showed the tail still materialising at
t=330 when the rest had settled, and it read as lag rather than motion.

### 8.5 — what the frame series showed, iteration by iteration

1. **v1 (exit/move/enter in, `--ease-out`/`--ease-in`).** t=90 read correctly
   (old fading, survivors sliding, nothing arrived yet) but t=180 showed
   arrivals already near-solid. Diagnosed as the expo curves. Also caught the
   section-title/count bug here.
2. **v2 (curves swapped, id-keyed sections).** t=90: the leaving card at ~35%
   with the survivor already moved right — space clearing, survivor travelling,
   nothing arrived. t=180: arrivals at 15–50% in reading order beside solid
   survivors. t=280+: settled. The three phases are individually legible.
3. **Best demonstrator** is the search-clear case (13 → 1413): at t=180, AABB /
   A·B / ABC have landed while AB / AKEJ / AKE / ALIΨ-IΦ are still materialising
   at descending opacity down the reading order. You can see the grid fill in.

**Honest caveat.** Austen's *exact* case is a weak demonstrator at the default
scroll position: with sections alphabetical, the top of the viewport holds the
same "A 4 steps" cards before and after, and the 8 arriving cards measured for
that change are mostly below the fold. The motion is running and correct there —
`section exit 2 / enter 3 / persist 2`, `card exit 2 / enter 8 / persist 3`, 5
staggered — but the top-of-pane frames barely differ. What he saw pop was
further down the pane or from a different scroll position.

### Per-path evidence (1920×1080, paused-filmstrip accounting)

| Case | Result change | sections exit/enter/persist | cards exit/enter/persist | staggered |
|---|---|---|---|---|
| A — Level 3 → +Level 2 (Austen's) | 700 → 1216 | 2 / 3 / 2 | 2 / 8 / 3 | 5 (110–198ms) |
| B — rule chip × | 1216 → 516 | 2 / 3 / 7 | 2 / 2 / 8 | 2 (110–132ms) |
| C — search clear | 13 → 1413 | 3 / 4 / 11 | 2 / 21 / 12 | 13 (110–330ms) |
| 2560, remove level rule | 515 → 1412 | 1 / 1 / 4 | 2 / 22 / 5 | 14 |
| 3840, add Level 3 | — | — | 0 / 7 / 0 | 7 (110–242ms) |

### 8.6 degradation — verified live

| Path | Evidence |
|---|---|
| `prefers-reduced-motion: reduce` | `startViewTransition` call count **0**; grid still updated (header went to "515 matches") |
| View Transitions API absent | cards 7 → 19, header updated, no error |
| Below the seam (900px) | no `.pane-results-body`; `isResultsMorphActive()` → `false` |

### 8.7 scoping — grep-proven

`seq-card` / `seq-section` appear ONLY in `results-motion.css` (plus one comment
in `results-motion.ts`). Every rule descends from `.pane-results-body`, which is
declared in exactly one place (`GalleryDrill.svelte:565`). `view-transitions.css`
was not touched, so the live `shop-*`, `module-content`, `tab-content`,
`launchpad-*` and `sequence-<id>` route morphs are byte-for-byte unchanged. The
grid tab, both sheets and the collection builder never carry the class.

### Deviations

1. **`--ease-out` / `--ease-in` rejected for enter/exit** despite their token
   labels — see failure 6 above. `--ease-in-out` and `--ease-smooth` shipped.
2. **Stagger cap 300 → 220ms**, tuned by eye against frames, not by the plan's
   starting number.
3. **`view-transition-name: match-element` not used.** It keys identity to the
   ELEMENT, and the virtualizer recycles `.v-item` nodes by index, so a header at
   index 3 that becomes a different section would have falsely "persisted".
   Explicit `sequence-<id>` / `bsec-<gid>-<sectionId>` names key on the DATA,
   which is what the morph should follow.
4. **`namesStructure` decided by `listEl.closest(".pane-results-body")`** rather
   than a prop plumbed BrowsePanel → BrowseGrid → SectionedVirtualGrid. Same
   ancestor the CSS uses, so the name and the class cannot end up scoped
   differently — which is the failure mode a prop would have allowed.
5. **The results header (rule strip + match count) was left unnamed** and still
   snaps to the new state at t=0. That is immediate confirmation of the tap and
   reads as feedback rather than as a defect; naming it would crossfade the match
   count into mush. Named as a deliberate choice, not an oversight.

### Known, not fixed

- **Cold thumbnails render blank for a few hundred ms** after arriving. Live
  content, so it resolves inside the transition, but on a cold cache the first
  ~200ms of a card's enter animates a placeholder. That is `cellPreWarmer` /
  the pictograph render pipeline's territory, not the motion system's.
- **11 category tiles crossfade on every filter tap.** `gallery-cat-*` names
  persist across the mutation and get the UA 250ms pair fade even though the
  tiles do not change (only their count dots do). Harmless and arguably correct;
  22 animations of noise per tap if it ever needs trimming.
- Sparse results at 2560/3840 and the app-wide 4K@100% scaling gap are both
  unchanged from the Task 6/7 closeouts.

### Task 8 regression: a taller row can keep a shorter row's offset (2026-08-05)

Austen captured a persistent overlap after filtering: the `C` section header
started inside the preceding 16-step `A` card. Refreshing repaired it.

The motion exposed a stale virtualizer cache rather than a stacking-context
problem. The failure had two stages:

1. `SectionedVirtualGrid` positions every item absolutely from TanStack's
   measured `VirtualItem.start`.
2. Row height depends on step count. At the same card width, the current layout
   calculation makes a 16-step card about 57.5% taller than an 8-step card.
3. Numeric item keys and a count-only recreation signature could carry a short
   row's cached size into a different result stream.
4. The transition's synchronous stabilization produced correct offsets, but
   the list `ResizeObserver` ran one frame later and called TanStack's
   `measure()`. That cleared the real heights and left the grid at estimates
   without measuring the still-mounted nodes again. Live instrumentation caught
   the A row moving from the correct `translateY(30px)` / 389px reservation back
   to the stale 257px reservation after the transition callback returned.

Implemented safeguards:

- [x] Give TanStack each flattened item's stable data key through `getItemKey`.
- [x] Build a measurement signature from item order, row maximum step count,
  column count, and start-position layout.
- [x] Stabilize mounted virtual rows inside the View Transition update callback,
  before Chrome captures the new frame.
- [x] Pair every width-driven `measure()` reset with a mounted-node remeasurement
  on the next frame, so the resize observer cannot strand estimate-only offsets.
- [x] Add focused regression coverage for equal-count short-to-tall replacement,
  persistent mixed-height rows, layout changes, data keys, and transition
  stabilization ordering. Result: 6/6.
- [x] Reproduce Austen's exact `12 step sequence or C2C - Down the Road` filter
  path interactively. C2C off/on measured zero overlaps at 1.2s and again at
  3.5s; 1920, 2560, and 3840 split-pane captures stayed clear. The 1440,
  820x1180, 960x412, and 375x667 step-through layouts had zero horizontal
  overflow.

---

## Task 9: The left column earns its height (2026-08-05)

Austen, reviewing the workspace:

> When we're in the picker category above to narrow it down, after clicking
> Show all sequences it's not necessarily ideal to show them stacked
> vertically like this — it makes it so the text and the icon that indicates
> what we're talking about, such as the pictographs for start position and
> grid position, are forced to be very small, because their container is not
> very tall.
>
> Every single individual selection once you get to the screen where you have
> actually opened one of the options could be sensitive to the total height
> available. Go to Grid mode — look at all that empty vertical space. Go to
> Start position — all the pictographs are very small, and yet all that empty
> space is also present. Timing & Direction, same thing. We could have used
> all that space to make the buttons up above bigger, and the icons for start
> position and grid mode and length displayed larger. So maybe it should morph
> up and down — the height allocation for the bottom "pick a family" and the
> top "pick" ought to be the same.

### The two defects

**9A — the catalog degenerates into a vertical stack when it owns the column.**
With no category open (the "Show all" / no-selection state) the catalog becomes
eleven full-width rows. Each row is wide and short, so the art and label are
pinned small while the column has abundant height. A wide-and-short row is the
worst shape for a tile whose job is to show a pictograph.

**9B — nothing consumes the leftover height.** Both zones size to their content
and top-align, so leftover space collects at the bottom as dead air:
- Grid mode (2 options): two small cards, then a large empty region.
- Start position (3 options): three small pictographs, same empty region.
- Timing & Direction (6 options): six cards, same.

The value cards should GROW into the available height (bounded), and when the
editor genuinely needs less, the catalog should take the surplus and render
bigger tiles. The allocation is dynamic, not a fixed split.

### The model to build

Treat the left column as a height budget shared by two zones, resolved per
screen rather than fixed:

1. **The column is a flex/grid in the block axis with a known height** (it
   already is — the pane's height). Both zones participate; neither is
   `height: auto` with the remainder stranded.
2. **The value editor's grid fills its zone**: `grid-auto-rows: 1fr` (or an
   explicit `minmax`) so R rows divide the zone's height, plus a per-card
   `max-height` so 2 options do not become absurd slabs. Art inside the card
   scales with the card (the pictograph/peek box is a prop in several of these
   — thread the computed size through rather than leaving it at a constant).
3. **Surplus flows to the catalog.** When the editor hits its per-card
   max-height and still has room left over, the catalog takes the remainder and
   its tiles grow — taller tiles, larger art, the labels Austen wants readable.
   That is the "morph up and down" he described.
4. **The catalog never degenerates to one column.** In the no-category state it
   keeps a multi-column grid (2–3 by tier per `4k-native-layout.md`, and never a
   row of one) with tiles that are TALLER, not wider. Consider promoting the
   tile to a portrait composition (art above label) when it owns real height,
   since that is the shape that lets a pictograph read.

### Steps

- [x] **Step 9.1 — measure the current waste.** For each of the eleven value
  screens at 1920 and 2560: the editor zone's height, the height its content
  actually occupies, and the leftover. Same for the no-category catalog state.
  Put the table in this plan. This is the before-evidence and it also tells you
  which screens are the binding constraints.
- [x] **Step 9.2 — fix 9A.** Multi-column, taller tiles when the catalog owns
  the column. Verify the art and every label read at 1920/2560/3840 and that no
  label re-truncates (Task 7.5 fixed truncation — do not regress it).
- [x] **Step 9.3 — fix 9B.** The shared height budget above. Every value screen
  consumes its zone; cards grow to a bounded max; art scales with the card.
- [x] **Step 9.4 — the bound matters.** A 2-option screen must not produce
  comic slabs. Pick a per-card max that keeps proportions sane and SAY what it
  is. If a screen cannot fill its zone without looking silly, the surplus goes
  to the catalog (rule 3) rather than into the cards.
- [x] **Step 9.5 — verify.** Screenshot every one of the eleven value screens
  plus the no-category state at 1920, 2560, and 3840 (×1.1 emulation), and read
  each frame: is there still dead air? is any card a slab? is any art still
  small next to empty space? Re-measure the 9.1 table as after-evidence.
- [x] **Step 9.6 — below the seam is untouched.** The step-through flow at
  narrow widths keeps today's behavior. Verify at 960×412 and 375×667.
- [x] **Step 9.7 — verify + commit.** `npm run check`: 0 errors, 0 warnings.
  `npx vitest run tests/unit/browse/`: baseline failures only (2 protobufjs
  suites). The GalleryDrill line cap in the split-contract test is a REAL
  constraint — do not raise it to make a change fit; put the code where it
  belongs or tighten it. Explicit pathspecs. Do NOT push.

### Note on browser tooling

The chrome-devtools MCP is disconnected. Drive Chrome over CDP on port 9222
(`scripts/launch-chrome-debug.ps1` starts/reuses the shared browser); a Node
script using the built-in WebSocket with `Emulation.setDeviceMetricsOverride`,
`Runtime.evaluate`, and `Page.captureScreenshot` works and has been used
repeatedly this session. Scratchpad only, never the repo.

## Task 9 closeout (2026-08-05)

**Tooling.** chrome-devtools MCP was still disconnected, so everything below was
driven over raw CDP against the shared debug Chrome on :9222
(`Emulation.setDeviceMetricsOverride` at `<w×1.1>×<h×1.1>` dpr 1.1,
`Runtime.evaluate`, `Page.captureScreenshot` webp/70). Scripts stayed in the
scratchpad. Two runs had to be discarded and re-sampled: a Vite HMR reload that
lands mid-walk drops the pane out of split mode and the numbers go nonsense
(`splitPane: false`, or a screen reporting the whole column as its need). Every
number below is from a clean run.

### 9.1 — the waste, before and after

`zone` = the editor stage's height. `ink` = the union of what actually paints
inside it (header + every card + the turn picker's two visible parts).
`dead` = zone − ink; negative means the screen overflows and scrolls.
Measured on `https://localhost:5173/browse`, one walk per viewport through
every category tile.

| Screen | 1920 dead before | 1920 after | 2560 dead before | 2560 after |
|---|---|---|---|---|
| Level | 23 | 29 | **582** | **73** |
| Length | 182 | **31** | **730** | **89** |
| Starting letter | 29 | 17 | 382 | **29** |
| Start position | 23 | 13 | **582** | **73** |
| Grid mode | **230** | **36** | **582** | **73** |
| LOOPs | −151 | −93 | 78 | 29 |
| Creator | −193 | −135 | 78 | 29 |
| Timing & Direction | 48 | 29 | **542** | **68** |
| Max turn intensity | **216** | **68** | 446 | **144** |
| Collections | −910 | −852 | 29 | 29 |

The other half of the same table — where the reclaimed height went:

| | 1920 catalog height | 1920 tile | 2560 catalog height | 2560 tile |
|---|---|---|---|---|
| Before (identical on every screen) | 441 | 64 | 310 | 64 |
| After (varies BY screen — that is the point) | 384–760 | 64–117 | 497–1013 | 111–240 |

Ten value screens, not eleven: **"Recently added" has no value editor** — it is
an instant-apply category (`gallery-drill-catalog.svelte.ts:624`, an `apply`
entry with no `section`). The eleventh state is the no-category catalog.

### 9.2 — the catalog (9A)

Before, from the CSS: `.catalog-layout.fill .desktop-filter-grid` was
`grid-template-columns: minmax(0, 1fr)` — one column, eleven full-width rows.
After: it keeps the same 2-column (base) / 3-column (≥620px column) grid as the
normal catalog, the rows grow into the column, and the eleventh tile spans the
row so 11-into-2 does not strand an orphan.

The tile now decides its own composition, because after this task its height is
a share of a budget it does not control. `CategoryRail` wraps every tile in a
`.cat-cell` **size container**; `CategoryTile` queries it:

| Cell height | Composition |
|---|---|
| < 6.25rem | row (art left, label right), art `min(70%, 3.25rem)` — grows with the row |
| ≥ 6.25rem | portrait: art on top at `min(42%, 6rem)`, label centred under it, count dot to the corner |
| ≥ 12rem | art `min(50%, 8rem)`, icon glyphs 2.6rem |
| ≥ 16rem | art `min(56%, 12rem)`, icon glyphs 3.6rem, title 1.2rem |

Measured: no-category at 1920 is 2 × 6 tiles of 204×158 with 59px of art (was
11 full-width rows); at 2560 it is 3 × 4 tiles of 231×327 with 165px of art.
`.mini-art.plate img` also carried 32px width/height ATTRIBUTES, so a bigger
plate used to mean a bigger white square around the same tiny glyph — now
`width/height: 100%; object-fit: contain`.

Label truncation (Task 7.5) is not regressed: `scrollWidth > clientWidth` is
false for all 11 labels at 1920, 2560 and 3840, in every screen state.

### 9.3 / 9.4 — the budget and the ceilings (9B)

`src/lib/features/browse/gallery-home/pane-height-budget.ts` — an action on the
column. It measures the active screen's blocks (`max(rect, scrollHeight)` per
block, plus the screen's gaps and padding) and publishes `--editor-need`.
`GalleryPaneLeft` consumes it:

- editor: `flex: 1 1 var(--editor-need, 100%)`
- catalog: `flex: 8 0 auto; max-height: <rows × tile ceiling>`

So the editor takes what its cards need at their ceiling, the catalog takes the
surplus 8:1 until its own ceiling, and only then does anything land back in the
editor. `scrollHeight`, not the rendered box, is what keeps the measurement
non-circular: a list too tall for the column shrinks its box and overflows, and
the budget has to see the height it wanted rather than the squeeze it got.

**The per-card ceilings** (`--pane-row-max`, GalleryWorkspace) were already the
mechanism from Task 6.2 — this task tuned them and gave the surplus somewhere
to go. Narrow column / wide column (≥640px) / tall viewport (≥1600px):

| Screen | ~440px column | ≥640px column | ≥1600px tall |
|---|---|---|---|
| Level, Start position, Grid mode | 18rem | 26rem | 22 / 30rem |
| Length, Max turn intensity | 10rem | 14rem | 11 / 18rem |
| T&D, LOOPs, Collections, Creator | 8.5rem | 14rem | 11 / 18rem |
| Starting letter | 4.5rem | 6rem | 5.5 / 7rem |

**Why those numbers.** The binding case is Grid mode: 2 options. At 1920 its
cards are 202px wide, so 18rem (288px) is 1.43:1 — the tallest a 2-up card can
go before it reads as a slab rather than a card. At 2560 the same cards are
351px wide and 26rem (416px) is 1.19:1. The rule of thumb everywhere was **stay
under ~1.5:1 on the card's own width**, and hand anything left over to the
catalog rather than stretching past it. Start position at 2560 proves it:
232×416 with a 192px pictograph, where it was 76px inside the same box.

Art now scales with the card instead of with the tier: `.value-pictograph`
`min(52%, 12rem)`, `.value-grid-preview` `min(56%, 15rem)`, family/collection
icons `min(44%, 7rem)`; the level `SequencePeek` steps to 150×140 and creator
avatars to 72px once the column is ≥620px. `.value-main { flex: 1 }` is also
overridden to `0 1 auto` inside the pane — it is a ROW rule, and in a portrait
card it stranded the count at the far bottom with a hole above it.

### 9.5 — what the frames showed

Read at 1920, 2560 and 3840 for all ten value screens plus the no-category
state (webp/70, scratchpad):

- **Fixed.** Grid mode, Start position, Level, Timing & Direction and Length at
  2560 no longer dead-end a third of the way down the column; the catalog above
  them carries the reclaimed height as portrait tiles with legible art. Start
  position's pictographs went 76 → 192px, Grid mode's previews 144 → 220px.
- **No slabs.** No card exceeds ~1.5:1 on its own width at any viewport; the two
  Grid mode cards are the worst case and they still read as cards.
- **Still imperfect, named honestly:**
  - **Max turn intensity** keeps 68px (1920) / 144px (2560) / 544px (3840) of
    air. It is a single slider; past a point more height only adds padding, and
    the catalog is already at its ceiling. Filling it would mean a comic-sized
    slider or comic-sized tiles.
  - **3840 (4K @ 100%)** leaves ~215px under the value cards on the 3-option
    screens. The column there is 736 × 2126 — no arrangement of 11 tiles and 3
    cards fills it without one of them becoming a slab, and the app-wide root
    ramp that would fix those proportions is Task 7.6's open item, not this one.
  - **Collections / Creator / LOOPs at 1920** still scroll (−852 / −135 / −93).
    They have more content than the column has height; the budget gives them
    everything the catalog can spare and they scroll as before.
  - **The dense Length chip grid** (15+ values) is a flex-wrap with its own
    fixed chip size, so it does not participate in the row ceiling — its surplus
    all goes to the catalog. It reads fine, but the chips could be bigger if
    someone wants that later.
- A residual "dead" of 29px on a satisfied screen is the screen's own
  `padding-top` plus sub-pixel rounding, not a hole.

### 9.6 — below the seam

Unchanged, verified with a cleared session at 960×412, 375×667 and 820×1180:
no `.pane-left`, no catalog, the step-through chooser and value screens render
exactly as before (960×412 Grid mode: two cards, no scroll; 375×667 chooser:
hero doors + "Show all 1413 sequences" + the tile grid). Every rule this task
added is scoped to `.drill-ctx.split-pane`, `.pane-left`, `.mini-tile.catalog`
or the `cat-cell` container, none of which exist below the seam.

### 9.7 — verification

- `npm run check`: **0 errors, 0 warnings**.
- `npx vitest run tests/unit/browse/`: 83 passed, 2 suites failed — the two
  pre-existing protobufjs import failures, the documented baseline.
- `gallery-drill-split-contract.test.ts`: 5/5 pass. **The line cap was NOT
  raised.** GalleryDrill went 898 → 855 lines because the left column moved out
  into `GalleryPaneLeft.svelte`, which is where the budget belongs anyway.

### Deviations

1. **A new component, `GalleryPaneLeft.svelte`.** The plan implied editing the
   column in place, but GalleryDrill sat at 898 of its 900-line cap and the
   budget needs markup, CSS and an action. Extracting the column both respects
   the cap and puts the two zones and the flex that divides them in one file.
2. **The tall/portrait tile is a container query, not a prop.** A prop would
   have to guess from the tier; after this task the tile's height depends on
   which value screen is open, so only the resolved cell knows. `.cat-cell`
   with `container-type: size` is the seam.
3. **Ten value screens, not eleven** — see 9.1.

---

## Task 10: Finish the height pass — Collections and LOOPs (2026-08-05)

Austen on Task 9: *"They did a really really good job aside from the
collections, which apparently didn't quite work as well as they intended —
notice how the icon is spilling out of its container. Let's tell them to finish
up the job."* Then, separately: *"Sometimes you can go to LOOPs and it's all
spelling out an incorrect way like this, as a result of whatever was selected
before you applied the transition to LOOPs. This is not ideal."*

### 10A — Collections cards overflow their box

Screen: `section === "collection"` in `GalleryWorkspace.svelte` (~:680), rows are
`.length-row.tall.monument.tinted.collection-row` inside `.value-list`. At ~2560
with a 736px left column, his screenshot shows:

- The folder glyph (`.loop-icon`) and the Smart-Collection sparkle render ABOVE
  the card's top edge, sitting in the gap between rows.
- The count numeral renders BELOW the card's bottom edge, in the next gap.
- So the painted card holds only the label while its art and count escape into
  the row gaps, and consecutive rows read as overlapping. They stopped looking
  like cards.

Likely the same class you already fixed for the catalog's plate images: the card
grew under the new row-ceiling / height-budget math but this screen's inner
content is not constrained to the card box (missing `min-height: 0` on the grid
item, art sized against something that is no longer the sized element, or
content simply taller than the row with visible overflow). Note this screen
measured `-910 / -852` dead air at 1920 in your own 9.1 table — it is the one
screen whose content EXCEEDS its zone, which is why it is the one that broke.

Fix it so art, label, and count all live inside the card at every tier, with the
art scaling with the card the way Creator and Timing & Direction now do.
Genuine scrolling is acceptable when there are more collections than fit — a
broken card is not.

### 10B — LOOPs composes wrong, and depends on the previous screen

His screenshot: LOOPs renders 7 options as 2 columns × 4 rows with **Rewound
alone in the last row** — a row of one, which `4k-native-layout.md` forbids
outright. 7 % 2 = 1 and 7 % 3 = 1, so neither 2 nor 3 columns divides cleanly;
either span the last card across the row (the trick you already used for the
11th catalog tile) or pick a count that leaves no orphan.

The more important half is his causal observation: **the composition depends on
which screen was open before**. That points at the height budget reading a stale
measurement across the per-section `<Crossfade>` — the outgoing screen's blocks,
or a value published before the incoming screen laid out — so LOOPs inherits an
allocation computed for something else. A layout that differs by arrival path is
a bug even when the frame happens to look fine.

Reproduce it deliberately: enter LOOPs from several different prior screens
(Grid mode → LOOPs, Timing & Direction → LOOPs, Collections → LOOPs, and LOOPs
from a fresh load) and compare the measured column count, row heights, and
`--editor-need`. They must be identical. Then fix the staleness at its source in
`pane-height-budget.ts` rather than papering over it with a per-screen override.

### Steps

- [x] **Step 10.1 — reproduce both, with numbers.** For 10B, the arrival-path
  table above (≥4 paths × column count / row height / `--editor-need`). For 10A,
  per-card child-vs-card rect comparison on the Collections screen.
- [x] **Step 10.2 — fix 10A.** Content inside the card at 1920 / 2560 / 3840.
- [x] **Step 10.3 — fix 10B at the source.** Same composition regardless of
  arrival path; no row of one on LOOPs (or any screen — check all ten).
- [x] **Step 10.4 — sweep for the same two classes across all ten value
  screens.** (a) any child element whose rect escapes its card's rect;
  (b) any screen whose last row holds exactly one item. Measure, do not
  eyeball: compare `getBoundingClientRect()` of each card's children against
  the card, and group cards by `Math.round(rect.top)` to count rows. Report
  what you CHECKED, not only what you changed.
- [x] **Step 10.5 — verify + commit.** Before/after screenshots of Collections
  and LOOPs at 2560 read side by side. `npm run check`: 0 errors, 0 warnings.
  `npx vitest run tests/unit/browse/`: only the 2 protobufjs suites failing.
  Do NOT raise the GalleryDrill line cap. Explicit pathspecs. Do NOT push.

## Task 10 closeout (2026-08-05)

**Tooling.** chrome-devtools MCP still disconnected; everything below was driven
over raw CDP on :9222 (`Emulation.setDeviceMetricsOverride` at w×1.1 by h×1.1,
dpr 1.1, `Runtime.evaluate`, `Page.captureScreenshot` webp/70), scripts in the
scratchpad. Two automation notes for the next session: the browse module
restores its last tab (Library) and fights `/browse/gallery`, so click the
"Gallery" section button until a gallery surface is mounted; and the flex-basis
transition is 0.24s, so sample the pane twice and only trust two consecutive
agreeing reads — a single read lands mid-transition and reports a stage height
that belongs to the previous screen.

### 10.1 — the before numbers

**10B: LOOPs by arrival path, 2560×1440 (before).** The composition changed with
every path. Column count was always 2 and the last row always held one card, but
the height allocation was different every time:

| Arrival | `--editor-need` | stage | row height | catalog | tile |
|---|---|---|---|---|---|
| fresh load | 1010px | 1022 | 221 | 371 | 79 |
| from Grid mode | 634px | 688 | 137 | 705 | 163 |
| from Timing & Direction | 655px | 707 | 142 | 687 | 158 |
| from Collections | 878px | 905 | 192 | 488 | 109 |
| from Length | 580px | 640 | 125 | 753 | 175 |
| from Start position | 634px | 688 | 137 | 705 | 163 |

At 1920 the same table is uniform (750px everywhere) — the column is short
enough that every path saturates, which is why the defect only shows on wide
screens.

**10A: Collections per-card child-vs-card rects, 2560, 736px column.** Grid
`minmax(84px, 224px)`, 16 collections, 8 rows, list 777 in a 788 scroll box.
Every card measured 91px while its content needed 92–105:

| child | offset vs card top | offset vs card bottom |
|---|---|---|
| `.loop-icon` (folder / sparkle) | **+2 above** | −68 |
| `.value-main` | +30 | −28 |
| `.value-count` | −69 | **+2 below** |

48 escaping child rects across the 16 cards. Cards carrying a curator line
(`C2C - Down the Road`) need ~105px and spilled further; with an 8px row gap the
glyph of one row and the count of the row above land in the same gap, which is
the "rows overlapping" Austen saw.

### Root cause of the staleness (10B)

Not the Crossfade. **The measurement was circular.** A grid track written
`minmax(a, b)` is *maximised* into whatever free space its container has before
`align-content` ever runs, so `.value-list` was exactly as tall as the stage let
it be — and the stage's flex-basis was `--editor-need`, which the budget read
back off that same list. Every allocation is a fixed point of that loop, and
which one you land on is whichever screen you arrived from. The file's own
header comment asserted the opposite ("the measurement is invariant to the zone
height it feeds"); it was wrong.

`pane-height-budget.ts` now measures a grid block from quantities the allocation
cannot move: the number of ROWS its items occupy (row assignment follows the
column count and spans, never the row heights) times the track's own ceiling,
floored per row by that row's content. Non-grid blocks keep the content-height
path. It also adds the stage's own padding and border, because the value is
consumed as the border-box stage's flex-basis and without it the last row lost
exactly that much off its bottom edge.

**After: 5 screens × 7 arrival paths each, all identical.** LOOPs 1036px from a
fresh load and from Grid mode, T&D, Collections, Length, Start position and
Starting letter. Same for Collections (1964px), Level (532px), Start position
(532px), Timing & Direction (572px).

### 10.2 / 10.3 — what changed

1. **`grid-auto-rows` minimum is `min-content`, not a fixed length**
   (`--pane-row-fit`), for the screens whose cards are a stack of text plus a
   fixed glyph: collections, LOOPs, creator, level, length, max turns, letter.
   A row can no longer be shorter than what it holds. The numeric floor moved
   onto the card as `min-height`, where it still holds short cards open but
   cannot crush a tall one.
   **The art-led screens opt out deliberately** — start position, grid mode and
   T&D size their art as a PERCENTAGE of the card, and a percentage cannot
   resolve during min-content sizing: it falls back to the pictograph's
   intrinsic height and inflates the floor to a height the column never had.
   Measured: with them included, Start position at 1920 went from 546/546 to
   546/1000 and T&D from 410/410 to 499/774. With them excluded, both are back
   to no scroll and their art still scales with the card.
2. **LOOPs pins two columns at `@container drill (min-width: 640px)` and spans
   its last card when the index is odd.** Seven into two strands Rewound alone
   (`4k-native-layout.md` rule 2). Pinning the count is what makes the
   `:last-child:nth-child(odd)` test provably correct rather than a guess about
   whatever tier happened to apply. Same trick as the catalog's eleventh tile.
   Measured after: 7 cards, 4 rows, last card 711px wide in a 711px list.
3. **Letter glyphs get `fitToParent`.** `W-` (and the other dashed letters) were
   wider than their chip at the glyph's natural aspect and bled 12–44px past the
   tile's right edge at every viewport, including below the seam.

### 10.4 — the sweep, all ten value screens × three viewports

Method: `getBoundingClientRect()` of every descendant of every card compared
against the card's own rect (a spill is only counted when nothing between the
child and the card clips it), and cards grouped by `Math.round(rect.top)` to
count rows, with the last row's width compared against the list's to tell an
orphan from a deliberate span.

**(a) Escaping children — 3 classes found, all fixed:**

| Screen | Before | Where |
|---|---|---|
| Collections | 48 escapes @2560 | folder/sparkle +2 above, count +2 below (10A) |
| Starting letter | 8 @2560, 4 @1920, 44 @3840 | dashed glyphs +12/+2/+44 past the right edge |
| Level | 9 @1920 | `SequencePeek` +12 above and below the tile |

**Checked and NOT a defect:** Creator showed 49 rect escapes at 2560 and 3840
(the peek fan +56 to +65 above the card). `.creator-row { overflow: hidden }`
clips every one of them, so nothing paints outside the card. The clipping-aware
detector no longer reports it; the fan now also fits inside the card outright,
because the creator rows grew under the `min-content` floor.

**After: 0 escaping children on all ten screens at 1920, 2560 and 3840**, and 0
on the letter grid below the seam at 960×412, 375×667 and 820×1180.

**(b) Rows of one — one found, one fixed.** LOOPs at 2560 and 3840 (2 columns,
last row 1 card). Everything else with more than one column ends on a full or
part-full row: Level 3/3, Length 5 then 3, Starting letter 8 then 6, Start
position 3/3, Grid mode 2/2, Creator 2/2, T&D 3/3, Collections 2/2.
Single-column layouts (Level, Start position, LOOPs, Creator, Collections and
Max turn intensity at 1920) are not orphans — there is no second column to
strand against.

### 10.5 — after numbers

Every screen's last card sits inside the stage except where the list genuinely
overflows the column, which scrolls: at 2560 only Creator (172px) and
Collections (28px); at 3840 none; at 1920 Level (108), LOOPs (123), Creator
(165) and Collections (260) — the 1920 column is ~1046px tall and those lists
have 3–16 rows.

- `npm run check`: **0 errors, 0 warnings.**
- `npx vitest run tests/unit/browse/`: 87 passed, 2 suites failed — the
  documented protobufjs baseline (`canonical-tnd-author`, `founding-collections`).
- `gallery-drill-split-contract.test.ts`: 5/5. **Line cap not raised**;
  GalleryDrill is unchanged at 855 lines.

### Known, not fixed

- **The catalog collapses to its compact rows (54px tiles) on Collections and
  Creator** at 2560 and 3840. Those screens now ask for their full ceiling, the
  catalog is already at its natural minimum, and the editor takes the rest.
  That is the budget working as designed — the editor genuinely needs the height
  — but it is the biggest visible change outside the two defects.
- **Level at 1920 scrolls further than it did** (108px hidden vs 23px). Its
  cards grew from ~165px to ~218px so the `SequencePeek` fits inside the tile
  instead of spilling 12px out of it; three of those do not fit a 1046px column.
- The 4K@100% root ramp remains Task 7.6's open item.
