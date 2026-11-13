import {
  sampleEasing,
  type PostKeyframe,
  type PostSourceGeometry,
} from "@austencloud/video-editor/core";
import { solveHingeProgram, type HingeProgram } from "./hinge-program";

/**
 * Auto frame: the tightest framing of a spinning take that keeps the staff
 * ends on screen, written as ordinary framing keys, one per move.
 *
 * A key is a placed box (x, y, size) on the canvas with the footage fitted
 * in it, so a point of the footage lands at `x + u * size`. "On screen" is
 * then linear in the keys, and the eased path between two keys is a fixed
 * blend of them, so "keep every sample's props inside the eased window,
 * zoomed in as far as possible" is a linear program. Soft terms on top give
 * Austen's look: props centred sideways and a little above the middle, few
 * jumps between keys, a bright ceiling above a dark backdrop kept out, and
 * the whole body on the last key.
 *
 * Boxes are fractions of the footage, unmirrored: (left, top, right, bottom).
 */
export type FrameBox = readonly [number, number, number, number];

/** Every key leaves with this ease, as Austen's hand keys do. */
export const AUTO_FRAME_EASING: [number, number, number, number] = [0.42, 0, 0.58, 1];

/** Moves a clip is split into when its take has no beat landings. */
export const AUTO_FRAME_EVEN_MOVES = 16;

/** MediaPipe pose landmark indices used here. */
const NOSE = 0;
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_ELBOW = 13;
const LEFT_WRIST = 15;
const RIGHT_WRIST = 16;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;
/** Wrists, pinkies, index fingers and thumbs. */
const HAND_POINTS = [15, 16, 17, 18, 19, 20];
export const POSE_POINTS = 33;

/**
 * One sample's 33 pose landmarks as (x, y, visibility) triples, x and y as
 * fractions of the frame; null when no body was found.
 */
export type PoseLandmarks = Float32Array | null;

export interface AutoFrameSettings {
  /** Kept clear inside the window's edges, as a share of the window. */
  margin: number;
  minZoom: number;
  maxZoom: number;
  /** Cost of a staff end leaving the frame, per sample, scaled by samples/50. */
  slackCost: number;
  /** Weights for centring the props sideways and up/down. */
  centreX: number;
  centreY: number;
  /** Where the props' and body's centres sit down the uncovered part of the window. */
  centreYAt: number;
  /** Weights for centring the body sideways and placing it up/down. */
  bodyX: number;
  bodyY: number;
  /**
   * Where the body's centre sits down the window. His own crops keep it low,
   * feet near the bottom and the room above for the props.
   */
  bodyYAt: number;
  /** The most of the window's height the body fills, and the cost per sample past it. */
  bodyFill: number;
  bodyFillCost: number;
  /**
   * How far above the head (footage height) the props must reach before the
   * body's place and room give way to them, as his crops do when the props
   * go high; the body's terms fade out over this distance.
   */
  propsHighBy: number;
  /** How much of the props' up/down pull gives way to the body's while the props are low. */
  bodyLeads: number;
  /**
   * Cost per sample of the body (arms aside) reaching past the window's
   * sides or its uncovered top. The feet may go below the bottom, as his
   * own crops let them when the props are high.
   */
  bodyInCost: number;
  /**
   * Room kept above the head, below the uncovered top, as a share of the
   * window. Austen found 10% pressed to the top; about 17% looked right.
   */
  headRoom: number;
  headRoomCost: number;
  /**
   * Cost per sample of the window showing much more than that moment needs:
   * zoom below `fitSlack` of the zoom that just fits the moment's props.
   */
  fitCost: number;
  fitSlack: number;
  /** Cost of jumps between keys, scaled by samples/keys. */
  smooth: number;
  /** Cost per key of the window top rising above the backdrop line. */
  backdropCost: number;
  /** Margin around the whole body on the last key. */
  finalMargin: number;
}

