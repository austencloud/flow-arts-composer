import { z } from "zod";
import { SequenceTimeMapSchema } from "$lib/shared/media-composition/domain/sequence-time-map";
import type { SequenceRevisionRefSchema } from "$lib/shared/media-composition/domain/sequence-time-map";
import {
  MediaSourceSchema,
  type MediaSource,
} from "$lib/shared/media-composition/domain/media-source-schema";
import {
  AudioMixSchema,
  DurationPolicySchema,
  LayoutRegionSchema,
  MediaClipSchema,
  MediaTransitionSchema,
  OutputFormatSchema,
  PublishTargetOverridesSchema,
} from "$lib/shared/media-composition/domain/media-layout-schema";

const NonEmptyIdSchema = z.string().trim().min(1);
const TimestampSchema = z.number().finite().int().nonnegative();

function sequenceRefsMatch(
  left: z.infer<typeof SequenceRevisionRefSchema>,
  right: z.infer<typeof SequenceRevisionRefSchema>
): boolean {
  if (left.sequenceId !== right.sequenceId) return false;

  if (left.revisionId && right.revisionId) {
    return left.revisionId === right.revisionId;
  }

  if (left.contentHash && right.contentHash) {
    return left.contentHash === right.contentHash;
  }

  return false;
}

function sourceSequenceRef(
  source: MediaSource
): z.infer<typeof SequenceRevisionRefSchema> | null {
  if (
    source.kind === "image" ||
    source.kind === "audio" ||
    source.kind === "arrangement"
  )
    return null;
  return source.sequenceRef ?? null;
}

