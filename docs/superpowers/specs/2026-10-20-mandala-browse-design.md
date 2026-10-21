# Mandala Browse: pick a mandala, see the sequences that draw it

Austen, 2026-10-20: "the whole browse module could sort by mandala like the
top level view of the browse module could be look at mandalas by complexity
click one that you like and it will show you the sequence or sequences that
create that very mandala because any given mandala could very well be created
by multiple sequences".

Stage 1 (`2026-10-20-mandala-density-design.md`) gave each sequence a
coverage and a key: two sequences whose stills mark the same cells share a
key. Stage 2 puts distinct mandalas in front of the sequences. Decided with
Austen on 2026-10-20: a hero door on the gallery front door, SVG stills, and
idle-slice measuring with a local cache.

## Where it lives

The gallery front door (`GalleryLanding.svelte`) gets a third hero door, By
mandala, after By level and By length. Its subtitle reads "Sparse to dense".
Its art is a fan of three real mandalas from the pool, one sparse, one medium,
one dense, the way the Level door fans three real sequences. The door opens
the mandala screen, a new drill section `"mandala"`, and the filter catalog
offers the same screen as a Mandala tile (primary category, after Length), so
it works in the filter sheet, the desktop rail and the split pane like every
other category. The Studio sequence picker and the other `BrowsePanel` hosts
gain the filter type and show no new door unless they render the landing.

## The mandala screen

`src/lib/features/browse/gallery-home/value-editors/GalleryMandalaEditor.svelte`

- A grid of boxes, one per distinct mandala key, ordered sparse to dense,
  under the three band headings the Mandala sort already uses (Sparse
  mandala, Medium mandala, Dense mandala; `DENSITY_BANDS`). A band with no
  mandalas is left out.
- Each box is pressable: a background, a border, a hover state, the still
  filling it. The count of sequences that draw the mandala sits on the box as
  a small badge. The accessible name reads "Sparse mandala, 24% coverage,
  3 sequences" (one sequence: "1 sequence").
- The heading stays fixed and the grid pans inside its own area
  (`one-screen-per-step`). While the pool is still being measured the heading
  reads "Measuring 212 of 560"; boxes slot into place as their key arrives,
  with the keyed-list owner (`animate:flip`, `in:arrive`, `out:leave`).
- Tapping a box calls `onPickValue(BrowseFilterType.MANDALA, key, label)`
  with the label "Sparse mandala, 24%", and the host does what it does for
  Level: the full grid, or the live results pane on wide screens, shows the
  sequences that draw that mandala. The applied box shows the applied state
  (`aria-pressed`) in builder hosts. From the results the existing card,
  variation picker and detail flow continue unchanged.
- Counts are the number of pool sequences sharing the key (the whole pool,
  not narrowed by other active rules; the applied chip's count is the
  narrowed one, as the grid shows it).

## The still

`src/lib/shared/mandala/components/MandalaStill.svelte`

- Props: `paths: MandalaPaths`, `size: number`, `key: string`. Renders
  `renderMandalaSVG` at the standard reach, both hands, blue and red strokes,
  on the theme's dark or light look, with the stroke weight raised for small
  boxes (the strip's rule: lines read at the figure's weight, not thinner).
- The SVG string is cached per key, size and look in a bounded map, so a
  grid of hundreds renders strings, not geometry.
- The geometry for a key is the geometry of the first sequence measured with
  that key, kept by the index below; the screen never recomputes geometry.

## The index and the measuring

`src/lib/shared/browse/services/mandala-index.svelte.ts`

- `createMandalaIndex()` returns one reactive index: `setPool(sequences)`,
  `progress: { measured, total }`, `done`, `version`, `groups` (sparse to
  dense: `{ key, coverage, band, paths, sequenceIds }`), `keyOf(sequenceId)`
  and `stop()`. The gallery drill owns one for its pool; the engine's filter
  reads the module's current index.
- Measuring runs in idle slices: `requestIdleCallback` with a 100 ms timeout,
  falling back to `requestAnimationFrame` where it is missing (Safari); about
  8 ms of measuring per slice; the loop stops when the pool changes or the
  index is stopped. Each slice calls `resolveMandalaSignature` from stage 1,
  so the stage 1 cache fills as a side effect and the Mandala sort pays
  nothing afterwards.
- Persistence: a new Dexie table `mandalaSignatures` in `tka-database.ts`
  (schema version bump) with rows `{ id, key, coverage, measure }`, where
  `id` is the stage 1 cache key (sequence id, word, step count) and `measure`
  is `MANDALA_MEASURE_VERSION`, a constant bumped whenever the grid size or
  marking rule changes, so old rows are ignored and rewritten. On `setPool`
  the index loads rows for the pool's ids first, seeds the stage 1 cache from
  them, and sends only the rest through the slices. Rows are written in one
  `bulkPut` per slice. A missing IndexedDB (SSR, a private window) is not an
  error: the index measures without a cache.
- Geometry for a cached row is not stored (the paths are large). A group's
  `paths` is computed lazily from its first member when the screen first
  asks for it, through `calculate(steps)` and the stage 1 `WeakMap`, which is
  one geometry per distinct mandala, not per sequence.

## The filter

- `BrowseFilterType.MANDALA = "mandala"`; the value is the key.
- `applyFilter` matches a sequence when `peekMandalaKey(sequence)` equals the
  value. `peekMandalaKey` (new in `sequence-density.ts`) returns the stage 1
  cache's answer or `undefined`, never computing one, so a filter pass is a
  map lookup per sequence and cannot freeze the page. The filter reads the
  index's `version`, so when a slice finishes the engine's filtered set
  updates by itself; a persisted mandala filter after reload fills in as the
  measuring runs.
- Registries: `workspace-sections.ts` maps the type to the `"mandala"`
  section; `filter-rule-groups.ts` names the group "Mandala";
  `localize-filter-chip.ts` builds the chip from the value's coverage when
  the index knows it ("Sparse mandala, 24%") and falls back to the saved
  label.

## Labels

`browse_ui_by_mandala` ("By mandala"), `browse_ui_sparse_to_dense` ("Sparse
to dense"), `browse_ui_mandala_category` ("Mandala"),
`browse_audit_pick_mandala` ("Pick a mandala"), `browse_ui_measuring_mandalas`
("Measuring {measured} of {total}"), `browse_ui_mandala_sequence_count`
("{count} sequences" / "1 sequence"), in all eleven message files. The
adjective sits on the mandala, never on the sequence.

## Tests

- Index (`mandala-index.test.ts`): a small pool measures into groups ordered
  sparse to dense; two sequences with the same picture share a group with a
  count of 2; `progress` advances and `done` flips; `setPool` with new
  sequences measures only the new ones; cached rows with a stale `measure`
  are ignored. The idle scheduler and Dexie are injected so the test runs
  without a browser.
- Filter (`browse-filter.test.ts`): matches by key; an unmeasured sequence
  does not match.
- Chip: the mandala chip reads band and coverage.
- Gates: `check:fast` compared per file against the baseline, the full
  `wt:finish` check.
- Browser, on the worktree's port: the door with its fan; the mandala screen
  filling while measuring and settling; the count badge; a tap landing on the
  sequences that share the key, with the chip and its clear; the Studio
  sequence picker opening and filtering as before.

## Not in this stage

Mandala stills on sequence cards, a Mandalas tab or route of its own, a key
stored on the published record, grouping by key inside the full grid's
sections, and any change to the measure itself.