/** The weights that matched Austen's own keys on two of his takes. */
export const AUTO_FRAME_SETTINGS: AutoFrameSettings = {
  margin: 0.03,
  minZoom: 1,
  maxZoom: 3.3,
  slackCost: 4,
  centreX: 4,
  centreY: 2,
  centreYAt: 0.45,
  bodyX: 2,
  bodyY: 1,
  bodyYAt: 0.6,
  bodyFill: 0.72,
  bodyFillCost: 8,
  bodyInCost: 2,
  headRoom: 0.1,
  headRoomCost: 8,
  propsHighBy: 0.06,
  bodyLeads: 0.75,
  fitCost: 1,
  fitSlack: 0.85,
  smooth: 0.05,
  backdropCost: 10,
  finalMargin: 0.12,
};

/** Linear-interpolated percentile, as numpy's default. */
export function percentile(values: ArrayLike<number>, p: number): number {
  const sorted = Float64Array.from(values).sort();
  if (sorted.length === 0) return NaN;
  const at = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(at);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo);
}

function median(values: readonly number[]): number {
  return percentile(values, 50);
}

/**
 * Key times in the take's own seconds: the beat landings inside the clip
 * when the take has enough of them, padded with the clip's ends when a
 * landing is not close to them; else the clip cut into even moves.
 */
export function autoFrameKeyTimes(
  sourceIn: number,
  sourceOut: number,
  landings: readonly number[] | null,
  moves = AUTO_FRAME_EVEN_MOVES
): { times: number[]; from: "landings" | "even" } {
  const inside = (landings ?? [])
    .filter((t) => t >= sourceIn - 0.5 && t <= sourceOut + 0.5)
    .sort((a, b) => a - b);
  if (inside.length >= moves * 0.75) {
    const times = [...inside];
    if (times[0]! - sourceIn > 0.4) times.unshift(sourceIn);
    if (sourceOut - times[times.length - 1]! > 0.4) times.push(sourceOut);
    return { times, from: "landings" };
  }
  const times: number[] = [];
  for (let k = 0; k <= moves; k++)
    times.push(sourceIn + ((sourceOut - sourceIn) * k) / moves);
  return { times, from: "even" };
}

function point(pose: Float32Array, index: number): [number, number] {
  return [pose[index * 3]!, pose[index * 3 + 1]!];
}

/**
 * The median forearm (left elbow to wrist) across a take, in frame widths;
 * `heightOverWidth` is the frame's shape. Props are looked for within a few
 * of these of the hands.
 */
export function forearmLength(
  poses: readonly PoseLandmarks[],
  heightOverWidth: number
): number {
  const lengths: number[] = [];
  for (const pose of poses) {
    if (!pose) continue;
    const [ex, ey] = point(pose, LEFT_ELBOW);
    const [wx, wy] = point(pose, LEFT_WRIST);
    lengths.push(Math.hypot(wx - ex, (wy - ey) * heightOverWidth));
  }
  return lengths.length ? median(lengths) : NaN;
}

/**
 * The props box for one sample: the moving pixels within `reach` frame
 * widths of either hand, plus the hands. `moving` holds pixel indices
 * (y * width + x) of a width×height motion mask. Null without a body.
 */
export function propsBox(
  moving: ArrayLike<number>,
  width: number,
  height: number,
  pose: PoseLandmarks,
  reach: number
): FrameBox | null {
  if (!pose || !Number.isFinite(pose[0]!)) return null;
  const aspect = height / width;
  const hands = HAND_POINTS.map((index) => point(pose, index));
  const us: number[] = [];
  const vs: number[] = [];
  for (let k = 0; k < moving.length; k++) {
    const pixel = moving[k]!;
    const u = (pixel % width) / width;
    const v = Math.floor(pixel / width) / height;
    for (const [hx, hy] of hands) {
      if (Math.hypot(u - hx, (v - hy) * aspect) < reach) {
        us.push(u);
        vs.push(v);
        break;
      }
    }
  }
  const near = us.length;
  for (const index of [LEFT_WRIST, RIGHT_WRIST]) {
    const [x, y] = point(pose, index);
    us.push(x);
    vs.push(y);
  }
  if (near >= 15)
    return [
      percentile(us, 1),
      percentile(vs, 1),
      percentile(us, 99),
      percentile(vs, 99),
    ];
  return [Math.min(...us), Math.min(...vs), Math.max(...us), Math.max(...vs)];
}

