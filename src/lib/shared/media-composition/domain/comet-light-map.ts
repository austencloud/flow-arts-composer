/**
 * Replays a take's light map (`scripts/feature-video/comet-map.mjs`) into
 * the comet trails' light at any moment of the footage.
 *
 * Each pixel remembers the colour of the last bulb light stamped there and
 * when. A brighter or fresher stamp replaces a fading one, so where two
 * tails cross the newer one wins, as it does on film. The light at a moment
 * is that colour dimmed by its age against the tail length: full at the
 * bulb, nothing at the tail's end, the dim rim going first so the tail
 * narrows to a point.
 *
 * Seeking lands on the same picture as playing there. A stamp older than
 * `COMET_REPLAY_SECONDS` can neither show (tails are shorter) nor hold its
 * place against a new one (its hold has faded below the stamp threshold), so
 * replaying only that last stretch gives the same pixels as replaying the
 * whole take, and playing forward just adds the new frames.
 */

import { COMET_MAX_LENGTH_SECONDS } from "./comet-trails";

/** The stretch before a moment that decides its light, in seconds. */
export const COMET_REPLAY_SECONDS = 3;
/** Stamps dimmer than this never land. */
const STAMP_FLOOR = 0.02;
/** A frame shows from this little before its time, for float clocks. */
const FRAME_SLACK = 1e-4;
const THIN = 0.5;
const SATURATION = 1.25;
const BLUR_SIGMA = 1.5;
const NEVER = -1e9;

export interface CometLightMap {
  /** Working size: the take scaled by 1080 / 1972. */
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  /** How long a stamp holds its place against a dimmer one, in seconds. */
  ref: number;
  /** Each frame's time on the take's clock, ascending. */
  times: Float64Array;
  /** Where each frame's stamps start in `bytes`. */
  offsets: Uint32Array;
  counts: Uint16Array;
  bytes: Uint8Array;
}

const MAGIC = "COMETMAP";

/** Reads an un-gzipped light map. Throws on anything else. */
export function parseCometLightMap(bytes: Uint8Array): CometLightMap {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < MAGIC.length; i++)
    if (bytes[i] !== MAGIC.charCodeAt(i))
      throw new Error("Not a comet light map.");
  let o = 8;
  const version = view.getUint32(o, true);
  if (version !== 1) throw new Error(`Light map version ${version} is newer than this app.`);
  const width = view.getUint32(o + 4, true);
  const height = view.getUint32(o + 8, true);
  const sourceWidth = view.getUint32(o + 12, true);
  const sourceHeight = view.getUint32(o + 16, true);
  const ref = view.getFloat32(o + 20, true);
  const frameCount = view.getUint32(o + 24, true);
  o += 28;
  const times = new Float64Array(frameCount);
  const offsets = new Uint32Array(frameCount);
  const counts = new Uint16Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    times[f] = view.getFloat64(o, true);
    const count = view.getUint16(o + 8, true);
    counts[f] = count;
    o += 10;
    offsets[f] = o;
    for (let s = 0; s < count; s++) {
      const w = view.getUint16(o + 4, true);
      const h = view.getUint16(o + 6, true);
      const repeats = view.getUint8(o + 8);
      o += 9 + repeats * 8 + w * h * 3;
    }
    if (o > bytes.length) throw new Error("The light map is cut short.");
  }
  return {
    width,
    height,
    sourceWidth,
    sourceHeight,
    ref,
    times,
    offsets,
    counts,
    bytes,
  };
}

