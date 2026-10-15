# Guide — Crawlable Paginated Reader (One Surface, Print Untouched)

**Date:** 2026-07-14
**Status:** Approved (design) — Austen delegated full execution overnight
**Owner:** SEO overhaul, P0 "flow arts education" search space + the durable guide end state
**Supersedes:** the *doorway route* half of
`2026-07-14-guide-reflow-single-source-design.md` (the `/guide/level-1/<slug>`
funnel-to-reader model). That spec's content-model (`GuideBlock[]`, `FlowFrame`,
`SheetFrame`, drift guard) is KEPT and built on; only the two-surface doorway
topology is replaced.
**Related:** `2026-07-07-guide-reader-design.md` (reader shell + frame seam),
`docs/archive/swarm-2026-10-14/architecture/guide-single-source.md`, `project_seo_overhaul`,
`project_guide_single_source`, rules `no-ghostwriting-austen`, `never-hand-roll`,
`sequence-viewer-shell` (one-model / contract-test pattern), `no-layout-shift`,
`chip-primitives` (`SegmentedControl`), `clickable-links`.

---

## 1. Why the doorway approach was wrong

The prior pass shipped 33 prerendered `/guide/level-1/<slug>` **doorway** pages:
prose-only payloads that ranked and funnelled visitors into the *separate*
`ssr=false` interactive reader at `/learn/guide/<slug>`. Three defects:

1. **Thin / hollow.** Pictographs — the actual teaching content of a *visual*
   notation guide — were deferred. Pages whose content is mostly pictographs
   (`codex`, the LOOP pages) prerendered as headings with 0–2 sentences.
2. **A "doorway" in Google's spam sense** — a page whose purpose is to rank and
   send the user elsewhere. Papering over thinness with sitemap priority is
   lipstick.
3. **Two sources, drift risk.** Hand-copied prose in parallel `content` files vs.
   the real guide — the exact duplication the single-source spec was built to
   prevent.

Root realisation (grounded in the code): the reader is invisible to Google **only
because it is served through the app SPA catch-all** (`[...appPath]/+page.svelte`
→ `AppShellLoader`, client-only). The root layout is already `ssr = true`
(`src/routes/+layout.ts`); public pages server-render by default. The doorway
existed solely to work around the reader being trapped in the shell. Un-trap it
and the workaround — and its duplication — disappears.

