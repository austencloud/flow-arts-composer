import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  migrateLegacyStepMap,
  type SequenceRevisionRef,
  type SequenceTimeMap,
} from "$lib/shared/media-composition/domain/sequence-time-map";
import type { CollaborativeVideo } from "$lib/shared/video-collaboration/domain/collaborative-video";
import {
  resolveHandLabeling,
  DEFAULT_HAND_LABELING,
  type HandLabeling,
} from "$lib/shared/video-collaboration/domain/hand-labeling";

export type PerformanceAlignmentStatus =
  | "saved-manual"
  | "assisted"
  | "unmapped";

export interface PostStudioPerformanceSelection {
  id: string;
  url: string;
  duration?: number;
  label: string;
  /** The catalog record behind this selection, or null for a local file. */
  videoId: string | null;
  handLabeling: HandLabeling;
  sequenceTimeMap: SequenceTimeMap | null;
  alignmentStatus: PerformanceAlignmentStatus;
  alignmentDetail: string;
}

export function createPostStudioSequenceRef(
  sequence: SequenceData
): SequenceRevisionRef {
  return {
    sequenceId: sequence.id,
    revisionId: [
      "preview",
      sequence.canonicalSignature ?? sequence.canonicalHandPath ?? "",
      sequence.leftPathHash ?? "",
      sequence.rightPathHash ?? "",
      sequence.word,
      sequence.steps.length,
    ].join(":"),
  };
}

export function createUnmappedPerformanceSelection(input: {
  id: string;
  url: string;
  duration?: number;
  label: string;
  videoId?: string;
  handLabeling?: HandLabeling;
}): PostStudioPerformanceSelection {
  return {
    ...input,
    videoId: input.videoId ?? null,
    handLabeling: input.handLabeling ?? DEFAULT_HAND_LABELING,
    sequenceTimeMap: null,
    alignmentStatus: "unmapped",
    alignmentDetail: "Unmapped · even timing preview",
  };
}

export function createCatalogPerformanceSelection(
  video: CollaborativeVideo,
  sequenceRef: SequenceRevisionRef
): PostStudioPerformanceSelection {
  const base = {
    id: `collaborative-video:${video.id}`,
    url: video.videoUrl,
    duration: video.duration,
    label: video.description?.trim() || "Performance video",
    videoId: video.id,
    handLabeling: resolveHandLabeling(video),
  };

  if (!video.beatMap) return createUnmappedPerformanceSelection(base);

  try {
    const sequenceTimeMap = migrateLegacyStepMap({
      stepMap: video.beatMap,
      sequenceRef,
      mediaSourceId: base.id,
      mediaDurationSeconds: video.duration,
    });
    const manual = video.beatMap.source === "manual";
    return {
      ...base,
      sequenceTimeMap,
      alignmentStatus: manual ? "saved-manual" : "assisted",
      alignmentDetail: manual ? "Saved manual map" : "Assisted candidate",
    };
  } catch {
    return {
      ...createUnmappedPerformanceSelection(base),
      alignmentDetail: "Saved map needs repair · even timing preview",
    };
  }
}
