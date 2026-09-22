/**
 * Canonical Gelasio 700 outlines for the two hand-key labels at 64px.
 *
 * Generated from static/fonts/gelasio/gelasio-latin-700-normal.woff2
 * (SHA-256 dff91a5084db8f15e401e902acdac8768f5ae1746205c5319ad2cf3655517170)
 * with @napi-rs/canvas SvgExportFlag.ConvertTextToPaths. Coordinates are
 * relative to the text baseline at (0, 0), so every renderer paints the same
 * shapes instead of asking its host platform to hint the font differently.
 */

type GlyphCommand =
  | readonly ["move" | "line", number, number]
  | readonly ["quadratic", number, number, number, number]
  | readonly ["close"];

type HandKeyLabel = "L" | "R";

/** The font size used when the checked-in outlines were extracted. */
export const HAND_KEY_GLYPH_FONT_SIZE = 64;

const L: readonly GlyphCommand[] = [
  ["move", 4.53125, -0.375],
  ["quadratic", 4, -0.375, 3.734375, -1],
  ["quadratic", 3.46875, -1.625, 3.46875, -1.96875],
  ["quadratic", 3.46875, -3.03125, 4.5, -3.125],
  ["quadratic", 6, -3.28125, 7.515625, -3.84375],
  ["quadratic", 9.03125, -4.40625, 9.03125, -5.4375],
  ["line", 9.03125, -38.9375],
  ["quadratic", 9.03125, -40.28125, 8.3125, -40.890625],
  ["quadratic", 7.59375, -41.5, 6.5, -41.703125],
  ["quadratic", 5.40625, -41.90625, 4.28125, -41.96875],
  ["quadratic", 3.625, -42.03125, 3.390625, -42.234375],
  ["quadratic", 3.15625, -42.4375, 3.15625, -43.125],
  ["quadratic", 3.15625, -43.46875, 3.421875, -44.09375],
  ["quadratic", 3.6875, -44.71875, 4.21875, -44.71875],
  ["line", 25.625, -44.71875],
  ["quadratic", 26.15625, -44.71875, 26.421875, -44.09375],
  ["quadratic", 26.6875, -43.46875, 26.6875, -43.125],
  ["quadratic", 26.6875, -41.96875, 25.65625, -41.96875],
  ["quadratic", 23.875, -41.96875, 22.53125, -41.71875],
  ["quadratic", 21.1875, -41.46875, 20.421875, -40.828125],
  ["quadratic", 19.65625, -40.1875, 19.65625, -39.03125],
  ["line", 19.65625, -5.90625],
  ["quadratic", 19.65625, -4.375, 20.46875, -3.953125],
  ["quadratic", 21.28125, -3.53125, 22.4375, -3.53125],
  ["line", 31, -3.53125],
  ["quadratic", 32.46875, -3.53125, 33.921875, -5.234375],
  ["quadratic", 35.375, -6.9375, 36.609375, -9.40625],
  ["quadratic", 37.84375, -11.875, 38.59375, -14.125],
  ["quadratic", 38.78125, -14.6875, 39.671875, -14.921875],
  ["quadratic", 40.5625, -15.15625, 41.0625, -15.15625],
  ["quadratic", 41.65625, -15.15625, 42.28125, -14.890625],
  ["quadratic", 42.90625, -14.625, 42.84375, -14.09375],
  ["line", 41, -0.375],
  ["line", 4.53125, -0.375],
  ["close"],
];

