/**
 * Arrow Placement Service Contracts
 *
 * Interfaces for arrow placement calculations and key generation.
 */

import type { MotionType } from "../../../../shared/domain/enums/pictograph-enums";
import type { GridMode } from "../../../../grid/domain/enums/grid-enums";
import type { PictographData } from "../../../../shared/domain/models/pictograph-data";
import type { MotionData } from "../../../../shared/domain/models/motion-data";
import type { Point } from "#lib/shared/pictograph/arrow/orchestration/domain/point.js";

export interface SpecialPlacer {
  getSpecialAdjustment(
    motionData: MotionData,
    pictographData: PictographData,
    arrowColor?: string,
    attributeKey?: string
  ): Promise<Point | null>;

  hasRotationAngleOverride(
    motionData: MotionData,
    pictographData: PictographData,
    rotationOverrideKey: string
  ): Promise<boolean>;
}

export interface DefaultPlacer {
  getDefaultAdjustment(
    placementKey: string,
    turns: number | string,
    motionType: MotionType,
    gridMode: GridMode,
    propType?: string
  ): Promise<{ x: number; y: number }>;

  getAvailablePlacementKeys(
    motionType: MotionType,
    gridMode: GridMode
  ): Promise<string[]>;

  isLoaded(): boolean;

  getPlacementData(
    motionType: MotionType,
    placementKey: string,
    gridMode: GridMode
  ): Promise<{ [turns: string]: [number, number] }>;

  debugAvailableKeys(motionType: MotionType, gridMode: GridMode): Promise<void>;
}

export interface IArrowAdjustmentLookup {
  getBaseAdjustment(
    pictographData: PictographData,
    motionData: MotionData,
    letter: string,
    arrowColor?: string
  ): Promise<Point>;
}

