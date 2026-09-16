<!--
  SaveToLibraryButton.svelte

  Save-to-library control for the sequence workspace header.
  The workspace decides whether it is an icon button or a labeled pill.
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { WORKSPACE_BUTTON_ICON } from "../../workspace-button-layout";

  // Props
  let {
    sequence = null,
    disabled = false,
    onclick,
  }: {
    sequence?: SequenceData | null;
    disabled?: boolean;
    onclick?: () => void;
  } = $props();

  // Resolve haptic feedback service
  const hapticService = getHapticFeedback();

  // Check if sequence has content worth saving
  const hasContent = $derived.by(() => {
    if (!sequence) return false;
    return (
      (sequence.steps?.length ?? 0) > 0 ||
      !!sequence.startPlacement ||
      !!sequence.startingPlacement
    );
  });

  const isDisabled = $derived(!hasContent || disabled);

  function handleClick() {
    if (isDisabled) return;
    hapticService?.trigger("success");
    onclick?.();
  }

  const tooltip = $derived(
    isDisabled ? "Create a sequence first" : "Save to Library"
  );
</script>

<button
  type="button"
  data-save-shortcut
  class="save-button"
  class:disabled={isDisabled}
  onclick={handleClick}
  disabled={isDisabled}
  title={tooltip}
  aria-label="Save to Library"
>
  <i class="fa-solid {WORKSPACE_BUTTON_ICON.save.icon}" aria-hidden="true"></i>
  <span class="workspace-action-label" aria-hidden="true">
    {WORKSPACE_BUTTON_ICON.save.visibleLabel}
  </span>
</button>

<style>
  .save-button {
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

    /* Purple gradient matching AddToLibraryButton */
    background: linear-gradient(
      135deg,
      var(--theme-accent-strong, var(--theme-accent-strong)) 0%,
      color-mix(
          in srgb,
          var(--theme-accent-strong, var(--theme-accent-strong)) 85%,
          var(--theme-accent-strong)
        )
        100%
    );
    border: 1px solid
      color-mix(
        in srgb,
        var(--theme-accent-strong, var(--theme-accent-strong)) 30%,
        transparent
      );
    box-shadow: 0 4px 12px
      color-mix(
        in srgb,
        var(--theme-accent-strong, var(--theme-accent-strong)) 40%,
        transparent
      );
  }

  .workspace-action-label {
    display: var(--workspace-action-label-display, none);
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
    line-height: 1;
    white-space: nowrap;
  }

  .save-button:hover:not(:disabled) {
    transform: scale(1.05);
    background: linear-gradient(
      135deg,
      color-mix(
          in srgb,
          var(--theme-accent-strong, var(--theme-accent-strong)) 85%,
          var(--theme-accent-strong)
        )
        0%,
      color-mix(
          in srgb,
          var(--theme-accent-strong, var(--theme-accent-strong)) 70%,
          var(--theme-accent-strong)
        )
        100%
    );
    box-shadow: 0 6px 16px
      color-mix(
        in srgb,
        var(--theme-accent-strong, var(--theme-accent-strong)) 60%,
        transparent
      );
  }

  .save-button:active:not(:disabled) {
    transform: scale(0.95);
    transition-duration: var(--duration-instant);
  }

  .save-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .save-button:disabled,
  .save-button.disabled {
    opacity: 0.4;
    cursor: not-allowed;
    pointer-events: none;
  }

  .save-button:disabled:hover,
  .save-button.disabled:hover {
    transform: none;
    background: linear-gradient(
      135deg,
      var(--theme-accent-strong, var(--theme-accent-strong)) 0%,
      color-mix(
          in srgb,
          var(--theme-accent-strong, var(--theme-accent-strong)) 85%,
          var(--theme-accent-strong)
        )
        100%
    );
    box-shadow: 0 4px 12px
      color-mix(
        in srgb,
        var(--theme-accent-strong, var(--theme-accent-strong)) 40%,
        transparent
      );
  }

  /* Mobile responsive - 48px minimum per iOS/Android guidelines */
  @media (max-width: 768px) {
    .save-button {
      width: var(--workspace-action-width, var(--min-touch-target));
      height: var(--min-touch-target);
      font-size: var(--font-size-base);
    }
  }

  @media (max-width: 480px) {
    .save-button {
      width: var(--workspace-action-width, var(--min-touch-target));
      height: var(--min-touch-target);
      font-size: var(--font-size-base);
    }
  }

  @media (max-width: 320px) {
    .save-button {
      width: var(--workspace-action-width, var(--min-touch-target));
      height: var(--min-touch-target);
      font-size: var(--font-size-sm);
    }
  }

  /* LANDSLOOPE MOBILE: Maintain 48px minimum for accessibility */
  @media (min-aspect-ratio: 17/10) and (max-height: 500px) {
    .save-button {
      width: var(--workspace-action-width, var(--min-touch-target));
      height: var(--min-touch-target);
      font-size: var(--font-size-sm);
    }
  }
</style>
