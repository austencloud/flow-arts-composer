<!--
  SequenceActionsButton.svelte

  Opens a sheet with various sequence actions (Animate, Mirror, Rotate, etc.)
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { WORKSPACE_BUTTON_ICON } from "../../workspace-button-layout";

  let { onclick } = $props<{
    onclick?: () => void;
  }>();

  // Resolve haptic feedback service
  const hapticService = getHapticFeedback();

  function handleClick() {
    hapticService?.trigger("selection");
    onclick?.();
  }
</script>

<button
  class="sequence-actions-button glass-button"
  onclick={handleClick}
  aria-label={t("create_ui_sequence_actions")}
  title={t("create_ui_sequence_actions")}
  data-testid="sequence-actions-button"
  data-ghost="safe"
  data-ghost-kind="sequence-actions"
  data-ghost-label="Sequence actions"
>
  <i
    class="fa-solid {WORKSPACE_BUTTON_ICON['sequence-actions'].icon}"
    aria-hidden="true"
  ></i>
  <span class="workspace-action-label" aria-hidden="true">
    {WORKSPACE_BUTTON_ICON["sequence-actions"].visibleLabel}
  </span>
</button>

<style>
  .sequence-actions-button {
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: var(--workspace-action-width, var(--min-touch-target));
    min-width: var(--min-touch-target);
    height: var(--min-touch-target);
    gap: var(--workspace-action-gap, 0);
    padding-inline: var(--workspace-action-padding-inline, 0);
    border: 1px solid
      color-mix(in srgb, var(--semantic-success, #22c55e) 72%, white);
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--semantic-success, #22c55e) 84%, white) 0%,
      color-mix(in srgb, var(--semantic-success, #22c55e) 74%, #065f46) 100%
    );
    border-radius: var(--workspace-action-radius, 50%);
    color: var(--theme-text);
    cursor: pointer;
    transition:
      transform var(--duration-emphasis) cubic-bezier(0.4, 0, 0.2, 1),
      background var(--duration-fast) ease,
      border-color var(--duration-fast) ease,
      box-shadow var(--duration-fast) ease;
    box-shadow:
      0 5px 14px
        color-mix(in srgb, var(--semantic-success, #22c55e) 52%, transparent),
      inset 0 1px 0 rgba(255, 255, 255, 0.28);
  }

  .workspace-action-label {
    display: var(--workspace-action-label-display, none);
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
    line-height: 1;
    white-space: nowrap;
  }

  .sequence-actions-button:hover {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--semantic-success, #22c55e) 76%, white) 0%,
      color-mix(in srgb, var(--semantic-success, #22c55e) 68%, #065f46) 100%
    );
    transform: scale(1.05);
    box-shadow: 0 6px 16px
      color-mix(in srgb, var(--semantic-success, #22c55e) 64%, transparent);
  }

  .sequence-actions-button:active {
    transform: scale(0.95);
    transition-duration: var(--duration-instant);
  }

  .sequence-actions-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .sequence-actions-button i {
    font-size: var(--font-size-lg);
  }

  /* Mobile responsive - 48px minimum per iOS/Android guidelines */
  @media (max-width: 768px) {
    .sequence-actions-button {
      width: var(--min-touch-target);
      height: var(--min-touch-target);
      font-size: var(--font-size-base);
    }
  }

  @media (max-width: 480px) {
    .sequence-actions-button {
      width: var(--min-touch-target); /* Maintain 48px minimum */
      height: var(--min-touch-target);
      font-size: var(--font-size-base);
    }
  }

  @media (max-width: 320px) {
    .sequence-actions-button {
      width: var(--min-touch-target); /* NEVER below 48px for accessibility */
      height: var(--min-touch-target);
      font-size: var(--font-size-sm);
    }
  }

  /* Landscape mobile: Maintain 48px minimum */
  @media (min-aspect-ratio: 17/10) and (max-height: 500px) {
    .sequence-actions-button {
      width: var(
        --min-touch-target
      ); /* Maintain 48px minimum for accessibility */
      height: var(--min-touch-target);
    }

    .sequence-actions-button i {
      font-size: var(--font-size-base);
    }
  }

  /* High contrast mode */
  @media (prefers-contrast: high) {
    .sequence-actions-button {
      background: var(--theme-card-hover-bg);
      border: 2px solid var(--theme-stroke-strong);
      color: var(--theme-text);
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .sequence-actions-button {
      transition: none;
    }

    .sequence-actions-button:hover {
      transform: none;
    }

    .sequence-actions-button:active {
      transform: none;
    }
  }
</style>
