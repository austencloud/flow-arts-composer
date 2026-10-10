import {
  createEmptyPostProject,
  type PostCardItem,
  type PostProject,
} from "#lib/shared/media-composition/domain/post-project.js";

/** In-memory cuts for transition inspection without changing a saved post. */
export function transitionsFixture(sequenceId: string): PostProject {
  const card = (
    id: string,
    label: string,
    start: number,
    darkMode: boolean
  ): PostCardItem => ({
    id,
    label,
    kind: "card",
    start,
    duration: 4,
    box: { x: 0.05, y: 0.05, width: 0.9, height: 0.9 },
    opacity: 1,
    fadeIn: 0,
    fadeOut: 0,
    anchor: null,
    fill: false,
    cardAppearance: { darkMode },
  });
  const first = card("transition-a", "Opening", 0, true);
  first.duration = 5;
  first.transitionOut = {
    type: "crossfade",
    duration: 1,
    incomingId: "transition-b",
    sourceTypeCode: "editor-crossfade",
    editorAddedSeconds: 1,
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
          card("transition-b", "Middle", 4, false),
          card("transition-c", "Ending", 8, true),
        ],
      },
    ],
  };
}
