# Header badge fit: LOOP badge without a box, pattern glyphs hug their badges

Date: 2026-10-25. Status: approved by Austen after his look at the landing
hero at 1440 wide.

## What Austen saw

1. **The LOOP badge sits in a grey box.** At the header's top right,
   `.loop-icon-badge` in `WordHeader.svelte` draws
   `padding: 2px 4px; background: rgba(0, 0, 0, 0.3); border-radius: 4px`,
   with a dark-mode variant on a 10% white background. He wants the icons
   shown directly on the header, no box.

2. **The reversal glyph sits farther from its badge than the turn glyph.** The
   dot pairs beside the LOOP badge read noticeably farther away than the bar
   pairs beside the difficulty badge. Measured: both `.pattern-glyph` boxes are
   10 glyph units wide (56.7 px there) with their content centred, and each box
   is 4 px (`patternGap`) from its badge. The difference is the content: a
   period-1 reversal pattern draws one 1.8-unit column in the middle of a
   10-unit box, so about 4 units of empty box separate the dots from the badge,
   while the turn pattern in that roll filled most of its box.

## Design

### A. Badge without a box

`.loop-icon-badge` keeps its absolute placement, flex centring and
`height: var(--badge-size)`, and loses `padding`, `background` and
`border-radius`. The `.word-header.dark-mode .loop-icon-badge` rule is deleted.
Nothing else about the icon strip changes. `loopBadgeWidth` is already
measured with `bind:clientWidth`, so the word's reserved space and the reversal
glyph's `right` offset follow the narrower badge on their own.

### B. Glyph boxes size to their content

`.pattern-glyph` becomes
`width: fit-content; max-width: calc(var(--glyph-unit) * 10)`, keeping its
height, flex centring and `--glyph-unit`. With content-sized boxes the 4 px
`patternGap` is the real visual distance between a glyph and its badge on both
sides.

`ReversalPatternGlyph` and `TurnPatternGlyph` size every mark from
`--glyph-unit` and their own props (`maxWidthCqi` is a number of glyph units,
not a measurement of the box), so a content-sized box cannot change what they
draw; the 10-unit cap only bounds them.

Because the boxes no longer have a known width, each is measured
(`turnGlyphWidth`, `reversalGlyphWidth` via `bind:clientWidth`), and
`leftIndicatorWidth` / `rightIndicatorWidth` use the measured width in place of
`patternWidth`, falling back to `patternWidth` while a measurement is still 0
(the first frame, before layout). `patternsFit` stays on the conservative
`patternWidth`: a measured width exists only once the glyph is shown, so
deciding on it would flicker the glyph as it is measured. The glyph
`style:left` / `style:right` offsets are unchanged; they depend on the badge
widths, not the glyph widths.

The baked card and export painters in `packages/render-composition` are a
different owner and stay untouched. No other host changes.

## Testing

- The header's existing tests, as a guard on the word-header helpers (there is
  no new logic to unit-test):
  `pnpm vitest run --config tests/config/vitest.config.ts src/lib/shared/animation-engine`.
- `npm run check:fast` and Prettier on the touched files.
- Reviewer's browser check after integration, on the landing hero at 1440
  wide: the LOOP icons sit on the header with no box, and the reversal dots sit
  as close to the LOOP badge as the turn bars sit to the level badge.
