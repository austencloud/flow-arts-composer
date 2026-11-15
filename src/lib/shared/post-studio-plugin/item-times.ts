import type { PostItem } from "@austencloud/video-editor/core";
import {
  POST_SPLIT_MIN_SECONDS,
  PostAnimationSplitSchema,
  normalizeAnimationSplit,
  type PostAnimationSplit,
} from "#lib/shared/media-composition/domain/post-animation-split.js";
import {
  POST_LIFT_MIN_SECONDS,
  PostPanelLiftSchema,
  normalizePanelLift,
  panelLiftSpan,
  type PostPanelLift,
} from "#lib/shared/media-composition/domain/post-panel-lift.js";
import {
  CARD_EARLIEST_AT_SECONDS,
  PostCardQrExitSchema,
  PostCardRingSchema,
} from "./card-ending";
import { PostTitlesLitSchema, type PostTitlesLit } from "./item-kinds";

/**
 * tka's own times on an item follow its start when the start moves against
 * the item's content: a start trim, or the second piece of a cut. The core
 * calls this through `EditHooks.shiftItemTimes` with `headCut`, the seconds
 * the start moved later (negative when a start trim opens the head).
 *
 * Every time here counts seconds from the item's start, so each becomes
 * `t - headCut` and still names the same moment of the post:
 *
 * - an animation's split (`openAt`, `closeAt`); a split that has closed
 *   before the new start is removed, and one whose opening is cut away keeps
 *   an opening time before 0, so the hands are already apart at the start;
 * - an animation's lifted panel (`inAt`, `outAt`); a lift that had gone
 *   all the way back before the new start is removed, and one whose arrival
 *   is cut away keeps an `inAt` before 0, so it is already in at the start;
 * - a titles clip's `lit` and `quiet` spans; a span cut partly away keeps
 *   its remainder from 0, one cut wholly away is removed;
 * - a card's `ring.at` and `qrExit.at`, which may fall before 0: the ring or
 *   the QR's flight is already under way when the clip starts.
 *
 * Each result passes its field's own schema; one that fails is dropped, so
 * nothing invalid is stored. With nothing to shift, the same item comes back.
 */
export function shiftTkaItemTimes(item: PostItem, headCut: number): PostItem {
  if (!Number.isFinite(headCut) || headCut === 0) return item;
  if (item.kind === "animation" && (item.split || item.panelLift)) {
    let next: PostItem = item;
    if (item.split)
      next = withField(next, "split", shiftSplit(item.split, headCut));
    if (item.panelLift)
      next = withField(
        next,
        "panelLift",
        shiftPanelLift(item.panelLift, headCut)
      );
    return next;
  }
  if (item.kind === "titles" && (item.lit || item.quiet)) {
    let next: PostItem = item;
    if (item.lit) next = withField(next, "lit", shiftSpan(item.lit, headCut));
    if (item.quiet)
      next = withField(next, "quiet", shiftSpan(item.quiet, headCut));
    return next;
  }
  if (item.kind === "card" && (item.ring || item.qrExit)) {
    let next: PostItem = item;
    if (item.ring) {
      const parsed = PostCardRingSchema.safeParse({
        ...item.ring,
        at: shiftStart(item.ring.at, headCut, CARD_EARLIEST_AT_SECONDS),
      });
      next = withField(next, "ring", parsed.success ? parsed.data : undefined);
    }
    if (item.qrExit) {
      const parsed = PostCardQrExitSchema.safeParse({
        ...item.qrExit,
        at: shiftStart(item.qrExit.at, headCut, CARD_EARLIEST_AT_SECONDS),
      });
      next = withField(
        next,
        "qrExit",
        parsed.success ? parsed.data : undefined
      );
    }
    return next;
  }
  return item;
}

/** A start that may fall before the clip, kept no earlier than its floor. */
function shiftStart(at: number, headCut: number, floor: number): number {
  return Math.max(floor, at - headCut);
}

/** A span's remainder after the shift, from 0 at the earliest; undefined when none is left. */
export function shiftSpan(
  span: PostTitlesLit,
  headCut: number
): PostTitlesLit | undefined {
  const to = span.to - headCut;
  if (!(to > 0)) return undefined;
  const parsed = PostTitlesLitSchema.safeParse({
    from: Math.max(0, span.from - headCut),
    to,
  });
  return parsed.success ? parsed.data : undefined;
}

/** A split after the shift; undefined when it closed before the new start. */
export function shiftSplit(
  split: PostAnimationSplit,
  headCut: number
): PostAnimationSplit | undefined {
  if (split.closeAt !== undefined) {
    const closeEnd =
      split.closeAt + (split.closeSeconds ?? split.openSeconds) - headCut;
    if (!(closeEnd > 0)) return undefined;
  }
  const next: PostAnimationSplit = {
    ...split,
    openAt: shiftStart(split.openAt, headCut, POST_SPLIT_MIN_SECONDS),
  };
  if (split.closeAt !== undefined)
    next.closeAt = shiftStart(split.closeAt, headCut, POST_SPLIT_MIN_SECONDS);
  const parsed = PostAnimationSplitSchema.safeParse(next);
  return parsed.success ? normalizeAnimationSplit(parsed.data) : undefined;
}

/** The item with `key` set to `value`, or without it when `value` is undefined. */
function withField(item: PostItem, key: string, value: unknown): PostItem {
  const next = { ...item } as Record<string, unknown>;
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next as unknown as PostItem;
}

/**
 * A lifted panel after the shift; undefined when it had gone all the way
 * back before the new start. A lift without times (in for the whole clip)
 * has nothing to shift and comes back as it was.
 */
export function shiftPanelLift(
  lift: PostPanelLift,
  headCut: number
): PostPanelLift | undefined {
  if (lift.inAt === undefined && lift.outAt === undefined) return lift;
  if (lift.outAt !== undefined && !(panelLiftSpan(lift).outEnd - headCut > 0))
    return undefined;
  const next: PostPanelLift = { ...lift };
  if (lift.inAt !== undefined)
    next.inAt = shiftStart(lift.inAt, headCut, POST_LIFT_MIN_SECONDS);
  if (lift.outAt !== undefined)
    next.outAt = shiftStart(lift.outAt, headCut, POST_LIFT_MIN_SECONDS);
  const parsed = PostPanelLiftSchema.safeParse(next);
  return parsed.success ? normalizePanelLift(parsed.data) : undefined;
}
