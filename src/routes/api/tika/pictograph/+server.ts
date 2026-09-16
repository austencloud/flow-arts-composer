/**
 * Tika Pictograph Generation API
 *
 * Generates pictograph images for the Tika learning assistant.
 * Uses the same StandaloneRenderer as the MCP server.
 *
 * NOTE: This API only works in development mode. In production (static build),
 * pictographs are served from pre-rendered static files or Firebase Storage.
 *
 * NOTE: If renderer changes don't take effect, restart the dev server.
 * The mcp-server module is externalized and cached by Node.js.
 */

import { json, type RequestHandler } from "@sveltejs/kit";
import { dev } from "$app/environment";
import fs from "fs";
import path from "path";
import { RATE_LIMITS } from "$lib/server/security/rate-limiter";
import { withRateLimit } from "$lib/server/security/withRateLimit";

// Get absolute path to mcp-server renderer using process.cwd() (more reliable in Vite SSR)
const MCP_RENDERER_PATH = path.join(
  process.cwd(),
  "mcp-server",
  "dist",
  "src",
  "core",
  "standalone-renderer.js"
);

// Types for pictograph data (matches MCP server)
interface MotionData {
  hand: string;
  startLocation: string;
  endLocation: string;
  motionType: string;
  rotationDirection: string;
}

interface PictographData {
  letter: string;
  startPlacement: string;
  endPlacement: string;
  timing: string;
  direction: string;
  leftMotion: MotionData;
  rightMotion: MotionData;
}

// Cache for loaded pictograph data by grid mode
let diamondPictographs: PictographData[] = [];
let boxPictographs: PictographData[] = [];

function loadCsvFile(csvPath: string): PictographData[] {
  try {
    const csvContent = fs.readFileSync(csvPath, "utf-8");
    const lines = csvContent.trim().split("\n");
    if (lines.length < 2) return [];

    const headerLine = lines[0];
    if (!headerLine) return [];
    const headers = headerLine.split(",").map((h) => h.trim());
    const pictographs: PictographData[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const values = line.split(",").map((v) => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = values[index] ?? "";
      });

      pictographs.push({
        letter: row["letter"] ?? "",
        startPlacement: row["startPlacement"] ?? "",
        endPlacement: row["endPlacement"] ?? "",
        timing: row["timing"] ?? "",
        direction: row["direction"] ?? "",
        leftMotion: {
          hand: "left",
          startLocation: row["blueStartLocation"] ?? "",
          endLocation: row["blueEndLocation"] ?? "",
          motionType: row["blueMotionType"] ?? "",
          rotationDirection: row["blueRotationDirection"] ?? "",
        },
        rightMotion: {
          hand: "right",
          startLocation: row["redStartLocation"] ?? "",
          endLocation: row["redEndLocation"] ?? "",
          motionType: row["redMotionType"] ?? "",
          rotationDirection: row["redRotationDirection"] ?? "",
        },
      });
    }

    return pictographs;
  } catch (error) {
    console.error("[Tika API] Failed to load CSV:", csvPath, error);
    return [];
  }
}

function ensureDataLoaded() {
  if (diamondPictographs.length === 0) {
    console.log("[Tika API] Loading pictograph dataframes...");
    const diamondPath = path.join(
      process.cwd(),
      "static",
      "data",
      "pictographs",
      "DiamondPictographDataframe.csv"
    );
    const boxPath = path.join(
      process.cwd(),
      "static",
      "data",
      "pictographs",
      "BoxPictographDataframe.csv"
    );
    diamondPictographs = loadCsvFile(diamondPath);
    boxPictographs = loadCsvFile(boxPath);
    console.log(
      `[Tika API] Loaded ${diamondPictographs.length} diamond + ${boxPictographs.length} box pictographs`
    );
  }
}

function getPictographsForMode(gridMode: "diamond" | "box"): PictographData[] {
  return gridMode === "box" ? boxPictographs : diamondPictographs;
}

