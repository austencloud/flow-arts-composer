---
status: backlog
value: 2
effort: M
remaining: Wait for real merchant product images and Austen's pickup; then decide renders versus photos and verify Sharp before baking.
depends_on: 'external: real merchant product images and Austen pickup'
plan_path: ''
tags: []
last_triaged: '2026-10-07'
work_state: blocked
---

# Merchant Product Image Pipeline (Sharp)

**Date:** 2026-07-17
**Status:** Queued — shelved by Austen until real product images exist; run a fresh
brainstorm at pickup before implementing (this doc captures state + intent, not a
finished design)
**Author:** Austen + Claude

## Problem

Google Merchant Center onboarding got all the way to the product-upload form and
stopped there: the shop has no real, repeatable product images. What exists today:

- `/branding/og-image.png` is the app marketing banner (headline, CTA buttons, FREE
  badge). It fails Merchant Center's no-promotional-overlay image policy, and it is
  also what every shop page's Product schema `image` field points at.
- One-off fan composites were made on 2026-07-16 by hand-driving an in-page canvas
  (see "Stopgap assets" below). They look good but the process lives in a chat
  transcript, not the repo. Not reproducible, doesn't regenerate when decks change.

Austen's direction: shelve Merchant Center product entry until real product images
exist, then "go super live" with a Sharp-based pipeline as the way to produce them.

## Goal (to refine at pickup)

A committed script (`scripts/`) that renders shop/merchant-ready product images from
the canonical card art via Sharp: deck fans, single-card views, per-volume trilogy
images. Rerunnable whenever a deck or cover changes; outputs land somewhere durable
(static/ or Firebase Storage) and the shop pages' Product schema `image` fields point
at them instead of og-image.png.

Open questions for the pickup brainstorm:

1. **Renders vs photographs.** Austen said "actual product images" — physical photos
   of the printed decks may be the real bar for Merchant Center, with rendered fans
   as secondary views. Decide the mix before building.
2. **Source of truth.** Reuse the baked shop covers in Firebase Storage
   (`shop-covers/<productId>/<n>.png`, URLs in Firestore `products/*.coverCards[].imageUrl`),
   or re-render card fronts server-side from sequence data. Baked PNGs are simpler;
   re-render fixes staleness by construction.
3. **Where outputs live** and whether the pipeline also updates the on-page schema
   `image` fields + og:image per product.
4. **Whether the pipeline subsumes the cover bake** (see tka-3 bug below).

## Constraints and known facts

- **Native modules on the C: machine:** pnpm 10 blocks build scripts, which broke
  node-canvas (memory: `reference_canvas_native_broken_c_machine`). Sharp ≥0.33 ships
  prebuilt platform binaries as optional deps with no install script, so it PROBABLY
  works here — verify `pnpm add sharp` + a trivial resize as step one of pickup.
  In-browser canvas (how the stopgaps were made) is the fallback but shouldn't be the
  pipeline.
- **Fan composition parameters that looked right** (from the stopgap session): 5 cards,
  angles [-20, -10, 0, 10, 20] degrees, pivot 500px below the bottom edge, cards drawn
  at 822px wide, canvas 2200x1800, white background, draw order [0,4,1,3,2] so the
  center card lands on top, drop shadow rgba(0,0,0,0.3) blur 40 offsetY 12.
- **LOOP deck card art** is not baked anywhere — the configurator renders card fronts
  in-browser to blob URLs (`renderCoverFront`, `cover-front-renderer.ts`). A server
  pipeline needs either a bake step or sequence-data rendering.
- **Merchant Center account state:** account created, website claimed via the existing
  Search Console verification, LOOP Deck form filled up to images. All confirmed form
  values (ship date 2026-10-01, prices, GTIN=none, SKU slugs, shipping US free /
  Canada $14 / International $25) are recorded in
  `docs/reference/google-merchant-center-setup.md`.

## Bug found while capturing (fix with or before this work)

The baked shop covers for **TKA 3 are byte-identical to TKA 2's** on Firebase Storage
(sha256-verified on `shop-covers/tka-2-writing-words/0.png` vs
`shop-covers/tka-3-speaking-sentences/0.png`, 2026-07-16). TKA 3 should show half-turn
variations. The coverCards reseed (`scripts/reseed-tnd-trilogy-covers.ts`) updated the
sequence data but the PNG bake for tka-3 never reran. The live `/shop/tnd-trilogy`
page shows TKA 2's cards for volume 3 today.

## Stopgap assets (usable now, superseded by the pipeline)

`C:/Users/Austen/Downloads/merchant-images/`: `loop-deck-fan.png`,
`loop-deck-card.png`, `tka-1-learning-letters.png`, `tka-2-writing-words.png`,
`tka-3-speaking-sentences.png` (the tka-3 one inherits the duplicate-bake bug).

## Pickup checklist

- [ ] Brainstorm the open questions above (superpowers:brainstorming)
- [ ] Verify Sharp installs and runs on this machine (pnpm 10 constraint)
- [ ] Decide renders vs photos with Austen
- [ ] Re-bake tka-3 covers (or fold the bake into the pipeline)
- [ ] Build the script; regenerate all product images
- [ ] Point shop Product schema `image` fields (+ og:image) at the new assets
- [ ] Resume Merchant Center product entry
  (`docs/reference/google-merchant-center-setup.md` has every form value)
