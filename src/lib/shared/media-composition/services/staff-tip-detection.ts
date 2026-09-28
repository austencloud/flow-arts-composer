/**
 * Staff Tip Detection — per-frame blob finder
 *
 * Pure port of the Python reference `detect.py`: given a frame's raw RGB
 * pixels and a background plate, finds the bright/saturated LED blobs that
 * could be a staff end. No DOM access — the caller (the tracker worker)
 * decodes the video and hands this module plain typed arrays.
 *
 * The pipeline per frame:
 *  1. classify each pixel as "moving" (differs from the static background)
 *     and then as hot (clipped near-white LED core), red halo, or blue halo;
 *  2. `cand = hot | red | blue`, cleaned up with one round of binary closing
 *     (dilate then erode, 3x3, 8-connected) to bridge one-pixel gaps in a
 *     blob without growing it;
 *  3. label the cleaned mask into 8-connected components, drop anything
 *     under 10 px;
 *  4. for each surviving blob, vote red vs blue from the non-hot "halo"
 *     pixels and locate it with a brightness-weighted centroid that leans on
 *     the hot core when there is one.
 *
 * Every threshold below (35 / 240 / 170 / 190 / 70 / 190 / 90 / area 10) is
 * copied verbatim from `detect.py` — they were tuned against real footage,
 * not derived, so don't "clean them up".
 */

/** One LED blob found in a frame, in analysis-pixel coordinates. */
export interface DetectionBlob {
  x: number;
  y: number;
  area: number;
  /** Count of "hot" (clipped near-white core) pixels in the blob. */
  hot: number;
  colour: "red" | "blue";
  /** How much the losing colour's halo vote was, relative to the winner's; ~0 = pure, up to 1 = a tie. */
  mix: number;
  /** Halo saturation vote per halo pixel — how convincingly coloured the blob is. */
  strength: number;
  /** [x0, y0, x1, y1), x1/y1 exclusive, matching `scipy.ndimage.find_objects`. */
  bbox: [number, number, number, number];
}

/** Reusable per-frame buffers so detecting hundreds of frames doesn't churn the GC. */
export interface DetectionScratch {
  readonly width: number;
  readonly height: number;
  cand: Uint8Array;
  hot: Uint8Array;
  dilated: Uint8Array;
  closed: Uint8Array;
  labels: Int32Array;
}

export function createDetectionScratch(width: number, height: number): DetectionScratch {
  const size = width * height;
  return {
    width,
    height,
    cand: new Uint8Array(size),
    hot: new Uint8Array(size),
    dilated: new Uint8Array(size),
    closed: new Uint8Array(size),
    labels: new Int32Array(size),
  };
}

const MOVING_THRESHOLD = 35;
const HOT_V_MIN = 240;
const HOT_MIN_MIN = 170;
const RED_R_MIN = 190;
const RED_DOMINANCE_MIN = 70;
const BLUE_B_MIN = 190;
const BLUE_DOMINANCE_MIN = 90;
const MIN_BLOB_AREA = 10;

/**
 * Per-pixel-per-channel temporal median across a spread of sampled frames —
 * the static "empty room" plate that per-frame detection differences
 * against. Frames are packed RGB (3 bytes/pixel, no alpha), all the same
 * `width`x`height`. Matches `np.median(stack, axis=0)`: for an even sample
 * count, the two middle values are averaged.
 */
export function computeBackgroundMedian(
  frames: readonly Uint8Array[],
  width: number,
  height: number,
): Int16Array {
  const k = frames.length;
  if (k === 0) throw new Error("computeBackgroundMedian needs at least one frame");
  const channelCount = width * height * 3;
  const background = new Int16Array(channelCount);
  const scratch = new Uint8Array(k);
  const mid = k >> 1;
  const even = k % 2 === 0;
  for (let idx = 0; idx < channelCount; idx++) {
    for (let f = 0; f < k; f++) scratch[f] = frames[f]![idx]!;
    scratch.sort();
    background[idx] = even ? (scratch[mid - 1]! + scratch[mid]!) / 2 : scratch[mid]!;
  }
  return background;
}

/** `Math.max`/`Math.min` of three numbers without the array-allocating `Math.max(...arr)` form. */
function max3(a: number, b: number, c: number): number {
  return a > b ? (a > c ? a : c) : b > c ? b : c;
}
function min3(a: number, b: number, c: number): number {
  return a < b ? (a < c ? a : c) : b < c ? b : c;
}

/**
 * Dilate then erode a binary mask with a 3x3 8-connected structuring
 * element (`scipy.ndimage.binary_closing(cand, S8, iterations=1)`).
 * Out-of-bounds neighbours count as background for both steps, matching
 * scipy's default `border_value=0`.
 */
