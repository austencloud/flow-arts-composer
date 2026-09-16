/**
 * Arrow Adjustment Pipeline
 *
 * Handles special placement lookups and directional tuple processing
 * to position arrows with pixel-perfect accuracy matching the browser renderer.
 *
 * Pipeline:
 * 1. Load special placement JSON for letter/gridMode/oriKey
 * 2. Look up adjustment by turns tuple and arrow key (color or motion type)
 * 3. Generate directional tuples from base adjustment
 * 4. Select tuple by quadrant index (based on arrow location)
 * 5. Return final adjustment [x, y]
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { GridLocation, GridMode, MotionType, Orientation } from "./enums.js";
import type { HandSide } from "@tka/tka-types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Package root: src/core -> package root (dev), or dist/index.js -> package root (esbuild bundle)
const inDist = __dirname.includes("dist");
const PACKAGE_ROOT = inDist ? join(__dirname, "..") : join(__dirname, "../..");
const ASSETS_ROOT = join(PACKAGE_ROOT, "assets");

export interface MotionAdjustmentInput {
  letter: string;
  motionType: string;
  rotationDirection: string;
  startLocation: string;
  endLocation: string;
  hand: HandSide;
  turns?: number | "fl";
  endOrientation?: string;
}

export interface PictographAdjustmentInput {
  letter: string;
  leftMotion: MotionAdjustmentInput;
  rightMotion: MotionAdjustmentInput;
  gridMode: GridMode;
  endPlacement?: string; // e.g., "alpha5", "beta3", "gamma11"
}

type TurnsTupleKey = string; // e.g., "(1, 1)", "(fl, 0.5)"
type AdjustmentKey = string; // "blue", "red", "pro", "anti", "float"
type PlacementData = Record<
  string,
  Record<TurnsTupleKey, Record<AdjustmentKey, [number, number]>>
>;

/**
 * - from_layer1: both motions have radial orientation (IN/OUT)
 * - from_layer2: both motions have non-radial orientation (CLOCK/COUNTER)
 * - from_layer3_blue1_red2: blue radial, red non-radial
 * - from_layer3_blue2_red1: blue non-radial, red radial
 */
export function calculateOriKey(
  leftEndOri: string,
  rightEndOri: string
): string {
  const leftLayer = ["in", "out"].includes(leftEndOri.toLowerCase()) ? 1 : 2;
  const rightLayer = ["in", "out"].includes(rightEndOri.toLowerCase()) ? 1 : 2;

  if (leftLayer === 1 && rightLayer === 1) return "from_layer1";
  if (leftLayer === 2 && rightLayer === 2) return "from_layer2";
  if (leftLayer === 1 && rightLayer === 2) return "from_layer3_blue1_red2";
  if (leftLayer === 2 && rightLayer === 1) return "from_layer3_blue2_red1";
  return "from_layer1";
}

function loadSpecialPlacement(
  gridMode: GridMode,
  oriKey: string,
  letter: string
): PlacementData | null {
  const gridModeStr =
    gridMode === GridMode.BOX
      ? "box"
      : gridMode === GridMode.SKEWED
        ? "skewed"
        : "diamond";
  const placementPath = join(
    ASSETS_ROOT,
    "data/arrow_placement",
    gridModeStr,
    "special",
    oriKey,
    `${letter}_placements.json`
  );

  if (!existsSync(placementPath)) {
    return null;
  }

  try {
    const content = readFileSync(placementPath, "utf-8");
    return JSON.parse(content) as PlacementData;
  } catch {
    return null;
  }
}

function formatTurnsTuple(
  leftTurns?: number | "fl",
  rightTurns?: number | "fl"
): string {
  const left = leftTurns === "fl" ? "fl" : (leftTurns ?? 0);
  const right = rightTurns === "fl" ? "fl" : (rightTurns ?? 0);
  return `(${left}, ${right})`;
}

/**
 * Tries the historical palette key first, then the motion type key.
 */
