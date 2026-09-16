/**
 * Showcase Script - Generate grid image with all TKA pictograph letters
 *
 * Each letter uses variation 0, zero turns, with orientations auto-calculated.
 */
import { writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Resvg } from "@resvg/resvg-js";
import { getStandaloneRenderer } from "./src/core/standalone-renderer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// TKA Letter Types - organized by category (from kinetic-alphabet-sort.ts)
const LETTER_GROUPS = [
  {
    name: "Type 1: Dual-Shift",
    description: "Both hands shift positions",
    letters: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V"],
  },
  {
    name: "Type 2: Shift",
    description: "One hand shifts, one static",
    letters: ["W", "X", "Y", "Z", "Σ", "Δ", "Θ", "Ω"],
  },
  {
    name: "Type 3: Cross-Shift",
    description: "Shift + Dash combination",
    letters: ["W-", "X-", "Y-", "Z-", "Σ-", "Δ-", "Θ-", "Ω-"],
  },
  {
    name: "Type 4: Dash",
    description: "One hand dashes, one static",
    letters: ["Φ", "Ψ", "Λ"],
  },
  {
    name: "Type 5: Dual-Dash",
    description: "Both hands dash",
    letters: ["Φ-", "Ψ-", "Λ-"],
  },
  {
    name: "Type 6: Static",
    description: "No motion, holding position",
    letters: ["α", "β", "γ"],
  },
];

// Grid configuration
const CELL_SIZE = 120;
const HEADER_HEIGHT = 40;
const GROUP_PADDING = 20;
const GRID_COLS = 11; // Max letters per row

interface PictographData {
  letter: string;
  startPlacement: string;
  endPlacement: string;
  leftMotion: {
    hand: "left";
    startLocation: string;
    endLocation: string;
    motionType: string;
    rotationDirection: string;
  };
  rightMotion: {
    hand: "right";
    startLocation: string;
    endLocation: string;
    motionType: string;
    rotationDirection: string;
  };
}

// Cache for loaded data
let allPictographs: PictographData[] | null = null;

// Load all pictograph data from CSV
function loadAllPictographs(): PictographData[] {
  if (allPictographs) return allPictographs;

  try {
    const csvPath = join(__dirname, "../static/data/pictographs/DiamondPictographDataframe.csv");
    const csvContent = readFileSync(csvPath, "utf-8");
    // Handle Windows line endings
    const lines = csvContent.trim().replace(/\r/g, "").split("\n");
    if (lines.length < 2) return [];

    const headers = lines[0].split(",");
    const getIndex = (name: string) => headers.indexOf(name);

    const result: PictographData[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = line.split(",");

      result.push({
        letter: values[getIndex("letter")],
        startPlacement: values[getIndex("startPlacement")],
        endPlacement: values[getIndex("endPlacement")],
        leftMotion: {
          hand: "left",
          motionType: values[getIndex("blueMotionType")],
          rotationDirection: values[getIndex("blueRotationDirection")],
          startLocation: values[getIndex("blueStartLocation")],
          endLocation: values[getIndex("blueEndLocation")],
        },
        rightMotion: {
          hand: "right",
          motionType: values[getIndex("redMotionType")],
          rotationDirection: values[getIndex("redRotationDirection")],
          startLocation: values[getIndex("redStartLocation")],
          endLocation: values[getIndex("redEndLocation")],
        },
      });
    }

    allPictographs = result;
    return result;
  } catch (error) {
    console.error("Failed to load pictograph dataframe:", error);
    return [];
  }
}

// Load pictograph data for a letter (first variation)
function loadPictographData(letter: string): PictographData | null {
  const all = loadAllPictographs();
  return all.find((d) => d.letter === letter) || null;
}

function calculateCanvasDimensions(): { width: number; height: number } {
  let totalHeight = GROUP_PADDING; // Top padding

  for (const group of LETTER_GROUPS) {
    totalHeight += HEADER_HEIGHT; // Group header
    const rows = Math.ceil(group.letters.length / GRID_COLS);
    totalHeight += rows * CELL_SIZE;
    totalHeight += GROUP_PADDING; // Gap between groups
  }

  const width = GRID_COLS * CELL_SIZE + GROUP_PADDING * 2;
  return { width, height: totalHeight };
}

async function renderLetter(
  renderer: ReturnType<typeof getStandaloneRenderer>,
  letter: string
): Promise<string> {
  const data = loadPictographData(letter);

  if (!data) {
    return createEmptyCell(letter);
  }

  const input = {
    letter: data.letter,
    startPlacement: data.startPlacement,
    endPlacement: data.endPlacement,
    leftMotion: {
      hand: "left" as const,
      motionType: data.leftMotion.motionType,
      rotationDirection: data.leftMotion.rotationDirection || "cw",
      startLocation: data.leftMotion.startLocation,
      endLocation: data.leftMotion.endLocation,
      turns: 0,
      startOrientation: "in",
    },
    rightMotion: {
      hand: "right" as const,
      motionType: data.rightMotion.motionType,
      rotationDirection: data.rightMotion.rotationDirection || "cw",
      startLocation: data.rightMotion.startLocation,
      endLocation: data.rightMotion.endLocation,
      turns: 0,
      startOrientation: "in",
    },
  };

  return renderer.renderToSvg(input, {
    darkMode: true,
    showTKA: true,
    showTND: true,
    showElemental: true,
    showPlacements: true,
    showGrid: true,
    showLeftMotion: true,
    showRightMotion: true,
  });
}

