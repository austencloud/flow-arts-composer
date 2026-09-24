import { z } from "zod";
import {
  ClipTransformSchema,
  LayoutRegionSchema,
  OutputFormatSchema,
  PublishTargetOverridesSchema,
} from "$lib/shared/media-composition/domain/media-layout-schema";
import {
  MediaSourceKindSchema,
  SEQUENCE_DERIVED_SOURCE_KINDS,
  type MediaSourceKind,
} from "$lib/shared/media-composition/domain/media-source-schema";
import {
  PLAYBACK_MAX_BPM,
  PLAYBACK_MIN_BPM,
} from "$lib/shared/animation-engine/domain/constants/timing";

const NonEmptyIdSchema = z.string().trim().min(1);
const TimestampSchema = z.number().finite().int().nonnegative();
const SecondsSchema = z.number().finite().nonnegative();

const SecondsTimePointSchema = z
  .object({
    unit: z.literal("seconds"),
    value: SecondsSchema,
  })
  .strict();

const FractionTimePointSchema = z
  .object({
    unit: z.literal("duration-fraction"),
    value: z.number().finite().min(0).max(1),
  })
  .strict();

export const PresetTimePointSchema = z.union([
  SecondsTimePointSchema,
  FractionTimePointSchema,
]);

export type PresetTimePoint = z.infer<typeof PresetTimePointSchema>;

/**
 * A time that can follow a named marker. Only moments that should move WITH a
 * marker take one — region keyframes today — so dragging a breakdown's start
 * carries its slide-in along. Clip in and out points stay plain points: a
 * marker names a moment in the post, not a place inside a source.
 */
export const PresetTimeRefSchema = z.union([
  SecondsTimePointSchema,
  FractionTimePointSchema,
  z
    .object({
      unit: z.literal("marker"),
      markerId: NonEmptyIdSchema,
      offsetSeconds: z.number().finite(),
    })
    .strict(),
]);

export type PresetTimeRef = z.infer<typeof PresetTimeRefSchema>;

/** A named moment in the post, such as where a breakdown section starts. */
export const PresetMarkerSchema = z
  .object({
    id: NonEmptyIdSchema,
    label: z.string().trim().min(1).max(60).optional(),
    time: PresetTimePointSchema,
  })
  .strict();

export type PresetMarker = z.infer<typeof PresetMarkerSchema>;

/**
 * A region's rect at one moment, in output fractions. Unlike a static region
 * it may sit partly or wholly outside the frame: that is how a panel slides in
 * from an edge and waits off screen until it is needed.
 */
export const MotionRectSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
  })
  .strict();

export type MotionRect = z.infer<typeof MotionRectSchema>;

export const RegionKeyframeSchema = z
  .object({
    at: PresetTimeRefSchema,
    rect: MotionRectSchema,
    /** How the region travels from the previous keyframe into this one. */
    curve: z.enum(["linear", "ease-in-out"]),
  })
  .strict();

export type RegionKeyframe = z.infer<typeof RegionKeyframeSchema>;

export const RegionMotionSchema = z
  .object({
    regionId: NonEmptyIdSchema,
    keyframes: z.array(RegionKeyframeSchema).min(1),
  })
  .strict();

export type RegionMotion = z.infer<typeof RegionMotionSchema>;

