import {
  MAIN_TRACK_INDEX,
  POST_TIME_EPSILON,
  itemEnd,
  type PostBox,
  type PostItem,
  type PostProject,
} from "$lib/shared/media-composition/domain/post-project";
import {
  DEFAULT_TUNNEL_TITLES,
  LIFT_EASING,
  MOVE_END_SHARE,
  MOVE_START_SHARE,
} from "$lib/shared/media-composition/domain/tunnel-hook";

/**
 * The words around the opening tunnel. While the tunnel holds the frame the
 * sequence's name sits above it, with how to say it, and the video's parts
 * sit below it as a bar whose first part fills like a loading bar. As the
 * tunnel moves into its box the words lift away, and the bar comes back as a
 * thin line along the top of the animation's box, still filling, until the
 * first part ends.
 */

/** One part of the video: a main-track clip, or the closing card. */
export interface TunnelTitlePart {
  label: string;
  start: number;
  end: number;
}

export interface TunnelTitlesPlan {
  /** The animation item that opens with the tunnel. */
  itemId: string;
  /** Post seconds the tunnel starts. */
  start: number;
  /** Seconds the tunnel holds before the animation takes over. */
  seconds: number;
  name: boolean;
  spoken?: string;
  /** Empty when the parts are hidden or the video has only one. */
  parts: TunnelTitlePart[];
  /** The line along the top of the animation's box, or null. */
  divider: { box: PostBox; fadeOutStart: number; fadeOutEnd: number } | null;
  /** Post seconds the last of the words has gone. */
  end: number;
}

/** The painted layer with the words around the opening tunnel. */
export const TUNNEL_TITLES_ROLE = "tunnel-titles";

/** What the closing card stands for in the parts. */
export const TUNNEL_TITLES_CARD_LABEL = "Your turn";

/** Longest the line takes to leave once the first part has filled. */
const DIVIDER_MAX_FADE_SECONDS = 1;
/** Shortest, when nothing overlaps the end of the first part. */
const DIVIDER_MIN_FADE_SECONDS = 0.4;

/** "Full Speed" reads "Full speed"; "ΩΛ-XJ cut" and "XJ" keep their capitals. */
function sentenceCase(label: string): string {
  return label
    .trim()
    .replace(/(?<=\s)([A-Z])(?=[a-z]+\b)/g, (letter) => letter.toLowerCase());
}

function partLabel(item: PostItem, project: PostProject, index: number) {
  if (item.kind === "card") return TUNNEL_TITLES_CARD_LABEL;
  const take =
    item.kind === "video"
      ? project.takes.find((entry) => entry.id === item.takeId)
      : undefined;
  const label = item.label?.trim() || take?.label.trim();
  return label ? sentenceCase(label) : `Part ${index + 1}`;
}

/** The video's parts: each main-track clip and the closing card, in order. */
export function tunnelTitleParts(project: PostProject): TunnelTitlePart[] {
  const main = project.tracks[MAIN_TRACK_INDEX];
  if (!main || main.hidden) return [];
  const items = main.items
    .filter((item) => item.kind === "video" || item.kind === "card")
    .sort((a, b) => a.start - b.start);
  const parts: TunnelTitlePart[] = [];
  for (const item of items) {
    const label = partLabel(item, project, parts.length);
    const previous = parts[parts.length - 1];
    if (previous?.label === label) {
      previous.end = Math.max(previous.end, itemEnd(item));
      continue;
    }
    if (previous) previous.end = item.start;
    parts.push({ label, start: item.start, end: itemEnd(item) });
  }
  return parts.filter((part) => part.end - part.start > POST_TIME_EPSILON);
}