export const POST: RequestHandler = async (event) => {
  // This API only works in development - production uses pre-rendered static files
  if (!dev) {
    return json(
      { error: "Pictograph API is only available in development mode" },
      { status: 503 }
    );
  }

  const blocked = await withRateLimit(event, RATE_LIMITS.AI_RENDER, "ip");
  if (blocked) return blocked;

  const { request } = event;

  try {
    const {
      letter,
      variation = 0,
      gridMode = "diamond",
      options = {},
      format = "png",
    } = await request.json();

    if (!letter) {
      return json({ error: "Missing letter parameter" }, { status: 400 });
    }

    ensureDataLoaded();

    // Get pictographs for the specified grid mode
    const pictographs = getPictographsForMode(gridMode);

    // Find variations for this letter in the specified mode
    const variations = pictographs.filter((p) => p.letter === letter);

    if (variations.length === 0) {
      return json(
        {
          error: `No pictograph found for letter: ${letter} in ${gridMode} mode`,
        },
        { status: 404 }
      );
    }

    if (variation >= variations.length) {
      return json(
        {
          error: `Variation ${variation} not found. Letter ${letter} has ${variations.length} ${gridMode} variations (0-${variations.length - 1})`,
        },
        { status: 400 }
      );
    }

    const csvRow = variations[variation];
    if (!csvRow) {
      return json({ error: "Variation not found" }, { status: 404 });
    }

    // Dynamic import of MCP server's standalone renderer (dev only)
    // Uses file:// URL with absolute path to bypass Vite's module resolution
    const rendererUrl = `file://${MCP_RENDERER_PATH.replace(/\\/g, "/")}`;
    const { getStandaloneRenderer } = await import(
      /* @vite-ignore */ rendererUrl
    );

    // Convert CSV row to renderer input format
    const pictographInput = {
      letter: csvRow.letter,
      startPlacement: csvRow.startPlacement,
      endPlacement: csvRow.endPlacement,
      gridMode,
      leftMotion: {
        motionType: csvRow.leftMotion.motionType,
        rotationDirection: csvRow.leftMotion.rotationDirection || "no_rotation",
        startLocation: csvRow.leftMotion.startLocation,
        endLocation: csvRow.leftMotion.endLocation,
        hand: "left",
        turns: 0,
        startOrientation: "in",
      },
      rightMotion: {
        motionType: csvRow.rightMotion.motionType,
        rotationDirection:
          csvRow.rightMotion.rotationDirection || "no_rotation",
        startLocation: csvRow.rightMotion.startLocation,
        endLocation: csvRow.rightMotion.endLocation,
        hand: "right",
        turns: 0,
        startOrientation: "in",
      },
    };

    // Merge default options with provided options
    const visibilityOptions = {
      darkMode: options.darkMode ?? true,
      size: options.size ?? 400,
      showTKA: options.showTKA ?? true,
      showTnD: options.showTnD ?? false,
      showElemental: options.showElemental ?? false,
      showPlacements: options.showPlacements ?? false,
      showReversals: options.showReversals ?? false,
      showGrid: options.showGrid ?? true,
      showNonRadialPoints: options.showNonRadialPoints ?? false,
      showLeftMotion: options.showLeftMotion ?? true,
      showRightMotion: options.showRightMotion ?? true,
      // Prop type options for position-first teaching (hand props instead of staffs)
      leftPropType: options.leftPropType ?? null,
      rightPropType: options.rightPropType ?? null,
    };

    const motionData = {
      letter: csvRow.letter,
      startPlacement: csvRow.startPlacement,
      endPlacement: csvRow.endPlacement,
      leftMotion: {
        motionType: csvRow.leftMotion.motionType,
        startLocation: csvRow.leftMotion.startLocation,
        endLocation: csvRow.leftMotion.endLocation,
        rotationDirection: csvRow.leftMotion.rotationDirection,
      },
      rightMotion: {
        motionType: csvRow.rightMotion.motionType,
        startLocation: csvRow.rightMotion.startLocation,
        endLocation: csvRow.rightMotion.endLocation,
        rotationDirection: csvRow.rightMotion.rotationDirection,
      },
    };

    const renderer = getStandaloneRenderer();

    if (format === "svg") {
      const svgMarkup = await renderer.renderToSvg(pictographInput, {
        ...visibilityOptions,
        themeable: true,
        inline: true,
      });
      return json({
        svgMarkup,
        motionData,
        variationCount: variations.length,
        variationIndex: variation,
      });
    } else {
      const base64 = await renderer.renderToBase64(
        pictographInput,
        visibilityOptions
      );
      return json({
        imageBase64: base64,
        motionData,
        variationCount: variations.length,
        variationIndex: variation,
      });
    }
  } catch (error) {
    console.error("[Tika API] Pictograph generation error:", error);
    return json(
      {
        error: `Failed to generate pictograph: ${error instanceof Error ? error.message : String(error)}`,
      },
      { status: 500 }
    );
  }
};

