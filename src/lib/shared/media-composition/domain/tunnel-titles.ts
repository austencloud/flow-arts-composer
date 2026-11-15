import {
  itemEnd,
  POST_MIN_BOX_SIZE,
  postSecondsOfKeyframe,
  sampleEasing,
  type PostEasing,
  type PostProject,
  LIFT_EASING,
  OPENING_TITLES_SHARE,
  TUNNEL_TITLE_RISE,
  titlesRole,
  type TunnelTitlesLook,
  type TunnelWordLook,
} from "@austencloud/video-editor/core";
import type {
  PostTitlesEnter,
  PostTitlesItem,
  PostTitlesLeave,
} from "#lib/shared/post-studio-plugin/index.js";
import { TITLES_QUIET_FADE_SECONDS } from "#lib/shared/post-studio-plugin/card-ending.js";

/**
 * A titles clip: the sequence's name in its glyphs, with how to say it under
 * the name. The words come in as the clip starts and lift away as it ends.
 * Over the opening tunnel the clip ends partway into the tunnel's move, so the
 * words make way for it. A clip can also hold its words to its last frame, or
 * show them from its first, for a title that stays on screen.
 */

/**
 * Where the words sit in the clip's box. `tunnel` is the opening's layout:
 * the name above the tunnel's ring and the spoken line below it. `pair` is
 * one element that fills the box, the spoken line right under the name, so
 * box keyframes move and scale the two together.
 */
export type TitlesLayoutMode = "tunnel" | "pair";

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
  layout: TitlesLayoutMode;
  enter: PostTitlesEnter;
  leave: PostTitlesLeave;
  /** Post seconds over which one letter is lit; absent when none is. */
  lit?: { from: number; to: number };
  /** Post seconds over which the spoken line is hidden; absent when it never is. */
  quiet?: { from: number; to: number };
  /**
   * The spoken line's size against the name, when it is not
   * `TITLES_SPOKEN_SIZE` all through; see `titlesSpokenSizeAt`.
   */
  spokenSize?: number;
  /**
   * The spoken line's size at each box key, in post seconds, easing as the
   * box does; present only when the size changes with the box.
   */
  spokenSizes?: TitlesSpokenSizeKey[];
}

/** The spoken line's size at one box key. */
export interface TitlesSpokenSizeKey {
  seconds: number;
  size: number;
  easing: PostEasing;
}

/**
 * The spoken line's size against the name at each of a titles clip's box
 * keys: `spokenSize` at its tallest box, `spokenSizeSmall` at its shortest,
 * and in between by the box's height. Null when the size never changes.
 */
function spokenSizeKeys(item: PostTitlesItem): TitlesSpokenSizeKey[] | null {
  const keys = item.keyframes?.box;
  const large = item.spokenSize ?? TITLES_SPOKEN_SIZE;
  const small = item.spokenSizeSmall ?? large;
  if (!keys || keys.length < 2 || small === large) return null;
  // Heights as the box draws them: never under the smallest a box may be.
  const heights = keys.map((key) =>
    Math.min(1, Math.max(POST_MIN_BOX_SIZE, key.value.height))
  );
  const tallest = Math.max(...heights);
  const shortest = Math.min(...heights);
  if (tallest - shortest < 1e-6) return null;
  return keys.map((key, index) => ({
    seconds: postSecondsOfKeyframe(item, key.t),
    size:
      large +
      ((small - large) * (tallest - heights[index]!)) / (tallest - shortest),
    easing: key.easing,
  }));
}

