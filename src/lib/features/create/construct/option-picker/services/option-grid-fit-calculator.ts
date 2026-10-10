/**
 * Option Grid Fit Calculator
 *
 * Unified sizing service for the option picker. Provides:
 * - Pure grid fitting (mobile swipe layout)
 * - Column layout optimization (maximizing pictograph size)
 * - Device-aware sizing (desktop option picker)
 *
 * Consolidates sizing logic previously split between OptionSizer
 * and inline component calculations.
 */

import type { DeviceAwareSizingParams, DeviceAwareSizingResult, DeviceConfig, GridFitParams, GridFitResult } from "./types";
import { BREAKPOINTS } from "#lib/shared/device/domain/constants/device-constants.js";

const DEFAULT_MIN_SIZE = 40;

/**
 * Device-specific configurations
 */
const DEVICE_CONFIGS: Record<string, DeviceConfig> = {
  mobile: {
    padding: { horizontal: 12, vertical: 12 },
    gap: 2,
    minItemSize: 60,
    maxItemSize: 150,
    scaleFactor: 1,
  },
  tablet: {
    padding: { horizontal: 12, vertical: 12 },
    gap: 2,
    minItemSize: 75,
    maxItemSize: 175,
    scaleFactor: 1,
  },
  desktop: {
    padding: { horizontal: 12, vertical: 12 },
    gap: 2,
    minItemSize: 75,
    maxItemSize: 200,
    scaleFactor: 1,
  },
};

/**
 * Detect device type from width and mobile flag.
 */
function detectDeviceType(
  width: number,
  isMobileDevice: boolean
): "mobile" | "tablet" | "desktop" {
  if (isMobileDevice) return "mobile";
  if (width < BREAKPOINTS.DESKTOP) return "tablet";
  return "desktop";
}

/**
 * Calculate the optimal pictograph size to fit all items
 * within the given container dimensions.
 */
export function calculateFitSize(params: GridFitParams): GridFitResult {
  const {
    itemCount,
    columnCount,
    availableWidth,
    availableHeight,
    gridGap,
    maxSize,
    minSize = DEFAULT_MIN_SIZE,
  } = params;

  // Actual columns is the lesser of requested columns and item count
  const columns = Math.min(columnCount, Math.max(itemCount, 1));
  const rows = Math.ceil(itemCount / columns) || 1;

  const totalWidthGapSpace = (columns - 1) * gridGap;
  const totalHeightGapSpace = (rows - 1) * gridGap;

  // Calculate max size that fits width constraint
  const maxWidthBasedSize = Math.floor(
    (availableWidth - totalWidthGapSpace) / columns
  );

  // Calculate max size that fits height constraint
  const maxHeightBasedSize = Math.floor(
    (availableHeight - totalHeightGapSpace) / rows
  );

  // Use the smaller of width/height constraints, clamped to bounds
  const fitSize = Math.min(maxWidthBasedSize, maxHeightBasedSize, maxSize);
  const pictographSize = Math.max(fitSize, minSize);

  return {
    pictographSize,
    columns,
    rows,
    gridColumns: `repeat(${columns}, ${pictographSize}px)`,
  };
}

/**
 * Compare multiple column layouts and return whichever
 * produces larger pictographs.
 */
export function calculateOptimalColumnLayout(params: {
  itemCount: number;
  availableWidth: number;
  availableHeight: number;
  gridGap: number;
  maxSize: number;
  minSize?: number;
  columnOptions?: number[];
}): GridFitResult {
  const {
    itemCount,
    minSize = DEFAULT_MIN_SIZE,
    columnOptions = [4, 8],
  } = params;

  // Calculate for each column option and find the one with largest pictographs
  let bestResult: GridFitResult | null = null;

  for (const columnCount of columnOptions) {
    // Skip if we have fewer items than columns
    const effectiveColumns = Math.min(columnCount, itemCount);

    const result = calculateFitSize({
      ...params,
      columnCount: effectiveColumns,
      minSize,
    });

    // Pick the result with the largest pictograph size
    if (!bestResult || result.pictographSize > bestResult.pictographSize) {
      bestResult = result;
    }
  }

  // Fallback to first option if nothing matched
  return bestResult ?? calculateFitSize({
    ...params,
    columnCount: columnOptions[0] ?? 4,
    minSize,
  });
}

/**
 * Calculate pictograph size with device-specific constraints.
 *
 * Used by desktop option picker where device type affects
 * padding, gaps, and size limits.
 */
export function calculateDeviceAwareSize(params: DeviceAwareSizingParams): DeviceAwareSizingResult {
  const { count, containerWidth, containerHeight, columns, isMobileDevice } = params;

  // Determine device type
  const deviceType = detectDeviceType(containerWidth, isMobileDevice);
  const deviceConfig = getDeviceConfig(deviceType);

  // Calculate available space after padding
  const availableWidth = containerWidth - deviceConfig.padding.horizontal * 2;
  const availableHeight = containerHeight - deviceConfig.padding.vertical * 2;

  // Calculate size per item
  const widthPerItem = (availableWidth - deviceConfig.gap * (columns - 1)) / columns;
  const rows = Math.ceil(count / columns);
  const heightPerItem = (availableHeight - deviceConfig.gap * (rows - 1)) / rows;

  // Use smaller dimension and apply constraints
  const calculatedSize = Math.min(widthPerItem, heightPerItem);
  const finalSize = Math.max(
    deviceConfig.minItemSize,
    Math.min(deviceConfig.maxItemSize, calculatedSize)
  );

  return {
    pictographSize: Math.floor(finalSize),
    pictographSizeString: `${Math.floor(finalSize)}px`,
    gridGap: `${deviceConfig.gap}px`,
    deviceConfig,
  };
}

/**
 * Get device configuration for a device type.
 */
export function getDeviceConfig(deviceType: "mobile" | "tablet" | "desktop"): DeviceConfig {
  return DEVICE_CONFIGS[deviceType] ?? DEVICE_CONFIGS["desktop"]!;
}
