<!--
StepperButtonVisual.svelte - Visual indicator for stepper buttons
Non-interactive visual element that shows +/- icons
-->
<script lang="ts">
  let { type } = $props<{
    type: "increment" | "decrement";
  }>();
</script>

<div class="stepper-button-visual {type}-visual">
  {#if type === "increment"}
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  {:else}
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
    >
      <path d="M5 12h14" />
    </svg>
  {/if}
</div>

<style>
  /* Portrait mode: Visual button indicators (non-interactive) */
  .stepper-button-visual {
    display: flex;
    align-items: center;
    justify-content: center;
    width: clamp(26px, 6.5cqh, 40px);
    height: clamp(26px, 6.5cqh, 40px);
    flex-shrink: 0;

    background: color-mix(in srgb, var(--text-color) 15%, transparent);
    border: 2px solid color-mix(in srgb, var(--text-color) 30%, transparent);
    border-radius: 50%;
    color: var(--text-color);

    pointer-events: none;
    z-index: 2;

    transition:
      color var(--duration-dramatic) var(--ease-standard),
      background var(--duration-dramatic) var(--ease-standard),
      border-color var(--duration-dramatic) var(--ease-standard),
      transform var(--duration-normal) var(--ease-standard);
  }

  .stepper-button-visual svg {
    width: 60%;
    height: 60%;
  }

  /* Desktop optimization: Larger controls */
  @media (min-width: 1280px) {
    .stepper-button-visual {
      width: clamp(42px, 10cqh, 60px);
      height: clamp(42px, 10cqh, 60px);
    }
  }
</style>
