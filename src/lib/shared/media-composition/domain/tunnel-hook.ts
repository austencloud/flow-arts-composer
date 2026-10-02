import { z } from "zod";

/**
 * The opening of an animation item: its own tunnel plays through, sped up to
 * fit the intro, then the extra performers fade and the red/blue pair lands
 * on the opening pose as the item carries on as the ordinary animation. The
 * intro is the item's first `seconds`; the item keeps one canvas throughout.
 */
export const TUNNEL_HOOK_FOLDS = [2, 4, 8] as const;

const speedXSchema = z.number().finite().min(0).max(1);
const speedYSchema = z.number().finite().min(-1).max(2);

export const TunnelHookSchema = z
  .object({
    /** Rotational arms, base included. */
    fold: z.union([z.literal(2), z.literal(4), z.literal(8)]),
    /** Reflect the arms across the vertical axis (doubles the copies). */
    mirror: z.boolean(),
    /**
     * How fast the sequence plays across the hook: a CSS cubic-bezier from
     * hook progress to sequence progress. Absent means the original smooth
     * ease in and out.
     */
    speed: z
      .tuple([speedXSchema, speedYSchema, speedXSchema, speedYSchema])
      .optional(),
    /**
     * Length of the intro at the start of the item. Absent on a hook saved as
     * a separate item, whose whole span is the intro.
     */
    seconds: z.number().finite().min(0.5).max(60).optional(),
    /**
     * The footage plays, dimmed, behind the tunnel: its clip starts with the
     * item instead of where the intro ends, and the intro ends on the moment
     * the performer lands on the opening pose.
     */
    backdrop: z.boolean().optional(),
  })
  .strict();

export type TunnelHook = z.infer<typeof TunnelHookSchema>;

/**
 * A new hook starts fast and settles into the opening pose (the "Ease out"
 * preset). Hooks saved without a speed keep the original smooth ease.
 */
export const DEFAULT_TUNNEL_HOOK: TunnelHook = {
  fold: 8,
  mirror: false,
  speed: [0, 0, 0.58, 1],
};

/** Intro seconds a new hook starts with. */
export const DEFAULT_TUNNEL_HOOK_SECONDS = 5;

/** Share of the intro the canvas holds the full frame before it moves. */
const MOVE_START_SHARE = 0.4;
/** Share of the intro by which the canvas has settled into its own box. */
const MOVE_END_SHARE = 0.9;
/** The easing the canvas takes from full frame to its own box. */
export const MOVE_EASING: [number, number, number, number] = [0.65, 0, 0.35, 1];

interface IntroBoxKey<Box> {
  atSeconds: number;
  value: Box;
  easing: "hold" | [number, number, number, number];
}

/**
 * The region path of an intro: the full frame, held while the tunnel runs,
 * then eased down into the item's own box. `start` is the item's start in
 * post seconds.
 */
export function tunnelHookBoxKeys<Box>(
  start: number,
  seconds: number,
  full: Box,
  settled: Box
): IntroBoxKey<Box>[] {
  return [
    { atSeconds: start, value: full, easing: "hold" },
    {
      atSeconds: start + seconds * MOVE_START_SHARE,
      value: full,
      easing: MOVE_EASING,
    },
    {
      atSeconds: start + seconds * MOVE_END_SHARE,
      value: settled,
      easing: "hold",
    },
  ];
}

/** How bright the rest of the post stays while the tunnel holds the frame. */
export const TUNNEL_HOOK_BACKDROP_OPACITY = 0.3;

type EasingSampler = (
  easing: [number, number, number, number],
  t: number
) => number;

/**
 * The curve the dimming lifts on. Gentler than the box's own, so the light
 * comes up over the whole move instead of all at once in its middle.
 */
const LIFT_EASING: [number, number, number, number] = [0.37, 0, 0.63, 1];

/** Where `progress` sits between `from` and `to`, from 0 to 1. */
function share(progress: number, from: number, to: number): number {
  return clamp01((progress - from) / (to - from));
}

