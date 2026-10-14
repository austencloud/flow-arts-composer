# /notation/loops — Implementation Plan

**Spec (authority):** `docs/superpowers/specs/2026-07-19-notation-loops-destination-design.md`
**Date:** 2026-07-19

Executors: re-read the spec at the start of your task. The spec is authority over this
plan; this plan is authority over your memory. Prove completion with tool output. Commit
with explicit pathspec only (`git commit -m "..." -- <your files>`). Never `git add -A`.

## Ledger

- [x] A1 Front doors: shape-matrix launchpad tile + NAV entry
- [x] A2 loop-explorer services (generation, verification, relations, explanation)
- [x] A3 Verification harness script + curated seed pool
- [x] B1 loop-explorer components (picker, showcase, explanation pane, linking)
- [x] C1 /notation/loops page assembly + front doors for loops
- [x] V  Full typecheck + build + contract greps

## Task A1 — Shape-matrix front doors (independent)

Files: `src/lib/shared/landing/components/launchpad/launchpad-tiles.ts`,
`src/lib/shared/landing/components/SiteHeader.svelte`.

1. Read both files + 2-3 existing tile entries to match idiom exactly.
2. Add a Shape Matrix tile to `LAUNCHPAD_TILES` → `/notation/shape-matrix`. Copy in
   fire-jam voice (state what it does; no superlatives). Pick span/color consistent with
   neighboring tiles; icon consistent with existing icon usage.
3. Add Shape Matrix entry to the `NAV` const (Notation group; read how existing grouped
   entries are shaped).
