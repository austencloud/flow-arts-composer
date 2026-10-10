/**
 * Gallery Write API Endpoint
 *
 * Writes rendered gallery images to static/gallery/
 *
 * Path structure:
 * - With propType: /gallery/{propType}/{word}.webp
 * - Legacy (no propType): /gallery/{word}/{word}_ver1.webp
 *
 * This is a dev tool endpoint - only works in development mode.
 */

import type { RequestHandler } from "./$types";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { dev } from "$app/env";
import { requireFirebaseUser } from "#lib/server/auth/requireFirebaseUser.js";

export const POST: RequestHandler = async (event) => {
  // Only allow in development mode for safety
  if (!dev) {
    return Response.json(
      { error: "This endpoint is only available in development mode" },
      { status: 403 }
    );
  }

  // Defense-in-depth: require auth even in dev (writes to filesystem)
  await requireFirebaseUser(event);

  try {
    const { request } = event;
    const formData = await request.formData();
    const file = formData.get("image") as File;
    const word = formData.get("word") as string;
    const propType = formData.get("propType") as string | null;
    const lightMode = formData.get("lightMode") as string | null;

    if (!file || !word) {
      return Response.json(
        { error: "Missing image or word parameter" },
        { status: 400 }
      );
    }

    // Sanitize inputs for filesystem
    const safeWord = word.replace(/[<>:"/\\|?*]/g, "_");
    const safePropType = propType?.replace(/[<>:"/\\|?*]/g, "_");

    let galleryDir: string;
    let filename: string;
    let relativePath: string;

    if (safePropType) {
      // New structure: /gallery/{propType}/{word}.webp or {word}_light.webp / {word}_dark.webp
      galleryDir = join(process.cwd(), "static", "gallery", safePropType);
      const modeSuffix =
        lightMode !== null ? (lightMode === "true" ? "_light" : "_dark") : "";
      filename = `${safeWord}${modeSuffix}.webp`;
      relativePath = `gallery/${safePropType}/${filename}`;
    } else {
      // Legacy structure: /gallery/{word}/{word}_ver1.webp
      galleryDir = join(process.cwd(), "static", "gallery", safeWord);
      filename = `${safeWord}_ver1.webp`;
      relativePath = `gallery/${safeWord}/${filename}`;
    }

    const filePath = join(galleryDir, filename);

    // Create directory if it doesn't exist
    if (!existsSync(galleryDir)) {
      await mkdir(galleryDir, { recursive: true });
    }

    // Convert file to buffer and write
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await writeFile(filePath, buffer);

    return Response.json({
      success: true,
      path: `static/${relativePath}`,
    });
  } catch (error) {
    console.error("Gallery write failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Write failed" },
      { status: 500 }
    );
  }
};

export const GET: RequestHandler = async () => {
  return Response.json({
    endpoint: "/api/gallery-write",
    method: "POST",
    description: "Writes choreo card images directly to static/gallery/",
    note: "Only available in development mode",
    usage: {
      body: "FormData with 'image' (File) and 'word' (string)",
    },
  });
};
