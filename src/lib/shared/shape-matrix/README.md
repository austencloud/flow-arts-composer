# Shape Engine

Shared implementation for Shape Engine: the flower axis, level and
ratio matrices, exact-realization drill, and cell rendering. Internal
`ShapeMatrix*` names remain because the matrix is still the behavior they own.
The implementation is consumed by the `/shape-engine` public
destination, the Create module's Shape tab
(`src/lib/features/create/shape-engine/`), the history archive, and the lab
dev harness
(`src/routes/test/shape-matrix/+page.svelte`,
`src/lib/features/lab/vtg-lab/`).

No barrel export (`index.ts`) per this codebase's code-style convention —
import each symbol from its module path directly.

## Embeddable app

`app/ShapeMatrixApp.svelte` owns the complete interactive experience. It has no
route navigation and fills the dimensions supplied by its host, switching
between the two-pane and compact flows from a `ResizeObserver` on that host.
Give the containing element an explicit width and height.

The optional `persistence` prop is a host adapter with `restore()` and
`persist(snapshot)` methods. The public notation route uses it for query-string
state. FAC can omit it for an isolated session or provide its own state owner.

## Public surface

| Symbol                                                                                                                                | Path                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `ShapeMatrixApp` (Svelte component, optional `persistence` adapter)                                                                   | `$lib/shared/shape-matrix/app/ShapeMatrixApp.svelte`          |
| `loadShapeMatrix`, `ShapeMatrixData`                                                                                                  | `$lib/shared/shape-matrix/services/shape-matrix-flowers`      |
| `applyFilter`, `defaultMatrixFilters`, `defaultAxisFilter`, `AxisFilter`, `MatrixFilters`                                             | `$lib/shared/shape-matrix/domain/filter-flower-axis`          |
| `matrixFiltersForSize`, `MatrixSize`                                                                                                  | `$lib/shared/shape-matrix/domain/matrix-size-preset`          |
| `ShapeMatrixGrid` (Svelte component, `onselect({blue,red})`)                                                                          | `$lib/shared/shape-matrix/components/ShapeMatrixGrid.svelte`  |
| `buildModeCards`, `ModeCard` (incl. `seq: SequenceData`)                                                                              | `$lib/shared/shape-matrix/services/build-realization-cards`   |
| `MODE_ORDER`, `MODE_LABEL`, `VtgMode`                                                                                                 | `$lib/shared/shape-matrix/services/shape-matrix-realizations` |
| `buildModeRealizationCandidates`, `ModeRealization`                                                                                   | `$lib/shared/shape-matrix/services/build-mode-realizations`   |
| `findExactParityCandidates`, `flowerPhaseOrientations`, `verifyAndCorrect`, `ParityResult`                                            | `$lib/shared/shape-matrix/services/verify-realization-parity` |
| `renderCell`, `renderHeader`, `renderExtentFit`, `renderEngineAligned`, `engineExtentBoxRatio` (the animation canvas's guide painter) | `$lib/shared/shape-matrix/services/shape-matrix-render`       |
| `renderPoiCell`, `renderPoiHeader` (poi light-trail painter; same signatures, swap via the grid's `painter` prop)                     | `$lib/shared/shape-matrix/services/shape-matrix-poi-render`   |
| `Flower`, `flowerKey`, `flowerLabel`, `flowerStartOrientation`, `buildFlowerAxis`, `ratioLabel`, `flowerTurnPattern`                  | `$lib/shared/shape-matrix/domain/flower-signature`            |

## Known lab-side dependencies (not extracted)

As of the Phase 1 pre-step, `loadBaseIndex`/`resolveBase` moved into this
module (`services/build-realization-sequence.ts` — it had no lab-only
dependency, only `$lib/features/choreo-card/*` imports already used
elsewhere in this module and the already-shared `VtgMode` type).

Two helpers remain in `src/lib/features/lab/vtg-lab/services/` and are
deliberately NOT moved:

- `resolveRotationStyleMatrices`/`bakeVariationFront`/`bakeVariationBack`
  (`resolve-rotation-style-matrices.ts`, imported by `shape-matrix-flowers.ts`
  and `build-realization-cards.ts`) — imports `../domain/classify-rotation-style`
  and `../domain/tnd-turn-patterns`, both lab-only domain modules shared with
  other genuinely lab-only consumers (`bake-mandala-clips.ts`,
  `render-mandala-overlay-layer.ts`, `resolve-tnd-family-cards.ts`).
- `buildFlowerSequence` (`build-flower-sequence.ts`, imported by
  `shape-matrix-flowers.ts`) — imports `./prepare-mandala-club-sequence`,
  shared with `bake-mandala-clips.ts`.

Forcing either move would drag `classify-rotation-style.ts`,
`tnd-turn-patterns.ts`, and `prepare-mandala-club-sequence.ts` (and their
other lab-only consumers) into this module, which is out of scope for the
public destination. The contract test allowlists exactly these two import
lines; any other `$lib/features/lab/` import inside this module is a
violation. Flagged for a future extraction pass if a public route ever needs
to bundle without the lab.
