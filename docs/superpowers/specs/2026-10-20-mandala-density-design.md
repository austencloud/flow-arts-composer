# Mandala density: sort the library by how a mandala looks

Austen, 2026-10-20, looking at the strip under a shifting mandala: "the words
don't give away what the mandala is ... the only thing that we can really
think about is density, like how many lines, what percentage of the canvas is
covered". A sequence with no turns and the same sequence with turns share a
word and draw different mandalas; the word is the wrong handle for picking by
look.

This is stage 1 of two. Stage 2 (its own spec) makes mandalas the top level of
Browse: a grid of distinct mandalas sparse to dense, each opening the
sequences that draw it. Stage 1 gives it the two numbers it needs, coverage
and identity, and puts a Mandala sort everywhere Browse sorts today.

## The measure

`src/lib/shared/mandala/services/mandala-density.ts`

- `mandalaSignature(paths: MandalaPaths): { coverage: number; key: string }`,
  with `mandalaCoverage` and `mandalaKey` as the two halves.
- The geometry is dropped onto a 48 by 48 grid spanning the square the still
  is drawn in (`resolveMandalaRenderExtent` at the standard tip reach, both
  hands). Each hand's traced points (`SVGPathData.beats`, or the end points of
  the path's curve commands when a path carries no beats) are walked in
  half-cell steps so a segment never skips a cell, and every cell the line
  passes through is marked.
- Coverage is marked cells over all cells, 0 to 1. Overlap counts once: a word
  that retraces the same petals four times scores as sparse as it looks.
  Empty geometry scores 0.
- The key is a 32-bit FNV-1a hash of the grid bytes with the marked count
  appended. Two sequences whose stills land on the same cells share a key,
  whatever their words. Stage 2 groups by it.
- Measured once per geometry object (a `WeakMap`), like the renderer's extent.

## Per sequence

`src/lib/shared/browse/services/sequence-density.ts`

- `resolveMandalaSignature(sequence)` runs the existing geometry
  (`calculate(sequence.steps)`) and measures it; `resolveMandalaDensity`
  returns the coverage. No steps means coverage 0 and an empty key.
- Cached by sequence id, word and step count, bounded at 4000 entries, so a
  sort pass measures each sequence once and a later pass pays nothing.
- Bands for sections: `DENSITY_BANDS`, three thresholds set from the showcase
  distribution and kept as constants; `densityBandOf(coverage)` picks one.
  The adjective sits on the mandala, never on the sequence: a sequence is not
  sparse, its mandala is. So the bands read "Sparse mandala", "Medium
  mandala" and "Dense mandala", the sort is called Mandala, and there is no
  1 to 10 scale, which would clash with Level and overstate the precision
  (Austen, 2026-10-20).

## Browse

- `BrowseSortMethod.DENSITY = "density"`. The sorter orders sparse to dense;
  the engine's direction toggle flips it as for every sort. Section key is the
  band.
- `SectionGroupBy` gains `"density"`; the engine maps the sort to it so the
  left index follows the sort. The section manager groups by band, titles a
  section "Sparse (12 sequences)", orders bands sparse, medium, dense, and
  sorts inside a band sparse to dense.
- Both sort menus (`BrowseToolbar`, `SortPopover`) offer Mandala with the
  `fa-dharmachakra` icon. Labels `browse_ui_mandala` and
  `browse_sort_mandala` in all eleven message files.
- The section index sidebar shows the band as its adjective.
- The Studio's sequence picker gets the sort through the Browse panel; no
  change of its own.

## Test page

`/test/shifting-mandala` orders its showcase chips sparse to dense. Each
chip's title and accessible name carry the coverage as a percentage.

## Tests

- Density: coverage in [0, 1]; a two-hand four-beat circle outranks a
  one-hand one; the same geometry twice gives one key and different geometry
  another; empty geometry is 0 with an empty key; the beats-less fallback
  reads a path's `d`.
- Sorter: density order and band keys.
- Section manager: density grouping, titles and band order.
- The existing gates (`check:fast`, the full `wt:finish` check).

## Not in this stage

The mandala grid at the top of Browse, mandala thumbnails in cards, grouping
sequences by key in the UI, any change to how the Studio Sequences tool lists
its rows.
