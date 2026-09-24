import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  migrateLegacyStepMap,
  type SequenceRevisionRef,
  type SequenceTimeMap,
} from "$lib/shared/media-composition/domain/sequence-time-map";
import type {
  CollaborativeVideo,
  StepMap,
} from "$lib/shared/video-collaboration/domain/collaborative-video";
import {
  resolveHandLabeling,
  DEFAULT_HAND_LABELING,
  type HandLabeling,
} from "$lib/shared/video-collaboration/domain/hand-labeling";

export type PerformanceAlignmentStatus =
  | "saved-manual"
  | "assisted"
  | "unmapped"
  | "local-manual";

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

/**
 * What the performance picker needs to offer beat-tapping for the local file
 * that is the CURRENT performance. Null when the current performance is a
 * catalog video, a linked-but-uncataloged URL, or nothing is chosen yet.
 */
export interface LocalPerformanceInfo {
  url: string;
  duration: number;
  /** Storage key from `localStepMapKey`, scoping a tapped map to this
   *  (sequence, file) pairing. */
  key: string;
  label: string;
  stepMap: StepMap | null;
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

/**
 * Attaches a beat-tapped local StepMap to a selection. Building the
 * SequenceTimeMap goes through the same migration a saved catalog map does,
 * which needs a real media duration - a local file whose duration could not
 * be read cannot be migrated, so migration is left to throw (RangeError) and
 * that is the signal to hand the selection back unchanged rather than
 * half-updated. The caller (PostStudio's `applyLocalStepMap`) tells success
 * from failure by checking whether `alignmentStatus` actually became
 * "local-manual".
 */
export function withLocalStepMap(
  selection: PostStudioPerformanceSelection,
  stepMap: StepMap,
  sequenceRef: SequenceRevisionRef
): PostStudioPerformanceSelection {
  try {
    const sequenceTimeMap = migrateLegacyStepMap({
      stepMap,
      sequenceRef,
      mediaSourceId: selection.id,
      mediaDurationSeconds: selection.duration ?? NaN,
    });
    return {
      ...selection,
      sequenceTimeMap,
      alignmentStatus: "local-manual",
      alignmentDetail: "Tapped on this device",
    };
  } catch {
    return selection;
  }
}
