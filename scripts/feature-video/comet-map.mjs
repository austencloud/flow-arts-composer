import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";
import { toolPath } from "./media-import.mjs";

/**
 * The light map behind Post Studio's comet trails: where each LED bulb's
 * light went, read from every real camera frame of a take (not only the ones
 * a 30 fps copy keeps), so the trails are smooth tubes, not rows of dots.
 *
 * A blob counts as a bulb only if it has a blown-out core (value 0.97 or
 * more, opened with an 11 px ellipse so a thin white staff shaft drops out,
 * at least 40 px). Each bulb's glow near that core is kept as a small patch,
 * plus where it is stamped again on the way back toward where the same bulb
 * was one camera frame before (every 4 px, at most 8 times), so the path has
 * no ribs. The patches are what `comet-light-map.ts` replays in the editor.
 *
 * Sizes are in working pixels: the take scaled by 1080 / 1972, the scale the
 * maths was tuned at (a 1972 px wide crop of a 4K take, read at 1080).
 *
 * The file is gzip of: "COMETMAP", u32 version 1, u32 working width and
 * height, u32 source width and height, f32 the stamp memory in seconds, u32
 * frame count; then per frame f64 seconds on the take's clock and u16 blob
 * count; per blob i16 x, i16 y, u16 width, u16 height, u8 repeats, then per
 * repeat i16 dx, i16 dy, f32 seconds back, then width × height RGB bytes.
 * Little endian throughout.
 */

const execFileAsync = promisify(execFile);

export const COMET_WORKING_SCALE = 1080 / 1972;
const MINV = 0.55;
const MINS = 0.3;
const CORE = 0.97;
/** How long a stamp holds its place against a dimmer one, in seconds. */
export const COMET_REF_SECONDS = 0.3;
const SUB = 8;
const STEPPX = 4;
const MINCORE = 40;
const DMAX = 140;
const PAD = 10;
const OPEN_SIZE = 11;
const KEEP_SIZE = 25;
/** The glow is found from this far before the first time asked for. */
export const COMET_WARM_UP_SECONDS = 2.5;

/** cv2.getStructuringElement(MORPH_ELLIPSE, (size, size)) as row spans. */
export function ellipseKernel(size) {
  const r = Math.floor(size / 2);
  const c = Math.floor(size / 2);
  const invR2 = r ? 1 / (r * r) : 0;
  const rows = [];
  for (let i = 0; i < size; i++) {
    const dy = i - r;
    let j1 = 0;
    let j2 = 0;
    if (Math.abs(dy) <= r) {
      const dx = Math.round(c * Math.sqrt((r * r - dy * dy) * invR2));
      j1 = Math.max(c - dx, 0);
      j2 = Math.min(c + dx + 1, size);
    }
    rows.push([j1 - c, j2 - c]);
  }
  return { r, rows };
}

/** cv2.getGaussianKernel for a float image: size round(sigma * 8 + 1) | 1. */
export function gaussianKernel(sigma) {
  const size = Math.round(sigma * 8 + 1) | 1;
  const half = (size - 1) / 2;
  const kernel = new Float32Array(size);
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const x = i - half;
    kernel[i] = Math.exp((-x * x) / (2 * sigma * sigma));
    sum += kernel[i];
  }
  for (let i = 0; i < size; i++) kernel[i] /= sum;
  return kernel;
}

/** BORDER_REFLECT_101 index. */
function reflect(i, n) {
  if (n === 1) return 0;
  while (i < 0 || i >= n) i = i < 0 ? -i : 2 * n - 2 - i;
  return i;
}

/**
 * Separable Gaussian of `src` (w × h floats), reflect-101 at its edges.
 * Returns a new array.
 */
export function gaussianBlur(src, w, h, kernel) {
  const half = (kernel.length - 1) / 2;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = 0; k < kernel.length; k++)
        s += kernel[k] * src[row + reflect(x + k - half, w)];
      tmp[row + x] = s;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = 0; k < kernel.length; k++)
        s += kernel[k] * tmp[reflect(y + k - half, h) * w + x];
      out[y * w + x] = s;
    }
  }
  return out;
}

