import {
  createEmptyPostProject,
  type PostCardItem,
  type PostProject,
} from "#lib/shared/media-composition/domain/post-project.js";

/** Disposable browser fixture: never reads or writes a creator's saved draft. */
export function keyframeClearFixture(sequenceId: string): PostProject {
  const base = {
    box: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
    opacity: 1,
    fadeIn: 0,
    fadeOut: 0,
    anchor: null,
    fill: false,
  };
  const first: PostCardItem = {
    ...base,
    id: "clear-first",
    label: "First card",
    kind: "card",
    start: 0,
    duration: 10,
    keyframes: {
      box: [
        { t: 0, value: base.box, easing: [0, 0, 1, 1] },
        {
          t: 5,
          value: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
          easing: [0, 0, 1, 1],
        },
        { t: 10, value: base.box, easing: [0, 0, 1, 1] },
      ],
      opacity: [
        { t: 0, value: 1, easing: [0, 0, 1, 1] },
        { t: 5, value: 0.7, easing: [0, 0, 1, 1] },
        { t: 10, value: 1, easing: [0, 0, 1, 1] },
      ],
    },
  };
  return {
    ...createEmptyPostProject({ sequenceId, now: Date.now() }),
    tracks: [
      {
        id: "main",
        hidden: false,
        locked: false,
        items: [
          first,
          {
            ...base,
            id: "clear-second",
            label: "Second card",
            kind: "card",
            start: 10,
            duration: 10,
            keyframes: {
              opacity: [
                { t: 0, value: 0.6, easing: [0, 0, 1, 1] },
                { t: 10, value: 1, easing: [0, 0, 1, 1] },
              ],
            },
          },
        ],
      },
      {
        id: "locked-layer",
        hidden: false,
        locked: true,
        items: [
          {
            ...base,
            id: "clear-locked",
            kind: "text",
            text: "Locked layer",
            size: "s",
            start: 0,
            duration: 20,
            box: { x: 0.1, y: 0.02, width: 0.8, height: 0.08 },
            keyframes: {
              opacity: [
                { t: 0, value: 0.7, easing: [0, 0, 1, 1] },
                { t: 20, value: 1, easing: [0, 0, 1, 1] },
              ],
            },
          },
        ],
      },
    ],
  };
}
