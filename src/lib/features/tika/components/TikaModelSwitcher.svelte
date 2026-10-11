<!--
  TIKA Model Switcher

  Compact popover-based selector for choosing AI model (Sonnet 4 vs Deepseek).
  Follows TabOverflowSelector pattern with native Popover API.
-->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { ModelOption } from "../types";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import { onMount } from "svelte";

  let {
    currentModel = "sonnet-4",
    availableModels = [],
    onModelChange = () => {},
  } = $props<{
    currentModel: string;
    availableModels: ModelOption[];
    onModelChange: (modelId: string) => void;
  }>();

  let triggerElement: HTMLButtonElement | null = null;
  let popoverElement: HTMLElement | null = null;
  let isOpen = $state(false);
  let hapticService: HapticFeedback | null = null;

  // Find current model data
  const currentModelData = $derived(
    availableModels.find((m: ModelOption) => m.id === currentModel) || availableModels[0]
  );

  // Desktop breakpoint
  const DESKTOP_WIDTH = 768;

  function handleTriggerClick() {
    hapticService?.trigger("selection");
    // Position BEFORE popover opens to prevent flash at wrong position
    positionPopover();
  }

  function handleModelClick(model: ModelOption) {
    hapticService?.trigger("selection");
    onModelChange(model.id);
    // Close popover
    if (popoverElement && typeof popoverElement.hidePopover === "function") {
      try {
        popoverElement.hidePopover();
      } catch {
        // Ignore errors - popover might already be closing
      }
    }
  }

  // Position popover below trigger on desktop
  function positionPopover() {
    if (!triggerElement || !popoverElement) return;
    if (window.innerWidth < DESKTOP_WIDTH) return; // Mobile uses bottom sheet

    const rect = triggerElement.getBoundingClientRect();
    const popoverWidth = 280;

    // Position below trigger, right-aligned
    let left = rect.right - popoverWidth;

    // Keep within viewport
    if (left < 8) left = 8;
    if (left + popoverWidth > window.innerWidth - 8) {
      left = window.innerWidth - popoverWidth - 8;
    }

    // Set position via CSS custom properties to avoid !important conflicts
    popoverElement.style.setProperty('--popover-top', `${rect.bottom + 8}px`);
    popoverElement.style.setProperty('--popover-left', `${left}px`);
  }

  // Set up toggle event listener for chevron rotation
  onMount(() => {
    hapticService = getHapticFeedback();

    const element = popoverElement;
    if (!element) return;

    const handleToggle = (event: Event) => {
      const toggleEvent = event as ToggleEvent;
      isOpen = toggleEvent.newState === "open";
    };

    element.addEventListener("toggle", handleToggle);
    return () => {
      element.removeEventListener("toggle", handleToggle);
    };
  });
</script>

<!-- Compact Trigger Button -->
<button aria-label="Select AI model"
  bind:this={triggerElement}
  class="model-picker-trigger"
  popovertarget="tika-model-popover"
  aria-expanded={isOpen}
  aria-controls="tika-model-popover"
  onclick={handleTriggerClick}
  style="--model-color: {currentModelData?.color || '#6366f1'}"
>
  <i class="fas {currentModelData?.icon || 'fa-brain'} model-icon" aria-hidden="true"></i>
  <span class="model-label">{currentModelData?.shortName || "Model"}</span>
  <i
    class="fas fa-chevron-down chevron"
    class:rotated={isOpen}
    aria-hidden="true"
  ></i>
</button>

<!-- Popover with model options -->
<div
  bind:this={popoverElement}
  id="tika-model-popover"
  popover="auto"
  class="model-popover"
