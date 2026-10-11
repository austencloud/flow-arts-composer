/**
 * StaticPictographWriter
 *
 * Writes pictograph images to the static directory during development.
 * These files become the production source of truth - no server needed.
 *
 * File path scheme:
 *   /static/pictographs/{gridMode}/{letter}/{variation}[-{propType}].png
 *
 * Examples:
 *   /static/pictographs/diamond/A/0.png
 *   /static/pictographs/box/Σ-/2.png
 *   /static/pictographs/diamond/α/0-hand.png (with hand prop type)
 */

import { dev } from "$app/env";

export interface PictographFileKey {
  letter: string;
  variation: number;
  gridMode: "diamond" | "box";
  propType?: string;
}

/**
 * Generate the static file path for a pictograph.
 * This path is deterministic and can be constructed client-side.
 */
export function getStaticPictographPath(key: PictographFileKey): string {
  const { letter, variation, gridMode, propType } = key;

  // URL-encode the letter for safety (handles Σ-, Φ-, etc.)
  const safeLetter = encodeURIComponent(letter);

  const filename = propType ? `${variation}-${propType}.png` : `${variation}.png`;

  return `/pictographs/${gridMode}/${safeLetter}/${filename}`;
}

/**
 * Check if a static pictograph file exists.
 * Uses GET + Content-Type verification because Vite dev returns 200
 * for HEAD requests on non-existent files.
 */
export async function staticPictographExists(key: PictographFileKey): Promise<boolean> {
  const path = getStaticPictographPath(key);

  try {
    const response = await fetch(path, { method: "GET" });
    if (!response.ok) return false;

    const contentType = response.headers.get("Content-Type");
    return contentType?.startsWith("image/") ?? false;
  } catch {
    return false;
  }
}

/**
 * Save a pictograph to the static directory.
 * Only works in development mode via a dev-only API endpoint.
 */
export async function saveStaticPictograph(
  key: PictographFileKey,
  base64: string
): Promise<boolean> {
  if (!dev) {
    console.warn("[StaticPictographWriter] Cannot save static files in production");
    return false;
  }

  try {
    const response = await fetch("/api/dev/save-pictograph", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...key,
        base64,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[StaticPictographWriter] Failed to save:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[StaticPictographWriter] Error saving pictograph:", error);
    return false;
  }
}

/**
 * Get the full URL for a static pictograph image.
 * Returns null if the file doesn't exist.
 */
export async function getStaticPictographUrl(
  key: PictographFileKey
): Promise<string | null> {
  const exists = await staticPictographExists(key);
  if (!exists) return null;

  return getStaticPictographPath(key);
}