/**
 * What must stay on screen: the props box plus the top of the head, the
 * nose moved up by 0.7 of the nose-to-shoulders distance.
 */
export function mustStayBox(props: FrameBox | null, pose: PoseLandmarks): FrameBox | null {
  if (!props) return null;
  if (!pose || !Number.isFinite(pose[0]!)) return props;
  const [nx, ny] = point(pose, NOSE);
  const shoulders = (pose[LEFT_SHOULDER * 3 + 1]! + pose[RIGHT_SHOULDER * 3 + 1]!) / 2;
  const top = ny - 0.7 * Math.max(0, shoulders - ny);
  return [
    Math.min(props[0], nx),
    Math.min(props[1], top),
    Math.max(props[2], nx),
    Math.max(props[3], ny),
  ];
}

/**
 * The body to centre and keep in: head top to feet, shoulders and hips
 * across. Arms are left out, since a reach to one side shouldn't pull the
 * frame after it. The head top is added only while the head is above the
 * shoulders; bent over or upside down, the landmarks' own extent is used.
 */
export function bodyBox(pose: PoseLandmarks): FrameBox | null {
  if (!pose || !Number.isFinite(pose[0]!)) return null;
  const seen = (i: number) => pose[i * 3 + 2]! > 0.5;
  const across = [LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP].filter(seen);
  if (across.length < 2) return null;
  const xs = across.map((i) => pose[i * 3]!);
  const ys: number[] = [];
  for (let i = 0; i < POSE_POINTS; i++)
    if ((i <= RIGHT_SHOULDER || i >= LEFT_HIP) && seen(i)) ys.push(pose[i * 3 + 1]!);
  const [, ny] = point(pose, NOSE);
  const shoulders = (pose[LEFT_SHOULDER * 3 + 1]! + pose[RIGHT_SHOULDER * 3 + 1]!) / 2;
  if (seen(NOSE) && shoulders > ny) ys.push(ny - 0.9 * (shoulders - ny));
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/**
 * The whole body for the last key: every visible landmark, the head top
 * (nose up by 0.9 of nose-to-shoulders) with 0.04 more above it, and the
 * props at that moment.
 */
export function wholeBodyBox(pose: PoseLandmarks, props: FrameBox | null): FrameBox | null {
  if (!pose || !Number.isFinite(pose[0]!)) return props;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < POSE_POINTS; i++) {
    if (!(pose[i * 3 + 2]! > 0.3)) continue;
    x0 = Math.min(x0, pose[i * 3]!);
    x1 = Math.max(x1, pose[i * 3]!);
    y0 = Math.min(y0, pose[i * 3 + 1]!);
    y1 = Math.max(y1, pose[i * 3 + 1]!);
  }
  if (!Number.isFinite(x0)) return props;
  const [, ny] = point(pose, NOSE);
  const shoulders = (pose[LEFT_SHOULDER * 3 + 1]! + pose[RIGHT_SHOULDER * 3 + 1]!) / 2;
  const headTop = ny - 0.9 * Math.max(0, shoulders - ny);
  let box: [number, number, number, number] = [x0, Math.min(headTop, y0) - 0.04, x1, y1 + 0.01];
  if (props)
    box = [
      Math.min(box[0], props[0]),
      Math.min(box[1], props[1]),
      Math.max(box[2], props[2]),
      Math.max(box[3], props[3]),
    ];
  return box;
}

/** How far below the found edge the backdrop line sits, as a fraction of the frame. */
const BACKDROP_MARGIN = 0.015;

/**
 * Where a dark backdrop starts under a bright ceiling, as a fraction down
 * the frame: the first row after which the rows stay dark. `rowLevels` is
 * each row's median brightness (0 to 255) of the empty background, top
 * first. Null when the take has no such backdrop.
 *
 * The line returned sits a little below that row: the median edge hides a
 * hem that sags a few rows at the sides, and a window top right on the
 * edge still shows a sliver of ceiling.
 */
