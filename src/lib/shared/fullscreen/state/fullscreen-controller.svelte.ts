import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
// Fullscreen belongs to the host surface, not to any one viewer shell.
import {
  supportsNativeFullscreen,
  requestNativeFullscreen,
  exitNativeFullscreen,
} from "./fullscreen-capabilities";

export interface FullscreenControllerDeps {
  getHapticService: () => HapticFeedback | null;
  announce: (message: string, priority?: "polite" | "assertive") => void;
}

export function createFullscreenController(deps: FullscreenControllerDeps) {
  let isFullscreen = $state(false);
  // immersive = the overlay's own top/bottom bars are hidden for max canvas.
  // Independent of isFullscreen so a non-fullscreen mobile overlay can also
  // toggle its chrome.
  let immersive = $state(false);
  let fullscreenControlsVisible = $state(false);
  let controlsHideTimeout: ReturnType<typeof setTimeout> | null = null;

  function clearControlsTimeout() {
    if (controlsHideTimeout) {
      clearTimeout(controlsHideTimeout);
      controlsHideTimeout = null;
    }
  }

  function scheduleControlsHide() {
    clearControlsTimeout();
    controlsHideTimeout = setTimeout(() => {
      fullscreenControlsVisible = false;
    }, 3000);
  }

  function showFullscreenControls() {
    fullscreenControlsVisible = true;
    scheduleControlsHide();
  }

  function enterFullscreen() {
    deps.getHapticService()?.trigger("selection");
    isFullscreen = true;
    showFullscreenControls();
    deps.announce(
      "Fullscreen mode. Tap to show controls, press Escape to exit.",
      "assertive"
    );
  }

  function exitFullscreen() {
    deps.getHapticService()?.trigger("selection");
    isFullscreen = false;
    fullscreenControlsVisible = false;
    clearControlsTimeout();
    deps.announce("Exited fullscreen");
  }

  function handleFullscreenTap() {
    if (isFullscreen && !fullscreenControlsVisible) {
      showFullscreenControls();
    }
  }

  /**
   * Immersive toggle for the mobile 3D overlay. Hides the overlay's own
   * top/bottom bars. When the host element supports the native Fullscreen API
   * (iPad / desktop / Android) it also enters true OS fullscreen; on iPhone
   * Safari (no API) it falls back to the bars-hidden CSS path only.
   */
  async function enterImmersive(host: HTMLElement | null) {
    deps.getHapticService()?.trigger("selection");
    immersive = true;
    if (supportsNativeFullscreen(host)) {
      const ok = await requestNativeFullscreen(host);
      if (!ok) {
        deps.announce("Immersive mode. Tap to show controls.", "assertive");
      }
    } else {
      deps.announce("Immersive mode. Tap to show controls.", "assertive");
    }
  }

  async function exitImmersive() {
    deps.getHapticService()?.trigger("selection");
    immersive = false;
    await exitNativeFullscreen();
    deps.announce("Exited immersive mode");
  }

  function toggleImmersive(host: HTMLElement | null) {
    return immersive ? exitImmersive() : enterImmersive(host);
  }

  /** Re-show the bars after immersive auto-hide on tap. */
  function revealImmersiveBars() {
    immersive = false;
  }

  return {
    get isFullscreen() {
      return isFullscreen;
    },
    set isFullscreen(v: boolean) {
      isFullscreen = v;
    },
    get immersive() {
      return immersive;
    },
    get fullscreenControlsVisible() {
      return fullscreenControlsVisible;
    },
    enterFullscreen,
    exitFullscreen,
    handleFullscreenTap,
    enterImmersive,
    exitImmersive,
    toggleImmersive,
    revealImmersiveBars,
    clearControlsTimeout,
  };
}
