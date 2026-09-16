#!/usr/bin/env tsx
/**
 * Standalone Pictograph CLI
 *
 * Renders pictographs using Canvas2DDirectRenderer in Node.js
 * No browser, no auth, no dev server required
 *
 * Usage:
 *   npm run pictograph A
 *   npm run pictograph A B C
 *   npm run pictograph --all
 */

// CRITICAL: Load Svelte runes mock FIRST (before any .svelte.ts file imports)
import "./svelte-runes-mock";

import { fileURLToPath } from "url";
import path from "path";
import { createCanvas, Canvas as NodeCanvas, Image } from "canvas";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Provide global Canvas, Image, and DOMParser for Node.js context
if (typeof global !== "undefined") {
  (global as any).Canvas = NodeCanvas;
  (global as any).Image = Image;

  // Mock document for Canvas2DDirectRenderer isSupported() check
  if (typeof (global as any).document === "undefined") {
    (global as any).document = {
      createElement: (tag: string) => {
        if (tag === "canvas") return createCanvas(1, 1);
        return {};
      },
    };
  }

  // Provide DOMParser for SVG parsing (ArrowSvgParser needs this)
  if (typeof (global as any).DOMParser === "undefined") {
    const { JSDOM } = await import("jsdom");
    (global as any).DOMParser = new JSDOM().window.DOMParser;
  }
}

const OUTPUT_DIR = path.join(
  __dirname,
  "..",
  "static",
  "images",
  "grant-feature"
);

interface PictographData {
  id: string;
  letter: string;
  motions: {
    left: MotionData;
    right: MotionData;
  };
}

interface MotionData {
  motionType: string;
  rotationDirection: string;
  startLocation: string;
  endLocation: string;
  startOrientation: string;
  endOrientation: string;
  turns: number;
  propType: string;
  propPlacementData: {
    propType: string;
  };
}

async function loadPictographData(
  letter: string,
  startPos?: string,
  endPos?: string
): Promise<PictographData> {
  const csvPath = path.join(
    __dirname,
    "..",
    "static",
    "data",
    "pictographs",
    "DiamondPictographDataframe.csv"
  );
  const csvData = fs.readFileSync(csvPath, "utf-8");
  const lines = csvData.split(/\r?\n/); // Handle both Unix and Windows line endings
  const headers = lines[0].split(",").map((h) => h.trim());

  let row: string[] | null = null;
  for (let i = 1; i < lines.length; i++) {
    const r = lines[i].split(",").map((v) => v.trim());
    // Match by letter and optionally by start/end positions
    if (r[0] === letter) {
      // If positions specified, filter by them
      if (startPos && endPos) {
        const rowStartPos = r[headers.indexOf("startPlacement")];
        const rowEndPos = r[headers.indexOf("endPlacement")];
        if (rowStartPos === startPos && rowEndPos === endPos) {
          row = r;
          break;
        }
      } else {
        // No position filter, take first match
        row = r;
        break;
      }
    }
  }

  if (!row) {
    throw new Error(
      `No data found for letter ${letter}${startPos ? ` (${startPos}→${endPos})` : ""}`
    );
  }

  // CSV already contains abbreviated locations (w, e, n, s, etc.)
  // These match GridLocation enum values and should NOT be expanded
  const leftEndLocation = row[headers.indexOf("blueEndLocation")];
  const rightEndLocation = row[headers.indexOf("redEndLocation")];
  const leftStartLocation = row[headers.indexOf("blueStartLocation")];
  const rightStartLocation = row[headers.indexOf("redStartLocation")];

  // Calculate turns based on rotation direction
  const leftRotDir = row[headers.indexOf("blueRotationDirection")];
  const rightRotDir = row[headers.indexOf("redRotationDirection")];
  const leftTurns = leftRotDir === "noRotation" ? 0 : 1;
  const rightTurns = rightRotDir === "noRotation" ? 0 : 1;

  return {
    id: `pictograph-${letter}`,
    letter: letter,
    motions: {
      left: {
        hand: "left", // CRITICAL: Required for color transformation
        motionType: row[headers.indexOf("blueMotionType")],
        rotationDirection: leftRotDir,
        startLocation: leftStartLocation,
        endLocation: leftEndLocation,
        startOrientation: "in",
        endOrientation: "in",
        turns: leftTurns,
        propType: "staff",
        propPlacementData: {
          propType: "staff",
          positionX: 0, // Will be calculated by PropPlacer
          positionY: 0,
          rotationAngle: 0,
        },
        // Placeholder arrow placement data (will be calculated by ArrowLifecycleManager)
        arrowPlacementData: {
          positionX: 0,
          positionY: 0,
          rotationAngle: 0,
          coordinates: null,
          svgCenter: null,
          svgMirrored: false,
        },
      },
      right: {
        hand: "right", // CRITICAL: Required for color transformation
        motionType: row[headers.indexOf("redMotionType")],
        rotationDirection: rightRotDir,
        startLocation: rightStartLocation,
        endLocation: rightEndLocation,
        startOrientation: "in",
        endOrientation: "in",
        turns: rightTurns,
        propType: "staff",
        propPlacementData: {
          propType: "staff",
          positionX: 0, // Will be calculated by PropPlacer
          positionY: 0,
          rotationAngle: 0,
        },
        // Placeholder arrow placement data (will be calculated by ArrowLifecycleManager)
        arrowPlacementData: {
          positionX: 0,
          positionY: 0,
          rotationAngle: 0,
          coordinates: null,
          svgCenter: null,
          svgMirrored: false,
        },
      },
    },
  };
}

