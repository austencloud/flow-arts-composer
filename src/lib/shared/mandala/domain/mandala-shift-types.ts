import { z } from "zod";
import type { MandalaColorMode, MandalaPathShape, MandalaPresetId } from "./mandala-types";

/**
 * A shifting mandala's settings, shared by the Studio mandala clip and the
 * arrangement's mandala cell. Every rate is in beats, so the mandala follows
 * the song: a slower song breathes, spins and shifts slower.
 */

/** How often the mandala shifts to the next sequence, and how long the morph takes (beats). */
export const MandalaShiftSchema = z
  .object({
    every: z.union([z.literal(1), z.literal(2), z.literal(4)]),
    unit: z.enum(["bars", "beats"]),
    morph: z.union([z.literal(1), z.literal(2), z.literal(4)]),
  })
  .strict();
export type MandalaShift = z.infer<typeof MandalaShiftSchema>;

export const MANDALA_SHIFT_EVERY = [1, 2, 4] as const;
export const MANDALA_SHIFT_MORPH = [1, 2, 4] as const;
export const MANDALA_LINE_WEIGHTS = [1.5, 2.5, 4] as const;
export const MANDALA_BREATH_BEATS = [1, 2, 4, 8] as const;
export const MANDALA_SPINS = [0, 15, 30, 60, 90] as const;

export const MandalaLookPresetSchema = z.enum([
  "aurora",
  "neon",
  "ember",
  "twilight",
  "ice",
  "solar",
  "ink",
  "gilded",
  "abyss",
]);
/** The stage presets; the viewer's custom pair is not offered here. */
export type MandalaLookPreset = z.infer<typeof MandalaLookPresetSchema> &
  Exclude<MandalaPresetId, "custom">;

export const MandalaLookSchema = z
  .object({
    shape: z.enum(["arc", "linear", "concave", "hybrid"]),
    lineWeight: z.union([z.literal(1.5), z.literal(2.5), z.literal(4)]),
    colorMode: z.enum(["solid", "flow"]),
    preset: MandalaLookPresetSchema,
    /** Tip reach as a share of the viewer's range: reach = depth x 2.5. */
    depth: z.number().finite().min(0).max(100),
    /** Beats per breath (one in and out of the tip reach). */
    breathBeats: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(8)]),
    /** Degrees the figure turns per bar. */
    spinPerBar: z.union([
      z.literal(0),
      z.literal(15),
      z.literal(30),
      z.literal(60),
      z.literal(90),
    ]),
  })
  .strict();
export type MandalaLook = z.infer<typeof MandalaLookSchema> & {
  shape: MandalaPathShape;
  colorMode: MandalaColorMode;
};

export const DEFAULT_MANDALA_SHIFT: MandalaShift = {
  every: 1,
  unit: "bars",
  morph: 2,
};

export const DEFAULT_MANDALA_LOOK: MandalaLook = {
  shape: "arc",
  lineWeight: 2.5,
  colorMode: "flow",
  preset: "aurora",
  depth: 100,
  breathBeats: 4,
  spinPerBar: 30,
};

/** The most sequences one mandala shifts between. */
export const MANDALA_MAX_SEQUENCES = 8;

/** Beats to a bar where nothing says otherwise (an arrangement, a post without a grid). */
export const MANDALA_DEFAULT_BEATS_PER_BAR = 4;
/** The tempo a mandala clip shifts at until the post has a beat grid. */
export const MANDALA_FALLBACK_BPM = 120;
