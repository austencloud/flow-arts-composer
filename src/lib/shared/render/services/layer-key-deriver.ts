/**
 * Layer Key Deriver
 *
 * Generates cache keys for individual layers.
 *
 * CRITICAL: Base layer keys EXCLUDE all visibility settings.
 * This allows the base layer cache to survive ALL visibility toggles.
 */

import type { PreparedPictographData } from "../../pictograph/shared/domain/models/prepared-pictograph-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { LayerRenderOptions } from "../services/types";

export interface BaseLayerKeyComponents {
  motionHash: string;
  fanAppearance?: string;
  leftPropType: string;
  rightPropType: string;
  // Chirality mirrors the prop AND (via the preparer) can collapse the beta
  // separation offset, so it is base-layer image identity.
  leftBuugengFlipped: boolean;
  rightBuugengFlipped: boolean;
  darkMode: boolean;
  size: number;
  showLeftMotion: boolean;
  showRightMotion: boolean;
  showTnD: boolean;
  showElemental: boolean;
  showPositions: boolean;
  handPathMode: boolean;
  showGrid: boolean;
}

export interface GridPointsLayerKeyComponents {
  showNonRadialPoints: boolean;
  handPointVisibility: "all" | "active" | "none";
  gridMode: string;
  darkMode: boolean;
  size: number;
  showGrid: boolean;
}

export interface TKALayerKeyComponents {
  letter: string;
  turnsTuple: string;
  leftMotionType: string;
  rightMotionType: string;
  darkMode: boolean;
  size: number;
}

export interface ReversalLayerKeyComponents {
  leftReversal: boolean;
  rightReversal: boolean;
  size: number;
}

export interface StepLayerKeyComponents {
  stepNumber: number;
  darkMode: boolean;
  size: number;
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

function hashComponents(obj: object): string {
  const str = JSON.stringify(obj, Object.keys(obj).sort());
  return simpleHash(str);
}

function deriveMotionHash(pictograph: PreparedPictographData): string {
  const leftMotion = pictograph.motions?.left;
  const rightMotion = pictograph.motions?.right;

  const parts: string[] = [];

  if (leftMotion) {
    parts.push(`b:${leftMotion.motionType ?? ""}:${leftMotion.startLocation ?? ""}:${leftMotion.endLocation ?? ""}`);
    parts.push(`bt:${leftMotion.turns ?? 0}:${leftMotion.rotationDirection ?? ""}`);
    parts.push(`bo:${leftMotion.startOrientation ?? ""}:${leftMotion.endOrientation ?? ""}`);
  }

  if (rightMotion) {
    parts.push(`r:${rightMotion.motionType ?? ""}:${rightMotion.startLocation ?? ""}:${rightMotion.endLocation ?? ""}`);
    parts.push(`rt:${rightMotion.turns ?? 0}:${rightMotion.rotationDirection ?? ""}`);
    parts.push(`ro:${rightMotion.startOrientation ?? ""}:${rightMotion.endOrientation ?? ""}`);
  }

  const prepared = pictograph._prepared;
  if (prepared?.gridMode) {
    parts.push(`g:${prepared.gridMode}`);
  }

  return simpleHash(parts.join("|"));
}

export function getBaseLayerComponents(
  pictograph: PreparedPictographData,
  options: LayerRenderOptions
): BaseLayerKeyComponents {
  return {
    motionHash: deriveMotionHash(pictograph),
    ...(options.fanAppearance && { fanAppearance: JSON.stringify(options.fanAppearance) }),
    leftPropType: options.leftPropType ?? pictograph.motions?.left?.propType ?? "staff",
    rightPropType: options.rightPropType ?? pictograph.motions?.right?.propType ?? "staff",
    leftBuugengFlipped: options.leftBuugengFlipped ?? false,
    rightBuugengFlipped: options.rightBuugengFlipped ?? false,
    darkMode: options.darkMode,
    size: options.size,
    showLeftMotion: options.showLeftMotion ?? true,
    showRightMotion: options.showRightMotion ?? true,
    showTnD: options.showTnD ?? false,
    showElemental: options.showElemental ?? false,
    showPositions: options.showPositions ?? false,
    handPathMode: options.handPathMode ?? false,
    showGrid: options.showGrid ?? true,
  };
}

export function deriveBaseLayerKey(
  pictograph: PreparedPictographData,
  options: LayerRenderOptions
): string {
  const components = getBaseLayerComponents(pictograph, options);
  return `base:${hashComponents(components)}`;
}

export function getGridPointsLayerComponents(
  pictograph: PreparedPictographData,
  options: LayerRenderOptions
): GridPointsLayerKeyComponents {
  const prepared = pictograph._prepared;
  return {
    showNonRadialPoints: options.showNonRadialPoints,
    handPointVisibility: options.handPointVisibility,
    gridMode: prepared?.gridMode ?? "diamond",
    darkMode: options.darkMode,
    size: options.size,
    showGrid: options.showGrid ?? true,
  };
}

export function deriveGridPointsLayerKey(
  pictograph: PreparedPictographData,
  options: LayerRenderOptions
): string {
  const components = getGridPointsLayerComponents(pictograph, options);
  return `grid:${hashComponents(components)}`;
}

export function getTKALayerComponents(
  pictograph: PreparedPictographData,
  turnsTuple: string,
  options: Pick<LayerRenderOptions, "size" | "darkMode">
): TKALayerKeyComponents {
  return {
    letter: String(pictograph.letter ?? ""),
    turnsTuple,
    leftMotionType: pictograph.motions?.left?.motionType ?? "",
    rightMotionType: pictograph.motions?.right?.motionType ?? "",
    darkMode: options.darkMode,
    size: options.size,
  };
}

export function deriveTKALayerKey(
  pictograph: PreparedPictographData,
  turnsTuple: string,
  options: Pick<LayerRenderOptions, "size" | "darkMode">
): string {
  const components = getTKALayerComponents(pictograph, turnsTuple, options);
  return `tka:${hashComponents(components)}`;
}

export function getReversalLayerComponents(
  stepData: StepData,
  size: number
): ReversalLayerKeyComponents {
  return {
    leftReversal: stepData.leftReversal ?? false,
    rightReversal: stepData.rightReversal ?? false,
    size,
  };
}

export function deriveReversalLayerKey(stepData: StepData, size: number): string {
  const components = getReversalLayerComponents(stepData, size);
  return `rev:${components.leftReversal ? "b" : ""}${components.rightReversal ? "r" : ""}_${size}`;
}

export function deriveBeatLayerKey(stepNumber: number, darkMode: boolean, size: number): string {
  return `beat:${stepNumber}_${darkMode ? "d" : "l"}_${size}`;
}
