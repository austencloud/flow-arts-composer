# Guide Reader — Interactive Paged Guide in the Learn Module

**Date:** 2026-07-07
**Status:** Approved (design), pending implementation plan
**Related:** `docs/archive/swarm-2026-10-14/architecture/guide-single-source.md` (single-source decision),
`docs/superpowers/specs/2026-06-21-guide-rebuild-tracker.md` (page rebuild),
memory `project_guide_single_source`.

## Problem

The Learn module's Guide tab (`src/lib/features/learn/guide/GuideTab.svelte`)
renders the OLD animated `_sections/ch10/*` reinterpretation on a white
ad-hoc layout — NOT the faithful page-by-page rebuild (`_pages/*`) that has been
verified against the original artboards. Austen wants ONE canonical guide,
user-facing in the app, that shows the faithful pages, is navigable via a
sidebar, and stays printable. Unbuilt pages show "coming soon."

Austen also wants interactivity the print booklet can't have: click a sequence
on a page and a companion panel slides open and **live-animates** it.

## The reframe (why this shape, not a second layout)

The drift risk people fear ("two versions, two layouts") is really **two copies
of the content**. Today the manifest (`guide-manifest.ts`) shares only page
**order + titles**. Each page's body (prose, which pictographs, sequences) is
baked into that page's Svelte file at absolute pt-coordinates. The manifest does
NOT carry content. So a future hand-authored reflowable version would re-type the
same paragraphs/sequences — a second content copy the manifest can't dedupe.

Therefore split the system into:

- **The shell** — nav + paged center + slide-open animation companion +
  click-to-animate. This is the **durable end-state UI**. A paged document with a
  live-animation sidecar is a coherent *final* product; it is not throwaway.
- **The content model** — where the words/pictographs/sequences live. Today =
  pt-layout. The eventual endgame (only if mobile reflow earns it) = layout-
  agnostic **block data** (per page: ordered blocks — prose / pictograph /
  sequence / breakdown — plus *optional* pt position hints), rendered by two
  frames: a **sheet frame** (positions blocks on the 8.5×11 sheet, print-faithful)
  and a **flow frame** (stacks blocks down a column, mobile). One content source,
  two frames, zero drift.

**Never build two separately hand-authored layouts.** Always two render frames
over one content model.

## Decision

Build the paged 3-pane **Guide Reader** now, as the durable shell. Keep the
center as a **swappable frame** so a flow frame can be added later without
touching nav or companion. Do NOT build reflow machinery on spec (YAGNI). Nudge
page content toward **content/position separation** as pages are wired, so the
endgame stays cheap to reach and no second content copy is ever created.

Printability is untouched: `/print` (stacked sheets) and `/book` (flip) keep
rendering the SAME `GuideDocument` + `BUILT`. The reader is a **third frame** over
the same source — exactly the "one manifest, many frames" the manifest comment
already describes.

## Architecture

```
GuideReader.svelte  (the durable 3-pane shell; reusable by the Learn tab now,
                     and the public /guide/level-1 route in Phase 2)
├── GuidePageNav.svelte      left   — manifest-driven page list
├── page stage               center — one page, fit-to-pane (SWAPPABLE FRAME)
└── GuideCompanion.svelte     right  — slide-open live-animation panel
```

### 1. Nav (left) — `GuidePageNav.svelte`

Driven by the **manifest** via `bodyPagesByGroup()`, grouped by `GROUP_TITLES`
(1.0 / 1.1 / 1.2), preceded by three front-matter rows (Cover, Read Me,
Contents). Each row jumps to a page index. Built pages render normally; unbuilt
pages are dimmed with a "soon" tag but remain clickable → they show the existing
`PagePlaceholder` ("In progress"). Active row highlighted. Reuses the existing
manifest helpers — no second page list.

This replaces the current chapter/section `GuideNav` inside the Guide tab
(`GuideNav` + `nav-config.ts` describe the *animated* taxonomy and stay with the
legacy `_sections` routes).

### 2. Page stage (center) — swappable frame

Renders `GuideDocument` (all pages mounted, manifest = SSOT), shows only the
**active** page, scaled to fit its pane. Prev / Next buttons + ← / → keys. The
scaling is the `fit()` math already proven in `/book` (ResizeObserver →
`transform: scale`), factored into a small helper the reader owns.

**Swappable-frame seam:** the reader renders the active page through a
*page-render function* (a Svelte snippet), not hardcoded sheet markup. Today the
only frame is the **sheet frame** (the `GuidePage` sheet, scaled). A future
**flow frame** is a second snippet swapped in by a prop — nav and companion are
untouched. This is the cheap insurance that keeps the reflow endgame a localized
change.

On phones (container width below the shell breakpoint), the nav collapses to a
header page-select and the sheet scales to width.