const OPEN = ellipseKernel(OPEN_SIZE);
const KEEP = ellipseKernel(KEEP_SIZE);
const LED_BLUR = gaussianKernel(1.2);
const KEEP_BLUR = gaussianKernel(2.0);

const clip01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** How strongly a pixel reads as LED light (ages_om's `led`). */
function ledAt(r, g, b) {
  const val = Math.max(r, g, b);
  const low = Math.min(r, g, b);
  const sat = (val - low) / Math.max(val, 1e-5);
  return (
    clip01((val - MINV) / 0.12) *
    Math.max(clip01((sat - MINS) / 0.15), clip01((val - 0.96) / 0.03))
  );
}

/**
 * The bulbs in one working-size RGB frame: each one's patch of glow, its
 * centre, whether it is warm (red more than blue) and its core's size.
 */
export function findBulbs(rgb, W, H) {
  const N = W * H;
  // Blown-out cores: the LED itself, not a pale shirt or a face lit by it.
  const core = new Uint8Array(N);
  const candidates = [];
  const coreByte = Math.ceil(CORE * 255 - 1e-9);
  for (let p = 0, i = 0; p < N; p++, i += 3) {
    const r = rgb[i];
    const g = rgb[i + 1];
    const b = rgb[i + 2];
    if (r < coreByte && g < coreByte && b < coreByte) continue;
    const R = r / 255;
    const G = g / 255;
    const B = b / 255;
    const val = Math.max(R, G, B);
    const low = Math.min(R, G, B);
    if (val < CORE || R + G + B - val - low < 0.85) continue;
    if (ledAt(R, G, B) <= 0.2) continue;
    core[p] = 1;
    candidates.push(p);
  }
  if (candidates.length === 0) return [];

  // Opening with an 11 px ellipse, so the thin white shaft between the bulbs
  // drops out. Outside the frame counts as set for the erosion, as in cv2.
  const at = (x, y) =>
    x < 0 || y < 0 || x >= W || y >= H ? 1 : core[y * W + x];
  const eroded = [];
  for (const p of candidates) {
    const x = p % W;
    const y = (p - x) / W;
    let keep = true;
    for (let k = 0; k < OPEN.rows.length && keep; k++) {
      const [a, b] = OPEN.rows[k];
      const yy = y + k - OPEN.r;
      for (let dx = a; dx < b; dx++)
        if (!at(x + dx, yy)) {
          keep = false;
          break;
        }
    }
    if (keep) eroded.push(p);
  }
  const opened = new Uint8Array(N);
  const openedList = [];
  for (const p of eroded) {
    const x = p % W;
    const y = (p - x) / W;
    for (let k = 0; k < OPEN.rows.length; k++) {
      const [a, b] = OPEN.rows[k];
      const yy = y + k - OPEN.r;
      if (yy < 0 || yy >= H) continue;
      for (let dx = a; dx < b; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= W) continue;
        const q = yy * W + xx;
        if (!opened[q]) {
          opened[q] = 1;
          openedList.push(q);
        }
      }
    }
  }

  // Connected blobs of the opened cores, 8-connected.
  const label = new Int32Array(N);
  const blobs = [];
  for (const start of openedList) {
    if (label[start]) continue;
    const id = blobs.length + 1;
    const stack = [start];
    label[start] = id;
    let area = 0;
    let sx = 0;
    let sy = 0;
    let x0 = W;
    let y0 = H;
    let x1 = -1;
    let y1 = -1;
    const pixels = [];
    while (stack.length) {
      const p = stack.pop();
      const x = p % W;
      const y = (p - x) / W;
      pixels.push(p);
      area++;
      sx += x;
      sy += y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const q = yy * W + xx;
          if (opened[q] && !label[q]) {
            label[q] = id;
            stack.push(q);
          }
        }
    }
    blobs.push({ id, area, cx: sx / area, cy: sy / area, x0, y0, x1, y1 });
  }

  const found = [];
  for (const blob of blobs) {
    if (blob.area < MINCORE) continue;
    const R = PAD + 14;
    const px0 = Math.max(0, blob.x0 - R);
    const py0 = Math.max(0, blob.y0 - R);
    const px1 = Math.min(W, blob.x1 + 1 + R);
    const py1 = Math.min(H, blob.y1 + 1 + R);
    const pw = px1 - px0;
    const ph = py1 - py0;
    // keep: the light within reach of this core only.
    const big = new Uint8Array(pw * ph);
    for (let y = 0; y < ph; y++)
      for (let x = 0; x < pw; x++)
        big[y * pw + x] = label[(py0 + y) * W + px0 + x] === blob.id ? 1 : 0;
    const dilated = new Float32Array(pw * ph);
    for (let y = 0; y < ph; y++)
      for (let x = 0; x < pw; x++) {
        if (!big[y * pw + x]) continue;
        for (let k = 0; k < KEEP.rows.length; k++) {
          const yy = y + k - KEEP.r;
          if (yy < 0 || yy >= ph) continue;
          const [a, b] = KEEP.rows[k];
          for (let dx = a; dx < b; dx++) {
            const xx = x + dx;
            if (xx >= 0 && xx < pw) dilated[yy * pw + xx] = 1;
          }
        }
      }
    const keep = gaussianBlur(dilated, pw, ph, KEEP_BLUR);

    // m: the LED map blurred by 1.2 px over the whole frame, read here
    // through a margin wide enough that the patch sees what the frame would.
    const margin = (LED_BLUR.length - 1) / 2;
    const wx0 = Math.max(0, px0 - margin);
    const wy0 = Math.max(0, py0 - margin);
    const wx1 = Math.min(W, px1 + margin);
    const wy1 = Math.min(H, py1 + margin);
    const ww = wx1 - wx0;
    const wh = wy1 - wy0;
    const led = new Float32Array(ww * wh);
    for (let y = 0; y < wh; y++)
      for (let x = 0; x < ww; x++) {
        const i = ((wy0 + y) * W + wx0 + x) * 3;
        led[y * ww + x] = ledAt(rgb[i] / 255, rgb[i + 1] / 255, rgb[i + 2] / 255);
      }
    const m = gaussianBlur(led, ww, wh, LED_BLUR);

    const patch = new Float32Array(pw * ph * 3);
    let rimN = 0;
    let rim = [0, 0, 0];
    let bigN = 0;
    let bigSum = [0, 0, 0];
    for (let y = 0; y < ph; y++)
      for (let x = 0; x < pw; x++) {
        const q = y * pw + x;
        const wq = (py0 + y - wy0) * ww + (px0 + x - wx0);
        const mm = m[wq] * keep[q];
        const i = ((py0 + y) * W + px0 + x) * 3;
        const r = rgb[i] / 255;
        const g = rgb[i + 1] / 255;
        const b = rgb[i + 2] / 255;
        patch[q * 3] = r * mm;
        patch[q * 3 + 1] = g * mm;
        patch[q * 3 + 2] = b * mm;
        if (big[q]) {
          bigN++;
          bigSum[0] += r;
          bigSum[1] += g;
          bigSum[2] += b;
        } else if (keep[q] > 0.5 && led[wq] > 0.2) {
          rimN++;
          rim[0] += r;
          rim[1] += g;
          rim[2] += b;
        }
      }
    const col = rimN > 10 ? rim : bigSum;
    found.push({
      x0: px0,
      y0: py0,
      w: pw,
      h: ph,
      patch,
      cx: blob.cx,
      cy: blob.cy,
      warm: col[0] > col[2],
      area: blob.area,
    });
  }
  return found;
}

