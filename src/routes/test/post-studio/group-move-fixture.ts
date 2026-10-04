import {
  createEmptyPostProject,
  type PostCardItem,
  type PostProject,
  type PostTextItem,
} from "$lib/shared/media-composition/domain/post-project";

/** Disposable timeline for selection, collisions, and hidden-layer checks. */
export function groupMoveFixture(sequenceId: string): PostProject {
  const base = {
    box: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
    opacity: 1,
    fadeIn: 0,
    fadeOut: 0,
    anchor: null,
    fill: false,
    duration: 2,
  };
  const card = (id: string, label: string, start: number): PostCardItem => ({
    ...base,
    id,
    label,
    kind: "card",
    start,
    pinnedStart: true,
  });
  const text = (id: string, label: string, start: number): PostTextItem => ({
    ...base,
    id,
    label,
    text: label,
    kind: "text",
    size: "s",
    start,
  });
  return {
    ...createEmptyPostProject({ sequenceId, now: Date.now() }),
    tracks: [
      {
        id: "main",
        hidden: false,
        locked: false,
        items: [
          card("main-a", "Main A", 0),
          card("main-middle", "Stay in gap", 5),
          card("main-b", "Main B", 10),
        ],
      },
      {
        id: "occupied-layer",
        hidden: false,
        locked: false,
        items: [
          text("overlay-a", "Overlay A", 0),
          text("resident", "Stay on layer", 4),
          text("overlay-b", "Overlay B", 8),
        ],
      },
      {
        id: "hidden-layer",
        hidden: true,
        locked: false,
        items: [text("hidden-resident", "Hidden resident", 14)],
      },
    ],
  };
}
