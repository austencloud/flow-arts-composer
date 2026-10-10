<!--
  FullscreenButton.svelte

  Fullscreen toggle button for ButtonPanel.
  Handles cross-browser fullscreen API with proper state management.
-->
<script lang="ts">
  // Note: Vendor-prefixed types (webkit*, moz*, ms*) are declared in src/lib/shared/types/vendor-prefixed.d.ts
  import { getMobileFullscreenManager } from "#lib/shared/mobile/get-mobile-fullscreen-manager.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import type { MobileFullscreenManager } from '#lib/shared/mobile/services/mobile-fullscreen-manager.js'
  import { onMount } from "svelte";

  // Services
  let hapticService: HapticFeedback | null = null;
  let fullscreenService: MobileFullscreenManager | null = null;

  // State
  let isFullscreen = $state(false);
  let isFullscreenSupported = $state(false);
  let isPWA = $state(false);

  onMount(() => {
    const cleanupFns: Array<() => void> = [];

    try {
      hapticService = getHapticFeedback();
    } catch (error) {
      console.warn("Failed to resolve haptic feedback service:", error);
    }

    try {
      fullscreenService = getMobileFullscreenManager();
    } catch (error) {
      console.warn("Failed to resolve mobile fullscreen service:", error);
      fullscreenService = null;
    }

    if (fullscreenService) {
      isFullscreenSupported = fullscreenService.isFullscreenSupported();
      isFullscreen = fullscreenService.isFullscreen();
      isPWA = fullscreenService.isPWA();

      const unsubscribeFullscreen = fullscreenService.onFullscreenChange(
        (fullscreen) => {
          isFullscreen = fullscreen;
        }
      );
      cleanupFns.push(() => unsubscribeFullscreen?.());

      const updatePWAStatus = () => {
        isPWA = fullscreenService?.isPWA() ?? false;
      };

      const unsubscribeInstall = fullscreenService.onInstallPromptAvailable(
        () => updatePWAStatus()
      );
      cleanupFns.push(() => unsubscribeInstall?.());

      if (typeof window !== "undefined" && "matchMedia" in window) {
        const queries = [
          "(display-mode: standalone)",
          "(display-mode: fullscreen)",
          "(display-mode: minimal-ui)",
        ];

        queries.forEach((query) => {
          const mediaQuery = window.matchMedia(query);
          const handler = () => updatePWAStatus();

          if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener("change", handler);
            cleanupFns.push(() =>
              mediaQuery.removeEventListener("change", handler)
            );
          } else if (mediaQuery.addListener) {
            mediaQuery.addListener(handler);
            cleanupFns.push(() => mediaQuery.removeListener(handler));
          }
        });

        const handleAppInstalled = () => updatePWAStatus();
        window.addEventListener("appinstalled", handleAppInstalled);
        cleanupFns.push(() =>
          window.removeEventListener("appinstalled", handleAppInstalled)
        );
      }
    } else {
      // Fallback to direct DOM checks if service is unavailable
      const supportsFullscreen = !!(
        document.fullscreenEnabled ||
        document.webkitFullscreenEnabled ||
        document.mozFullScreenEnabled ||
        document.msFullscreenEnabled
      );
      isFullscreenSupported = supportsFullscreen;
      isPWA = false;

      const handleFullscreenChange = () => {
        isFullscreen = !!(
          document.fullscreenElement ||
          document.webkitFullscreenElement ||
          document.mozFullScreenElement ||
          document.msFullscreenElement
        );
      };

      document.addEventListener("fullscreenchange", handleFullscreenChange);
      document.addEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange
      );
      document.addEventListener("mozfullscreenchange", handleFullscreenChange);
      document.addEventListener("MSFullscreenChange", handleFullscreenChange);

      cleanupFns.push(() =>
        document.removeEventListener("fullscreenchange", handleFullscreenChange)
      );
      cleanupFns.push(() =>
        document.removeEventListener(
          "webkitfullscreenchange",
          handleFullscreenChange
        )
      );
      cleanupFns.push(() =>
        document.removeEventListener(
          "mozfullscreenchange",
          handleFullscreenChange
        )
      );
      cleanupFns.push(() =>
        document.removeEventListener(
          "MSFullscreenChange",
          handleFullscreenChange
        )
      );
    }

    return () => {
      cleanupFns.forEach((cleanup) => {
        try {
          cleanup();
        } catch (error) {
          console.warn("Failed to clean up fullscreen listeners:", error);
        }
      });
    };
  });

  async function handleClick() {
    try {
      if (isFullscreen) {
        hapticService?.trigger("selection");

        if (fullscreenService) {
          await fullscreenService.exitFullscreen();
        } else if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
          await document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
          await document.msExitFullscreen();
        }
      } else {
        hapticService?.trigger("selection");

        if (fullscreenService) {
          await fullscreenService.requestFullscreen();
        } else {
          const element = document.documentElement;
          if (element.requestFullscreen) {
            await element.requestFullscreen();
          } else if (element.webkitRequestFullscreen) {
            await element.webkitRequestFullscreen();
          } else if (element.mozRequestFullScreen) {
            await element.mozRequestFullScreen();
          } else if (element.msRequestFullscreen) {
            await element.msRequestFullscreen();
          }
        }
      }
    } catch (error) {
      console.warn("Fullscreen toggle failed:", error);
    }
  }
