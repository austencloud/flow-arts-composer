import {
  createEmptyPostProject,
  type PostAnimationItem,
} from "#lib/shared/post-studio-plugin/index.js";
import type { PostProject } from "@austencloud/video-editor/core";
import { POST_LIFT_DEFAULTS } from "#lib/shared/media-composition/domain/post-panel-lift.js";

/**
 * In-memory lifted panel: a 9:16 post with one animation clip on its bottom
 * half, as a Reel lays it out. The lift is fully in at 1 s and goes back from
 * 8.3 s, so the clip ends on the app's own layout; the hands split from 3.5 s
 * to 6 s in between, so the split canvases show at the lifted height. The
 * split's spread and size are the hand-made cut's (canvases centred on x 328
 * and 752 of 1080 at 0.61 of the app's size, which is 0.64 of the lifted
 * canvas). Nothing is saved, so inspecting it cannot touch a real post.
 */
export function liftFixture(sequenceId: string): PostProject {
  const animation: PostAnimationItem = {
    id: "lift-animation",
    label: "Lifted panel",
    kind: "animation",
    start: 0,
    duration: 9,
    box: { x: 0, y: 0.5, width: 1, height: 0.5 },
    opacity: 1,
    fadeIn: 0,
    fadeOut: 0,
    anchor: null,
    fill: false,
    overlay: true,
    animationAppearance: {},
    panelLift: {
      ...POST_LIFT_DEFAULTS,
      inAt: 1,
      inSeconds: 0.8,
      outAt: 8.3,
      outSeconds: 0.7,
    },
    split: {
      openAt: 3.5,
      openSeconds: 0.7,
      closeAt: 6,
      style: "glide",
      spread: 0.196,
      scale: 0.64,
    },
  };
  return {
    ...createEmptyPostProject({ sequenceId, now: Date.now() }),
    canvas: "9:16",
    tracks: [
      {
        id: "main",
        hidden: false,
        locked: false,
        items: [animation],
      },
    ],
  };
}