export function findBackdropLine(rowLevels: readonly number[]): number | null {
  const rows = rowLevels.length;
  if (rows < 8) return null;
  const run = Math.max(2, Math.round(rows * 0.25));
  const dark = 40;
  for (let r = 1; r < Math.round(rows * 0.6); r++) {
    const below = rowLevels.slice(r, r + run);
    if (below.length < run) break;
    // The row itself is dark, and the run under it stays dark but for a few bright specks.
    if (rowLevels[r]! >= dark || percentile(below, 90) >= dark) continue;
    const above = rowLevels.slice(0, r);
    const aboveLevel = above.reduce((sum, value) => sum + value, 0) / above.length;
    const belowLevel = below.reduce((sum, value) => sum + value, 0) / below.length;
    if (aboveLevel < 70 || aboveLevel < 3 * Math.max(belowLevel, 1)) return null;
    return Math.min(1, r / rows + BACKDROP_MARGIN);
  }
  return null;
}

export interface AutoFrameInput {
  /** Sample times, take seconds. */
  times: readonly number[];
  /** Per sample: what must stay on screen (props and head top). */
  mustStay: readonly (FrameBox | null)[];
  /** Per sample: what to centre on (the props alone). */
  centreOn: readonly (FrameBox | null)[];
  /** Key times, take seconds, earliest first, at least two. */
  keyTimes: readonly number[];
  /** Canvas width/height over footage width/height; 1 when both are 9:16. */
  shape: number;
  /** Keep the window top below this row of the footage, softly. */
  backdropLine: number | null;
  /** The whole body, kept inside the last key. */
  finalBox: FrameBox | null;
  /** Per sample: the body alone, head to feet, to centre as well; null when none was found. */
  bodyOn?: readonly (FrameBox | null)[];
  /**
   * Canvas shares the platform's own controls cover once the post is up
   * (a Reel's header and caption). A bright ceiling may hide under the top
   * one, and centring aims at the part between them.
   */
  covered?: { top: number; bottom: number };
  /** The clip shows the footage mirrored. */
  flip: boolean;
  settings?: Partial<AutoFrameSettings>;
}

export interface AutoFrameResult {
  keys: PostKeyframe<PostSourceGeometry>[];
  /** Share of samples the solve could not keep fully inside the margin. */
  squeezed: number;
}

/** The ease weight of the later key at time t, and which segment t is in. */
function segmentOf(keyTimes: readonly number[], t: number): { at: number; w: number } {
  let at = 0;
  while (at < keyTimes.length - 2 && t >= keyTimes[at + 1]!) at++;
  const span = keyTimes[at + 1]! - keyTimes[at]!;
  const p = span > 0 ? Math.min(1, Math.max(0, (t - keyTimes[at]!) / span)) : 0;
  return { at, w: sampleEasing(AUTO_FRAME_EASING, p) };
}

const FULL_CROP = { left: 0, top: 0, right: 1, bottom: 1 };

