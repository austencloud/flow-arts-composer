import type { PostProject } from "$lib/shared/media-composition/domain/post-project";
import {
  DEFAULT_TUNNEL_TITLES,
  LIFT_EASING,
  MOVE_END_SHARE,
  MOVE_START_SHARE,
} from "$lib/shared/media-composition/domain/tunnel-hook";

/**
 * The words around the opening tunnel. While the tunnel holds the frame the
 * sequence's name sits above it, with how to say it under the name. As the
 * tunnel moves into its box the words lift away.
 */

export interface TunnelTitlesPlan {
  /** The animation item that opens with the tunnel. */
  itemId: string;
  /** Post seconds the tunnel starts. */
  start: number;
  /** Seconds the tunnel holds before the animation takes over. */
  seconds: number;
  spoken?: string;
  /** Post seconds the last of the words has gone. */
  end: number;
}

/** The painted layer with the words around the opening tunnel. */
export const TUNNEL_TITLES_ROLE = "tunnel-titles";

/** The opening's words, or null when the post has no visible tunnel or no name. */
export function tunnelTitlesPlanOf(
  project: PostProject
): TunnelTitlesPlan | null {
  for (const track of project.tracks) {
    if (track.hidden) continue;
    for (const item of track.items) {
      if (item.kind !== "animation" || !item.tunnelHook) continue;
      const titles = item.tunnelHook.titles ?? DEFAULT_TUNNEL_TITLES;
      if (!titles.name) return null;
      const spoken = titles.spoken?.trim();
      const seconds = Math.min(
        item.tunnelHook.seconds ?? item.duration,
        item.duration
      );
      return {
        itemId: item.id,
        start: item.start,
        seconds,
        ...(spoken ? { spoken } : {}),
        end: item.start + seconds * MOVE_END_SHARE,
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
const NAME_OUT: Window = [MOVE_START_SHARE, MOVE_START_SHARE + 0.2];
const SPOKEN_OUT: Window = [MOVE_START_SHARE + 0.03, MOVE_START_SHARE + 0.23];
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

function across(progress: number, [from, to]: Window): number {
  return clamp01((progress - from) / (to - from));
}

function word(
  progress: number,
  arrive: Window,
  leave: Window,
  sample: EasingSampler
): TunnelWordLook {
  const inShare = sample(LIFT_EASING, across(progress, arrive));
  const outShare = sample(LIFT_EASING, across(progress, leave));
  return {
    opacity: clamp01(inShare * (1 - outShare)),
    rise:
      -TUNNEL_TITLE_RISE.in * (1 - inShare) + TUNNEL_TITLE_RISE.out * outShare,
  };
}

/** The opening's words at post `seconds`. `sample` is the keyframe easing sampler. */
export function tunnelTitlesLook(
  plan: TunnelTitlesPlan,
  seconds: number,
  sample: EasingSampler
): TunnelTitlesLook {
  const progress = (seconds - plan.start) / plan.seconds;
  return {
    name: word(progress, NAME_IN, NAME_OUT, sample),
    spoken: plan.spoken
      ? word(progress, SPOKEN_IN, SPOKEN_OUT, sample)
      : { opacity: 0, rise: 0 },
  };
}
