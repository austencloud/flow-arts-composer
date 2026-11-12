import type { PostProject } from "@austencloud/video-editor/core";
import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { DEFAULT_VIEWER_CUSTOM_COLORS } from "#lib/shared/sequence-viewer/domain/viewer-custom-colors.js";
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

/**
 * The prop a post's animation draws, when one is picked for it: the tunnel's
 * clip first, then any animation clip. Undefined when no clip picks one.
 */
export function postAnimationPropType(
  project: PostProject
): PropType | undefined {
  const clips = project.tracks.flatMap((track) =>
    track.items.filter(
      (item): item is PostAnimationItem => item.kind === "animation"
    )
  );
  const picked = (clip: PostAnimationItem) =>
    clip.animationAppearance?.propType;
  const tunnelClip = clips.find(
    (clip) => clip.followers?.length && picked(clip)
  );
  const clip = tunnelClip ?? clips.find((each) => picked(each));
  return clip ? picked(clip) : undefined;
}

/**
 * The front performer of a tunnel is always the red and blue pair, whatever
 * colors the viewer picked for their own props, so a tunnel reads the same
 * way everywhere: red and blue in front, the tunnel's spectrum behind.
 */
export const FRONT_PROP_COLORS: { left: string; right: string } = {
  ...DEFAULT_VIEWER_CUSTOM_COLORS,
};

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

export type PostCastPart = NonNullable<PostAnimationItem["part"]>;

/** Which of one performer's two props draw. */
export interface HandsShown {
  left: boolean;
  right: boolean;
}

/** What a clip drawing only part of a tunnel's cast draws. */
export interface CastPartDraw {
  /**
   * Whose props the canvas's own pair draws: 0 the front, k the k-th
   * performer (follower k - 1), null nobody.
   */
  primary: number | null;
  primaryHands: HandsShown;
  /** Hands of each follower layer to pass; empty when no layer is passed. */
  followers: HandsShown[];
}

/**
 * Turns a clip's `part` into what it draws. The engine only draws a layer's
 * hand while the canvas's own prop on that side is there, so a single
 * performer always draws as the canvas's own pair, a follower included, and
 * no layers are passed. Only a part naming no performer passes the followers'
 * layers, every one of them, so each keeps the colour of its place. No part
 * draws everyone, exactly as before `part` existed.
 */
export function castPartDraw(
  part: PostCastPart | null | undefined,
  followerCount: number
): CastPartDraw {
  const hands: HandsShown = {
    left: part?.hand !== "right",
    right: part?.hand !== "left",
  };
  const performer = part?.performer;
  if (performer === undefined) {
    return {
      primary: 0,
      primaryHands: hands,
      followers: Array.from({ length: followerCount }, () => ({ ...hands })),
    };
  }
  return {
    primary: performer <= followerCount ? performer : null,
    primaryHands: hands,
    followers: [],
  };
}