### 3. Companion (right) — `GuideCompanion.svelte`

Wraps `InlineAnimationPlayer`
(`src/lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte`)
— a standalone, real-animation-engine player with BPM controls. Closed by
default; slides in when a sequence/pictograph on the page is clicked, and
immediately animates it. One motion or a whole strip is uniform (a pictograph IS
a step). Close ✕ or navigating to another page collapses it. The slide is
reduced-motion aware.

### Data flow: click-to-animate

A `setGuideSequenceClick(cb)` context — same pattern as the existing
`setActiveSectionContext` in `guide-data-context.ts` — lets any page hand its
clicked sequence up to the reader with zero prop threading. Page content wraps
each animatable strip/pictograph in a click affordance that calls the context
with its `StepData[]` + start position. The reader converts `StepData[] →
SequenceData` (reusing `ensureMotionData` from
`sequence-viewer/services/sequence-motion-loader`) and feeds the companion.

**Integration risk (nail down in the plan):** the exact `StepData[] →
SequenceData` adapter and `InlineAnimationPlayer`'s prop contract. Everything
else is wiring existing parts.

### Context refactor: split `printMode` from `eager`

`GuidePictograph` currently bundles print STYLE (light, static arrows) and
render TIMING (`eager`, render-all-now) into one `guidePrint` context flag. The
reader wants print *style* but *lazy* timing, so a page hidden with `display:none`
does not paint until shown — keeping the tab light as the manifest grows to 34
pages. Split the context into `printMode` (style, keep) and `eager` (timing).
`/print` and `/book` still set both; the reader sets only `printMode`.

## Content/position separation (forward pressure, not a rewrite)

As each page is wired into the reader (and for every NEW page authored):

- Keep content in structured data (`Type3CrossShiftsPage`'s `PARAS` / `SEQ1` /
  `SEQ2` / `BREAKDOWN` arrays are already 80% there).
- Pull `y` / `fs` / `x` OUT of the content arrays into a separate position hint,
  so content is layout-agnostic and the sheet frame consumes `content + position`
  while a future flow frame consumes `content` alone.

No page is rewritten for this now. It is the authoring convention going forward.

## Build order

- **A. Reader shell** — `GuideReader` + `GuidePageNav` + sheet frame + one-page-
  fit + placeholder for unbuilt. Ships the "faithful pages in the Learn tab with
  a sidebar" win on its own. `GuideTab` becomes a thin host that renders
  `GuideReader`.
- **B. Companion** — `GuideCompanion` (slide-open + `InlineAnimationPlayer`) +
  `setGuideSequenceClick` context + the `StepData[] → SequenceData` adapter +
  per-page click affordances on the built pages that have sequences.

A ships independently of B; if the B adapter hits friction, the nav+page win
still lands.

## Reuse (never-hand-roll justifications)

| Need | Reuse | Why |
|---|---|---|
| Page assembly / order | `GuideDocument` + `BUILT` + `guide-manifest` | Existing SSOT; keeps `/print` `/book` identical |
| One-page fit scaling | `/book` `fit()` math | Proven; factor into a helper |
| Live animation player | `InlineAnimationPlayer` | Standalone, real engine, BPM controls |
| StepData → SequenceData | `ensureMotionData` | Existing motion loader |
| Click → reader handoff | context pattern (`setActiveSectionContext`) | Established in `guide-data-context` |
| Unbuilt page body | `PagePlaceholder` | Already the placeholder |
| Nav grouping | `bodyPagesByGroup()` / `GROUP_TITLES` | Existing manifest helpers |

## Scope / non-goals

- **In:** the Learn-module Guide tab shows the faithful pages via the reader,
  with nav + companion. Public `/guide/level-1/*` animated routes are unchanged
  (they converge onto `GuideReader` in Phase 2, per the ADR).
- **Out (YAGNI):** the flow frame, block-data content model, and any reflow
  machinery. Seams are left open (swappable frame, content/position separation)
  but nothing reflow-specific is built now.
- **Untouched:** `/print`, `/book`, `_sections/*` (legacy web, retire at parity).

## Testing

Per `component-test-discipline` (test-on-fix, don't chase coverage): a unit test
that the nav lists every manifest entry and marks built vs unbuilt correctly; a
smoke check that the reader mounts and swaps pages. Add a component test only if a
real interactive bug is fixed during the build. No broad coverage push.

## Endgame (recorded, not built now)

When the written guide nears completion and IF mobile reflow earns its slot:
migrate page content OUT of pt-layout INTO per-page block data (content +
optional position hints), then render it via the existing sheet frame (print) AND
a new flow frame (mobile). The `GuideReader` shell — nav, companion, click-to-
animate — is reused unchanged; only the center frame swaps. There is never a
second authored layout or a second content copy.
