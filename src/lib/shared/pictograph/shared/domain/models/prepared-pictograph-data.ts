/**
 * PreparedPictographData - Pre-calculated pictograph data for rendering
 *
 * This type extends PictographData with pre-calculated positions for arrows,
 * props, and grid mode. Used by PictographRenderer for efficient rendering
 * without per-component async calculations.
 *
 * Created by: PictographPreparer.prepareSingle() or prepareBatch()
 * Consumed by: PictographRenderer.svelte
 */

import type { PictographData } from "./pictograph-data";
import type { GridMode } from "../../../grid/domain/enums/grid-enums";
import type { PropPosition } from "../../../prop/domain/models/prop-position";
import type { PropAssets } from "../../../prop/domain/models/prop-assets";
import type { ArrowAssets } from "../../../arrow/orchestration/domain/arrow-models";
import type { HandSide } from "../enums/pictograph-enums";
import type { GridJoin } from "@tka/tka-types";

/**
 * Pre-calculated rendering data attached to a pictograph
 */
export interface PreparedRenderData {
  gridMode: GridMode;
  arrowPositions: Record<string, { x: number; y: number; rotation: number }>;
  arrowAssets: Record<string, ArrowAssets>;
  arrowMirroring: Record<string, boolean>;
  propPositions: Partial<Record<HandSide, PropPosition>>;
  propAssets: Partial<Record<HandSide, PropAssets>>;
  /**
   * Set when the pictograph is drawn on two joined grids. Positions above
   * already include each hand's grid offset; painters derive the grid layout
   * and fit scale from this join and `gridMode`.
   */
  join?: GridJoin;
}

/**
 * Extended pictograph data with pre-calculated positions
 */
export interface PreparedPictographData extends PictographData {
  _prepared?: PreparedRenderData;
}
