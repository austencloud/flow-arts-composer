/**
 * Standalone Pictograph Renderer
 *
 * A self-contained renderer that generates pictograph PNGs without
 * depending on any Svelte code or complex service architecture.
 *
 * This is designed to work in pure Node.js for the MCP server.
 */

import { Resvg } from "@resvg/resvg-js";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { HandSide } from "@tka/tka-types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Constants
const VIEWBOX_SIZE = 950;
const CENTER = VIEWBOX_SIZE / 2;

// Arrow positioning constants (simplified from the main app)
const ARROW_SCALE = 0.35;
const PROP_SCALE = 0.3;

// Motion colors - must match CSS variables in app.css
// Dark mode: bright colors for visibility on dark backgrounds
const BLUE_COLOR_DARK = "#3575E2";
const RED_COLOR_DARK = "#ED1C24";
// Light mode: darker colors for visibility on light backgrounds
const BLUE_COLOR_LIGHT = "#3D44B8";
const RED_COLOR_LIGHT = "#DC2626";

// TnD glyph constants
const VTG_GLYPH_WIDTH = 201.24;
const VTG_GLYPH_HEIGHT = 133.6;
const VTG_OFFSET_PERCENTAGE = 0.04;

// Position glyph constants
const POSITION_SCALE_FACTOR = 0.75;
const POSITION_SPACING = 25;
const POSITION_Y = 50;
const POSITION_LETTER_HEIGHT = 100;
const POSITION_ARROW_WIDTH = 88.9;
const POSITION_ARROW_HEIGHT = 34.8;

// VTG mode lookup tables (from vtg-calculator.ts)
type VTGMode = "SS" | "SO" | "TS" | "TO" | "QS" | "QO";

const DIAMOND_VTG_MAP: Record<string, VTGMode | ((startPos: string) => VTGMode)> = {
  A: "SS", B: "SS", C: "SS",
  D: (startPos) => ["beta3", "beta7"].includes(startPos.toLowerCase()) ? "SO" : "TO",
  E: (startPos) => ["beta3", "beta7"].includes(startPos.toLowerCase()) ? "SO" : "TO",
  F: (startPos) => ["beta3", "beta7"].includes(startPos.toLowerCase()) ? "SO" : "TO",
  G: "TS", H: "TS", I: "TS",
  J: (startPos) => ["alpha1", "alpha5"].includes(startPos.toLowerCase()) ? "SO" : "TO",
  K: (startPos) => ["alpha1", "alpha5"].includes(startPos.toLowerCase()) ? "SO" : "TO",
  L: (startPos) => ["alpha1", "alpha5"].includes(startPos.toLowerCase()) ? "SO" : "TO",
  M: "QO", N: "QO", O: "QO", P: "QO", Q: "QO", R: "QO",
  S: "QS", T: "QS", U: "QS", V: "QS",
};

// Location to coordinate mapping (for diamond grid)
const LOCATION_COORDS: Record<string, { x: number; y: number }> = {
  n: { x: CENTER, y: 175 },
  e: { x: 775, y: CENTER },
  s: { x: CENTER, y: 775 },
  w: { x: 175, y: CENTER },
  ne: { x: 625, y: 325 },
  se: { x: 625, y: 625 },
  sw: { x: 325, y: 625 },
  nw: { x: 325, y: 325 },
};

// Motion type to arrow file mapping
const ARROW_FILES: Record<string, string> = {
  pro: "pro_cw.svg", // Default to CW, will adjust based on rotation
  anti: "anti_cw.svg",
  static: "static.svg",
  dash: "dash.svg",
};

interface MotionInput {
  motionType: string;
  rotationDirection: string;
  startLocation: string;
  endLocation: string;
  hand: HandSide;
}

interface PictographInput {
  letter: string;
  startPlacement?: string;  // For TnD and position glyph calculations
  endPlacement?: string;    // For position glyph
  leftMotion: MotionInput;
  rightMotion: MotionInput;
}

