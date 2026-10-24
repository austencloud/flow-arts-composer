import type { Scene } from "three";

// Threlte 8's useThrelte().scene is the Scene itself, not a store. Reading
// `.current` here threw inside the sun room's frame task, which stopped the
// whole render loop the moment a visitor walked into the lit room.
export function castSundialPerformerShadows(scene: Scene): number {
  let flagged = 0;
  scene.traverse((object) => {
    if (!object.name.startsWith("performer-station-cave-sun")) return;
    flagged += 1;
    object.traverse((child) => {
      if ("isMesh" in child && child.isMesh === true) child.castShadow = true;
    });
  });
  return flagged;
}
