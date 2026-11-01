/**
 * Whether the pictographs inside a surface have finished drawing.
 *
 * A PictographContainer reports `aria-busy="true"` from the moment it has data
 * until its picture is on screen. Surfaces that hold a motion until their
 * pictures are drawn (the workspace slide, the start placement morph, the
 * first entry into a Create method) read that flag here instead of each
 * carrying their own selector.
 *
 * - "none": no pictograph in the surface yet
 * - "drawing": at least one is still drawing
 * - "drawn": every pictograph present has drawn
 */
export type PictographDrawState = "none" | "drawing" | "drawn";

export function pictographDrawState(root: ParentNode): PictographDrawState {
  if (root.querySelector('.pictograph-container[aria-busy="true"]')) {
    return "drawing";
  }
  return root.querySelector(".pictograph-container") ? "drawn" : "none";
}