function closeMask(
  mask: Uint8Array,
  width: number,
  height: number,
  dilatedOut: Uint8Array,
  closedOut: Uint8Array,
): void {
  // Dilate: a pixel is set if itself or any in-bounds 8-neighbour is set.
  // Out-of-bounds neighbours simply aren't visited (equivalent to counting
  // as unset, i.e. border_value=0).
  for (let y = 0; y < height; y++) {
    const yStart = y > 0 ? y - 1 : y;
    const yEnd = y < height - 1 ? y + 1 : y;
    for (let x = 0; x < width; x++) {
      const xStart = x > 0 ? x - 1 : x;
      const xEnd = x < width - 1 ? x + 1 : x;
      let any = 0;
      for (let ny = yStart; ny <= yEnd && !any; ny++) {
        const row = ny * width;
        for (let nx = xStart; nx <= xEnd; nx++) {
          if (mask[row + nx]) {
            any = 1;
            break;
          }
        }
      }
      dilatedOut[y * width + x] = any;
    }
  }
  // Erode: a pixel is set only if itself and all 9 cells of its 3x3
  // neighbourhood are set. An out-of-bounds neighbour counts as unset, so
  // it always fails the frame border (border_value=0).
  for (let y = 0; y < height; y++) {
    const onEdgeY = y === 0 || y === height - 1;
    for (let x = 0; x < width; x++) {
      if (onEdgeY || x === 0 || x === width - 1) {
        closedOut[y * width + x] = 0;
        continue;
      }
      let all = 1;
      for (let ny = y - 1; ny <= y + 1 && all; ny++) {
        const row = ny * width;
        for (let nx = x - 1; nx <= x + 1; nx++) {
          if (!dilatedOut[row + nx]) {
            all = 0;
            break;
          }
        }
      }
      closedOut[y * width + x] = all;
    }
  }
}

/**
 * Two-pass connected-component labelling, 8-connectivity, via union-find.
 * Writes compact labels (1..count, 0 = background) into `mask` (reused —
 * on entry `mask` holds the 0/1 candidate map, on exit it holds label ids).
 */
function labelComponents(mask: Uint8Array, width: number, height: number, labelsOut: Int32Array): number {
  labelsOut.fill(0);
  const parent: number[] = [0]; // index 0 unused; labels start at 1
  const find = (a: number): number => {
    let root = a;
    while (parent[root] !== root) root = parent[root]!;
    let cur = a;
    while (parent[cur] !== root) {
      const next = parent[cur]!;
      parent[cur] = root;
      cur = next;
    }
    return root;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      if (ra < rb) parent[rb] = ra;
      else parent[ra] = rb;
    }
  };

  let nextLabel = 0;
  const adopt = (currentLabel: number, neighbourLabel: number): number => {
    if (currentLabel === 0) return neighbourLabel;
    union(currentLabel, neighbourLabel);
    return currentLabel;
  };
  for (let y = 0; y < height; y++) {
    const row = y * width;
    const prevRow = row - width;
    for (let x = 0; x < width; x++) {
      const idx = row + x;
      if (!mask[idx]) continue;
      let label = 0;
      // Already-visited 8-neighbours in raster order: NW, N, NE, W.
      if (y > 0) {
        if (x > 0 && mask[prevRow + x - 1]) label = adopt(label, labelsOut[prevRow + x - 1]!);
        if (mask[prevRow + x]) label = adopt(label, labelsOut[prevRow + x]!);
        if (x < width - 1 && mask[prevRow + x + 1]) label = adopt(label, labelsOut[prevRow + x + 1]!);
      }
      if (x > 0 && mask[row + x - 1]) label = adopt(label, labelsOut[row + x - 1]!);
      if (label === 0) {
        nextLabel++;
        label = nextLabel;
        parent[label] = label;
      }
      labelsOut[idx] = label;
    }
  }

  // Resolve every label to its root, then compact roots to a dense 1..count range.
  const compact = new Map<number, number>();
  let count = 0;
  for (let idx = 0; idx < width * height; idx++) {
    const l = labelsOut[idx];
    if (!l) continue;
    const root = find(l);
    let c = compact.get(root);
    if (c === undefined) {
      count++;
      c = count;
      compact.set(root, c);
    }
    labelsOut[idx] = c;
  }
  return count;
}

