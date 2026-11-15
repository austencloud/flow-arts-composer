import {
  createEmptyPostProject,
  type PostAnimationItem,
} from "#lib/shared/post-studio-plugin/index.js";
import type { PostProject } from "@austencloud/video-editor/core";

/**
 * In-memory split hands: one full-frame animation clip whose canvas parts
 * into a left-hand and a right-hand canvas at 2 s and rejoins at 6 s, in the
 * echo style. Nothing is saved, so inspecting it cannot touch a real post.
 */
export function splitFixture(sequenceId: string): PostProject {
  const animation: PostAnimationItem = {
    id: "split-animation",
    label: "Split hands",
    kind: "animation",
    start: 0,
    duration: 8,
    box: { x: 0, y: 0, width: 1, height: 1 },
    opacity: 1,
    fadeIn: 0,
    fadeOut: 0,
    anchor: null,
    fill: false,
    overlay: true,
    split: { openAt: 2, openSeconds: 0.7, closeAt: 6, style: "echo" },
  };
  return {
    ...createEmptyPostProject({ sequenceId, now: Date.now() }),
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