/** Solves the framing and returns the keys, mirrored for a flipped clip. */
export function solveAutoFrame(input: AutoFrameInput): AutoFrameResult {
  const set = { ...AUTO_FRAME_SETTINGS, ...input.settings };
  const K = input.keyTimes;
  const nk = K.length;
  if (nk < 2) throw new Error("Auto frame needs at least two key times.");
  const r = input.shape;
  const X = (k: number) => 3 * k;
  const Y = (k: number) => 3 * k + 1;
  const Z = (k: number) => 3 * k + 2;
  const n = 3 * nk;
  const cost = new Array<number>(n).fill(0);
  const hinges: HingeProgram["hinges"][number][] = [];
  const limits: HingeProgram["limits"][number][] = [];

  const rows: { t: number; box: FrameBox; centre: FrameBox; body: FrameBox | null }[] = [];
  input.times.forEach((t, i) => {
    const box = input.mustStay[i];
    if (!box || t < K[0]! || t > K[nk - 1]!) return;
    rows.push({ t, box, centre: input.centreOn[i] ?? box, body: input.bodyOn?.[i] ?? null });
  });
  const coverTop = input.covered?.top ?? 0;
  const coverBottom = input.covered?.bottom ?? 0;
  const centreAt = coverTop + (1 - coverTop - coverBottom) * set.centreYAt;
  const nS = rows.length;
  const m = set.margin;
  const slackWeight = (set.slackCost * nS) / 50;

  // A point (u across, v down) of the footage on the eased path, as a form in the keys.
  const pathForm = (a: number, w: number, axis: "x" | "y", u: number) => {
    const wa = 1 - w;
    const wb = w;
    const scale = axis === "x" ? u : r * u;
    const pos = axis === "x" ? X : Y;
    return {
      idx: [pos(a), Z(a), pos(a + 1), Z(a + 1)],
      val: [wa, wa * scale, wb, wb * scale],
    };
  };
  const push = (hinge: { idx: number[]; val: number[]; b: number }, weight: number) => {
    if (weight > 0) hinges.push({ ...hinge, weight });
  };
  const negate = (form: { idx: number[]; val: number[] }) => ({
    idx: form.idx,
    val: form.val.map((v) => -v),
  });

  for (const row of rows) {
    const { at, w } = segmentOf(K, row.t);
    cost[Z(at)]! -= 1 - w;
    cost[Z(at + 1)]! -= w;
    const [u0, v0, u1, v1] = row.box;
    hinges.push({ ...negate(pathForm(at, w, "x", u0)), b: -m, weight: slackWeight });
    hinges.push({ ...pathForm(at, w, "x", u1), b: 1 - m, weight: slackWeight });
    hinges.push({ ...negate(pathForm(at, w, "y", v0)), b: -m, weight: slackWeight });
    // The prop ends stay above a Reel's caption, where they would be lost.
    hinges.push({ ...pathForm(at, w, "y", v1), b: 1 - coverBottom - m, weight: slackWeight });
    const c = row.centre;
    const cx = pathForm(at, w, "x", (c[0] + c[2]) / 2);
    const cy = pathForm(at, w, "y", (c[1] + c[3]) / 2);
    // |form - target| as two hinges.
    hinges.push({ ...cx, b: 0.5, weight: set.centreX });
    hinges.push({ ...negate(cx), b: -0.5, weight: set.centreX });
    // Props well above the head lead; props about the body give it its place and room.
    const low = row.body ? Math.min(1, Math.max(0, 1 - (row.body[1] - v0) / set.propsHighBy)) : 0;
    push({ ...cy, b: centreAt }, set.centreY * (1 - set.bodyLeads * low));
    push({ ...negate(cy), b: -centreAt }, set.centreY * (1 - set.bodyLeads * low));
    if (row.body) {
      const [b0, bt, b1, bb] = row.body;
      const bx = pathForm(at, w, "x", (b0 + b1) / 2);
      const by = pathForm(at, w, "y", (bt + bb) / 2);
      push({ ...bx, b: 0.5 }, set.bodyX);
      push({ ...negate(bx), b: -0.5 }, set.bodyX);
      push({ ...by, b: set.bodyYAt }, set.bodyY * low);
      push({ ...negate(by), b: -set.bodyYAt }, set.bodyY * low);
      // Room around the body: r * height * size <= bodyFill.
      const tall = r * (bb - bt);
      push({ idx: [Z(at), Z(at + 1)], val: [(1 - w) * tall, w * tall], b: set.bodyFill }, set.bodyFillCost * low);
      // Inside the window, with room above the head below the covered top.
      push({ ...negate(pathForm(at, w, "x", b0)), b: -m }, set.bodyInCost);
      push({ ...pathForm(at, w, "x", b1), b: 1 - m }, set.bodyInCost);
      push({ ...negate(pathForm(at, w, "y", bt)), b: -(coverTop + set.headRoom) }, set.headRoomCost);
    }
    // Not much looser than the moment needs: zoom >= fitSlack * the zoom that just fits it.
    // The need counts the room above the head down to the props' lower ends.
    const headToEnds = row.body ? v1 - row.body[1] : 0;
    const fits = Math.min(
      set.maxZoom,
      (1 - 2 * m) / Math.max(1e-6, u1 - u0),
      (1 - coverBottom - 2 * m) / Math.max(1e-6, r * (v1 - v0)),
      (1 - coverTop - set.headRoom - coverBottom - m) / Math.max(1e-6, r * headToEnds)
    );
    if (set.fitCost > 0)
      hinges.push({
        idx: [Z(at), Z(at + 1)],
        val: [-(1 - w), -w],
        b: -set.fitSlack * fits,
        weight: set.fitCost,
      });
  }

  const jumpWeight = (set.smooth * nS) / nk;
  for (let k = 0; k + 1 < nk; k++) {
    for (const v of [X, Y, Z]) {
      hinges.push({ idx: [v(k + 1), v(k)], val: [1, -1], b: 0, weight: jumpWeight });
      hinges.push({ idx: [v(k + 1), v(k)], val: [-1, 1], b: 0, weight: jumpWeight });
    }
  }

  const minZoom = Math.max(set.minZoom, 1 / r);
  for (let k = 0; k < nk; k++) {
    // The window stays on the picture: x <= 0, x + size >= 1, same for y.
    limits.push({ idx: [X(k)], val: [1], b: 0 });
    limits.push({ idx: [X(k), Z(k)], val: [-1, -1], b: -1 });
    limits.push({ idx: [Y(k)], val: [1], b: 0 });
    limits.push({ idx: [Y(k), Z(k)], val: [-1, -r], b: -1 });
    limits.push({ idx: [X(k)], val: [-1], b: set.maxZoom });
    limits.push({ idx: [Y(k)], val: [-1], b: set.maxZoom * r });
    limits.push({ idx: [Z(k)], val: [-1], b: -minZoom });
    limits.push({ idx: [Z(k)], val: [1], b: set.maxZoom });
    if (input.backdropLine !== null) {
      // The uncovered top below the line: y + line * r * size <= the covered share.
      hinges.push({
        idx: [Y(k), Z(k)],
        val: [1, input.backdropLine * r],
        b: coverTop,
        weight: (set.backdropCost * nS) / nk,
      });
    }
  }

  if (input.finalBox) {
    // Hard in spirit: far dearer than anything else, but never infeasible.
    const k = nk - 1;
    const fm = set.finalMargin;
    const heavy = 100 * Math.max(slackWeight, 1);
    const [u0, v0, u1, v1] = input.finalBox;
    hinges.push({ idx: [X(k), Z(k)], val: [-1, -u0], b: -fm, weight: heavy });
    hinges.push({ idx: [X(k), Z(k)], val: [1, u1], b: 1 - fm, weight: heavy });
    hinges.push({ idx: [Y(k), Z(k)], val: [-1, -r * v0], b: -fm, weight: heavy });
    hinges.push({ idx: [Y(k), Z(k)], val: [1, r * v1], b: 1 - fm, weight: heavy });
  }

  const startZoom = Math.min(set.maxZoom * 0.99, Math.max(minZoom * 1.25, (minZoom + set.maxZoom) / 2));
  const start: number[] = [];
  for (let k = 0; k < nk; k++) start.push((1 - startZoom) / 2, (1 - r * startZoom) / 2, startZoom);

  const { z } = solveHingeProgram({ n, cost, hinges, limits, start }, { gap: 1e-5 });

  let squeezed = 0;
  for (const row of rows) {
    const { at, w } = segmentOf(K, row.t);
    const lerp = (v: (k: number) => number) => z[v(at)]! * (1 - w) + z[v(at + 1)]! * w;
    const x = lerp(X);
    const y = lerp(Y);
    const s = lerp(Z);
    const [u0, v0, u1, v1] = row.box;
    const over = Math.max(m - (x + u0 * s), x + u1 * s - (1 - m), m - (y + r * v0 * s), y + r * v1 * s - (1 - m));
    if (over > 1e-4) squeezed++;
  }

  const keys = K.map((t, k) => {
    const width = z[Z(k)]!;
    const x = z[X(k)]!;
    const value: PostSourceGeometry = {
      // A mirrored clip reflects the footage about its box's centre, so the
      // same footage stays in view when the box is reflected across the frame.
      x: input.flip ? 1 - x - width : x,
      y: z[Y(k)]!,
      width,
      height: r * width,
      rotation: 0,
      crop: { ...FULL_CROP },
    };
    return { t, value, easing: [...AUTO_FRAME_EASING] as [number, number, number, number] };
  });
  return { keys, squeezed: nS ? squeezed / nS : 0 };
}

