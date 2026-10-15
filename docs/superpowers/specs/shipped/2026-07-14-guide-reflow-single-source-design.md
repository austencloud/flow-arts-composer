# Guide Reflow — Single Source, Two Frames, Crawlable Route

**Date:** 2026-07-14
**Status:** Approved (design), pending implementation plan
**Owner:** SEO overhaul, P0 lever ("flow arts education" search space) + the
durable guide-reader end state
**Supersedes:** `2026-07-13-guide-article-system-design.md` (PULLED — the flat
article was a disconnected duplicate of the real guide)
**Related:** `2026-07-07-guide-reader-design.md` (the swappable-frame seam this
builds on), `2026-06-21-guide-rebuild-tracker.md` (the 38-page rebuild),
`docs/archive/swarm-2026-10-14/architecture/guide-single-source.md`, `2026-07-09-seo-overhaul-design.md`,
memory `project_guide_single_source`, `project_seo_overhaul`.

---

## 1. Problem

The 38 authored Level-1 guide pages (`guide/level-1/_pages/*.svelte`) are our
highest-demand beginner "flow arts education" content and our worst-indexed:
served via `/learn/guide/<slug>` through the `[...appPath]/+layout.ts` catch-all
(`ssr=false, prerender=false`) — zero server HTML, invisible to Google, all
sharing ONE sitemap URL. They are also fixed 8.5×11in print sheets
(`GuidePage` = `width: 8.5in`), absolute-positioned at pt coordinates measured
off the proof artboards — mobile-hostile, penalized under mobile-first indexing.

The `2026-07-13` attempt (flat `GuideArticle` per topic) was pulled: as a
separate hand-authored article it was a worse-looking, disconnected duplicate of
the real guide (dark-only, wasted width, thin, no next/prev), and it created a
second copy of the prose the manifest can't dedupe.

The `2026-07-07` guide-reader spec already named the correct end state — **one
layout-agnostic content model rendered by two frames** (a print-faithful sheet
frame + a mobile flow frame), *"Never build two separately hand-authored
layouts"* — and left the `sheetFrame` snippet in `GuideReader.svelte` as the
seam for the flow frame. It deliberately deferred the reflow machinery (YAGNI).
This spec builds it.

## 2. Core principles (load-bearing)

1. **Single source, zero drift.** One `content` array per page. The sheet frame
   and the flow frame both render it. No page ever holds two hand-authored
   layouts. (Austen's call 2026-07-14: single-source now, accepting the cost of
   re-verifying every sheet.)
2. **Prose is Austen's, verbatim.** Flow text is lifted unchanged from the
   existing `_pages` `editText(...)` calls (his words — the guide IS his prose).
   AI arranges into blocks and marks up headings; it does not compose new
   explanatory prose. (Enforces `no-ghostwriting-austen`.)
3. **Print output is sacred.** Each migrated page's sheet frame must reproduce
   the current print sheet pixel-for-pixel, verified against the artboard, before
   that page ships. `/print` and `/book` keep rendering the same source.

## 3. Goals / Non-goals

**Goals**
- A layout-agnostic per-page content model (`GuideBlock[]`) that is the single
  source for print AND web.
- Two render frames over it: `SheetFrame` (pt-positioned, print-faithful) and
  `FlowFrame` (mobile-first, theme-aware, editorial).
- A sheet⇄flow toggle in the reader.
- A prerendered, crawlable `/guide/level-1/<slug>` route per migrated topic that
  server-renders the flow frame (his prose ranks; pictographs hydrate) with
  `GuideSeo` schema + canonical + sitemap entry.
- Ship the machine end-to-end + the **1.0 positions cluster** fully migrated and
  verified as the proof.

**Non-goals**
- Server-side pictograph rendering (figures hydrate client-side).
- Rewriting the reader shell (`GuideReader` nav + companion untouched — only the
  center frame swaps at the existing seam).
- Writing new prose. Every word ships from Austen's existing guide.
- Migrating all 38 pages in this pass. Remaining clusters roll through the same
  machine as follow-on batches (§8).

## 4. Architecture

### 4.1 The content model (single source)

Per page: `export const content: GuideBlock[]` — ordered, layout-agnostic.

