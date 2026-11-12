import type { Object3D } from "three";

/**
 * The role tag on stage direction cue objects: the footlight strip, edge bars
 * and downstage triangle that tell a practice viewer which way the audience
 * is. Cues built in code set it on `userData`; cues exported from Blender
 * carry it as glTF `extras.tka_role`, which three.js copies into `userData`.
 * Plain module, no Svelte, so worker worlds can import it.
 */
export const STAGE_DIRECTION_CUE_ROLE = "stage-direction-cue";

/** Shows or hides every tagged cue object under `root`. */
export function setStageDirectionCueVisibility(
  root: Object3D,
  visible: boolean
): void {
  root.traverse((object) => {
    if (object.userData?.tka_role === STAGE_DIRECTION_CUE_ROLE) {
      object.visible = visible;
    }
  });
}
