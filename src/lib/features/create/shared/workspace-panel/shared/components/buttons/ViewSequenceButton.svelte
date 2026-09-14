<!--
  ViewSequenceButton.svelte

  View button that opens the sequence viewer for animation and export.
  Public demos also reuse its appearance for real inline playback, so the
  purpose prop keeps the accessible copy accurate for both actions.
  Choreographed entrance: hatches from nothing, overshoots, settles, then breathes.
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { WORKSPACE_BUTTON_ICON } from "../../workspace-button-layout";

  let {
    onclick,
    isActive = false,
    purpose = "open-viewer",
    isStopping = false,
    playbackState = "idle",
  } = $props<{
    onclick?: () => void;
    isActive?: boolean;
    purpose?: "open-viewer" | "expand-viewer" | "play";
    isStopping?: boolean;
    playbackState?: "idle" | "preparing" | "retry";
  }>();

  const icon = $derived(
    playbackState === "preparing"
      ? "fa-spinner fa-spin"
      : playbackState === "retry"
        ? "fa-rotate-right"
        : isStopping
          ? "fa-stop"
          : purpose === "play"
            ? "fa-play"
            : purpose === "expand-viewer"
              ? "fa-expand"
              : WORKSPACE_BUTTON_ICON.view.icon
  );
  const accessibleLabel = $derived(
    playbackState === "preparing"
      ? "Cancel playback preparation"
      : playbackState === "retry"
        ? "Retry playback after loading failed"
        : isStopping
          ? "Stop playback and return to card"
          : purpose === "play"
            ? WORKSPACE_BUTTON_ICON.view.actionLabel
            : purpose === "expand-viewer"
              ? "Expand sequence viewer"
              : "Open sequence viewer"
  );
  const visibleLabel = $derived(
    playbackState === "preparing"
      ? "Cancel"
      : playbackState === "retry"
        ? "Retry"
        : isStopping
          ? "Stop"
          : purpose === "play"
            ? WORKSPACE_BUTTON_ICON.view.visibleLabel
            : "View"
  );

  /**
   * The presenter's role follows the action: Construct and public demos play
   * inline; other creation methods can open the full viewer.
   */
  const ghostKind = $derived(
    isActive ? undefined : purpose === "play" ? "play" : "viewer"
  );

  // Resolve haptic feedback service
  const hapticService = getHapticFeedback();

  function handleClick() {
    hapticService?.trigger("selection");
    onclick?.();
  }
</script>

<button
  class="view-sequence-button glass-button"
  class:active={isActive}
  class:play-purpose={purpose === "play"}
  class:expand-purpose={purpose === "expand-viewer"}
  class:stopping={isStopping}
  class:preparing={playbackState === "preparing"}
  class:retry={playbackState === "retry"}
  onclick={handleClick}
  aria-label={accessibleLabel}
  data-ghost={isActive ? undefined : "safe"}
  data-ghost-kind={ghostKind}
  data-ghost-label={accessibleLabel}
  aria-pressed={purpose === "open-viewer" ? isActive : undefined}
  title={accessibleLabel}
>
  <i class="fa-solid {icon}" aria-hidden="true"></i>
  <span class="workspace-action-label" aria-hidden="true">
    {visibleLabel}
  </span>
</button>