Second grounded fact: the pictograph `aria-label` **is** crawlable content.
`GuidePictograph.svelte:64-69` computes `describePictograph(data)` *synchronously*
(`$derived`), so it lands in prerendered HTML even though the visual SVG hydrates
client-side. Each pictograph = one crawlable notation description ("blue hand
south, red east, gamma"). Prose-only threw that away.

## 2. The decision

**One guide surface. Paginated, prerendered, per topic. It is both the crawlable
page and the interactive reader — no doorway, no funnel, no second copy.**

- Each topic is its own route `/guide/level-1/<slug>`, `prerender = true`
  (inherits root `ssr = true`). Prerenders to static HTML (headings + Austen's
  verbatim prose + every pictograph's `describePictograph` aria-label +
  `GuideSeo` schema) and **hydrates** into the full interactive reader chrome
  (sheet⇄flow switcher, companion, prev/next nav, live pictograph SVGs).
- The all-pages **scroller** (`GuideReader`) is retired for the public web
  surface; topic-to-topic movement is client-side routing between prerendered
  sibling routes (standard docs-site pattern: 1 URL = 1 topic = 1 rankable page).
- `/learn/guide/<slug>` **redirects** to `/guide/level-1/<slug>`.

## 3. Print is the priority — and it is never at risk

Austen sells the guide as physical **books**. Print fidelity outranks SEO.

- **The book pipeline is untouched.** `/print` (stacked pages) and `/book`
  (StPageFlip) render `GuideDocument` → the existing `_pages` sheet components.
  `GuideDocument` is a *separate* consumer from the reader (its own docstring:
  "Both the print route and the book route render this"). Retiring the reader
  scroller and adding the paginated web routes **does not touch `GuideDocument`,
  `/print`, `/book`, or the `_pages` sheet renderers.** The sold product cannot
  regress from this work.
- **No sheet-from-`content[]` migration is required for crawlability.** The web
  route's *flow* view renders `FlowFrame(content[])`; its *sheet* view renders
  the existing built `_pages` component (exactly as `GuideDocument` does at
  `GuideDocument.svelte:200-202`). So the print-faithful sheet the user sees on
  the web toggle IS the current book sheet — zero new print surface, zero pixel
  re-verification needed to ship SEO.
- The eventual unification (sheet renders from `content[]` via `SheetFrame`, pt
  hints + pixel-verify per page) remains the durable end state from the prior
  spec, staged **later**, page-by-page, each pixel-gated against the current book
  page before it may replace it. It is explicitly OUT of scope here so SEO never
  waits on — or endangers — the book.

## 4. The switcher (what Austen asked for)

A per-page **sheet ⇄ flow** control — `SegmentedControl` (`chip-primitives`:
single-select, exactly-one-active). "Print-friendly" = sheet (the book layout,
built `_pages`). "Flow-friendly" = reflow (`FlowFrame`, mobile + SEO). Default:
**flow** (the crawl/mobile default; also what the prerendered HTML contains),
**sheet** available as the desktop toggle. Choice persists via the existing guide
preference store. Reduced-motion: instant cut, owned by the switch.

## 5. Architecture

### 5.1 Routes

```
src/routes/(public)/guide/level-1/[slug]/+page.ts      // prerender=true; entries()=all body slugs
src/routes/(public)/guide/level-1/[slug]/+page.svelte  // GuideSeo + GuidePageHost(slug)
```

- Single dynamic `[slug]` route replaces the 34 hand-made per-slug dirs (delete
  the doorway `+page.svelte`/`+page.ts` files, incl. the prose-only rollout).
  Static siblings (`/print`, `/book`, `/codex`, `/images`, `level-2/*`) keep
  precedence over `[slug]` (SvelteKit routes specific-over-dynamic).
- `+page.ts`:
  ```ts
  import { GUIDE_BODY_PAGES } from "../_data/guide-manifest";
  export const prerender = true;
  export const entries = () => GUIDE_BODY_PAGES.map((p) => ({ slug: p.id }));
  ```
  `entries` makes SvelteKit prerender every topic even though none are linked from
  a prerendered index yet.

### 5.2 `GuidePageHost.svelte` (new — composed from existing primitives)

The per-page reader chrome. Reuses, does not re-roll:
- `GuideSeo` (title/description/breadcrumbs/schema per slug).
- The sheet⇄flow `SegmentedControl` (switcher).
- Body: `frame === "flow"` → `FlowFrame(GUIDE_CONTENT[slug])`; `frame === "sheet"`
  → the built `_pages` component `BUILT[slug]` (same branch as
  `GuideDocument.svelte:200-202`). Unmigrated pages (no `GUIDE_CONTENT[slug]`)
  fall back to sheet-only until their `content[]` lands.
- `GuideCompanion` (tap-to-play animation) — SSR-guarded: rendered behind a
  browser gate / reserved poster box so prerender never executes the canvas
  player and there is no hydration layout shift (`no-layout-shift`).
- Prev/next **`<a href>`** to sibling `/guide/level-1/<slug>` routes
  (`clickables-look-like-buttons`; real anchors → client nav after hydration,
  crawlable link graph before).
- Per-page metadata (`title`, `description`, breadcrumbs) from a
  `GUIDE_PAGE_SEO[slug]` map — description = Austen's first explanatory sentence,
  truncated ≤155, never invented (`no-ghostwriting-austen`).

Host owns its own light/dark editorial palette (`--ink`/`--ink-dim`/
`--glyph-invert`), as the current doorway wrapper does — NOT the app `--theme-*`
canvas vars.

### 5.3 Reader base rebased

`GUIDE_READER_BASE` (`guide-page-links.ts:14`) `"/learn/guide"` →
`"/guide/level-1"`. All deep-link/href builders (`hrefForIndex`, nav rows, the
reader's URL sync) follow. `/learn/guide/<slug>` becomes a redirect route →
`/guide/level-1/<slug>` (301/permanent). The app `GuideTab` entry point routes
to the new base.

### 5.4 Content model (single source, from the prior spec)

Per page `export const content: GuideBlock[]` in
`_data/content/<slug>.content.ts`, registered in `GUIDE_CONTENT`
(`_data/guide-content.ts`). Blocks: `heading`, `prose` (verbatim `editText`),
`glyphImage`, `pictograph`/`pictographGroup`, `rule`, `printOnly`. **Pictograph
blocks are mandatory** — they are the crawlable notation payload, not optional
decoration. Pictograph `StepData`/positions are DERIVED from the same domain
helpers the `_pages` use (e.g. `startPositionManager`), never hand-fabricated
(`mcp-ground-truth`, `no-fabrication`). `sheet` pt hints are optional here and
only consumed by a future `SheetFrame`; omitted for crawl-scope pages.

## 6. SEO surface

- `GuideSeo` per route: canonical → `https://tkaflowarts.com/guide/level-1/<slug>`,
  `LearningResource` + `BreadcrumbList` JSON-LD, `partOf` the Level-1 guide.
- Dynamic `sitemap.xml`: one entry per migrated slug (the hand-made block from the
  doorway pass is replaced by an enumeration over `GUIDE_BODY_PAGES` filtered to
  slugs with `hasReflowContent(id)` — never advertise a slug with no `content[]`).
- Internal-link graph: prev/next between topics + a crawlable Level-1 index
  (`/guide` hub already links the topics; verify anchors are real `<a href>`).

## 7. Testing / guardrails (`web-ci`)

- **Crawl test:** each migrated `/guide/level-1/<slug>` prerenders a non-empty
  `<h1>` + prose + ≥1 pictograph `aria-label` in static HTML; appears in the
  prerender manifest.
- **Drift guard:** for every migrated page, concatenated `content[]` prose/heading
  text is the single prose source (no second hand-authored copy). Mirrors
  `sequence-viewer-shell-contract.test.ts`.
- **Figure-path test:** `GuidePictograph` is the only pictograph embed on a flow
  route (`no-layout-shift`).
- **Route/redirect test:** `/learn/guide/<slug>` redirects to
  `/guide/level-1/<slug>`; `[slug]` `entries()` enumerates all body slugs.
- **Book-safety assertion:** `GuideDocument` / `/print` / `/book` still render the
  built `_pages` (the paginated web work did not touch them).
- Update `guide-reflow-contract.test.ts` (its doorway assertions — "Open the
  interactive guide" funnel, `/learn/guide` deep link — are replaced by the
  one-surface assertions above).

## 8. Migration & staging (overnight scope)

Per page: extract `content[]` = verbatim prose (from `editText`) + pictograph
blocks (from the page's own domain derivation) → register in `GUIDE_CONTENT` →
the `[slug]` route renders it automatically (flow) with the built `_page` as its
sheet toggle. Verify each: prerendered HTML carries `<h1>` + prose + pictograph
aria-labels.

- `hand-positions` already has full `content[]` (prose + pictographGroups) — the
  reference.
- Migrate the remaining Level-1 body pages in cluster batches via parallel
  subagents, **pictographs included** this time, each batch verified.
- A page ships crawlable only once its `content[]` (with pictographs) exists and
  its prerender is verified non-empty. Pages not yet migrated fall back to
  sheet-only on the web route and are omitted from the sitemap (no thin URLs).
- The 33 prose-only doorway files are DELETED (replaced by the `[slug]` route +
  proper `content[]`).

## 9. Non-goals

- Sheet-from-`content[]` (`SheetFrame`) migration + pt hints + pixel-verify — the
  durable unification, staged later, print-gated (§3).
- Server-side pictograph SVG rendering — figures hydrate; aria-labels carry SEO.
- Any change to `/print`, `/book`, `GuideDocument`, or the `_pages` sheet
  renderers (the book).
- New prose. Every word ships verbatim from Austen's existing guide.

## 10. Risks

- **Reader/companion SSR safety.** The reader is already `typeof window`-guarded
  (`GuideReader.svelte:169,359`, `GuideCompanion.svelte:136`). The companion's
  embedded sequence *player* may not be — gate it behind `browser`/a reserved
  poster so prerender never runs the canvas. A full prerender build surfaces any
  unguarded access to fix; bounded.
- **`[slug]` vs static siblings.** Verify `/print`, `/book`, `/codex` still
  resolve to their static routes (specific-over-dynamic) after adding `[slug]`.
- **Redirect loops.** `/learn/guide` → `/guide/level-1` must not bounce; the app
  `GuideTab` must point at the new base, not re-enter the old one.
