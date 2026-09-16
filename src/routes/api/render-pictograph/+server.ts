import type { RequestHandler } from "@sveltejs/kit";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import { dev } from "$app/environment";
import fs from "fs";
import path from "path";
import { RATE_LIMITS } from "$lib/server/security/rate-limiter";
import { withRateLimit } from "$lib/server/security/withRateLimit";

/**
 * Public API endpoint - renders pictograph and returns PNG
 * No auth required
 */
export const GET: RequestHandler = async (event) => {
  if (!dev) {
    return new Response("This endpoint is only available in development", {
      status: 404,
    });
  }

  const blocked = await withRateLimit(event, RATE_LIMITS.AI_RENDER, "ip");
  if (blocked) return blocked;

  const { url } = event;
  const letter = url.searchParams.get("letter");

  if (!letter) {
    return new Response("Missing letter parameter", { status: 400 });
  }

  try {
    // Dynamically import so Node.js canvas works server-side
    const { createCanvas: _createCanvas } = await import("canvas");
    const { canvas2DDirectRenderer } =
      await import("$lib/shared/render/services/canvas-2d-direct-renderer");

    const csvPath = path.join(
      process.cwd(),
      "static",
      "data",
      "pictographs",
      "DiamondPictographDataframe.csv"
    );
    const csvData = fs.readFileSync(csvPath, "utf-8");
    const lines = csvData.split("\n");
    const firstLine = lines[0];

    if (!firstLine) {
      return new Response("Empty CSV file", { status: 500 });
    }

    const headers = firstLine.split(",");

    // Find the letter
    let row: string[] | null = null;
    for (let i = 1; i < lines.length; i++) {
      const currentLine = lines[i];
      if (!currentLine) continue;

      const r = currentLine.split(",");
      if (r[0] === letter) {
        row = r;
        break;
      }
    }

    if (!row) {
      return new Response(`No data found for letter ${letter}`, {
        status: 404,
      });
    }

    // Create pictograph data
    const pictographData = {
      id: `pictograph-${letter}`,
      letter: letter,
      motions: {
        left: {
          hand: "left",
          motionType: row[headers.indexOf("blueMotionType")],
          rotationDirection: row[headers.indexOf("blueRotationDirection")],
          startLocation: row[headers.indexOf("blueStartLocation")],
          endLocation: row[headers.indexOf("blueEndLocation")],
          startOrientation: "in",
          endOrientation: "in",
          turns: 1,
          propType: "staff",
          propPlacementData: { propType: "staff" },
        },
        right: {
          hand: "right",
          motionType: row[headers.indexOf("redMotionType")],
          rotationDirection: row[headers.indexOf("redRotationDirection")],
          startLocation: row[headers.indexOf("redStartLocation")],
          endLocation: row[headers.indexOf("redEndLocation")],
          startOrientation: "in",
          endOrientation: "in",
          turns: 1,
          propType: "staff",
          propPlacementData: { propType: "staff" },
        },
      },
    };

    // Use direct import (avoids DI container rebuilds)
    const renderer = canvas2DDirectRenderer;
    await renderer.initialize();

    // Render using real Canvas2DDirectRenderer with Node.js canvas
    const canvas = await renderer.renderPictograph(
      pictographData as unknown as PictographData,
      {
        size: 950,
        visibility: {
          showTKA: true,
          showTnD: false,
          showElemental: false,
          showPlacements: false,
          showReversals: false,
          showNonRadialPoints: false,
          darkMode: false,
        },
      }
    );

    // Convert to PNG buffer (works with both browser and Node.js canvas)
    let buffer: Buffer;
    if ("toBuffer" in canvas && typeof canvas.toBuffer === "function") {
      buffer = (canvas.toBuffer as (type: string) => Buffer)("image/png");
    } else if (canvas instanceof OffscreenCanvas) {
      const blob = await canvas.convertToBlob({ type: "image/png" });
      buffer = Buffer.from(await blob.arrayBuffer());
    } else {
      buffer = await new Promise<Buffer>((resolve) => {
        (canvas as HTMLCanvasElement).toBlob((blob: Blob | null) => {
          if (!blob) {
            throw new Error("Failed to convert canvas to blob");
          }
          blob.arrayBuffer().then((ab) => resolve(Buffer.from(ab)));
        }, "image/png");
      });
    }

    return new Response(buffer as BodyInit, {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="pictograph-${letter}.png"`,
        "Cache-Control": "public, max-age=3600", // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error("Error rendering pictograph:", error);
    console.error(error instanceof Error ? error.stack : "");
    return new Response(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
      { status: 500 }
    );
  }
};
