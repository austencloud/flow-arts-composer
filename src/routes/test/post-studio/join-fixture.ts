import {
  createEmptyPostProject,
  editContext,
} from "#lib/shared/post-studio-plugin/index.js";
import {
  libraryTakeKey,
  type PostItem,
  type PostProject,
  type PostVideoItem,
} from "@austencloud/video-editor/core";
import {
  FLY_DEFAULT_SECONDS,
  flyIntoNext,
} from "#lib/shared/media-composition/domain/post-flash-join-edits.js";

const ANIMATION_ID = "join-animation";
const SQUARE_ID = "join-square";
const TAKE_ID = "join-take";
/** Where the animation hands over to the square, before the join. */
const HANDOVER_SECONDS = 4;
/** How much of the footage the post plays. */
const POST_SECONDS = 10;

const clip = {
  opacity: 1,
  fadeIn: 0,
  fadeOut: 0,
  anchor: null,
  fill: false,
};

/** The footage the harness registers for the sequence. */
export interface JoinFixtureFootage {
  videoId: string;
  durationSeconds: number;
}

/**
 * The reel's join: footage on the main lane, an animation in a large lower
 * box until 4 s, then a picture-in-picture square with the animation look
 * (alternate, so arrows and mandala take turns) in a small top-right box,
 * joined by the real Fly into next clip edit. The animation has no look of
 * its own, so the two do not share one surface: the square dissolves in
 * over the animation. In memory only: it never loads or saves the creator's
 * draft.
 */
export function joinFixture(
  sequenceId: string,
  footage: JoinFixtureFootage
): PostProject {
  const length = Math.min(POST_SECONDS, footage.durationSeconds);
  const video: PostVideoItem = {
    ...clip,
    kind: "video",
    id: "join-footage",
    label: "Footage",
    takeId: TAKE_ID,
    sourceIn: 0,
    sourceOut: length,
    speed: 1,
    fit: "cover",
    zoom: 1,
    panX: 0,
    panY: 0,
    rotation: 0,
    flip: false,
    volume: 1,
    start: 0,
    duration: length,
    box: { x: 0, y: 0, width: 1, height: 1 },
    fill: true,
  };
  const animation = {
    ...clip,
    id: ANIMATION_ID,
    kind: "animation",
    start: 0,
    duration: HANDOVER_SECONDS,
    box: { x: 0.05, y: 0.4, width: 0.9, height: 0.55 },
    overlay: true,
  } as PostItem;
  const square = {
    ...clip,
    id: SQUARE_ID,
    kind: "moves",
    start: HANDOVER_SECONDS,
    duration: length - HANDOVER_SECONDS,
    box: { x: 0.6, y: 0.04, width: 0.36, height: 0.2025 },
    mode: "alternate",
    animationAppearance: { mandala: false },
  } as PostItem;
  const project: PostProject = {
    ...createEmptyPostProject({ sequenceId, now: 0 }),
    takes: [
      {
        id: TAKE_ID,
        label: "Full-speed cut",
        ref: { kind: "catalog", videoId: footage.videoId },
        takeKey: libraryTakeKey(footage.videoId),
        durationSeconds: footage.durationSeconds,
      },
    ],
    tracks: [
      { id: "main", hidden: false, locked: false, items: [video] },
      {
        id: "join-track",
        hidden: false,
        locked: false,
        items: [animation, square],
      },
    ],
  };
  return flyIntoNext(
    project,
    ANIMATION_ID,
    FLY_DEFAULT_SECONDS,
    editContext(0)
  );
}