function lookupBaseAdjustment(
  data: PlacementData,
  letter: string,
  turnsTuple: string,
  hand: HandSide,
  motionType: string
): [number, number] | null {
  const letterData = data[letter];
  if (!letterData) return null;

  const tupleData = letterData[turnsTuple];
  if (!tupleData) return null;

  // Placement assets retain their historical blue/red keys.
  const legacyPaletteKey = hand === "left" ? "blue" : "red";
  if (tupleData[legacyPaletteKey]) {
    return tupleData[legacyPaletteKey];
  }

  // Try motion type key
  const normalizedType = motionType.toLowerCase();
  if (tupleData[normalizedType]) {
    return tupleData[normalizedType];
  }

  return null;
}

/**
 * Index order: NE=0, SE=1, SW=2, NW=3 (for diamond shift) or N=0, E=1, S=2, W=3 (for box shift)
 */
function calculateQuadrantIndex(
  location: GridLocation,
  motionType: MotionType,
  gridMode: GridMode
): number {
  const isShiftMotion = [
    MotionType.PRO,
    MotionType.ANTI,
    MotionType.FLOAT,
  ].includes(motionType);

  if (gridMode === GridMode.DIAMOND) {
    if (isShiftMotion) {
      // Diamond shift: NE=0, SE=1, SW=2, NW=3
      const mapping: Record<string, number> = {
        [GridLocation.NORTHEAST]: 0,
        [GridLocation.SOUTHEAST]: 1,
        [GridLocation.SOUTHWEST]: 2,
        [GridLocation.NORTHWEST]: 3,
      };
      return mapping[location] ?? 0;
    } else {
      // Diamond static/dash: N=0, E=1, S=2, W=3
      const mapping: Record<string, number> = {
        [GridLocation.NORTH]: 0,
        [GridLocation.EAST]: 1,
        [GridLocation.SOUTH]: 2,
        [GridLocation.WEST]: 3,
      };
      return mapping[location] ?? 0;
    }
  } else {
    // Box mode
    if (isShiftMotion) {
      // Box shift: N=0, E=1, S=2, W=3
      const mapping: Record<string, number> = {
        [GridLocation.NORTH]: 0,
        [GridLocation.EAST]: 1,
        [GridLocation.SOUTH]: 2,
        [GridLocation.WEST]: 3,
      };
      return mapping[location] ?? 0;
    } else {
      // Box static/dash: NE=0, SE=1, SW=2, NW=3
      const mapping: Record<string, number> = {
        [GridLocation.NORTHEAST]: 0,
        [GridLocation.SOUTHEAST]: 1,
        [GridLocation.SOUTHWEST]: 2,
        [GridLocation.NORTHWEST]: 3,
      };
      return mapping[location] ?? 0;
    }
  }
}

type Tuple = [number, number];

/**
 * Returns 4 tuples for indices 0-3 (NE, SE, SW, NW or N, E, S, W).
 */
