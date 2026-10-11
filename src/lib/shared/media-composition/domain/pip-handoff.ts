import {
  POST_TIME_EPSILON,
  itemEnd,
  type PipHandoffSpan,
  type PostProject,
} from "@austencloud/video-editor/core";
import type {
  PostAnimationItem,
  PostMovesItem,
} from "#lib/shared/post-studio-plugin/index.js";

/**
 * An animation that ends over a picture-in-picture square shrinks into it
 * instead of fading out under it. Across their overlap both layers ride one
 * box, from the animation's into the square's, on the opening move's curve,
 * and the upper one dissolves into the lower. Both read one clock, so one
 * figure is drawn while its look changes: the animation finishes its pass
 * and lands on the opening pose, and the square carries on from there at the
 * slower take's pace.
 */
export interface PipHandoff extends PipHandoffSpan {
  animation: PostAnimationItem;
  moves: PostMovesItem;
}

/** The first animation whose end a picture-in-picture square overlaps. */
export function pipHandoffOf(project: PostProject): PipHandoff | null {
  const visible = project.tracks.flatMap((track, trackIndex) =>
    track.hidden ? [] : track.items.map((item) => ({ item, trackIndex }))
  );
  for (const { item: animation, trackIndex: animationTrack } of visible) {
    if (animation.kind !== "animation") continue;
    const end = itemEnd(animation);
    for (const { item: moves, trackIndex: movesTrack } of visible) {
      if (
        moves.kind === "moves" &&
        moves.animationAppearance &&
        moves.start > animation.start + POST_TIME_EPSILON &&
        moves.start < end - POST_TIME_EPSILON &&
        itemEnd(moves) > end + POST_TIME_EPSILON
      ) {
        return {
          animation,
          moves,
          movesOnTop: movesTrack >= animationTrack,
          start: moves.start,
          end,
          shared: sharesSurface(animation, moves),
        };
      }
    }
  }
  return null;
}

function sharesSurface(
  animation: PostAnimationItem,
  moves: PostMovesItem
): boolean {
  const from = animation.animationAppearance;
  const to = moves.animationAppearance;
  return (
    !!from &&
    !!to &&
    moves.mode !== "mandala" &&
    from.propType === to.propType &&
    from.propLook === to.propLook
  );
}
