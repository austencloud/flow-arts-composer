import { capturePosterFrame } from "#lib/shared/sequence-viewer/tunnel/tunnel-poster.js";

/**
 * Must stay 16:9. A square crop drops the left and right thirds of the frame,
 * where the outer performers of a group reveal stand.
 *
 * 320x180 keeps the WebP data URL to a few KB, so a saved film's Firestore doc
 * stays under the 1MB limit alongside its whole authored JSON.
 */
export const FILM_POSTER_WIDTH = 320;
export const FILM_POSTER_HEIGHT = 180;

/**
 * Capture a poster from the live canvas at whatever frame is showing, so the
 * user picks it by scrubbing the transport.
 *
 * Returns "" when the canvas is missing or has not painted. The save modal
 * previews the result, so an empty capture is visible before saving.
 */
export function captureFilmPoster(
  canvas: HTMLCanvasElement | null | undefined,
): string {
  if (!canvas) return "";
  return capturePosterFrame(canvas, {
    width: FILM_POSTER_WIDTH,
    height: FILM_POSTER_HEIGHT,
  });
}