export const PresetSourceRoleSchema = z
  .object({
    key: NonEmptyIdSchema,
    label: z.string().trim().min(1),
    acceptedKinds: z.array(MediaSourceKindSchema).min(1),
    required: z.boolean(),
    resolution: z.enum([
      "selected-artifact",
      "selected-video",
      "linked-sequence-animation",
      "linked-choreo-card",
      // Tunnel, 3D view and mandala all resolve from the same sequence ref
      // through a different renderer, so they share one resolution rather than
      // adding a near-identical enum member each.
      "linked-sequence-derived",
      "original-video-audio",
      "manual",
    ]),
  })
  .strict()
  .superRefine((role, context) => {
    if (new Set(role.acceptedKinds).size !== role.acceptedKinds.length) {
      context.addIssue({
        code: "custom",
        path: ["acceptedKinds"],
        message: "Accepted source kinds must be unique",
      });
    }

    const requiredKindByResolution: Partial<
      Record<typeof role.resolution, MediaSourceKind>
    > = {
      "selected-video": "video",
      "linked-sequence-animation": "sequence-animation",
      "linked-choreo-card": "choreo-card",
      "original-video-audio": "audio",
    };
    const requiredKind = requiredKindByResolution[role.resolution];
    if (requiredKind && !role.acceptedKinds.includes(requiredKind)) {
      context.addIssue({
        code: "custom",
        path: ["acceptedKinds"],
        message: `${role.resolution} roles must accept ${requiredKind}`,
      });
    }

    // This resolution covers several kinds rather than one, so it asserts
    // membership in the derived set instead of naming a single kind.
    if (
      role.resolution === "linked-sequence-derived" &&
      !role.acceptedKinds.some((kind) =>
        SEQUENCE_DERIVED_SOURCE_KINDS.includes(
          kind as (typeof SEQUENCE_DERIVED_SOURCE_KINDS)[number]
        )
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["acceptedKinds"],
        message: `linked-sequence-derived roles must accept one of ${SEQUENCE_DERIVED_SOURCE_KINDS.join(", ")}`,
      });
    }
  });

export type PresetSourceRole = z.infer<typeof PresetSourceRoleSchema>;

function validatePresetInterval(
  interval: { start: PresetTimeRef; end: PresetTimeRef },
  context: z.RefinementCtx
): void {
  // A marker's actual time depends on the selected source's duration. Its
  // ordering is checked when frames are evaluated, after that duration exists.
  if (interval.start.unit === "marker" || interval.end.unit === "marker")
    return;
  if (interval.start.unit !== interval.end.unit) {
    context.addIssue({
      code: "custom",
      path: ["end"],
      message: "Preset interval endpoints must use the same unit",
    });
    return;
  }

  if (interval.end.value <= interval.start.value) {
    context.addIssue({
      code: "custom",
      path: ["end"],
      message: "Preset interval end must be after its start",
    });
  }
}

const PresetClipTimingFields = {
  start: PresetTimePointSchema,
  end: PresetTimePointSchema,
  sourceIn: PresetTimePointSchema,
  sourceOut: PresetTimePointSchema,
  playbackRate: z.number().finite().positive(),
  loop: z.boolean(),
};

export const PresetVisualClipSchema = z
  .object({
    id: NonEmptyIdSchema,
    kind: z.literal("visual"),
    sourceRole: NonEmptyIdSchema,
    regionId: NonEmptyIdSchema,
    ...PresetClipTimingFields,
    start: PresetTimeRefSchema,
    end: PresetTimeRefSchema,
    opacity: z.number().finite().min(0).max(1),
    fadeInSeconds: SecondsSchema.optional(),
    fadeOutSeconds: SecondsSchema.optional(),
    transform: ClipTransformSchema,
    useResolvedTimeMap: z.boolean(),
    syncGroupId: NonEmptyIdSchema.optional(),
  })
  .strict()
  .superRefine((clip, context) => {
    validatePresetInterval(clip, context);
    validatePresetInterval(
      { start: clip.sourceIn, end: clip.sourceOut },
      context
    );
  });

export const PresetAudioClipSchema = z
  .object({
    id: NonEmptyIdSchema,
    kind: z.literal("audio"),
    sourceRole: NonEmptyIdSchema,
    ...PresetClipTimingFields,
  })
  .strict()
  .superRefine((clip, context) => {
    validatePresetInterval(clip, context);
    validatePresetInterval(
      { start: clip.sourceIn, end: clip.sourceOut },
      context
    );
  });

export const PresetClipSchema = z.union([
  PresetVisualClipSchema,
  PresetAudioClipSchema,
]);

export type PresetClip = z.infer<typeof PresetClipSchema>;

