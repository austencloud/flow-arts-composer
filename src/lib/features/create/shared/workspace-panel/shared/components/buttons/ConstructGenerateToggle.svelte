<!--
ConstructGenerateToggle.svelte

Single-icon toggle button that switches between Construct and Generate modes.
Shows the opposite mode's icon (the action you can take).
Uses Font Awesome icons: fa-hammer (construct) and fa-wand-magic-sparkles (generate).

Design Principles:
- Action-oriented: Shows what you'll switch TO, not what you're ON
- Accessible: Full keyboard navigation and screen reader support
- Adaptive: Shows text label when alone, icon-only when with other buttons
- Consistent: Same size as other action buttons (48px circle), neutral slate color
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";

  type TabType = "construct" | "generate";

  const {
    activeTab = "construct",
    onTabChange,
    showLabels = false,
  } = $props<{
    activeTab?: TabType;
    onTabChange?: (tab: TabType) => void;
    showLabels?: boolean;
  }>();

  const hapticService: HapticFeedback = getHapticFeedback();

  function handleClick() {
    hapticService?.trigger("selection");
    const newTab = activeTab === "construct" ? "generate" : "construct";
    onTabChange?.(newTab);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      handleClick();
    }
  }

  // Determine which icon and label to show (opposite of current mode)
  const targetMode = $derived(
    activeTab === "construct" ? "generate" : "construct"
  );
  const targetIcon = $derived(
    targetMode === "generate" ? "fa-wand-magic-sparkles" : "fa-hammer"
  );
  const targetLabel = $derived(
    targetMode === "generate" ? "Generate" : "Construct"
  );
  const ariaLabel = $derived(`Switch to ${targetLabel} mode`);
</script>

<button
  class="toggle-button"
  class:with-label={showLabels}
  role="switch"
  aria-checked={activeTab === "generate"}
  aria-label={ariaLabel}
  onclick={handleClick}
  onkeydown={handleKeyDown}
  title={ariaLabel}
>
  <i class="fa-solid {targetIcon}" aria-hidden="true"></i>
  {#if showLabels}
    <span class="label">{targetLabel}</span>
  {/if}
</button>

<style>
  .toggle-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    border: 1px solid var(--theme-stroke);
    border-radius: 50%;
    background: var(--theme-card-bg);
    cursor: pointer;
    transition: all var(--transition-normal, var(--duration-emphasis) cubic-bezier(0.4, 0, 0.2, 1));
    color: var(--theme-text);
  }

  /* Wider when showing label */
  .toggle-button.with-label {
    width: auto;
    padding: 0 16px;
    border-radius: 24px;
  }

  .toggle-button:hover {
    transform: scale(1.05);
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
  }

  .toggle-button:active {
    transform: scale(0.95);
    transition: all var(--duration-instant) ease;
  }

  .toggle-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  /* Icon styling */
  .toggle-button i {
    font-size: var(--font-size-lg);
    transition: all var(--transition-normal, var(--duration-emphasis) cubic-bezier(0.4, 0, 0.2, 1));
  }

  /* Label text styling */
  .label {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--theme-text);
    white-space: nowrap;
  }

  /* Mobile responsive adjustments */
  @media (max-width: 768px) {
    .toggle-button {
      width: var(--min-touch-target);
      height: var(--min-touch-target);
    }

    .toggle-button i {
      font-size: var(--font-size-base);
    }

    .label {
      font-size: var(--font-size-compact);
    }
  }

  @media (max-width: 480px) {
    .toggle-button {
      width: var(
        --min-touch-target
      ); /* Maintain 48px minimum for accessibility */
      height: var(--min-touch-target);
    }

    .toggle-button i {
      font-size: var(--font-size-sm);
    }

    .label {
      font-size: var(--font-size-compact);
    }
  }

  @media (max-width: 320px) {
    .toggle-button {
      width: var(--min-touch-target); /* NEVER below 48px for accessibility */
      height: var(--min-touch-target);
    }

    .toggle-button i {
      font-size: var(--font-size-compact);
    }

    .label {
      font-size: var(--font-size-compact);
    }
  }

  /* Landscape mobile: Maintain 48px minimum */
  @media (min-aspect-ratio: 17/10) and (max-height: 500px) {
    .toggle-button {
      width: var(
        --min-touch-target
      ); /* Maintain 48px minimum for accessibility */
      height: var(--min-touch-target);
    }

    .toggle-button i {
      font-size: var(--font-size-sm);
    }
  }
</style>
