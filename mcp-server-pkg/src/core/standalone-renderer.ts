/**
 * Standalone Pictograph Renderer - Node.js Implementation
 *
 * A properly-implemented renderer that uses the same calculation logic
 * as the Canvas2D browser renderer to achieve pixel-perfect parity.
 *
 * This replaces the half-assed StandalonePictographRenderer.ts that had
 * completely wrong position/rotation calculations.
 */

import { Resvg } from "@resvg/resvg-js";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { HandColorPair } from "@tka/render-composition";

import { GridLocation, GridMode, MotionType, Orientation } from "./enums.js";
// Import shared core calculations - the SINGLE SOURCE OF TRUTH for rendering logic
import {
  // Grid position calculations
  getLayer2PointCoordinates,
  // Prop placement calculations
  calculatePropPlacement,
  // Beta offset
  calculateBetaOffset,
  type BetaOffsetInput,
  type BetaMotionInput,
  calculateOrientations,
  type OrientationInput,
  calculateDashLocation,
  type DashLocationInput,
  calculateReversalPositions,
  BLUE_COLOR_DARK,
  BLUE_COLOR_LIGHT,
  RED_COLOR_DARK,
  RED_COLOR_LIGHT,
} from "@tka/render-core";
// Arrow calculations still use local files (they have MCP-specific logic)
import {
  calculateArrowPlacement,
  calculateArrowRotation,
} from "./arrow-placement.js";
import {
  calculateArrowAdjustment,
  type PictographAdjustmentInput,
  type MotionAdjustmentInput,
} from "./arrow-adjustment.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const VIEWBOX_SIZE = 950;
const CENTER = VIEWBOX_SIZE / 2; // 475

// Colors imported from shared core
// Use the shared constants for consistency
const BLUE_COLOR = BLUE_COLOR_DARK; // Dark mode blue - bright on dark backgrounds
const RED_COLOR = RED_COLOR_DARK; // Dark mode red - standard red works well

function resolveMotionColor(
  hand: "left" | "right",
  darkMode: boolean,
  customColors?: HandColorPair | null
): string {
  if (customColors) return customColors[hand];
  if (hand === "left") return darkMode ? BLUE_COLOR : BLUE_COLOR_LIGHT;
  return darkMode ? RED_COLOR : RED_COLOR_LIGHT;
}

// Glyph positioning (matching real renderer)
const TKA_GLYPH_X = 50;
const TKA_GLYPH_Y = 800;

const VTG_GLYPH_WIDTH = 201.24;
const VTG_GLYPH_HEIGHT = 133.6;
const VTG_OFFSET_PERCENTAGE = 0.04;

const POSITION_GLYPH_Y = 50;
const POSITION_SCALE_FACTOR = 0.75;
const POSITION_SPACING = 25;
const POSITION_ARROW_WIDTH = 88.9;
const POSITION_ARROW_HEIGHT = 34.8;

// Position letter dimensions (from actual SVG viewBoxes)
const POSITION_LETTER_DIMENSIONS: Record<
  string,
  { width: number; height: number; yOffset: number }
> = {
  alpha: { width: 92.22, height: 100, yOffset: 10.0 },
  beta: { width: 66.05, height: 100, yOffset: 0.0 },
  gamma: { width: 79, height: 100.11, yOffset: 0.0 },
};

// Turn number constants
const TURN_NUMBER_HEIGHT = 45; // All turn numbers have height 45
const TURN_PADDING_X = 15; // Gap between letter and turn numbers
const TURN_TOP_Y = -5; // Y offset for the left-hand turn number
const TURN_NUMBER_WIDTHS: Record<string, number> = {
  "0.5": 80,
  "1": 30,
  "1.5": 80,
  "2": 30,
  "2.5": 83.67,
  "3": 30,
  fl: 42.4,
};

// VTG mode lookup tables
type VTGMode = "SS" | "SO" | "TS" | "TO" | "QS" | "QO";
const DIAMOND_VTG_MAP: Record<
  string,
  VTGMode | ((startPos: string) => VTGMode)
> = {
  A: "SS",
  B: "SS",
  C: "SS",
  D: (startPos) =>
    ["beta3", "beta7"].includes(startPos.toLowerCase()) ? "SO" : "TO",
  E: (startPos) =>
    ["beta3", "beta7"].includes(startPos.toLowerCase()) ? "SO" : "TO",
  F: (startPos) =>
    ["beta3", "beta7"].includes(startPos.toLowerCase()) ? "SO" : "TO",
  G: "TS",
  H: "TS",
  I: "TS",
  J: (startPos) =>
    ["alpha1", "alpha5"].includes(startPos.toLowerCase()) ? "SO" : "TO",
  K: (startPos) =>
    ["alpha1", "alpha5"].includes(startPos.toLowerCase()) ? "SO" : "TO",
  L: (startPos) =>
    ["alpha1", "alpha5"].includes(startPos.toLowerCase()) ? "SO" : "TO",
  M: "QO",
  N: "QO",
  O: "QO",
  P: "QO",
  Q: "QO",
  R: "QO",
  S: "QS",
  T: "QS",
  U: "QS",
  V: "QS",
};

// Elemental glyph constants
const ELEMENTAL_GLYPH_WIDTH = 95;
const ELEMENTAL_GLYPH_HEIGHT = 125;
const ELEMENTAL_OFFSET_PERCENTAGE = 0.04;

// Type1 letters (A-V) - only these show elemental glyphs
const TYPE1_LETTERS = new Set([
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
]);

// Letter to type folder mapping for loading correct SVG glyphs
const LETTER_TYPE_FOLDER: Record<string, string> = {
  // Type 1: Dual-Shift (A-V)
  A: "Type1",
  B: "Type1",
  C: "Type1",
  D: "Type1",
  E: "Type1",
  F: "Type1",
  G: "Type1",
  H: "Type1",
  I: "Type1",
  J: "Type1",
  K: "Type1",
  L: "Type1",
  M: "Type1",
  N: "Type1",
  O: "Type1",
  P: "Type1",
  Q: "Type1",
  R: "Type1",
  S: "Type1",
  T: "Type1",
  U: "Type1",
  V: "Type1",
  // Type 2: Shift (one hand shifts, one static)
  W: "Type2",
  X: "Type2",
  Y: "Type2",
  Z: "Type2",
  Σ: "Type2",
  Δ: "Type2",
  Θ: "Type2",
  Ω: "Type2",
  μ: "Type2",
  ν: "Type2",
  // Type 3: Cross-Shift (Shift + Dash combination)
  "W-": "Type3",
  "X-": "Type3",
  "Y-": "Type3",
  "Z-": "Type3",
  "Σ-": "Type3",
  "Δ-": "Type3",
  "Θ-": "Type3",
  "Ω-": "Type3",
  // Type 4: Dash (one hand dashes, one static)
  Φ: "Type4",
  Ψ: "Type4",
  Λ: "Type4",
  // Type 5: Dual-Dash (both hands dash)
  "Φ-": "Type5",
  "Ψ-": "Type5",
  "Λ-": "Type5",
  // Type 6: Static (no motion)
  α: "Type6",
  β: "Type6",
  γ: "Type6",
  ζ: "Type6",
  η: "Type6",
  τ: "Type6",
  "⊕": "Type6",
};

