import type {
  ItemFork,
  ItemForkSpan,
  ItemPart,
} from "@austencloud/video-editor";
import {
  POST_TIME_EPSILON,
  type PostItem,
} from "@austencloud/video-editor/core";
import { faFan } from "@austencloud/video-editor/icons";
import {
  POST_SPLIT_MAX_MOVE_SECONDS,
  POST_SPLIT_MAX_SECONDS,
  POST_SPLIT_MIN_MOVE_SECONDS,
  POST_SPLIT_MIN_SECONDS,
} from "#lib/shared/media-composition/domain/post-animation-split.js";

/**
 * Where an animation's opening tunnel hands over to the rest of it: the span
 * is the tunnel's own extent. It can run past the end of an animation trimmed
 * inside its tunnel, where a press on the frame still selects the tunnel, as
 * today. The timeline draws the part only when it ends inside the block.
 */
function tunnelEndOf(item: PostItem): number | null {
  if (item.kind !== "animation" || item.tunnelHook?.seconds === undefined)
    return null;
  const introEnd = item.start + item.tunnelHook.seconds;
  return introEnd > item.start + POST_TIME_EPSILON ? introEnd : null;
}

/**
 * An animation's opening tunnel, folded into the animation's start. The
 * timeline draws it as its own block joined to the rest, and it selects, and
 * takes a look of its own, apart from the animation.
 */
export const TUNNEL_PART: ItemPart = {
  id: "tunnel",
  span(item) {
    const end = tunnelEndOf(item);
    return end === null ? null : { start: item.start, end };
  },
  label: (t) => t("post_timeline_tunnel"),
  icon: faFan,
};

/** A split time on the clip's own clock, kept to what the schema takes. */
function splitTime(post: number, clipStart: number): number {
  const seconds = Math.round((post - clipStart) * 10_000) / 10_000;
  return Math.min(
    POST_SPLIT_MAX_SECONDS,
    Math.max(POST_SPLIT_MIN_SECONDS, seconds)
  );
}

function splitMove(seconds: number): number {
  const rounded = Math.round(seconds * 10_000) / 10_000;
  return Math.min(
    POST_SPLIT_MAX_MOVE_SECONDS,
    Math.max(POST_SPLIT_MIN_MOVE_SECONDS, rounded)
  );
}

/**
 * An animation's split hands, as the timeline's fork: the block parts into
 * two where the hands part and comes back where they rejoin. Split times
 * are the clip's content time, so the fork is that plus the clip's start.
 * A clip that draws one hand ignores its split, and shows no fork. Dragging
 * keeps the split's look and writes the closing length out, so moving the
 * opening never changes how long the closing takes.
 */
export const SPLIT_FORK: ItemFork = {
  id: "split",
  tool: "hands",
  label: (t) => t("post_editor_tool_split_hands"),
  span(item): ItemForkSpan | null {
    if (item.kind !== "animation" || !item.split || item.part?.hand)
      return null;
    const { openAt, openSeconds, closeAt, closeSeconds } = item.split;
    const openStart = item.start + openAt;
    if (closeAt === undefined)
      return {
        openStart,
        openEnd: openStart + openSeconds,
        closeStart: null,
        closeEnd: null,
      };
    const closeStart = item.start + closeAt;
    return {
      openStart,
      openEnd: openStart + openSeconds,
      closeStart,
      closeEnd: closeStart + (closeSeconds ?? openSeconds),
    };
  },
  edit(item, span) {
    if (item.kind !== "animation" || !item.split) return null;
    const next = {
      ...item.split,
      openAt: splitTime(span.openStart, item.start),
      openSeconds: splitMove(span.openEnd - span.openStart),
    };
    if (
      item.split.closeAt !== undefined &&
      span.closeStart !== null &&
      span.closeEnd !== null
    ) {
      next.closeAt = splitTime(span.closeStart, item.start);
      next.closeSeconds = splitMove(span.closeEnd - span.closeStart);
    }
    return { split: next };
  },
};