/**
 * Opacity of everything behind the tunnel at intro `progress`: dimmed while
 * the tunnel fills the frame, brightening gently as the canvas eases into its
 * box, so the footage is at full strength when the animation takes over.
 * `sample` is the keyframe easing sampler.
 */
export function tunnelHookBackdropOpacity(
  progress: number,
  sample: EasingSampler
): number {
  const lift = clamp01(
    sample(LIFT_EASING, share(progress, MOVE_START_SHARE, MOVE_END_SHARE))
  );
  return (
    TUNNEL_HOOK_BACKDROP_OPACITY + (1 - TUNNEL_HOOK_BACKDROP_OPACITY) * lift
  );
}

/**
 * Opacity of the animation's own panel colour. With footage behind the
 * tunnel the panel stays clear while the canvas moves, so it never darkens
 * the footage it passes over, and fills in once the canvas has settled into
 * its box, so it is whole when the animation takes over at the cue.
 */
export function tunnelHookPanelOpacity(
  intro: { hook: TunnelHook; progress: number } | null | undefined,
  sample: EasingSampler
): number {
  if (!intro?.hook.backdrop) return 1;
  return clamp01(sample(LIFT_EASING, share(intro.progress, MOVE_END_SHARE, 1)));
}

/** Progress at which the extra performers start to leave. */
const FADE_START = 0.45;
/** Progress by which the last of them has gone. */
const FADE_END = 0.9;
/** Share of the fade window each performer's own fade takes. */
const OWN_FADE_SHARE = 0.55;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function easeInOutCubic(value: number): number {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

/**
 * A quartered LOOP has four equivalent passes. Its final pass gives the ring
 * all four quadrants without racing through the other twelve moves. Other
 * sequences retain a full pass.
 *
 * The pass ends at `landing`, the arrival the animation itself reads when the
 * intro hands over: a take whose footage starts mid-move carries on from where
 * the tunnel left the pair instead of pulling them back to the end of the move
 * before. A landing too early for a whole pass is moved a pass later, which
 * draws the same pose. Without a landing it is the opening pose.
 */
export function tunnelHookArrival(
  progress: number,
  stepCount: number,
  period = 1,
  ease: (progress: number) => number = easeInOutCubic,
  landing = stepCount
): number {
  const span = period === 4 && stepCount % 4 === 0 ? stepCount / 4 : stepCount;
  const passesLater =
    stepCount > 0 && landing < span
      ? Math.ceil((span - landing) / stepCount)
      : 0;
  const end = landing + passesLater * stepCount;
  return end - span + span * clamp01(ease(clamp01(progress)));
}

/** Seconds the grid, glyph and step number take to come in after the hook. */
export const TUNNEL_HOOK_CHROME_SECONDS = 0.9;

/**
 * Opacity of the canvas chrome (grid, glyph, step number, progress strip) for
 * the hook's canvas. It carries none while the tunnel runs and fades in over
 * the hand-off, so the tunnel and the animation are one canvas that gains its
 * notation rather than two canvases swapped.
 */
export function tunnelHookChromeOpacity(secondsSinceHookEnd: number): number {
  const t = clamp01(secondsSinceHookEnd / TUNNEL_HOOK_CHROME_SECONDS);
  return t * t * (3 - 2 * t);
}

/**
 * Opacity of extra performer `index` (0-based among `count`) at `progress`.
 * They leave one after another, outermost last, so the ring thins instead of
 * switching off.
 */
export function tunnelHookCopyOpacity(
  progress: number,
  index: number,
  count: number
): number {
  if (count <= 0) return 0;
  const window = FADE_END - FADE_START;
  const own = window * OWN_FADE_SHARE;
  const start =
    FADE_START + (count === 1 ? 0 : (index / (count - 1)) * (window - own));
  const local = clamp01((progress - start) / own);
  return 1 - local * local * (3 - 2 * local);
}
