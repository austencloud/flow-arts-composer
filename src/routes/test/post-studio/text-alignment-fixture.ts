import {
  createEmptyPostProject,
  type PostProject,
  type PostTextItem,
} from "#lib/shared/media-composition/domain/post-project.js";

/** Disposable native text for alignment checks, independent of saved drafts. */
export function textAlignmentFixture(sequenceId: string): PostProject {
  const text: PostTextItem = {
    id: "alignment-native-text",
    kind: "text",
    start: 0,
    duration: 10,
    box: { x: 0.08, y: 0.44, width: 0.84, height: 0.12 },
    opacity: 1,
    fadeIn: 0,
    fadeOut: 0,
    anchor: null,
    fill: false,
    text: "Don't give up!",
    size: "m",
    style: {
      fontFamily: "PermanentMarker.ttf",
      fontSizeNative: 84,
      fontScale: 0.790714,
      sourceCanvasWidth: 738,
      letterSpacing: 0,
      lineSpacing: 1,
      alignment: "center",
      alpha: 1,
    },
    animation: {
      kind: "letter-slide",
      inDurationSeconds: 0.953127,
      outDurationSeconds: 0.953127,
      entranceProgress: 0.983333,
      exitProgress: 0,
    },
  };
  return {
    ...createEmptyPostProject({ sequenceId, now: Date.now() }),
    tracks: [{ id: "main", hidden: false, locked: false, items: [text] }],
  };
}
