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
import type { HandSide } from "@tka/tka-types";
import type { HandColorPair } from "@tka/render-composition";

import {
  GridMode,
  Orientation,
  type GridLocation,
  type MotionType,
} from "./enums.js";
import {
  getLayer2PointCoordinates,
  getNormalHandPointCoordinates,
  calculatePropPlacement,
  pictographRequiresStrictHandpoints,
  calculateBetaOffset,
  type BetaOffsetInput,
  type BetaMotionInput,
  calculateOrientations,
  type OrientationInput,
  calculateDashLocation,
  type DashLocationInput,
  calculateReversalPositions,
  calculateHandColorKeyLayout,
  HAND_COLOR_KEY,
  applyColorToSvg,
  applyFanFrameColor,
  applyFanPaperContrast,
  SELECTIVE_COLOR_PROP_TYPES,
  BLUE_COLOR_DARK,
  BLUE_COLOR_LIGHT,
  RED_COLOR_DARK,
  RED_COLOR_LIGHT,
  resolveFullArrowAssetPath,
  type MotionType as RenderMotionType,
  type Orientation as RenderOrientation,
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

// CONSTANTS (matching Canvas2DDirectRenderer.ts exactly)

const VIEWBOX_SIZE = 950;
const CENTER = VIEWBOX_SIZE / 2; // 475

// Colors imported from shared core
// Use the shared constants for consistency
const BLUE_COLOR = BLUE_COLOR_DARK; // Dark mode blue - bright on dark backgrounds
const RED_COLOR = RED_COLOR_DARK; // Dark mode red - standard red works well

// Glyph positioning (matching real renderer)
const TKA_GLYPH_X = 50;
const TKA_GLYPH_Y = 800;

const VTG_GLYPH_WIDTH = 201.24;
const VTG_GLYPH_HEIGHT = 133.6;
const VTG_OFFSET_PERCENTAGE = 0.04;

const PLACEMENT_GLYPH_Y = 50;
const PLACEMENT_SCALE_FACTOR = 0.75;
const PLACEMENT_SPACING = 25;
const PLACEMENT_ARROW_WIDTH = 88.9;
const PLACEMENT_ARROW_HEIGHT = 34.8;

// Placement letter dimensions (from actual SVG viewBoxes)
const PLACEMENT_LETTER_DIMENSIONS: Record<
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
const TURN_TOP_Y = -5; // Y offset for top (blue) turn number
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
  hand: HandSide;
  turns?: number | "fl"; // Includes Level 6 quarter turns such as 0.25, plus "fl" (float)
}

export interface PictographInput {
  letter: string;
  startPlacement?: string;
  endPlacement?: string;
  leftMotion: MotionInput;
  rightMotion: MotionInput;
  gridMode?: string;
  /** Whether the left motion has a reversal (direction change from previous step) */
  leftReversal?: boolean;
  /** Whether the right motion has a reversal (direction change from previous step) */
  rightReversal?: boolean;
}

export interface RenderVisibilityOptions {
  darkMode?: boolean;
  size?: number;
  showTKA?: boolean;
  showTND?: boolean;
  showElemental?: boolean;
  showPlacements?: boolean;
  showReversals?: boolean;
  /** Start-placement legend: L/R swatches in the bottom-centre band. */
  showHandColorKey?: boolean;
  showGrid?: boolean;
  showNonRadialPoints?: boolean;
  showLeftMotion?: boolean;
  showRightMotion?: boolean;
  // Prop type options (null = use default staff)
  leftPropType?: string | null;
  rightPropType?: string | null;
  /** Physical fan build used when either hand holds fan or bigfan. */
  fanAppearance?: FanAppearanceInput | null;
  primaryPropColors?: HandColorPair | null;
  /** When true, use CSS custom properties for colors */
  themeable?: boolean;
  /** When true, omit XML declaration for inline HTML embedding */
  inline?: boolean;
}

const FAN_BUILDS = [
  "pictograph",
  "fire",
  "flat-grip",
  "lotus",
  "day",
  "moon",
] as const;
type FanBuild = (typeof FAN_BUILDS)[number];

