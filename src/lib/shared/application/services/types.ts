
export type HapticImpactStyle = "light" | "medium" | "heavy";
export type HapticNotificationType = "success" | "warning" | "error";

export type HapticFeedbackType =
  | "selection"
  | "success"
  | "warning"
  | "error"
  | "custom";

export interface HapticFeedbackConfig {
  enabled: boolean;
  respectReducedMotion: boolean;
  throttleTime: number;
  customPatterns: Record<string, number[]>;
}


export interface RippleOptions {
  duration?: number;
  color?: string;
  opacity?: number;
}


export interface FoldTransitionParams {
  duration?: number;
  direction?: "fold-in" | "fold-out";
  axis?: "x" | "y";
  easing?: (t: number) => number;
}

export interface SlideTransitionParams {
  direction?: "up" | "down" | "left" | "right";
  duration?: number;
  delay?: number;
}

export interface FadeTransitionParams {
  duration?: number;
  delay?: number;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AnimationSettings {
  // Animations are always enabled, this interface kept for compatibility
}

export interface TransitionResult {
  duration: number;
  delay?: number;
  easing?: (t: number) => number;
  css?: (t: number) => string;
}


import type { PictographData } from "../../pictograph/shared/domain/models/pictograph-data";
import type { HandSide } from "../../pictograph/shared/domain/enums/pictograph-enums";
import type { MotionData } from "../../pictograph/shared/domain/models/motion-data";

export interface MotionRenderData {
  color: HandSide;
  motionData: MotionData;
}

export interface PictographDisplayData {
  /** The effective pictograph data from sources */
  effectivePictographData: PictographData | null;
  /** Whether we have valid data to render */
  hasValidData: boolean;
  /** The display letter for the pictograph */
  displayLetter: string | null;
  /** Motion data ready for rendering */
  motionsToRender: MotionRenderData[];
}


import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

export type DeepLinkSource = "cache" | "local" | "public" | null;
export type DeepLinkError = "not_found" | "network" | null;

export interface DeepLinkResult {
  /** The resolved sequence data, or null if not found */
  sequence: SequenceData | null;
  /** Where the sequence was found */
  source: DeepLinkSource;
  /** Error type if resolution failed */
  error: DeepLinkError;
}