function generateDirectionalTuples(
  motionType: string,
  rotationDirection: string,
  startLocation: string,
  endLocation: string,
  baseX: number,
  baseY: number
): Tuple[] {
  const mt = motionType.toLowerCase();
  const rot = rotationDirection.toLowerCase();

  // Infer grid mode from motion locations
  const cardinals = ["n", "e", "s", "w"];
  const gridIsDiamond =
    cardinals.includes(startLocation.toLowerCase()) ||
    cardinals.includes(endLocation.toLowerCase());

  const isCW = rot === "clockwise" || rot === "cw";
  const isCCW = rot === "counter_clockwise" || rot === "ccw";
  const isNoRot = rot === "norotation" || rot === "no_rotation";

  const tuple = (a: number, b: number): Tuple => [a, b];

  // SHIFT (pro/anti/float) for diamond grid
  const shiftDiamond = (): Tuple[] => {
    if (mt === "float") {
      // Determine cw/ccw from start->end
      const order = ["ne", "se", "sw", "nw"];
      const idxStart = order.indexOf(startLocation.toLowerCase());
      const idxEnd = order.indexOf(endLocation.toLowerCase());
      const cwStep = (idxStart + 1) % 4 === idxEnd;
      if (cwStep) {
        return [
          tuple(baseX, baseY),
          tuple(-baseY, baseX),
          tuple(-baseX, -baseY),
          tuple(baseY, -baseX),
        ];
      } else {
        return [
          tuple(-baseY, -baseX),
          tuple(baseX, -baseY),
          tuple(baseY, baseX),
          tuple(-baseX, baseY),
        ];
      }
    }
    if (mt === "pro" && isCW)
      return [
        tuple(baseX, baseY),
        tuple(-baseY, baseX),
        tuple(-baseX, -baseY),
        tuple(baseY, -baseX),
      ];
    if (mt === "pro" && isCCW)
      return [
        tuple(-baseY, -baseX),
        tuple(baseX, -baseY),
        tuple(baseY, baseX),
        tuple(-baseX, baseY),
      ];
    if (mt === "anti" && isCW)
      return [
        tuple(-baseY, -baseX),
        tuple(baseX, -baseY),
        tuple(baseY, baseX),
        tuple(-baseX, baseY),
      ];
    if (mt === "anti" && isCCW)
      return [
        tuple(baseX, baseY),
        tuple(-baseY, baseX),
        tuple(-baseX, -baseY),
        tuple(baseY, -baseX),
      ];
    return [
      tuple(baseX, baseY),
      tuple(baseX, baseY),
      tuple(baseX, baseY),
      tuple(baseX, baseY),
    ];
  };

  // SHIFT (pro/anti/float) for box grid
  const shiftBox = (): Tuple[] => {
    if (mt === "float") {
      const order = ["n", "e", "s", "w"];
      const idxStart = order.indexOf(startLocation.toLowerCase());
      const idxEnd = order.indexOf(endLocation.toLowerCase());
      const cwStep = (idxStart + 1) % 4 === idxEnd;
      if (cwStep) {
        return [
          tuple(baseX, baseY),
          tuple(-baseY, baseX),
          tuple(-baseX, -baseY),
          tuple(baseY, -baseX),
        ];
      } else {
        return [
          tuple(-baseY, -baseX),
          tuple(baseX, -baseY),
          tuple(baseY, baseX),
          tuple(-baseX, baseY),
        ];
      }
    }
    if (mt === "pro" && isCW)
      return [
        tuple(-baseX, baseY),
        tuple(-baseY, -baseX),
        tuple(baseX, -baseY),
        tuple(baseY, baseX),
      ];
    if (mt === "pro" && isCCW)
      return [
        tuple(baseX, baseY),
        tuple(-baseY, baseX),
        tuple(-baseX, -baseY),
        tuple(baseY, -baseX),
      ];
    if (mt === "anti" && isCW)
      return [
        tuple(-baseX, baseY),
        tuple(-baseY, -baseX),
        tuple(baseX, -baseY),
        tuple(baseY, baseX),
      ];
    if (mt === "anti" && isCCW)
      return [
        tuple(baseX, baseY),
        tuple(-baseY, baseX),
        tuple(-baseX, -baseY),
        tuple(baseY, -baseX),
      ];
    return [
      tuple(baseX, baseY),
      tuple(baseX, baseY),
      tuple(baseX, baseY),
      tuple(baseX, baseY),
    ];
  };

  // DASH for diamond grid
  // NOTE: The browser's DirectionalTupleProcessor has a bug where isNoRot never matches
  // (it checks rot === "noRotation" but rot is already lowercased). This means the browser
  // ALWAYS falls through to the default tuple for noRotation cases. We must match that
  // behavior for parity - noRotation uses the same uniform fallback as the default case.
  const dashDiamond = (): Tuple[] => {
    if (isCW)
      return [
        tuple(baseX, -baseY),
        tuple(baseY, baseX),
        tuple(-baseX, baseY),
        tuple(-baseY, -baseX),
      ];
    if (isCCW)
      return [
        tuple(-baseX, -baseY),
        tuple(baseY, -baseX),
        tuple(baseX, baseY),
        tuple(-baseY, baseX),
      ];
    // noRotation and default both use uniform tuple (browser parity - see note above)
    return [
      tuple(baseX, baseY),
      tuple(baseX, baseY),
      tuple(baseX, baseY),
      tuple(baseX, baseY),
    ];
  };

  // DASH for box grid
  // Same browser parity issue as dashDiamond - noRotation falls through to default
  const dashBox = (): Tuple[] => {
    if (isCW)
      return [
        tuple(-baseY, baseX),
        tuple(-baseX, -baseY),
        tuple(baseY, -baseX),
        tuple(baseX, baseY),
      ];
    if (isCCW)
      return [
        tuple(-baseX, baseY),
        tuple(-baseY, -baseX),
        tuple(baseX, -baseY),
        tuple(baseY, baseX),
      ];
    // noRotation and default both use uniform tuple (browser parity)
    return [
      tuple(baseX, baseY),
      tuple(baseX, baseY),
      tuple(baseX, baseY),
      tuple(baseX, baseY),
    ];
  };

  // STATIC for diamond grid
  const staticDiamond = (): Tuple[] => {
    if (isCW)
      return [
        tuple(baseX, -baseY),
        tuple(baseY, baseX),
        tuple(-baseX, baseY),
        tuple(-baseY, -baseX),
      ];
    if (isCCW)
      return [
        tuple(-baseX, -baseY),
        tuple(baseY, -baseX),
        tuple(baseX, baseY),
        tuple(-baseY, baseX),
      ];
    return [
      tuple(baseX, baseY),
      tuple(-baseX, -baseY),
      tuple(-baseY, baseX),
      tuple(baseY, -baseX),
    ];
  };

  // STATIC for box grid
  const staticBox = (): Tuple[] => {
    if (isCW)
      return [
        tuple(baseX, baseY),
        tuple(-baseY, baseX),
        tuple(-baseX, -baseY),
        tuple(baseY, -baseX),
      ];
    if (isCCW)
      return [
        tuple(-baseY, -baseX),
        tuple(baseX, -baseY),
        tuple(baseY, baseX),
        tuple(-baseX, baseY),
      ];
    return [
      tuple(baseX, baseY),
      tuple(-baseY, baseX),
      tuple(-baseX, -baseY),
      tuple(baseY, -baseX),
    ];
  };

  if (mt === "dash") {
    return gridIsDiamond ? dashDiamond() : dashBox();
  } else if (mt === "static") {
    return gridIsDiamond ? staticDiamond() : staticBox();
  } else {
    // pro/anti/float
    return gridIsDiamond ? shiftDiamond() : shiftBox();
  }
}