// GET endpoint for simple letter lookups - returns PNG directly
export const GET: RequestHandler = async (event) => {
  // This API only works in development - production uses pre-rendered static files
  if (!dev) {
    return json(
      { error: "Pictograph API is only available in development mode" },
      { status: 503 }
    );
  }

  const blocked = await withRateLimit(event, RATE_LIMITS.AI_RENDER, "ip");
  if (blocked) return blocked;

  const { url } = event;

  const letter = url.searchParams.get("letter");
  const variation = parseInt(url.searchParams.get("variation") || "0", 10);
  const darkMode = url.searchParams.get("darkMode") !== "false";
  const gridMode = (url.searchParams.get("gridMode") || "diamond") as
    | "diamond"
    | "box";

  if (!letter) {
    return json({ error: "Missing letter parameter" }, { status: 400 });
  }

  ensureDataLoaded();

  // Get pictographs for the specified grid mode
  const variations = getPictographsForMode(gridMode).filter(
    (p) => p.letter === letter
  );

  if (variations.length === 0) {
    return json(
      { error: `No pictograph found for letter: ${letter}` },
      { status: 404 }
    );
  }

  if (variation >= variations.length) {
    return json(
      {
        error: `Variation ${variation} not found. Letter ${letter} has ${variations.length} variations (0-${variations.length - 1})`,
      },
      { status: 400 }
    );
  }

  const csvRow = variations[variation];
  if (!csvRow) {
    return json({ error: "Variation not found" }, { status: 404 });
  }

  try {
    // Dynamic import (dev only) - uses file:// URL with absolute path
    const rendererUrl = `file://${MCP_RENDERER_PATH.replace(/\\/g, "/")}`;
    const { getStandaloneRenderer } = await import(
      /* @vite-ignore */ rendererUrl
    );

    const pictographInput = {
      letter: csvRow.letter,
      startPlacement: csvRow.startPlacement,
      endPlacement: csvRow.endPlacement,
      gridMode,
      leftMotion: {
        motionType: csvRow.leftMotion.motionType,
        rotationDirection: csvRow.leftMotion.rotationDirection || "no_rotation",
        startLocation: csvRow.leftMotion.startLocation,
        endLocation: csvRow.leftMotion.endLocation,
        hand: "left",
        turns: 0,
        startOrientation: "in",
      },
      rightMotion: {
        motionType: csvRow.rightMotion.motionType,
        rotationDirection:
          csvRow.rightMotion.rotationDirection || "no_rotation",
        startLocation: csvRow.rightMotion.startLocation,
        endLocation: csvRow.rightMotion.endLocation,
        hand: "right",
        turns: 0,
        startOrientation: "in",
      },
    };

    const renderer = getStandaloneRenderer();
    const pngBuffer = await renderer.renderToPng(pictographInput, {
      darkMode,
      size: 400,
      showTKA: true,
      showGrid: true,
    });

    return new Response(new Uint8Array(pngBuffer), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("[Tika API] Pictograph render error:", error);
    return json(
      {
        error: `Failed to render pictograph: ${error instanceof Error ? error.message : String(error)}`,
      },
      { status: 500 }
    );
  }
};