export const MediaCompositionProjectSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: NonEmptyIdSchema,
    ownerId: NonEmptyIdSchema,
    name: z.string().trim().min(1).max(120),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
    output: OutputFormatSchema,
    duration: DurationPolicySchema,
    sources: z.array(MediaSourceSchema).min(1),
    regions: z.array(LayoutRegionSchema),
    clips: z.array(MediaClipSchema).min(1),
    transitions: z.array(MediaTransitionSchema),
    timeMaps: z.array(SequenceTimeMapSchema),
    audioMix: AudioMixSchema,
    targetOverrides: PublishTargetOverridesSchema,
  })
  .strict()
  .superRefine((project, context) => {
    const sources = new Map(
      project.sources.map((source) => [source.id, source])
    );
    const regions = new Map(
      project.regions.map((region) => [region.id, region])
    );
    const clips = new Map(project.clips.map((clip) => [clip.id, clip]));
    const timeMaps = new Map(
      project.timeMaps.map((timeMap) => [timeMap.id, timeMap])
    );

    const uniqueCollections = [
      ["sources", project.sources],
      ["regions", project.regions],
      ["clips", project.clips],
      ["transitions", project.transitions],
      ["timeMaps", project.timeMaps],
    ] as const;

    for (const [path, items] of uniqueCollections) {
      const seen = new Set<string>();
      items.forEach((item, index) => {
        if (seen.has(item.id)) {
          context.addIssue({
            code: "custom",
            path: [path, index, "id"],
            message: `Duplicate ${path} id`,
          });
        }
        seen.add(item.id);
      });
    }

    project.sources.forEach((source, index) => {
      if (
        source.kind === "audio" &&
        source.origin.type === "original-video-audio"
      ) {
        const video = sources.get(source.origin.videoSourceId);
        if (video?.kind !== "video" || !video.hasAudio) {
          context.addIssue({
            code: "custom",
            path: ["sources", index, "origin", "videoSourceId"],
            message:
              "Original audio must reference a video source that contains audio",
          });
        }
      }

      if (
        (source.kind === "video" || source.kind === "audio") &&
        source.timeMapId
      ) {
        const timeMap = timeMaps.get(source.timeMapId);
        if (timeMap?.mediaSourceId !== source.id) {
          context.addIssue({
            code: "custom",
            path: ["sources", index, "timeMapId"],
            message: "Timed media must reference its own time map",
          });
        }
      }
    });

    project.timeMaps.forEach((timeMap, index) => {
      const mediaSource = sources.get(timeMap.mediaSourceId);
      if (
        !mediaSource ||
        (mediaSource.kind !== "video" && mediaSource.kind !== "audio")
      ) {
        context.addIssue({
          code: "custom",
          path: ["timeMaps", index, "mediaSourceId"],
          message: "A sequence time map must reference a video or audio source",
        });
      } else if (
        mediaSource.kind === "video" &&
        mediaSource.sequenceRef &&
        !sequenceRefsMatch(mediaSource.sequenceRef, timeMap.sequenceRef)
      ) {
        context.addIssue({
          code: "custom",
          path: ["timeMaps", index, "sequenceRef"],
          message:
            "Video and time map must reference the same sequence revision",
        });
      }
    });

    project.clips.forEach((clip, index) => {
      const source = sources.get(clip.sourceId);
      if (!source) {
        context.addIssue({
          code: "custom",
          path: ["clips", index, "sourceId"],
          message: "Clip source does not exist",
        });
        return;
      }

      if (clip.kind === "audio") {
        if (source.kind !== "audio") {
          context.addIssue({
            code: "custom",
            path: ["clips", index, "sourceId"],
            message: "Audio clips must reference an audio source",
          });
        }
        return;
      }

      if (source.kind === "audio") {
        context.addIssue({
          code: "custom",
          path: ["clips", index, "sourceId"],
          message: "Visual clips cannot reference an audio source",
        });
      }

      if (!regions.has(clip.regionId)) {
        context.addIssue({
          code: "custom",
          path: ["clips", index, "regionId"],
          message: "Visual clip region does not exist",
        });
      }

      if (clip.timeMapId) {
        const timeMap = timeMaps.get(clip.timeMapId);
        const sequenceRef = sourceSequenceRef(source);
        if (!timeMap) {
          context.addIssue({
            code: "custom",
            path: ["clips", index, "timeMapId"],
            message: "Clip time map does not exist",
          });
        } else if (
          !sequenceRef ||
          !sequenceRefsMatch(sequenceRef, timeMap.sequenceRef)
        ) {
          context.addIssue({
            code: "custom",
            path: ["clips", index, "timeMapId"],
            message:
              "Clip and time map must reference the same sequence revision",
          });
        }
      }
    });

    project.transitions.forEach((transition, index) => {
      const outgoing = clips.get(transition.outgoingClipId);
      const incoming = clips.get(transition.incomingClipId);
      if (outgoing?.kind !== "visual") {
        context.addIssue({
          code: "custom",
          path: ["transitions", index, "outgoingClipId"],
          message: "Outgoing transition clip must be visual",
        });
      }
      if (incoming?.kind !== "visual") {
        context.addIssue({
          code: "custom",
          path: ["transitions", index, "incomingClipId"],
          message: "Incoming transition clip must be visual",
        });
      }
      if (
        outgoing?.kind === "visual" &&
        incoming?.kind === "visual" &&
        (transition.startSeconds <
          Math.max(outgoing.startSeconds, incoming.startSeconds) ||
          transition.endSeconds >
            Math.min(outgoing.endSeconds, incoming.endSeconds))
      ) {
        context.addIssue({
          code: "custom",
          path: ["transitions", index],
          message: "Transition must fit inside both visual clips",
        });
      }
    });

    project.audioMix.tracks.forEach((track, index) => {
      const clip = clips.get(track.clipId);
      if (clip?.kind !== "audio") {
        context.addIssue({
          code: "custom",
          path: ["audioMix", "tracks", index, "clipId"],
          message: "Audio mix tracks must reference an audio clip",
        });
      } else if (
        track.fadeInSeconds + track.fadeOutSeconds >
        clip.endSeconds - clip.startSeconds
      ) {
        context.addIssue({
          code: "custom",
          path: ["audioMix", "tracks", index],
          message: "Audio fades cannot exceed the clip duration",
        });
      }
    });

    if (
      project.duration.mode === "source" &&
      !sources.has(project.duration.sourceId)
    ) {
      context.addIssue({
        code: "custom",
        path: ["duration", "sourceId"],
        message: "Duration source does not exist",
      });
    }

    const coverFrame = project.targetOverrides.instagram?.coverFrameSeconds;
    if (
      coverFrame !== undefined &&
      project.duration.mode === "fixed" &&
      coverFrame > project.duration.seconds
    ) {
      context.addIssue({
        code: "custom",
        path: ["targetOverrides", "instagram", "coverFrameSeconds"],
        message: "Cover frame must be inside the project duration",
      });
    }
  });

export type MediaCompositionProject = z.infer<
  typeof MediaCompositionProjectSchema
>;
