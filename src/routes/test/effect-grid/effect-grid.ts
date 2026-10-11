import { EFFECTS } from "#lib/shared/animation-engine/components/effects-panel/effect-registry.js";

/**
 * Every effect in the registry, laid out as a 4x4 grid of stations.
 *
 * The registry holds exactly sixteen effects, which is why the grid is 4x4 and
 * not a scrolling list — the whole system fits in one frame, which is the point
 * of the page. If an effect is ever added or removed, GRID_COLS below is the
 * only thing to revisit.
 *
 * Every cell runs the SAME sequence with the SAME overlaid rig arrangement, so
 * the only variable across the grid is the effect itself. That is what makes it
 * a comparison rather than a gallery.
 */

/**
 * Station spacing in metres, wider across than deep.
 *
 * The stage is a wide box and the grid is square, so equal spacing leaves a
 * third of the frame empty on each side. Spreading X fills the canvas without
 * pushing the far row out of view.
 */
export const GRID_SPACING_X = 9.6;
export const GRID_SPACING_Z = 5.2;

export const GRID_COLS = 4;

export interface EffectCell {
  id: string;
  label: string;
  color: string;
  row: number;
  col: number;
  x: number;
  z: number;
}

export const EFFECT_CELLS: readonly EffectCell[] = EFFECTS.map((entry, i) => {
  const row = Math.floor(i / GRID_COLS);
  const col = i % GRID_COLS;
  const span = (GRID_COLS - 1) * GRID_SPACING_X;
  const rows = Math.ceil(EFFECTS.length / GRID_COLS);
  const rowSpan = (rows - 1) * GRID_SPACING_Z;
  return {
    id: entry.id,
    label: entry.label,
    color: entry.color,
    row,
    col,
    x: col * GRID_SPACING_X - span / 2,
    z: row * GRID_SPACING_Z - rowSpan / 2,
  };
});
