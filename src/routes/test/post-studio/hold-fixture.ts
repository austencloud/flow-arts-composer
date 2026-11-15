import { createEmptyPostProject } from "#lib/shared/post-studio-plugin/index.js";
import {
  libraryTakeKey,
  type PostItem,
  type PostProject,
  type PostVideoItem,
} from "@austencloud/video-editor/core";

const TAKE_ID = "hold-take";
/** How much of the footage the post plays before it holds. */
const FOOTAGE_SECONDS = 8;
/** How long the clip holds its last frame. */
export const HOLD_FIXTURE_SECONDS = 2;
/** How long the card takes to fade in over the held frame. */
const CARD_FADE_SECONDS = 1;

const clip = {
  opacity: 1,
  fadeIn: 0,
  fadeOut: 0,
  anchor: null,
  fill: false,
};

/** The footage the harness registers for the sequence. */
export interface HoldFixtureFootage {
  videoId: string;
  durationSeconds: number;
}

/**
 * Hold last frame: the harness's footage on the main lane, holding its last
 * frame for 2 s after it ends, a picture-in-picture moves square over the
 * whole clip, and a card that starts where the footage ends and fades in over
 * the held frame. Through the hold the footage and the square both stay on
 * the footage's last moment. In memory only: it never loads or saves the
 * creator's draft.
 */
export function holdFixture(
  sequenceId: string,
  footage: HoldFixtureFootage
): PostProject {
  const footageSeconds = Math.min(FOOTAGE_SECONDS, footage.durationSeconds);
  const length = footageSeconds + HOLD_FIXTURE_SECONDS;
  const video: PostVideoItem = {
    ...clip,
    kind: "video",
    id: "hold-footage",
    label: "Footage",
    takeId: TAKE_ID,
    sourceIn: 0,
    sourceOut: footageSeconds,
    speed: 1,
    holdOut: HOLD_FIXTURE_SECONDS,
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
  };
  const square = {
    ...clip,
    id: "hold-square",
    kind: "moves",
    start: 0,
    duration: length,
    box: { x: 0.6, y: 0.04, width: 0.36, height: 0.2025 },
    mode: "alternate",
    animationAppearance: { mandala: false },
    anchor: { itemId: video.id, offset: 0 },
  } as PostItem;
  const card = {
    ...clip,
    id: "hold-card",
    kind: "card",
    start: footageSeconds,
    duration: HOLD_FIXTURE_SECONDS,
    fadeIn: CARD_FADE_SECONDS,
    box: { x: 0.05, y: 0.27, width: 0.9, height: 0.64 },
    cardAppearance: { darkMode: true },
    anchor: { itemId: video.id, offset: footageSeconds },
  } as PostItem;
  return {
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
        id: "hold-square-track",
        hidden: false,
        locked: false,
        items: [square],
      },
      { id: "hold-card-track", hidden: false, locked: false, items: [card] },
    ],
  };
}
