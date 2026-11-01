import type { PostProject } from "@austencloud/video-editor/core";
import { tunnelPropColor } from "#lib/shared/sequence-viewer/tunnel/tunnel-prop-colors.js";
import type { PostAnimationItem } from "./item-kinds";

export type PostFollower = NonNullable<PostAnimationItem["followers"]>[number];

/**
 * The performers behind the front one on a tunnel post: the followers of its
 * first animation that has any. Empty for a post with one performer.
 */
export function postFollowers(project: PostProject): readonly PostFollower[] {
  for (const track of project.tracks) {
    for (const item of track.items) {
      if (item.kind === "animation" && item.followers?.length) {
        return item.followers;
      }
    }
  }
  return [];
}

/** A back performer's prop colors, the ones the tunnel draws them in. */
export function followerPropColors(
  index: number,
  count: number
): { left: string; right: string } {
  return {
    left: tunnelPropColor(2 + 2 * index, count).hex,
    right: tunnelPropColor(3 + 2 * index, count).hex,
  };
}

/** "Back", or "Back 2" once there is more than one. */
export function backPerformerName(index: number, count: number): string {
  return count > 1 ? `Back ${index + 1}` : "Back";
}
