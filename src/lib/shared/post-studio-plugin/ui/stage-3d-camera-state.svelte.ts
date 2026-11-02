import type { StageCameraPose } from "./stage-3d-camera";

/**
 * What a 3D clip's stage and the canvas's selection layer share while the
 * user moves a saved camera: the camera each clip is showing (where a drag
 * starts from) and the camera of the drag in progress (which the clip shows
 * live until the drag lands on the item).
 */
let live = $state.raw<{ itemId: string; pose: StageCameraPose } | null>(null);
const shown = new Map<string, StageCameraPose>();

export const stage3DCameraState = {
  /** The saved camera being dragged right now, before it is stored. */
  get live() {
    return live;
  },
  set live(value: { itemId: string; pose: StageCameraPose } | null) {
    live = value;
  },
  /** The camera a clip's stage last showed. */
  shownPose(itemId: string): StageCameraPose | null {
    return shown.get(itemId) ?? null;
  },
  setShown(itemId: string, pose: StageCameraPose): void {
    shown.set(itemId, pose);
  },
};