/**
 * A blob's patch as RGB bytes, trimmed to the pixels a stamp can ever write
 * (brightest channel above 0.02), or null when none can.
 */
export function trimmedPatch(bulb) {
  const { w, h, patch } = bulb;
  let tx0 = w;
  let ty0 = h;
  let tx1 = -1;
  let ty1 = -1;
  const bytes = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const q = (y * w + x) * 3;
      const r = Math.round(patch[q] * 255);
      const g = Math.round(patch[q + 1] * 255);
      const b = Math.round(patch[q + 2] * 255);
      bytes[q] = r;
      bytes[q + 1] = g;
      bytes[q + 2] = b;
      if (Math.max(r, g, b) / 255 > 0.02) {
        if (x < tx0) tx0 = x;
        if (x > tx1) tx1 = x;
        if (y < ty0) ty0 = y;
        if (y > ty1) ty1 = y;
      }
    }
  if (tx1 < 0) return null;
  const tw = tx1 - tx0 + 1;
  const th = ty1 - ty0 + 1;
  const out = new Uint8Array(tw * th * 3);
  for (let y = 0; y < th; y++)
    out.set(
      bytes.subarray(((ty0 + y) * w + tx0) * 3, ((ty0 + y) * w + tx1 + 1) * 3),
      y * tw * 3
    );
  return { dx: tx0, dy: ty0, w: tw, h: th, rgb: out };
}

