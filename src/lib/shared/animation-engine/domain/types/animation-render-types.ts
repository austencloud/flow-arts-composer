import type { TrailPoint, TrailSettings } from "./trail-types";
import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
import type { QualityHints } from "./quality-types";

export interface AdditionalLayerRenderData {
  leftProp: PropState | null;
  rightProp: PropState | null;
  leftTrailPoints: TrailPoint[];
  rightTrailPoints: TrailPoint[];
  hasLeft: boolean;
  hasRight: boolean;
  opacity: number;
  /** Visible formation travel is not performed motion and must not ink a trail. */
  trailCaptureSuppressed?: boolean;
  /** Lets review telemetry distinguish formation travel from performed motion. */
  formationTransitionActive?: boolean;
  leftColor: string;
  rightColor: string;
  /** Per-performer prop type (Performer Set); drives the hand-never-rotates rule
   *  for this copy. Absent → the global prop type. */
  leftPropType?: string;
  rightPropType?: string;
}

export interface AnimationVisibilitySettings {
  gridVisible: boolean;
  propsVisible: boolean;
  trailsVisible: boolean;
  leftMotionVisible: boolean;
  rightMotionVisible: boolean;
}

export interface RenderSceneParams {
  leftProp: PropState | null;
  rightProp: PropState | null;
  gridVisible: boolean;
  /** Host-owned alpha for a coordinated transformation. Undefined leaves the
   * grid visibility manager in charge of ordinary toggles. */
  gridOpacity?: number;
  gridMode: string | null;
  letter: string | null;
  turnsTuple: string | null;
  leftPropDimensions: { width: number; height: number };
  rightPropDimensions: { width: number; height: number };
  leftTrailPoints: TrailPoint[];
  rightTrailPoints: TrailPoint[];
  additionalLayers?: AdditionalLayerRenderData[];
  trailSettings: TrailSettings;
  currentTime: number;
  /** Virtual-time frames can stay paused indefinitely; apply visibility without a fade. */
  instantVisibility?: boolean;
  visibility: AnimationVisibilitySettings;
  leftPropFlipped?: boolean;
  rightPropFlipped?: boolean;
  leftPropType?: string;
  rightPropType?: string;
  qualityHints?: QualityHints;
  skipTrailRendering?: boolean;
  /** Performer spotlight: selected performer (0 = base, k = copy arm k) or null.
   *  When set, non-selected copies' props dim. Default null. */
  tunnelSelectedLayer?: number | readonly number[] | null;
}
