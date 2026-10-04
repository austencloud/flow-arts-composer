import { z } from "zod";

const NonEmptyIdSchema = z.string().trim().min(1);
const SecondsSchema = z.number().finite().nonnegative();
const PositiveSecondsSchema = z.number().finite().positive();

export const OutputFormatSchema = z
  .object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    frameRate: z.number().finite().positive().max(120),
    backgroundColor: z.string().trim().min(1),
  })
  .strict();

export type OutputFormat = z.infer<typeof OutputFormatSchema>;

/** Rounded corners, a border inside them and a drop shadow under a region. */
export const RegionEdgeSchema = z
  .object({
    /** Corner radius, as a share of the region's shorter side in pixels. */
    cornerRadius: z.number().finite().min(0).max(0.5),
    /** Border width, as a share of the output's shorter side. */
    borderWidth: z.number().finite().min(0).max(1),
    /** A CSS colour. */
    borderColor: z.string().trim().min(1),
    /** Drop shadow strength: 0 is none, 1 the darkest. */
    shadow: z.number().finite().min(0).max(1),
  })
  .strict();

export type RegionEdge = z.infer<typeof RegionEdgeSchema>;

export const LayoutRegionSchema = z
  .object({
    id: NonEmptyIdSchema,
    label: z.string().trim().min(1).optional(),
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
    width: z.number().finite().positive().max(1),
    height: z.number().finite().positive().max(1),
    zIndex: z.number().int(),
    fit: z.enum(["cover", "contain", "fill"]),
    clipContent: z.boolean(),
    respectSafeArea: z.boolean(),
    /** Square and bare when absent. */
    edge: RegionEdgeSchema.optional(),
    /**
     * Degrees clockwise the whole region turns about its centre, edge and
     * all; straight when absent. The unturned rect is what stays inside.
     */
    turn: z.number().finite().min(-180).max(180).optional(),
  })
  .strict()
  .superRefine((region, context) => {
    if (region.x + region.width > 1) {
      context.addIssue({
        code: "custom",
        path: ["width"],
        message: "Region extends beyond the output width",
      });
    }

    if (region.y + region.height > 1) {
      context.addIssue({
        code: "custom",
        path: ["height"],
        message: "Region extends beyond the output height",
      });
    }
  });

export type LayoutRegion = z.infer<typeof LayoutRegionSchema>;

export const ClipTransformSchema = z
  .object({
    scale: z.number().finite().positive(),
    rotationDegrees: z.number().finite(),
    translateX: z.number().finite(),
    translateY: z.number().finite(),
    /**
     * Reflects the layer across its own vertical centre line. Footage shot
     * front-on reads reversed against the notation, and flipping the pixels is
     * the fix when the take carries no text. Notation is mirrored through the
     * sequence transforms instead, so the letters stay readable — see
     * `mirrorSequence`.
     *
     * Defaults so presets written before it, including ones already in
     * Firestore, parse unchanged.
     */
    flipHorizontal: z.boolean().default(false),
  })
  .strict();

export type ClipTransform = z.infer<typeof ClipTransformSchema>;

function validateClipTimes(
  clip: {
    startSeconds: number;
    endSeconds: number;
    sourceInSeconds: number;
    sourceOutSeconds: number;
  },
  context: z.RefinementCtx
): void {
  if (clip.endSeconds <= clip.startSeconds) {
    context.addIssue({
      code: "custom",
      path: ["endSeconds"],
      message: "Clip end must be after its start",
    });
  }

  if (clip.sourceOutSeconds <= clip.sourceInSeconds) {
    context.addIssue({
      code: "custom",
      path: ["sourceOutSeconds"],
      message: "Source out point must be after its in point",
    });
  }
}

export const VisualMediaClipSchema = z
  .object({
    id: NonEmptyIdSchema,
    kind: z.literal("visual"),
    sourceId: NonEmptyIdSchema,
    regionId: NonEmptyIdSchema,
    startSeconds: SecondsSchema,
    endSeconds: PositiveSecondsSchema,
    sourceInSeconds: SecondsSchema,
    sourceOutSeconds: PositiveSecondsSchema,
    playbackRate: z.number().finite().positive(),
    loop: z.boolean(),
    opacity: z.number().finite().min(0).max(1),
    transform: ClipTransformSchema,
    timeMapId: NonEmptyIdSchema.optional(),
    syncGroupId: NonEmptyIdSchema.optional(),
  })
  .strict()
  .superRefine(validateClipTimes);

export const AudioMediaClipSchema = z
  .object({
    id: NonEmptyIdSchema,
    kind: z.literal("audio"),
    sourceId: NonEmptyIdSchema,
    startSeconds: SecondsSchema,
    endSeconds: PositiveSecondsSchema,
    sourceInSeconds: SecondsSchema,
    sourceOutSeconds: PositiveSecondsSchema,
    playbackRate: z.number().finite().positive(),
    loop: z.boolean(),
  })
  .strict()
  .superRefine(validateClipTimes);

export const MediaClipSchema = z.union([
  VisualMediaClipSchema,
  AudioMediaClipSchema,
]);

export type MediaClip = z.infer<typeof MediaClipSchema>;

export const MediaTransitionSchema = z
  .object({
    id: NonEmptyIdSchema,
    kind: z.literal("crossfade"),
    outgoingClipId: NonEmptyIdSchema,
    incomingClipId: NonEmptyIdSchema,
    startSeconds: SecondsSchema,
    endSeconds: PositiveSecondsSchema,
    curve: z.enum(["linear", "ease-in-out"]),
  })
  .strict()
  .superRefine((transition, context) => {
    if (transition.outgoingClipId === transition.incomingClipId) {
      context.addIssue({
        code: "custom",
        path: ["incomingClipId"],
        message: "A transition needs two different clips",
      });
    }

    if (transition.endSeconds <= transition.startSeconds) {
      context.addIssue({
        code: "custom",
        path: ["endSeconds"],
        message: "Transition end must be after its start",
      });
    }
  });

export type MediaTransition = z.infer<typeof MediaTransitionSchema>;

export const DurationPolicySchema = z.union([
  z
    .object({
      mode: z.literal("fixed"),
      seconds: PositiveSecondsSchema,
    })
    .strict(),
  z
    .object({
      mode: z.literal("source"),
      sourceId: NonEmptyIdSchema,
    })
    .strict(),
]);

export const AudioMixTrackSchema = z
  .object({
    clipId: NonEmptyIdSchema,
    gain: z.number().finite().min(0).max(4),
    muted: z.boolean(),
    fadeInSeconds: SecondsSchema,
    fadeOutSeconds: SecondsSchema,
  })
  .strict();

export const AudioMixSchema = z
  .object({
    masterGain: z.number().finite().min(0).max(4),
    tracks: z.array(AudioMixTrackSchema),
  })
  .strict();

export const PublishTargetOverridesSchema = z
  .object({
    instagram: z
      .object({
        delivery: z.enum(["handoff", "direct"]),
        caption: z.string().max(2200).optional(),
        coverFrameSeconds: SecondsSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