export interface FanAppearanceInput {
  build?: FanBuild;
  frameColor?: "black" | "white";
  cover?: "bare" | "covered";
}

interface ResolvedFanAppearance {
  build: FanBuild;
  frameColor: "black" | "white";
  cover: "bare" | "covered";
}

const DEFAULT_FAN_APPEARANCE: ResolvedFanAppearance = {
  build: "fire",
  frameColor: "black",
  cover: "bare",
};

function resolveFanAppearance(
  value: FanAppearanceInput | null | undefined
): ResolvedFanAppearance {
  return {
    build: FAN_BUILDS.includes(value?.build as FanBuild)
      ? (value?.build as FanBuild)
      : DEFAULT_FAN_APPEARANCE.build,
    frameColor: value?.frameColor === "white" ? "white" : "black",
    cover: value?.cover === "covered" ? "covered" : "bare",
  };
}

function isFanPropType(propType: string | null): boolean {
  const normalized = propType?.toLowerCase();
  return normalized === "fan" || normalized === "bigfan";
}

function fanAppearanceFile(appearance: ResolvedFanAppearance): string | null {
  if (appearance.build === "pictograph") return null;
  if (appearance.build === "fire") {
    return appearance.cover === "covered"
      ? "fan-fire-covered.svg"
      : "fan-fire.svg";
  }
  if (appearance.build === "day") {
    return appearance.cover === "covered"
      ? "fan-day-covered.svg"
      : "fan-day.svg";
  }
  return `fan-${appearance.build}.svg`;
}

export class StandaloneRenderer {
  private projectRoot: string;

  constructor() {
    // When compiled, code runs from mcp-server/dist/src/core
    // Go up 4 levels to reach project root (dist -> mcp-server -> project root)
    // Check if we're in dist (compiled) or src (dev with tsx)
    const inDist = __dirname.includes("dist");
    this.projectRoot = inDist
      ? join(__dirname, "../../../..") // dist/src/core -> project root
      : join(__dirname, "../../.."); // src/core -> project root
  }

  /**
   * Ensure orientations are calculated for a motion.
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

  /**
   * Preprocess pictograph input to ensure all orientations are calculated.
   */
  private preprocessInput(input: PictographInput): PictographInput {
    return {
      ...input,
      leftMotion: this.ensureOrientations(input.leftMotion),
      rightMotion: this.ensureOrientations(input.rightMotion),
    };
  }

  /**
   * Render a pictograph to PNG buffer
   */
  async renderToPng(
    input: PictographInput,
    options: RenderVisibilityOptions = {}
  ): Promise<Buffer> {
    const svg = await this.renderToSvg(input, {
      ...options,
      themeable: false,
      inline: false,
    });
    return this.svgToPng(svg, options.size || 400);
  }

  /**
   * Render to base64-encoded PNG
   */
  async renderToBase64(
    input: PictographInput,
    options: RenderVisibilityOptions = {}
  ): Promise<string> {
    const png = await this.renderToPng(input, options);
    return png.toString("base64");
  }

  /**
   * Render a pictograph to SVG string
   */
  async renderToSvg(
    rawInput: PictographInput,
    options: RenderVisibilityOptions = {}
  ): Promise<string> {
    // Preprocess input to ensure orientations are calculated
    const input = this.preprocessInput(rawInput);

    const {
      darkMode = true,
      showTKA = true,
      showTND: showTND = false,
      showElemental = false,
      showPlacements = false,
      showReversals = false,
      showHandColorKey = false,
      showGrid = true,
      showLeftMotion = true,
      showRightMotion = true,
      leftPropType = null,
      rightPropType = null,
      fanAppearance = null,
      primaryPropColors = null,
      themeable = false,
      inline = false,
    } = options;

    const gridMode = this.parseGridMode(input.gridMode);
    const svgParts: string[] = [];

    // 1. Background
    const bgColor = this.resolveColor(
      "--dm-bg",
      "#0a0a0f",
      "#ffffff",
      darkMode,
      themeable
    );
    svgParts.push(
      `<g class="svg-bg"><rect width="${VIEWBOX_SIZE}" height="${VIEWBOX_SIZE}" fill="${bgColor}"/></g>`
    );

    // 2. Grid
    if (showGrid) {
      const gridSvg = this.renderGrid(gridMode, darkMode, themeable);
      if (gridSvg) svgParts.push(`<g class="svg-grid">${gridSvg}</g>`);
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
        fanAppearance,
        themeable,
        primaryPropColors
      );
      if (leftProp)
        svgParts.push(`<g class="svg-prop svg-prop-blue">${leftProp}</g>`);
    }
    if (showRightMotion) {
      const rightProp = this.renderProp(
        input,
        input.rightMotion,
        gridMode,
        darkMode,
        leftPropType,
        rightPropType,
        fanAppearance,
        themeable,
        primaryPropColors
      );
      if (rightProp)
        svgParts.push(`<g class="svg-prop svg-prop-red">${rightProp}</g>`);
    }

