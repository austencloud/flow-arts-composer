---
status: active
value: 2
effort: M
remaining: '1 of 5 tasks shipped (art presets); other 4 deliberately parked by Austen'
depends_on: "external: Austen decision to resume the four parked Fable identity tasks"
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: blocked
---
# Fable Spec — Mandala Signature Identity (THE FACELIFT)

> **DRIFT WARNING — 2026-08-02.** 1 of 5 tasks shipped (art presets); other 4 deliberately parked by Austen
>
> Status lines below predate this check and are left intact deliberately.
> This banner is the current state. Source: `docs/superpowers/handoffs/2026-07-25-spec-triage-ledger.md`.


**Date:** 2026-07-03 · **Autonomy: FULL AUTO to build; CHECKPOINT on aesthetic direction** (present curated palette/composition options — taste is Austen's call) · Index: `2026-07-03-fable-dispatch-index.md`

> The "TKA is beautiful — here's your sequence as art" pillar, and the most *shareable/viral* asset in the codebase. The substrate is shipped and rigorous; the output is correct-and-pleasant but generic-neon. This is the gallery-tier "finally do it properly" facelift for the mandala.

## Problem

Every sequence already deterministically yields a unique mandala glyph, and the finite-alphabet collapse (44,510 sequence refs → **505 distinct glyphs**) is a genuinely deep, tellable math story. But: palettes are all bright-neon-on-black, there are no share-links, no print/poster pipeline, and the collapse story is exposed only on a dev `/test` route. The virality potential is high and almost entirely untapped, and the module is currently buried as a Playground tab (`module-definitions.ts:56-59` aliases `mandala→playground`) rather than presented as a signature experience.

## What's built (verified — substrate is production, not POC)

- **Forward model:** `src/lib/shared/mandala/services/mandala-geometry-calculator.ts` `calculate()` — deterministic headless tip-path tracer (per-motion-type endpoint math for pro/anti/static/dash/float, staff-angle chaining across beats → 0px junctions, adaptive sampling, Catmull-Rom→Bezier).
- **Real surfaces:** choreo **card backs** (`card-back-job-builder.ts`, `CardBack.svelte`), sequence-viewer **breathing pane** (`MandalaPane.svelte` + `mandala-viewer-controller.svelte.ts`), dedicated **Mandala module** (gallery/detail/meditate/export, `MandalaModule.svelte`), guide cover, workspace preview.
- **Decoder lab (shipped 2026-06-22):** `static/data/mandala-index.json` (9.5MB v1) — 44,510 refs / 33,986 distinct seqIds → 505 glyphs, 236 orbits, 107 decks. `mandala-decoder.ts` / `mandala-fingerprint.ts` are pure, visual-only, **color-blind** (`orbitKey` dihedral-group-exact on integer angle buckets — Cartesian rotate-and-requantize is only ~99% invariant, hence the bucketing). `/test/mandala-decoder` renders all 505 glyphs as real mini-mandalas.
- **Rendering:** dual SVG+Canvas renderers, glow, purple-overlap bloom/feather masking, 6 flow palettes + custom (`mandala-palette.ts`), per-path gradients, breathing undulation/spin/depth.
- **Export:** PNG 1x/2x/4x; off-thread H.264 MP4 (`mandala-export.worker.ts`, WebCodecs + WASM fallback).
- **Collection:** Firebase-backed (`firebase-mandala-collection-repository.ts` + localStorage migration in `mandala-collection-state.svelte.ts`).
- **Roadmap:** `docs/superpowers/specs/active/2026-05-25-mandala-roadmap.md` — **only Phase 1 done**; 10 phases unbuilt (trails/afterimage, share links, deeper meditation, formations, phase-chained breathing, audio-reactive, fractal nesting, wallpaper/tessellation, morphing, 3D extrusion).

## The hard parts (why a stronger model helps)

1. **Beauty vs correctness (the taste-heavy core).** The substrate is rigorous and deterministic; the output is "correct and pleasant, generic-neon." Turning that into *genuinely beautiful* — curated palettes, composition, negative space, animation choreography, print-grade color — is the open-ended, taste-heavy work a high-capability model earns its keep on.
2. **Tip-path geometry** for extensions — Phase 10 path-correspondence between different step counts (morphing) and Phase 11 SVG→BufferGeometry extrusion are real geometry problems; small trig errors become visible junction gaps or wrong glyphs.
3. **Inverse decode at scale** — extending `orbitKey` from catalog-exact to nearest-match (Hausdorff/Fréchet) for non-catalog queries + a Firestore-seeded production index (today it's a static 9.5MB JSON).

## Fable's task (the focused "signature identity" facelift — M–L)

1. **Art-grade palette system** — curated, named palettes beyond bright-neon; optional paper/texture/background treatments. Present options to Austen (checkpoint).
2. **Trails / afterimage** (roadmap Phase 2) on the breathing render.
3. **Shareable `tka.run` links** + a social card, so a mandala is one tap to share.
4. **Print/poster export pipeline** — bleed + large-format on top of the existing PNG export.
5. **One hero surface** — present the mandala (and the 44,510→505 story) as a signature experience, not a buried Playground tab.

## Open decisions (left to Fable)

- The aesthetic direction (palettes, texture, composition) — present curated options; Austen picks.
- Which hero surface (a dedicated route? a share-first landing? elevating the module out of Playground).
- How much of the collapse story to surface to users, and where.
- Whether to also chase a higher-value roadmap phase (audio-reactive / formations) in-window, or keep the facelift lean.

## Guardrails + definition of done

- **CHECKPOINT on aesthetics:** present palette/composition options and get Austen's direction before committing a look; taste is his (`show-visuals-not-prose` — show, don't describe).
- Keep the decoder **visual-only / color-blind** (`feedback_mandala_fingerprint_is_visual`) — fingerprinting is geometry, never color.
- Palette + renderer are already clean seams — extend them, don't fork (`never-hand-roll`).
- Reduced-motion coverage on any new animation; no layout shift on the hero surface (`no-layout-shift`).
- Real-world copy for any user-facing text follows the writing guide (no superlatives/em-dashes).
- Commit own changes only, explicit pathspec.

## Dependencies

Independent of the perception/identity work. Alternative net-new facelift considered: **elemental-model visualization** (render the whole alphabet as the 6-element system — rich data in `packages/vtg-domain/src/data/elemental-model.ts` + `src/lib/features/choreo-card/domain/tnd-element.ts`, surfaces today only as a corner `ElementalGlyph.svelte`). Mandala chosen for the bounded window (substrate shipped, higher virality); elemental remains the bolder net-new option if preferred.