interface BlobAccumulator {
  area: number;
  hotCount: number;
  rs: number;
  bs: number;
  haloCount: number;
  sumX: number;
  sumY: number;
  sumW: number;
  sumXW: number;
  sumYW: number;
  sumWHot: number;
  sumXWHot: number;
  sumYWHot: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function newAccumulator(): BlobAccumulator {
  return {
    area: 0,
    hotCount: 0,
    rs: 0,
    bs: 0,
    haloCount: 0,
    sumX: 0,
    sumY: 0,
    sumW: 0,
    sumXW: 0,
    sumYW: 0,
    sumWHot: 0,
    sumXWHot: 0,
    sumYWHot: 0,
    x0: Infinity,
    y0: Infinity,
    x1: -Infinity,
    y1: -Infinity,
  };
}

/** Finds every candidate LED blob in one frame against a precomputed background. */
export function detectBlobsInFrame(
  frameRgb: Uint8Array | Uint8ClampedArray,
  background: Int16Array,
  width: number,
  height: number,
  scratch: DetectionScratch,
): DetectionBlob[] {
  if (scratch.width !== width || scratch.height !== height) {
    throw new Error("detectBlobsInFrame: scratch size does not match frame size");
  }
  const { cand, hot } = scratch;
  const size = width * height;
  for (let idx = 0; idx < size; idx++) {
    const p = idx * 3;
    const r = frameRgb[p]!;
    const g = frameRgb[p + 1]!;
    const b = frameRgb[p + 2]!;
    const v = max3(r, g, b);
    const mn = min3(r, g, b);
    const dR = Math.abs(r - background[p]!);
    const dG = Math.abs(g - background[p + 1]!);
    const dB = Math.abs(b - background[p + 2]!);
    const diff = max3(dR, dG, dB);
    const moving = diff > MOVING_THRESHOLD;
    const isHot = moving && v >= HOT_V_MIN && mn >= HOT_MIN_MIN;
    const isRed = moving && r >= RED_R_MIN && r - Math.max(g, b) >= RED_DOMINANCE_MIN;
    const isBlue = moving && b >= BLUE_B_MIN && b - r >= BLUE_DOMINANCE_MIN;
    hot[idx] = isHot ? 1 : 0;
    cand[idx] = isHot || isRed || isBlue ? 1 : 0;
  }

  closeMask(cand, width, height, scratch.dilated, scratch.closed);
  const count = labelComponents(scratch.closed, width, height, scratch.labels);
  if (count === 0) return [];

  const accumulators: BlobAccumulator[] = [];
  for (let i = 0; i < count; i++) accumulators.push(newAccumulator());
  const labels = scratch.labels;

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const idx = row + x;
      const label = labels[idx];
      if (!label) continue;
      const acc = accumulators[label - 1]!;
      const p = idx * 3;
      const r = frameRgb[p]!;
      const g = frameRgb[p + 1]!;
      const b = frameRgb[p + 2]!;
      const v = max3(r, g, b);
      const isHot = hot[idx] === 1;

      acc.area++;
      acc.sumX += x;
      acc.sumY += y;
      if (x < acc.x0) acc.x0 = x;
      if (x + 1 > acc.x1) acc.x1 = x + 1;
      if (y < acc.y0) acc.y0 = y;
      if (y + 1 > acc.y1) acc.y1 = y + 1;

      if (isHot) {
        acc.hotCount++;
      } else {
        acc.haloCount++;
        const rDom = r - Math.max(g, b);
        if (rDom > 0) acc.rs += rDom;
        const bDom = b - r;
        if (bDom > 0) acc.bs += bDom;
      }

      const wBase = Math.max(0, v - 150) ** 2;
      acc.sumW += wBase;
      acc.sumXW += x * wBase;
      acc.sumYW += y * wBase;
      if (isHot) {
        acc.sumWHot += wBase;
        acc.sumXWHot += x * wBase;
        acc.sumYWHot += y * wBase;
      }
    }
  }

  const blobs: DetectionBlob[] = [];
  for (const acc of accumulators) {
    if (acc.area < MIN_BLOB_AREA) continue;
    const colour: "red" | "blue" = acc.rs > acc.bs ? "red" : "blue";
    const mix = Math.min(acc.rs, acc.bs) / Math.max(acc.rs, acc.bs, 1);
    const strength = Math.max(acc.rs, acc.bs) / Math.max(1, acc.haloCount);

    let totalW = acc.sumW;
    let totalXW = acc.sumXW;
    let totalYW = acc.sumYW;
    if (acc.hotCount >= 3) {
      totalW += 3 * acc.sumWHot;
      totalXW += 3 * acc.sumXWHot;
      totalYW += 3 * acc.sumYWHot;
    }
    let cx: number;
    let cy: number;
    if (totalW === 0) {
      cx = acc.sumX / acc.area;
      cy = acc.sumY / acc.area;
    } else {
      cx = totalXW / totalW;
      cy = totalYW / totalW;
    }

    blobs.push({
      x: cx,
      y: cy,
      area: acc.area,
      hot: acc.hotCount,
      colour,
      mix,
      strength,
      bbox: [acc.x0, acc.y0, acc.x1, acc.y1],
    });
  }
  return blobs;
}