/**
 * The part of the footage a framing shows, as (left, top, right, bottom)
 * fractions of the unmirrored footage. `canvas` and `footage` are each
 * width over height. Handles a box of any shape, the footage contained in it.
 */
export function shownPart(
  geometry: PostSourceGeometry,
  canvas: number,
  footage: number,
  flip = false
): FrameBox {
  const g = flip ? { ...geometry, x: 1 - geometry.x - geometry.width } : geometry;
  // Work in canvas-height units so both axes share a scale.
  const bw = g.width * canvas;
  const bh = g.height;
  const dw = Math.min(bw, bh * footage);
  const dh = dw / footage;
  const left = g.x * canvas + (bw - dw) / 2;
  const top = g.y + (bh - dh) / 2;
  return [(0 - left) / dw, (0 - top) / dh, (canvas - left) / dw, (1 - top) / dh];
}

/**
 * Share of samples whose props poke out of the shown part by more than
 * 0.01 of the footage, given the framing at each sample's time.
 */
export function propsCutShare(
  times: readonly number[],
  props: readonly (FrameBox | null)[],
  shownAt: (t: number) => FrameBox
): number {
  let seen = 0;
  let cut = 0;
  times.forEach((t, i) => {
    const p = props[i];
    if (!p) return;
    const w = shownAt(t);
    seen++;
    if (Math.max(w[0] - p[0], p[2] - w[2], w[1] - p[1], p[3] - w[3]) > 0.01) cut++;
  });
  return seen ? cut / seen : 0;
}