```ts
type PtHint = { x: number; y: number; w?: number; h?: number }; // pt, sheet-only

type GuideBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string; sheet?: PtHint }
  | { kind: "prose"; text: string; sheet?: PtHint }         // verbatim editText
  | { kind: "pictograph"; data: StepData; caption?: string; sheet?: PtHint }
  | { kind: "strip"; steps: StepData[]; caption?: string; sheet?: PtHint }
  | { kind: "printOnly"; render: PrintOnly; flow: GuideBlock[]; sheet: PtHint };
```

- `prose` / `pictograph` / `strip` are shared by both frames — the shared spine.
- `sheet?` is the pt hint; ONLY `SheetFrame` reads it. `FlowFrame` ignores it.
- `printOnly` covers the bespoke sheet artifacts that don't reduce to semantic
  blocks — flattened PDF raster strips, hand-measured vector breakdown rows
  (e.g. `Type3CrossShiftsPage`). It carries BOTH its print representation
  (`render`) AND a `flow` fallback (the same content re-expressed as
  `strip`/`pictograph` blocks) so the flow frame never ships a mobile-hostile
  raster. This is the only place the two frames diverge in representation — and
  the prose is still shared, so a drift guard still holds (§7).

The 38 `_pages/*.svelte` shrink toward: a `content` array (data) + a thin host
that renders the active frame. Frame-agnostic domain helpers (motion/StepData
construction, reversal baking) stay shared as today.

### 4.2 Two frames

**`SheetFrame.svelte`** — absolute-positions each block at its `sheet` pt hint
inside `GuidePage` (`width: 8.5in`). Reproduces the current print sheet
pixel-for-pixel. Consumes `printOnly.render`. This is the frame `/print` and
`/book` use.

**`FlowFrame.svelte`** — stacks blocks in reading order down a mobile-first,
theme-aware editorial column (reuse `public-editorial.css`; add a
`guide-flow` variant only if figure density needs it). Renders:
- `heading` → `<h1>`/`<h2>`/`<h3>`
- `prose` → `<p>` (verbatim)
- `pictograph` → `GuidePictograph` (reserved `aspect-ratio` box + synchronous
  crawlable `describePictograph` `aria-label`/`<figcaption>`; SVG hydrates
  client-side → zero layout shift)
- `strip` → a row/stack of `GuidePictograph` with the shared caption
- `printOnly` → its `flow` fallback blocks (never the raster)

Both frames are pure over `content` — no data fetching, no side effects — so each
is understandable and testable in isolation.

### 4.3 The frame seam

