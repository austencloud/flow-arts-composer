import { z } from "zod";

/**
 * Comet trails on filmed LED props: each bulb leaves a tail of its own light
 * that fades and narrows to a point behind it, drawn from a light map read
 * once from every real camera frame of the take (`scripts/feature-video/
 * comet-map.mjs`). The look is a few numbers on the clip, so it can change
 * at any time without baking a new copy of the footage.
 *
 * Times are footage seconds (the take's own clock), so a trim or a move of
 * the clip keeps every change on the same moment of the performance.
 */

/** Longest tail a clip may ask for, in seconds. The replay keeps more. */
export const COMET_MAX_LENGTH_SECONDS = 2.5;
export const COMET_MAX_GAIN = 3;

export const COMET_DEFAULT_TAPER = 1.6;
export const COMET_DEFAULT_LOOK = { length: 0.3, gain: 0.7 } as const;
export const COMET_DEFAULT_SECOND_LOOK = { length: 0.6, gain: 0.9 } as const;
/** How long each change takes when first added, in seconds. */
export const COMET_DEFAULT_GROW_SECONDS = 0.9;
export const COMET_DEFAULT_SWITCH_SECONDS = 1;
export const COMET_DEFAULT_PULL_BACK_SECONDS = 0.8;

const CometLookSchema = z
  .object({
    /** How long a tail lasts behind the bulb, in seconds. */
    length: z.number().min(0).max(COMET_MAX_LENGTH_SECONDS),
    /** How bright the tail is; 1 is the bulb's own light. */
    gain: z.number().min(0).max(COMET_MAX_GAIN),
  })
  .strict();

const CometChangeSchema = z
  .object({
    /** When the change starts, in footage seconds. */
    at: z.number().min(0),
    /** How long it takes; 0 is a cut. */
    seconds: z.number().min(0).max(10),
  })
  .strict();

export const PostCometTrailsSchema = z
  .object({
    /** The take's light map, a feature media URL. */
    map: z
      .string()
      .min(1)
      .refine((value) => value.startsWith("/") || /^https?:\/\//.test(value), {
        message: "map must be a media URL",
      }),
    /**
     * The footage the light was read from when it is a sharper copy of the
     * take (the 4K original of a 1080 take), so reading it again uses the
     * same copy. Without it the light comes from the take's own file.
     */
    source: z
      .string()
      .regex(/^\/api\/dev\/feature-videos\/[^/?#]+\/media\/[^?#]+$/, {
        message: "source must be a feature video media URL",
      })
      .optional(),
    /** How quickly a tail dims toward its end; 1 is even. */
    taper: z.number().min(0.2).max(6).optional(),
    /** The look from the start. */
    first: CometLookSchema,
    /** A second look the tails change to, and when. */
    second: CometLookSchema.extend(CometChangeSchema.shape).strict().optional(),
    /** Tails grow out of the bulbs from nothing. */
    growIn: CometChangeSchema.optional(),
    /** Tails pull back into the bulbs to nothing. */
    pullBack: CometChangeSchema.optional(),
  })
  .strict();

export type PostCometTrails = z.infer<typeof PostCometTrailsSchema>;
export type PostCometChange = z.infer<typeof CometChangeSchema>;

const smoothstep = (value: number): number => {
  const v = value < 0 ? 0 : value > 1 ? 1 : value;
  return v * v * (3 - 2 * v);
};

/** 0 before the change, 1 after, eased between. */
function progress(change: PostCometChange | undefined, seconds: number): number {
  if (!change) return 0;
  if (change.seconds <= 0) return seconds >= change.at ? 1 : 0;
  return smoothstep((seconds - change.at) / change.seconds);
}

/** The tail length (seconds) and brightness at a moment of the footage. */
export function cometLookAt(
  trails: PostCometTrails,
  footageSeconds: number
): { length: number; gain: number } {
  const second = trails.second;
  const u = second ? progress(second, footageSeconds) : 0;
  const grown = trails.growIn ? progress(trails.growIn, footageSeconds) : 1;
  const kept = trails.pullBack
    ? 1 - progress(trails.pullBack, footageSeconds)
    : 1;
  const length =
    (trails.first.length * (1 - u) + (second?.length ?? 0) * u) * grown * kept;
  const gain = trails.first.gain * (1 - u) + (second?.gain ?? 0) * u;
  return { length, gain };
}