4. Verify `sitemap.xml/+server.ts` already lists `notation/shape-matrix` (agent report says
   yes — confirm, don't duplicate).
5. Evidence: show the diff hunks. No full svelte-check (final verifier owns it); run
   nothing heavier than a targeted read-back.

## Task A2 — loop-explorer services (the hard one)

New module `src/lib/shared/loop-explorer/` (mirrors `src/lib/shared/shape-matrix/`
structure: `domain/`, `services/`, `components/` — A2 owns domain+services).

1. **Investigate first** (do not invent): how the create module generates a circular/LOOP
   sequence end-to-end. Start: `src/lib/shared/create/utils/config-mapper.ts` (calls
   `resolveLoopConfig`), `src/lib/shared/create/services/loop-type-utils.ts` (SSOT:
   `IMPLEMENTED_COMBOS`, `generateLOOPType`, `resolveLoopConfig`, `expanderMultiplier`),
   and the circular generation orchestrator under
   `src/lib/features/create/generate/` (find the service the generate tab actually calls).
   Reuse that path. NEVER hand-build loop `GenerationOptions` (rule: loop length
   invariance).
2. `services/explorer-generator.ts`: `generateVerifiedExample(components, slice)` —
   generate via the canonical path, run the canonical detector
   (`src/lib/shared/create/services/loop-detector.ts`), accept only exact component-set
   match, retry ≤3, then fall back to curated pool (`domain/curated-seeds.ts` — start with
   a small hand-verified stub; A3's harness output replaces it).
3. `services/relation-extractor.ts`: expose the engine detector's pair-relation output as
   `{ beatA, beatB, transform }[]` for a given sequence. Investigate
   `packages/sequence-engine/src/loop/detection/` for what's exported; if the tuples
   aren't exported from the engine's public API, extend the engine's exports (small,
   additive) rather than re-deriving relations app-side.
4. `services/explanation-builder.ts`: structured explanation — intro sentence (what the
   selection means), relation citations referencing beat indices, closing length math
   (`seed × multiplier = length`, using `expanderMultiplier`). Build ON
   `loop-explanation-text-generator.ts` / `choreo-card/services/loop-explainer.ts` — read
   both first; extract/share, don't fork. Terminology guard: 180°/90°/halved/quartered,
   never "turns" for slices.
5. `domain/legality.ts`: selection → legal/illegal + reason string, wrapping
   `IMPLEMENTED_COMBOS` + `generateLOOPType` + quartered gating (`ROTATED_LOOP_TYPES`).
6. Unit tests (vitest, colocated per repo convention — check how shape-matrix or
   loop-type-utils tests are placed): legality table (FLIPPED/REWOUND solo-only, 16-combo
   family, quartered gating), verified-generation accept/reject path (mock detector),
   explanation terminology guard (no "turn" for slices).
7. Evidence: vitest run output green. Commit scoped to your files.

## Task A3 — Verification harness (independent)

File: `scripts/verify-loop-explorer.mjs` (follow existing `scripts/` idiom — check a
neighbor script for import style; engine is consumable from
`packages/sequence-engine/dist`).

1. Enumerate every implemented combo × legal slice. For each, generate K=25 sequences via
   the same canonical path A2 uses (coordinate: if A2's service isn't landed yet, drive
   the underlying generation + detection directly).
2. For each sequence: run app-side canonical detector AND engine detector; record
   agreement, intended-vs-detected match, failures/crashes (the known
   `mirrored_rotated_swapped` halved end-position crash should surface here — catch,
   record, continue).
3. Emit `scripts/output/loop-explorer-verification-report.md` (per-combo accuracy table)
   + `src/lib/shared/loop-explorer/domain/curated-seeds.json` — verified sequences per
   combo (only exact-match ones), enough for a fallback pool (≥3 per combo where
   achievable).
4. MCP `detect_loop_pattern` cross-check is done by the orchestrator afterward on a
   sample — out of scope for the script.
5. Evidence: run the script, paste the summary table. Commit script + report + seeds
   scoped.

## Task B1 — Components (after A2)

`src/lib/shared/loop-explorer/components/`. Read the styling skill + chip-primitives rule
before writing CSS.

1. `LoopComponentPicker.svelte`: six `FilterChipBase` `mode="toggle"` chips, color-coded
   from `LOOP_COMPONENT_MAP`, illegal-next-selection chips disabled with reason tooltip
   (from `domain/legality.ts`). Slice control (180°/90°) appears only when selection
   contains ROTATED — use `SegmentedControl` for it (exactly-one-active). No layout shift
   when it appears: reserve the slot (`visibility`, not `display`).
2. `ExplorerShowcase.svelte`: sized stage; step grid via `.tka-seq-cell` primitive + the
   shared pictograph renderer (grep `tka-seq-cell` and read a consuming grid first —
   workspace vs viewer grid conventions apply). 16-count → 4×4, 8-count → 4×2. `Crossfade`
   (`fill` mode) on example swap. Reserve aspect before pictographs load (no-layout-shift
   rule). Refresh button = existing button primitive.
3. `ExplanationPane.svelte`: renders `explanation-builder` output; each relation sentence
   is interactive (real `<button>` semantics or equivalent a11y) — hover/click highlights
   the beat pair in the grid; beat click highlights its sentences. Shared highlight state
   in `loop-explorer-state.svelte.ts` (state-management skill: factory + context pattern —
   read the skill before writing).
4. `LoopExplorer.svelte`: composes picker + showcase + pane; desktop two-pane, mobile
   single column (<768), sticky picker. Container queries per styling skill.
5. Word display through `simplifyRepeatedWord`.
6. Component test only if a fix-worthy interaction bug emerges (component-test-discipline:
   no breadth chasing).
7. Evidence: vitest (if any) + `npm run check:fast` output (once, at task end). Commit
   scoped.

## Task C1 — Page assembly + loops front doors (after B1)

1. `src/routes/(public)/notation/loops/+page.svelte`: clone the structural skeleton of
   `notation/shape-matrix/+page.svelte` (Seo, JSON-LD, editorial CSS import) — read it
   first. Sections per spec: hero (LOOP animating on repeat — reuse whatever the
   shape-matrix page / InlineAnimationPlayer uses for live rendering, or a looping
   `LoopExplorer` showcase preset), Explorer (mount `LoopExplorer`), Theorem floor
   (typeset the spec's section-3 content: notation, fixed-point theorem + tables,
   rotation-innermost, beta connector, two-period model — copy in fire-jam voice, tables
   as real `<table>` with horizontal-scroll containers), Lineage/CAPs section (spec 3.5 —
   credits verbatim from spec, parallel-not-parent/child framing), Deck section (card-back
   icon strip decoded, CTA → `/shop/loop-deck` styled as button), Build-your-own CTA.
2. Teaser card on `/notation` hub next to `ShapeMatrixTeaser` — follow its exact pattern.
3. LOOPs launchpad tile in `launchpad-tiles.ts` + NAV entry (A1 landed the Shape Matrix
   ones — match them). Sitemap entry for `notation/loops`.
4. All links clickable/button-styled per clickables-look-like-buttons; no checkboxes; no
   raw chips.
5. Evidence: `npm run check:fast` once + grep-proof: no `type="checkbox"`, no
   `class="chip"` raw buttons, no `"turn"` applied to slices, `simplifyRepeatedWord`
   present where words render. Commit scoped.

## Task V — Final verification

1. ONE full `npm run check > scratchpad/check.log`; grep errors; fix or report.
2. `npm run build:fast`; confirm success.
3. Contract greps across the new files (checkbox/chip/turns/simplifyRepeatedWord as in C1).
4. Report: what is proven (typecheck, build, tests, harness accuracy) vs what needs
   Austen's eyeballs (visual polish, animation feel, copy taste).
