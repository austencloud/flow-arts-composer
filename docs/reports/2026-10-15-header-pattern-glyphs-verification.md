# Animation header pattern glyphs: acceptance evidence

Date: 2026-10-15

The [header glyph spec](../superpowers/specs/shipped/2026-06-04-header-pattern-glyphs-design.md)
is implemented in local main. Implementation commits are `072cec902d`,
`5bf24edd7e`, and `ce2f40e4c7`. No push or deployment was performed.

## Delivered behavior

Turn bars and reversal dots now appear in animation headers, gallery hover
headers, the expanded viewer title, and video headers. Shared domain functions
derive complete repeating periods. Each indicator is omitted independently when
its period exceeds eight. Narrow headers and long words give priority to the
word. Float turns retain their hatched bars.

Svelte components and Canvas2D painters share geometry through
`packages/render-composition/src/pattern-glyphs.ts`. Card-back defaults and static
image export options remain unchanged. The viewer word action keeps its existing
name and tooltip and exposes pattern information through an accessible description.

## Automated checks

| Check                                                       | Result                   |
| ----------------------------------------------------------- | ------------------------ |
| Focused domain and card tests, seven files                  | 64 passed                |
| Render-composition package tests                            | 26 passed                |
| App bitmap and export tests                                 | 17 passed                |
| Render-composition TypeScript check with Node ambient types | Passed                   |
| Guarded integration Svelte checks                           | Zero errors and warnings |
| Changed Svelte component compile gates                      | Passed                   |
| Focused formatting and Git whitespace checks                | Passed                   |

Regression coverage includes raw reversal signatures, exact repeating periods,
independent period caps, empty sequences, floats, and the previous card painter
operations. Browser Canvas2D comparisons also found zero different RGBA channels
for numeric turns, floats, eight turn pairs, and reversal periods 1, 4, and 8.

## Browser acceptance

Inspected the actual expanded sequence viewer at
`https://localhost:5173/create/construct`, using an isolated local draft.
The title bar was visible and the document had no horizontal overflow in every
tier. The word and pattern glyphs never overlapped.

| CSS viewport | Title width | Visible pattern glyphs |
| ------------ | ----------: | ---------------------: |
| 375 × 667    |    42.50 px |                      0 |
| 960 × 412    |   141.56 px |                      0 |
| 820 × 1180   |   114.96 px |                      0 |
| 1440 × 900   |   219.17 px |                      2 |
| 1920 × 1080  |   219.17 px |                      2 |
| 2560 × 1440  |   219.17 px |                      2 |
| 3840 × 2160  |   219.17 px |                      2 |

The desktop patterns occupy 33.33 × 20 px each. Smaller title slots omit the
patterns. Their omission preserves the existing word size and action layout.
Screenshot and geometry records are in
`.artifacts/header-pattern-glyphs/viewer-*.webp` and `viewport-results.json`.

Fixtures mounted the actual WordHeader component through Vite. Light and dark
headers showed floats and complete four/eight-entry patterns. A 280 px canvas
header omitted its glyphs. At a 317 px container width, a long word omitted both
glyphs; short words retained them. Empty sequences and nine-step aperiodic
signatures produced no glyphs. See
[mobile fixtures](../../.artifacts/header-pattern-glyphs/fixtures-mobile.webp).

Viewer-title fixtures also showed all eight turn pairs and reversal columns in
a 219 px title slot. Long words and a 179 px title slot omitted the patterns.
See [viewer-title fixtures](../../.artifacts/header-pattern-glyphs/fixtures-chrome.webp).

The visual pass checks composition and geometry. It makes no claim about
detecting AI authorship.

## Card-back regression

The original [card montage](../../.artifacts/header-pattern-glyphs/card-back-before-after.png)
is **withdrawn as visual acceptance evidence**. It used an incomplete, synthetic
one-step TEST sequence and built the card at 822 × 1122 with 36 px bleed. The
production card-back builder expects 1644 × 2244 with 72 px bleed: its brand
and URL bitmaps are rasterized at a fixed 1644 px card width. Drawing those
bitmaps into the undersized card clipped and enlarged the title. The synthetic
step also lacked the locations, orientations, and placements needed for a
representative mandala, leaving an uninformative circle.

The [original comparison data](../../.artifacts/header-pattern-glyphs/card-back-regression.json)
remain valid only for their narrow claim: replacing the turn and reversal
bitmaps with drawings from the pre-feature formulas changed zero RGBA channels
within that same malformed BackJob. Independent browser Canvas2D glyph painter
comparisons are noted above.

A corrected render used the app's 16-step
[`demo-sequence.json`](../../src/lib/shared/landing/data/demo-sequence.json),
hydrated before building the cosmic-theme card at 1644 × 2244 with 72 px bleed,
staff props on both hands, and no custom prop colors. Browser inspection found
the title inside the card, a complete mandala, both corner glyphs, the start
placement pictograph, URL, and step count. The
[representative card](../../.artifacts/header-pattern-glyphs/card-back-representative.png)
and [browser view](../../.artifacts/header-pattern-glyphs/card-back-corrected-browser.jpg)
replace the withdrawn montage for visual inspection.

The same production-sized BackJob was painted twice, replacing only the turn
and reversal bitmaps with the exact pre-feature painter formulas for the second
paint. The [corrected comparison](../../.artifacts/header-pattern-glyphs/card-back-corrected-comparison.png)
found **zero changed pixels across 3,689,136 pixels**, zero changed RGBA channels,
and a maximum channel difference of zero. See
[comparison data](../../.artifacts/header-pattern-glyphs/card-back-corrected-regression.json).
This isolates glyph painter output in a representative complete card; it does
not execute the entire previous commit in a separate runtime.

## Encoded video

The actual `renderWordHeaderToCanvas` and `VideoExporter` services produced an
H.264 MP4 using `WebCodecsVideoEncoder`: 640 × 480, eight frames at eight fps,
one second, 11,959 bytes. Decoded light and dark frames show four turn pairs,
float hatching, and all eight reversal columns without truncation or overlap.

Artifacts:
[MP4](../../.artifacts/header-pattern-glyphs/video-fixture.mp4) and
[decoded frames](../../.artifacts/header-pattern-glyphs/video-decoded-frames.png).

The guest export UI requires sign-in. The test exercised the application renderer
and encoder directly; it did not exercise an authenticated UI export or mutate
an account.
