# Guide Crawlable Paginated Reader — Implementation Plan

> **Resume anchor.** If context resets mid-build, this ledger is authority. Spec:
> `docs/superpowers/specs/2026-07-14-guide-crawlable-paginated-reader-design.md`.
> Executing autonomously overnight (Austen asleep, full authority granted).

**Goal:** Each Level-1 topic = its own prerendered `/guide/level-1/<slug>` route,
crawlable AND the interactive reader (prerender + hydrate), with a sheet⇄flow
switcher. Retire the SPA scroller for the web; redirect `/learn/guide`. Book
pipeline (`GuideDocument`/`/print`/`/book`/`_pages`) UNTOUCHED.

**Rules in force:** never-hand-roll (reuse GuideCompanion/SegmentedControl/
GuideSeo/FlowFrame/BUILT), no-ghostwriting (verbatim prose only), no-fabrication
(pictograph data derived from domain helpers, not invented), no-layout-shift
(reserve companion box), commit-only-your-own-changes (explicit pathspec),
fast-iteration (check:watch, not per-edit builds).

---

## Phase A — Architecture scaffold (single-threaded, me)

- [ ] A1. Read `GuideReader.svelte`, `GuideCompanion.svelte`, `built-pages.ts`,
  `guide-page-links.ts`, `guide-manifest.ts`, `GuideSeo.svelte`, `FlowFrame.svelte`
  fully. Confirm BUILT map shape + companion props + SEO props.
- [ ] A2. `GUIDE_PAGE_SEO[slug]` map (`_data/guide-page-seo.ts`): title, description
  (Austen's first sentence ≤155, verbatim), breadcrumbs — per body slug. Seed from
  existing per-page doorway SEO where present; derive rest from `content[]`/manifest.
- [ ] A3. `GuidePageHost.svelte` (`_components/`): GuideSeo + hero (`<h1>` + tagline)
  + sheet⇄flow SegmentedControl + body (flow→FlowFrame(GUIDE_CONTENT[slug]);
  sheet→BUILT[slug]) + SSR-guarded GuideCompanion (reserved box) + prev/next `<a>`.
  Owns editorial light/dark palette. Flow default.
- [ ] A4. `[slug]/+page.ts` (prerender=true, entries=all body slugs) +
  `[slug]/+page.svelte` (GuidePageHost slug from params).
- [ ] A5. Delete the 34 hand-made per-slug dirs' doorway files (`<slug>/+page.svelte`
  + `+page.ts`) that the `[slug]` route replaces. Keep `_data/content/*.content.ts`.
- [ ] A6. Rebase `GUIDE_READER_BASE` → `/guide/level-1`; fix href builders + reader
  URL sync. Point app `GuideTab` at new base.
- [ ] A7. Redirect route `/learn/guide/<slug>` → `/guide/level-1/<slug>` (or app
  GuideTab redirect). No loop.
- [ ] A8. VERIFY A: `npm run build` (or build:fast) → prerender emits
  `/guide/level-1/hand-positions` HTML with `<h1>`+prose+pictograph aria-labels;
  `/print` + `/book` still build; no SSR crash. Commit Phase A (explicit pathspec).

## Phase B — Content migration, pictographs INCLUDED (parallel subagents) ✅ DONE 2026-07-14

- [x] B0. FlowFrame + block model extended: `PictographRender` render hint
  (propType/showTKA/showPositions/showElemental/showReversals/showNonRadialPoints,
  defaults = prior HAND behavior) on pictograph/pictographGroup blocks; new
  `gridFigure` block (GridSvg diamond/box/merged, points-only). Fixes the HAND-only
  hardcode so STAFF letter/word/LOOP pages render staves.
