import { z } from "zod";
import { isFeatureVideoMediaUrl } from "$lib/shared/media-composition/domain/feature-video-url";
import {
  TAKE_MAX_BPM,
  TAKE_MIN_BPM,
} from "$lib/shared/media-composition/domain/take-timing";

/**
 * One music file under a whole post; only feature videos have one. It plays
 * from `startSeconds` on the post's clock, reading its own file from
 * `sourceInSeconds` to `sourceOutSeconds`. The beat grid is kept in the file's
 * own seconds, so it moves with the clip and survives trims.
 */

export const POST_MUSIC_MAX_GAIN = 2;
export const POST_MUSIC_MAX_BEATS_PER_BAR = 12;
/** The longest label or artist name. */
export const POST_MUSIC_MAX_TEXT = 120;
export const POST_MUSIC_MAX_LICENSE = 500;
/** The longest music file a post takes: four hours. */
export const POST_MUSIC_MAX_SECONDS = 4 * 60 * 60;
/** Room for rounding where a file's measured length meets a typed end. */
export const POST_MUSIC_LENGTH_SLACK = 1e-6;

export const PostMusicGridSchema = z
  .object({
    bpm: z.number().finite().min(TAKE_MIN_BPM).max(TAKE_MAX_BPM),
    /**
     * Bar 1, beat 1, in the file's own seconds. It may come before the file
     * starts or after it ends, by up to the longest file a post takes, so the
     * grid never has to count an unbounded number of beats.
     */
    downbeatSeconds: z
      .number()
      .finite()
      .min(-POST_MUSIC_MAX_SECONDS)
      .max(POST_MUSIC_MAX_SECONDS),
    beatsPerBar: z.number().int().min(1).max(POST_MUSIC_MAX_BEATS_PER_BAR),
  })
  .strict();

export const PostMusicSchema = z
  .object({
    id: z.string().trim().min(1),
    url: z
      .string()
      .refine(
        isFeatureVideoMediaUrl,
        "Music must be a feature video media url."
      ),
    label: z.string().trim().min(1).max(POST_MUSIC_MAX_TEXT),
    artist: z.string().trim().min(1).max(POST_MUSIC_MAX_TEXT).optional(),
    /** Library, license id and purchase date, as free text. */
    license: z.string().trim().min(1).max(POST_MUSIC_MAX_LICENSE).optional(),
    /** Where sourceInSeconds sounds on the post's clock. */
    startSeconds: z.number().finite().min(0).max(POST_MUSIC_MAX_SECONDS),
    sourceInSeconds: z.number().finite().min(0),
    sourceOutSeconds: z.number().finite().min(0),
    /** The file's length. */
    durationSeconds: z.number().finite().positive().max(POST_MUSIC_MAX_SECONDS),
    /** Linear: 1 plays the file as it is, 0 is silent. */
    gain: z.number().finite().min(0).max(POST_MUSIC_MAX_GAIN),
    fadeInSeconds: z.number().finite().min(0),
    fadeOutSeconds: z.number().finite().min(0),
    grid: PostMusicGridSchema.optional(),
  })
  .strict()
  .refine((music) => music.sourceOutSeconds > music.sourceInSeconds, {
    message: "The music must end after it starts.",
    path: ["sourceOutSeconds"],
  })
  .refine(
    (music) =>
      music.sourceOutSeconds <= music.durationSeconds + POST_MUSIC_LENGTH_SLACK,
    {
      message: "The music cannot run past the end of its file.",
      path: ["sourceOutSeconds"],
    }
  );

export type PostMusic = z.infer<typeof PostMusicSchema>;
export type PostMusicGrid = z.infer<typeof PostMusicGridSchema>;
