# Guide: Single Source of Truth — Faithful Pages

**Decision (2026-07-07, Austen):** The faithful page-by-page rebuild
(`_pages/*`, the pt-coord replicas verified against the original artboards) is
**THE Level 1 guide** — for both print AND online. The animated web version
(`_sections/ch{10,11,12}/*`) is **legacy**, to be retired once the rebuild
reaches parity. Online animations become an optional layer ON the faithful
pages, not a separate reinterpretation.

## Why this decision exists

Two parallel guide systems had diverged:

| | `_pages/*` (A) | `_sections/ch*` (B) |
|---|---|---|
| What | Faithful pt-coord replicas of the original PDF | Reflowable, `GuideMotionVideo`-animated web reinterpretation |
| Routes | `/print`, `/book` | `/placements-motions`, `/letters`, `/words` |
| Coverage | 7 of ~34 pages (rest = placeholders) | Full, but thinner (e.g. Type 3 = 1 paragraph + a video vs the print page's breakdown + 2 sequences) |
| Indexable | `noindex` | Indexable (canonical) |

The rebuild tracker (`docs/superpowers/specs/audits/2026-06-21-guide-rebuild-tracker.md`)
scoped only the *printable* rebuild and never decided B's fate, so they drifted.
The 2026-07-07 SEO pass then pointed Google at B (the thinner animated version) —
not the faithful work being perfected in A. This ADR resolves it: **A is
canonical; B is legacy.**

## Plan (sequenced — do NOT reorder)

**Phase 1 — now (ongoing):** Finish the faithful `_pages` rebuild, one page at a
time, per the tracker recipe. `_sections/ch*` STAYS — it keeps the live online
guide working until A reaches parity. Deleting it early breaks the web guide
(A only has 7 pages).

**Phase 1b — SHIPPED 2026-07-07: the Guide Reader (app-facing surface).** The
Learn-module Guide tab (`src/lib/features/learn/guide/GuideTab.svelte`) now hosts
`GuideReader` — a durable 3-pane shell (manifest nav + one printable page
fit-to-pane + a slide-open live-animation companion) rendering the SAME
`GuideDocument` + `BUILT` as `/print` and `/book`. This is the interactive,
user-facing guide; it replaced the old animated `_sections` view *in the app tab
only* (the public `/guide/level-1/*` animated routes are untouched and converge
onto `GuideReader` in Phase 2). The reader shell — nav, companion, click-to-
animate — is the durable end-state UI; only the center *frame* swaps in Phase 2
(sheet → reflow). The center is already a swappable snippet, and new pages should
separate content from pt-position so a flow frame can consume them. Spec:
`docs/superpowers/specs/shipped/2026-07-07-guide-reader-design.md`.

**Phase 2 — at parity (faithful pages cover the whole guide):**
1. Build the online **reflowable** view driven by the page **content**, not its
   absolute pt-layout — so it reads well on mobile (the pt-coord print sheet does
   not reflow). This needs each `_pages/*` page to keep its content in structured
   data (prose blocks, pictograph move-data, reading order) separate from the
   baked layout. New pages should be authored that way from the start.
2. Layer the motion animations (`GuideMotionVideo`) onto the faithful pages for
   the web render (print = static pictograph, web = same page, motion video
   swapped in for the static one).
3. Re-point the web chapter routes + canonical + sitemap to the faithful online
   view.
4. Retire `_sections/ch*`.

## What carries forward (the 2026-07-07 SEO pass is NOT wasted)

`GuideSeo.svelte` (canonical/OG/Twitter/JSON-LD), the sitemap guide URLs, and the
crawlable pictograph `aria-label`s (`PictographContainer` + `GuidePictograph`)
all stay. Only the **content source** the indexable route renders changes in
Phase 2 (from the `_sections` stubs to the faithful pages). Until then, B remains
the interim indexable surface.

## Constraints

- **Do not delete `_sections/ch*` before Phase-1 parity.** It is the live web guide.
- New faithful pages keep content in structured data (see Type3CrossShiftsPage's
  `PARAS` / `SEQ1` / `SEQ2` / `BREAKDOWN` arrays) so Phase 2 can reflow them.

## Related

- Tracker: `docs/superpowers/specs/audits/2026-06-21-guide-rebuild-tracker.md`
- SEO: `_components/GuideSeo.svelte`, `sitemap.xml/+server.ts`
- `.claude/rules/sequence-viewer-shell.md` (same "one source, render twice" playbook)
