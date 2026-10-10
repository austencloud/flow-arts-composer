<!--
StepperValue.svelte - Displays the current value in the stepper
-->
<script lang="ts">
  let { displayValue } = $props<{
    displayValue: string;
  }>();
</script>

<div class="stepper-value portrait-value" aria-live="polite">
  <span class="value-number">{displayValue}</span>
</div>

<style>
  /* Portrait mode: Value display */
  .portrait-value {
    font-size: clamp(24px, 4cqh, 24px);
    font-weight: 700;
    color: var(--text-color);
    text-align: center;
    line-height: 1;
    white-space: nowrap;
    flex-shrink: 0;
    transition: color var(--duration-dramatic) cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* Desktop optimization */
  @media (min-width: 1280px) {
    .portrait-value {
      font-size: clamp(36px, 12cqh, 60px);
    }
  }
</style>
