import { z } from "zod";
import { standardEasing } from "#lib/shared/transitions/ws-ease.js";
import { GLYPH_OVERLAY_BASE_SIZE } from "#lib/shared/animation-engine/domain/glyph-overlay-frame.js";

/**
 * "Lifted panel" on an animation clip: the canvas rises and shrinks inside
 * the clip's box, the step number goes to the box's top-left corner and the
 * progress bar moves from under the canvas to the box's top edge. A Reel
 * covers the bottom quarter of its frame with its own buttons and caption, so
 * a clip in the bottom half of a 9:16 post keeps its grid above them this way.
 *
 * Times are the clip's content time, like the split's (post seconds minus the
 * clip's start). `inAt` is the moment the lift is fully in; it comes in over
 * the `inSeconds` before it. `outAt` is the moment it starts going back; it
 * goes back over the `outSeconds` after it. No `inAt` means lifted from the
 * clip's start, no `outAt` lifted to its end.
 *
 * Everything here is pure: the schema, the defaults and `panelLiftLayout`,
 * which says where the canvas, the step number and the bar are at one
 * moment. The preview, the export and the split hands all place from it.
 * The bar itself never rides a move: `panelLiftBar` fades it where it sits
 * and brings it back where the move lands.
 */

/** Longest content time a lift time may name, in seconds. */
export const POST_LIFT_MAX_SECONDS = 3600;
/**
 * A lift time may fall before the clip: the lift was already in when it
 * starts. That is what a start trim past the arrival leaves (see
 * `item-times.ts` in the plugin), as with the split.
 */
export const POST_LIFT_MIN_SECONDS = -POST_LIFT_MAX_SECONDS;
/** Shortest and longest move in or out, in seconds. */
export const POST_LIFT_MIN_MOVE_SECONDS = 0.05;
export const POST_LIFT_MAX_MOVE_SECONDS = 10;
/** The move lengths a lift without its own uses. */
export const POST_LIFT_DEFAULT_IN_SECONDS = 0.8;
export const POST_LIFT_DEFAULT_OUT_SECONDS = 0.7;

/** The canvas centre's height, as a share of the box height from its top. */
export const POST_LIFT_MIN_CANVAS_Y = 0.1;
export const POST_LIFT_MAX_CANVAS_Y = 0.9;
/** The canvas size, against the app's own canvas for the box. */
export const POST_LIFT_MIN_CANVAS_SCALE = 0.3;
export const POST_LIFT_MAX_CANVAS_SCALE = 1.5;
/** The step number's inset from the box's top-left corner, as box shares. */
export const POST_LIFT_MAX_STEP_INSET = 0.5;

export const POST_LIFT_BAR_EDGES = ["top", "bottom"] as const;
export type PostLiftBarEdge = (typeof POST_LIFT_BAR_EDGES)[number];

/**
 * The hand-made Reel cut, for a 1080 x 1920 frame with the clip on its bottom
 * half (a 1080 x 960 box): canvas centre at y 1290 (0.344 of the box down),
 * 0.95 of the app's size, step number digits from x 60, y 988, bar on top.
 */
export const POST_LIFT_DEFAULT_CANVAS_Y = 0.344;
export const POST_LIFT_DEFAULT_CANVAS_SCALE = 0.95;
export const POST_LIFT_DEFAULT_STEP_INSET_X = 0.056;
export const POST_LIFT_DEFAULT_STEP_INSET_Y = 0.029;
export const POST_LIFT_DEFAULT_BAR_EDGE: PostLiftBarEdge = "top";

const liftTime = z
  .number()
  .finite()
  .min(POST_LIFT_MIN_SECONDS)
  .max(POST_LIFT_MAX_SECONDS);
const liftMove = z
  .number()
  .finite()
  .min(POST_LIFT_MIN_MOVE_SECONDS)
  .max(POST_LIFT_MAX_MOVE_SECONDS);
const stepInset = z.number().finite().min(0).max(POST_LIFT_MAX_STEP_INSET);

