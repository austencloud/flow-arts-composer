import type { PostProject } from "@austencloud/video-editor/core";
import {
  NOW,
  card,
  project as buildProject,
  take,
  text,
  video,
} from "../media-composition/post-project-fixtures";

/**
 * The plugin-free parity fixture. Only the write step imports this, once, to
 * write plain.project.json; the verify path reads that committed file.
 */
export function plainProject(): PostProject {
  const base = buildProject(
    [
      // Mirrored, so applyLayerTransform runs its scale(-1, 1).
      video("v1", {
        sourceIn: 0,
        sourceOut: 5,
        flip: true,
        transitionOut: { duration: 0.8, type: "crossfade" },
      }),
      // The fade-black sits on the cut into the end card: a transitionOut on the
      // last main item has no incoming item, so the compiler emits nothing for it.
      // The edge (rounded corners, a border and a shadow) runs the package's
      // `render/region-edge-painter.ts`.
      video("v2", {
        takeId: "b",
        sourceIn: 2,
        sourceOut: 8,
        transitionOut: { duration: 1, type: "fade-black" },
        edge: { corners: 0.08, border: 0.01, borderColor: "gold", shadow: 0.6 },
      }),
      // A keyframed box inside the frame: the card is captured at the full
      // output width, not its region's width, so the two branches differ.
      card("c1", 2, {
        box: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        keyframes: {
          box: [
            {
              t: 0,
              value: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
              easing: [0.42, 0, 0.58, 1],
            },
            {
              t: 2,
              value: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
              easing: "hold",
            },
          ],
        },
      } as never),
    ],
    [
      [
        text("t1", 0.5, 3),
        text("t2", 6, 4, {
          keyframes: {
            opacity: [
              { t: 0, value: 0, easing: [0.25, 0.1, 0.25, 1] },
              { t: 1, value: 1, easing: "hold" },
            ],
          },
        } as never),
      ],
      [
        {
          id: "i1",
          kind: "image",
          imageId: "img-1",
          start: 3,
          duration: 4,
          box: { x: 0.6, y: 0.1, width: 0.3, height: 0.3 },
          opacity: 1,
          fadeIn: 0.5,
          fadeOut: 0.5,
          anchor: null,
          fill: false,
          keyframes: {
            box: [
              {
                t: 0,
                value: { x: 0.6, y: 0.1, width: 0.3, height: 0.3 },
                easing: [0.42, 0, 0.58, 1],
              },
              {
                t: 3,
                value: { x: 0.5, y: 0.2, width: 0.3, height: 0.3 },
                easing: "hold",
              },
            ],
          },
        } as never,
      ],
    ],
    [take("a", 20), take("b", 20)]
  );
  return {
    ...base,
    images: [
      {
        id: "img-1",
        label: "Logo",
        ref: { kind: "linked", url: "https://example.test/logo.png" },
      },
    ],
    canvas: "4:5",
    background: "blur",
    updatedAt: NOW,
  } as PostProject;
}
