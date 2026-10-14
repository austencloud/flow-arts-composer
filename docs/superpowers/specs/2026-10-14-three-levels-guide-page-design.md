# Three Ways to Name a Pattern: Guide Page Design

**Date:** 2026-10-14
**Status:** Approved design, not built
**Route:** `/guide/three-levels` (working slug; final slug settles with the page title)

## Why this page exists

Flow artists describe a pattern at three levels, and each serves a different job:

| Level      | Example                                                       | Strength                                                     | Limit                                                               |
| ---------- | ------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------- |
| Name       | Zan's Diamond, chasing the sun, Gage's `1-AA`                 | Fast to say and remember                                     | Encodes no structure; names cannot be compared, varied, or combined |
| TKA word   | `KEC KEC KEC KEC`                                             | Dense enough to show a whole pattern's structure at a glance | An abstraction: each letter must be learned once                    |
| VTG detail | Split, opposite · blue 1:3 antispin against red 1:1 extension | Complete and checkable                                       | Too long to read a whole pattern's shape from                       |

Austen's thesis: names you remember, VTG you verify, letters you think with.
Only the middle level is condensed enough to reason about whole sequences built
from bottom-level parts. The letters cost a learning step; this page shows what
that step buys.

The page demonstrates the thesis with real data rather than arguing it. Its
audience includes outside integrators, starting with Duncan, who is adding TKA
letters to his own app.

## Source material

Gage DeMello's Eight Step 12-step CAPs: the 72 base patterns transcribed from
Mentive's SpiroAnim on 2026-08-09 (`docs/research/spiroanim/eightstep-72-base.json`),
already published as the "Gage's 12-step CAPs" collection. Every pattern is
Type 1 (dual-shift), every word is a 3-letter or 6-letter cell repeated, and
each record carries Gage's reference code, the TKA word, and per-beat motion
data for both hands.

Why these instead of Zan's Diamond: they are condensed, all Type 1, and their
repetition is visible in the letters and hidden at the other two levels.

**Credit (required, per `docs/research/spiroanim/README.md`):** patterns by
Gage DeMello; transcribed from Mentive's SpiroAnim; VTG vocabulary from Noel
Yee's Vulcan Tech Gospel.

## Page structure

1. **Opening.** Two or three sentences stating the thesis. Then a player
   showing the selected pattern in motion.
2. **Pattern picker.** Four to six patterns. Credit line in the picker header.
   Selection rule: distinct words, a mix of 3-letter and 6-letter cells,
   starting with `1-AA` (`KEC` ×4) and one 6-letter cell (e.g. `3-AI`,
   `IIDCCJ` ×2).
3. **Three stacked bands** for the selected pattern:
   - **Name:** Gage's reference code, with one line decoding it: column
     (the hands' relationship: Opposite, Same, Quarter Aligned, Quarter
     Opposed), then row (capping prop's spin family against the continual
     prop's). The point it makes: the code is compact but only works inside
     Gage's 72-cell chart, while the word spells any sequence. Links to the
     Eight Step record in the History archive.
   - **Word:** letters grouped into their repeating cells.
   - **VTG:** all 12 beats, one row each.
     Selecting a letter highlights its VTG row; selecting a row highlights its
     letter. This linked highlight is the zoom between levels.
4. **Where letters stop.** One pair of patterns that spell the same word and
   differ only in turns and orientation (`1-AE` and `1-AI` both spell
   `LFA` ×4; `1-EE`, `1-EI`, `1-IE`, `1-II` all spell `JDC` ×4). One sentence:
   turns ride on top of the letters. 72 patterns spell 32 distinct words.
5. **Exits.** Links to the CAPs page, the Codex, and Gage's collection. The
   page does not re-teach CAPs or individual letters
   (one explainer per concept).

The Guide hub gets one new card beside Ratios and Prospin and Inspin.

## VTG band vocabulary

Each row reads: timing, direction, then each hand's hand:prop ratio and spin,
then "hybrid" when the two hands differ. Example shape:
`Split, opposite · blue 1:3 antispin against red 1:1 extension (hybrid)`.

- **Timing and direction come from TKA's letter canon** (`TYPE1_ROTATION` in
  `@tka/domain`, the source the Atlas letter descriptions already use), not
  from the transcription's per-beat `timing` field. That field disagrees with
  the canon for the six letters that move between split and together positions
  (D, E, F, J, K, L): the same letter is labelled `split` on one beat and `tog`
  on another. The page must not publish that conflict.
- **Per-hand spin** comes from the transcription's motion data (extension,
  inspin, outspin, antispin per the README mapping table).
- **Ratios** come from the conversion the Ratios guide page already uses. No
  new ratio math. Every ratio shown is checked against that conversion.

## Build

- **Data module:** a pure function that takes the chosen references from the
  72-pattern file and returns, per pattern: reference, word, cell length, and
  12 VTG row descriptors. Prerendered, like the Atlas descriptions, so domain
  data stays server-side. Nothing per-pattern is hand-written.
- **Page:** a route under `src/routes/(public)/guide/`, composed from the
  existing sequence player and pictograph components. No new shared
  components unless the canonical-capabilities search finds no owner.
- **Copy:** localized through the existing message files, reviewed with
  ai-bust.

## Verification

- Unit test: for each shown pattern, the word's letters and the VTG rows agree
  beat for beat, and every row's timing and direction match `TYPE1_ROTATION`
  for that letter.
- Unit test: every ratio matches the Ratios page conversion.
- Browser: the new route at phone and desktop widths, the linked highlight in
  both directions, and the credit line visible.
- ai-bust pass on the page copy.

## Out of scope

- Other notations' names (Siteswap, folk names beyond the opening line).
- A Learn lesson or quiz.
- Changes to Gage's collection or the transcription file. The `timing` field
  conflict is recorded here and in the research notes, not fixed in the data.

## Known issue to record

`eightstep-72-base.json` per-beat `timing` disagrees with `TYPE1_ROTATION` for
D, E, F, J, K, L. Add a note to `docs/research/spiroanim/README.md` when the
page is built.