// Cache for loaded default placement data
const defaultPlacementCache: Record<
  string,
  Record<string, Record<string, [number, number]>>
> = {};

/**
 * Files are at: static/data/arrow_placement/{gridMode}/default/default_{gridMode}_{motionType}_placements.json
 */
function loadDefaultPlacementData(
  gridMode: GridMode,
  motionType: string
): Record<string, Record<string, [number, number]>> | null {
  const gridModeStr = gridMode === GridMode.BOX ? "box" : "diamond";
  const cacheKey = `${gridModeStr}_${motionType}`;

  if (defaultPlacementCache[cacheKey]) {
    return defaultPlacementCache[cacheKey];
  }

  const filePath = join(
    ASSETS_ROOT,
    "data/arrow_placement",
    gridModeStr,
    "default",
    `default_${gridModeStr}_${motionType}_placements.json`
  );

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    const data = JSON.parse(content) as Record<
      string,
      Record<string, [number, number]>
    >;
    defaultPlacementCache[cacheKey] = data;
    return data;
  } catch {
    return null;
  }
}

function getPlacementType(endPlacement?: string): string {
  if (!endPlacement) return "alpha";
  const lower = endPlacement.toLowerCase();
  if (lower.startsWith("alpha")) return "alpha";
  if (lower.startsWith("beta")) return "beta";
  if (lower.startsWith("gamma")) return "gamma";
  return "alpha";
}

/**
 * layer1 = radial (IN/OUT), layer2 = non-radial (CLOCK/COUNTER)
 */
