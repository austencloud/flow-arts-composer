# Prop rendering audit

Date: September 9, 2026

The reported failures were reproduced in the rendering pipeline and corrected: Construct now passes the selected fan build, and a second color pass preserves the yellow wicks. The audit also corrected related failures in custom colors, previews, caches, and exports.

## Findings and changes

| Finding                                                                                                                             | Result                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Construct supplied prop types but omitted fan appearance, theme, and buugeng chirality during batch preparation.                    | Pass the full relevant preparation settings.                                                                                                                                                                                             |
| Custom hand colors repainted a physical fan's materials and failed to update its stroke-built frame.                                | The shared SVG transform recolors only the marked fan frame. All seven physical fan artworks retain their original wicks, covers, and other materials.                                                                                   |
| Recoloring an already prepared notation SVG changed its CSS selectors without changing the corresponding suffixed class attributes. | Keep selectors and class tokens synchronized across repeated color passes, including multiple classes.                                                                                                                                   |
| Material-preserving props treated the previously applied blue/red hand color as an authored material and refused custom colors.     | Live SVG and canvas rendering identify the original hand colors explicitly while retaining other material colors.                                                                                                                        |
| Live cards, persistent cells, composited layers, and remounted previews did not carry or distinguish fan builds.                    | Forward appearance through preparation and rendering, include it in every affected cache and repaint key, and version custom-palette cell images. Canonical cells with no personal appearance or palette retain their existing identity. |
| Background warming assembled a separate set of rendering options that omitted appearance and chirality.                             | Reuse the visible preview's existing settings resolver.                                                                                                                                                                                  |
| Image export and DOM capture dropped the fan appearance at intermediate boundaries.                                                 | Carry an explicit appearance snapshot through the existing export pipeline, including preview-cache write-through.                                                                                                                       |
| Choreography-sheet PDF export used prop types but omitted fan appearance and custom hand colors shown in its live preview.          | Snapshot the chosen appearance and palette once per export and pass them to the shared preparer and canvas renderer.                                                                                                                     |

The changes extend the existing preparer, shared SVG color transform, preview settings resolver, and rendering caches. No additional renderer was introduced.

## Verification

- 32 audit suites passed, containing 201 tests for preferences and persistence, prop-family classification, geometry and tip placement, recorded prop intent, animation changes, chirality, and 3D fan builds.
- Five focused regression suites passed, containing 86 tests, including all seven physical fan artworks, repeated SVG recoloring, fan build/cover cache separation, clubs, and energy props.
- Final cache and color checks passed: 32 tests across five suites. This includes the remount and repaint regression tests. A pre-existing cache-format assertion was corrected to allow the existing view-mode suffix while still requiring all four visibility bits.
- `npm run build:packages` passed. `npm run check` reported zero errors and zero warnings. `git diff --check` passed.
- Runtime asset audit resolved all 40 registered prop types through both pictograph and animation path selection: 43 distinct source SVGs, all successfully loaded and recognized as SVG. Capsule Baton and Fire Double Staff intentionally use pictograph artwork in animation; absent duplicate files in `animated/` are not missing runtime assets.
- Direct browser inspection used the task-owned Construct route at 1920×1080 and 375×667. Added a step, changed Fire and Lotus builds, and checked normal and custom palettes. The step grid and options used the selected artwork. Computed wick fill remained `rgb(245, 230, 184)` while frames changed to `rgb(0, 255, 136)` and `rgb(255, 136, 0)`. No horizontal page overflow was observed.
- The generic notation fan also retained valid class references after custom recoloring: `st0-00ff88` and `st0-ff8800` resolved to their corresponding computed colors.
- Actual 950px canvas rendering retained 584 exact yellow wick pixels for Fire and 2,832 for Lotus, alongside green and orange frame pixels. The Day build correctly produced no yellow wick pixels and retained both hand colors.
- The choreography-sheet exporter produced a valid `%PDF-1.7` document in the browser. Its cell rendering uses the same canvas pipeline verified above.

## Audit boundaries

Catalog coverage includes every registered prop's resolved source artwork. The rendering and state suites cover the shared owners used across the application; visual inspection focused on the reported Construct surfaces and fan states. Individual 3D prop models were checked through existing tests rather than a new visual walkthrough of every scene. Canonical printed/QR card rendering remains distinct from personal display preferences. No production data or cloud-rendered assets were changed.