export const PresetTransitionSchema = z
  .object({
    id: NonEmptyIdSchema,
    kind: z.literal("crossfade"),
    outgoingClipId: NonEmptyIdSchema,
    incomingClipId: NonEmptyIdSchema,
    start: PresetTimePointSchema,
    end: PresetTimePointSchema,
    curve: z.enum(["linear", "ease-in-out"]),
  })
  .strict()
  .superRefine((transition, context) => {
    if (transition.outgoingClipId === transition.incomingClipId) {
      context.addIssue({
        code: "custom",
        path: ["incomingClipId"],
        message: "A preset transition needs two different clips",
      });
    }
    validatePresetInterval(transition, context);
  });

export const PresetDurationPolicySchema = z.union([
  z
    .object({
      mode: z.literal("fixed"),
      seconds: z.number().finite().positive(),
    })
    .strict(),
  z
    .object({
      mode: z.literal("follow-source-role"),
      sourceRole: NonEmptyIdSchema,
    })
    .strict(),
  z
    .object({
      mode: z.literal("sequence-tempo"),
      bpm: z.number().finite().min(PLAYBACK_MIN_BPM).max(PLAYBACK_MAX_BPM),
    })
    .strict(),
]);

export const PresetAudioMixTrackSchema = z
  .object({
    clipId: NonEmptyIdSchema,
    gain: z.number().finite().min(0).max(4),
    muted: z.boolean(),
    fadeInSeconds: SecondsSchema,
    fadeOutSeconds: SecondsSchema,
  })
  .strict();