function getLayerType(endOrientation?: string): string {
  if (!endOrientation) return "layer1";
  const lower = endOrientation.toLowerCase();
  if (lower === "in" || lower === "out") return "layer1";
  if (lower === "clock" || lower === "counter") return "layer2";
  return "layer1";
}

/**
 * Format: {motionType}_to_{layer}_{placementType}
 */
function generatePlacementKey(
  motionType: string,
  endOrientation?: string,
  endPlacement?: string
): string {
  const placementType = getPlacementType(endPlacement);
  const layerType = getLayerType(endOrientation);
  return `${motionType}_to_${layerType}_${placementType}`;
}

function getDefaultAdjustment(
  motionType: string,
  turns: number | "fl" | undefined,
  gridMode: GridMode,
  endOrientation?: string,
  endPlacement?: string
): [number, number] {
  const normalizedType = motionType.toLowerCase();
  const data = loadDefaultPlacementData(gridMode, normalizedType);

  if (!data) {
    return [0, 0];
  }

  const placementKey = generatePlacementKey(
    normalizedType,
    endOrientation,
    endPlacement
  );
  const turnsStr = turns === "fl" ? "fl" : (turns ?? 0).toString();

  const keyData = data[placementKey];
  if (keyData && keyData[turnsStr]) {
    return keyData[turnsStr];
  }

  // Try without the layer suffix as fallback
  const simpleKey = `${normalizedType}_to_layer1_${getPlacementType(endPlacement)}`;
  const simpleData = data[simpleKey];
  if (simpleData && simpleData[turnsStr]) {
    return simpleData[turnsStr];
  }

  return [0, 0];
}

/**
 * Calculate arrow adjustment for a motion.
 *
 * The adjustment pipeline:
 * 1. Get base adjustment from motion type + turns (ALWAYS applied)
 * 2. Process through directional tuples based on location/quadrant
 * 3. Optionally add special placement overrides if they exist
 * @param pictograph - Full pictograph data (needed for both motions' turns)
 * @param motion - The specific motion to get adjustment for
 * @param arrowLocation - Calculated arrow location (NE, SE, etc.)
 * @returns Adjustment [x, y]
 */
export function calculateArrowAdjustment(
  pictograph: PictographAdjustmentInput,
  motion: MotionAdjustmentInput,
  arrowLocation: GridLocation
): [number, number] {
  const leftEndOri = pictograph.leftMotion.endOrientation || "in";
  const rightEndOri = pictograph.rightMotion.endOrientation || "in";
  const oriKey = calculateOriKey(leftEndOri, rightEndOri);

  const placementData = loadSpecialPlacement(
    pictograph.gridMode,
    oriKey,
    pictograph.letter
  );

  let baseX = 0;
  let baseY = 0;
  let hasSpecialPlacement = false;

  if (placementData) {
    const turnsTuple = formatTurnsTuple(
      pictograph.leftMotion.turns,
      pictograph.rightMotion.turns
    );
    const specialAdjustment = lookupBaseAdjustment(
      placementData,
      pictograph.letter,
      turnsTuple,
      motion.hand,
      motion.motionType
    );

    if (specialAdjustment) {
      baseX = specialAdjustment[0];
      baseY = specialAdjustment[1];
      hasSpecialPlacement = true;
    }
  }

  if (!hasSpecialPlacement) {
    const defaultAdj = getDefaultAdjustment(
      motion.motionType,
      motion.turns,
      pictograph.gridMode,
      motion.endOrientation,
      pictograph.endPlacement
    );
    baseX = defaultAdj[0];
    baseY = defaultAdj[1];
  }

  const tuples = generateDirectionalTuples(
    motion.motionType,
    motion.rotationDirection,
    motion.startLocation,
    motion.endLocation,
    baseX,
    baseY
  );

  const motionTypeEnum = motion.motionType.toLowerCase() as MotionType;
  const quadrantIndex = calculateQuadrantIndex(
    arrowLocation,
    motionTypeEnum,
    pictograph.gridMode
  );
  const selectedTuple = tuples[quadrantIndex] || [0, 0];

  return selectedTuple;
}
