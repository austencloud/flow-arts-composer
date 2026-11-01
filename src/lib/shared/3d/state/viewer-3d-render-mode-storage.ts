// The viewer's last 2D/3D choice. Kept apart from viewer-3d-state so the
// sequence viewer can read it at startup without loading three.js.
import { isWebGL2Available } from "../capabilities/webgl-capabilities";
import { fits3DViewportNow } from "../capabilities/viewport-3d-gate.svelte";

export const STORAGE_KEY_MODE = "tka-viewer3d-renderMode";

export function loadPersistedMode(): "2d" | "3d" {
  if (typeof localStorage === "undefined") return "2d";
  try {
    const v = localStorage.getItem(STORAGE_KEY_MODE);
    return v === "3d" ? "3d" : "2d";
  } catch {
    return "2d";
  }
}

/** Whether a fresh viewer-3d state would start in 3D on this device. */
export function persistedModeOpens3D(): boolean {
  return (
    isWebGL2Available() && fits3DViewportNow() && loadPersistedMode() === "3d"
  );
}
