import type { Scene } from "three";

export function castSundialPerformerShadows(scene: {
  readonly current: Scene;
}): number {
  let flagged = 0;
  scene.current.traverse((object) => {
    if (!object.name.startsWith("performer-station-cave-sun")) return;
    flagged += 1;
    object.traverse((child) => {
      if ("isMesh" in child && child.isMesh === true) child.castShadow = true;
    });
  });
  return flagged;
}
