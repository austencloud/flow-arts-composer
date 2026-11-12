import {
  POST_TIME_EPSILON,
  itemEnd,
  mainItems,
  timingVideoAt,
  type PostProject,
} from "@austencloud/video-editor/core";
// Types only: item-kinds imports compile-hooks by value, and this module stays
// light enough for the compiler side and the tests.
import type { PostAnimationItem, PostStage3D } from "./item-kinds";
import {
  staggeredFrames,
  type StaggeredFrames,
  type TkaSequenceFrame,
} from "./staggered-performers";

/**
 * The clock side of a 3D animation clip: where each performer is in the
 * sequence at a post time, and where the orbit camera is. Everything here is a
 * pure function of the project and the post time, so scrubbing, playing and
 * exporting a frame all land on the same pose and the same camera angle.
 */

/** One orbit turn takes this many beats of the clip's grid. */
export const STAGE_3D_BEATS_PER_TURN = 16;
/** A clip with no tapped grid under it turns once in this many seconds. */
export const STAGE_3D_FALLBACK_SECONDS_PER_TURN = 20;
const MIN_SECONDS_PER_TURN = 2;
const MAX_SECONDS_PER_TURN = 600;

/** Each performer's place in the sequence, front first, in engine positions. */
export interface PostPerformerPositions {
  /** The front (red/blue) performer, as the 2D clip's `sequencePosition`. */
  sequencePosition: number | undefined;
  /** Each follower in the item's order, as the 2D clip's `followerPositions`. */
  followerPositions: number[];
  /** The staggered frames, or null for a clip without followers. */
  staggered: StaggeredFrames | null;
}

/**
 * The positions a sequence layer draws its performers at. The 2D clip and the
 * 3D stage both read this, so the two land on the same beats: the front
 * performer stops early and each follower runs its beats behind on the same
 * tapped count (see `staggeredFrames`). Without followers the front performer
 * takes the layer's own position, or `fallback` when the layer has none.
 */
export function postPerformerPositions(
  frame: TkaSequenceFrame | null | undefined,
  moveBeats: readonly number[] | null,
  followers: PostAnimationItem["followers"],
  fallback: number | undefined
): PostPerformerPositions {
  const staggered =
    followers?.length && frame && moveBeats
      ? staggeredFrames(
          frame,
          moveBeats,
          followers.map((follower) => follower.beatsBehind)
        )
      : null;
  return {
    sequencePosition: staggered?.leader.enginePosition ?? fallback,
    followerPositions:
      staggered?.followers.map((entry) => entry.enginePosition) ?? [],
    staggered,
  };
}

/** The 3D stage's per-performer steps: the front performer, then each follower. */
export function stage3DPerformerSteps(
  positions: Pick<PostPerformerPositions, "sequencePosition" | "followerPositions">
): number[] {
  return [positions.sequencePosition ?? 0, ...positions.followerPositions];
}

/**
 * The character each performer wears on the 3D stage, front first: the
 * clip's cast where it names a character the catalog knows, else null (the
 * viewer's default figure). `knownIds` is the catalog's ids, passed in so
 * this module stays free of the scene package.
 */
export function stage3DCastCharacters(
  stage: Pick<PostStage3D, "cast">,
  performerCount: number,
  knownIds: ReadonlySet<string>
): (string | null)[] {
  return Array.from({ length: performerCount }, (_, index) => {
    const character = stage.cast?.[index]?.character;
    return character && knownIds.has(character) ? character : null;
  });
}

/**
 * The orbit camera's turn, in radians, at a post time: zero where the clip
 * starts, one full turn every `secondsPerTurn`. Earlier times turn it back,
 * so scrubbing backwards unwinds the orbit.
 */
export function stage3DOrbitAngle(
  postSeconds: number,
  clipStart: number,
  secondsPerTurn: number,
  direction: 1 | -1 = 1
): number {
  const period =
    Number.isFinite(secondsPerTurn) && secondsPerTurn > 0
      ? secondsPerTurn
      : STAGE_3D_FALLBACK_SECONDS_PER_TURN;
  return (direction * 2 * Math.PI * (postSeconds - clipStart)) / period;
}

function clampSecondsPerTurn(seconds: number): number {
  return Math.min(MAX_SECONDS_PER_TURN, Math.max(MIN_SECONDS_PER_TURN, seconds));
}

/**
 * The tempo of the tapped grid under a clip, in beats per post second: the
 * main-track footage playing at the clip's start (or the first footage inside
 * it), its take's first section tempo, sped up by the clip's playback speed.
 * Null when no footage with a tempo plays under the clip.
 */
export function stage3DGridBpm(
  project: PostProject,
  item: Pick<PostAnimationItem, "start" | "duration" | "anchor">
): number | null {
  const main = mainItems(project);
  const end = itemEnd(item);
  const covering =
    timingVideoAt(main, item.start, item.anchor?.itemId) ??
    main.find(
      (entry) =>
        entry.kind === "video" &&
        entry.start < end - POST_TIME_EPSILON &&
        itemEnd(entry) > item.start + POST_TIME_EPSILON
    ) ??
    null;
  if (!covering || covering.kind !== "video") return null;
  const bpm = project.timings?.[covering.takeId]?.sections?.[0]?.bpm;
  if (typeof bpm !== "number" || !Number.isFinite(bpm) || bpm <= 0) return null;
  return bpm * (covering.speed > 0 ? covering.speed : 1);
}

/**
 * How long one orbit turn takes: the clip's own setting, else 16 beats of its
 * tapped grid, else 20 seconds.
 */
export function stage3DSecondsPerTurn(
  project: PostProject,
  item: Pick<PostAnimationItem, "start" | "duration" | "anchor"> & {
    stage3d?: PostStage3D;
  }
): number {
  const own = item.stage3d?.orbitSecondsPerTurn;
  if (typeof own === "number" && Number.isFinite(own) && own > 0) {
    return clampSecondsPerTurn(own);
  }
  const bpm = stage3DGridBpm(project, item);
  return bpm
    ? clampSecondsPerTurn((STAGE_3D_BEATS_PER_TURN * 60) / bpm)
    : STAGE_3D_FALLBACK_SECONDS_PER_TURN;
}
