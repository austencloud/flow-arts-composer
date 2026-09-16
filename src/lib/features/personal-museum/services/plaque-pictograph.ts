/**
 * Plaque Pictograph Pre-Render
 *
 * Renders a sequence's first step to an ImageBitmap so the shared museum
 * plaque generator can composite it into the wall-plaque texture. The plaque
 * generator is sync and text-only; this is the async pre-render step that
 * personal-museum slots run before passing the bitmap in.
 *
 * Uses the canonical Canvas2D pictograph renderer — never hand-rolled SVG.
 */

import { canvas2DDirectRenderer } from "$lib/shared/render/services/canvas-2d-direct-renderer";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

/**
 * Render a sequence's first step to an ImageBitmap for plaque compositing.
 * Returns null when the sequence has no steps.
 */
export async function renderFirstStepBitmap(
  sequence: SequenceData,
): Promise<ImageBitmap | null> {
  const step = sequence.steps?.[0];
  if (!step) return null;

  await canvas2DDirectRenderer.initialize();

  const canvas = await canvas2DDirectRenderer.renderPictograph(step as StepData, {
    size: 256,
    visibility: {
      showTKA: true,
      showTnD: false,
      showElemental: false,
      showPlacements: false,
      showReversals: false,
      showNonRadialPoints: false,
      darkMode: false,
    },
  });

  return createImageBitmap(canvas as unknown as CanvasImageSource);
}
