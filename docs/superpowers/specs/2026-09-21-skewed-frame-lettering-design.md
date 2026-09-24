# Skewed-Frame Lettering Design

Date: 2026-09-21. Brainstormed with Austen from the Illustrator guide masters
(see `docs/reference/skew-notation.md` for the source pages).

Amended 2026-09-22 and implemented 2026-09-23: the opposite-direction
families follow the landmark rule in
`docs/superpowers/specs/2026-09-22-multigrid-lettering-design.md`, and
same-letter variants are numbered by start spacing. The frame now has 32
letters, not 38: D E F and J K L no longer occur, and 128 category 3 rows of
`SkewedPictographDataframe.csv` changed letter. The tables below describe the
classifier as implemented.

## Problem

A Rotate 45° fuse puts one hand on the cardinal points and the other on the
intercardinal points for every beat. Those beats live in the skewed frame
(hands 45° apart = eta, 135° apart = zeta). `SkewedPictographDataframe.csv`
only holds beats that *enter* the frame from a pure position; nothing starts
from zeta or eta. `findLetterByMotionConfiguration` therefore returns null for
every skewed beat, and `buildFusedSequence` refuses to save with "Couldn't
identify every fused step." Skewed fuses cannot be kept.

## Decisions

1. **The skewed alphabet is a pure function of the pictograph.** No hidden
   state, no sequence context. A base letter survives skewing when the relation
   that defines it survives; when two base letters collapse onto the same
   skewed pictograph, the one that needs the fewest facts beyond the letter
   wins, preferring facts the app already stores (placement).
2. **Braces mark the skewed span in the stored word.** `A{STS}GA`. Consecutive
   skewed beats share one pair. Braces are part of `sequence.word` (Austen's
   siteswap argument: the word should say from afar that this is one of the
   mixed-frame sequences). Step `letter` stays plain (`S`, `ζ`, `W-`).
3. **One word builder, one strip helper.** Every site that assembles a word
   from steps goes through `deriveWordFromBeats` / `deriveWordStatusFromSteps`.
   Every site that indexes, sorts, or searches a word strips the notation with
   `stripWordNotation`.
4. **The pictograph draws braces around its letter** when the beat is in the
   skewed frame (start or end position is zeta/eta).
5. **The dataframe stays the runtime lookup.** The generator enumerates every
   skewed-frame beat, letters it with the classifier, and appends the rows as
   category 3. `motion-query-handler` needs no change; the option picker gets
   skewed next-beats for free because the rows exist.
6. **No `$` sigil, no modifiers in the word yet** (⁺ ⁻ ‡ ± l f stay in the
   reference doc). Skew *entry* beats keep their existing letters and skew
   columns.

## The skewed alphabet (32 letters)

Blue = left hand, red = right hand. Spacing is the angle between the hands:
eta = 45°, zeta = 135°. A hand "shifts" when it is pro or anti (a 90° arc),
holds when static, and crosses when it dashes (180°).

### Type 1, same direction (both shift the same way): S T U V

Spacing is preserved, so the placement carries wide (zeta→zeta) vs narrow
(eta→eta). A B C G H I have no skewed form: their defining relation (hands
opposite or together) cannot hold in a mixed frame.

| Motions | Letter |
| --- | --- |
| pro + pro | S |
| anti + anti | T |
| pro leads | U |
| anti leads | V |

Leader: the hand that is ahead in the direction of travel by the smaller arc.
Verified against `DiamondPictographDataframe.csv`: every U row's leader is its
pro hand, every V row's leader is its anti hand.

S T U V occur at both spacings, so each is numbered by start spacing,
narrowest first: S1 from eta, S2 from zeta.

### Type 1, opposite direction: M N O, P Q R

Opposite shifts flip the spacing (eta↔zeta) and pass through exactly one pure
position on the way: converging hands meet (cross beta), diverging hands pass
through opposite (cross alpha). The hands never start or end at a pure
position in this frame, so the crossed position alone picks the family, from
either spacing; pro/anti picks the member (pro/pro, anti/anti, hybrid).

