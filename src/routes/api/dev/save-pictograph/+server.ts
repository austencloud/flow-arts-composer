/**
 * Dev-only endpoint: Save pictograph to static directory
 *
 * This endpoint writes PNG files directly to /static/pictographs/
 * so they become part of the production build.
 *
 * Only available in development mode.
 */

import type { RequestHandler } from "@sveltejs/kit";
import { dev } from "$app/env";
import fs from "fs";
import path from "path";

interface SaveRequest {
  letter: string;
  variation: number;
  gridMode: "diamond" | "box";
  propType?: string;
  base64: string;
}

export const POST: RequestHandler = async (event) => {
  // Only allow in development
  if (!dev) {
    return Response.json(
      { error: "This endpoint is only available in development mode" },
      { status: 403 }
    );
  }

  try {
    const { request } = event;
    const body: SaveRequest = await request.json();
    const { letter, variation, gridMode, propType, base64 } = body;

    if (!letter || variation === undefined || !gridMode || !base64) {
      return Response.json(
        { error: "Missing required fields: letter, variation, gridMode, base64" },
        { status: 400 }
      );
    }

    // Build file path
    // Use encodeURIComponent for filesystem safety, but decode for readability where possible
    const safeLetter = letter.replace(/[<>:"/\\|?*]/g, "_"); // Filesystem-safe
    const filename = propType ? `${variation}-${propType}.png` : `${variation}.png`;

    const staticDir = path.join(process.cwd(), "static", "pictographs", gridMode, safeLetter);
    const filePath = path.join(staticDir, filename);

    // Create directory if it doesn't exist
    if (!fs.existsSync(staticDir)) {
      fs.mkdirSync(staticDir, { recursive: true });
    }

    // Decode base64 and write file
    const buffer = Buffer.from(base64, "base64");
    fs.writeFileSync(filePath, buffer);

    console.log(`[Dev] Saved pictograph: ${filePath} (${buffer.length} bytes)`);

    return Response.json({
      success: true,
      path: `/pictographs/${gridMode}/${encodeURIComponent(safeLetter)}/${filename}`,
      sizeBytes: buffer.length,
    });
  } catch (error) {
    console.error("[Dev] Error saving pictograph:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
};