/**
 * Full visibility options for pictograph rendering.
 * These control which elements are visible in the final image.
 */
export interface RenderVisibilityOptions {
  // Display
  darkMode?: boolean;
  size?: number;

  // Glyphs
  showTKA?: boolean;           // Letter glyph (default: true)
  showTND?: boolean;           // TnD timing & direction glyph (default: false)
  showPlacements?: boolean;     // Start→End positions glyph (default: false)
  showReversals?: boolean;     // Reversal indicators (default: false)

  // Grid
  showGrid?: boolean;          // Grid lines (default: true)
  showNonRadialPoints?: boolean;

  // Motions
  showLeftMotion?: boolean;    // Blue prop + arrow (default: true)
  showRightMotion?: boolean;     // Red prop + arrow (default: true)
}

// Legacy interface for backwards compatibility
interface RenderOptions extends RenderVisibilityOptions {
  showLetter?: boolean;  // Alias for showTKA
}

export class StandalonePictographRenderer {
  private projectRoot: string;

  constructor() {
    // MCP server runs from mcp-server/, so go up one level to project root
    this.projectRoot = join(__dirname, "..");
  }

  /**
   * Render a pictograph to PNG buffer
   */
  async renderToPng(input: PictographInput, options: RenderOptions = {}): Promise<Buffer> {
    const svg = await this.renderToSvg(input, options);
    return this.svgToPng(svg, options.size || 400);
  }

  /**
   * Render to base64-encoded PNG
   */
  async renderToBase64(input: PictographInput, options: RenderOptions = {}): Promise<string> {
    const png = await this.renderToPng(input, options);
    return png.toString("base64");
  }

