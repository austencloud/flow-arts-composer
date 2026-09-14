import {
  BackgroundType,
  type BackgroundController,
} from "@austencloud/backgrounds";

/** Adapter for backgrounds 0.7.12: Cosmic.setQuality replaces its particle
 * systems without seeding them. Reinitialize through the controller's public
 * recovery API, preserving the painted frame and adaptive quality setting. */
export function installBackgroundQualityRecovery(
  controller: BackgroundController
) {
  let active = true;
  let queued = false;
  const recover = () => {
    if (queued) return;
    queued = true;
    // The quality event fires inside draw's frame callback. Disposing a system
    // there would make that same frame try to update a destroyed system.
    queueMicrotask(() => {
      queued = false;
      if (
        active &&
        controller.isReady() &&
        controller.getCurrentType() === BackgroundType.COSMIC
      )
        controller.forceRefresh();
    });
  };
  controller.onEvent((event) => {
    if (event.type === "qualityChanged") recover();
  });
  // Also repair an already-damaged singleton when the host is hot-reloaded.
  if (controller.isReady()) recover();
  return () => {
    active = false;
  };
}
