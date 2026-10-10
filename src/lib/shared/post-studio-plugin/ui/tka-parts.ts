import type { ItemPart } from "@austencloud/video-editor";
import {
  POST_TIME_EPSILON,
  itemEnd,
  type PostItem,
} from "@austencloud/video-editor/core";
import { faFan } from "@austencloud/video-editor/icons";

/** Where an animation's opening tunnel hands over to the rest of it, if inside it. */
function tunnelEndOf(item: PostItem, end: number): number | null {
  if (item.kind !== "animation" || item.tunnelHook?.seconds === undefined)
    return null;
  const introEnd = item.start + item.tunnelHook.seconds;
  return introEnd > item.start + POST_TIME_EPSILON &&
    introEnd < end - POST_TIME_EPSILON
    ? introEnd
    : null;
}

/**
 * An animation's opening tunnel, folded into the animation's start. The
 * timeline draws it as its own block joined to the rest, and it selects, and
 * takes a look of its own, apart from the animation.
 */
export const TUNNEL_PART: ItemPart = {
  id: "tunnel",
  span(item) {
    const end = tunnelEndOf(item, itemEnd(item));
    return end === null ? null : { start: item.start, end };
  },
  label: (t) => t("post_timeline_tunnel"),
  icon: faFan,
};
