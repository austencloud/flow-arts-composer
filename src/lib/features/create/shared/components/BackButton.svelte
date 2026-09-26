<!--
  BackButton.svelte

  Navigation back button for Create module right panel.
  Allows users to navigate back through their panel history.
  Hides completely when no history is available.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import { fade } from "svelte/transition";

  const {
    canGoBack,
    onBack,
  }: {
    canGoBack: boolean;
    onBack: () => void;
  } = $props();

  // Services
  const hapticService: HapticFeedback = getHapticFeedback();

  function handleBack() {
    // Trigger navigation haptic feedback for back navigation
    hapticService?.trigger("selection");
    onBack();
  }
</script>

{#if canGoBack}
  <button
    class="back-button"
    onclick={handleBack}
    aria-label={t("create_ui_go_back_to_previous_panel")}
    title={t("learn_go_back")}
    transition:fade={{ duration: 200 }}
  >
    <svg
      width="20"
      height="20"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M10 12L6 8L10 4"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </button>
{/if}

<style>
  .back-button {
    position: absolute;
    top: 1rem;
    left: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    background: var(--theme-card-bg);
    border: 2px solid var(--theme-stroke-strong);
    border-radius: 50%;
    padding: 0;
    color: var(--theme-text);
    cursor: pointer;
    transition: all var(--duration-emphasis) cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 100;
    box-shadow:
      0 0 0 2px var(--theme-stroke, var(--theme-stroke)),
      0 4px 12px var(--theme-shadow),
      inset 0 1px 0 var(--theme-stroke);
  }

  .back-button:hover {
    background: color-mix(
      in srgb,
      var(--theme-accent, var(--semantic-info)) 95%,
      transparent
    );
    border-color: var(--theme-text-dim);
    transform: translateX(-2px) scale(1.05);
    box-shadow:
      0 0 0 2px var(--theme-stroke-strong),
      0 6px 16px
        color-mix(
          in srgb,
          var(--theme-accent, var(--semantic-info)) 30%,
          transparent
        ),
      0 4px 12px var(--theme-shadow),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
  }

  .back-button svg {
    transition: transform var(--duration-normal) ease;
  }

  .back-button:hover svg {
    transform: translateX(-2px);
  }

  .back-button:focus-visible {
    outline: 2px solid var(--theme-accent, rgba(139, 92, 246, 0.8));
    outline-offset: 2px;
  }

  /* Accessibility: Respect user's motion preferences */
  @media (prefers-reduced-motion: reduce) {
    .back-button {
      transition: none;
    }

    .back-button:hover {
      transform: none;
    }

    .back-button svg {
      transition: none;
    }

    .back-button:hover svg {
      transform: none;
    }
  }

  /* Mobile responsive - maintain 48px touch target */
  @media (max-width: 768px) {
    .back-button {
      top: 0.5rem;
      left: 0.5rem;
      width: var(--min-touch-target);
      height: var(--min-touch-target);
    }

    .back-button svg {
      width: 16px;
      height: 16px;
    }
  }
</style>
