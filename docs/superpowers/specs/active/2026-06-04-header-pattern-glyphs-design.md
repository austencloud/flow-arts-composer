---
status: active
value: 3
effort: M
remaining: "Verify shared turn/reversal glyph primitives, WordHeader data projection, and video-export parity against current AnimatorCanvas before implementing gaps."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Turn + Reversal Pattern Glyphs in the Animation Header — Design

**Date:** 2026-06-04
**Status:** Specced, not started

## Problem

The choreo card back puts two dense, instantly-readable identity glyphs in its
top corners (`CardBack.svelte:122-133`):

- **Top-left:** `TurnPatternGlyph` — a tiny per-step bar chart of blue/red turn
  values, period-compressed to the minimum repeating unit, with hatched bars
  for floats.
- **Top-right:** `ReversalPatternGlyph` — dot-pair columns encoding the
  reversal pattern (P = both reversed, R = red only, B = blue only, - = none).

The animation canvas header (`WordHeader.svelte`) puts much thinner
information in the same corners: a `DifficultyBadge` (left) and a
`LOOPIconStrip` (right). Austen's observation: the card-back glyphs are *more
informative* than what the header currently shows. The header should carry
them too — turn glyph next to the difficulty badge, reversal glyph next to
the loop icons.

## Grep evidence (per never-hand-roll)

Nothing needs to be invented. Everything exists; the work is relocation,
parameterization, and wiring:

- Glyph components: `src/lib/features/choreo-card/components/card-back/TurnPatternGlyph.svelte`, `ReversalPatternGlyph.svelte` (each <90 lines, zero feature-specific deps — only CSS vars).
- Turn data derivation: `deriveTurnGlyphEntries` + `detectPeriod` — currently **module-private** in `card-back/card-back-data.ts:577-613`.
- Reversal data: `stepToReversalSymbol` (exported) in `choreo-card/domain/reversal-matcher.ts`; pattern defs in `choreo-card/domain/reversal-patterns.ts`. Both depend only on shared `StepData`.
- Header corners: `WordHeader.svelte:191-195` (badge-wrapper, left) and `:230-241` (loop-icon-badge, right), both absolutely positioned.
- Data source: `AnimatorCanvas.svelte:354-384` already derives `computedDifficultyLevel` and `loopDisplay` from its `sequenceData` prop — the glyph data derives at the same spot.
- Export header: `renderWordHeaderToCanvas` (`compose/services/canvas-renderer.ts:111`) → `renderHeader` in `@tka/render-composition` already mirrors difficulty badge + loop icons for video export.
- Other glyph importers (paths to update on move): `card-back/rasterize-node.ts`, `card-back/card-back-bitmaps-percard.ts`, `card-back-job-builder.test.ts`, `CardBack.svelte`.
- `reversal-patterns`/`reversal-matcher` importers (9 feature files): `deck-variation.ts`, `reversal-transform.ts`, `catalog-membership.ts`, `card-back-data.ts`, `TnDReversalStrip/Grid`, `LoopReversalGrid`, `CatalogCard`, `ReversalPatternCard`. Note `shared/create/domain/rhythm/rhythm-catalog.ts` already mirrors these pattern ids in comments ("ids intentionally match the reversal pattern ids in choreo-card/domain/reversal-patterns.ts") — the data is cross-feature in practice already.

## Design

### 1. Promote the primitives to shared (layering fix)

`WordHeader` lives in `shared/animation-engine`; it cannot import from
`features/choreo-card`. Two options considered:

- **(A) Move the files to shared.** The glyphs and reversal domain modules
  depend only on shared types (`StepData`) and CSS vars. Mechanical import
  updates at the call sites listed above.
- **(B) Registration seam** like `shared/loop-labeler/get-loop-display-resolver.ts`
  (bootstrap-time injection to avoid shared→features imports).

**Decision: (A).** The seam pattern exists for code with genuine feature
dependencies (the loop resolver pulls in the sequence engine). Reversal
patterns and turn-glyph derivation are pure domain data/functions over
`StepData` — they were never choreo-card-specific (rhythm-catalog already
mirrors their ids). A seam would be indirection with no payoff.

Moves:

| From | To |
|---|---|
| `features/choreo-card/domain/reversal-patterns.ts` | `shared/foundation/domain/sequence-patterns/reversal-patterns.ts` |
| `features/choreo-card/domain/reversal-matcher.ts` | `shared/foundation/domain/sequence-patterns/reversal-matcher.ts` |
| `deriveTurnGlyphEntries` + `detectPeriod` + `TurnGlyphEntry` (extracted from `card-back-data.ts`) | `shared/foundation/domain/sequence-patterns/turn-pattern.ts` |
| `card-back/TurnPatternGlyph.svelte` | `shared/components/TurnPatternGlyph.svelte` (beside `DifficultyBadge.svelte`, `LOOPIconStrip.svelte`) |
| `card-back/ReversalPatternGlyph.svelte` | `shared/components/ReversalPatternGlyph.svelte` |

`reversal-transform.ts` stays in choreo-card (deck generation concern), just
updates its import. No barrel files, no re-export shims — update every import
site (code-style rule).

### 2. Unit-parameterize the glyphs (sizing fix)

Both glyphs hardcode `cqi` units, sized against the *card* container. Inside
the header the nearest container is the animation panel — `1.8cqi` dots would
scale with panel width, not with the badge row.