| Crosses | Family |
| --- | --- |
| alpha | M N O |
| beta | P Q R |

Numbered like S T U V: M1 from eta, M2 from zeta. This is the landmark rule,
which letters the diamond's gamma starts the same way: every diamond M row
crosses alpha and every P row crosses beta.

The first version of this design split the families by start spacing too:
eta through alpha was D E F and zeta through beta was J K L. Austen reversed
that on 2026-09-22 (decision 4 of the multigrid spec), because D E F and J K L
need the hands exactly together or opposite at an endpoint, which never
happens here.

### Type 2 (shift + static) by start→end spacing

| Start→End | pro | anti |
| --- | --- | --- |
| zeta→zeta | W | X |
| eta→eta | Y | Z |
| zeta→eta | Σ | Δ |
| eta→zeta | Θ | Ω |

### Type 3 (shift + dash)

Austen's thesis: a Type 3 letter is the Type 2 pictograph with a dash arrow on
the formerly static hand. In the standard alphabet that makes `W-` share its
pictograph with Y (gamma→beta plus a dash lands at alpha, which is W's end),
and `Σ-` with Θ. The skewed table applies the same relation:

| Start→End | pro | anti |
| --- | --- | --- |
| eta→zeta | W- | X- |
| zeta→eta | Y- | Z- |
| eta→eta | Σ- | Δ- |
| zeta→zeta | Θ- | Ω- |

### Type 4 (dash + static)

Eta behaves as beta, zeta as alpha. eta→zeta (opening) = Φ, zeta→eta
(closing) = Ψ. No Λ (gamma→gamma has no skewed analogue).

### Type 5 (dual dash)

zeta→zeta = Φ-, eta→eta = Ψ-. No Λ-.

### Type 6 (both static)

ζ at zeta, η at eta. Both already exist in the `Letter` enum with glyphs.

### Count

4 + 6 + 8 + 8 + 2 + 2 + 2 = 32. Every combination of
{pro cw, pro ccw, anti cw, anti ccw, static, dash} per hand over the 32 mixed
start pairs is a valid skewed-frame beat: 32 × 36 = 1152 beats, all lettered.

## Notation

- `{` opens a skewed span, `}` closes it. A span covers consecutive beats whose
  start or end position is zeta/eta. That includes the entry beat (pure start,
  skewed end) and the exit beat (skewed start, pure end). Both-hands-skew beats
  with pure ends (category 2) are not in a span.
- The word is rendered from units `{ letter, skewed }` by
  `renderWordNotation`; `parseWordNotation` inverts it; `stripWordNotation`
  removes the braces. All three live in the app at
  `src/lib/shared/foundation/utils/word-notation.ts` and are re-exported from
  `$lib/shared/foundation/utils/word-simplifier`. They stay out of
  `@tka/render-composition` because `node_modules/@tka/*` are junctions to the
  primary checkout, so a worktree cannot test package edits. The package's
  `splitWordLetterUnits` already drops braces, so it needs no change.
- `simplifyRepeatedWord` works on units, so `{STSSTS}` simplifies to `{STS}`
  and the mirror rule still applies inside a span.
- `isTkaWord` accepts a well-formed braced word (round-trips through
  parse/render, every unit a canonical letter).
- Glyph surfaces (`TKAWordGlyph`, the choreo card header) draw the stripped
  letters. `TKAWordGlyph` adds text braces around the whole row when the entire
  word is one skewed span, which is every rotate-45 fuse. Partial spans render
  without braces on glyph surfaces this round.
- The fused sequence `name`/`displayName` is `fusedDisplayName(word)`, so it
  carries the braces too.

## Code changes

### Classifier (new)

`src/lib/shared/pictograph/skew/skewed-frame-letter.ts` exports
`classifySkewedFrameLetter(beat)`, `skewedFrameLetterLabel(beat)` (the letter
with its variant number, such as S1 or M2), the geometry helpers
`frameSpacing` and `isSkewedFramePair`, and the constant
`SKEWED_FRAME_LETTERS` (the 32). Types 1 to 3 go through the multigrid rule in
`src/lib/shared/pictograph/lettering/multigrid-lettering.ts`, which letters
every grid. Inputs are plain strings so the generator script and the app
share it.

### Skewed-frame predicate (new)

`src/lib/shared/foundation/services/skewed-frame.ts` exports
`isSkewedFrameBeat(left, right)` (start or end position mixed) and
`isSkewedFrameStep(step)` (motions first, then start/end placement prefix
zeta/eta, else false). Dependency-free so `word-deriver.ts` and the renderer
both use it.

### Generator

`scripts/generate-skewed-dataframe.ts` gains `generateSkewedFrameRows()`:
32 start pairs × 6 × 6 hand options, letter from the classifier, placements
from the existing `deriveEndPlacement` map, `timing` = `none`, `direction` =
`same`/`opp` for two shifts else `none`, rotation direction = hand path for
pro and the opposite for anti, `noRotation` for static/dash, skew dirs empty,
hand paths cw/ccw/static/dash, skew steps 0, `category` 3. The CSV grows from
5120 to 6272 rows. A unit test reads the CSV and checks the 1152 rows against
the classifier so the file and the code cannot drift.

### Word builder

`word-deriver.ts`: `deriveWordFromBeats`, `deriveWordStatusFromSteps`,
`deriveWordStatusFromStepPairings`, and the pairing branch of `deriveWord`
render through `renderWordNotation`. Callers routed through
`deriveWordFromBeats`: `letter-deriver.ts`, `fuse-state.buildFusedSequence`
(which also drops its `toUpperCase()`, a Greek-letter corrupter),
`sequence-extender.ts`, `step-data-helpers.updateSequenceWord`,
`rotation-direction-handler.ts`.

### Strip sites

`browse-filter.ts` (starting letter, range, contains), `navigator.ts`
letter section, `kinetic-alphabet-sort.extractBaseLetter` (covers
`pick-representatives`).

### Placement analyzer

`getEndPlacementGroup` learns zeta/eta/tau/terra; `getRotationRelation`
treats zeta and eta as 16-slot groups like gamma. `applyEndPlacementFiltering`
keeps returning true for the new groups through its default branch.

### Pictograph braces

`SkewBraces.svelte` (tka-glyph/components) draws `{` and `}` as SVG text on
either side of the letter image, dash-aware, dark-mode aware, with the same
visibility/preview behaviour as `TKAGlyph`. `PictographRenderer.svelte`
mounts it when `isSkewedFrameBeat(left, right)` and a letter exists. Layout
math lives in `skew-brace-layout.ts` with a unit test.

### Fuse gate

Unchanged. It stays fatal when a letter is genuinely missing; with the new
rows it no longer fires for skewed beats.

## Verification

- `npx tsx scripts/generate-skewed-dataframe.ts` prints category 3 = 1152.
- `npx vitest run --config tests/config/vitest.config.ts` for the touched
  suites, plus `pnpm --filter @tka/render-composition test`.
- `npm run check:fast`.
- Browser: `/create/fuse`, Rotate 45° rule, preview derives a letter for every
  beat, the word/name show braces, pictographs show braces. Save requires a
  signed-in session; the fused-word unit test covers the derivation path with
  the real CSVs.

## Out of scope

- Exit-beat letters for skewed→pure arcs of 45°/135° (the frame's own
  category-1 rows already cover pure→skewed entry).
- Hand swaps inside a span, modifiers (⁺ ⁻ ‡ ± l f) in the word, a `$` sigil.
- Brace glyphs on the canvas card header and partial-span braces in
  `TKAWordGlyph`.
- Generator Level 4 (SKEWED) in the create tab.
