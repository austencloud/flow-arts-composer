import type {
  PostAnimationItem,
  PostProject,
  PostVideoItem,
} from "$lib/shared/media-composition/domain/post-project";
import {
  itemEnd,
  mainItems,
  POST_TIME_EPSILON,
} from "$lib/shared/media-composition/domain/post-project";
import type { ResolvedTakeTiming } from "$lib/shared/media-composition/domain/take-timing";
import type { TakeTiming } from "$lib/shared/media-composition/domain/take-timing";
import { postSecondsOfKeyframe } from "$lib/shared/media-composition/domain/post-project-keyframes";

export interface LayerTimingPart {
  clipId: string;
  takeId: string;
  sectionIndex: number;
  start: number;
  end: number;
  landingHoldRatio: number;
  movedLandings: number;
}

/** Timing actually heard by a layer across its full post timeline span. */
export function layerTimingParts(
  project: PostProject,
  item: Pick<PostAnimationItem, "start" | "duration">,
  timingForTake: (takeId: string) => TakeTiming | null
): LayerTimingPart[] {
  const start = item.start;
  const end = itemEnd(item);
  const cuts = new Set([start, end]);
  for (const clip of mainItems(project)) {
    if (clip.kind !== "video" || clip.start >= end || itemEnd(clip) <= start)
      continue;
    cuts.add(Math.max(start, clip.start));
    cuts.add(Math.min(end, itemEnd(clip)));
    const timing = timingForTake(clip.takeId);
    if (!timing) continue;
    for (const section of timing.sections) {
      for (const mediaSeconds of [section.startSeconds, section.endSeconds]) {
        const postSeconds = postSecondsOfKeyframe(clip, mediaSeconds);
        if (
          postSeconds > start &&
          postSeconds < end &&
          postSeconds > clip.start &&
          postSeconds < itemEnd(clip)
        )
          cuts.add(postSeconds);
      }
    }
  }
  const sorted = [...cuts].sort((a, b) => a - b);
  const parts: LayerTimingPart[] = [];
  for (let index = 0; index < sorted.length - 1; index++) {
    const from = sorted[index]!;
    const to = sorted[index + 1]!;
    if (to - from <= POST_TIME_EPSILON) continue;
    const clip = timingVideoAt(project, (from + to) / 2);
    if (!clip) continue;
    const timing = timingForTake(clip.takeId);
    if (!timing) continue;
    const mediaSeconds =
      clip.sourceIn + ((from + to) / 2 - clip.start) * clip.speed;
    const sectionIndex = timing.sections.findIndex(
      (section) =>
        mediaSeconds >= section.startSeconds &&
        mediaSeconds < section.endSeconds
    );
    if (sectionIndex < 0) continue;
    const section = timing.sections[sectionIndex]!;
    const previous = parts.at(-1);
    const movedLandings = section.overrides.filter((override) => {
      const postSeconds = postSecondsOfKeyframe(clip, override.seconds);
      return (
        postSeconds >= from - POST_TIME_EPSILON &&
        postSeconds < to - POST_TIME_EPSILON
      );
    }).length;
    if (
      previous &&
      previous.clipId === clip.id &&
      previous.sectionIndex === sectionIndex &&
      Math.abs(previous.end - from) <= POST_TIME_EPSILON
    ) {
      previous.end = to;
      previous.movedLandings += movedLandings;
    } else {
      parts.push({
        clipId: clip.id,
        takeId: clip.takeId,
        sectionIndex,
        start: from,
        end: to,
        landingHoldRatio: section.landingHoldRatio ?? 0,
        movedLandings,
      });
    }
  }
  return parts;
}

export type MappingPreviewAppearance = NonNullable<
  PostAnimationItem["animationAppearance"]
>;

/** A readable default is never written until the performer changes a control. */
export const DEFAULT_MAPPING_PREVIEW_APPEARANCE: MappingPreviewAppearance = {
  darkMode: true,
  gridMode: "8point",
  props: true,
  stepNumbers: false,
  wordHeader: false,
};

export function mappingPreviewAppearance(
  project: PostProject,
  takeId: string | null
): MappingPreviewAppearance {
  return (
    (takeId && project.mappingPreviewAppearances?.[takeId]) ||
    DEFAULT_MAPPING_PREVIEW_APPEARANCE
  );
}

/** The incoming main clip supplies motion timing while two clips crossfade. */
export function timingVideoAt(
  project: PostProject,
  seconds: number
): PostVideoItem | null {
  let covering: PostVideoItem | null = null;
  for (const item of mainItems(project)) {
    if (
      item.kind === "video" &&
      seconds >= item.start - POST_TIME_EPSILON &&
      seconds < itemEnd(item) - POST_TIME_EPSILON &&
      (!covering || item.start >= covering.start)
    ) {
      covering = item;
    }
  }
  return covering;
}

/** The next actual landing in media time, across timing sections. */
export function nextMappedLanding(
  resolved: ResolvedTakeTiming | null,
  seconds: number
): number | null {
  if (!resolved) return null;
  let next = Infinity;
  for (const section of resolved.sections) {
    for (const landing of section.landings) {
      if (landing.seconds > seconds + 0.001 && landing.seconds < next)
        next = landing.seconds;
    }
  }
  return Number.isFinite(next) ? next : null;
}