/** What a titles clip draws. */
export function titlesPlanOf(item: PostTitlesItem): TunnelTitlesPlan {
  const spoken = item.spoken?.trim();
  const spokenSizes = spokenSizeKeys(item);
  const spokenSize = item.spokenSize ?? TITLES_SPOKEN_SIZE;
  return {
    itemId: item.id,
    role: titlesRole(item.id),
    start: item.start,
    end: itemEnd(item),
    ...(spoken ? { spoken } : {}),
    // A clip whose box moves is the pair; one without keeps the opening's look.
    layout: item.keyframes?.box?.length ? "pair" : "tunnel",
    enter: item.enter ?? "rise",
    leave: item.leave ?? "lift",
    ...(item.lit
      ? {
          lit: {
            from: item.start + item.lit.from,
            to: item.start + item.lit.to,
          },
        }
      : {}),
    ...(item.quiet
      ? {
          quiet: {
            from: item.start + item.quiet.from,
            to: item.start + item.quiet.to,
          },
        }
      : {}),
    // Left out at the default, so older posts compile as they did.
    ...(spokenSizes
      ? { spokenSizes }
      : spokenSize !== TITLES_SPOKEN_SIZE
        ? { spokenSize }
        : {}),
  };
}

/**
 * The spoken line's size against the name at post `seconds`. Where it
 * changes with the box it moves between the box keys' sizes on the box's own
 * easing, so the line grows or shrinks exactly as the box does: before the
 * first key it holds the first, after the last the last.
 */
export function titlesSpokenSizeAt(
  plan: Pick<TunnelTitlesPlan, "spokenSize" | "spokenSizes">,
  seconds: number
): number {
  const keys = plan.spokenSizes;
  if (!keys?.length) return plan.spokenSize ?? TITLES_SPOKEN_SIZE;
  if (seconds <= keys[0]!.seconds) return keys[0]!.size;
  for (let index = 1; index < keys.length; index++) {
    const next = keys[index]!;
    if (seconds >= next.seconds) continue;
    const previous = keys[index - 1]!;
    if (previous.easing === "hold") return previous.size;
    const span = next.seconds - previous.seconds;
    const p = span > 0 ? (seconds - previous.seconds) / span : 1;
    return (
      previous.size +
      (next.size - previous.size) * sampleEasing(previous.easing, p)
    );
  }
  return keys[keys.length - 1]!.size;
}

/**
 * How much of the spoken line shows at post `seconds`: all of it, except
 * through the plan's quiet span, which it fades out of from the span's start
 * and back into after its end.
 */
export function titlesSpokenShown(
  plan: Pick<TunnelTitlesPlan, "quiet">,
  seconds: number
): number {
  const quiet = plan.quiet;
  if (!quiet) return 1;
  const share = (value: number) => {
    const t = clamp01(value / TITLES_QUIET_FADE_SECONDS);
    return t * t * (3 - 2 * t);
  };
  const out = share(seconds - quiet.from);
  const back = share(seconds - quiet.to);
  return clamp01(1 - out + back);
}

/** Seconds the name takes to arrive, and how long the line under it lags. */
const ARRIVE_SECONDS = 0.6;
const SPOKEN_LAG_SECONDS = 0.25;
/** Seconds the words take to lift away, the line leaving a little after the name. */
const LEAVE_SECONDS = 1;
const SPOKEN_TRAIL_SECONDS = 0.15;
/** Time the words hold between arriving and leaving before a clip counts as short. */
const MIN_HOLD_SECONDS = 0.5;

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

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function across(seconds: number, [from, to]: Window): number {
  if (to <= from) return seconds >= to ? 1 : 0;
  return clamp01((seconds - from) / (to - from));
}

function word(
  seconds: number,
  arrive: Window | null,
  leave: Window | null,
  sample: EasingSampler
): TunnelWordLook {
  const inShare = arrive ? sample(LIFT_EASING, across(seconds, arrive)) : 1;
  const outShare = leave ? sample(LIFT_EASING, across(seconds, leave)) : 0;
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
  const rises = plan.enter !== "none";
  const lifts = plan.leave !== "stay";
  const fullMotion =
    (rises ? ARRIVE_SECONDS : 0) +
    (lifts ? LEAVE_SECONDS : 0) +
    MIN_HOLD_SECONDS;
  const fit = Math.min(1, (end - start) / fullMotion);
  const arrive = ARRIVE_SECONDS * fit;
  const lag = SPOKEN_LAG_SECONDS * fit;
  const leave = LEAVE_SECONDS * fit;
  const trail = SPOKEN_TRAIL_SECONDS * fit;
  return {
    name: word(
      seconds,
      rises ? [start, start + arrive] : null,
      lifts ? [end - trail - leave, end - trail] : null,
      sample
    ),
    spoken: plan.spoken
      ? word(
          seconds,
          rises ? [start + lag, start + lag + arrive] : null,
          lifts ? [end - leave, end] : null,
          sample
        )
      : { opacity: 0, rise: 0 },
  };
}

