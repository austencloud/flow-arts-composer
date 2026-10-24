# Beat column highlight in the header pattern glyphs

Date: 2026-10-23. Approved by Austen in chat ("Same as the letters").

## Problem

The animation header shows three readings of one sequence: the turn pattern
glyph on the left (a bar pair per beat), the word in the middle, and the
reversal pattern glyph on the right (a dot pair per beat). During playback the
word marks its current letter (`.letter.active` in `WordHeader.svelte`), but
neither glyph marks the current beat's column. A viewer cannot tell which bars
and which dots belong to the letter that is lit, so the two glyphs read as
static badges instead of as the turn and reversal of what is happening now.

## Design

One rule for all three indicators: while the word is highlighting, everything
that is not the current beat rests dim, and the current beat is full.

### Column index

Both glyphs are period-compressed (`deriveTurnGlyphEntries` keeps
`entries.slice(0, period)`; `deriveReversalGlyphData` reports `period`, and
the header hides a glyph whose period exceeds 8, so the drawn columns always
equal the period). The current column is therefore

```
column = (activeStepNumber - 1) mod period
```

independent of how the word itself is compressed (the word compresses by
repeated segments, the glyphs by their own period; the step number is the
shared clock). Owner: a pure `activeGlyphColumn(activeStepNumber: number |
null, period: number): number | null` in
`src/lib/shared/animation-engine/domain/word-header-highlight.ts`, next to
`activeWordHeaderStep`, which already owns the step-to-highlight arithmetic.
It returns null for a null step, a step below 1, or a period below 1.

### Glyph components

`TurnPatternGlyph.svelte` and `ReversalPatternGlyph.svelte` each gain an
optional prop `activeIndex?: number | null` (default null).

- `null`: no class changes; the glyph renders exactly as today (card backs and
  any non-playing header are unaffected).
- a number: each column (`.bar-group` / `.dot-col`) gets `rest` unless its
  index equals `activeIndex`, which gets `active`.

CSS, mirroring `.letter` in `WordHeader.svelte`:

- `.rest { opacity: var(--glyph-rest-opacity, 0.2) }` — the same resting
  opacity as an inactive letter. `--glyph-rest-opacity` is the one new
  variable; `WordHeader` may set it on `.pattern-glyph` if the browser pass
  shows coloured bars need a higher floor than white letters (0.35 is the
  fallback value to try). Existing `.bar.float` (0.7) and `.dot.empty` (0.4)
  opacities stay; column opacity multiplies them.
- `.active { opacity: 1; filter: drop-shadow(0 0 4px rgba(255,255,255,0.3)) }`
  — the letter's glow at a radius that suits a 4 px bar.
- `transition: opacity var(--duration-fast) var(--ease-standard)` on the
  column, opacity only. The glow snaps, for the reason the `.letter` comment
  gives (this element is restyled on every beat; a tweened filter is a blur
  convolution per frame). Reduced motion is handled by the shared duration
  token the same way the letters are.

### Header wiring

`WordHeader.svelte` passes
`activeIndex={glyphsHighlight ? activeGlyphColumn(activeStepNumber, entries.length) : null}`
to the turn glyph and the same with `reversalGlyph.period` to the reversal
glyph, where `glyphsHighlight = hasActiveHighlighting && animationPhase ===
"idle"`, the gate the letters already use. So the glyphs dim and light at the
same moments as the word, and sit fully lit while a new word is entering.

No host changes: `AnimatorCanvas` (the hero, the players, Learn),
`CardHoverPreviewLayer` and `ViewerHeader` already pass `activeStepNumber`,
so the behaviour lands everywhere the header plays. The canvas painters in
`packages/render-composition` (card backs, exported headers) draw static
headers and are not touched.

### Ownership (never-hand-roll)

Search terms: `activeStepNumber`, `activeLetterIndex`, `TurnPatternGlyph`,
`ReversalPatternGlyph`, `pattern-glyph`, `.letter.active`. Closest owners:
`word-header-highlight.ts` (step math, extended), the two glyph components
(presentation, extended with one prop each), `WordHeader.svelte` (the gate,
reused). No new capability or component.

## Testing

- `word-header-highlight.test.ts`: `activeGlyphColumn` returns 0 for step 1;
  wraps (step 5, period 4 → 0; step 6, period 4 → 1); null for null step,
  step 0, period 0. Silent-bug class: the 1-based step vs 0-based column.
- Reviewer browser pass after integration on the hero (`/`), where the header
  plays continuously: the lit column advances with the letter, repeated
  patterns cycle, and a non-playing header (hover preview before play, viewer
  chrome paused) shows undimmed glyphs. Check the dark hero band and the
  viewer chrome at 1440×900 and 375×667.

## Out of scope

Highlighting in exported video or card-back bitmaps; any change to how the
glyph patterns are derived or sized.
