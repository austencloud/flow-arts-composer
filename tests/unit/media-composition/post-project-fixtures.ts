import {
  POST_BOX,
  createEmptyPostProject,
  type PostItem,
  type PostProject,
  type PostTrack,
  type PostVideoItem,
} from "$lib/shared/media-composition/domain/post-project";
import type { PostTake } from "$lib/shared/media-composition/domain/post-plan";

/** Builders for post-project tests. Every field has a plain default. */

export const NOW = 1_700_000_000_000;

export function take(id: string, durationSeconds = 20): PostTake {
  return {
    id,
    label: `Take ${id}`,
    ref: { kind: "linked", url: `https://example.test/${id}.mp4` },
    takeKey: `key-${id}`,
    durationSeconds,
  };
}

const base = {
  start: 0,
  box: { ...POST_BOX.full },
  opacity: 1,
  fadeIn: 0,
  fadeOut: 0,
  anchor: null,
  fill: false,
};

export function video(
  id: string,
  fields: Partial<PostVideoItem> = {}
): PostVideoItem {
  const sourceIn = fields.sourceIn ?? 0;
  const sourceOut = fields.sourceOut ?? 10;
  const speed = fields.speed ?? 1;
  return {
    ...base,
    id,
    kind: "video",
    takeId: "a",
    sourceIn,
    sourceOut,
    speed,
    duration: (sourceOut - sourceIn) / speed,
    fit: "cover",
    zoom: 1,
    panX: 0,
    panY: 0,
    rotation: 0,
    flip: false,
    volume: 1,
    ...fields,
  };
}

export function card(id: string, duration = 5, fields: Partial<PostItem> = {}) {
  return { ...base, id, kind: "card", duration, ...fields } as PostItem;
}

export function text(
  id: string,
  start: number,
  duration: number,
  fields: Partial<PostItem> = {}
): PostItem {
  return {
    ...base,
    id,
    kind: "text",
    text: id,
    size: "m",
    start,
    duration,
    box: { x: 0.07, y: 0.05, width: 0.86, height: 0.14 },
    ...fields,
  } as PostItem;
}

export function overlay(
  id: string,
  kind: "animation" | "moves" | "carousel",
  fields: Partial<PostItem> = {}
): PostItem {
  const extra =
    kind === "animation"
      ? { overlay: true }
      : kind === "moves"
        ? { mode: "alternate" as const }
        : {};
  return {
    ...base,
    id,
    kind,
    duration: 3,
    ...extra,
    ...fields,
  } as PostItem;
}

export function track(id: string, items: PostItem[]): PostTrack {
  return { id, hidden: false, locked: false, items };
}

export function project(
  main: PostItem[],
  overlays: PostItem[][] = [],
  takes: PostTake[] = [take("a"), take("b")]
): PostProject {
  const empty = createEmptyPostProject({ sequenceId: "seq", now: NOW });
  return {
    ...empty,
    takes,
    tracks: [
      track("main", main),
      ...overlays.map((items, index) => track(`track-${index + 1}`, items)),
    ],
  };
}

/** [id, start, duration] for every item on a track, rounded for comparison. */
export function spans(p: PostProject, trackIndex: number) {
  return (p.tracks[trackIndex]?.items ?? []).map((item) => [
    item.id,
    round(item.start),
    round(item.duration),
  ]);
}

export function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