/** An animation clip's lifted panel; every field optional. */
export const PostPanelLiftSchema = z
  .object({
    /** The canvas centre's height in the box, 0 at its top and 1 at its bottom. */
    canvasY: z
      .number()
      .finite()
      .min(POST_LIFT_MIN_CANVAS_Y)
      .max(POST_LIFT_MAX_CANVAS_Y)
      .optional(),
    /** The canvas size against the app's own canvas for the box. */
    canvasScale: z
      .number()
      .finite()
      .min(POST_LIFT_MIN_CANVAS_SCALE)
      .max(POST_LIFT_MAX_CANVAS_SCALE)
      .optional(),
    /** The step number's inset from the box's left edge, a share of its width. */
    stepInsetX: stepInset.optional(),
    /** The step number's inset from the box's top edge, a share of its height. */
    stepInsetY: stepInset.optional(),
    /** Which edge of the box the progress bar rides while lifted. */
    barEdge: z.enum(POST_LIFT_BAR_EDGES).optional(),
    /** Content time the lift is fully in. */
    inAt: liftTime.optional(),
    /** How long the move in lasts, ending at `inAt`. */
    inSeconds: liftMove.optional(),
    /** Content time the lift starts going back. */
    outAt: liftTime.optional(),
    /** How long going back lasts, starting at `outAt`. */
    outSeconds: liftMove.optional(),
  })
  .strict();

export type PostPanelLift = z.infer<typeof PostPanelLiftSchema>;

/** What the panel tool writes when someone turns the lift on. */
export const POST_LIFT_DEFAULTS: Readonly<PostPanelLift> = Object.freeze({
  canvasY: POST_LIFT_DEFAULT_CANVAS_Y,
  canvasScale: POST_LIFT_DEFAULT_CANVAS_SCALE,
  stepInsetX: POST_LIFT_DEFAULT_STEP_INSET_X,
  stepInsetY: POST_LIFT_DEFAULT_STEP_INSET_Y,
  barEdge: POST_LIFT_DEFAULT_BAR_EDGE,
});

/**
 * The lift as normalize keeps it: going back never starts before the lift
 * is in, and a move length without its time is dropped. Returns the same
 * object when nothing changes.
 */
export function normalizePanelLift(lift: PostPanelLift): PostPanelLift {
  let next = lift;
  if (
    next.inAt !== undefined &&
    next.outAt !== undefined &&
    next.outAt < next.inAt
  ) {
    next = { ...next, outAt: next.inAt };
  }
  if (next.inAt === undefined && next.inSeconds !== undefined) {
    const { inSeconds: _dropped, ...rest } = next;
    next = rest;
  }
  if (next.outAt === undefined && next.outSeconds !== undefined) {
    const { outSeconds: _dropped, ...rest } = next;
    next = rest;
  }
  return next;
}

/** When the lift's moves start and end, in content time. */
export interface PanelLiftSpan {
  /** The move in starts; -Infinity when lifted from the clip's start. */
  inStart: number;
  /** The lift is fully in. */
  inEnd: number;
  /** Going back starts; Infinity when lifted to the clip's end. */
  outStart: number;
  /** Fully back on the app's own layout. */
  outEnd: number;
}

