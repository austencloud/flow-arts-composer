/**
 * Animator Loader Interface
 *
 * Handles lazy loading of animator-related services.
 * Provides access to core animation dependencies.
 */

import type { IAnimationRenderer } from "#lib/shared/animation-engine/services/IAnimationRenderer.js";
import type { ISVGGenerator } from "#lib/shared/animation-engine/services/ISVGGenerator.js";
import type { ITrailCapturer } from "#lib/shared/animation-engine/services/ITrailCapturer.js";
import type { SequenceAnimationOrchestrator } from "#lib/shared/animation-engine/services/sequence-animation-orchestrator.js";
import type { SettingsState } from "#lib/shared/settings/state/settings-state.svelte.js";

/**
 * Core animator services bundle
 */
export interface AnimatorServices {
  svgGenerator: ISVGGenerator;
  settingsService: SettingsState;
  orchestrator: SequenceAnimationOrchestrator;
  TrailCapturer: ITrailCapturer;
}

/**
 * Result of loading animator services
 */
export type AnimatorServiceLoadResult =
  | { success: true; services: AnimatorServices }
  | { success: false; error: string };

/**
 * Result of loading animation renderer
 */
export type AnimationRendererLoadResult =
  | { success: true; renderer: IAnimationRenderer }
  | { success: false; error: string };

/** @deprecated Use AnimationRendererLoadResult instead */
export type PixiLoadResult = AnimationRendererLoadResult;

/**
 * Service for loading animator-related dependencies
 */
export interface IAnimatorLoader {
  /**
   * Load core animator services.
   * Does NOT load renderer - that's handled separately.
   */
  loadAnimatorServices(): AnimatorServiceLoadResult;

  loadAnimationRenderer(): AnimationRendererLoadResult;

  /** @deprecated Use loadAnimationRenderer() instead */
  loadPixiRenderer(): AnimationRendererLoadResult;
}
