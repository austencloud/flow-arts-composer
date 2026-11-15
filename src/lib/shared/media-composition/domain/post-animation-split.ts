import { z } from "zod";
import {
  BOX_OUTER_RING_WIDTH,
  GRID_POINT_RADIUS,
  getGridPoints,
  isBoxGrid,
} from "@tka/render-core";

/**
 * "Split hands" on an animation clip: partway through, the one canvas parts
 * into two, the left hand's on the left and the right hand's on the right,
 * and may come back together later. Times are the clip's content time, the
 * same clock as its keyframes (post seconds minus the clip's start), so
 * moving the clip carries the split with it.
 *
 * Everything here is pure: the schema, the defaults, and `splitPose`, which
 * says where the two canvases are at one moment. The preview and the export
 * both draw from that pose.
 */

export const POST_SPLIT_STYLES = ["glide", "spring", "peel", "echo"] as const;
export type PostSplitStyle = (typeof POST_SPLIT_STYLES)[number];

/** The style a split without one uses. */
export const POST_SPLIT_DEFAULT_STYLE: PostSplitStyle = "echo";

/** Longest content time a split time may name, in seconds. */
export const POST_SPLIT_MAX_SECONDS = 3600;
/** Shortest and longest opening or closing move, in seconds. */
export const POST_SPLIT_MIN_MOVE_SECONDS = 0.05;
export const POST_SPLIT_MAX_MOVE_SECONDS = 10;
/** One beat at the reel's tempo: the opening move a new split gets. */
export const POST_SPLIT_DEFAULT_OPEN_SECONDS = 0.7;

/** How far each canvas sits from the centre, as a share of the box width. */
export const POST_SPLIT_DEFAULT_SPREAD = 0.25;
export const POST_SPLIT_MAX_SPREAD = 0.5;
/**
 * Each canvas's size while apart, against the single canvas: the largest a
 * split without its own `scale` uses. A tall box gets less, so each grid
 * still fits its half (`splitFitScale`).
 */
export const POST_SPLIT_DEFAULT_SCALE = 0.76;
export const POST_SPLIT_MIN_SCALE = 0.2;
export const POST_SPLIT_MAX_SCALE = 1.5;
/**
 * Three across: the single canvas stays in the middle, both hands still on
 * it, and the left and right hands' canvases peel out of it to either side.
 * `middle` is the middle canvas's size while apart, against the single
 * canvas. The defaults below are the layout Austen asked for on the
 * ΩΛ-XJ reel, a 1080 x 960 box under the video with the panel lifted: the
 * middle ring about 470 px across, the side rings about 200 px at x 135
 * and 945, the row the full width. The panel writes them when three across
 * is turned on.
 */
export const POST_SPLIT_MIN_MIDDLE = 0.3;
export const POST_SPLIT_MAX_MIDDLE = 1.5;
export const POST_SPLIT_THREE_DEFAULTS = Object.freeze({
  middle: 0.82,
  scale: 0.35,
  spread: 0.375,
});
/** Extra light on the hit: 0.7 makes the canvases 1.7 times as bright. */
export const POST_SPLIT_DEFAULT_FLASH = 0.7;
export const POST_SPLIT_MAX_FLASH = 3;

/**
 * A split time may fall before the clip: the hands were already parting, or
 * apart, when it starts. That is what a start trim past the opening leaves
 * (see `item-times.ts` in the plugin); the tool itself sets times from 0.
 */
export const POST_SPLIT_MIN_SECONDS = -POST_SPLIT_MAX_SECONDS;
const splitTime = z
  .number()
  .finite()
  .min(POST_SPLIT_MIN_SECONDS)
  .max(POST_SPLIT_MAX_SECONDS);
const splitMove = z
  .number()
  .finite()
  .min(POST_SPLIT_MIN_MOVE_SECONDS)
  .max(POST_SPLIT_MAX_MOVE_SECONDS);

/**
 * An animation clip's split. Absent `closeAt` keeps the hands apart to the
 * clip's end; absent `closeSeconds` closes as long as it opened. A clip that
 * already draws one hand (`part.hand`) ignores it.
 */
