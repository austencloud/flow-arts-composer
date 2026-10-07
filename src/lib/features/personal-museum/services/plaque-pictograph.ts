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
import { sequenceFirstStep } from "./sequence-first-step";

/**
 * The step a sequence's plaque shows: its first step, drawn on the grids the
 * sequence is joined on (display-only; the stored step is untouched). Null
 * when the sequence has no steps.
 */
export function plaqueFirstStep(sequence: SequenceData): StepData | null {
  return sequenceFirstStep(sequence) as StepData | null;
}

/**
 * Render a sequence's first step to an ImageBitmap for plaque compositing.
 * Returns null when the sequence has no steps.
 */
export async function renderFirstStepBitmap(
  sequence: SequenceData,
): Promise<ImageBitmap | null> {
  const step = plaqueFirstStep(sequence);
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
