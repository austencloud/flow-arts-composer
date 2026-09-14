<!--
  ClearSequencePanelButton.svelte

  Clear sequence button for ButtonPanel (panel-style, not floating).
  Clears the entire sequence when clicked.
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { WORKSPACE_BUTTON_ICON } from "../../workspace-button-layout";

  // Props
  const {
    onclick,
    disabled = false,
    label = "Clear sequence",
  }: {
    onclick?: () => void;
    disabled?: boolean;
    label?: string;
  } = $props();

  // Services
  const hapticService = getHapticFeedback();

  function handleClick() {
    hapticService?.trigger("selection");
    onclick?.();
  }
</script>

<button
  type="button"
  {disabled}
  class="panel-button clear-button"
  data-testid="clear-sequence-button"
  data-ghost="safe"
  data-ghost-kind="clear"
  data-ghost-label={label}
  onclick={handleClick}
  aria-label={label}
  title={label}
>
  <i class="fa-solid {WORKSPACE_BUTTON_ICON.clear.icon}" aria-hidden="true"></i>
  <span class="workspace-action-label" aria-hidden="true">
    {WORKSPACE_BUTTON_ICON.clear.visibleLabel}
  </span>
</button>

<style>
  .panel-button {
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: var(--workspace-action-width, var(--min-touch-target));
    min-width: var(--min-touch-target);
    height: var(--min-touch-target);
    gap: var(--workspace-action-gap, 0);
    padding-inline: var(--workspace-action-padding-inline, 0);
    border-radius: var(--workspace-action-radius, 50%);
    cursor: pointer;
    transition:
      transform var(--duration-emphasis) cubic-bezier(0.4, 0, 0.2, 1),
      background var(--duration-fast) ease,
      border-color var(--duration-fast) ease,
      box-shadow var(--duration-fast) ease;
    font-size: var(--font-size-lg);
    color: var(--theme-text);

    /* Base button styling */
    background: var(--theme-stroke);
    border: 1px solid var(--theme-stroke-strong);
    box-shadow: 0 2px 8px var(--theme-shadow);
  }

  .workspace-action-label {
    display: var(--workspace-action-label-display, none);
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
    line-height: 1;
    white-space: nowrap;
  }

  .panel-button:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 12px var(--theme-shadow);
  }

  .panel-button:active {
    transform: scale(0.95);
    transition-duration: var(--duration-instant);
  }

  .panel-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .clear-button {
    background: color-mix(
      in srgb,
      var(--semantic-error, var(--semantic-error)) 80%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-error, var(--semantic-error)) 30%,
      transparent
    );
    box-shadow: 0 4px 12px
      color-mix(
        in srgb,
        var(--semantic-error, var(--semantic-error)) 40%,
        transparent
      );
  }

  .clear-button:hover {
    background: color-mix(
      in srgb,
      var(--semantic-error, var(--semantic-error)) 90%,
      transparent
    );
    box-shadow: 0 6px 16px
      color-mix(
        in srgb,
        var(--semantic-error, var(--semantic-error)) 60%,
        transparent
      );
  }

  .panel-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .panel-button {
      transition: none;
    }
  }

  /* Mobile responsive - 48px minimum per iOS/Android guidelines */
  @media (max-width: 768px) {
    .panel-button {
      width: var(--workspace-action-width, var(--min-touch-target));
      height: var(--min-touch-target);
      font-size: var(--font-size-base);
    }
  }

  @media (max-width: 480px) {
    .panel-button {
      width: var(--workspace-action-width, var(--min-touch-target));
      height: var(--min-touch-target);
      font-size: var(--font-size-base);
    }
  }

  @media (max-width: 320px) {
    .panel-button {
      width: var(--workspace-action-width, var(--min-touch-target));
      height: var(--min-touch-target);
      font-size: var(--font-size-sm);
    }
  }

  /* 🎯 LANDSLOOPE MOBILE: Maintain 48px minimum for accessibility */
  @media (min-aspect-ratio: 17/10) and (max-height: 500px) {
    .panel-button {
      width: var(--workspace-action-width, var(--min-touch-target));
      height: var(--min-touch-target);
      font-size: var(--font-size-sm);
    }
  }
</style>
