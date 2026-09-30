/**
 * Handles lazy loading of animator-related services.
 * Provides access to core animation dependencies.
 */

import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
import type { IAnimationRenderer as AnimationRenderer } from "$lib/shared/animation-engine/services/IAnimationRenderer";
import { Canvas2DAnimationRenderer } from "$lib/shared/animation-engine/services/canvas-2d-animation-renderer";
import {
  generateGridSvg,
  generatePropSvg,
  generateLeftPropSvg,
  generateRightPropSvg,
  generateLeftStaffSvg,
  generateRightStaffSvg,
} from "$lib/shared/animation-engine/services/svg-generator";
import type { ISVGGenerator } from "$lib/shared/animation-engine/services/ISVGGenerator";
import { getSequenceAnimationOrchestrator } from "$lib/shared/animation-engine/get-sequence-animation-orchestrator";
import { getTrailCapturer } from "$lib/shared/animation-engine/get-trail-capturer";

import type {
  AnimatorServices,
  AnimatorServiceLoadResult,
  AnimationRendererLoadResult,
} from "./IAnimatorLoader";

export function loadAnimatorServices(): AnimatorServiceLoadResult {
  try {
    const svgGeneratorAdapter: ISVGGenerator = {
      generateGridSvg,
      generatePropSvg,
      generateLeftPropSvg,
      generateRightPropSvg,
      generateLeftStaffSvg,
      generateRightStaffSvg,
    };
    const services: AnimatorServices = {
      svgGenerator: svgGeneratorAdapter,
      settingsService: settingsService,
      orchestrator: getSequenceAnimationOrchestrator(),
      TrailCapturer: getTrailCapturer(),
    };

    return { success: true, services };
  } catch (err) {
    console.error("[animator-loader] Failed to load animator services:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export function loadAnimationRenderer(): AnimationRendererLoadResult {
  try {
    const renderer: AnimationRenderer = new Canvas2DAnimationRenderer();
    return { success: true, renderer };
  } catch (err) {
    console.error("Failed to load animation renderer:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load animation renderer",
    };
  }
}

/** @deprecated Use loadAnimationRenderer() instead */
export const loadPixiRenderer = loadAnimationRenderer;