export const MediaCompositionPresetSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: NonEmptyIdSchema,
    ownerId: NonEmptyIdSchema,
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
    output: OutputFormatSchema,
    duration: PresetDurationPolicySchema,
    /**
     * How a sequence-animation layer advances against project time.
     * "continuous" interpolates between poses; "step" holds each completed
     * pose for its whole beat. The studio's clock cannot dwell the way the
     * animation engine's step mode does — the video and music underneath it
     * keep running — so step here means hold, not pause-and-catch-up.
     * Optional so presets written before it parse unchanged; absent reads as
     * "continuous".
     */
    animationPlaybackMode: z.enum(["continuous", "step"]).optional(),
    /**
     * "slots" is the two-slot model the source pickers edit: regions are
     * derived from occupancy and renamed `top`/`bottom` on the way in. "free"
     * keeps the preset's own regions and motion, for layouts the slot verbs
     * cannot express, such as a breakdown strip that slides in partway
     * through. Absent reads as "slots", so older presets parse unchanged.
     */
    layoutModel: z.enum(["slots", "free"]).optional(),
    markers: z.array(PresetMarkerSchema).optional(),
    /**
     * Keyframed rects that override a region's static rect over time. The
     * static rect still has to sit inside the frame, so a moving region
     * declares where it rests and moves from there.
     */
    regionMotion: z.array(RegionMotionSchema).optional(),
    sourceRoles: z.array(PresetSourceRoleSchema).min(1),
    regions: z.array(LayoutRegionSchema),
    clips: z.array(PresetClipSchema).min(1),
    transitions: z.array(PresetTransitionSchema),
    audioMix: z
      .object({
        masterGain: z.number().finite().min(0).max(4),
        tracks: z.array(PresetAudioMixTrackSchema),
      })
      .strict(),
    targetDefaults: PublishTargetOverridesSchema,
  })
  .strict()
  .superRefine((preset, context) => {
    const roles = new Map(preset.sourceRoles.map((role) => [role.key, role]));
    const regions = new Set(preset.regions.map((region) => region.id));
    const clips = new Map(preset.clips.map((clip) => [clip.id, clip]));

    const uniqueCollections = [
      ["sourceRoles", preset.sourceRoles.map((role) => ({ id: role.key }))],
      ["regions", preset.regions],
      ["clips", preset.clips],
      ["transitions", preset.transitions],
    ] as const;

    for (const [path, items] of uniqueCollections) {
      const seen = new Set<string>();
      items.forEach((item, index) => {
        if (seen.has(item.id)) {
          context.addIssue({
            code: "custom",
            path: [path, index, path === "sourceRoles" ? "key" : "id"],
            message: `Duplicate ${path} id`,
          });
        }
        seen.add(item.id);
      });
    }

    preset.clips.forEach((clip, index) => {
      if (clip.kind === "visual") {
        for (const boundary of ["start", "end"] as const) {
          const point = clip[boundary];
          if (
            point.unit === "marker" &&
            !preset.markers?.some((marker) => marker.id === point.markerId)
          ) {
            context.addIssue({
              code: "custom",
              path: ["clips", index, boundary],
              message: "Clip marker does not exist",
            });
          }
        }
      }
      const role = roles.get(clip.sourceRole);
      if (!role) {
        context.addIssue({
          code: "custom",
          path: ["clips", index, "sourceRole"],
          message: "Preset clip source role does not exist",
        });
      } else if (
        clip.kind === "audio" &&
        !role.acceptedKinds.includes("audio")
      ) {
        context.addIssue({
          code: "custom",
          path: ["clips", index, "sourceRole"],
          message: "Audio clips need a role that accepts audio",
        });
      } else if (
        clip.kind === "visual" &&
        role.acceptedKinds.every((kind) => kind === "audio")
      ) {
        context.addIssue({
          code: "custom",
          path: ["clips", index, "sourceRole"],
          message: "Visual clips need a role that accepts visual media",
        });
      }

      if (clip.kind === "visual" && !regions.has(clip.regionId)) {
        context.addIssue({
          code: "custom",
          path: ["clips", index, "regionId"],
          message: "Preset visual clip region does not exist",
        });
      }
    });

    preset.transitions.forEach((transition, index) => {
      const outgoing = clips.get(transition.outgoingClipId);
      const incoming = clips.get(transition.incomingClipId);
      if (outgoing?.kind !== "visual") {
        context.addIssue({
          code: "custom",
          path: ["transitions", index, "outgoingClipId"],
          message: "Preset transition outgoing clip must be visual",
        });
      }
      if (incoming?.kind !== "visual") {
        context.addIssue({
          code: "custom",
          path: ["transitions", index, "incomingClipId"],
          message: "Preset transition incoming clip must be visual",
        });
      }
      if (
        outgoing?.kind === "visual" &&
        incoming?.kind === "visual" &&
        outgoing.regionId !== incoming.regionId
      ) {
        context.addIssue({
          code: "custom",
          path: ["transitions", index],
          message: "Crossfading preset clips must share a region",
        });
      }
    });

    preset.audioMix.tracks.forEach((track, index) => {
      const clip = clips.get(track.clipId);
      if (clip?.kind !== "audio") {
        context.addIssue({
          code: "custom",
          path: ["audioMix", "tracks", index, "clipId"],
          message: "Preset audio mix tracks must reference an audio clip",
        });
      }
    });

    if (
      preset.duration.mode === "follow-source-role" &&
      !roles.has(preset.duration.sourceRole)
    ) {
      context.addIssue({
        code: "custom",
        path: ["duration", "sourceRole"],
        message: "Preset duration source role does not exist",
      });
    }

    const markerIds = new Set<string>();
    (preset.markers ?? []).forEach((marker, index) => {
      if (markerIds.has(marker.id)) {
        context.addIssue({
          code: "custom",
          path: ["markers", index, "id"],
          message: "Duplicate markers id",
        });
      }
      markerIds.add(marker.id);
    });

    const movingRegions = new Set<string>();
    (preset.regionMotion ?? []).forEach((motion, index) => {
      if (!regions.has(motion.regionId)) {
        context.addIssue({
          code: "custom",
          path: ["regionMotion", index, "regionId"],
          message: "Region motion targets a region that does not exist",
        });
      }
      if (movingRegions.has(motion.regionId)) {
        context.addIssue({
          code: "custom",
          path: ["regionMotion", index, "regionId"],
          message: "A region can only have one motion track",
        });
      }
      movingRegions.add(motion.regionId);
      motion.keyframes.forEach((keyframe, keyframeIndex) => {
        if (
          keyframe.at.unit === "marker" &&
          !markerIds.has(keyframe.at.markerId)
        ) {
          context.addIssue({
            code: "custom",
            path: ["regionMotion", index, "keyframes", keyframeIndex, "at"],
            message: "Keyframe marker does not exist",
          });
        }
      });
    });
  });

export type MediaCompositionPreset = z.infer<
  typeof MediaCompositionPresetSchema
>;
