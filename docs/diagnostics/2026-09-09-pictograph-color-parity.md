# Start keys, card columns and mandala colors

The StartTile hand key used fixed CSS pixel dimensions outside the SVG. It now
belongs to PictographRenderer's 950-unit viewBox, using the same resolved hand
colors as the props and annotations. LiveCardPictograph enables it for the
viewer start cell. Hidden/absent hands do not contribute a misleading key.

ChoreoCard resolves its primary palette once and passes it to both cell rendering
and CardGridLayout's SequenceMandala instances. Explicit palettes now cover the
whole card. Animation frames carry the primary hand pair separately from effect
colors. The mandala guide painter blends its actual hand colors through the
existing mandala-palette helper instead of painting a fixed purple intersection.
The capability index records these owners for future color changes.

The current main branch already contained the canonical-column correction
(`38090c9f44`). Added a 32-step regression case at three container sizes; Auto
selects four or eight step columns, with no unused cells in the step region.

## Verification

- Chrome DevTools inspected production StartTile at 95, 190 and 285px. Circle
  diameters were 5.52, 11.12 and 16.72px, tracking the SVG scale exactly.
- Mounted a placed, 32-step fixture using production ChoreoCard and
  InlineAnimationPlayer. All 33 pictographs (including Start) rendered.
- At 1440x1100 the card used eight step columns; at 375x812 it used four.
  The narrow viewport had no horizontal overflow (365px content width).
- Changed green/red to cyan/orange. Start keys, cell colors, small card mandalas
  and the animation guide followed the selected colors. Overlapping paths use
  the blended color. No browser console errors or warnings in the final fixture.
- All 35 focused layout, palette and guide-painter tests passed with the
  repository's jsdom test config. The painter test reuses masks across palette
  changes and checks the resulting intersection color.
- Svelte check reported zero errors and zero warnings.

The shared dependency installation resolved Vitest 4 to some Vitest 3 packages,
and esbuild 0.27 to a 0.25 binary. Verification used a process-local module
resolution hook for the installed Vitest 4 packages and the matching esbuild
binary. No shared dependency files were modified. Temporary fixture and tooling
files stayed under the task's ignored audit directory.