const R: readonly GlyphCommand[] = [
  ["move", 4.5, -0.375],
  ["quadratic", 3.96875, -0.375, 3.703125, -1],
  ["quadratic", 3.4375, -1.625, 3.4375, -1.96875],
  ["quadratic", 3.4375, -3, 4.46875, -3.125],
  ["quadratic", 5.96875, -3.25, 7.34375, -3.671875],
  ["quadratic", 8.71875, -4.09375, 8.71875, -5.125],
  ["line", 8.75, -38.9375],
  ["quadratic", 8.75, -40.28125, 8.03125, -40.875],
  ["quadratic", 7.3125, -41.46875, 6.28125, -41.671875],
  ["quadratic", 5.25, -41.875, 4.28125, -41.96875],
  ["quadratic", 3.625, -42.03125, 3.390625, -42.234375],
  ["quadratic", 3.15625, -42.4375, 3.15625, -43.125],
  ["quadratic", 3.15625, -43.46875, 3.421875, -44.09375],
  ["quadratic", 3.6875, -44.71875, 4.21875, -44.71875],
  ["quadratic", 6.15625, -44.71875, 7.4375, -44.75],
  ["quadratic", 8.71875, -44.78125, 10.1875, -44.78125],
  ["quadratic", 12.21875, -44.78125, 14.59375, -44.84375],
  ["quadratic", 16.96875, -44.90625, 19.59375, -44.96875],
  ["quadratic", 22.21875, -45.03125, 25, -45.03125],
  ["quadratic", 30.59375, -45.03125, 34.57812, -43.796875],
  ["quadratic", 38.5625, -42.5625, 40.67188, -39.9375],
  ["quadratic", 42.78125, -37.3125, 42.78125, -33.1875],
  ["quadratic", 42.78125, -29, 41.125, -26.5625],
  ["quadratic", 39.46875, -24.125, 36.85938, -22.84375],
  ["quadratic", 34.25, -21.5625, 31.34375, -20.8125],
  ["quadratic", 34.4375, -20.5, 36.23438, -19.109375],
  ["quadratic", 38.03125, -17.71875, 39.10938, -15.65625],
  ["quadratic", 40.1875, -13.59375, 41.09375, -11.28125],
  ["quadratic", 42, -8.96875, 43.34375, -6.8125],
  ["quadratic", 44.40625, -4.78125, 45.48438, -4.03125],
  ["quadratic", 46.5625, -3.28125, 47.71875, -3.15625],
  ["quadratic", 48.84375, -3.03125, 48.84375, -1.8125],
  ["quadratic", 48.84375, -1.46875, 48.57812, -0.921875],
  ["quadratic", 48.3125, -0.375, 47.78125, -0.375],
  ["line", 37.125, -0.375],
  ["quadratic", 35.25, -0.375, 34.0625, -1.78125],
  ["quadratic", 32.875, -3.1875, 32.0625, -5.421875],
  ["quadratic", 31.25, -7.65625, 30.51562, -10.140625],
  ["quadratic", 29.78125, -12.625, 28.82812, -14.859375],
  ["quadratic", 27.875, -17.09375, 26.4375, -18.5],
  ["quadratic", 25, -19.90625, 22.75, -19.90625],
  ["line", 19.03125, -19.90625],
  ["line", 19.03125, -6.15625],
  ["quadratic", 19.03125, -4.8125, 19.890625, -4.203125],
  ["quadratic", 20.75, -3.59375, 21.98438, -3.40625],
  ["quadratic", 23.21875, -3.21875, 24.34375, -3.125],
  ["quadratic", 25, -3.0625, 25.23438, -2.875],
  ["quadratic", 25.46875, -2.6875, 25.46875, -1.96875],
  ["quadratic", 25.46875, -1.625, 25.20312, -1],
  ["quadratic", 24.9375, -0.375, 24.40625, -0.375],
  ["line", 4.5, -0.375],
  ["close"],
  ["move", 19.03125, -22.59375],
  ["line", 23.53125, -22.59375],
  ["quadratic", 26.125, -22.59375, 28.0625, -23.484375],
  ["quadratic", 30, -24.375, 31.07812, -26.46875],
  ["quadratic", 32.15625, -28.5625, 32.15625, -32.21875],
  ["quadratic", 32.15625, -35.40625, 31.23438, -37.59375],
  ["quadratic", 30.3125, -39.78125, 28.375, -40.890625],
  ["quadratic", 26.4375, -42, 23.4375, -42],
  ["line", 19.03125, -42],
  ["line", 19.03125, -22.59375],
  ["close"],
];

const glyphs: Record<HandKeyLabel, readonly GlyphCommand[]> = { L, R };

export interface HandKeyGlyphContext {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  closePath(): void;
  fill(): void;
}

export function drawHandKeyGlyph(
  context: HandKeyGlyphContext,
  label: HandKeyLabel,
  x: number,
  baselineY: number,
  scale: number
): void {
  context.beginPath();
  for (const command of glyphs[label]) {
    if (command[0] === "close") context.closePath();
    else if (command[0] === "move")
      context.moveTo(x + command[1] * scale, baselineY + command[2] * scale);
    else if (command[0] === "line")
      context.lineTo(x + command[1] * scale, baselineY + command[2] * scale);
    else if (command[0] === "quadratic") {
      context.quadraticCurveTo(
        x + command[1] * scale,
        baselineY + command[2] * scale,
        x + command[3] * scale,
        baselineY + command[4] * scale
      );
    }
  }
  context.fill();
}

export function getHandKeyGlyphPath(label: HandKeyLabel): string {
  return glyphs[label]
    .map((command) => {
      if (command[0] === "close") return "Z";
      if (command[0] === "quadratic") {
        const [, cpx, cpy, x, y] = command;
        return `Q${cpx} ${cpy} ${x} ${y}`;
      }
      const [operation, x, y] = command;
      return `${operation === "move" ? "M" : "L"}${x} ${y}`;
    })
    .join("");
}
