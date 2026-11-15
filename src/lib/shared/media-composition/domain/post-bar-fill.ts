import { z } from "zod";

/**
 * "Bar fills once" on an animation clip: the progress bar under the canvas
 * stops following the sequence pass and fills once, left to right, from
 * empty at `emptyAt` to full at `fullAt`. A post that loops the sequence
 * through a long demo uses it as a loading bar for what comes next, so it
 * never starts over and is full when the next part begins.
 *
 * Times are the clip's content time, like the split's and the lifted
 * panel's (post seconds minus the clip's start). Before `emptyAt` the bar is
 * empty, after `fullAt` it stays full. Pure: the schema and `barFillAt`,
 * which the preview and the export both read.
 */

/** Longest content time a fill time may name, in seconds. */
export const POST_BAR_FILL_MAX_SECONDS = 3600;
/**
 * A fill time may fall before the clip: the bar was already part full when
 * it starts. That is what a start trim past `emptyAt` leaves (see
 * `item-times.ts` in the plugin), as with the split.
 */
export const POST_BAR_FILL_MIN_SECONDS = -POST_BAR_FILL_MAX_SECONDS;
/** The shortest fill; a frame at 30 fps. */
export const POST_BAR_FILL_MIN_LENGTH = 1 / 30;

const fillTime = z
  .number()
  .finite()
  .min(POST_BAR_FILL_MIN_SECONDS)
  .max(POST_BAR_FILL_MAX_SECONDS);

/** An animation clip's one-time bar fill. */
export const PostBarFillSchema = z
  .object({
    /** Content time the bar is empty, and starts to fill. */
    emptyAt: fillTime,
    /** Content time the bar is full. */
    fullAt: fillTime,
  })
  .strict()
  .refine((fill) => fill.fullAt - fill.emptyAt >= POST_BAR_FILL_MIN_LENGTH, {
    message: "fullAt must come after emptyAt",
    path: ["fullAt"],
  });

export type PostBarFill = z.infer<typeof PostBarFillSchema>;

/** How full the bar is at content time `t`, 0 to 1, never going back. */
export function barFillAt(fill: PostBarFill, t: number): number {
  if (!Number.isFinite(t)) return 0;
  const share = (t - fill.emptyAt) / (fill.fullAt - fill.emptyAt);
  return Math.max(0, Math.min(1, share));
}

/**
 * The fill after a start trim moved the clip's start `headCut` seconds
 * later: both times shift so they name the same moments of the post. A fill
 * that was full before the new start stays, already full. Undefined when the
 * shifted times break the schema.
 */
export function shiftBarFill(
  fill: PostBarFill,
  headCut: number
): PostBarFill | undefined {
  const next = {
    emptyAt: fill.emptyAt - headCut,
    fullAt: fill.fullAt - headCut,
  };
  const parsed = PostBarFillSchema.safeParse(next);
  return parsed.success ? parsed.data : undefined;
}
