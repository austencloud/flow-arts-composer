import type { ViewMode } from "#lib/shared/sequence-viewer/services/sequence-modal-persistence.js";
import { shouldAutoplayMotion } from "#lib/shared/animation-engine/services/motion-autoplay-policy.js";

export interface ViewerAutoplayPolicy {
  viewMode: ViewMode;
  reducedMotionSetting: boolean;
  systemPrefersReducedMotion: boolean;
}

/**
 * Motion never starts without consent when either reduced-motion preference is
 * active. Outside that case, the saved image-only view remains still.
 */
export function shouldAutoplayViewer({
  viewMode,
  reducedMotionSetting,
  systemPrefersReducedMotion,
}: ViewerAutoplayPolicy): boolean {
  return (
    viewMode !== "image" &&
    shouldAutoplayMotion({
      reducedMotionSetting,
      systemPrefersReducedMotion,
    })
  );
}