async function main() {
  console.log("=== TKA Pictograph Showcase Generator ===\n");

  const totalLetters = LETTER_GROUPS.reduce((sum, g) => sum + g.letters.length, 0);
  console.log(`Generating ${totalLetters} letters across ${LETTER_GROUPS.length} groups`);
  console.log("All letters use 0 turns with auto-calculated orientations\n");

  const renderer = getStandaloneRenderer();
  const { width: CANVAS_WIDTH, height: CANVAS_HEIGHT } = calculateCanvasDimensions();

  console.log(`Canvas size: ${CANVAS_WIDTH}x${CANVAS_HEIGHT}px\n`);

  // Render all letters grouped
  const groupedSvgs: Map<string, string[]> = new Map();
  let letterCount = 0;

  for (const group of LETTER_GROUPS) {
    console.log(`\n${group.name}:`);
    const svgs: string[] = [];

    for (const letter of group.letters) {
      letterCount++;
      try {
        const svg = await renderLetter(renderer, letter);
        svgs.push(svg);
        console.log(`  [${letterCount}/${totalLetters}] ${letter}: ✓`);
      } catch (error) {
        svgs.push(createEmptyCell(letter));
        console.log(`  [${letterCount}/${totalLetters}] ${letter}: ✗ ${error}`);
      }
    }

    groupedSvgs.set(group.name, svgs);
  }

  // Assemble grouped grid SVG
  console.log("\nAssembling grouped grid...");
  const gridSvg = assembleGroupedGrid(groupedSvgs, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Convert to PNG
  console.log("Converting to PNG...");
  const resvg = new Resvg(gridSvg, {
    fitTo: {
      mode: "width",
      value: CANVAS_WIDTH * 2, // 2x for higher resolution
    },
    font: {
      loadSystemFonts: true,
    },
  });

  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();

  writeFileSync("C:/Users/Austen/Desktop/tka-showcase-all-letters.png", pngBuffer);
  console.log("\n✓ Saved to: C:/Users/Austen/Desktop/tka-showcase-all-letters.png");
}

function createEmptyCell(letter: string): string {
  return `<svg viewBox="0 0 950 950" xmlns="http://www.w3.org/2000/svg">
    <rect width="950" height="950" fill="#0a0a0f"/>
    <text x="475" y="500" fill="#444" font-size="100" text-anchor="middle" font-family="Arial">${escapeXml(letter)}</text>
    <text x="475" y="600" fill="#333" font-size="30" text-anchor="middle" font-family="Arial">No Data</text>
  </svg>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function assembleGroupedGrid(
  groupedSvgs: Map<string, string[]>,
  canvasWidth: number,
  canvasHeight: number
): string {
  const elements: string[] = [];
  let currentY = GROUP_PADDING;

  for (const group of LETTER_GROUPS) {
    const svgs = groupedSvgs.get(group.name) || [];
    if (svgs.length === 0) continue;

    // Group header background
    elements.push(`
      <rect x="0" y="${currentY - 5}" width="${canvasWidth}" height="${HEADER_HEIGHT}" fill="#1a1a2e"/>
    `);

    // Group header text
    elements.push(`
      <text x="${GROUP_PADDING}" y="${currentY + 25}" fill="#ffffff" font-size="20" font-family="Arial, sans-serif" font-weight="bold">${escapeXml(group.name)}</text>
      <text x="${GROUP_PADDING + 250}" y="${currentY + 25}" fill="#888888" font-size="14" font-family="Arial, sans-serif">${escapeXml(group.description)}</text>
    `);

    currentY += HEADER_HEIGHT;

    // Render cells for this group
    for (let i = 0; i < svgs.length; i++) {
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      const x = GROUP_PADDING + col * CELL_SIZE;
      const y = currentY + row * CELL_SIZE;

      // Extract inner content from each SVG
      const svg = svgs[i];
      const innerMatch = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
      const inner = innerMatch ? innerMatch[1] : "";

      elements.push(`
        <g transform="translate(${x}, ${y})">
          <svg x="0" y="0" width="${CELL_SIZE}" height="${CELL_SIZE}" viewBox="0 0 950 950" preserveAspectRatio="xMidYMid meet">
            ${inner}
          </svg>
        </g>
      `);
    }

    // Move Y position for next group
    const rows = Math.ceil(svgs.length / GRID_COLS);
    currentY += rows * CELL_SIZE + GROUP_PADDING;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}">
    <rect width="${canvasWidth}" height="${canvasHeight}" fill="#0a0a0f"/>
    ${elements.join("\n")}
  </svg>`;
}

main().catch(console.error);