/** A box on the canvas, in pixels. */
export interface TitlesRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where the name and the spoken line draw inside a titles clip's box. */
export interface TitlesLayout {
  /** The name's letters, in pixels tall. */
  glyphHeight: number;
  /** The middle of the name's letters. */
  nameCenterY: number;
  /** The spoken line's font size. */
  spokenPx: number;
  /** The middle of the spoken line. */
  spokenCenterY: number;
  /** Widest the spoken line draws. */
  spokenMaxWidth: number;
  /** Pixels a rise of the whole frame's height moves the words. */
  risePx: number;
}

/** Share of the frame's short side the tunnel's ring covers while it holds the frame. */
const TUNNEL_EXTENT = 0.62;
/** The name's letters, as a share of the frame's height, at most. */
export const TITLES_NAME_HEIGHT = 0.055;
/** The share of the band above the tunnel the name may take. */
const NAME_BAND_SHARE = 0.3;
/** "How to say it", relative to the name's letters. */
export const TITLES_SPOKEN_SIZE = 0.42;
/** The opening's spoken line may take this share of the box's width. */
const TUNNEL_SPOKEN_WIDTH = 0.9;
/** In the pair, the gap between the name and the spoken line, relative to the name. */
const PAIR_GAP = 0.18;
/** In the pair, the spoken line's height, relative to its font size. */
const PAIR_SPOKEN_LINE = 1.25;
/**
 * In the pair, the name's letters as a share of the box's height: the name,
 * the gap and a spoken line `spokenSize` of the name fill the box exactly.
 */
export function pairNameShare(spokenSize = TITLES_SPOKEN_SIZE): number {
  return 1 / (1 + PAIR_GAP + spokenSize * PAIR_SPOKEN_LINE);
}
/** The name's share of a pair's box at the default spoken size. */
export const PAIR_NAME_SHARE = pairNameShare();

/**
 * Where the words go in `rect`, the spoken line `spokenSize` of the name.
 * The opening's layout places them around the tunnel's ring; the pair fills
 * its box, the name on the box's top edge with the spoken line under it.
 */
export function titlesLayout(
  mode: TitlesLayoutMode,
  rect: TitlesRect,
  spokenSize = TITLES_SPOKEN_SIZE
): TitlesLayout {
  const { y, width, height } = rect;
  if (mode === "pair") {
    const glyphHeight = height * pairNameShare(spokenSize);
    const spokenPx = glyphHeight * spokenSize;
    return {
      glyphHeight,
      nameCenterY: y + glyphHeight / 2,
      spokenPx,
      spokenCenterY:
        y + glyphHeight * (1 + PAIR_GAP) + (spokenPx * PAIR_SPOKEN_LINE) / 2,
      spokenMaxWidth: width,
      // The rise keeps the size it has against the name in the opening.
      risePx: glyphHeight / TITLES_NAME_HEIGHT,
    };
  }
  const ring = (Math.min(width, height) * TUNNEL_EXTENT) / 2;
  // The ring sits in the middle, so the bands above and below it match.
  const above = Math.max(0, height / 2 - ring);
  // The name centred in the band above the tunnel, and how to say it
  // centred in the band below, as far from the ring as the name.
  const glyphHeight = Math.min(
    height * TITLES_NAME_HEIGHT,
    above * NAME_BAND_SHARE
  );
  return {
    glyphHeight,
    nameCenterY: y + above / 2,
    spokenPx: glyphHeight * spokenSize,
    spokenCenterY: y + height - above / 2,
    spokenMaxWidth: width * TUNNEL_SPOKEN_WIDTH,
    risePx: height,
  };
}
