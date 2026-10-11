/**
 * Dev-only endpoint: write a review frame captured from a live WebGL canvas.
 *
 * Sibling of `../save-pictograph`, and deliberately the same shape: a `dev`
 * guard, a base64 body, one `writeFileSync`. Frames land under
 * `static/captures/` so they are both readable from disk by an agent and
 * servable to a browser. That folder is gitignored - these are throwaway review
 * frames, not assets, and must never enter a build.
 */

import type { RequestHandler } from "@sveltejs/kit";
import { dev } from "$app/env";
import fs from "fs";
import path from "path";

interface CaptureRequest {
  sceneId?: string;
  base64?: string;
}

export const POST: RequestHandler = async ({ request }) => {
  if (!dev) {
    return Response.json(
      { error: "This endpoint is only available in development mode" },
      { status: 403 }
    );
  }

  try {
    const { sceneId, base64 }: CaptureRequest = await request.json();
    if (!sceneId || !base64) {
      return Response.json(
        { error: "Missing required fields: sceneId, base64" },
        { status: 400 }
      );
    }

    // The scene id names a directory, so it never leaves the captures root.
    const safeScene = sceneId.replace(/[^a-z0-9-_]/gi, "-");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${stamp}.png`;

    const captureDir = path.join(process.cwd(), "static", "captures", safeScene);
    const filePath = path.join(captureDir, filename);
    fs.mkdirSync(captureDir, { recursive: true });

    const buffer = Buffer.from(base64, "base64");
    fs.writeFileSync(filePath, buffer);

    console.log(`[Dev] Saved view capture: ${filePath} (${buffer.length} bytes)`);

    return Response.json({
      success: true,
      path: `/captures/${safeScene}/${filename}`,
      absolutePath: filePath.replace(/\\/g, "/"),
      sizeBytes: buffer.length,
    });
  } catch (error) {
    console.error("[Dev] Error saving view capture:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
};
