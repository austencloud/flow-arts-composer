/**
 * Pictograph Domain Model
 *
 * Immutable data for a complete pictograph.
 * Based on modern desktop app's pictographData.py
 */
import type { Letter } from "../../../../foundation/domain/models/letter";
import type { GridPlacement } from "../../../grid/domain/enums/grid-enums";
import type { HandSide } from "../enums/pictograph-enums";
import type { MotionData } from "./motion-data";
import type { GridMode } from '../../../grid/domain/enums/grid-enums';

export interface PictographData {
  readonly id: string;

  // Letter and position data
  readonly letter?: Letter | null;
  readonly startPlacement?: GridPlacement | null;
  readonly endPlacement?: GridPlacement | null;

  // Movement data - explicitly allow undefined values
  readonly motions: Partial<Record<HandSide, MotionData | undefined>>;

  // Grid mode (diamond, box, skewed) - can be pre-set from sequence data
  readonly gridMode?: GridMode;

  // Skewed mode category (1-4, see docs/SKEW-AUDIT-FINDINGS.md)
  // 1 = normal→skewed (one hand skews)
  // 2 = normal→normal (both hands skew)
  // 3 = skewed→skewed (future)
  // 4 = skewed→normal (future)
  readonly category?: number | null;

  // Beta offset swap — flips which hand gets which side when both end at same location.
  // Legacy Python app feature ported to web. Toggle via B key in step editor.
  readonly betaSwapped?: boolean;
}
