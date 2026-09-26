<!--
FullscreenPrompt.svelte - Intelligent fullscreen prompt

Shows when:
- Device is mobile (not desktop)
- Fullscreen API is supported
- NOT currently in fullscreen mode

This creates a better UX than height-based thresholds by directly detecting
the actual fullscreen state rather than inferring from viewport size.
-->
<script lang="ts">
  import { getDeviceDetector } from "$lib/shared/device/get-device-detector";
  import { getMobileFullscreenManager } from "$lib/shared/mobile/get-mobile-fullscreen-manager";
  import type { DeviceDetector } from "$lib/shared/device/services/device-detector";
  import type { MobileFullscreenManager } from "$lib/shared/mobile/services/mobile-fullscreen-manager";
  import { onMount } from "svelte";
  import { tDynamic } from "$lib/shared/i18n/i18n.svelte.js";

  let showPrompt = $state(false);
  let isEmergencyMode = $state(false); // Track if we're in emergency mode
  let messageIndex = $state(0);

  let deviceDetector: DeviceDetector | null = null;
  let fullscreenService: MobileFullscreenManager | null = null;

  // Session-based dismissal (resets on page reload)
  const DISMISSAL_KEY = "tka-fullscreen-prompt-dismissed-session";

  // Fun, inviting messages that make users want to tap
  const messageKeys = [
    "fullscreen_prompt_message_1",
    "fullscreen_prompt_message_2",
    "fullscreen_prompt_message_3",
    "fullscreen_prompt_message_4",
    "fullscreen_prompt_message_5",
    "fullscreen_prompt_message_6",
    "fullscreen_prompt_message_7",
    "fullscreen_prompt_message_8",
  ] as const;
  const message = $derived(
    tDynamic(messageKeys[messageIndex] ?? "fullscreen_prompt_message_1")
  );

  onMount(() => {
    let unsubscribe: (() => void) | undefined;
    let handleResize: (() => void) | undefined;

    try {
      // Resolve services
      deviceDetector = getDeviceDetector();
      fullscreenService = getMobileFullscreenManager();

      // Pick a random message
      messageIndex = Math.floor(Math.random() * messageKeys.length);

      // Initial check
      checkShouldPrompt();

      // Listen for fullscreen state changes
      unsubscribe = fullscreenService?.onFullscreenChange(() => {
        checkShouldPrompt();
      });

      // Re-check on resize (device orientation change)
      handleResize = () => checkShouldPrompt();
      window.addEventListener("resize", handleResize);
    } catch (error) {
      console.error("Failed to initialize FullscreenPrompt:", error);
    }

    return () => {
      unsubscribe?.();
      if (handleResize) {
        window.removeEventListener("resize", handleResize);
      }
    };
  });

  function checkShouldPrompt() {
    if (!deviceDetector || !fullscreenService) {
      showPrompt = false;
      return;
    }

    const fullscreenSupported = fullscreenService.isFullscreenSupported();
    const isCurrentlyFullscreen = fullscreenService.isFullscreen();
    const isExtremelyConstrained =
      typeof window !== "undefined" && window.innerHeight < 300;

    const emergencyMode =
      fullscreenSupported && !isCurrentlyFullscreen && isExtremelyConstrained;

    showPrompt = emergencyMode;
    isEmergencyMode = emergencyMode;
  }

  async function requestFullscreen() {
    if (!fullscreenService) return;

    try {
      await fullscreenService.requestFullscreen();
      // Prompt will hide automatically via fullscreen change listener
    } catch (error) {
      console.warn("Fullscreen request failed:", error);
      // User can try again by tapping
    }
  }

  function dismissPrompt() {
    showPrompt = false;
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(DISMISSAL_KEY, "true");
    }
  }
</script>

{#if showPrompt}
  <div
    class="fullscreen-prompt-overlay"
    onclick={requestFullscreen}
    onkeydown={(e) =>
      (e.key === "Enter" || e.key === " ") && requestFullscreen()}
    role="button"
    tabindex="0"
    aria-label={tDynamic("fullscreen_prompt_enter_aria")}
  >
    <div class="fullscreen-prompt-content">
      <h2 class="prompt-title">{message}</h2>
      <p class="prompt-subtitle">
        {#if isEmergencyMode}
          {tDynamic("fullscreen_prompt_limited_space")}
        {:else}
          {tDynamic("fullscreen_prompt_tap_fullscreen")}
        {/if}
      </p>

      <!-- Only show dismiss button in normal mode, not emergency -->
      {#if !isEmergencyMode}
        <button
          class="dismiss-button"
          onclick={dismissPrompt}
          aria-label={tDynamic("fullscreen_prompt_skip_aria")}
          title={tDynamic("fullscreen_prompt_skip_title")}
        >
          {tDynamic("fullscreen_prompt_skip")}
        </button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .fullscreen-prompt-overlay {
    /* Full screen overlay */
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: var(--z-priority);

    /* Remove button styling */
    border: none;
    padding: 0;
    margin: 0;
    font: inherit;
    color: inherit;
    background: none;

    /* Semi-transparent dark background */
    background: rgba(0, 0, 0, 0.9);
    backdrop-filter: blur(12px);

    /* Center content */
    display: flex;
    align-items: center;
    justify-content: center;

    /* Clickable */
    cursor: pointer;

    /* Smooth fade-in */
    animation: fadeIn var(--duration-emphasis) ease-out;
  }

  .fullscreen-prompt-overlay:hover {
    background: rgba(0, 0, 0, 0.95);
  }

  .fullscreen-prompt-overlay:active {
    background: rgba(0, 0, 0, 0.98);
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .fullscreen-prompt-content {
    /* Prevent click events from bubbling (parent handles click) */
    pointer-events: none;

    display: flex;
    flex-direction: column;
    align-items: center;
    gap: clamp(12px, 3vh, 20px);

    /* Scale-in animation */
    animation: scaleIn var(--duration-emphasis)
      cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes scaleIn {
    from {
      transform: scale(0.9);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }

  .prompt-title {
    font-size: clamp(20px, 5vw, 32px);
    font-weight: 700;
    color: white;
    margin: 0;
    text-align: center;
    line-height: 1.3;
    letter-spacing: 0.5px;
  }

  /* Glow animation - only when motion is OK */
  @media (prefers-reduced-motion: no-preference) {
    .prompt-title {
      animation: glow 2s ease-in-out infinite;
    }
  }

  @keyframes glow {
    0%,
    100% {
      opacity: 0.9;
      transform: scale(1);
    }
    50% {
      opacity: 1;
      transform: scale(1.02);
    }
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .fullscreen-prompt-overlay {
      animation: none;
    }
    .fullscreen-prompt-content {
      animation: none;
    }
    .prompt-title {
      animation: none;
    }
  }
</style>