/** Un-gzips and reads a light map file. */
export async function decodeCometLightMap(
  gzipped: ArrayBuffer | Uint8Array
): Promise<CometLightMap> {
  const input = gzipped instanceof Uint8Array ? gzipped : new Uint8Array(gzipped);
  const stream = new Blob([input as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const raw = new Uint8Array(await new Response(stream).arrayBuffer());
  return parseCometLightMap(raw);
}

interface LitBox {
  /** The oldest stamp time inside the box. */
  since: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The last frame at or before `seconds`, or -1. */
function frameAt(map: CometLightMap, seconds: number): number {
  const times = map.times;
  let lo = 0;
  let hi = times.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! <= seconds + FRAME_SLACK) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** The first frame after `seconds`. */
function firstAfter(map: CometLightMap, seconds: number): number {
  const times = map.times;
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! > seconds) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

function gaussianKernel(sigma: number): Float32Array {
  const size = Math.round(sigma * 8 + 1) | 1;
  const half = (size - 1) / 2;
  const kernel = new Float32Array(size);
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const x = i - half;
    kernel[i] = Math.exp((-x * x) / (2 * sigma * sigma));
    sum += kernel[i]!;
  }
  for (let i = 0; i < size; i++) kernel[i]! /= sum;
  return kernel;
}

const BLUR = gaussianKernel(BLUR_SIGMA);
const BLUR_HALF = (BLUR.length - 1) / 2;

function reflect(i: number, n: number): number {
  if (n === 1) return 0;
  while (i < 0 || i >= n) i = i < 0 ? -i : 2 * n - 2 - i;
  return i;
}

/** The light of one moment, ready to draw: RGBA over a box of the map. */
export interface CometLight {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Opaque, black where there is no light, so it screens to nothing. */
  rgba: Uint8ClampedArray<ArrayBuffer>;
}

export interface CometReplay {
  readonly map: CometLightMap;
  /** Brings the remembered light to `seconds` on the take's clock. */
  seek(seconds: number): void;
  /** The light now, for this tail length and brightness, or null if dark. */
  light(look: { length: number; gain: number; taper: number }): CometLight | null;
}

export function createCometReplay(map: CometLightMap): CometReplay {
  const { width: W, height: H, ref } = map;
  const color = new Uint8Array(W * H * 3);
  const stamped = new Float64Array(W * H).fill(NEVER);
  /** The next frame to stamp; frames before it are in the pixels. */
  let next = 0;
  /** The frame the pixels show, or -1 before the first. */
  let shown = -1;
  let boxes: LitBox[] = [];
  let dirty: { x0: number; y0: number; x1: number; y1: number } | null = null;
  const view = new DataView(
    map.bytes.buffer,
    map.bytes.byteOffset,
    map.bytes.byteLength
  );

  function clear(): void {
    if (dirty) {
      for (let y = dirty.y0; y < dirty.y1; y++) {
        stamped.fill(NEVER, y * W + dirty.x0, y * W + dirty.x1);
        color.fill(0, (y * W + dirty.x0) * 3, (y * W + dirty.x1) * 3);
      }
    }
    dirty = null;
    boxes = [];
  }

  function mark(x0: number, y0: number, x1: number, y1: number): void {
    if (!dirty) dirty = { x0, y0, x1, y1 };
    else {
      dirty.x0 = Math.min(dirty.x0, x0);
      dirty.y0 = Math.min(dirty.y0, y0);
      dirty.x1 = Math.max(dirty.x1, x1);
      dirty.y1 = Math.max(dirty.y1, y1);
    }
  }

  function stampPatch(
    patch: number,
    x: number,
    y: number,
    w: number,
    h: number,
    at: number,
    now: number
  ): void {
    const bytes = map.bytes;
    const ys = Math.max(0, -y);
    const ye = Math.min(h, H - y);
    const xs = Math.max(0, -x);
    const xe = Math.min(w, W - x);
    for (let py = ys; py < ye; py++) {
      let src = patch + (py * w + xs) * 3;
      let p = (y + py) * W + x + xs;
      for (let px = xs; px < xe; px++, src += 3, p++) {
        const r = bytes[src]!;
        const g = bytes[src + 1]!;
        const b = bytes[src + 2]!;
        const level = Math.max(r, g, b) / 255;
        if (level <= STAMP_FLOOR) continue;
        const c = p * 3;
        const held =
          (Math.max(color[c]!, color[c + 1]!, color[c + 2]!) / 255) *
          Math.exp(-(now - stamped[p]!) / ref);
        if (level <= held) continue;
        color[c] = r;
        color[c + 1] = g;
        color[c + 2] = b;
        stamped[p] = at;
      }
    }
  }

  function apply(frame: number): void {
    const now = map.times[frame]!;
    let o = map.offsets[frame]!;
    const count = map.counts[frame]!;
    for (let s = 0; s < count; s++) {
      const x = view.getInt16(o, true);
      const y = view.getInt16(o + 2, true);
      const w = view.getUint16(o + 4, true);
      const h = view.getUint16(o + 6, true);
      const repeats = view.getUint8(o + 8);
      o += 9;
      const patch = o + repeats * 8;
      const box: LitBox = { since: now, x0: x, y0: y, x1: x + w, y1: y + h };
      for (let r = 0; r < repeats; r++) {
        const dx = view.getInt16(o, true);
        const dy = view.getInt16(o + 2, true);
        const back = view.getFloat32(o + 4, true);
        o += 8;
        stampPatch(patch, x + dx, y + dy, w, h, now - back, now);
        box.since = Math.min(box.since, now - back);
        box.x0 = Math.min(box.x0, x + dx);
        box.y0 = Math.min(box.y0, y + dy);
        box.x1 = Math.max(box.x1, x + dx + w);
        box.y1 = Math.max(box.y1, y + dy + h);
      }
      stampPatch(patch, x, y, w, h, now, now);
      o = patch + w * h * 3;
      box.x0 = Math.max(0, box.x0);
      box.y0 = Math.max(0, box.y0);
      box.x1 = Math.min(W, box.x1);
      box.y1 = Math.min(H, box.y1);
      if (box.x1 > box.x0 && box.y1 > box.y0) {
        boxes.push(box);
        mark(box.x0, box.y0, box.x1, box.y1);
      }
    }
  }

  function seek(seconds: number): void {
    const target = frameAt(map, seconds);
    if (target === shown) return;
    if (target < 0) {
      clear();
      next = 0;
      shown = -1;
      return;
    }
    const until = map.times[target]!;
    const from = until - COMET_REPLAY_SECONDS;
    if (target < shown || shown < 0 || map.times[shown]! < from) {
      // A seek: start from the stretch that decides this moment.
      clear();
      next = firstAfter(map, from);
    }
    for (; next <= target; next++) apply(next);
    shown = target;
    boxes = boxes.filter((box) => box.since > from);
  }

  // Scratch for the light, grown as needed.
  let lit = new Float32Array(0);
  let blurred = new Float32Array(0);
  let curve = new Float32Array(0);
  let rowFrom = new Int32Array(0);
  let rowTo = new Int32Array(0);
  let curveTaper = NaN;
  const CURVE_STEPS = 1024;

  function light(look: {
    length: number;
    gain: number;
    taper: number;
  }): CometLight | null {
    if (shown < 0 || look.length <= 1e-3 || look.gain <= 0) return null;
    const length = Math.min(look.length, COMET_MAX_LENGTH_SECONDS);
    const now = map.times[shown]!;
    let x0 = W;
    let y0 = H;
    let x1 = 0;
    let y1 = 0;
    for (const box of boxes) {
      if (now - box.since >= length) continue;
      x0 = Math.min(x0, box.x0);
      y0 = Math.min(y0, box.y0);
      x1 = Math.max(x1, box.x1);
      y1 = Math.max(y1, box.y1);
    }
    if (x1 <= x0 || y1 <= y0) return null;
    // Room for the soft edge the blur spreads.
    x0 = Math.max(0, x0 - BLUR_HALF);
    y0 = Math.max(0, y0 - BLUR_HALF);
    x1 = Math.min(W, x1 + BLUR_HALF);
    y1 = Math.min(H, y1 + BLUR_HALF);
    const bw = x1 - x0;
    const bh = y1 - y0;
    const n = bw * bh * 3;
    if (lit.length < n) {
      lit = new Float32Array(n);
      blurred = new Float32Array(n);
    }
    if (curveTaper !== look.taper) {
      curve = new Float32Array(CURVE_STEPS + 1);
      for (let i = 0; i <= CURVE_STEPS; i++)
        curve[i] = Math.pow(1 - i / CURVE_STEPS, look.taper);
      curveTaper = look.taper;
    }

    // Each row's lit span, so the blur skips the dark most of the box.
    if (rowFrom.length < bh) {
      rowFrom = new Int32Array(bh);
      rowTo = new Int32Array(bh);
    }
    lit.fill(0, 0, n);
    for (let y = 0; y < bh; y++) {
      let from = bw;
      let to = -1;
      for (let x = 0; x < bw; x++) {
        const p = (y0 + y) * W + x0 + x;
        const age = now - stamped[p]!;
        if (age >= length) continue;
        const q = (y * bw + x) * 3;
        const u = age <= 0 ? 0 : age / length;
        const f = curve[Math.round(u * CURVE_STEPS)]!;
        const c = p * 3;
        const r = color[c]! / 255;
        const g = color[c + 1]! / 255;
        const b = color[c + 2]! / 255;
        const lum = Math.max(r, g, b);
        let w = (lum - THIN * u) / Math.max(lum, 1e-5);
        w = w < 0 ? 0 : w > 1 ? 1 : w;
        const grey = (r + g + b) / 3;
        const k = f * w * 255;
        const sr = grey + (r - grey) * SATURATION;
        const sg = grey + (g - grey) * SATURATION;
        const sb = grey + (b - grey) * SATURATION;
        lit[q] = (sr < 0 ? 0 : sr > 1 ? 1 : sr) * k;
        lit[q + 1] = (sg < 0 ? 0 : sg > 1 ? 1 : sg) * k;
        lit[q + 2] = (sb < 0 ? 0 : sb > 1 ? 1 : sb) * k;
        if (x < from) from = x;
        to = x;
      }
      rowFrom[y] = from;
      rowTo[y] = to;
    }

    // Soften by 1.5 working pixels, as the bake does. Past the box is dark;
    // past the picture's edge mirrors back in. A pixel further than the
    // kernel from every lit one stays dark, so only the spans are summed.
    const sample = (x: number, y: number, ch: number, from: Float32Array) => {
      const fx = reflect(x0 + x, W) - x0;
      const fy = reflect(y0 + y, H) - y0;
      if (fx < 0 || fy < 0 || fx >= bw || fy >= bh) return 0;
      return from[(fy * bw + fx) * 3 + ch]!;
    };
    blurred.fill(0, 0, n);
    for (let y = 0; y < bh; y++) {
      if (rowTo[y]! < 0) continue;
      const xs = Math.max(0, rowFrom[y]! - BLUR_HALF);
      const xe = Math.min(bw, rowTo[y]! + BLUR_HALF + 1);
      for (let x = xs; x < xe; x++) {
        const out = (y * bw + x) * 3;
        if (x >= BLUR_HALF && x < bw - BLUR_HALF) {
          let r = 0;
          let g = 0;
          let b = 0;
          for (let k = 0, i = out - BLUR_HALF * 3; k < BLUR.length; k++, i += 3) {
            const wk = BLUR[k]!;
            r += wk * lit[i]!;
            g += wk * lit[i + 1]!;
            b += wk * lit[i + 2]!;
          }
          blurred[out] = r;
          blurred[out + 1] = g;
          blurred[out + 2] = b;
          continue;
        }
        for (let ch = 0; ch < 3; ch++) {
          let s = 0;
          for (let k = 0; k < BLUR.length; k++)
            s += BLUR[k]! * sample(x + k - BLUR_HALF, y, ch, lit);
          blurred[out + ch] = s;
        }
      }
    }
    const rgba = new Uint8ClampedArray(bw * bh * 4);
    // Opaque black everywhere first: alpha is the high byte of each pixel.
    new Uint32Array(rgba.buffer).fill(0xff000000);
    for (let y = 0; y < bh; y++) {
      // The horizontal pass reached each lit row's span plus the kernel.
      let xs = bw;
      let xe = 0;
      for (let k = 0; k < BLUR.length; k++) {
        const yy = reflect(y0 + y + k - BLUR_HALF, H) - y0;
        if (yy < 0 || yy >= bh || rowTo[yy]! < 0) continue;
        xs = Math.min(xs, rowFrom[yy]! - BLUR_HALF);
        xe = Math.max(xe, rowTo[yy]! + BLUR_HALF + 1);
      }
      xs = Math.max(0, xs);
      xe = Math.min(bw, xe);
      const inside = y >= BLUR_HALF && y < bh - BLUR_HALF;
      const stride = bw * 3;
      for (let x = xs; x < xe; x++) {
        const o = (y * bw + x) * 4;
        if (inside) {
          let r = 0;
          let g = 0;
          let b = 0;
          for (
            let k = 0, i = ((y - BLUR_HALF) * bw + x) * 3;
            k < BLUR.length;
            k++, i += stride
          ) {
            const wk = BLUR[k]!;
            r += wk * blurred[i]!;
            g += wk * blurred[i + 1]!;
            b += wk * blurred[i + 2]!;
          }
          rgba[o] = r * look.gain;
          rgba[o + 1] = g * look.gain;
          rgba[o + 2] = b * look.gain;
          continue;
        }
        for (let ch = 0; ch < 3; ch++) {
          let s = 0;
          for (let k = 0; k < BLUR.length; k++)
            s += BLUR[k]! * sample(x, y + k - BLUR_HALF, ch, blurred);
          rgba[o + ch] = s * look.gain;
        }
      }
    }
    return { x: x0, y: y0, width: bw, height: bh, rgba };
  }

  return { map, seek, light };
}