// VTG mode to elemental type mapping
type ElementalType = "water" | "fire" | "earth" | "air" | "sun" | "moon";
const VTG_TO_ELEMENTAL: Record<VTGMode, ElementalType> = {
  SS: "water", // Split Same
  SO: "fire", // Split Opp
  TS: "earth", // Tog Same
  TO: "air", // Tog Opp
  QS: "sun", // Quarter Same
  QO: "moon", // Quarter Opp
};

export interface MotionInput {
  motionType: string;
  rotationDirection: string;
  startLocation: string;
  endLocation: string;
  startOrientation?: string;
  endOrientation?: string;
  hand: "left" | "right";
  turns?: number | "fl"; // 0, 0.5, 1, 1.5, 2, 2.5, 3, or "fl" (float)
}

export interface PictographInput {
  letter: string;
  startPosition?: string;
  endPosition?: string;
  leftMotion: MotionInput;
  rightMotion: MotionInput;
  gridMode?: string;
  /** Whether the left-hand motion has a reversal (direction change from previous step) */
  leftReversal?: boolean;
  /** Whether the right-hand motion has a reversal (direction change from previous step) */
  rightReversal?: boolean;
  /** Whether the beta offset is swapped between hands. */
  betaSwapped?: boolean;
}

export interface RenderVisibilityOptions {
  darkMode?: boolean;
  size?: number;
  showTKA?: boolean;
  showTND?: boolean;
  showElemental?: boolean;
  showPositions?: boolean;
  showReversals?: boolean;
  showGrid?: boolean;
  showNonRadialPoints?: boolean;
  showLeftMotion?: boolean;
  showRightMotion?: boolean;
  // Prop type options (null = use default staff)
  leftPropType?: string | null;
  rightPropType?: string | null;
  primaryPropColors?: HandColorPair | null;
}

export class StandaloneRenderer {
  private assetsRoot: string;

  constructor() {
    // Resolve to the package root where assets/ lives
    // When compiled: esbuild bundles to dist/index.js -> go up 1 level to package root
    // When dev (tsx): src/core -> go up 2 levels to package root
    const inDist = __dirname.includes("dist");
    const packageRoot = inDist
      ? join(__dirname, "..") // dist/index.js (esbuild bundle) -> package root
      : join(__dirname, "../.."); // src/core -> package root
    this.assetsRoot = join(packageRoot, "assets");
  }

  /**
   * If startOrientation is not provided, defaults to IN.
   * If endOrientation is not provided, calculates it from motion parameters.
   */
  private ensureOrientations(motion: MotionInput): MotionInput {
    const { startOrientation, endOrientation } = calculateOrientations({
      motionType: motion.motionType,
      turns: motion.turns,
      rotationDirection: motion.rotationDirection,
      startLocation: motion.startLocation,
      endLocation: motion.endLocation,
      startOrientation: motion.startOrientation,
    });

    return {
      ...motion,
      startOrientation: motion.startOrientation || startOrientation,
      endOrientation: motion.endOrientation || endOrientation,
    };
  }

  private preprocessInput(input: PictographInput): PictographInput {
    return {
      ...input,
      leftMotion: this.ensureOrientations(input.leftMotion),
      rightMotion: this.ensureOrientations(input.rightMotion),
    };
  }

  async renderToPng(
    input: PictographInput,
    options: RenderVisibilityOptions = {}
  ): Promise<Buffer> {
    const svg = await this.renderToSvg(input, options);
    return this.svgToPng(svg, options.size || 950);
  }

  async renderToBase64(
    input: PictographInput,
    options: RenderVisibilityOptions = {}
  ): Promise<string> {
    const png = await this.renderToPng(input, options);
    return png.toString("base64");
  }