export const PostAnimationSplitSchema = z
  .object({
    /** Content time the hands start to part. */
    openAt: splitTime,
    /** How long the opening move lasts. */
    openSeconds: splitMove,
    /** Content time the hands start to rejoin. */
    closeAt: splitTime.optional(),
    /** How long rejoining takes. */
    closeSeconds: splitMove.optional(),
    style: z.enum(POST_SPLIT_STYLES).optional(),
    spread: z.number().finite().min(0).max(POST_SPLIT_MAX_SPREAD).optional(),
    scale: z
      .number()
      .finite()
      .min(POST_SPLIT_MIN_SCALE)
      .max(POST_SPLIT_MAX_SCALE)
      .optional(),
    flash: z.number().finite().min(0).max(POST_SPLIT_MAX_FLASH).optional(),
    /** Three across: the single canvas stays in the middle as the hands part. */
    three: z.boolean().optional(),
    /** Three across: the middle canvas's size while apart, against the single canvas. */
    middle: z
      .number()
      .finite()
      .min(POST_SPLIT_MIN_MIDDLE)
      .max(POST_SPLIT_MAX_MIDDLE)
      .optional(),
  })
  .strict();

export type PostAnimationSplit = z.infer<typeof PostAnimationSplitSchema>;

/**
 * The split as normalize keeps it: rejoining never starts before parting,
 * and a closing length without a closing time is dropped. Returns the same
 * object when nothing changes.
 */
export function normalizeAnimationSplit(
  split: PostAnimationSplit
): PostAnimationSplit {
  let next = split;
  if (next.closeAt !== undefined && next.closeAt < next.openAt) {
    next = { ...next, closeAt: next.openAt };
  }
  if (next.closeAt === undefined && next.closeSeconds !== undefined) {
    const { closeSeconds: _dropped, ...rest } = next;
    next = rest;
  }
  return next;
}

// ---------------------------------------------------------------------------
// Timing of the motion. These are content, tuned on the reel, not UI motion.
// ---------------------------------------------------------------------------

/**
 * The spring, in units of the opening move: x(u) = 1 - e^(-D u) cos(F u).
 * F puts the first arrival at a fifth of the move (F u = pi / 2); D makes the
 * run past the marks about a tenth, and leaves it within half a percent of
 * rest by the end of the move.
 */
export const SPLIT_SPRING_FREQUENCY = 7.5;
export const SPLIT_SPRING_DAMPING = 6.25;
/** After this many opening lengths the spring is treated as exactly at rest. */
export const SPLIT_SPRING_REST_AFTER = 3;
/** How fast the hit's flash dies, per opening length. */
export const SPLIT_FLASH_DECAY = 7;
/**
 * Glide and spring: the two canvases cross-fade in from the single canvas
 * over the first part of the way apart, so the first sliver never pops.
 */
export const SPLIT_SHOW_SLIVER = 0.15;
/** Peel and echo: the slow drift apart before the hit, in seconds. */
export const SPLIT_PEEL_LEAD_SECONDS = 0.63;
/** How far apart the drift gets by the hit, as a share of the full move. */
export const SPLIT_PEEL_DRIFT = 0.045;
/** The cross-fade to two canvases at the start of the drift, in seconds. */
export const SPLIT_PEEL_FADE_SECONDS = 0.1;
/** Echo: how many trailing copies, and how far behind each is, in seconds. */
export const SPLIT_ECHO_COPIES = 14;
export const SPLIT_ECHO_STEP_SECONDS = 0.005;
/** Echo: the first copy's strength, and how much each next one keeps. */
export const SPLIT_ECHO_STRENGTH = 0.6;
export const SPLIT_ECHO_FALLOFF = 0.86;
/** Echo: how long after the hit the copies show; they fade out in its second half. */
export const SPLIT_ECHO_WINDOW_SECONDS = 0.4;
/** A copy closer than this to its canvas is not drawn. */
const ECHO_MIN_GAP = 1e-3;
/**
 * The two extra canvases mount this long before the split first moves, so
 * they are drawing by the time they show and the hit never waits on them.
 */
export const SPLIT_MOUNT_AHEAD_SECONDS = 1.5;

/** One trailing copy of each canvas while it flies. */
export interface SplitEcho {
  /** Where the copy is, on the same scale as `SplitPose.apart`. */
  apart: number;
  /** How far behind its canvas it is: the copy's `apart` minus the pose's. */
  offset: number;
  /** The copy's size against the single canvas. */
  scale: number;
  /** How strongly it shows, 0 to 1. */
  strength: number;
}

