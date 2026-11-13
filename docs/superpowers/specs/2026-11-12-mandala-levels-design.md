# By mandala: five complexity levels

Date: 2026-11-12. Supersedes the screens in
`2026-11-11-mandala-wall-design.md` (the wall of families and each family's
page). That spec's engine sections (the index, the worker pool, the climb,
the Mandala sort) still hold.

## Why

Austen: picking a mandala from the wall and then a sequence from its page was
misleading, because one family holds mandalas that look different. He asked
for "a complexity slider", with "several examples of mandalas that would show
up under a given complexity", "a finite number of complexity" levels, and
numbers "based on the actual data".

## The levels

- Six levels by enclosed spaces (`mandalaLevelOf` in `sequence-density.ts`),
  cut at 9, 17, 29, 45 and 77, where the pictures change: bare lines, crosses
  in circles, open petals, layered rosettes, dense rosettes, densest. On the
  2026-11-12 pool (1,578 sequences) that is 81, 203, 170, 166, 469 and 489 per
  level.
- Why not equal shares: the first build used quintiles (18/42/62/82). Asked
  whether ten levels would be better, the pool drawn as ten equal levels showed
  levels 5 to 10 as the same dense rosettes, because most sequences draw busy
  mandalas. Austen picked "Six, by look" over keeping five. Sheets:
  `E:/scratch/mandala-complexity/counts/`.
- The cuts are fixed, so a saved level keeps its meaning as the pool grows.
  Re-measure and move them only on purpose.
- The Mandala filter's value for a level is `level-N`. Any other value is
  still read as a family (saved filters and Smart Collections from before).
- A level filter needs only the index, not the climb, so it settles sooner.
  The grid keeps the person's own sort and sections under it.

## The screen

One fixed frame on Browse's Sequences screen (`?mandala`, or `?mandala=3`
for the slider on level 3), with nothing scrolling:

1. Back, "Mandalas", and a one-line hint.
2. Example mandalas for the level, as many whole rows as fit. They are real
   sequences' mandalas at that level (`levelExamples`: the level's shapes in
   order, cut into runs, each giving its most-drawn shape). They are pictures,
   not buttons, and they crossfade when the level changes.
3. "Complexity 3 of 5 · 308 sequences".
4. A five-stop slider, Simple to Complex.
5. "Show 308 sequences": clears any Mandala filter, applies the level, and
   goes to the grid.

The counts come from the engine's facet pool (`getFacetPool`): the search's
results under every other active filter. So "Show N" is the number the grid
then holds.

## Open for Austen

- Should the Mandala sort's three sections become these five levels?
- Should tapping an example open a sequence that draws it?