  /**
   * Render a pictograph to SVG string
   */
  async renderToSvg(input: PictographInput, options: RenderVisibilityOptions = {}): Promise<string> {
    // Extract options with defaults
    const {
      darkMode = true,
      showTKA = true,
      showTND = false,
      showPlacements = false,
      showReversals = false,
      showGrid = true,
      showLeftMotion = true,
      showRightMotion = true,
    } = options;

    // Handle legacy showLetter option
    const shouldShowTKA = (options as RenderOptions).showLetter ?? showTKA;

    const svgParts: string[] = [];

    // 1. Background
    const bgColor = darkMode ? "#0a0a0f" : "#ffffff";
    svgParts.push(`<rect width="${VIEWBOX_SIZE}" height="${VIEWBOX_SIZE}" fill="${bgColor}"/>`);

    // 2. Grid (if enabled)
    if (showGrid) {
      const gridSvg = this.renderGrid(darkMode);
      if (gridSvg) {
        svgParts.push(gridSvg);
      }
    }

    // 3. Props (blue and red, if enabled)
    if (showLeftMotion) {
      const leftProps = this.renderProp(input.leftMotion, darkMode);
      if (leftProps) svgParts.push(leftProps);
    }

    if (showRightMotion) {
      const rightProps = this.renderProp(input.rightMotion, darkMode);
      if (rightProps) svgParts.push(rightProps);
    }

    // 4. Arrows (blue and red, if enabled)
    if (showLeftMotion) {
      const leftArrow = this.renderArrow(input.leftMotion, darkMode);
      if (leftArrow) svgParts.push(leftArrow);
    }

    if (showRightMotion) {
      const rightArrow = this.renderArrow(input.rightMotion, darkMode);
      if (rightArrow) svgParts.push(rightArrow);
    }

    // 5. Position glyph (start → end) at top center
    if (showPlacements && input.startPlacement && input.endPlacement) {
      const positionSvg = this.renderPlacementGlyph(input.startPlacement, input.endPlacement, darkMode);
      if (positionSvg) svgParts.push(positionSvg);
    }

    // 6. TKA Letter glyph (bottom left)
    if (shouldShowTKA && input.letter) {
      const letterSvg = this.renderLetter(input.letter, darkMode);
      if (letterSvg) svgParts.push(letterSvg);
    }

    // 7. TnD glyph (bottom right) - only for Type1 letters (A-V)
    if (showTND && input.letter && input.startPlacement) {
      const vtgSvg = this.renderVTGGlyph(input.letter, input.startPlacement, darkMode);
      if (vtgSvg) svgParts.push(vtgSvg);
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}" width="${VIEWBOX_SIZE}" height="${VIEWBOX_SIZE}">
${svgParts.join("\n")}
</svg>`;
  }

  /**
   * Render the diamond grid
   */
  private renderGrid(darkMode: boolean): string {
    const gridPath = join(this.projectRoot, "static/images/grid/diamond_grid.svg");

    if (!existsSync(gridPath)) {
      console.error("[Renderer] Grid file not found:", gridPath);
      return "";
    }

    try {
      let gridSvg = readFileSync(gridPath, "utf-8");

      // Extract inner content
      const innerMatch = gridSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
      let innerContent = innerMatch ? innerMatch[1] : gridSvg;

      // Apply color transform for dark/light mode
      if (darkMode) {
        innerContent = innerContent.replace(/#000000/gi, "#d0d0d0");
        innerContent = innerContent.replace(/black/gi, "#d0d0d0");
        return `<g opacity="0.85">${innerContent}</g>`;
      } else {
        return `<g opacity="0.7">${innerContent}</g>`;
      }
    } catch (error) {
      console.error("[Renderer] Failed to load grid:", error);
      return "";
    }
  }

  /**
   * Render a prop (staff) at the motion's end location
   */
  private renderProp(motion: MotionInput, darkMode: boolean): string {
    const coords = LOCATION_COORDS[motion.endLocation];
    if (!coords) {
      console.error("[Renderer] Unknown location:", motion.endLocation);
      return "";
    }

    const propPath = join(this.projectRoot, "static/images/props/pictograph/staff.svg");
    if (!existsSync(propPath)) {
      console.error("[Renderer] Prop file not found:", propPath);
      return "";
    }

    try {
      let propSvg = readFileSync(propPath, "utf-8");

      // Get viewBox dimensions
      const viewBoxMatch = propSvg.match(/viewBox\s*=\s*"([^"]+)"/i);
      let width = 100, height = 100;
      if (viewBoxMatch) {
        const parts = viewBoxMatch[1].split(/\s+/).map(parseFloat);
        width = parts[2] || 100;
        height = parts[3] || 100;
      }

      // Extract inner content
      const innerMatch = propSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
      let innerContent = innerMatch ? innerMatch[1] : propSvg;

      // Apply color
      const color = motion.hand === "left"
        ? (darkMode ? BLUE_COLOR_DARK : BLUE_COLOR_LIGHT)
        : (darkMode ? RED_COLOR_DARK : RED_COLOR_LIGHT);
      innerContent = innerContent.replace(/#000000/gi, color);
      innerContent = innerContent.replace(/black/gi, color);

      // Calculate rotation based on location
      const rotation = this.getLocationRotation(motion.endLocation);

      // Scale and position
      const scaledWidth = width * PROP_SCALE;
      const scaledHeight = height * PROP_SCALE;

      return `<g transform="translate(${coords.x}, ${coords.y}) rotate(${rotation}) scale(${PROP_SCALE}) translate(${-width/2}, ${-height/2})">
  <g>${innerContent}</g>
</g>`;
    } catch (error) {
      console.error("[Renderer] Failed to load prop:", error);
      return "";
    }
  }

  /**
   * Render an arrow
   */
  private renderArrow(motion: MotionInput, darkMode: boolean): string {
    if (motion.motionType === "static") {
      return ""; // Static motions don't have arrows
    }

    // Calculate arrow position (midpoint between start and end)
    const startCoords = LOCATION_COORDS[motion.startLocation];
    const endCoords = LOCATION_COORDS[motion.endLocation];

    if (!startCoords || !endCoords) {
      return "";
    }

    const arrowX = (startCoords.x + endCoords.x) / 2;
    const arrowY = (startCoords.y + endCoords.y) / 2;

    // Determine arrow file path
    // Arrows are organized as: {motionType}/from_radial/{motionType}_{turns}.svg
    // We'll use 1.0 turns as default (most common)
    let arrowPath: string;

    if (motion.motionType === "dash") {
      arrowPath = join(this.projectRoot, "static/images/arrows/dash.svg");
    } else {
      // For pro/anti, use from_radial with 1.0 turns
      const isRadial = ["n", "e", "s", "w"].includes(motion.startLocation);
      const startType = isRadial ? "from_radial" : "from_nonradial";
      arrowPath = join(
        this.projectRoot,
        "static/images/arrows",
        motion.motionType,
        startType,
        `${motion.motionType}_1.0.svg`
      );
    }

    if (!existsSync(arrowPath)) {
      console.error("[Renderer] Arrow file not found:", arrowPath);
      return "";
    }

    try {
      let arrowSvg = readFileSync(arrowPath, "utf-8");

      // Get viewBox dimensions
      const viewBoxMatch = arrowSvg.match(/viewBox\s*=\s*"([^"]+)"/i);
      let width = 100, height = 100;
      if (viewBoxMatch) {
        const parts = viewBoxMatch[1].split(/\s+/).map(parseFloat);
        width = Math.abs(parts[2]) || 100;
        height = Math.abs(parts[3]) || 100;
      }

      // Extract inner content
      const innerMatch = arrowSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
      let innerContent = innerMatch ? innerMatch[1] : arrowSvg;

      // Apply color
      const color = motion.hand === "left"
        ? (darkMode ? BLUE_COLOR_DARK : BLUE_COLOR_LIGHT)
        : (darkMode ? RED_COLOR_DARK : RED_COLOR_LIGHT);
      innerContent = innerContent.replace(/#000000/gi, color);
      innerContent = innerContent.replace(/black/gi, color);

      // Calculate rotation based on start/end locations
      const rotation = this.calculateArrowRotation(motion.startLocation, motion.endLocation);

      return `<g transform="translate(${arrowX}, ${arrowY}) rotate(${rotation}) scale(${ARROW_SCALE}) translate(${-width/2}, ${-height/2})">
  <g>${innerContent}</g>
</g>`;
    } catch (error) {
      console.error("[Renderer] Failed to load arrow:", error);
      return "";
    }
  }

  /**
   * Render the letter glyph
   */
  private renderLetter(letter: string, darkMode: boolean): string {
    // Map Greek letters to file names
    const letterMap: Record<string, string> = {
      α: "alpha", β: "beta", γ: "gamma",
      Γ: "Gamma", Δ: "Delta", Θ: "Theta",
      Λ: "Lambda", Σ: "Sigma", Φ: "Phi",
      Ψ: "Psi", Ω: "Omega", W: "W-", "-": "dash",
    };

    const fileName = letterMap[letter] || letter;
    const letterPath = join(this.projectRoot, "static/images/letters/Type1", `${fileName}.svg`);

    if (!existsSync(letterPath)) {
      // Fallback to text
      const textColor = darkMode ? "#e6e6e6" : "#000000";
      return `<text x="50" y="880" font-family="Georgia, serif" font-size="100" font-weight="bold" fill="${textColor}">${letter}</text>`;
    }

    try {
      let letterSvg = readFileSync(letterPath, "utf-8");

      // Get viewBox
      const viewBoxMatch = letterSvg.match(/viewBox\s*=\s*"([^"]+)"/i);
      let width = 100, height = 100;
      if (viewBoxMatch) {
        const parts = viewBoxMatch[1].split(/\s+/).map(parseFloat);
        width = parts[2] || 100;
        height = parts[3] || 100;
      }

      // Extract inner content
      const innerMatch = letterSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
      let innerContent = innerMatch ? innerMatch[1] : letterSvg;

      // Apply dark mode color
      if (darkMode) {
        innerContent = innerContent.replace(/#000000/gi, "#e6e6e6");
        innerContent = innerContent.replace(/black/gi, "#e6e6e6");
      }

      return `<g transform="translate(50, 800)">
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${innerContent}
  </svg>
</g>`;
    } catch (error) {
      console.error("[Renderer] Failed to load letter:", error);
      const textColor = darkMode ? "#e6e6e6" : "#000000";
      return `<text x="50" y="880" font-family="Georgia, serif" font-size="100" font-weight="bold" fill="${textColor}">${letter}</text>`;
    }
  }

  /**
   * Get rotation angle for a location (prop orientation)
   */
  private getLocationRotation(location: string): number {
    const rotations: Record<string, number> = {
      n: 0,
      ne: 45,
      e: 90,
      se: 135,
      s: 180,
      sw: 225,
      w: 270,
      nw: 315,
    };
    return rotations[location] || 0;
  }

  /**
   * Calculate arrow rotation based on start/end locations
   */
  private calculateArrowRotation(startLoc: string, endLoc: string): number {
    const startCoords = LOCATION_COORDS[startLoc];
    const endCoords = LOCATION_COORDS[endLoc];

    if (!startCoords || !endCoords) {
      return 0;
    }

    const dx = endCoords.x - startCoords.x;
    const dy = endCoords.y - startCoords.y;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    return angle + 90; // Adjust for arrow pointing direction
  }

  /**
   * Calculate VTG mode for a letter (Type1 letters only: A-V)
   */
  private calculateVTGMode(letter: string, startPlacement: string): VTGMode | null {
    // Only Type1 letters (A-V) have VTG modes
    const letterUpper = letter.toUpperCase();
    if (letterUpper.length !== 1 || letterUpper < "A" || letterUpper > "V") {
      return null;
    }

    const modeOrFunction = DIAMOND_VTG_MAP[letterUpper];
    if (!modeOrFunction) {
      return null;
    }

    if (typeof modeOrFunction === "function") {
      return modeOrFunction(startPlacement);
    }
    return modeOrFunction;
  }

  /**
   * Render the TnD glyph (bottom-right corner)
   * Only renders for Type1 letters (A-V)
   */
  private renderVTGGlyph(letter: string, startPlacement: string, darkMode: boolean): string {
    const vtgMode = this.calculateVTGMode(letter, startPlacement);
    if (!vtgMode) {
      return "";
    }

    const vtgPath = join(this.projectRoot, "static/images/vtg_glyphs", `${vtgMode}.svg`);

    if (!existsSync(vtgPath)) {
      console.error("[Renderer] TnD glyph not found:", vtgPath);
      return "";
    }

    try {
      let vtgSvg = readFileSync(vtgPath, "utf-8");

      // Extract inner content
      const innerMatch = vtgSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
      let innerContent = innerMatch ? innerMatch[1] : vtgSvg;

      // Apply dark mode color if needed
      if (darkMode) {
        // TnD glyphs are black by default, make them light for dark backgrounds
        innerContent = innerContent.replace(/#000000/gi, "#e6e6e6");
        innerContent = innerContent.replace(/black/gi, "#e6e6e6");
      }

      // Position in bottom-right corner (matching VTGGlyph.svelte)
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
   * Extract position group from position string (e.g., "alpha1" -> "alpha")
   */
  private extractPlacementGroup(position: string): string | null {
    const match = position.match(/[a-z]+/i);
    return match ? match[0].toLowerCase() : null;
  }

  /**
   * Render the position glyph (start → end) at top center
   * Not shown for static letters (α, β, γ)
   */
  private renderPlacementGlyph(startPlacement: string, endPlacement: string, darkMode: boolean): string {
    const startGroup = this.extractPlacementGroup(startPlacement);
    const endGroup = this.extractPlacementGroup(endPlacement);

    if (!startGroup || !endGroup) {
      return "";
    }

    // SVG file paths
    const groupToSvg: Record<string, string> = {
      alpha: "α.svg",
      beta: "β.svg",
      gamma: "γ.svg",
    };

    const startFileName = groupToSvg[startGroup];
    const endFileName = groupToSvg[endGroup];

    if (!startFileName || !endFileName) {
      return "";
    }

    const startPath = join(this.projectRoot, "static/images/letters_trimmed/Type6", startFileName);
    const endPath = join(this.projectRoot, "static/images/letters_trimmed/Type6", endFileName);
    const arrowPath = join(this.projectRoot, "static/images/arrow.svg");

    // Check all files exist
    if (!existsSync(startPath) || !existsSync(endPath) || !existsSync(arrowPath)) {
      console.error("[Renderer] Position glyph files not found");
      return "";
    }

    try {
      // Load and process SVGs
      const loadAndProcess = (filePath: string): string => {
        let svg = readFileSync(filePath, "utf-8");
        const innerMatch = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
        let content = innerMatch ? innerMatch[1] : svg;

        if (darkMode) {
          // Invert for dark mode
          content = content.replace(/#000000/gi, "#e6e6e6");
          content = content.replace(/black/gi, "#e6e6e6");
        }
        return content;
      };

      const startContent = loadAndProcess(startPath);
      const endContent = loadAndProcess(endPath);
      const arrowContent = loadAndProcess(arrowPath);

      // Calculate dimensions (scaled)
      const scaledLetterWidth = 92.22 * POSITION_SCALE_FACTOR; // Using alpha width as reference
      const scaledLetterHeight = POSITION_LETTER_HEIGHT * POSITION_SCALE_FACTOR;
      const scaledArrowWidth = POSITION_ARROW_WIDTH * POSITION_SCALE_FACTOR;
      const scaledArrowHeight = POSITION_ARROW_HEIGHT * POSITION_SCALE_FACTOR;

      // Calculate positions
      const centerLine = scaledLetterHeight / 2;
      const startX = 0;
      const startY = centerLine - scaledLetterHeight / 2;
      const arrowX = scaledLetterWidth + POSITION_SPACING * POSITION_SCALE_FACTOR;
      const arrowY = centerLine - scaledArrowHeight / 2;
      const endX = scaledLetterWidth + scaledArrowWidth + POSITION_SPACING;
      const endY = centerLine - scaledLetterHeight / 2;

      // Total width for centering
      const totalWidth = scaledLetterWidth + scaledArrowWidth + scaledLetterWidth + POSITION_SPACING;
      const groupX = VIEWBOX_SIZE / 2 - totalWidth / 2;

      return `<g transform="translate(${groupX}, ${POSITION_Y})">
  <!-- Start position -->
  <svg x="${startX}" y="${startY}" width="${scaledLetterWidth}" height="${scaledLetterHeight}" viewBox="0 0 92.22 100">
    ${startContent}
  </svg>
  <!-- Arrow -->
  <svg x="${arrowX}" y="${arrowY}" width="${scaledArrowWidth}" height="${scaledArrowHeight}" viewBox="0 0 ${POSITION_ARROW_WIDTH} ${POSITION_ARROW_HEIGHT}">
    ${arrowContent}
  </svg>
  <!-- End position -->
  <svg x="${endX}" y="${endY}" width="${scaledLetterWidth}" height="${scaledLetterHeight}" viewBox="0 0 92.22 100">
    ${endContent}
  </svg>
</g>`;
    } catch (error) {
      console.error("[Renderer] Failed to render position glyph:", error);
      return "";
    }
  }

  /**
   * Convert SVG to PNG using resvg-js
   */
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
let rendererInstance: StandalonePictographRenderer | null = null;

export function getStandalonePictographRenderer(): StandalonePictographRenderer {
  if (!rendererInstance) {
    rendererInstance = new StandalonePictographRenderer();
  }
  return rendererInstance;
}