/** Where the two canvases are at one moment. */
export interface SplitPose {
  /** 0 is one canvas, 1 each at its mark; the spring runs past 1. */
  apart: number;
  /** Each canvas's size against the single canvas. */
  scale: number;
  /** How much the two canvases show over the single one, 0 to 1. */
  show: number;
  /** The canvases' light gain; 1 is as drawn. */
  flash: number;
  /** Trailing copies, strongest first; empty unless the echo is flying. */
  echoes: SplitEcho[];
  /**
   * The single canvas's size against where it rests: 1 except in a split
   * three across, where it goes to the middle's size on the hands' motion.
   */
  middle: number;
}

/** The pose that is exactly the single canvas. */
export const SPLIT_ONE_CANVAS: Readonly<SplitPose> = Object.freeze({
  apart: 0,
  scale: 1,
  show: 0,
  flash: 1,
  echoes: [],
  middle: 1,
});

/** A split with every default filled in. */
interface ResolvedSplit {
  openAt: number;
  openSeconds: number;
  closeAt: number;
  closeSeconds: number;
  style: PostSplitStyle;
  scale: number;
  flash: number;
  /** The middle canvas's size while apart; 1 unless three across. */
  middle: number;
}

function resolve(
  split: PostAnimationSplit,
  fallbackScale: number
): ResolvedSplit {
  return {
    openAt: split.openAt,
    openSeconds: split.openSeconds,
    closeAt:
      split.closeAt === undefined
        ? Number.POSITIVE_INFINITY
        : Math.max(split.openAt, split.closeAt),
    closeSeconds: split.closeSeconds ?? split.openSeconds,
    style: split.style ?? POST_SPLIT_DEFAULT_STYLE,
    scale:
      split.scale ??
      (split.three ? POST_SPLIT_THREE_DEFAULTS.scale : fallbackScale),
    flash: split.flash ?? POST_SPLIT_DEFAULT_FLASH,
    middle: split.three
      ? (split.middle ?? POST_SPLIT_THREE_DEFAULTS.middle)
      : 1,
  };
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
/** Smoothstep: an even ease in and out over 0 to 1. */
const ease = (value: number) => {
  const u = clamp01(value);
  return u * u * (3 - 2 * u);
};

function spring(u: number): number {
  if (u <= 0) return 0;
  if (u >= SPLIT_SPRING_REST_AFTER) return 1;
  return (
    1 -
    Math.exp(-SPLIT_SPRING_DAMPING * u) * Math.cos(SPLIT_SPRING_FREQUENCY * u)
  );
}

/** Seconds the split starts moving before `openAt`: the peel's drift. */
function leadSeconds(style: PostSplitStyle): number {
  return style === "peel" || style === "echo" ? SPLIT_PEEL_LEAD_SECONDS : 0;
}

/** The opening motion alone, ignoring any close. */
interface OpenPose {
  apart: number;
  /** 0 to 1: how far each canvas has gone to its split size. */
  grown: number;
  show: number;
}

function openPose(s: ResolvedSplit, t: number): OpenPose {
  const u = (t - s.openAt) / s.openSeconds;
  if (s.style === "glide") {
    const x = ease(u);
    return { apart: x, grown: x, show: ease(x / SPLIT_SHOW_SLIVER) };
  }
  if (s.style === "spring") {
    const x = spring(u);
    return { apart: x, grown: x, show: ease(x / SPLIT_SHOW_SLIVER) };
  }
  // Peel and echo: drift apart, easing in, until the hit, then spring.
  const lead = SPLIT_PEEL_LEAD_SECONDS;
  const driftStart = s.openAt - lead;
  if (t <= driftStart) return { apart: 0, grown: 0, show: 0 };
  if (t <= s.openAt) {
    const a = (t - driftStart) / lead;
    return {
      apart: SPLIT_PEEL_DRIFT * a * a,
      grown: 0,
      show: ease((t - driftStart) / SPLIT_PEEL_FADE_SECONDS),
    };
  }
  const x = spring(u);
  return {
    apart: SPLIT_PEEL_DRIFT + (1 - SPLIT_PEEL_DRIFT) * x,
    grown: x,
    show: 1,
  };
}

function flashGain(s: ResolvedSplit, t: number): number {
  if (s.style === "glide" || t <= s.openAt) return 1;
  const u = (t - s.openAt) / s.openSeconds;
  return 1 + s.flash * Math.exp(-SPLIT_FLASH_DECAY * u);
}

function echoes(s: ResolvedSplit, t: number, now: OpenPose): SplitEcho[] {
  if (s.style !== "echo" || t >= s.closeAt) return [];
  const since = t - s.openAt;
  if (since <= 0 || since >= SPLIT_ECHO_WINDOW_SECONDS) return [];
  const half = SPLIT_ECHO_WINDOW_SECONDS / 2;
  const fade = 1 - ease((since - half) / half);
  const sizeOf = (grown: number) => 1 + (s.scale - 1) * grown;
  const list: SplitEcho[] = [];
  for (let j = 1; j <= SPLIT_ECHO_COPIES; j++) {
    const then = openPose(s, t - j * SPLIT_ECHO_STEP_SECONDS);
    const offset = then.apart - now.apart;
    const scale = sizeOf(then.grown);
    if (
      Math.abs(offset) < ECHO_MIN_GAP &&
      Math.abs(scale - sizeOf(now.grown)) < ECHO_MIN_GAP
    )
      continue;
    const strength = SPLIT_ECHO_STRENGTH * SPLIT_ECHO_FALLOFF ** (j - 1) * fade;
    if (strength <= 0) continue;
    list.push({ apart: then.apart, offset, scale, strength });
  }
  return list;
}

/**
 * Where the two canvases are at content time `t`. Before the split starts
 * moving and after it has closed, this is exactly `SPLIT_ONE_CANVAS`.
 * `fallbackScale` is the size a split without its own `scale` uses: pass
 * `splitFitScale` for the box it draws in.
 */
export function splitPose(
  split: PostAnimationSplit,
  t: number,
  fallbackScale = POST_SPLIT_DEFAULT_SCALE
): SplitPose {
  const s = resolve(split, fallbackScale);
  if (!Number.isFinite(t) || t <= s.openAt - leadSeconds(s.style))
    return SPLIT_ONE_CANVAS;
  const closeEnd = s.closeAt + s.closeSeconds;
  if (t >= closeEnd) return SPLIT_ONE_CANVAS;

  const sizeOf = (grown: number) => 1 + (s.scale - 1) * grown;
  // The middle rides the same motion as the hands, so at every moment the
  // two side canvases are coming out of it, not crossing over it.
  const middleOf = (grown: number) => 1 + (s.middle - 1) * grown;
  if (t < s.closeAt) {
    const pose = openPose(s, t);
    return {
      apart: pose.apart,
      scale: sizeOf(pose.grown),
      show: pose.show,
      flash: flashGain(s, t),
      echoes: echoes(s, t, pose),
      middle: middleOf(pose.grown),
    };
  }
  // Rejoining eases back from wherever the opening had got to, so the start
  // of the close never jumps.
  const from = openPose(s, s.closeAt);
  const left = 1 - ease((t - s.closeAt) / s.closeSeconds);
  return {
    apart: from.apart * left,
    scale: sizeOf(from.grown * left),
    show: from.show * ease(left / SPLIT_SHOW_SLIVER),
    flash: flashGain(s, t),
    echoes: [],
    middle: middleOf(from.grown * left),
  };
}

/** How far each side canvas sits from the centre, as a share of the box width. */
export function splitSpreadOf(split: PostAnimationSplit): number {
  return (
    split.spread ??
    (split.three ? POST_SPLIT_THREE_DEFAULTS.spread : POST_SPLIT_DEFAULT_SPREAD)
  );
}

/**
 * Three across: how far the middle canvas's centre rises as it shrinks to
 * `middle`, in pixels, for a canvas `canvasSide` pixels a side. It shrinks
 * toward its top grid point, which stays where it was, so the row keeps
 * tight under whatever sits above the panel and the room the middle gives
 * up goes below it. Negative when the middle grows.
 */
export function splitMiddleRise(
  middle: number,
  canvasSide: number,
  gridMode?: string | null
): number {
  return (1 - middle) * splitGridReach(gridMode) * canvasSide;
}

/**
 * The content-time span the two extra canvases are mounted for: from a
 * little before the split first moves until it has closed (Infinity when it
 * never closes).
 */
export function splitMountSpan(split: PostAnimationSplit): {
  start: number;
  end: number;
} {
  const s = resolve(split, POST_SPLIT_DEFAULT_SCALE);
  return {
    start: s.openAt - leadSeconds(s.style) - SPLIT_MOUNT_AHEAD_SECONDS,
    end: s.closeAt + s.closeSeconds,
  };
}

/** Where the single canvas rests inside its box, in the box's own pixels. */
export interface SplitRestFrame {
  /** The canvas's centre. */
  x: number;
  y: number;
  /** The canvas's side: it is drawn square. */
  size: number;
}

/**
 * Where the single canvas rests inside a box of this size: centred, as large
 * as fits. Everything the split draws is placed from this, so letting the
 * canvas move inside its box only has to change this function.
 */
export function splitRestFrame(width: number, height: number): SplitRestFrame {
  return { x: width / 2, y: height / 2, size: Math.min(width, height) };
}

/**
 * Where the single canvas is while a lifted panel has moved it: its centre
 * as shares of the box, and its size against where it rests. Read from
 * `panelLiftLayout`, so the split and the lift always agree.
 */
export interface SplitCanvasLift {
  x: number;
  y: number;
  scale: number;
}

/**
 * The frame both hands' canvases are placed from: `rest`, where the single
 * canvas rests (and where each hand's hidden animator draws it), and
 * `centre`, where it is now, lifted or not. Each hand's size is the pose's
 * scale times the lift's, since the split's scale is against the single
 * canvas as shown.
 */
export function splitPlacementFrame(
  width: number,
  height: number,
  lift?: SplitCanvasLift | null
): { rest: SplitRestFrame; centre: SplitRestFrame; scale: number } {
  const rest = splitRestFrame(width, height);
  if (!lift) return { rest, centre: rest, scale: 1 };
  return {
    rest,
    centre: {
      x: lift.x * width,
      y: lift.y * height,
      size: rest.size * lift.scale,
    },
    scale: lift.scale,
  };
}

/** The animator's scene: one grid in a square this many units a side. */
const SCENE_SIZE = 950;
/** The scene's centre, where the grid's centre point sits. */
const SCENE_CENTER = SCENE_SIZE / 2;
/**
 * The room left between each grid and the box's edge, and between the two
 * grids, as a share of the box width.
 */
export const SPLIT_FIT_MARGIN = 0.03;

/**
 * How far one grid reaches from its centre, outer points included, as a
 * share of the canvas side. Taken from the points the animator's dot grid
 * paints (`getGridPoints`), each at its drawn radius.
 */
export function splitGridReach(gridMode: string | null | undefined): number {
  const box = isBoxGrid(gridMode ?? undefined);
  let reach = 0;
  for (const point of getGridPoints(gridMode ?? undefined)) {
    const ring = box && point.kind === "outer" ? BOX_OUTER_RING_WIDTH / 2 : 0;
    const radius = GRID_POINT_RADIUS[point.kind] + ring;
    reach = Math.max(
      reach,
      Math.abs(point.x - SCENE_CENTER) + radius,
      Math.abs(point.y - SCENE_CENTER) + radius
    );
  }
  return reach / SCENE_SIZE;
}

/**
 * The size a split without its own `scale` draws each canvas at in a box
 * `width` by `height`: the default, or less where the box is too narrow
 * for each grid, outer points included, to sit in its half with
 * `SPLIT_FIT_MARGIN` to spare at the edge and in the middle. This assumes
 * each canvas centred in its half, as the default spread puts it.
 */
export function splitFitScale(
  width: number,
  height: number,
  gridMode?: string | null
): number {
  if (!(width > 0) || !(height > 0)) return POST_SPLIT_DEFAULT_SCALE;
  const rest = splitRestFrame(width, height);
  const margin = SPLIT_FIT_MARGIN * width;
  const room = Math.min(width / 4 - margin, height / 2 - margin);
  const fit = room / (rest.size * splitGridReach(gridMode));
  return Math.min(
    POST_SPLIT_DEFAULT_SCALE,
    Math.max(POST_SPLIT_MIN_SCALE, fit)
  );
}

/** One of the two canvases, placed: its centre and its side, in box pixels. */
export interface SplitCanvasPlace {
  x: number;
  y: number;
  size: number;
  /** The factor from the single canvas to this one. */
  scale: number;
}

/**
 * Where the left (-1) or right (+1) canvas sits for a given `apart` and
 * `scale`, in a box `width` wide resting at `rest`.
 */
export function splitCanvasPlace(
  rest: SplitRestFrame,
  width: number,
  side: -1 | 1,
  apart: number,
  scale: number,
  spread = POST_SPLIT_DEFAULT_SPREAD
): SplitCanvasPlace {
  return {
    x: rest.x + side * spread * width * apart,
    y: rest.y,
    size: rest.size * scale,
    scale,
  };
}
