/**
 * Step duration badge — the "2×" mark drawn inside a pictograph cell when a
 * step holds for more or less than one count.
 *
 * Shared owner for the Composer image export and the MCP card renderer so the
 * two paint the same glyph at the same spot. Geometry is expressed in the
 * pictograph view box (950 units) and scaled to the cell.
 */

const VIEW_BOX_SIZE = 950;
const FONT_SIZE_UNITS = 52;
const TEXT_X_UNITS = 475;
const TEXT_Y_UNITS = 890;

// Gelasio is the one face both the Composer export and the MCP renderers
// bundle; a system sans fallback drew the "×" from different fonts per host.
export const DURATION_BADGE_FONT_FAMILY = "Gelasio, Georgia, serif";

/** A step whose duration differs from one count carries the badge. */
export function stepHasDurationBadge(duration: number | undefined): boolean {
  return duration !== undefined && Math.abs(duration - 1) > 0.001;
}

/** "2×", "1.5×", "0.25×" — trailing zeros trimmed. */
export function formatDurationBadge(duration: number): string {
  const formatted = Number.isInteger(duration)
    ? duration.toString()
    : duration.toFixed(2).replace(/\.?0+$/, "");
  return `${formatted}×`;
}

export function renderDurationBadge(
  ctx: CanvasRenderingContext2D,
  duration: number,
  x: number,
  y: number,
  cellSize: number,
  darkMode: boolean
): void {
  const scale = cellSize / VIEW_BOX_SIZE;
  ctx.save();
  ctx.font = `bold ${FONT_SIZE_UNITS * scale}px ${DURATION_BADGE_FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = darkMode ? "#ffffff" : "#231f20";
  ctx.fillText(
    formatDurationBadge(duration),
    x + TEXT_X_UNITS * scale,
    y + TEXT_Y_UNITS * scale
  );
  ctx.restore();
}