async function renderPictograph(
  letter: string,
  options: {
    startPos?: string;
    endPos?: string;
    themeMode?: "light" | "dark";
  } = {}
): Promise<string> {
  const placementLabel = options.startPos
    ? ` (${options.startPos}→${options.endPos})`
    : "";
  console.log(`\n🎨 Rendering pictograph ${letter}${placementLabel}...`);

  const pictographData = await loadPictographData(
    letter,
    options.startPos,
    options.endPos
  );
  console.log(`  ✓ Loaded data`);

  // Import Node.js preparer factory
  console.log(`  📦 Loading preparer...`);
  const { createNodePictographPreparer } = await import(
    pathToFileURL(
      path.join(__dirname, "node", "create-node-pictograph-preparer.ts")
    ).href
  );
  console.log(`  ✓ Preparer module loaded`);
  const { pictographPreparer, turnsTupleGenerator } =
    createNodePictographPreparer();
  console.log(`  ✓ Created preparer instance`);

  // Dynamically import Canvas2DDirectRenderer
  const rendererPath = pathToFileURL(
    path.join(
      __dirname,
      "..",
      "src",
      "lib",
      "shared",
      "render",
      "services",
      "implementations",
      "Canvas2DDirectRenderer.ts"
    )
  ).href;
  const { Canvas2DDirectRenderer } = await import(rendererPath);
  console.log(`  ✓ Loaded renderer`);

  // Create renderer WITH preparer
  const renderer = new Canvas2DDirectRenderer(pictographPreparer);

  // Set global turn tuple generator for turn numbers
  Canvas2DDirectRenderer.setGlobalTurnsTupleGeneratorGetter(
    () => turnsTupleGenerator
  );

  await renderer.initialize();
  console.log(`  ✓ Initialized renderer`);

  // Render pictograph (grid + glyph + props + arrows)
  console.log(`  🎨 Rendering pictograph...`);
  const themeMode = options.themeMode ?? "light";
  const isDarkMode = themeMode === "dark";

  // DEBUG: Check if pictograph has prepared data before rendering
  const asPrepared = pictographData as any;
  console.log(
    `  [DEBUG] Has _prepared before render: ${!!asPrepared._prepared}`
  );

  const canvas = await renderer.renderPictograph(pictographData as any, {
    size: 950,
    visibility: {
      showGrid: true,
      showTKA: true,
      showTND: false,
      showElemental: false,
      showPlacements: false,
      showReversals: false,
      showNonRadialPoints: false,
      darkMode: isDarkMode,
      handPointVisibility: "active",
      // Explicitly pass prop types to avoid needing global settings
      leftPropType: "staff" as any,
      rightPropType: "staff" as any,
    },
    themeMode, // Pass theme mode for prop/arrow color selection
  });

  console.log(`  ✓ Rendered (${canvas.width}x${canvas.height})`);

  // DEBUG: Check if pictograph was prepared during render
  console.log(
    `  [DEBUG] Has _prepared after render: ${!!asPrepared._prepared}`
  );
  if (asPrepared._prepared) {
    console.log(
      `  [DEBUG] Has arrowPositions: ${!!asPrepared._prepared.arrowPositions}`
    );
    console.log(
      `  [DEBUG] Has arrowAssets: ${!!asPrepared._prepared.arrowAssets}`
    );
    if (asPrepared._prepared.arrowPositions) {
      console.log(
        `  [DEBUG] Blue arrow position:`,
        asPrepared._prepared.arrowPositions.left
      );
      console.log(
        `  [DEBUG] Red arrow position:`,
        asPrepared._prepared.arrowPositions.right
      );
    }
  }

  // Save to file
  const buffer = canvas.toBuffer("image/png");

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const themeSuffix = themeMode === "dark" ? "-dark" : "";
  const outputPath = path.join(
    OUTPUT_DIR,
    `pictograph-${letter}${themeSuffix}.png`
  );
  fs.writeFileSync(outputPath, buffer);

  console.log(`  ✅ Saved: ${outputPath}`);

  return outputPath;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: npm run pictograph A B C");
    console.log("   Or: npm run pictograph --all");
    process.exit(1);
  }

  // Check for theme mode flag
  const themeMode: "light" | "dark" = args.includes("--dark")
    ? "dark"
    : "light";

  // Filter out flags from arguments to get actual letters
  let letters = args.filter((arg) => !arg.startsWith("--"));

  if (args[0] === "--all") {
    letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  }

  console.log("═══════════════════════════════════════════════════════");
  console.log("  TKA Pictograph CLI");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`\n📝 Generating ${letters.length} pictograph(s)...`);

  const startTime = Date.now();
  const results: {
    letter: string;
    success: boolean;
    path?: string;
    error?: string;
  }[] = [];

  for (const letter of letters) {
    try {
      // For letters A, B, C use alpha1→alpha3 variation for grant feature
      const options: any = { themeMode };
      if (["A", "B", "C"].includes(letter)) {
        options.startPos = "alpha1";
        options.endPos = "alpha3";
      }

      const outputPath = await renderPictograph(letter, options);
      results.push({ letter, success: true, path: outputPath });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`  ❌ Failed: ${errorMsg}`);
      if (error instanceof Error && error.stack) {
        console.error(error.stack);
      }
      results.push({ letter, success: false, error: errorMsg });
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Summary
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  Summary");
  console.log("═══════════════════════════════════════════════════════");

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log(`\n✅ Successful: ${successful.length}/${letters.length}`);
  if (failed.length > 0) {
    console.log(`❌ Failed: ${failed.length}`);
    failed.forEach((f) => console.log(`  - ${f.letter}: ${f.error}`));
  }

  console.log(`\n⏱️  Total time: ${elapsed}s`);
  console.log(`📁 Output: ${OUTPUT_DIR}\n`);

  process.exit(failed.length > 0 ? 1 : 0);
}

// Helper to convert path to file URL
function pathToFileURL(filePath: string): URL {
  return new URL(`file:///${filePath.replace(/\\/g, "/")}`);
}

main().catch((error) => {
  console.error("\n❌ Fatal error:", error);
  console.error(error.stack);
  process.exit(1);
});
