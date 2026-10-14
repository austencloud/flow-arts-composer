# Flow DNA credit + buugeng tip rotation — starting brief (2026-10-14)

Worktree: `E:/worktrees/tka-platform/flowgeng-credit-tips`, branch
`codex/flowgeng-credit-tips`, based on local `main` at 11ee23a5a8.
Austen approved option A on both items below.

## Background

The buugeng "Version 2" (the `model` prop look) is a capture of
`static/models/props/buugeng.glb`, which `scripts/build-buugeng-model.py`
builds from `scripts/assets/buugeng-reference.svg`, a trace of a photo of
Duncan's Flow DNA flowgeng (the script labels it "narrow-waisted ten-slot
flowgeng silhouette"). Big Buugeng Version 2 is the same model at 1.4x
(`worker-gltf-props.ts`). Austen did not know the prop was Duncan's when it
went in and wants Flow DNA credited.

## Task 1: credit Flow DNA on the Version 2 buugeng

- Fan looks already carry `designCredit: { originator, sourceUrl }` on
  `PropBuildPreviewOption` (`src/lib/shared/pictograph/prop/domain/fan-appearance.ts`)
  and `PropGrid.svelte` renders it as the `.rail-credit` link in the picker
  rail (with a short-name table `RAIL_CREDIT_SHORT_NAMES`).
- Version 2 tiles come from `propLookOptions()` in
  `src/lib/shared/pictograph/prop/domain/prop-look.ts` (`PropLookOption`),
  which has no credit field. Add one for buugeng / bigbuugeng model look and
  show it through the same rail credit so the picker reads the same way for
  fans and buugeng. Check the other pickers that list Version 2 tiles
  (`BentoPropGrid.svelte`, `PropSelectionSheet.svelte`, the post-studio
  appearance tool) for a consistent spot.
- Credit text: "Flow DNA". Link: Austen chose option A, the flowtoys listing
  https://flowtoys.com/flowgeng (no Flow DNA site was found). If he supplies a
  Flow DNA site or Instagram later, swap the URL.
- Also name Flow DNA as the reference in `scripts/build-buugeng-model.py`
  (`reference_form`) and in `docs/superpowers/specs/2026-08-14-buugeng-3d-rebuild-design.md`.

## Task 2: rotate the model so the tips land on the long axis

- 2D effects read tips from `src/lib/shared/animation-engine/domain/types/prop-tip-points.ts`.
  `BUUGENG_TIP_POINTS` is a horizontal pair at radius 121.58 on the grip line
  (Austen's product convention: every renderer gets a perfectly horizontal
  pair). The model look reuses that notation table.
- In the captured sprite (`static/images/props/appearances/model/buugeng-blue.svg`,
  1024x530 webp inside) the two flowgeng tips sit on a diagonal (upper left,
  lower right), so flames and trails emit from empty space on the midline.
- Cause: `build-buugeng-model.py` takes the long axis from the vertical
  extent of the trace (`svg_length`), and the flowgeng's tips are not on its
  bounding-box axis. 3D tips (`prop-tip-geometry-3d.ts`) fall back to a
  half-length along the model's local +Y, so 3D misses the tips too
  (inferred, not observed live).
- Fix (option A): in the build script, rotate the traced body so the
  tip-to-tip chord becomes local +Y (keep the grip origin at the body
  centre, keep the 0.83 m length measured tip to tip), re-export the GLB,
  run `scripts/verify-buugeng-glb.cjs`, then re-capture the Version 2 sprite
  via `/test/prop-3d-studio/sprites` (regenerates
  `prop-model-sprites.generated.ts` and the appearance SVGs for buugeng and
  bigbuugeng). Confirm the sprite's painted tips sit on the midline and that
  a fire or trail effect attaches to them in 2D and 3D.
- The Blender build needs Blender on PATH (see the script header). Do not
  hand-edit the GLB.

## Verification

- Focused: the buugeng chirality tests
  (`pictograph-preparer.buugeng-chirality.test.ts`,
  `buugeng-chirality-raster.test.ts`), `prop-tip-geometry-3d.test.ts`, the
  PropGrid credit screenshot test.
- Visual: prop picker rail shows the Flow DNA credit on the buugeng Version 2
  tile; an effect on Version 2 buugeng emits from the tips in 2D and 3D.