export function panelLiftSpan(lift: PostPanelLift): PanelLiftSpan {
  const inSeconds = lift.inSeconds ?? POST_LIFT_DEFAULT_IN_SECONDS;
  const outSeconds = lift.outSeconds ?? POST_LIFT_DEFAULT_OUT_SECONDS;
  const inEnd = lift.inAt ?? Number.NEGATIVE_INFINITY;
  const outStart =
    lift.outAt === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(lift.outAt, inEnd);
  return {
    inStart: inEnd - inSeconds,
    inEnd,
    outStart,
    outEnd: outStart + outSeconds,
  };
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * How far the lift is in at content time `t`: 0 is the app's own layout, 1
 * fully lifted. Both moves ride the app's standard curve (`--ease-in-out`),
 * and going back is the move in played backwards, so it retraces the path.
 */
export function panelLiftAmount(lift: PostPanelLift, t: number): number {
  if (!Number.isFinite(t)) return 0;
  const span = panelLiftSpan(lift);
  const coming =
    span.inStart === Number.NEGATIVE_INFINITY
      ? 1
      : standardEasing(clamp01((t - span.inStart) / (span.inEnd - span.inStart)));
  const going =
    span.outStart === Number.POSITIVE_INFINITY
      ? 1
      : standardEasing(
          clamp01((span.outEnd - t) / (span.outEnd - span.outStart))
        );
  return Math.min(coming, going);
}

/**
 * Where the animator draws its step number, in its own square scene: the
 * top-left of the digits (`StepNumber.svelte`, x 50, y 50, hanging), as a
 * share of the canvas side.
 */
export const STEP_NUMBER_ANCHOR = 50 / GLYPH_OVERLAY_BASE_SIZE;

/** The clip's box and its progress bar, in the box's own pixels. */
export interface PanelLiftBox {
  width: number;
  height: number;
  /** The progress bar's height; the app's canvas sits in the room above it. */
  barHeight?: number;
}

/** Everything the lift places at one moment, in the box's own pixels. */
export interface PanelLiftLayout {
  /** 0 is the app's own layout, 1 fully lifted. */
  amount: number;
  canvas: {
    /** The canvas centre. */
    x: number;
    y: number;
    /** The canvas size against the app's own canvas. */
    scale: number;
    /** The canvas's side: it is drawn square. */
    size: number;
    /** How far the centre has moved from where the app puts it. */
    offsetY: number;
  };
  /** Where the app puts the canvas: its centre and side. */
  rest: { x: number; y: number; size: number };
  step: {
    /** The top-left of the step number's digits. */
    x: number;
    y: number;
    /**
     * The shift that puts the animator's own step number there, in its
     * scene's units, applied inside the moved and scaled canvas.
     */
    sceneShiftX: number;
    sceneShiftY: number;
  };
  bar: {
    /** The edge the bar is headed for. */
    edge: PostLiftBarEdge;
    /** 0 under the canvas, 1 on the box's top edge. */
    rise: number;
    /** The bar's top. */
    y: number;
    /** How far the bar has moved from its place under the canvas. */
    offsetY: number;
  };
}

/**
 * Where the canvas, the step number and the progress bar are at content
 * time `t`, for a clip's box. Without a lift, or before and after it, this
 * is exactly the app's own layout: the canvas centred and as large as fits
 * above the bar, the number at the canvas's corner, the bar under it. All
 * three travel in one move on one curve, the number on a straight line.
 */
export function panelLiftLayout(
  box: PanelLiftBox,
  lift: PostPanelLift | null | undefined,
  t: number
): PanelLiftLayout {
  const width = Math.max(0, box.width);
  const height = Math.max(0, box.height);
  const barHeight = Math.min(height, Math.max(0, box.barHeight ?? 0));
  const stageHeight = height - barHeight;
  const rest = {
    x: width / 2,
    y: stageHeight / 2,
    size: Math.min(width, stageHeight),
  };
  const restStep = {
    x: rest.x - rest.size / 2 + STEP_NUMBER_ANCHOR * rest.size,
    y: rest.y - rest.size / 2 + STEP_NUMBER_ANCHOR * rest.size,
  };
  const amount = lift ? panelLiftAmount(lift, t) : 0;
  const edge = lift?.barEdge ?? POST_LIFT_DEFAULT_BAR_EDGE;
  if (!lift || amount <= 0) {
    return {
      amount: 0,
      canvas: { ...rest, scale: 1, offsetY: 0 },
      rest,
      step: { ...restStep, sceneShiftX: 0, sceneShiftY: 0 },
      bar: { edge, rise: 0, y: stageHeight, offsetY: 0 },
    };
  }
  const lerp = (from: number, to: number) => from + (to - from) * amount;
  const liftedY = (lift.canvasY ?? POST_LIFT_DEFAULT_CANVAS_Y) * height;
  const liftedScale = lift.canvasScale ?? POST_LIFT_DEFAULT_CANVAS_SCALE;
  const scale = lerp(1, liftedScale);
  const canvas = {
    x: rest.x,
    y: lerp(rest.y, liftedY),
    scale,
    size: rest.size * scale,
    offsetY: 0,
  };
  canvas.offsetY = canvas.y - rest.y;
  const step = {
    x: lerp(
      restStep.x,
      (lift.stepInsetX ?? POST_LIFT_DEFAULT_STEP_INSET_X) * width
    ),
    y: lerp(
      restStep.y,
      (lift.stepInsetY ?? POST_LIFT_DEFAULT_STEP_INSET_Y) * height
    ),
  };
  // A scene point p lands at centre + (p - half) * unit * scale, where unit
  // is the box pixels per scene unit; solve for the shift that lands the
  // number's corner on `step`.
  const unit = rest.size / GLYPH_OVERLAY_BASE_SIZE;
  const half = GLYPH_OVERLAY_BASE_SIZE / 2;
  const anchor = STEP_NUMBER_ANCHOR * GLYPH_OVERLAY_BASE_SIZE;
  const shift = (target: number, centre: number) =>
    unit > 0 && scale > 0
      ? (target - centre) / (unit * scale) + half - anchor
      : 0;
  const rise = edge === "top" ? amount : 0;
  const barY = stageHeight * (1 - rise);
  return {
    amount,
    canvas,
    rest,
    step: {
      ...step,
      sceneShiftX: shift(step.x, canvas.x),
      sceneShiftY: shift(step.y, canvas.y),
    },
    bar: { edge, rise, y: barY, offsetY: barY - stageHeight },
  };
}

/**
 * The share of a move the bar spends fading out where it sits, and fading
 * back in where the move lands once it is over. On a 0.7 s move out that is
 * 0.245 s, about as long as a title takes to fade. It follows the lift's own
 * move lengths, so a longer move fades the bar more slowly.
 */
export const POST_LIFT_BAR_FADE_SHARE = 0.35;

/** Where the bar sits and how much of it shows, at one moment. */
export interface PanelLiftBar {
  /** 0 under the canvas, 1 on the box's top edge; never in between. */
  rise: 0 | 1;
  /** 1 fully shown, 0 hidden. */
  opacity: number;
}

const BAR_AS_IS: PanelLiftBar = Object.freeze({ rise: 0, opacity: 1 });

/** The bar's opacity around one move from `start` to `end`. */
function barFadeAround(start: number, end: number, t: number): number {
  const fade = (end - start) * POST_LIFT_BAR_FADE_SHARE;
  if (!(fade > 0) || t < start) return 1;
  if (t < start + fade) return 1 - (t - start) / fade;
  if (t < end) return 0;
  if (t < end + fade) return (t - end) / fade;
  return 1;
}

/**
 * The progress bar under a lift headed for the top edge. A full-width line
 * sliding across the frame cuts through whatever it passes, so the bar does
 * not travel with the moves: when one starts it fades out where it sits,
 * over the first share of the move, stays hidden while the canvas travels,
 * and fades back in at its new place over the same length once the move is
 * over. So it is on the box's top edge from the end of the move in to the
 * end of the move out, and under the canvas otherwise. A lift with the bar
 * on the bottom edge leaves it alone: it never moves.
 */
export function panelLiftBar(
  lift: PostPanelLift | null | undefined,
  t: number
): PanelLiftBar {
  if (!lift || !Number.isFinite(t)) return BAR_AS_IS;
  if ((lift.barEdge ?? POST_LIFT_DEFAULT_BAR_EDGE) !== "top") return BAR_AS_IS;
  const span = panelLiftSpan(lift);
  const rise = t >= span.inEnd && t < span.outEnd ? 1 : 0;
  const coming = Number.isFinite(span.inStart)
    ? barFadeAround(span.inStart, span.inEnd, t)
    : 1;
  const going = Number.isFinite(span.outStart)
    ? barFadeAround(span.outStart, span.outEnd, t)
    : 1;
  return { rise, opacity: Math.min(coming, going) };
}
