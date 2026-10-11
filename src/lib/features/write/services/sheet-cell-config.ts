/**
 * Shared cell render config for choreo sheets.
 *
 * One sheet cell = one step = one pictograph. Both the live preview cells and the
 * PDF rasterizer pull their visibility from this single object, so a step looks
 * the same on screen as it does on paper — parity comes from sharing the config,
 * not from sharing a renderer.
 *
 * The look starts from the locked playing-card profile
 * (`buildCanonicalCardVisibility`) so a sheet step reads identically to the same
 * step on a printed card — grid, TKA glyph, hand points, reversals, light/print
 * background. Two card-only composition flags are stripped: a bare sheet cell is
 * a pictograph, not a full card, so it carries no QR code and no word banner.
 */
import { buildCanonicalCardVisibility } from "#lib/features/choreo-card/domain/canonical-card-visibility.js";
import type { ChoreoSheetLayout } from "../domain/types/choreo-sheet";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";

// No elemental glyph on a sheet cell (that's a TnD-deck-card concern), so call
// the builder with no args, then drop the QR cell flag.
const canonical = buildCanonicalCardVisibility({});

/**
 * The locked visibility set every sheet cell renders with. Spreads cleanly into
 * both PictographContainer props (preview) and Canvas2DDirectRenderer's
 * visibility options (PDF). `showQRCode` is forced off — a single step never
 * carries a QR code.
 */
export const SHEET_CELL_VISIBILITY = Object.freeze({
  ...canonical.visibilityOverrides,
  showQRCode: false,
});

/**
 * `addWord` is a top-level compose option, not a visibility flag. Sheets never
 * stamp a word banner on a cell, so it's always off.
 */
export const SHEET_CELL_ADD_WORD = false;

export interface CellRenderInput {
  step: StepData;
  /** The step number to overlay, or undefined when the sheet hides step numbers. */
  stepNumber: number | undefined;
  /** Sheets always print on a white background (light/print look). */
  printMode: true;
}

/**
 * Resolve the per-cell render input for a step under a given layout. The only
 * layout-driven value is whether the step number shows; everything else is the
 * locked visibility above.
 */
export function cellRenderInput(step: StepData, layout: ChoreoSheetLayout): CellRenderInput {
  return {
    step,
    stepNumber: layout.showStepNumbers ? step.stepNumber : undefined,
    printMode: true,
  };
}
