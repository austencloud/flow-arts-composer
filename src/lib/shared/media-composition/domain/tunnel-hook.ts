import { z } from "zod";

/**
 * The opening hook of a post: the sequence's own tunnel plays through, sped up
 * to fit the hook, then the extra performers fade and the red/blue pair lands
 * on the opening pose as the real animation takes over.
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

/** Hook seconds a new hook starts with. */
export const DEFAULT_TUNNEL_HOOK_SECONDS = 5;

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
 * all four quadrants and finishes on the real animation's opening pose without
 * racing through the other twelve moves. Other sequences retain a full pass.
 */
export function tunnelHookArrival(
  progress: number,
  stepCount: number,
  period = 1,
  ease: (progress: number) => number = easeInOutCubic
): number {
  const span = period === 4 && stepCount % 4 === 0 ? stepCount / 4 : stepCount;
  return stepCount - span + span * clamp01(ease(clamp01(progress)));
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