    // 4. Arrows (using CORRECT placement logic WITH adjustments)
    if (showLeftMotion) {
      const leftArrow = this.renderArrow(
        input,
        input.leftMotion,
        gridMode,
        darkMode,
        themeable,
        primaryPropColors
      );
      if (leftArrow)
        svgParts.push(`<g class="svg-arrow svg-arrow-blue">${leftArrow}</g>`);
    }
    if (showRightMotion) {
      const rightArrow = this.renderArrow(
        input,
        input.rightMotion,
        gridMode,
        darkMode,
        themeable,
        primaryPropColors
      );
      if (rightArrow)
        svgParts.push(`<g class="svg-arrow svg-arrow-red">${rightArrow}</g>`);
    }

    // 5. Placement glyph (top center)
    if (showPlacements && input.startPlacement && input.endPlacement) {
      const placementSvg = this.renderPlacementGlyph(
        input.startPlacement,
        input.endPlacement,
        darkMode,
        themeable
      );
      if (placementSvg)
        svgParts.push(
          `<g class="svg-glyph svg-glyph-placement">${placementSvg}</g>`
        );
    }

    // 6. Elemental glyph (top right) - only for Type1 letters
    if (showElemental && input.letter && input.startPlacement) {
      const elementalSvg = this.renderElementalGlyph(
        input.letter,
        input.startPlacement,
        darkMode,
        themeable
      );
      if (elementalSvg)
        svgParts.push(
          `<g class="svg-glyph svg-glyph-elemental">${elementalSvg}</g>`
        );
    }

    // 7. TKA Letter glyph with turn numbers (bottom left)
    if (showTKA && input.letter) {
      const letterSvg = this.renderLetterWithTurns(
        input.letter,
        input.leftMotion?.turns,
        input.rightMotion?.turns,
        darkMode,
        themeable,
        primaryPropColors
      );
      if (letterSvg)
        svgParts.push(`<g class="svg-glyph svg-glyph-letter">${letterSvg}</g>`);
    }

    // 8. TnD glyph (bottom right)
    if (showTND && input.letter && input.startPlacement) {
      const vtgSvg = this.renderVTGGlyph(
        input.letter,
        input.startPlacement,
        darkMode,
        themeable
      );
      if (vtgSvg)
        svgParts.push(`<g class="svg-glyph svg-glyph-vtg">${vtgSvg}</g>`);
    }

    // 9. Reversal indicators (left edge)
    if (showReversals && (input.leftReversal || input.rightReversal)) {
      const reversalSvg = this.renderReversalIndicators(
        input.leftReversal ?? false,
        input.rightReversal ?? false,
        darkMode,
        themeable,
        primaryPropColors
      );
      if (reversalSvg)
        svgParts.push(
          `<g class="svg-glyph svg-glyph-reversal">${reversalSvg}</g>`
        );
    }

    // 10. Start-placement hand colour key (bottom centre)
    if (showHandColorKey) {
      const keySvg = this.renderHandColorKey(
        showLeftMotion && !!input.leftMotion,
        showRightMotion && !!input.rightMotion,
        darkMode,
        themeable,
        primaryPropColors
      );
      if (keySvg)
        svgParts.push(`<g class="svg-glyph svg-glyph-hand-key">${keySvg}</g>`);
    }

