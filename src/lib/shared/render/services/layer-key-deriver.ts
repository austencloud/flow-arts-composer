/**
 * Layer Key Deriver
 *
 * Generates cache keys for individual layers.
 *
 * CRITICAL: Base layer keys EXCLUDE all visibility settings.
 * This allows the base layer cache to survive ALL visibility toggles.
 */

import type { PreparedPictographData } from "../../pictograph/shared/domain/models/prepared-pictograph-data";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type { LayerRenderOptions } from "../services/types";
import { renderedPropLook } from "../../pictograph/prop/domain/prop-look";
import { renderedTriangleGrip } from "../../pictograph/prop/domain/triangle-appearance";
import {
  isVisibleMotion,
  type MotionData,
} from "../../pictograph/shared/domain/models/motion-data";
import { gridJoinKey } from "@tka/render-core";

export interface BaseLayerKeyComponents {
  motionHash: string;
  fanAppearance?: string;
  // The model look swaps the prop artwork without touching the motion hash.
  propLook?: "model";
  // So does the triangle's side grip, in either look.
  triangleGrip?: "side";
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
  showPropTnD: boolean;
  /** Preimage key keeps its pre-rename spelling so stored keys stay stable. */
  showPositions: boolean;
  showHandColorKey: boolean;
  handPathMode: boolean;
  showGrid: boolean;
  /** Present only for joined grids (e.g. "e1"), so single-grid keys stay stable. */
  join?: string;
  // The grid's hand points are painted under the props in this layer.
  showNonRadialPoints: boolean;
  handPointVisibility: "all" | "active" | "none";
  /**
   * Only active hand points shown: the points each hand lights, so cells
   * lighting different points never share an image.
   */
  activeHandPoints?: string;
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
  const leftPropType = options.leftPropType ?? pictograph.motions?.left?.propType ?? "staff";
  const rightPropType = options.rightPropType ?? pictograph.motions?.right?.propType ?? "staff";
  const propLook = renderedPropLook(options.propLook, [leftPropType, rightPropType]);
  const triangleGrip = options.handPathMode
    ? undefined
    : renderedTriangleGrip(options.triangleGrip, [leftPropType, rightPropType]);
  return {
    motionHash: deriveMotionHash(pictograph),
    ...(options.fanAppearance && { fanAppearance: JSON.stringify(options.fanAppearance) }),
    ...(propLook && { propLook }),
    ...(triangleGrip && { triangleGrip }),
    leftPropType,
    rightPropType,
    leftBuugengFlipped: options.leftBuugengFlipped ?? false,
    rightBuugengFlipped: options.rightBuugengFlipped ?? false,
    darkMode: options.darkMode,
    size: options.size,
    showLeftMotion: options.showLeftMotion ?? true,
    showRightMotion: options.showRightMotion ?? true,
    showTnD: options.showTnD ?? false,
    showElemental: options.showElemental ?? false,
    showPropTnD: options.showPropTnD ?? false,
    showPositions: options.showPlacements ?? false,
    showHandColorKey: options.showHandColorKey ?? true,
    handPathMode: options.handPathMode ?? false,
    showGrid: options.showGrid ?? true,
    ...(pictograph._prepared?.join && {
      join: gridJoinKey(pictograph._prepared.join),
    }),
    showNonRadialPoints: options.showNonRadialPoints,
    handPointVisibility: options.handPointVisibility,
    ...(options.handPointVisibility === "active" && {
      activeHandPoints: activeHandPointsKey(pictograph),
    }),
  };
}

function activeHandPointsKey(pictograph: PreparedPictographData): string {
  const active = getJoinedActiveHandPoints(pictograph);
  return `b:${[...active.left].sort()}|r:${[...active.right].sort()}`;
}

export function deriveBaseLayerKey(
  pictograph: PreparedPictographData,
  options: LayerRenderOptions
): string {
  const components = getBaseLayerComponents(pictograph, options);
  return `base:${hashComponents(components)}`;
}

/**
 * The hand points each hand lights: its start and end locations (on joined
 * grids, in its own grid).
 */
export function getJoinedActiveHandPoints(
  pictograph: PreparedPictographData
): Record<"left" | "right", ReadonlySet<string>> {
  const lit = (motion: MotionData | undefined): ReadonlySet<string> => {
    const points = new Set<string>();
    if (!isVisibleMotion(motion)) return points;
    if (motion.startLocation) points.add(motion.startLocation.toLowerCase());
    if (motion.endLocation) points.add(motion.endLocation.toLowerCase());
    return points;
  };
  return {
    left: lit(pictograph.motions?.left),
    right: lit(pictograph.motions?.right),
  };
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
