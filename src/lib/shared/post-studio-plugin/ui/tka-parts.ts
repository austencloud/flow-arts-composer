import type { ItemPart } from "@austencloud/video-editor";
import {
  POST_TIME_EPSILON,
  type PostItem,
} from "@austencloud/video-editor/core";
import { faFan } from "@austencloud/video-editor/icons";

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
