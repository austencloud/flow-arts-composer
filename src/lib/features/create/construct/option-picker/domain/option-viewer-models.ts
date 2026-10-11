import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";

export interface OptionPickerLayout {
  optionsPerRow: number;
  optionSize: number;
  gridGap: string;
  gridColumns: string;
  containerWidth: number;
  containerHeight: number;
}

export interface OptionSelection {
  option: PictographData;
  timestamp: number;
}
export interface DeviceConfig {
  padding: {
    horizontal: number;
    vertical: number;
  };
  gap: number;
  minItemSize: number;
  maxItemSize: number;
  scaleFactor: number;
}

export interface SizingCalculationParams {
  count: number;
  containerWidth: number;
  containerHeight: number;
  columns: number;
  isMobileDevice: boolean;
  deviceType?: string;
}

export interface SizingResult {
  pictographSize: number;
  pictographSizeString: string;
  gridGap: string;
  deviceConfig: DeviceConfig;
  calculationDetails: {
    availableWidth: number;
    availableHeight: number;
    widthPerItem: number;
    heightPerItem: number;
    rawCalculatedSize: number;
    scaledSize: number;
    finalSize: number;
  };
}