Fix: replace every `Xcqi` in both components with
`calc(var(--glyph-unit, 1cqi) * X)`. Card back renders unchanged (default
preserves current output, including worker rasterization). The header sets
`--glyph-unit` to a px-based value scaled to match the badge height
(`clamp(24px, 7cqw, 34px)` → roughly `--glyph-unit: clamp(1.2px, 0.35cqw, 1.7px)`;
exact value tuned visually at implementation). `TurnPatternGlyph`'s inline
`style="height: {barHeight(...)}cqi"` becomes
`style="height: calc(var(--glyph-unit, 1cqi) * {barHeight(...)})"`.

The `empty` dot color in `ReversalPatternGlyph` falls back to
`rgba(255,255,255,0.18)` — invisible on the light header. Both components get
the muted color routed through a var the host sets per `darkMode`
(`--glyph-muted`), defaulting to the current card-back value.

### 3. Derive glyph data in AnimatorCanvas, display in WordHeader

`WordHeader` stays a dumb display layer. `AnimatorCanvas` adds two deriveds
next to `computedDifficultyLevel`:

- `computedTurnGlyphEntries = deriveTurnGlyphEntries(sequenceData)` —
  **with a period cap** (see below).
- `computedReversalGlyph = deriveReversalGlyphData(sequenceData.steps)` — new
  function in `sequence-patterns/`: map steps through `stepToReversalSymbol`,
  period-compress with the same `detectPeriod` logic, return
  `{ sequence, period } | null`.

**Period cap (new behavior, header-only concern):** card backs only ever show
deck sequences with small periods. Arbitrary viewer sequences may be
aperiodic — `detectPeriod` then returns the full step count, and a 16-column
glyph in a corner is unreadable, while truncating it would *lie* about the
pattern. Rule: **if the detected period > 8, return null and render no
glyph.** An absent glyph is honest; a cropped one isn't. (Card back keeps its
existing uncapped call sites — deck enumeration guarantees small periods
there.)

**Raw signature, not pattern matching:** the card back routes reversals
through `matchReversalPatternId` (15 known deck patterns, falls back to
"continuous"). The header shows arbitrary sequences, so it derives the raw
per-beat signature directly instead — true for any sequence, and identical
output to the card back for sequences that do match a known pattern.

`WordHeader` new props: `turnGlyphEntries?: TurnGlyphEntry[] | null`,
`reversalGlyph?: { sequence: string; period: number } | null`.

### 4. Header layout

- `.badge-wrapper` (left) becomes a flex row: `DifficultyBadge` then
  `TurnPatternGlyph`, gap ~`clamp(4px, 1.5cqw, 8px)`.
- `.loop-icon-badge` (right) becomes a flex row: `ReversalPatternGlyph` then
  `LOOPIconStrip` (glyph inboard, icons stay flush to the corner — mirrors the
  left side where the badge stays flush).
- Both glyphs sit in fixed-height boxes matching the badge height
  (bottom-aligned bars, centered dots) so the corner rows have stable
  geometry. Corners are absolutely positioned, so glyph width never moves the
  centered word (no-layout-shift: satisfied structurally).
- **Overlap guard:** wide glyphs + long words can collide on narrow panels.
  Hide both glyphs below a container width threshold (~300px) via
  `@container` query — the header already sizes with `cqw`, so a query
  container exists in the ancestry (verify the exact container at
  implementation; add `container-type` to `.header-slot` in AnimatorCanvas if
  needed).
- a11y: each glyph wrapper gets `role="img"` + `aria-label`/`title`
  (e.g. "Turn pattern: 1-2", "Reversal pattern: RBRB") reusing
  `deriveTurnLabel` (extract it to `turn-pattern.ts` alongside the entries
  derivation).

### 5. Phase 2 — video export parity

Video export redraws the header on canvas (`renderHeader` in
`@tka/render-composition`, fed by `export-frame-compositor.ts` /
`video-export-orchestrator.ts`) and currently mirrors badge + loop icons.
After Phase 1 the in-app header and exported header drift.

Phase 2 adds the two glyphs to `renderHeader`: both are trivial canvas
primitives (filled rects for bars, arcs for dots — no images, no fonts), drawn
from the same `TurnGlyphEntry[]` / signature data plumbed through the existing
options object (`canvas-renderer.ts:397-400` already carries
`difficultyLevel`/`loopComponents` the same way).

Shippable boundary: Phase 1 can ship alone (exported videos simply keep
today's header), but Phase 2 should follow in the same effort — pixel parity
between live header and export header is an existing invariant of that
pipeline.

### Explicitly out of scope

- **Static image export header** (`card-front-assembler.ts`): choreo card
  fronts deliberately keep corners clean (glyphs live on the card back), and
  the image-export header is shared with that pipeline. Not touched.
- **Per-element visibility toggles** for the glyphs (the animation visibility
  manager has per-layer keys): the glyphs ride the existing `wordHeader`
  visibility, same as the difficulty badge and loop icons do today. Add a
  dedicated toggle only if Austen asks after seeing it.
- **Card back**: rendering unchanged (default `--glyph-unit: 1cqi` preserves
  output byte-for-byte in DOM and worker rasterization paths).

## Verification plan

1. `npm run check` green after the moves (import-path sweep).
2. Existing `card-back-job-builder.test.ts` still passes (worker glyph path).
3. Visual: header on a deck sequence (small period — glyphs shown), an
   aperiodic sequence (glyphs hidden), light + dark mode, narrow panel
   (container query hides glyphs). Screenshot evidence per
   verification-protocol.
4. Card back regression: render one card back before/after and diff —
   must be identical.
5. Phase 2: export a video, single frame extracted, header visually matches
   the live header.

## Open questions (tune at implementation, not blockers)

- Exact `--glyph-unit` value for the header (visual tuning against badge height).
- Whether the period cap should be 8 (matches `ReversalPatternGlyph`'s
  existing internal cap) or slightly lower for the tighter header corners.
