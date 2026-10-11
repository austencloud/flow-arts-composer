import type { DeviceDetector } from '#lib/shared/device/services/device-detector.js'
import type { LayoutConfig } from "./types";

// Re-export LayoutConfig type to avoid duplicate type issues
type LocalLayoutConfig = LayoutConfig;

export class LayoutDetector {
  constructor(private deviceDetector: DeviceDetector) {}

  /**
   * SIMPLIFIED: Basic swipe detection logic
   *
   * CRITICAL: When in stacked mobile layout (workbench on top, option picker on bottom),
   * we should ALWAYS use horizontal swipe, even if the container is wide (>= 652px).
   * The traditional grid layout should only be used on true desktop/tablet side-by-side layouts.
   */
  shouldUseHorizontalSwipe(
    layoutConfig: LocalLayoutConfig | null | undefined,
    sectionCount: number,
    enableHorizontalSwipe: boolean
  ): boolean {
    if (
      !enableHorizontalSwipe ||
      !layoutConfig ||
      typeof window === "undefined"
    ) {
      return false;
    }

    const containerWidth = layoutConfig.containerWidth;
    const isMobile = this.deviceDetector.isMobile();
    const hasMultipleSections = sectionCount > 1;

    // Use swipe if we have multiple sections AND:
    // 1. Mobile device (regardless of container width - includes stacked layout), OR
    // 2. Narrow container (< 652px)
    //
    // This ensures that stacked mobile layouts (workbench on top, option picker on bottom)
    // always use horizontal swipe with 8 columns, not the traditional grid layout.
    return hasMultipleSections && (isMobile || containerWidth < 650);
  }

  /**
   * SIMPLIFIED: Basic layout parameters calculation
   */
  calculateLayoutParameters(
    containerWidth: number,
    sectionCount: number
  ): {
    useSwipe: boolean;
    optionsPerRow: number;
    hasLimitedColumns: boolean;
    isNarrowScreen: boolean;
  } {
    const isNarrowScreen = containerWidth < 650;
    const optionsPerRow = isNarrowScreen ? 4 : 8;
    const hasLimitedColumns = optionsPerRow < 8;

    const mockLayoutConfig = { containerWidth, optionsPerRow };
    const useSwipe = this.shouldUseHorizontalSwipe(
      mockLayoutConfig,
      sectionCount,
      true
    );

    return {
      useSwipe,
      optionsPerRow,
      hasLimitedColumns,
      isNarrowScreen,
    };
  }
}

import { deviceDetector } from "#lib/shared/device/services/device-detector.js";

export const layoutDetector = new LayoutDetector(deviceDetector);