/**
 * What the solve keeps in and centres on, per sample, from the tracking:
 * the props plus the head top must stay, the props alone are centred, and
 * the whole body at the sample nearest the last key is kept in that key.
 */
export function autoFrameBoxes(
  times: readonly number[],
  props: readonly (FrameBox | null)[],
  poses: readonly PoseLandmarks[],
  lastKey: number
): {
  mustStay: (FrameBox | null)[];
  centreOn: (FrameBox | null)[];
  bodyOn: (FrameBox | null)[];
  finalBox: FrameBox | null;
} {
  const mustStay = props.map((box, i) => mustStayBox(box, poses[i] ?? null));
  const bodyOn = poses.map((pose) => bodyBox(pose ?? null));
  let nearest = -1;
  for (let i = 0; i < times.length; i++) {
    if (!poses[i]) continue;
    if (nearest < 0 || Math.abs(times[i]! - lastKey) < Math.abs(times[nearest]! - lastKey)) nearest = i;
  }
  const finalBox = nearest >= 0 ? wholeBodyBox(poses[nearest]!, props[nearest] ?? null) : null;
  return { mustStay, centreOn: [...props], bodyOn, finalBox };
}

/** A post canvas ratio such as "9:16" as width over height. */
export function canvasAspectOf(ratio: string | undefined): number {
  const [w, h] = (ratio ?? "9:16").split(":").map(Number);
  return w && h ? w / h : 9 / 16;
}

/** The framing at take time t along a set of keys, eased as the renderer eases: by the leaving key. */
export function framingAt(keys: readonly PostKeyframe<PostSourceGeometry>[], t: number): PostSourceGeometry {
  if (t <= keys[0]!.t) return keys[0]!.value;
  for (let i = 0; i + 1 < keys.length; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    if (t > b.t) continue;
    const w = a.easing === "hold" ? 0 : sampleEasing(a.easing, (t - a.t) / (b.t - a.t));
    const mix = (k: "x" | "y" | "width" | "height") => a.value[k] + (b.value[k] - a.value[k]) * w;
    return { ...a.value, x: mix("x"), y: mix("y"), width: mix("width"), height: mix("height") };
  }
  return keys[keys.length - 1]!.value;
}
