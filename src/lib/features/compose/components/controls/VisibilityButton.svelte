<!--
  VisibilityButton.svelte

  Single motion visibility toggle button (eye icon).
  Uses the canonical palette while addressing motion by performer hand.
-->
<script lang="ts">
  type HandSide = "left" | "right";

  let {
    hand = "left",
    isVisible = true,
    onToggle = () => {},
  }: {
    hand?: HandSide;
    isVisible?: boolean;
    onToggle?: () => void;
  } = $props();

  const colorClass = $derived(
    hand === "left" ? "blue-vis-btn" : "red-vis-btn"
  );
  const ariaLabel = $derived(
    isVisible ? `Hide ${hand} motion` : `Show ${hand} motion`
  );
</script>

<button
  class="vis-btn {colorClass}"
  class:active={isVisible}
  onclick={onToggle}
  type="button"
  aria-label={ariaLabel}
>
  <i class="fas {isVisible ? 'fa-eye' : 'fa-eye-slash'}" aria-hidden="true"></i>
</button>

<style>
  /* Visibility Buttons */
  .vis-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: var(--min-touch-target);
    min-width: var(--min-touch-target);
    width: var(--min-touch-target);
    padding: 0;
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 12px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-base);
    cursor: pointer;
    transition: all var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
    -webkit-tap-highlight-color: transparent;
    flex-shrink: 0;
  }

  @media (hover: hover) and (pointer: fine) {
    .vis-btn:hover {
      background: var(--theme-card-hover-bg);
      border-color: var(--theme-stroke-strong);
      color: var(--theme-text-dim, var(--theme-text-dim));
      transform: translateY(-1px);
    }
  }

  .vis-btn:active {
    transform: scale(0.97);
  }

  .vis-btn.active.blue-vis-btn {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--prop-blue) 25%, transparent) 0%,
      color-mix(in srgb, var(--prop-blue) 20%, transparent) 100%
    );
    border-color: color-mix(in srgb, var(--prop-blue) 50%, transparent);
    color: color-mix(in srgb, var(--prop-blue) 60%, white);
    box-shadow:
      0 2px 12px color-mix(in srgb, var(--prop-blue) 20%, transparent),
      0 0 16px color-mix(in srgb, var(--prop-blue) 15%, transparent),
      inset 0 1px 0 var(--theme-stroke);
  }

  .vis-btn.active.red-vis-btn {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--prop-red) 25%, transparent) 0%,
      color-mix(in srgb, var(--prop-red) 20%, transparent) 100%
    );
    border-color: color-mix(in srgb, var(--prop-red) 50%, transparent);
    color: color-mix(in srgb, var(--prop-red) 60%, white);
    box-shadow:
      0 2px 12px color-mix(in srgb, var(--prop-red) 20%, transparent),
      0 0 16px color-mix(in srgb, var(--prop-red) 15%, transparent),
      inset 0 1px 0 var(--theme-stroke);
  }

  /* Responsive adjustments - maintain 48px touch target for WCAG AAA */
  @media (max-width: 375px) and (max-height: 670px) {
    .vis-btn {
      font-size: var(--font-size-sm);
    }
  }
</style>