/**
 * One frame's stamps: each bulb's trimmed patch, and where it repeats on the
 * way back to where the same bulb was one camera frame before.
 */
export function stampsFor(bulbs, previous, dt, W, H) {
  const stamps = [];
  for (const bulb of bulbs) {
    const trimmed = trimmedPatch(bulb);
    let best = null;
    for (const p of previous) {
      const d = Math.hypot(p.cx - bulb.cx, p.cy - bulb.cy);
      const ratio = p.area / bulb.area;
      if (
        p.warm === bulb.warm &&
        d < DMAX &&
        ratio > 0.4 &&
        ratio < 2.5 &&
        (best === null || d < best.d)
      )
        best = { d, p };
    }
    if (!trimmed) continue;
    const repeats = [];
    if (best && best.d > 3) {
      const vx = best.p.cx - bulb.cx;
      const vy = best.p.cy - bulb.cy;
      const ns = Math.max(2, Math.min(SUB, Math.ceil(best.d / STEPPX)));
      for (let q = ns - 1; q >= 1; q--) {
        const dx = Math.round((vx * q) / ns);
        const dy = Math.round((vy * q) / ns);
        // The whole untrimmed patch has to fit, as in the reference.
        const yy = bulb.y0 + dy;
        const xx = bulb.x0 + dx;
        if (yy < 0 || xx < 0 || yy + bulb.h > H || xx + bulb.w > W) continue;
        repeats.push({ dx, dy, back: (dt * q) / ns });
      }
    }
    stamps.push({
      x: bulb.x0 + trimmed.dx,
      y: bulb.y0 + trimmed.dy,
      w: trimmed.w,
      h: trimmed.h,
      rgb: trimmed.rgb,
      repeats,
    });
  }
  return stamps;
}

/** The binary light map, before gzip. */
export function encodeCometMap({ width, height, sourceWidth, sourceHeight, frames }) {
  let size = 8 + 4 * 6 + 4;
  for (const frame of frames) {
    size += 8 + 2;
    for (const s of frame.stamps)
      size += 2 + 2 + 2 + 2 + 1 + s.repeats.length * 8 + s.w * s.h * 3;
  }
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let o = 0;
  for (const ch of "COMETMAP") bytes[o++] = ch.charCodeAt(0);
  view.setUint32(o, 1, true);
  view.setUint32(o + 4, width, true);
  view.setUint32(o + 8, height, true);
  view.setUint32(o + 12, sourceWidth, true);
  view.setUint32(o + 16, sourceHeight, true);
  view.setFloat32(o + 20, COMET_REF_SECONDS, true);
  view.setUint32(o + 24, frames.length, true);
  o += 28;
  for (const frame of frames) {
    view.setFloat64(o, frame.seconds, true);
    view.setUint16(o + 8, frame.stamps.length, true);
    o += 10;
    for (const s of frame.stamps) {
      view.setInt16(o, s.x, true);
      view.setInt16(o + 2, s.y, true);
      view.setUint16(o + 4, s.w, true);
      view.setUint16(o + 6, s.h, true);
      view.setUint8(o + 8, s.repeats.length);
      o += 9;
      for (const r of s.repeats) {
        view.setInt16(o, r.dx, true);
        view.setInt16(o + 2, r.dy, true);
        view.setFloat32(o + 4, r.back, true);
        o += 8;
      }
      bytes.set(s.rgb, o);
      o += s.rgb.length;
    }
  }
  return bytes;
}