</script>

{#if isFullscreenSupported && !isPWA}
  <button
    class="panel-button fullscreen-button"
    onclick={handleClick}
    aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
    title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
  >
    {#if isFullscreen}
      <!-- Exit fullscreen icon -->
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    {:else}
      <!-- Enter fullscreen icon -->
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    {/if}
  </button>
{/if}

<style>
  .panel-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    transition: all var(--transition-normal, var(--duration-emphasis) cubic-bezier(0.4, 0, 0.2, 1));
    font-size: var(--font-size-lg);
    color: var(--theme-text);

    /* Base button styling */
    background: var(--theme-stroke);
    border: 1px solid var(--theme-stroke-strong);
  }

  .panel-button:hover {
    transform: scale(1.05);
  }

  .panel-button:active {
    transform: scale(0.95);
    transition: all var(--duration-instant) ease;
  }

  .panel-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .fullscreen-button {
    background: rgba(0, 0, 0, 0.7);
    border-color: var(--theme-stroke-strong);
  }

  .fullscreen-button:hover {
    background: rgba(0, 0, 0, 0.8);
    border-color: var(--theme-stroke-strong);
  }

  /* Mobile responsive - 48px minimum per iOS/Android guidelines */
  @media (max-width: 768px) {
    .panel-button {
      width: var(--min-touch-target);
      height: var(--min-touch-target);
      font-size: var(--font-size-base);
    }
  }

  @media (max-width: 480px) {
    .panel-button {
      width: var(--min-touch-target); /* Maintain 48px minimum */
      height: var(--min-touch-target);
      font-size: var(--font-size-base);
    }
  }

  @media (max-width: 320px) {
    .panel-button {
      width: var(--min-touch-target); /* NEVER below 48px for accessibility */
      height: var(--min-touch-target);
      font-size: var(--font-size-sm);
    }
  }

  /* 🎯 LANDSLOOPE MOBILE: Compact buttons for Z Fold 5 horizontal (882x344) */
  @media (min-aspect-ratio: 17/10) and (max-height: 500px) {
    .panel-button {
      width: var(
        --min-touch-target
      ); /* Maintain 48px minimum for accessibility */
      height: var(--min-touch-target);
      font-size: var(--font-size-sm);
    }
  }

  /* Accessibility: Respect user's motion preferences */
  @media (prefers-reduced-motion: reduce) {
    .panel-button {
      transition: none;
    }

    .panel-button:hover {
      transform: none;
    }

    .panel-button:active {
      transform: none;
    }
  }
</style>
