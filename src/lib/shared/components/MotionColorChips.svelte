<!--
  MotionColorChips.svelte

  Reusable Left (blue) / Right (red) toggle chips for motion visibility.

  Toggle logic: clicking an active chip when the other is also active solos
  that chip off. Clicking the last active chip reactivates both (at least one
  must remain visible).

  Used by:
  - MotionVisibilityToggle (sequence viewer)
  - ViewModeToggle (browse toolbar)
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  interface Props {
    showLeft: boolean;
    showRight: boolean;
    onToggleLeft: () => void;
    onToggleRight: () => void;
    leftLabel?: string;
    rightLabel?: string;
    layout?: "row" | "column";
    showVisibilityIcons?: boolean;
  }

  let {
    showLeft,
    showRight,
    onToggleLeft,
    onToggleRight,
    leftLabel,
    rightLabel,
    layout = "row",
    showVisibilityIcons = false,
  }: Props = $props();
  const resolvedLeftLabel = $derived(leftLabel ?? t("shared_controls_left"));
  const resolvedRightLabel = $derived(rightLabel ?? t("shared_controls_right"));
</script>

<div
  class="motion-color-chips"
  class:column={layout === "column"}
  role="group"
  aria-label={t("shared_controls_motion_visibility")}
>
  <button
    type="button"
    class="chip blue"
    class:active={showLeft}
    onclick={() => onToggleLeft()}
    aria-pressed={showLeft}
    aria-label={t(
      showLeft ? "shared_controls_hide_motion" : "shared_controls_show_motion",
      { hand: resolvedLeftLabel }
    )}
  >
    {#if showVisibilityIcons}
      <i class="fas {showLeft ? 'fa-eye' : 'fa-eye-slash'}" aria-hidden="true"
      ></i>
    {/if}
    {resolvedLeftLabel}
  </button>
  <button
    type="button"
    class="chip red"
    class:active={showRight}
    onclick={() => onToggleRight()}
    aria-pressed={showRight}
    aria-label={t(
      showRight ? "shared_controls_hide_motion" : "shared_controls_show_motion",
      { hand: resolvedRightLabel }
    )}
  >
    {#if showVisibilityIcons}
      <i class="fas {showRight ? 'fa-eye' : 'fa-eye-slash'}" aria-hidden="true"
      ></i>
    {/if}
    {resolvedRightLabel}
  </button>
</div>

<style>
  .motion-color-chips {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .motion-color-chips.column {
    flex-direction: column;
    align-items: stretch;
    width: 100%;
  }

  .chip {
    padding: 6px 14px;
    border-radius: 8px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    background: transparent;
    color: rgba(255, 255, 255, 0.62);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition:
      background 160ms ease,
      color 160ms ease,
      border-color 160ms ease;
    min-width: var(--min-touch-target, 44px);
    min-height: var(--min-touch-target, 44px);
  }

  .chip.blue {
    color: color-mix(
      in srgb,
      var(--motion-left-color, var(--prop-blue, #2196f3)) 72%,
      var(--theme-text, #fff)
    );
  }

  .chip.red {
    color: color-mix(
      in srgb,
      var(--motion-right-color, var(--prop-red, #f44336)) 72%,
      var(--theme-text, #fff)
    );
  }

  .chip:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.06));
    filter: brightness(1.18);
  }

  .chip.blue.active {
    background: color-mix(
      in srgb,
      var(--motion-left-color, var(--prop-blue, #2196f3)) 22%,
      transparent
    );
    border-color: var(--motion-left-color, var(--prop-blue, #2196f3));
    color: #fff;
  }

  .chip.red.active {
    background: color-mix(
      in srgb,
      var(--motion-right-color, var(--prop-red, #f44336)) 22%,
      transparent
    );
    border-color: var(--motion-right-color, var(--prop-red, #f44336));
    color: #fff;
  }

  .chip i {
    margin-right: 6px;
  }
</style>
