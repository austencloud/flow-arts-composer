<!--
LandscapeStepperValue.svelte - Centered value display for landscape stepper
-->
<script lang="ts">
  let { displayValue } = $props<{
    displayValue: string;
  }>();
</script>

<div class="stepper-value landscape-value" aria-live="polite">
  <span class="value-number">{displayValue}</span>
</div>

<style>
  .landscape-value {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);

    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;

    padding: 0 clamp(6px, 1.5cqw, 12px);
    font-size: clamp(18px, 5cqh, 28px);
    font-weight: 700;
    color: var(--text-color);
    text-align: center;
    line-height: 1.2;

    pointer-events: none;
    white-space: nowrap;
    z-index: 3;
    transition: color var(--duration-dramatic) cubic-bezier(0.4, 0, 0.2, 1);
  }

  @media (min-width: 1280px) {
    .landscape-value {
      font-size: clamp(32px, 8cqh, 48px);
    }
  }
</style>