Frames swap at the **existing `sheetFrame` snippet in `GuideReader.svelte`**
(documented "swappable-frame seam: a future reflow frame drops in here without
touching nav or companion"). Nav (`GuidePageNav`) and the animation companion
(`GuideCompanion`) are untouched. The reader passes the active frame + the page's
`content` to the seam.

### 4.4 The toggle

Sheet ⇄ Flow control in the reader center pane (reuse `SegmentedControl` per
`chip-primitives` — single-select, exactly-one-active). Default: **sheet on
desktop** (print-faithful is the wow), **flow on mobile** (< 768px; sheets are
mobile-hostile). Choice persists per-user via the existing guide preference store.
Reduced-motion: the frame swap collapses to an instant cut (no crossfade), owned
by the toggle, not re-implemented per consumer.

### 4.5 The crawlable route (SEO payoff)

The reader is `ssr=false` — a toggle alone never reaches Google. So the flow
frame is ALSO exposed on a **prerendered** route:

- `src/routes/(public)/guide/level-1/<slug>/+page.svelte`, sibling of the
  working `/guide/level-2/turns`. `+page.ts`: `export const prerender = true;`.
- Renders `GuideSeo` (canonical → `tkaflowarts.com`, `LearningResource` +
  `BreadcrumbList` JSON-LD) + `<h1>` + `FlowFrame` over the SAME page `content`.
- His prose prerenders to static HTML and ranks; pictographs hydrate into their
  reserved boxes as illustrations. No server pictograph pipeline.

**Reader = app host, prerendered route = crawl host — one content model, two
hosts** (the `SequenceViewerShell` anti-drift pattern). The reader's flow view
and the route's flow view are the same `FlowFrame` over the same `content`, so
they cannot drift. The route is the crawl canonical; the reader stays the rich
interactive app. No duplicate-content risk: the reader emits no server HTML.

This resurrects the good parts of the pulled article system — `GuideSeo`,
`GuidePictograph`, prerender + schema — over the REAL single-source guide content
instead of a hand-written copy. The deleted flat `GuideArticle`/`GuideFigure` are
NOT revived; `FlowFrame` replaces them, driven by `content`.

## 5. Route topology & canonical

| Surface | Route | Rendering | Crawlable | Role |
|---|---|---|---|---|
| Reader (app) | `/learn/guide/<slug>` | `ssr=false` catch-all, sheet⇄flow toggle | No | Rich interactive experience |
| Crawl page | `/guide/level-1/<slug>` | `prerender=true`, `FlowFrame` + `GuideSeo` | Yes | SEO canonical |
| Print replicas | `/guide/level-1/print`, `/book` | `SheetFrame` | noindex | Print / flip compare |

Canonical for each topic → the prerendered `/guide/level-1/<slug>`. The reader's
flow toggle may deep-link "open as page" → that route, or render flow inline
(both are the same frame; inline is the default, the deep link is a convenience).

## 6. Migration (per page)

1. Extract verbatim prose from the page's `editText(...)` calls → `prose` blocks.
2. Extract pictograph/sequence data (`StepData`/motion arrays) → `pictograph` /
   `strip` blocks.
3. Capture each block's current pt position → its `sheet` hint.
4. Bespoke raster/vector artifacts → `printOnly` blocks with a semantic `flow`
   fallback.
5. Verify: `SheetFrame(content)` pixel-matches the original sheet against the
   artboard BEFORE the page ships.
6. Wire the crawlable route: `GuideSeo` title/description (his first explanatory
   sentence, truncated — not invented) + breadcrumbs + sitemap entry.

Stage by cluster, ledgered in this spec's plan. Order: **1.0 positions first**
(highest SEO value, cleanest prose, the pulled article's target), then the
remaining 1.0 / 1.1 / 1.2 clusters.

## 7. Guardrails / testing

- **Drift-guard contract test** (`web-ci`): for every migrated page, the flow
  prose (concatenated `prose`/`heading` text) equals the sheet prose. Since both
  frames render the same `content`, this is inherent — the test asserts no page
  reintroduces a second text source.
- **Crawl test**: each `/guide/level-1/<slug>` prerenders non-empty `<h1>` +
  prose in static HTML; appears in the prerender manifest + sitemap.
- **Figure path test**: `GuidePictograph` is the only pictograph-embed path in a
  flow route (no raw unsized pictograph → `no-layout-shift`).
- **Per-page pixel check**: sheet frame vs original artboard, per migration.
- Mirrors `sequence-viewer-shell-contract.test.ts` /
  `seo-head-contract.test.ts`.

## 8. Scope

**Build now (this effort):**
- `GuideBlock` model + types.
- `SheetFrame.svelte` + `FlowFrame.svelte`.
- The `sheetFrame`-seam wiring in `GuideReader` + the sheet⇄flow toggle.
- One prerendered `/guide/level-1/<slug>` route rendering `FlowFrame` + `GuideSeo`.
- Sitemap + internal-link wiring for the migrated cluster.
- The contract + crawl + figure tests.
- **The 1.0 positions cluster fully migrated + pixel-verified + crawlable.**

**Out of scope (follow-on, same machine):** the remaining ~34 pages
(clusters 1.0 tail, 1.1, 1.2) — each is Austen's existing prose + pictographs
extracted into `content[]` and re-verified. No new architecture.

## 9. Open questions (resolve at implementation)

1. Exact 1.0-positions page set to migrate first — confirm the slugs from
   `guide-manifest` `bodyPagesByGroup()` for group 1.0.
2. `FlowFrame` container: reuse `public-editorial.css` as-is vs a `guide-flow`
   variant for figure density. (Start with reuse.)
3. Reader flow view: render inline in the center pane (default) vs deep-link to
   the crawl route. (Default inline; both are the same frame.)
4. Whether `printOnly.render` reuses the current sheet's exact markup extracted
   as-is, or the block wraps it — confirm the least-invasive extraction that
   preserves the pixel match.

## 10. Related rules & memory

- Rules: `no-ghostwriting` (feedback), `never-hand-roll`, `primitive-discovery`,
  `no-layout-shift`, `crossfade-primitive` (toggle transition), `chip-primitives`
  (`SegmentedControl` for the toggle), `sequence-viewer-shell` (one-model-two-
  hosts + contract-test pattern), `clickable-links`.
- Memory: `project_seo_overhaul`, `project_guide_single_source`,
  `feedback_no_ghostwriting_austen`, `feedback_reuse_pictograph_renderer`,
  `feedback_simplified_word_and_glyphs`.
