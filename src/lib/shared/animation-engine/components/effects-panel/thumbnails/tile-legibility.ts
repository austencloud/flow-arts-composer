/**
 * How well a small effect picture reads at the size a phone shows it.
 *
 * The phone list shows a `tile` picture 52 wide (19.5 tall), so the checks
 * look at the picture the way that screen does: the 240x90 backing store
 * reduced to 104x39 (52 wide at two device pixels per CSS pixel). Pure
 * arithmetic on RGBA bytes, so the unit test (node-canvas) and the browser
 * measuring page get the same numbers from the same pixels.
 *
 * Brightness is the brightest colour channel, as the other small-format
 * checks use, so a saturated blue ribbon counts as the bright mark it looks
 * like. Two numbers per picture, both against its own ground (the picture's
 * corners, which every painter fills before it draws, and no subject reaches):
 * - `contrast`: how far the brightest 5% of the picture sit from the ground,
 *   in steps out of 255. Marks darker than a lit ground count the same as
 *   lighter marks on a dark one (Smoke's dark palettes).
 * - `coverage`: the share of the picture at least `VISIBLE_STEP` from the
 *   ground.
 */

/** The size the phone list shows a tile picture at, doubled for 2x screens. */
export const LEGIBILITY_SIZE = { w: 104, h: 39 } as const;

/** A mark this many steps (of 255) from the ground is clearly visible. */
export const VISIBLE_STEP = 60;

export interface Legibility {
  /** Ground brightness, 0-255. */
  ground: number;
  /** Distance from the ground of the brightest 5% of the picture, 0-255. */
  contrast: number;
  /** Share of the picture at least `VISIBLE_STEP` from the ground, 0-1. */
  coverage: number;
  /**
   * `contrast` as a share of the room the ground leaves (a light mark on a
   * dark ground can reach 255 - ground, a dark mark on a lit one can reach
   * ground), so a lit-ground picture is not held to a dark-ground number.
   */
  reach: number;
}

/**
 * The floor every small effect picture must clear at 52 wide. Taken from the
 * six pictures that read well on the phone list (Trails, Fire, Zap, Goo, Silk,
 * Ghost), whose weakest are Silk at reach 0.62 and 13.4% covered, with a
 * little room under both.
 */
export const LEGIBILITY_FLOOR = { reach: 0.6, coverage: 0.12 } as const;

/** Area-average a w x h RGBA picture down to tw x th (box filter). */
export function reduceRgba(
  data: ArrayLike<number>,
  w: number,
  h: number,
  tw: number = LEGIBILITY_SIZE.w,
  th: number = LEGIBILITY_SIZE.h
): Float32Array {
  const out = new Float32Array(tw * th * 3);
  const sx = w / tw;
  const sy = h / th;
  for (let ty = 0; ty < th; ty += 1) {
    const y0 = ty * sy;
    const y1 = y0 + sy;
    for (let tx = 0; tx < tw; tx += 1) {
      const x0 = tx * sx;
      const x1 = x0 + sx;
      let r = 0;
      let g = 0;
      let b = 0;
      let weight = 0;
      for (let y = Math.floor(y0); y < Math.ceil(y1); y += 1) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        for (let x = Math.floor(x0); x < Math.ceil(x1); x += 1) {
          const wx = Math.min(x + 1, x1) - Math.max(x, x0);
          const k = wx * wy;
          const i = (y * w + x) * 4;
          r += data[i]! * k;
          g += data[i + 1]! * k;
          b += data[i + 2]! * k;
          weight += k;
        }
      }
      const o = (ty * tw + tx) * 3;
      out[o] = r / weight;
      out[o + 1] = g / weight;
      out[o + 2] = b / weight;
    }
  }
  return out;
}

/** Brightness of every reduced pixel: its brightest colour channel. */
export function brightnessOf(rgb: Float32Array): Float32Array {
  const out = new Float32Array(rgb.length / 3);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Math.max(rgb[i * 3]!, rgb[i * 3 + 1]!, rgb[i * 3 + 2]!);
  }
  return out;
}

/** Ground brightness: the middle two of the four 3x3 corner blocks. */
function groundOf(v: Float32Array, w: number, h: number): number {
  const block = (bx: number, by: number): number => {
    let sum = 0;
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 3; x += 1) sum += v[(by + y) * w + bx + x]!;
    }
    return sum / 9;
  };
  const corners = [
    block(0, 0),
    block(w - 3, 0),
    block(0, h - 3),
    block(w - 3, h - 3),
  ].sort((a, b) => a - b);
  return (corners[1]! + corners[2]!) / 2;
}

/** Measure a painted RGBA picture the way the phone list shows it. */
export function measureLegibility(
  data: ArrayLike<number>,
  w: number,
  h: number
): Legibility {
  const { w: tw, h: th } = LEGIBILITY_SIZE;
  const v = brightnessOf(reduceRgba(data, w, h, tw, th));
  const ground = groundOf(v, tw, th);
  const away = Array.from(v, (b) => Math.abs(b - ground)).sort((a, b) => a - b);
  const contrast = away[Math.floor(away.length * 0.95)]!;
  const coverage = away.filter((d) => d >= VISIBLE_STEP).length / away.length;
  const reach = contrast / Math.max(ground, 255 - ground);
  return { ground, contrast, coverage, reach };
}
