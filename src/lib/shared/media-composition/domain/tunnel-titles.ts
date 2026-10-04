import {
  itemEnd,
  type PostProject,
  type PostTitlesItem,
} from "$lib/shared/media-composition/domain/post-project";
import {
  LIFT_EASING,
  MOVE_START_SHARE,
} from "$lib/shared/media-composition/domain/tunnel-hook";

/**
 * A titles clip: the sequence's name in its glyphs, with how to say it under
 * the name. The words come in as the clip starts and lift away as it ends.
 * Over the opening tunnel the clip ends partway into the tunnel's move, so the
 * words make way for it.
 */

export interface TunnelTitlesPlan {
  /** The titles clip. */
  itemId: string;
  /** The role its painted layer draws under. */
  role: string;
  /** Post seconds the clip starts. */
  start: number;
  /** Post seconds the clip ends. */
  end: number;
  spoken?: string;
}

/** Painted layers of titles clips carry this prefix and the clip's id. */
export const TITLES_ROLE_PREFIX = "titles:";

export function titlesRole(itemId: string): string {
  return `${TITLES_ROLE_PREFIX}${itemId}`;
}

export function itemIdFromTitlesRole(role: string): string | null {
  return role.startsWith(TITLES_ROLE_PREFIX)
    ? role.slice(TITLES_ROLE_PREFIX.length)
    : null;
}

/** What a titles clip draws. */
export function titlesPlanOf(item: PostTitlesItem): TunnelTitlesPlan {
  const spoken = item.spoken?.trim();
  return {
    itemId: item.id,
    role: titlesRole(item.id),
    start: item.start,
    end: itemEnd(item),
    ...(spoken ? { spoken } : {}),
  };
}

/** Seconds the name takes to arrive, and how long the line under it lags. */
const ARRIVE_SECONDS = 0.6;
const SPOKEN_LAG_SECONDS = 0.25;
/** Seconds the words take to lift away, the line leaving a little after the name. */
const LEAVE_SECONDS = 1;
const SPOKEN_TRAIL_SECONDS = 0.15;
/** Below this length a clip squeezes its arrival and leaving to fit. */
const FULL_MOTION_SECONDS = ARRIVE_SECONDS + LEAVE_SECONDS + 0.5;

/**
 * Share of the opening tunnel a titles clip over it spans: the words start to
 * lift as the tunnel starts to leave the frame and are gone partway into its
 * move, before it settles into its box.
 */
export const OPENING_TITLES_SHARE = MOVE_START_SHARE + 0.23;

/**
 * Where a titles clip for the post's opening tunnel goes, or null when the
 * post has none: from the tunnel's start for its share of the intro.
 */
export function openingTitlesSpan(
  project: PostProject
): { start: number; duration: number } | null {
  for (const track of project.tracks) {
    for (const item of track.items) {
      if (item.kind !== "animation" || !item.tunnelHook) continue;
      const intro = Math.min(
        item.tunnelHook.seconds ?? item.duration,
        item.duration
      );
      return { start: item.start, duration: intro * OPENING_TITLES_SHARE };
    }
  }
  return null;
}

type EasingSampler = (
  easing: [number, number, number, number],
  t: number
) => number;

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
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function across(seconds: number, [from, to]: Window): number {
  if (to <= from) return seconds >= to ? 1 : 0;
  return clamp01((seconds - from) / (to - from));
}

function word(
  seconds: number,
  arrive: Window,
  leave: Window,
  sample: EasingSampler
): TunnelWordLook {
  const inShare = sample(LIFT_EASING, across(seconds, arrive));
  const outShare = sample(LIFT_EASING, across(seconds, leave));
  return {
    opacity: clamp01(inShare * (1 - outShare)),
    rise:
      -TUNNEL_TITLE_RISE.in * (1 - inShare) + TUNNEL_TITLE_RISE.out * outShare,
  };
}

/** The clip's words at post `seconds`. `sample` is the keyframe easing sampler. */
export function tunnelTitlesLook(
  plan: TunnelTitlesPlan,
  seconds: number,
  sample: EasingSampler
): TunnelTitlesLook {
  const { start, end } = plan;
  const fit = Math.min(1, (end - start) / FULL_MOTION_SECONDS);
  const arrive = ARRIVE_SECONDS * fit;
  const lag = SPOKEN_LAG_SECONDS * fit;
  const leave = LEAVE_SECONDS * fit;
  const trail = SPOKEN_TRAIL_SECONDS * fit;
  return {
    name: word(
      seconds,
      [start, start + arrive],
      [end - trail - leave, end - trail],
      sample
    ),
    spoken: plan.spoken
      ? word(
          seconds,
          [start + lag, start + lag + arrive],
          [end - leave, end],
          sample
        )
      : { opacity: 0, rise: 0 },
  };
}