    const xmlDecl = inline ? "" : `<?xml version="1.0" encoding="UTF-8"?>\n`;
    const halo = `<defs><filter id="arrow-halo" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="${darkMode ? "#0a0a0f" : "white"}"/><feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="${darkMode ? "#0a0a0f" : "white"}"/><feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="${darkMode ? "#0a0a0f" : "white"}"/></filter></defs>`;
    return `${xmlDecl}<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}" width="${VIEWBOX_SIZE}" height="${VIEWBOX_SIZE}" role="img" aria-label="Pictograph${input.letter ? ` for letter ${input.letter}` : ""}">${halo}
${svgParts.join("\n")}
</svg>`;
  }

  // ==========================================================================
  // COLOR RESOLUTION
  // ==========================================================================

  private resolveColor(
    cssVar: string,
    darkValue: string,
    lightValue: string,
    darkMode: boolean,
    themeable: boolean
  ): string {
    if (themeable) {
      return `var(${cssVar}, ${darkValue})`;
    }
    return darkMode ? darkValue : lightValue;
  }

  private resolveMotionColor(
    hand: HandSide,
    darkMode: boolean,
    themeable: boolean,
    customColors?: HandColorPair | null
  ): string {
    if (customColors) return customColors[hand];
    return hand === "left"
      ? this.resolveColor(
          "--dm-motion-blue",
          BLUE_COLOR_DARK,
          BLUE_COLOR_LIGHT,
          darkMode,
          themeable
        )
      : this.resolveColor(
          "--dm-motion-red",
          RED_COLOR_DARK,
          RED_COLOR_LIGHT,
          darkMode,
          themeable
        );
  }

  // ==========================================================================
  // GRID RENDERING
  // ==========================================================================

  private renderGrid(
    gridMode: GridMode,
    darkMode: boolean,
    themeable: boolean = false
  ): string {
    const gridFileName =
      gridMode === GridMode.BOX
        ? "box_grid.svg"
        : gridMode === GridMode.SKEWED
          ? "skewed_grid.svg"
          : "diamond_grid.svg";
    const gridPath = join(this.projectRoot, "static/images/grid", gridFileName);

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
      const gridColor = this.resolveColor(
        "--dm-grid-point",
        "#ffffff",
        "#000000",
        darkMode,
        themeable
      );
      const opacity = darkMode ? "0.85" : "1.0"; // Solid black in light mode

      // Add fill attribute to circles that don't have one
      // The regex matches <circle that is NOT followed by fill= before the >
      innerContent = innerContent.replace(
        /<circle(?![^>]*fill=)/g,
        `<circle fill="${gridColor}"`
      );

      // Box mode outer points use <circle> elements with stroke-only rendering.
      // Update stroke color so the rings are visible on dark backgrounds.
      if (gridMode === GridMode.BOX) {
        innerContent = innerContent.replace(
          /\.box-outer-ring\{fill:none;stroke:#000;/,
          `.box-outer-ring{fill:none;stroke:${gridColor};`
        );
      }

      // Replace currentColor with the grid color (for hand points with fill:currentColor in CSS)
      // The CSS class .normal-hand-point { fill: currentColor } needs the color property set
      if (darkMode) {
        innerContent = innerContent.replace(/#000000/gi, gridColor);
        innerContent = innerContent.replace(/#000(?![\da-f])/gi, gridColor);
        innerContent = innerContent.replace(/black/gi, gridColor);
      }

      return `<g style="color: ${gridColor}" opacity="${opacity}">${innerContent}</g>`;
    } catch (error) {
      console.error("[Renderer] Failed to load grid:", error);
      return "";
    }
  }

  // ==========================================================================
  // PROP RENDERING (USING CORRECT PLACEMENT)
  // ==========================================================================

  /**
   * Calculate beta offset when both props end at the same location.
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

    return calculateBetaOffset(betaInput, targetMotion);
  }

  private renderProp(
    pictograph: PictographInput,
    motion: MotionInput,
    gridMode: GridMode,
    darkMode: boolean,
    leftPropType: string | null = null,
    rightPropType: string | null = null,
    fanAppearance: FanAppearanceInput | null = null,
    themeable: boolean = false,
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
    const useStrictHandPoints = pictographRequiresStrictHandpoints(
      leftPropType ?? "staff",
      rightPropType ?? "staff"
    );
    const propPosition = useStrictHandPoints
      ? placement
      : {
          ...placement,
          ...getNormalHandPointCoordinates(endLocation, gridMode),
        };

    // Apply beta offset if both props end at the same location
    // Pass BOTH propTypes so hand props get the special "right on right, left on left" logic
    const betaOffset = this.calculateBetaOffsetForProp(
      pictograph,
      motion,
      gridMode,
      leftPropType,
      rightPropType
    );
    const finalX = propPosition.x + betaOffset.x;
    const finalY = propPosition.y + betaOffset.y;

    // Determine prop file name - use provided prop type or default to staff
    // Use the current motion's prop type
    const currentPropType =
      motion.hand === "left" ? leftPropType : rightPropType;
    const fanFile = isFanPropType(currentPropType)
      ? fanAppearanceFile(resolveFanAppearance(fanAppearance))
      : null;
    const propFileName =
      fanFile ?? (currentPropType ? `${currentPropType}.svg` : "staff.svg");
    const propPath = fanFile
      ? join(this.projectRoot, "static/images/props/appearances", propFileName)
      : join(this.projectRoot, "static/images/props", propFileName);
    if (!existsSync(propPath)) {
      console.error("[Renderer] Prop file not found:", propPath);
      return "";
    }

    // HAND PROP SPECIAL LOGIC (matching PropPlacer.ts and PropSvg.svelte):
    // 1. Hands should NEVER rotate - always use 0 degrees orientation
    // 2. Right hands are mirrored (scaleX(-1)) to show anatomy correctly.
    const isHand = currentPropType === "hand";
    const isRightHand = isHand && motion.hand === "right";
    const rotation = isHand ? 0 : placement.rotation;

    try {
      const propSvg = readFileSync(propPath, "utf-8");

      // Get viewBox dimensions
      const viewBoxMatch = propSvg.match(/viewBox\s*=\s*"([^"]+)"/i);
      let width = 100,
        height = 100;
      if (viewBoxMatch) {
        const parts = viewBoxMatch[1].split(/\s+/).map(parseFloat);
        width = parts[2] || 100;
        height = parts[3] || 100;
      }

      const color = this.resolveMotionColor(
        motion.hand,
        darkMode,
        themeable,
        customColors
      );
      const colorSuffix = motion.hand === "left" ? "blue" : "red";
      const selectiveColorMode =
        !!currentPropType &&
        (SELECTIVE_COLOR_PROP_TYPES as readonly string[]).includes(
          currentPropType.toLowerCase()
        );

      // Use the same color transform as the browser renderer. Its class/ID
      // suffixing is essential here: blue and red copies of props such as fan
      // both define `.st0`, and an unsuffixed red rule recolors both copies.
      const coloredPropSvg = fanFile
        ? applyFanFrameColor(propSvg, color)
        : applyColorToSvg(propSvg, color, {
            makeClassNamesUnique: true,
            colorSuffix,
            selectiveColorMode,
          });
      const renderedPropSvg = fanFile
        ? applyFanPaperContrast(coloredPropSvg, darkMode ? "dark" : "light")
        : coloredPropSvg;
      const innerMatch = renderedPropSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
      let innerContent = innerMatch ? innerMatch[1] : renderedPropSvg;

      // App fan appearances share the regular fan's 260×207 pivot box. Big
      // Fan enlarges that same artwork inside its canonical 600×566.9 box so
      // the shared placement math continues to land on the grip.
      if (fanFile && currentPropType?.toLowerCase() === "bigfan") {
        width = 600;
        height = 566.9;
        innerContent = `<g transform="translate(60 92.3731) scale(1.8461538)">${innerContent}</g>`;
      }

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

  // ==========================================================================
  // ARROW RENDERING (USING CORRECT PLACEMENT + ADJUSTMENTS)
  // ==========================================================================

  private renderArrow(
    pictograph: PictographInput,
    motion: MotionInput,
    gridMode: GridMode,
    darkMode: boolean,
    themeable: boolean = false,
    customColors?: HandColorPair | null
  ): string {
    const motionType = motion.motionType.toLowerCase();

    // A zero-turn static prop stays still, so its canonical arrow is empty.
    // Once turns are added, the prop spins in place and needs the static arrow.
    if (motionType === "static" && (motion.turns ?? 0) === 0) {
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
      endPlacement: pictograph.endPlacement,
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
      placement.location as unknown as GridLocation
    );

    // Apply adjustment to placement
    const finalX = placement.x + adjustX;
    const finalY = placement.y + adjustY;

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
      const color = this.resolveMotionColor(
        motion.hand,
        darkMode,
        themeable,
        customColors
      );

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
      return `<g filter="url(#arrow-halo)" transform="translate(${finalX}, ${finalY}) rotate(${placement.rotation})${mirrorTransform} translate(${-centerX}, ${-centerY})">
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
      return join(this.projectRoot, "static/images/arrows/float.svg");
    }

    return join(
      this.projectRoot,
      "static",
      resolveFullArrowAssetPath({
        motionType: motionType as RenderMotionType,
        startOrientation: startOrientation as RenderOrientation | undefined,
        turns,
      })
    );
  }

  // ==========================================================================
  // GLYPH RENDERING
  // ==========================================================================

  /**
   * Render turn numbers next to the TKA letter glyph
   */
  private renderTurnNumbers(
    leftTurns: number | "fl" | undefined,
    rightTurns: number | "fl" | undefined,
    letterWidth: number,
    letterHeight: number,
    darkMode: boolean,
    themeable: boolean = false,
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
        themeable,
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
        themeable,
        customColors
      );
      if (bottomTurnSvg) parts.push(bottomTurnSvg);
    }

    return parts.join("\n");
  }

  /**
   * Render a single turn number SVG
   */
  private renderSingleTurnNumber(
    turns: number | "fl",
    x: number,
    y: number,
    color: "blue" | "red",
    darkMode: boolean,
    themeable: boolean = false,
    customColors?: HandColorPair | null
  ): string {
    // Convert turns value to filename
    const filename = turns === "fl" ? "float.svg" : `${turns}.svg`;
    const turnPath = join(this.projectRoot, "static/images/numbers", filename);

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
      const fillColor = this.resolveMotionColor(
        color === "blue" ? "left" : "right",
        darkMode,
        themeable,
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

  /**
   * Render letter with turn numbers as a combined group
   */
  private renderLetterWithTurns(
    letter: string,
    leftTurns: number | "fl" | undefined,
    rightTurns: number | "fl" | undefined,
    darkMode: boolean,
    themeable: boolean = false,
    customColors?: HandColorPair | null
  ): string {
    // Determine the correct type folder for this letter
    const typeFolder = LETTER_TYPE_FOLDER[letter] || "Type1";
    const letterPath = join(
      this.projectRoot,
      "static/images/letters_trimmed",
      typeFolder,
      `${letter}.svg`
    );

    if (!existsSync(letterPath)) {
      const textColor = this.resolveColor(
        "--dm-glyph-fill",
        "#e6e6e6",
        "#000000",
        darkMode,
        themeable
      );
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

      // Apply dark mode / themeable color
      // Many SVGs don't specify fill color (defaulting to black) - we need to add explicit fill
      const glyphFill = this.resolveColor(
        "--dm-glyph-fill",
        "#e6e6e6",
        "#000000",
        darkMode,
        themeable
      );
      if (darkMode || themeable) {
        innerContent = innerContent.replace(/#000000/gi, glyphFill);
        innerContent = innerContent.replace(/black/gi, glyphFill);
        // For paths without explicit fill, add one (handles SVGs that rely on default black)
        innerContent = innerContent.replace(
          /<path(?![^>]*fill=)/gi,
          `<path fill="${glyphFill}" `
        );
      }

      // Render turn numbers (positioned relative to letter)
      const turnNumbersSvg = this.renderTurnNumbers(
        leftTurns,
        rightTurns,
        width,
        height,
        darkMode,
        themeable,
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
      const textColor = this.resolveColor(
        "--dm-glyph-fill",
        "#e6e6e6",
        "#000000",
        darkMode,
        themeable
      );
      return `<text x="${TKA_GLYPH_X}" y="${TKA_GLYPH_Y + 80}" font-family="Georgia, serif" font-size="100" font-weight="bold" fill="${textColor}">${letter}</text>`;
    }
  }

  private renderVTGGlyph(
    letter: string,
    startPlacement: string,
    darkMode: boolean,
    themeable: boolean = false
  ): string {
    const vtgMode = this.calculateVTGMode(letter, startPlacement);
    if (!vtgMode) return "";

    const vtgPath = join(
      this.projectRoot,
      "static/images/vtg_glyphs",
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

      // Apply dark mode / themeable color
      // Many SVGs don't specify fill color (defaulting to black) - we need to add explicit fill
      const glyphFill = this.resolveColor(
        "--dm-glyph-fill",
        "#e6e6e6",
        "#000000",
        darkMode,
        themeable
      );
      if (darkMode || themeable) {
        innerContent = innerContent.replace(/#000000/gi, glyphFill);
        innerContent = innerContent.replace(/black/gi, glyphFill);
        // For paths without explicit fill, add one (handles SVGs that rely on default black)
        innerContent = innerContent.replace(
          /<path(?![^>]*fill=)/gi,
          `<path fill="${glyphFill}" `
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
   * Render elemental glyph (top-right corner)
   * Only shows for Type1 letters (A-V)
   */
  private renderElementalGlyph(
    letter: string,
    startPlacement: string,
    darkMode: boolean,
    themeable: boolean = false
  ): string {
    const letterUpper = letter.toUpperCase();

    // Only show for Type1 letters
    if (!TYPE1_LETTERS.has(letterUpper)) {
      return "";
    }

    // Calculate elemental type from VTG mode
    const vtgMode = this.calculateVTGMode(letter, startPlacement);
    if (!vtgMode) return "";

    const elementalType = VTG_TO_ELEMENTAL[vtgMode];
    if (!elementalType) return "";

    const elementalPath = join(
      this.projectRoot,
      "static/images/elements",
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

  private renderPlacementGlyph(
    startPlacement: string,
    endPlacement: string,
    darkMode: boolean,
    themeable: boolean = false
  ): string {
    const startGroup = this.extractPlacementGroup(startPlacement);
    const endGroup = this.extractPlacementGroup(endPlacement);

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
      this.projectRoot,
      "static/images/letters_trimmed/Type6",
      startFileName
    );
    const endPath = join(
      this.projectRoot,
      "static/images/letters_trimmed/Type6",
      endFileName
    );
    const arrowPath = join(this.projectRoot, "static/images/arrow.svg");

    if (
      !existsSync(startPath) ||
      !existsSync(endPath) ||
      !existsSync(arrowPath)
    ) {
      console.error("[Renderer] Placement glyph files not found");
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

        const fillColor = this.resolveColor(
          "--dm-glyph-fill",
          "#e6e6e6",
          "#231F20",
          darkMode,
          themeable
        );

        if (isArrow) {
          // Arrow SVG uses .st0 for stroke line, .st1 for fill polygon
          content = content.replace(
            /class="st0"/gi,
            `fill="none" stroke="${fillColor}" stroke-width="4" stroke-miterlimit="10"`
          );
          content = content.replace(/class="st1"/gi, `fill="${fillColor}"`);
        } else {
          // Placement letters (α, β, γ) - add fill to paths without one
          content = content.replace(
            /<path(?![^>]*fill)/g,
            `<path fill="${fillColor}"`
          );
        }

        // Replace any remaining color references
        if (darkMode || themeable) {
          content = content.replace(/#231F20/gi, fillColor);
          content = content.replace(/#000000/gi, fillColor);
          content = content.replace(/black/gi, fillColor);
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
      const scaledLetterWidth = LETTER_WIDTH * PLACEMENT_SCALE_FACTOR;
      const scaledLetterHeight = LETTER_HEIGHT * PLACEMENT_SCALE_FACTOR;
      const scaledArrowWidth = PLACEMENT_ARROW_WIDTH * PLACEMENT_SCALE_FACTOR;
      const scaledArrowHeight = PLACEMENT_ARROW_HEIGHT * PLACEMENT_SCALE_FACTOR;

      // Calculate positions (matching browser's PlacementGlyph.svelte exactly)
      const centerLine = scaledLetterHeight / 2;
      const startX = 0;
      const startY = centerLine - scaledLetterHeight / 2;
      const arrowX =
        scaledLetterWidth + PLACEMENT_SPACING * PLACEMENT_SCALE_FACTOR;
      const arrowY = centerLine - scaledArrowHeight / 2;
      const endX = scaledLetterWidth + scaledArrowWidth + PLACEMENT_SPACING;
      const endY = centerLine - scaledLetterHeight / 2;

      // Total width for centering (browser uses: scaledLetterWidth + scaledArrowWidth + scaledLetterWidth + SPACING)
      const totalWidth =
        scaledLetterWidth +
        scaledArrowWidth +
        scaledLetterWidth +
        PLACEMENT_SPACING;
      const groupX = VIEWBOX_SIZE / 2 - totalWidth / 2;

      // Use the actual viewBox from each SVG file, preserving aspect ratio with preserveAspectRatio="xMidYMid meet"
      return `<g transform="translate(${groupX}, ${PLACEMENT_GLYPH_Y})">
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
      console.error("[Renderer] Failed to render placement glyph:", error);
      return "";
    }
  }

  // ==========================================================================
  // REVERSAL INDICATOR RENDERING
  // ==========================================================================

  /**
   * Render reversal indicators on the left edge of the pictograph.
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
    themeable: boolean = false,
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
      const fill = this.resolveMotionColor(
        hand,
        darkMode,
        themeable,
        customColors
      );
      return `<circle cx="${dot.cx}" cy="${dot.cy}" r="${dot.r}" fill="${fill}"/>`;
    });

    return `<g class="reversal-indicators">${circles.join("\n")}</g>`;
  }

  /**
   * Start-placement hand colour key. Geometry comes from the shared
   * calculateHandColorKeyLayout so this matches PictographRenderer exactly.
   */
  private renderHandColorKey(
    showLeft: boolean,
    showRight: boolean,
    darkMode: boolean,
    themeable: boolean = false,
    customColors?: HandColorPair | null
  ): string {
    const layout = calculateHandColorKeyLayout(showLeft, showRight);
    if (layout.entries.length === 0) return "";

    const textColor = this.resolveColor(
      "--dm-text-color",
      "#ffffff",
      "#231f20",
      darkMode,
      themeable
    );
    const parts = layout.entries.map((entry) => {
      const fill = this.resolveMotionColor(
        entry.hand,
        darkMode,
        themeable,
        customColors
      );
      return (
        `<circle cx="${entry.swatchX}" cy="${layout.centerY}" r="${layout.swatchRadius}" fill="${fill}"/>` +
        `<text x="${entry.labelX}" y="${layout.baselineY}">${entry.label}</text>`
      );
    });
    return `<g class="hand-color-key" transform="translate(${VIEWBOX_SIZE / 2}, 0)" font-family="${HAND_COLOR_KEY.FONT_FAMILY}" font-size="${HAND_COLOR_KEY.FONT_SIZE}" font-weight="${HAND_COLOR_KEY.FONT_WEIGHT}" fill="${textColor}">${parts.join("")}</g>`;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private parseGridMode(gridMode?: string): GridMode {
    if (!gridMode) return GridMode.DIAMOND;
    const normalized = gridMode.toLowerCase();
    if (normalized === "box") return GridMode.BOX;
    if (normalized === "skewed") return GridMode.SKEWED;
    return GridMode.DIAMOND;
  }

  private calculateVTGMode(
    letter: string,
    startPlacement: string
  ): VTGMode | null {
    const letterUpper = letter.toUpperCase();
    if (letterUpper.length !== 1 || letterUpper < "A" || letterUpper > "V") {
      return null;
    }

    const modeOrFunction = DIAMOND_VTG_MAP[letterUpper];
    if (!modeOrFunction) return null;

    if (typeof modeOrFunction === "function") {
      return modeOrFunction(startPlacement);
    }
    return modeOrFunction;
  }

  private extractPlacementGroup(placement: string): string | null {
    const match = placement.match(/[a-z]+/i);
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
