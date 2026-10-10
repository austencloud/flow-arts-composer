import type { ViewportManager } from '#lib/shared/device/services/viewport-manager.svelte.js'
/**
 * CreateModule Layout Service Implementation
 *
 * Manages responsive layout calculations and device-specific layout decisions.
 * Extracted from CreateModule.svelte to separate concerns and enable testing.
 */

import type { DeviceDetector } from '#lib/shared/device/services/device-detector.js'
import type { LayoutConfiguration } from "../../orchestration/types";
import { LAYOUT_BREAKPOINTS } from "../models/layout-state";
export class CreateModuleLayoutManager {
  constructor(
    private deviceDetector: DeviceDetector,
    private viewportService: ViewportManager
  ) {}

  /**
   * Calculate complete layout configuration based on current device and viewport
   */
  calculateLayoutConfiguration(): LayoutConfiguration {
    const viewportWidth = this.viewportService.width;
    const viewportHeight = this.viewportService.height;
    const aspectRatio = viewportHeight > 0 ? viewportWidth / viewportHeight : 1;

    const isDesktop = this.deviceDetector.isDesktop();
    const isLandscapeMobile = this.deviceDetector.isLandscapeMobile();

    // Check if viewport is wide enough for side-by-side layout
    const hasWideViewport = viewportWidth >= LAYOUT_BREAKPOINTS.WIDE_VIEWPORT;

    // Landscape detection: Use side-by-side for significantly landscape orientations
    const isSignificantlyLandscape =
      aspectRatio > LAYOUT_BREAKPOINTS.LANDSLOOPE_ASPECT_RATIO;

    // Z Fold specific: More flexible detection that accounts for browser UI
    const isLikelyZFoldUnfolded = this.isZFoldUnfolded(
      viewportWidth,
      aspectRatio
    );

    // Determine if should use side-by-side layout
    const shouldUseSideBySideLayout =
      (isDesktop && hasWideViewport) ||
      isLandscapeMobile ||
      isLikelyZFoldUnfolded ||
      isSignificantlyLandscape;

    const navigationLayout = this.deviceDetector.getNavigationLayoutImmediate();

    return {
      navigationLayout,
      shouldUseSideBySideLayout,
      viewportWidth,
      viewportHeight,
      isDesktop,
      isLandscapeMobile,
      aspectRatio,
      isLikelyZFoldUnfolded,
    };
  }

  /**
   * Subscribe to viewport changes and call callback with new configuration
   */
  subscribeToLayoutChanges(
    callback: (config: LayoutConfiguration) => void
  ): () => void {
    return this.viewportService.onViewportChange(() => {
      const newConfig = this.calculateLayoutConfiguration();
      callback(newConfig);
    });
  }

  getViewportDimensions(): { width: number; height: number } {
    return {
      width: this.viewportService.width,
      height: this.viewportService.height,
    };
  }

  /**
   * Check if device is likely Z Fold unfolded
   * Wider range to account for browser UI variations
   */
  isZFoldUnfolded(width: number, aspectRatio: number): boolean {
    return (
      width >= LAYOUT_BREAKPOINTS.Z_FOLD_MIN_WIDTH &&
      width <= LAYOUT_BREAKPOINTS.Z_FOLD_MAX_WIDTH &&
      aspectRatio > LAYOUT_BREAKPOINTS.Z_FOLD_MIN_ASPECT &&
      aspectRatio < LAYOUT_BREAKPOINTS.Z_FOLD_MAX_ASPECT
    );
  }

  /**
   * Determine if should use side-by-side layout based on configuration
   */
  shouldUseSideBySideLayout(config: LayoutConfiguration): boolean {
    return config.shouldUseSideBySideLayout;
  }
}

import { deviceDetector } from "#lib/shared/device/services/device-detector.js";
import { viewportManager } from "#lib/shared/device/services/viewport-manager.svelte.js";

export const createModuleLayoutManager = new CreateModuleLayoutManager(
  deviceDetector,
  viewportManager
);