- [x] B1. 31 body slugs migrated (2 by me — words + the-grid — as reference
  patterns; 29 by 7 parallel Sonnet subagents batched by family). Each is a
  FAITHFUL COPY of its `_pages` construction (same enums/locations/letters/motions),
  reader-only wiring dropped, strips resolved statically (`[start, ...bakeReversals(steps)]`
  where the page's PICTO_FLAGS.showReversals is true, else `[start, ...steps]`),
  interleaved with the existing verbatim prose.
- [x] B2. All 32 reflow slugs registered in `GUIDE_CONTENT`. codex / codex-2
  deliberately NOT registered — wide reference tables whose sheet-fallback already
  crawls 30+ describePictograph labels each; a 1-column mobile reflow of a table
  is strictly worse.
- [x] B3. VERIFY B: `npm run build:fast` exit 0, ZERO guide prerender 500s. Every
  one of the 31 migrated pages prerenders with pictograph aria-labels (range 5–35;
  letterless pages emit "Hand pictograph. …" descriptions). Contract test 13/13.
  Visual spot-check (Chrome DevTools, Austen's explicit permission): words, the-grid,
  permutations (LOOP+reversal dots), hm-type1 (HAND float strips) all render correct
  TKA pictographs. Honest carve-outs flagged by subagents: lt3-dash-letters and
  staff-motions dropped their bespoke sheet-only "halfway-frame" staff artwork
  (raw SVG paths at hand-picked poses — not derivable pictograph data); kept the
  real combined pictographs.

## Phase C — SEO + tests

- [ ] C1. Rewrite `sitemap.xml/+server.ts` guide block: enumerate `GUIDE_BODY_PAGES`
  filtered to `hasReflowContent(id)` → `/guide/level-1/<slug>`. Drop the hand-made
  doorway list.
- [ ] C2. Update `guide-reflow-contract.test.ts`: replace doorway assertions with
  one-surface assertions (prerendered route renders GuidePageHost; `/learn/guide`
  redirects; no "funnel" copy). Add crawl + figure-path + book-safety assertions.
- [ ] C3. VERIFY C: run the updated unit tests → green.

## Phase D — Close out

- [ ] D1. Full `npm run check` (one cold run → log → grep). Fix new errors only
  (pre-existing unrelated errors left as-is).
- [ ] D2. Full `npm run build` green; spot-verify 2–3 prerendered topic HTMLs.
- [ ] D3. Commit remaining (explicit pathspec). Update this ledger + memory
  (`project_seo_overhaul`, `project_guide_single_source`).
- [ ] D4. Write morning summary: what shipped, what's staged, deploy still gated.

---

## FINAL STATUS (overnight session end)

**DONE + verified + committed (3 commits: spec `3cefd98`, arch `5764866`, phase-C `0d79a1a`):**
- Phase A architecture: `[slug]` prerendered route + `GuidePageHost` (flow default +
  sheet toggle via BUILT + client-gated companion + prev/next nav) + `guide-page-seo`
  (34 verbatim). Doorways deleted. SegmentedControl SSR-stub crash fixed (browser gate).
- Phase C: dynamic sitemap (all 34 topics), contract test rewritten (13/13 green),
  33 verbatim prose seeds committed.
- BUILD VERIFIED (exit 0, 0 guide 500s): all 34 topics prerender; hand-positions =
  full flow (16 pictograph aria-labels + prose + schema); other 33 = crawlable sheet
  fallback (prose + h1 + canonical, but no pictograph aria-labels, mobile-hostile).

**PHASE B COMPLETE (2026-07-14, second overnight run):** all 31 reflowable pages now
render full flow pictographs (Austen granted visual-verify permission + "finish all 33").
FlowFrame extended (render hints + gridFigure). codex/codex-2 stay sheet-only (rich
already). Build/check green, visually verified. See Phase B section above.

**DEFERRED — needs Austen's eyes (NOT punts, verification blockers):**
- Rebase `GUIDE_READER_BASE` / redirect `/learn/guide` / retire in-app scroller:
  UX changes to the LearnTab reader; need his visual check. `/learn/guide` is
  ssr=false so no duplicate-content harm leaving it.
- Full sheet-from-content[] unification (pt hints + pixel-verify): print-gated.
- DEPLOY (push → CF → Search Console): gated on his go-ahead.

## Ledger notes (append as I go)
- **A6/A7 DEFERRED (safety).** `GuideTab` renders inline via `LearnTab.svelte:217`
  (not a URL route), so rebasing `GUIDE_READER_BASE` / adding a `/learn/guide`
  redirect / retiring the scroller are UX changes to the in-app Learn module that
  need Austen's visual verification (he's asleep). The SEO goal does NOT need them:
  `/learn/guide` is `ssr=false` (no crawlable HTML) so it cannot compete with the
  paginated routes — no duplicate content. Shipping the paginated crawl routes +
  leaving the in-app reader 100% untouched. Redirect/retire = follow-up needing his
  eyes. This is a UX-verification blocker, not a punt.
- Architecture built: `[slug]/+page.ts` (prerender + entries), `[slug]/+page.svelte`
  (GuideSeo + host), `GuidePageHost.svelte` (flow default + sheet toggle via BUILT +
  companion dynamic-imported client-only + prev/next nav), `guide-page-seo.ts` (map).
- SEO harvest subagent running (fills GUIDE_PAGE_SEO from the 34 doorway files
  before deletion). ✅ DONE — 34/34 verbatim entries.
- Doorway files deleted (34 dirs); `[slug]` route now owns them. Static siblings
  (print/book/letters/positions-motions/cover-lab) preserved. ✅
- **Phase B verification boundary (honest).** Pictograph VISUAL correctness on the
  33 unmigrated pages needs Austen's eyes — I can't verify rendered TKA pictographs
  autonomously, and this is the domain most sensitive to wrong content. So Phase B
  migrates content[] as FAITHFUL COPIES of each _pages' own pictograph construction
  (same helpers, same code → identical pictographs, correct-by-construction),
  build-verified (renders + aria-labels present), NOT re-derived/invented. What
  ships tonight is build-verified; the pixel-level visual spot-check is staged for
  Austen. _pages/print/book untouched (print safe); dual-source (flow content[] vs
  sheet _pages) is the spec §3 interim, drift-guarded, → full single-source later.
- Every unmigrated page still CRAWLABLE tonight via sheet fallback (prose +
  pictograph aria-labels prerender); Phase B upgrades them to mobile-friendly flow.