/** The opening's words, or null when the post has no visible tunnel. */
export function tunnelTitlesPlanOf(
  project: PostProject
): TunnelTitlesPlan | null {
  for (const track of project.tracks) {
    if (track.hidden) continue;
    for (const item of track.items) {
      if (item.kind !== "animation" || !item.tunnelHook) continue;
      const titles = item.tunnelHook.titles ?? DEFAULT_TUNNEL_TITLES;
      const spoken = titles.spoken?.trim();
      const intro = item.tunnelHook.seconds;
      const seconds = Math.min(intro ?? item.duration, item.duration);
      const parts = titles.structure ? tunnelTitleParts(project) : [];
      const shown = parts.length >= 2 ? parts : [];
      // The line needs a box to sit on, which only an intro settles into.
      const first = shown[0];
      const divider =
        first && intro !== undefined && first.end > item.start + seconds
          ? (() => {
              const fadeOutEnd =
                first.end +
                Math.min(
                  DIVIDER_MAX_FADE_SECONDS,
                  Math.max(DIVIDER_MIN_FADE_SECONDS, itemEnd(item) - first.end)
                );
              return { box: item.box, fadeOutStart: first.end, fadeOutEnd };
            })()
          : null;
      if (!titles.name && !shown.length) return null;
      return {
        itemId: item.id,
        start: item.start,
        seconds,
        name: titles.name,
        ...(titles.name && spoken ? { spoken } : {}),
        parts: shown,
        divider,
        end: divider?.fadeOutEnd ?? item.start + seconds * MOVE_END_SHARE,
      };
    }
  }
  return null;
}

type EasingSampler = (
  easing: [number, number, number, number],
  t: number
) => number;

/** Shares of the tunnel's hold each word comes in and leaves across. */
const NAME_IN: Window = [0, 0.12];
const SPOKEN_IN: Window = [0.05, 0.17];
const PARTS_IN: Window = [0.1, 0.22];
const NAME_OUT: Window = [MOVE_START_SHARE, MOVE_START_SHARE + 0.2];
const SPOKEN_OUT: Window = [MOVE_START_SHARE + 0.03, MOVE_START_SHARE + 0.23];
const PARTS_OUT: Window = [MOVE_START_SHARE, MOVE_START_SHARE + 0.18];
const DIVIDER_IN: Window = [MOVE_END_SHARE, 1];
type Window = readonly [number, number];

/** How far, as a share of the frame's height, a word rises as it arrives and leaves. */
export const TUNNEL_TITLE_RISE = { in: 0.012, out: 0.03 } as const;

export interface TunnelWordLook {
  opacity: number;
  /** Share of the frame's height to draw it higher than its place. */
  rise: number;
}

export interface TunnelTitlesLook {
  name: TunnelWordLook;
  spoken: TunnelWordLook;
  parts: TunnelWordLook;
  divider: number;
  /** How full each part is, 0 to 1. */
  fills: number[];
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function across(progress: number, [from, to]: Window): number {
  return clamp01((progress - from) / (to - from));
}

function word(
  progress: number,
  arrive: Window,
  leave: Window,
  sample: EasingSampler,
  leaveDirection: 1 | -1 = 1
): TunnelWordLook {
  const inShare = sample(LIFT_EASING, across(progress, arrive));
  const outShare = sample(LIFT_EASING, across(progress, leave));
  return {
    opacity: clamp01(inShare * (1 - outShare)),
    rise:
      -TUNNEL_TITLE_RISE.in * (1 - inShare) +
      leaveDirection * TUNNEL_TITLE_RISE.out * outShare,
  };
}

/** The opening's words at post `seconds`. `sample` is the keyframe easing sampler. */
export function tunnelTitlesLook(
  plan: TunnelTitlesPlan,
  seconds: number,
  sample: EasingSampler
): TunnelTitlesLook {
  const progress = (seconds - plan.start) / plan.seconds;
  const divider = plan.divider
    ? clamp01(sample(LIFT_EASING, across(progress, DIVIDER_IN))) *
      (1 -
        clamp01(
          sample(
            LIFT_EASING,
            (seconds - plan.divider.fadeOutStart) /
              (plan.divider.fadeOutEnd - plan.divider.fadeOutStart)
          )
        ))
    : 0;
  return {
    name: plan.name
      ? word(progress, NAME_IN, NAME_OUT, sample)
      : { opacity: 0, rise: 0 },
    spoken: plan.spoken
      ? word(progress, SPOKEN_IN, SPOKEN_OUT, sample)
      : { opacity: 0, rise: 0 },
    // The parts make way downward as the tunnel comes down onto them.
    parts: plan.parts.length
      ? word(progress, PARTS_IN, PARTS_OUT, sample, -1)
      : { opacity: 0, rise: 0 },
    divider,
    fills: plan.parts.map((part) =>
      clamp01((seconds - part.start) / (part.end - part.start))
    ),
  };
}