<style>
  .view-sequence-button {
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: var(--workspace-action-width, var(--min-touch-target));
    min-width: var(--min-touch-target);
    height: var(--min-touch-target);
    gap: var(--workspace-action-gap, 0);
    padding-inline: var(--workspace-action-padding-inline, 0);
    background: linear-gradient(
      135deg,
      var(--semantic-success) 0%,
      color-mix(in srgb, var(--semantic-success) 85%, #059669) 100%
    );
    border: 1px solid
      color-mix(in srgb, var(--semantic-success) 30%, transparent);
    border-radius: var(--workspace-action-radius, 50%);
    color: var(--theme-text);
    cursor: pointer;
    box-shadow: 0 4px 12px
      color-mix(in srgb, var(--semantic-success) 40%, transparent);

    /*
      Choreographed entrance:
      1. arrive (400ms) - fade in, gentle scale up
      2. breathe (2.4s) - scale + glow pulse, loops forever
    */
    animation:
      arrive 400ms ease-out both,
      breathe 2.4s ease-in-out 0.5s infinite;
  }

  .view-sequence-button.play-purpose {
    width: var(--workspace-play-action-width, 50px);
    min-width: 50px;
    height: var(--workspace-play-action-height, 50px);
    border-width: 2px;
    transform-origin: center bottom;
    box-shadow:
      0 6px 18px color-mix(in srgb, var(--semantic-success) 55%, transparent),
      0 0 24px color-mix(in srgb, var(--semantic-success) 25%, transparent);
    animation:
      play-arrive 400ms ease-out both,
      play-glow 2.4s ease-in-out 0.5s infinite;
  }

  .view-sequence-button.expand-purpose {
    border-color: color-mix(in srgb, var(--semantic-info) 72%, white);
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--semantic-info) 84%, white) 0%,
      color-mix(in srgb, var(--semantic-info) 74%, #075985) 100%
    );
    box-shadow:
      0 5px 14px color-mix(in srgb, var(--semantic-info) 52%, transparent),
      inset 0 1px 0 rgba(255, 255, 255, 0.28);
    animation: none;
  }

  .view-sequence-button.expand-purpose i {
    font-size: var(--font-size-lg);
  }

  .view-sequence-button.expand-purpose:hover {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--semantic-info) 76%, white) 0%,
      color-mix(in srgb, var(--semantic-info) 68%, #075985) 100%
    );
    box-shadow: 0 6px 16px
      color-mix(in srgb, var(--semantic-info) 64%, transparent);
    transform: scale(1.05);
  }

  @media (prefers-reduced-motion: reduce) {
    .view-sequence-button.expand-purpose:hover {
      transform: none;
    }
  }

  .workspace-action-label {
    display: var(--workspace-action-label-display, none);
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
    line-height: 1;
    white-space: nowrap;
  }

  @keyframes play-arrive {
    from {
      opacity: 0;
    }

    to {
      opacity: 1;
    }
  }

  @keyframes play-glow {
    0%,
    100% {
      box-shadow:
        0 5px 14px color-mix(in srgb, var(--semantic-success) 45%, transparent),
        0 0 18px color-mix(in srgb, var(--semantic-success) 20%, transparent);
    }

    50% {
      box-shadow:
        0 6px 18px color-mix(in srgb, var(--semantic-success) 55%, transparent),
        0 0 24px color-mix(in srgb, var(--semantic-success) 30%, transparent);
    }
  }

  .view-sequence-button.play-purpose i {
    font-size: clamp(1.25rem, 5cqi, 1.75rem);
  }

  .view-sequence-button.play-purpose:not(.stopping):not(.preparing):not(.retry)
    i {
    transform: translateX(0.08em);
  }

  .view-sequence-button.retry {
    animation: none;
  }

  @keyframes arrive {
    from {
      opacity: 0;
      transform: scale(0.85);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* Gentle breathing - scale + glow expand together */
  @keyframes breathe {
    0%,
    100% {
      transform: scale(1);
      box-shadow: 0 4px 12px
        color-mix(in srgb, var(--semantic-success) 40%, transparent);
    }
    50% {
      transform: scale(1.06);
      box-shadow:
        0 4px 16px color-mix(in srgb, var(--semantic-success) 50%, transparent),
        0 0 24px color-mix(in srgb, var(--semantic-success) 35%, transparent);
    }
  }

  .view-sequence-button:hover {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--semantic-success) 85%, #059669) 0%,
      color-mix(in srgb, var(--semantic-success) 70%, #059669) 100%
    );
    transform: scale(1.1);
    box-shadow:
      0 6px 20px color-mix(in srgb, var(--semantic-success) 60%, transparent),
      0 0 28px color-mix(in srgb, var(--semantic-success) 40%, transparent);
    animation: none;
  }

  .view-sequence-button:active {
    transform: scale(0.92);
    transition: transform 80ms ease;
  }

  .view-sequence-button.play-purpose:active {
    transform: none;
  }

  .view-sequence-button:focus-visible {
    outline: 2px solid var(--theme-accent, var(--semantic-success));
    outline-offset: 2px;
  }

  .view-sequence-button.active {
    background: linear-gradient(135deg, var(--semantic-success), #059669);
    box-shadow: 0 6px 20px
      color-mix(in srgb, var(--semantic-success) 70%, transparent);
  }

  .view-sequence-button i {
    font-size: var(--font-size-lg);
  }

  /* Mobile responsive adjustments - ALWAYS 48px minimum per iOS/Android guidelines */
  @media (max-width: 768px) {
    .view-sequence-button {
      width: var(--min-touch-target);
      height: var(--min-touch-target);
      font-size: var(--font-size-base);
    }

    .view-sequence-button.preparing i {
      animation: none;
    }
  }

  @media (max-width: 480px) {
    .view-sequence-button {
      width: var(--min-touch-target);
      height: var(--min-touch-target);
      font-size: var(--font-size-base);
    }

    .view-sequence-button i {
      font-size: var(--font-size-base);
    }
  }

  @media (max-width: 320px) {
    .view-sequence-button {
      width: var(--min-touch-target);
      height: var(--min-touch-target);
      font-size: var(--font-size-base);
    }

    .view-sequence-button i {
      font-size: var(--font-size-sm);
    }
  }

  /* Landscape mobile: Maintain 48px minimum */
  @media (min-aspect-ratio: 17/10) and (max-height: 500px) {
    .view-sequence-button {
      width: var(--min-touch-target);
      height: var(--min-touch-target);
    }

    .view-sequence-button i {
      font-size: var(--font-size-base);
    }
  }

  /* High contrast mode */
  @media (prefers-contrast: high) {
    .view-sequence-button {
      background: color-mix(in srgb, var(--semantic-success) 30%, transparent);
      border: 2px solid
        color-mix(in srgb, var(--semantic-success) 70%, transparent);
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .view-sequence-button {
      transition: none;
      animation: none;
    }

    .view-sequence-button:hover {
      transform: none;
    }

    .view-sequence-button:active {
      transform: none;
    }
  }
</style>