  async renderToSvg(
    rawInput: PictographInput,
    options: RenderVisibilityOptions = {}
  ): Promise<string> {
    // Preprocess input to ensure orientations are calculated
    const input = this.preprocessInput(rawInput);

    const {
      darkMode = true,
      showTKA = true,
      showTND = false,
      showElemental = false,
      showPositions = false,
      showReversals = false,
      showGrid = true,
      showLeftMotion = true,
      showRightMotion = true,
      leftPropType = null,
      rightPropType = null,
      primaryPropColors = null,
    } = options;

    const gridMode = this.parseGridMode(input.gridMode);
    const svgParts: string[] = [];

    // 1. Background
    const bgColor = darkMode ? "#0a0a0f" : "#ffffff";
    svgParts.push(
      `<rect width="${VIEWBOX_SIZE}" height="${VIEWBOX_SIZE}" fill="${bgColor}"/>`
    );

    // 2. Grid
    if (showGrid) {
      const gridSvg = this.renderGrid(darkMode);
      if (gridSvg) svgParts.push(gridSvg);
    }

    // 3. Props (using CORRECT placement logic with beta offset)
    // Pass BOTH propTypes to each renderProp call so beta offset can detect when both are hands
    if (showLeftMotion) {
      const leftProp = this.renderProp(
        input,
        input.leftMotion,
        gridMode,
        darkMode,
        leftPropType,
        rightPropType,
        primaryPropColors
      );
      if (leftProp) svgParts.push(leftProp);
    }
    if (showRightMotion) {
      const rightProp = this.renderProp(
        input,
        input.rightMotion,
        gridMode,
        darkMode,
        leftPropType,
        rightPropType,
        primaryPropColors
      );
      if (rightProp) svgParts.push(rightProp);
    }

    // 4. Arrows (using CORRECT placement logic WITH adjustments)
    if (showLeftMotion) {
      const leftArrow = this.renderArrow(
        input,
        input.leftMotion,
        gridMode,
        darkMode,
        primaryPropColors
      );
      if (leftArrow) svgParts.push(leftArrow);
    }
    if (showRightMotion) {
      const rightArrow = this.renderArrow(
        input,
        input.rightMotion,
        gridMode,
        darkMode,
        primaryPropColors
      );
      if (rightArrow) svgParts.push(rightArrow);
    }

    // 5. Position glyph (top center)
    if (showPositions && input.startPosition && input.endPosition) {
      const positionSvg = this.renderPositionGlyph(
        input.startPosition,
        input.endPosition,
        darkMode
      );
      if (positionSvg) svgParts.push(positionSvg);
    }

    // 6. Elemental glyph (top right) - only for Type1 letters
    if (showElemental && input.letter && input.startPosition) {
      const elementalSvg = this.renderElementalGlyph(
        input.letter,
        input.startPosition,
        darkMode
      );
      if (elementalSvg) svgParts.push(elementalSvg);
    }

    // 7. TKA Letter glyph with turn numbers (bottom left)
    if (showTKA && input.letter) {
      const letterSvg = this.renderLetterWithTurns(
        input.letter,
        input.leftMotion?.turns,
        input.rightMotion?.turns,
        darkMode,
        primaryPropColors
      );
      if (letterSvg) svgParts.push(letterSvg);
    }

    // 8. TnD glyph (bottom right)
    if (showTND && input.letter && input.startPosition) {
      const vtgSvg = this.renderVTGGlyph(
        input.letter,
        input.startPosition,
        darkMode
      );
      if (vtgSvg) svgParts.push(vtgSvg);
    }

    // 9. Reversal indicators (left edge)
    if (showReversals && (input.leftReversal || input.rightReversal)) {
      const reversalSvg = this.renderReversalIndicators(
        input.leftReversal ?? false,
        input.rightReversal ?? false,
        darkMode,
        primaryPropColors
      );
      if (reversalSvg) svgParts.push(reversalSvg);
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}" width="${VIEWBOX_SIZE}" height="${VIEWBOX_SIZE}">
${svgParts.join("\n")}
</svg>`;
  }

  private renderGrid(darkMode: boolean): string {
    const gridPath = join(this.assetsRoot, "images/grid/diamond_grid.svg");

    if (!existsSync(gridPath)) {
      console.error("[Renderer] Grid file not found:", gridPath);
      return "";
    }

    try {
      let gridSvg = readFileSync(gridPath, "utf-8");

      // Extract inner content
      const innerMatch = gridSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
      let innerContent = innerMatch ? innerMatch[1] : gridSvg;

      // Grid SVG has several issues to address:
      // 1. Outer circles and center point have NO fill attribute (default black)
      // 2. Hand points use class="normal-hand-point" with fill:currentColor
      // 3. Layer 2 points use fill:none (not visible in normal mode)
      //
      // Solution: Add explicit fill to circles without fill attribute
      const gridColor = darkMode ? "#d0d0d0" : "#000000";
      const opacity = darkMode ? "0.85" : "1.0"; // Solid black in light mode

      // Add fill attribute to circles that don't have one
      // The regex matches <circle that is NOT followed by fill= before the >
      innerContent = innerContent.replace(
        /<circle(?![^>]*fill=)/g,
        `<circle fill="${gridColor}"`
      );

      // Replace currentColor with the grid color (for hand points with fill:currentColor in CSS)
      // The CSS class .normal-hand-point { fill: currentColor } needs the color property set
      if (darkMode) {
        innerContent = innerContent.replace(/#000000/gi, gridColor);
        innerContent = innerContent.replace(/black/gi, gridColor);
      }

      return `<g style="color: ${gridColor}" opacity="${opacity}">${innerContent}</g>`;
    } catch (error) {
      console.error("[Renderer] Failed to load grid:", error);
      return "";
    }
  }

  /**
   * Uses comprehensive direction maps that depend on location, orientation, and color.
   */
  private calculateBetaOffsetForProp(
    pictograph: PictographInput,
    motion: MotionInput,
    gridMode: GridMode,
    leftPropType: string | null = null,
    rightPropType: string | null = null
  ): { x: number; y: number } {
    // Build input for beta offset calculation
    // CRITICAL: Pass both prop types so beta-offset can detect when BOTH are hands
    const betaInput: BetaOffsetInput = {
      leftMotion: {
        startLocation: pictograph.leftMotion.startLocation,
        endLocation: pictograph.leftMotion.endLocation,
        endOrientation: pictograph.leftMotion.endOrientation,
        motionType: pictograph.leftMotion.motionType,
        hand: "left",
        propType: leftPropType || undefined,
      },
      rightMotion: {
        startLocation: pictograph.rightMotion.startLocation,
        endLocation: pictograph.rightMotion.endLocation,
        endOrientation: pictograph.rightMotion.endOrientation,
        motionType: pictograph.rightMotion.motionType,
        hand: "right",
        propType: rightPropType || undefined,
      },
      letter: pictograph.letter,
      gridMode,
    };

    // Target motion gets its own propType for offset direction calculation
    const targetPropType =
      motion.hand === "left" ? leftPropType : rightPropType;
    const targetMotion: BetaMotionInput = {
      startLocation: motion.startLocation,
      endLocation: motion.endLocation,
      endOrientation: motion.endOrientation,
      motionType: motion.motionType,
      hand: motion.hand,
      propType: targetPropType || undefined,
    };

    const offset = calculateBetaOffset(betaInput, targetMotion);

    if (pictograph.betaSwapped) {
      return { x: -offset.x, y: -offset.y };
    }

    return offset;
  }

  private renderProp(
    pictograph: PictographInput,
    motion: MotionInput,
    gridMode: GridMode,
    darkMode: boolean,
    leftPropType: string | null = null,
    rightPropType: string | null = null,
    customColors?: HandColorPair | null
  ): string {
    // Get the end location and orientation
    const endLocation = motion.endLocation.toLowerCase() as GridLocation;
    const endOrientation = (
      motion.endOrientation || Orientation.IN
    ).toLowerCase() as Orientation;

    // Use the CORRECTLY PORTED placement calculation
    const placement = calculatePropPlacement(
      endLocation,
      endOrientation,
      gridMode
    );

    // Apply beta offset if both props end at the same location
    // Pass BOTH propTypes so hand props get the special "right on right, left on left" logic
    const betaOffset = this.calculateBetaOffsetForProp(
      pictograph,
      motion,
      gridMode,
      leftPropType,
      rightPropType
    );
    const finalX = placement.x + betaOffset.x;
    const finalY = placement.y + betaOffset.y;

    // Determine prop file name - use provided prop type or default to staff
    // Use the current motion's prop type
    const currentPropType =
      motion.hand === "left" ? leftPropType : rightPropType;
    const propFileName = currentPropType
      ? `${currentPropType}.svg`
      : "staff.svg";
    const propPath = join(this.assetsRoot, "images/props", propFileName);
    if (!existsSync(propPath)) {
      console.error("[Renderer] Prop file not found:", propPath);
      return "";
    }

    // HAND PROP SPECIAL LOGIC (matching PropPlacer.ts and PropSvg.svelte):
    // 1. Hands should NEVER rotate - always use 0 degrees orientation
    // 2. Right hands are always mirrored (scaleX(-1)) to show anatomy correctly.
    const isHand = currentPropType === "hand";
    const isRightHand = isHand && motion.hand === "right";
    const rotation = isHand ? 0 : placement.rotation;

    try {
      let propSvg = readFileSync(propPath, "utf-8");

      // Get viewBox dimensions
      const viewBoxMatch = propSvg.match(/viewBox\s*=\s*"([^"]+)"/i);
      let width = 100,
        height = 100;
      if (viewBoxMatch) {
        const parts = viewBoxMatch[1].split(/\s+/).map(parseFloat);
        width = parts[2] || 100;
        height = parts[3] || 100;
      }

      // Extract inner content
      const innerMatch = propSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
      let innerContent = innerMatch ? innerMatch[1] : propSvg;

      // Apply color - replace any existing fill colors with the prop color
      // Staff SVG uses #2e3192 as its base color
      const color = resolveMotionColor(motion.hand, darkMode, customColors);

      innerContent = innerContent.replace(/#000000/gi, color);
      innerContent = innerContent.replace(/black/gi, color);
      innerContent = innerContent.replace(/#2e3192/gi, color); // Staff/arrow base color
      innerContent = innerContent.replace(/#bdbdbd/gi, color); // Club body; hardware keeps authored colors
      innerContent = innerContent.replace(/#00f/gi, color); // Center point marker

      // The prop's center point is at the middle of its viewBox
      const centerX = width / 2;
      const centerY = height / 2;

      // Canvas2D renderer draws props at their FULL viewBox dimensions
      // within the 950x950 scene - NO additional scaling
      // Transform: translate to position → rotate → mirror the right hand → translate by -center
      const mirrorTransform = isRightHand ? " scale(-1, 1)" : "";
      return `<g transform="translate(${finalX}, ${finalY}) rotate(${rotation})${mirrorTransform} translate(${-centerX}, ${-centerY})">
  ${innerContent}
</g>`;
    } catch (error) {
      console.error("[Renderer] Failed to load prop:", error);
      return "";
    }
  }

  private renderArrow(
    pictograph: PictographInput,
    motion: MotionInput,
    gridMode: GridMode,
    darkMode: boolean,
    customColors?: HandColorPair | null
  ): string {
    const motionType = motion.motionType.toLowerCase();

    // Static motions don't have arrows
    if (motionType === "static") {
      return "";
    }

    const startLocation = motion.startLocation.toLowerCase() as GridLocation;
    const endLocation = motion.endLocation.toLowerCase() as GridLocation;
    const startOrientation = motion.startOrientation?.toLowerCase() as
      | Orientation
      | undefined;

    // Check if orientation is radial (IN/OUT vs CLOCK/COUNTER)
    const isRadialOrientation =
      startOrientation === Orientation.IN ||
      startOrientation === Orientation.OUT;

    let placement;

    // For DASH motions, use the dash location calculator
    if (motionType === "dash") {
      // Get the "other" motion for dash location calculation
      const otherMotion =
        motion.hand === "left" ? pictograph.rightMotion : pictograph.leftMotion;

      const dashLocationInput: DashLocationInput = {
        letter: pictograph.letter,
        motionHand: motion.hand,
        motionStartLocation: motion.startLocation,
        motionEndLocation: motion.endLocation,
        motionTurns: motion.turns,
        motionRotationDirection: motion.rotationDirection,
        otherMotionType: otherMotion?.motionType,
        otherMotionStartLocation: otherMotion?.startLocation,
        otherMotionEndLocation: otherMotion?.endLocation,
        otherMotionTurns: otherMotion?.turns,
        otherMotionRotationDirection: otherMotion?.rotationDirection,
        gridMode,
      };

      const dashLocation = calculateDashLocation(dashLocationInput);

      // DEBUG: Log W- left-hand dash location calculation
      if (pictograph.letter === "W-" && motion.hand === "left") {
        console.error(`[DEBUG W- BLUE DASH] dashLocation=${dashLocation}`);
        console.error(
          `[DEBUG W- BLUE DASH] input: startLoc=${motion.startLocation}, endLoc=${motion.endLocation}, turns=${motion.turns}`
        );
        console.error(
          `[DEBUG W- BLUE DASH] other: type=${otherMotion?.motionType}, start=${otherMotion?.startLocation}, end=${otherMotion?.endLocation}`
        );
      }

      // Get coordinates for the calculated dash location
      const position = getLayer2PointCoordinates(dashLocation, gridMode);

      // Calculate rotation for dash arrow at this location
      const rotation = calculateArrowRotation(
        motionType,
        dashLocation,
        motion.rotationDirection,
        startLocation,
        endLocation,
        isRadialOrientation
      );

      placement = {
        x: position.x,
        y: position.y,
        rotation,
        location: dashLocation,
      };
    } else {
      // Use the standard placement calculation for non-dash motions
      placement = calculateArrowPlacement(
        motionType as MotionType,
        startLocation,
        endLocation,
        motion.rotationDirection,
        gridMode,
        isRadialOrientation
      );
    }

    // Calculate arrow adjustment from special placement data
    const adjustmentInput: PictographAdjustmentInput = {
      letter: pictograph.letter,
      gridMode,
      endPosition: pictograph.endPosition,
      leftMotion: {
        letter: pictograph.letter,
        motionType: pictograph.leftMotion.motionType,
        rotationDirection: pictograph.leftMotion.rotationDirection,
        startLocation: pictograph.leftMotion.startLocation,
        endLocation: pictograph.leftMotion.endLocation,
        hand: "left",
        turns: pictograph.leftMotion.turns,
        endOrientation: pictograph.leftMotion.endOrientation as
          | string
          | undefined,
      },
      rightMotion: {
        letter: pictograph.letter,
        motionType: pictograph.rightMotion.motionType,
        rotationDirection: pictograph.rightMotion.rotationDirection,
        startLocation: pictograph.rightMotion.startLocation,
        endLocation: pictograph.rightMotion.endLocation,
        hand: "right",
        turns: pictograph.rightMotion.turns,
        endOrientation: pictograph.rightMotion.endOrientation as
          | string
          | undefined,
      },
    };

    const motionAdjustmentInput: MotionAdjustmentInput = {
      letter: pictograph.letter,
      motionType: motion.motionType,
      rotationDirection: motion.rotationDirection,
      startLocation: motion.startLocation,
      endLocation: motion.endLocation,
      hand: motion.hand,
      turns: motion.turns,
      endOrientation: motion.endOrientation as string | undefined,
    };

    const [adjustX, adjustY] = calculateArrowAdjustment(
      adjustmentInput,
      motionAdjustmentInput,
      placement.location as GridLocation
    );

    // Apply adjustment to placement
    const finalX = placement.x + adjustX;
    const finalY = placement.y + adjustY;

    // DEBUG: Log final placement for W- left-hand dash
    if (pictograph.letter === "W-" && motion.hand === "left") {
      console.error(
        `[DEBUG W- BLUE FINAL] placement.x=${placement.x}, placement.y=${placement.y}, rotation=${placement.rotation}`
      );
      console.error(
        `[DEBUG W- BLUE FINAL] adjustX=${adjustX}, adjustY=${adjustY}`
      );
      console.error(`[DEBUG W- BLUE FINAL] finalX=${finalX}, finalY=${finalY}`);
    }

    // Determine arrow file path based on motion type and start orientation
    const arrowPath = this.getArrowPath(
      motionType,
      startOrientation,
      motion.turns
    );
    if (!arrowPath || !existsSync(arrowPath)) {
      console.error("[Renderer] Arrow file not found:", arrowPath);
      return "";
    }

    try {
      let arrowSvg = readFileSync(arrowPath, "utf-8");

      // Get viewBox dimensions
      const viewBoxMatch = arrowSvg.match(/viewBox\s*=\s*"([^"]+)"/i);
      let width = 100,
        height = 100;
      if (viewBoxMatch) {
        const parts = viewBoxMatch[1].split(/\s+/).map(parseFloat);
        width = Math.abs(parts[2]) || 100;
        height = Math.abs(parts[3]) || 100;
      }

      // Extract inner content
      const innerMatch = arrowSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
      let innerContent = innerMatch ? innerMatch[1] : arrowSvg;

      // Apply color - replace any existing fill colors with the arrow color
      // Arrow SVGs use #2e3192 as their base color
      const color = resolveMotionColor(motion.hand, darkMode, customColors);

      innerContent = innerContent.replace(/#000000/gi, color);
      innerContent = innerContent.replace(/black/gi, color);
      innerContent = innerContent.replace(/#2e3192/gi, color); // Arrow base color

      const centerX = width / 2;
      const centerY = height / 2;

      // Determine if arrow should be mirrored (matching browser logic)
      // Anti + cw → Mirror = True
      // Anti + ccw → Mirror = False
      // Pro + cw → Mirror = False
      // Pro + ccw → Mirror = True
      // No rotation → Mirror = False (no-rotation dashes are symmetric)
      const rotDir = motion.rotationDirection.toLowerCase();
      const isNoRotation =
        rotDir === "no_rot" ||
        rotDir === "no_rotation" ||
        rotDir === "norotation";
      const isCW = rotDir === "cw" || rotDir === "clockwise";
      const shouldMirror = isNoRotation
        ? false
        : motionType === "anti"
          ? isCW
          : !isCW;

      // Canvas2D renderer transform order:
      // translate to position → rotate → mirror (if needed) → translate by -center
      const mirrorTransform = shouldMirror ? " scale(-1, 1)" : "";
      return `<g transform="translate(${finalX}, ${finalY}) rotate(${placement.rotation})${mirrorTransform} translate(${-centerX}, ${-centerY})">
  ${innerContent}
</g>`;
    } catch (error) {
      console.error("[Renderer] Failed to load arrow:", error);
      return "";
    }
  }

  private getArrowPath(
    motionType: string,
    startOrientation: Orientation | undefined,
    turns: number | "fl" | undefined
  ): string {
    // Float turns use a special arrow that's the same regardless of motion type
    // Located at static/images/arrows/float.svg
    if (turns === "fl") {
      return join(this.assetsRoot, "images/arrows/float.svg");
    }

    // Arrow files are organized by START orientation, not location
    // "from_radial" = starts from radial orientation (IN/OUT)
    // "from_nonradial" = starts from non-radial orientation (CLOCK/COUNTER)
    const isNonRadial =
      startOrientation === Orientation.CLOCK ||
      startOrientation === Orientation.COUNTER;
    const startType = isNonRadial ? "from_nonradial" : "from_radial";

    // Format turns for filename (0, 0.5, 1, 1.5, 2, 2.5, 3)
    const turnsNum = turns ?? 0;
    // Arrow files use .0 suffix for whole numbers (e.g., pro_1.0.svg, pro_3.0.svg)
    const turnsStr = Number.isInteger(turnsNum)
      ? `${turnsNum}.0`
      : turnsNum.toString();

    if (motionType === "dash") {
      return join(
        this.assetsRoot,
        "images/arrows/dash",
        startType,
        `dash_${turnsStr}.svg`
      );
    }

    // For pro/anti/static, use the from_radial/from_nonradial structure
    return join(
      this.assetsRoot,
      "images/arrows",
      motionType,
      startType,
      `${motionType}_${turnsStr}.svg`
    );
  }

  private renderTurnNumbers(
    leftTurns: number | "fl" | undefined,
    rightTurns: number | "fl" | undefined,
    letterWidth: number,
    letterHeight: number,
    darkMode: boolean,
    customColors?: HandColorPair | null
  ): string {
    const parts: string[] = [];

    // Position calculation matches turn-position-calculator.ts
    const PADDING_X = 15;
    const PADDING_Y = 5;
    const NUMBER_HEIGHT = 45;

    const baseX = letterWidth + PADDING_X;
    const topY = -PADDING_Y;
    const bottomY = letterHeight - NUMBER_HEIGHT + PADDING_Y;

    // Render the top turn number for the left-hand motion.
    if (leftTurns !== undefined && leftTurns !== 0) {
      const topTurnSvg = this.renderSingleTurnNumber(
        leftTurns,
        baseX,
        topY,
        "blue",
        darkMode,
        customColors
      );
      if (topTurnSvg) parts.push(topTurnSvg);
    }

    // Render the bottom turn number for the right-hand motion.
    if (rightTurns !== undefined && rightTurns !== 0) {
      const bottomTurnSvg = this.renderSingleTurnNumber(
        rightTurns,
        baseX,
        bottomY,
        "red",
        darkMode,
        customColors
      );
      if (bottomTurnSvg) parts.push(bottomTurnSvg);
    }

    return parts.join("\n");
  }

  private renderSingleTurnNumber(
    turns: number | "fl",
    x: number,
    y: number,
    color: "blue" | "red",
    darkMode: boolean,
    customColors?: HandColorPair | null
  ): string {
    // Convert turns value to filename
    const filename = turns === "fl" ? "float.svg" : `${turns}.svg`;
    const turnPath = join(this.assetsRoot, "images/numbers", filename);

    if (!existsSync(turnPath)) {
      console.error("[Renderer] Turn number file not found:", turnPath);
      return "";
    }

    try {
      let turnSvg = readFileSync(turnPath, "utf-8");

      // Get viewBox dimensions
      const viewBoxMatch = turnSvg.match(/viewBox\s*=\s*"([^"]+)"/i);
      let viewBox = "0 0 30 45";
      let width = 30,
        height = 45;
      if (viewBoxMatch) {
        viewBox = viewBoxMatch[1];
        const parts = viewBox.split(/\s+/).map(parseFloat);
        width = parts[2] || 30;
        height = parts[3] || 45;
      }

      // Extract inner content
      const innerMatch = turnSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
      let innerContent = innerMatch ? innerMatch[1] : turnSvg;

      // Apply color - turn numbers use CSS class with fill: #010101
      // IMPORTANT: We must convert CSS class fills to inline fills because multiple
      // embedded SVGs with the same class names (.cls-1) will conflict in the document
      const fillColor = resolveMotionColor(
        color === "blue" ? "left" : "right",
        darkMode,
        customColors
      );

      // Remove the entire <defs><style>...</style></defs> block to avoid CSS conflicts
      innerContent = innerContent.replace(/<defs>[\s\S]*?<\/defs>/gi, "");
      // Also remove standalone <style> blocks (float.svg has style without defs wrapper)
      innerContent = innerContent.replace(
        /<style[^>]*>[\s\S]*?<\/style>/gi,
        ""
      );

      // Add inline fill to paths that use CSS classes (cls-1 or st0 depending on SVG source)
      // cls-1 is used by most number SVGs, st0 is used by float.svg
      innerContent = innerContent.replace(
        /class="cls-1"/gi,
        `fill="${fillColor}"`
      );
      innerContent = innerContent.replace(
        /class="st0"/gi,
        `fill="${fillColor}"`
      );

      // Also replace any existing fill colors just in case
      innerContent = innerContent.replace(
        /fill="#010101"/gi,
        `fill="${fillColor}"`
      );
      innerContent = innerContent.replace(
        /fill="#000000"/gi,
        `fill="${fillColor}"`
      );
      innerContent = innerContent.replace(
        /fill="black"/gi,
        `fill="${fillColor}"`
      );

      return `<svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="${viewBox}">
  ${innerContent}
</svg>`;
    } catch (error) {
      console.error("[Renderer] Failed to load turn number:", error);
      return "";
    }
  }

  private renderLetterWithTurns(
    letter: string,
    leftTurns: number | "fl" | undefined,
    rightTurns: number | "fl" | undefined,
    darkMode: boolean,
    customColors?: HandColorPair | null
  ): string {
    // Determine the correct type folder for this letter
    const typeFolder = LETTER_TYPE_FOLDER[letter] || "Type1";
    const letterPath = join(
      this.assetsRoot,
      "images/letters_trimmed",
      typeFolder,
      `${letter}.svg`
    );

    if (!existsSync(letterPath)) {
      const textColor = darkMode ? "#e6e6e6" : "#000000";
      return `<text x="${TKA_GLYPH_X}" y="${TKA_GLYPH_Y + 80}" font-family="Georgia, serif" font-size="100" font-weight="bold" fill="${textColor}">${letter}</text>`;
    }

    try {
      let letterSvg = readFileSync(letterPath, "utf-8");

      // Get the FULL viewBox - including any offset (critical for trimmed letters)
      const viewBoxMatch = letterSvg.match(/viewBox\s*=\s*"([^"]+)"/i);
      let viewBox = "0 0 100 100";
      let width = 100,
        height = 100;
      if (viewBoxMatch) {
        viewBox = viewBoxMatch[1];
        const parts = viewBox.split(/\s+/).map(parseFloat);
        width = parts[2] || 100;
        height = parts[3] || 100;
      }

      // Extract inner content
      const innerMatch = letterSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
      let innerContent = innerMatch ? innerMatch[1] : letterSvg;

      // Apply dark mode color
      // Many SVGs don't specify fill color (defaulting to black) - we need to add explicit fill
      if (darkMode) {
        innerContent = innerContent.replace(/#000000/gi, "#e6e6e6");
        innerContent = innerContent.replace(/black/gi, "#e6e6e6");
        // For paths without explicit fill, add one (handles SVGs that rely on default black)
        innerContent = innerContent.replace(
          /<path(?![^>]*fill=)/gi,
          '<path fill="#e6e6e6" '
        );
      }

      // Render turn numbers (positioned relative to letter)
      const turnNumbersSvg = this.renderTurnNumbers(
        leftTurns,
        rightTurns,
        width,
        height,
        darkMode,
        customColors
      );

      // Combine letter and turn numbers in a group
      return `<g transform="translate(${TKA_GLYPH_X}, ${TKA_GLYPH_Y})">
  <svg width="${width}" height="${height}" viewBox="${viewBox}">
    ${innerContent}
  </svg>
${turnNumbersSvg}
</g>`;
    } catch (error) {
      console.error("[Renderer] Failed to load letter:", error);
      const textColor = darkMode ? "#e6e6e6" : "#000000";
      return `<text x="${TKA_GLYPH_X}" y="${TKA_GLYPH_Y + 80}" font-family="Georgia, serif" font-size="100" font-weight="bold" fill="${textColor}">${letter}</text>`;
    }
  }

  private renderVTGGlyph(
    letter: string,
    startPosition: string,
    darkMode: boolean
  ): string {
    const vtgMode = this.calculateVTGMode(letter, startPosition);
    if (!vtgMode) return "";

    const vtgPath = join(
      this.assetsRoot,
      "images/vtg_glyphs",
      `${vtgMode}.svg`
    );
    if (!existsSync(vtgPath)) {
      console.error("[Renderer] TnD glyph not found:", vtgPath);
      return "";
    }

    try {
      let vtgSvg = readFileSync(vtgPath, "utf-8");

      // Extract inner content
      const innerMatch = vtgSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
      let innerContent = innerMatch ? innerMatch[1] : vtgSvg;

      // Apply dark mode color
      // Many SVGs don't specify fill color (defaulting to black) - we need to add explicit fill
      if (darkMode) {
        innerContent = innerContent.replace(/#000000/gi, "#e6e6e6");
        innerContent = innerContent.replace(/black/gi, "#e6e6e6");
        // For paths without explicit fill, add one (handles SVGs that rely on default black)
        innerContent = innerContent.replace(
          /<path(?![^>]*fill=)/gi,
          '<path fill="#e6e6e6" '
        );
      }

      // Position in bottom-right corner
      const offsetWidth = VIEWBOX_SIZE * VTG_OFFSET_PERCENTAGE;
      const offsetHeight = VIEWBOX_SIZE * VTG_OFFSET_PERCENTAGE;
      const xPosition = VIEWBOX_SIZE - VTG_GLYPH_WIDTH - offsetWidth;
      const yPosition = VIEWBOX_SIZE - VTG_GLYPH_HEIGHT - offsetHeight;

      return `<g transform="translate(${xPosition}, ${yPosition})">
  <svg width="${VTG_GLYPH_WIDTH}" height="${VTG_GLYPH_HEIGHT}" viewBox="0 0 201.24 133.6">
    ${innerContent}
  </svg>
</g>`;
    } catch (error) {
      console.error("[Renderer] Failed to load TnD glyph:", error);
      return "";
    }
  }

  /**
   * Only shows for Type1 letters (A-V)
   */
  private renderElementalGlyph(
    letter: string,
    startPosition: string,
    darkMode: boolean
  ): string {
    const letterUpper = letter.toUpperCase();

    // Only show for Type1 letters
    if (!TYPE1_LETTERS.has(letterUpper)) {
      return "";
    }

    // Calculate elemental type from VTG mode
    const vtgMode = this.calculateVTGMode(letter, startPosition);
    if (!vtgMode) return "";

    const elementalType = VTG_TO_ELEMENTAL[vtgMode];
    if (!elementalType) return "";

    const elementalPath = join(
      this.assetsRoot,
      "images/elements",
      `${elementalType}.svg`
    );
    if (!existsSync(elementalPath)) {
      console.error("[Renderer] Elemental glyph not found:", elementalPath);
      return "";
    }

    try {
      let elementalSvg = readFileSync(elementalPath, "utf-8");

      // Extract viewBox from original SVG
      const viewBoxMatch = elementalSvg.match(/viewBox="([^"]+)"/i);
      const viewBox = viewBoxMatch ? viewBoxMatch[1] : "0 0 95 125";

      // Extract inner content
      const innerMatch = elementalSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
      let innerContent = innerMatch ? innerMatch[1] : elementalSvg;

      // Parse CSS classes and their fill colors from <style> block
      const styleMatch = innerContent.match(/<style>([\s\S]*?)<\/style>/i);
      const classToFill: Record<string, string> = {};

      if (styleMatch) {
        const styleContent = styleMatch[1];
        // Match patterns like ".cls-1 { fill: #63b7cd; }" or ".cls-3 { fill: url(#Sky_4); }"
        const classMatches = styleContent.matchAll(
          /\.(cls-\d+|st\d+)\s*\{[^}]*fill:\s*([^;}\s]+)/gi
        );
        for (const match of classMatches) {
          classToFill[match[1]] = match[2];
        }
      }

      // Extract gradient definitions (linearGradient, radialGradient) - need to preserve these
      const defsMatch = innerContent.match(/<defs>([\s\S]*?)<\/defs>/i);
      let gradientDefs = "";
      if (defsMatch) {
        // Extract only gradient definitions, not the style block
        const defsContent = defsMatch[1];
        const gradientMatches = defsContent.match(
          /<linearGradient[\s\S]*?<\/linearGradient>|<radialGradient[\s\S]*?<\/radialGradient>/gi
        );
        if (gradientMatches) {
          // Make gradient IDs unique by prefixing with element type
          gradientDefs = gradientMatches
            .join("\n")
            .replace(/id="([^"]+)"/g, `id="${elementalType}_$1"`)
            .replace(
              /xlink:href="#([^"]+)"/g,
              `xlink:href="#${elementalType}_$1"`
            );
        }
      }

      // Remove entire defs block (we'll add gradients back separately)
      innerContent = innerContent.replace(/<defs>[\s\S]*?<\/defs>/gi, "");

      // Replace CSS classes with inline fill attributes
      for (const [className, fillValue] of Object.entries(classToFill)) {
        // Update gradient references to use unique IDs
        let actualFill = fillValue;
        if (fillValue.startsWith("url(#")) {
          actualFill = fillValue.replace(
            /url\(#([^)]+)\)/,
            `url(#${elementalType}_$1)`
          );
        }
        const classRegex = new RegExp(`class="${className}"`, "gi");
        innerContent = innerContent.replace(classRegex, `fill="${actualFill}"`);
      }

      // Also handle fill-rule if present (fire uses this)
      innerContent = innerContent.replace(/fill-rule:\s*evenodd;?/gi, "");
      // Add fill-rule as attribute where needed (check if cls-1 or cls-2 had fill-rule)
      if (styleMatch && styleMatch[1].includes("fill-rule: evenodd")) {
        innerContent = innerContent.replace(
          /<path /g,
          '<path fill-rule="evenodd" '
        );
      }

      // Position in top-right corner (matching ElementalGlyph.svelte)
      const offsetWidth = VIEWBOX_SIZE * ELEMENTAL_OFFSET_PERCENTAGE;
      const offsetHeight = VIEWBOX_SIZE * ELEMENTAL_OFFSET_PERCENTAGE;
      const xPosition = VIEWBOX_SIZE - ELEMENTAL_GLYPH_WIDTH - offsetWidth;
      const yPosition = offsetHeight;

      // Build the final SVG with gradient defs at the top level
      const defsBlock = gradientDefs ? `<defs>${gradientDefs}</defs>` : "";

      return `<g>
  ${defsBlock}
  <svg x="${xPosition}" y="${yPosition}" width="${ELEMENTAL_GLYPH_WIDTH}" height="${ELEMENTAL_GLYPH_HEIGHT}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">
    ${innerContent}
  </svg>
</g>`;
    } catch (error) {
      console.error("[Renderer] Failed to load elemental glyph:", error);
      return "";
    }
  }

  private renderPositionGlyph(
    startPosition: string,
    endPosition: string,
    darkMode: boolean
  ): string {
    const startGroup = this.extractPositionGroup(startPosition);
    const endGroup = this.extractPositionGroup(endPosition);

    if (!startGroup || !endGroup) return "";

    const groupToSvg: Record<string, string> = {
      alpha: "α.svg",
      beta: "β.svg",
      gamma: "γ.svg",
    };

    const startFileName = groupToSvg[startGroup];
    const endFileName = groupToSvg[endGroup];

    if (!startFileName || !endFileName) return "";

    const startPath = join(
      this.assetsRoot,
      "images/letters_trimmed/Type6",
      startFileName
    );
    const endPath = join(
      this.assetsRoot,
      "images/letters_trimmed/Type6",
      endFileName
    );
    const arrowPath = join(this.assetsRoot, "images/arrow.svg");

    if (
      !existsSync(startPath) ||
      !existsSync(endPath) ||
      !existsSync(arrowPath)
    ) {
      console.error("[Renderer] Position glyph files not found");
      return "";
    }

    try {
      // Load SVG and extract both content and viewBox
      const loadAndProcess = (
        filePath: string,
        isArrow: boolean = false
      ): { content: string; viewBox: string } => {
        const svg = readFileSync(filePath, "utf-8");

        // Extract viewBox from original SVG
        const viewBoxMatch = svg.match(/viewBox="([^"]+)"/i);
        const viewBox = viewBoxMatch ? viewBoxMatch[1] : "0 0 100 100";

        // Extract inner content
        const innerMatch = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
        let content = innerMatch ? innerMatch[1] : svg;

        // Remove CSS style blocks (resvg doesn't handle CSS in nested SVGs)
        content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

        const fillColor = darkMode ? "#e6e6e6" : "#231F20";

        if (isArrow) {
          // Arrow SVG uses .st0 for stroke line, .st1 for fill polygon
          content = content.replace(
            /class="st0"/gi,
            `fill="none" stroke="${fillColor}" stroke-width="4" stroke-miterlimit="10"`
          );
          content = content.replace(/class="st1"/gi, `fill="${fillColor}"`);
        } else {
          // Position letters (α, β, γ) - add fill to paths without one
          content = content.replace(
            /<path(?![^>]*fill)/g,
            `<path fill="${fillColor}"`
          );
        }

        // Replace any remaining color references
        if (darkMode) {
          content = content.replace(/#231F20/gi, "#e6e6e6");
          content = content.replace(/#000000/gi, "#e6e6e6");
          content = content.replace(/black/gi, "#e6e6e6");
        }
        return { content, viewBox };
      };

      const start = loadAndProcess(startPath);
      const end = loadAndProcess(endPath);
      const arrow = loadAndProcess(arrowPath, true); // isArrow = true

      // Use max letter width (92.22) for consistent spacing, same as browser
      const LETTER_WIDTH = 92.22;
      const LETTER_HEIGHT = 100;

      // Calculate dimensions
      const scaledLetterWidth = LETTER_WIDTH * POSITION_SCALE_FACTOR;
      const scaledLetterHeight = LETTER_HEIGHT * POSITION_SCALE_FACTOR;
      const scaledArrowWidth = POSITION_ARROW_WIDTH * POSITION_SCALE_FACTOR;
      const scaledArrowHeight = POSITION_ARROW_HEIGHT * POSITION_SCALE_FACTOR;

      // Calculate positions (matching browser's PositionGlyph.svelte exactly)
      const centerLine = scaledLetterHeight / 2;
      const startX = 0;
      const startY = centerLine - scaledLetterHeight / 2;
      const arrowX =
        scaledLetterWidth + POSITION_SPACING * POSITION_SCALE_FACTOR;
      const arrowY = centerLine - scaledArrowHeight / 2;
      const endX = scaledLetterWidth + scaledArrowWidth + POSITION_SPACING;
      const endY = centerLine - scaledLetterHeight / 2;

      // Total width for centering (browser uses: scaledLetterWidth + scaledArrowWidth + scaledLetterWidth + SPACING)
      const totalWidth =
        scaledLetterWidth +
        scaledArrowWidth +
        scaledLetterWidth +
        POSITION_SPACING;
      const groupX = VIEWBOX_SIZE / 2 - totalWidth / 2;

      // Use the actual viewBox from each SVG file, preserving aspect ratio with preserveAspectRatio="xMidYMid meet"
      return `<g transform="translate(${groupX}, ${POSITION_GLYPH_Y})">
  <svg x="${startX}" y="${startY}" width="${scaledLetterWidth}" height="${scaledLetterHeight}" viewBox="${start.viewBox}" preserveAspectRatio="xMidYMid meet">
    ${start.content}
  </svg>
  <svg x="${arrowX}" y="${arrowY}" width="${scaledArrowWidth}" height="${scaledArrowHeight}" viewBox="${arrow.viewBox}" preserveAspectRatio="xMidYMid meet">
    ${arrow.content}
  </svg>
  <svg x="${endX}" y="${endY}" width="${scaledLetterWidth}" height="${scaledLetterHeight}" viewBox="${end.viewBox}" preserveAspectRatio="xMidYMid meet">
    ${end.content}
  </svg>
</g>`;
    } catch (error) {
      console.error("[Renderer] Failed to render position glyph:", error);
      return "";
    }
  }

  /**
   * Uses the shared core calculateReversalPositions for consistent positioning
   * across both browser and MCP renderers.
   *
   * Positioning (from unified core, matching ReversalIndicators.svelte):
   * - Single reversal: dot is centered vertically at CENTER_Y (475)
   * - Both reversals: RED on top, BLUE on bottom, spaced by DOT_SPACING
   * - All dots are at X_POSITION (71.5) on the left edge
   */
  private renderReversalIndicators(
    leftReversal: boolean,
    rightReversal: boolean,
    darkMode: boolean,
    customColors?: HandColorPair | null
  ): string {
    // Use shared core calculation for positioning
    const { dots } = calculateReversalPositions(
      leftReversal,
      rightReversal,
      darkMode
    );

    if (dots.length === 0) return "";

    const circles = dots.map((dot) => {
      const hand =
        dot.color === BLUE_COLOR_DARK || dot.color === BLUE_COLOR_LIGHT
          ? "left"
          : "right";
      return `<circle cx="${dot.cx}" cy="${dot.cy}" r="${dot.r}" fill="${resolveMotionColor(hand, darkMode, customColors)}"/>`;
    });

    return `<g class="reversal-indicators">${circles.join("\n")}</g>`;
  }

  private parseGridMode(gridMode?: string): GridMode {
    if (!gridMode) return GridMode.DIAMOND;
    const normalized = gridMode.toLowerCase();
    if (normalized === "box") return GridMode.BOX;
    if (normalized === "skewed") return GridMode.SKEWED;
    return GridMode.DIAMOND;
  }

  private calculateVTGMode(
    letter: string,
    startPosition: string
  ): VTGMode | null {
    const letterUpper = letter.toUpperCase();
    if (letterUpper.length !== 1 || letterUpper < "A" || letterUpper > "V") {
      return null;
    }

    const modeOrFunction = DIAMOND_VTG_MAP[letterUpper];
    if (!modeOrFunction) return null;

    if (typeof modeOrFunction === "function") {
      return modeOrFunction(startPosition);
    }
    return modeOrFunction;
  }

  private extractPositionGroup(position: string): string | null {
    const match = position.match(/[a-z]+/i);
    return match ? match[0].toLowerCase() : null;
  }

  private svgToPng(svg: string, size: number): Buffer {
    const resvg = new Resvg(svg, {
      fitTo: {
        mode: "width",
        value: size,
      },
      font: {
        loadSystemFonts: true,
      },
    });

    const pngData = resvg.render();
    return Buffer.from(pngData.asPng());
  }
}

// Singleton instance
let rendererInstance: StandaloneRenderer | null = null;

export function getStandaloneRenderer(): StandaloneRenderer {
  if (!rendererInstance) {
    rendererInstance = new StandaloneRenderer();
  }
  return rendererInstance;
}