/** Every frame's presentation time in [from, to], in order, from the packets. */
async function frameTimes(file, from, to) {
  const { stdout } = await execFileAsync(
    toolPath("ffprobe"),
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-read_intervals",
      `${Math.max(0, from - 2)}%${to + 2}`,
      "-show_entries",
      "packet=pts_time",
      "-of",
      "csv=p=0",
      file,
    ],
    { maxBuffer: 64 * 1024 * 1024 }
  );
  return stdout
    .split(/\r?\n/)
    .map(Number)
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
}

async function videoSize(file) {
  const { stdout } = await execFileAsync(toolPath("ffprobe"), [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height:stream_side_data=rotation",
    "-of",
    "json",
    file,
  ]);
  const stream = JSON.parse(stdout).streams?.[0];
  if (!stream?.width || !stream?.height)
    throw new Error(`ffprobe could not read ${file}'s picture size.`);
  return { width: stream.width, height: stream.height };
}

/**
 * Reads `file` from `fromSeconds` (less the warm-up) to `toSeconds`, every
 * real frame, and returns the gzipped light map plus a count of what it kept.
 */
export async function buildCometMap({
  file,
  fromSeconds,
  toSeconds,
  onProgress = () => {},
}) {
  const source = await videoSize(file);
  const even = (v) => Math.max(2, Math.round(v / 2) * 2);
  const W = even(source.width * COMET_WORKING_SCALE);
  const H = even(source.height * COMET_WORKING_SCALE);
  const start = Math.max(0, fromSeconds - COMET_WARM_UP_SECONDS);
  const all = await frameTimes(file, start, toSeconds);
  const first = all.findIndex((t) => t >= start - 1e-4);
  if (first < 0) throw new Error("No frames in that range.");
  const times = all.slice(first).filter((t) => t <= toSeconds + 0.05);
  const decoder = spawn(
    toolPath("ffmpeg"),
    [
      "-v",
      "error",
      "-ss",
      (times[0] - 0.004).toFixed(4),
      "-i",
      file,
      "-frames:v",
      String(times.length),
      "-vf",
      `scale=${W}:${H}:flags=area`,
      "-fps_mode",
      "passthrough",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ],
    { stdio: ["ignore", "pipe", "pipe"], windowsHide: true }
  );
  let stderr = "";
  decoder.stderr.on("data", (chunk) => (stderr += chunk));
  const frameBytes = W * H * 3;
  const frames = [];
  let previous = [];
  let last = null;
  let index = 0;
  const rgb = new Uint8Array(frameBytes);
  let filled = 0;
  for await (const chunk of decoder.stdout) {
    let offset = 0;
    while (offset < chunk.length && index < times.length) {
      const take = Math.min(frameBytes - filled, chunk.length - offset);
      rgb.set(chunk.subarray(offset, offset + take), filled);
      filled += take;
      offset += take;
      if (filled < frameBytes) break;
      filled = 0;
      const seconds = times[index];
      const dt = last === null ? 0 : seconds - last;
      const bulbs = findBulbs(rgb, W, H);
      frames.push({ seconds, stamps: stampsFor(bulbs, previous, dt, W, H) });
      previous = bulbs.map(({ cx, cy, warm, area }) => ({ cx, cy, warm, area }));
      last = seconds;
      index++;
      if (index % 60 === 0) onProgress(index, times.length);
    }
  }
  const code = await new Promise((resolve) => decoder.on("close", resolve));
  if (code !== 0 && index < times.length)
    throw new Error(`ffmpeg stopped reading ${file}: ${stderr.trim()}`);
  const raw = encodeCometMap({
    width: W,
    height: H,
    sourceWidth: source.width,
    sourceHeight: source.height,
    frames,
  });
  return {
    bytes: gzipSync(raw, { level: 9 }),
    frames: frames.length,
    stamps: frames.reduce((n, f) => n + f.stamps.length, 0),
    width: W,
    height: H,
    rawBytes: raw.length,
  };
}

/** Writes a light map into a feature video's media/comet folder. */
export async function writeCometMap(folder, name, bytes) {
  const relativePath = `comet/${name}.cometmap`;
  const target = path.join(folder, "media", relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes);
  return relativePath;
}