>
  <div class="model-list">
    {#each availableModels as model}
      <button aria-label={`Select ${model.name}`}
        class="model-option"
        class:active={currentModel === model.id}
        onclick={() => handleModelClick(model)}
        style="--model-color: {model.color}"
        aria-pressed={currentModel === model.id}
      >
        <div class="model-option-icon">
          <i class="fas {model.icon}" aria-hidden="true"></i>
        </div>
        <div class="model-option-content">
          <span class="model-option-name">{model.name}</span>
          <span class="model-option-desc">{model.description}</span>
        </div>
        {#if currentModel === model.id}
          <i class="fas fa-check check-mark" aria-hidden="true"></i>
        {/if}
      </button>
    {/each}
  </div>
</div>

<style>
  .model-picker-trigger {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    min-height: var(--min-touch-target, 48px);
    max-width: 140px;

    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 24px;

    color: var(--theme-text);
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;

    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;

    transition:
      background 0.2s ease,
      border-color 0.2s ease,
      transform 0.15s ease;
  }

  .model-picker-trigger:hover {
    background: color-mix(
      in srgb,
      var(--theme-card-bg) 100%,
      var(--model-color) 15%
    );
    border-color: var(--model-color);
  }

  .model-picker-trigger:active {
    transform: scale(0.97);
  }

  .model-picker-trigger:focus-visible {
    outline: 2px solid var(--model-color);
    outline-offset: 2px;
  }

  .model-icon {
    font-size: 14px;
    color: var(--model-color);
  }

  .model-label {
    flex: 1 1 auto;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chevron {
    font-size: var(--font-size-compact, 12px);
    opacity: 0.6;
    transition: transform var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
  }

  .chevron.rotated {
    transform: rotate(180deg);
  }

  :global(#tika-model-popover) {
    /* Position as dropdown below trigger on desktop, bottom sheet on mobile */
    position: fixed !important;
    inset: auto !important;
    bottom: 0 !important;
    left: 0 !important;
    right: 0 !important;
    top: auto !important;
    transform: none;
    margin: 0 !important;

    width: 100%;
    max-width: 100%;
    max-height: 40vh;
    overflow-y: auto;

    background: var(--theme-panel-bg);

    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 16px 16px 0 0;
    border-bottom: none;
    padding: 12px 12px calc(12px + env(safe-area-inset-bottom, 0px));

    box-shadow:
      0 -4px 24px hsl(0 0% 0% / 0.4),
      0 -1px 4px hsl(0 0% 0% / 0.2);

    opacity: 1;
    scale: 1;
    transition:
      opacity 0.2s ease,
      scale 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
      overlay 0.2s ease allow-discrete,
      display 0.2s ease allow-discrete;
  }

  @starting-style {
    :global(#tika-model-popover:popover-open) {
      opacity: 0;
      scale: 0.95;
    }
  }

  :global(#tika-model-popover:not(:popover-open)) {
    opacity: 0;
    scale: 0.95;
  }

  /* Desktop: position as dropdown (positioned via CSS custom properties set by JS) */
  @media (min-width: 768px) {
    :global(#tika-model-popover) {
      /* Use CSS custom properties for positioning - set by JavaScript */
      inset: unset !important;
      top: var(--popover-top, 100px) !important;
      left: var(--popover-left, 100px) !important;
      bottom: auto !important;
      right: auto !important;
      /* Width and styling */
      width: 280px;
      max-width: 280px;
      border-radius: 12px;
      border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
      padding: 8px;
      box-shadow:
        0 8px 32px hsl(0 0% 0% / 0.4),
        0 2px 8px hsl(0 0% 0% / 0.2);
    }
  }

  .model-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .model-option {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 12px;
    width: 100%;

    background: var(--theme-card-bg);
    border: 1px solid transparent;
    border-radius: 10px;

    color: var(--theme-text);
    text-align: left;

    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;

    transition:
      background 0.2s ease,
      border-color 0.2s ease,
      transform 0.15s ease;
  }

  .model-option:hover {
    background: color-mix(
      in srgb,
      var(--theme-card-bg) 100%,
      var(--model-color) 12%
    );
    border-color: var(--model-color);
  }

  .model-option:active {
    transform: scale(0.98);
  }

  .model-option:focus-visible {
    outline: 2px solid var(--model-color);
    outline-offset: 2px;
  }

  .model-option.active {
    background: color-mix(
      in srgb,
      var(--theme-card-bg) 100%,
      var(--model-color) 20%
    );
    border-color: var(--model-color);
  }

  .model-option-icon {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: color-mix(
      in srgb,
      var(--model-color) 20%,
      transparent
    );
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .model-option-icon i {
    font-size: 16px;
    color: var(--model-color);
  }

  .model-option-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .model-option-name {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text);
  }

  .model-option-desc {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
  }

  .check-mark {
    font-size: 14px;
    color: var(--model-color);
    flex-shrink: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .model-picker-trigger,
    .model-option,
    .chevron {
      transition: none;
    }

    @starting-style {
      :global(#tika-model-popover:popover-open) {
        opacity: 1;
        scale: 1;
      }
    }
  }

  @media (prefers-contrast: high) {
    .model-picker-trigger {
      background: hsl(0 0% 8%);
      border: 2px solid white;
    }

    .model-option {
      background: hsl(0 0% 8%);
      border: 1px solid white;
    }

    .model-option.active {
      border: 2px solid white;
    }
  }
</style>
