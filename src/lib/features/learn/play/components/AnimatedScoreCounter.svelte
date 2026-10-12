<!--
AnimatedScoreCounter - Counts up from 0 to final score with spring animation

Features:
- Counts up smoothly on mount
- Different colors based on performance tier
- Optional percentage display
-->
<script lang="ts">
  import { Tween } from "svelte/motion";
  import { cubicOut } from "svelte/easing";

  interface Props {
    value: number;
    suffix?: string;
    duration?: number;
    delay?: number;
    tier?: "excellent" | "good" | "needs-work" | "default";
  }

  let {
    value,
    suffix = "",
    duration = 1000,
    delay = 0,
    tier = "default",
  }: Props = $props();

  const displayValue = $derived.by(
    () =>
      new Tween(0, {
        duration,
        easing: cubicOut,
      })
  );

  // Start animation after delay when component mounts
  $effect(() => {
    const timeout = setTimeout(() => {
      displayValue.set(value);
    }, delay);

    return () => clearTimeout(timeout);
  });

  // Format with appropriate decimal places
  const formattedValue = $derived(Math.round(displayValue.current));
</script>

<div
  class="counter"
  class:excellent={tier === "excellent"}
  class:good={tier === "good"}
  class:needs-work={tier === "needs-work"}
>
  <span class="value">{formattedValue}</span>
  {#if suffix}
    <span class="suffix">{suffix}</span>
  {/if}
</div>

<style>
  .counter {
    display: flex;
    align-items: baseline;
    gap: 0.125rem;
  }

  .value {
    font-size: 3rem;
    font-weight: 800;
    color: var(--theme-text, #ffffff);
    font-variant-numeric: tabular-nums;
    transition: color var(--duration-emphasis) var(--ease-standard);
  }

  .suffix {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--theme-text-dim, #9ca3af);
  }

  /* Performance tiers */
  .excellent .value {
    color: var(--semantic-success);
    text-shadow: 0 0 20px
      color-mix(in srgb, var(--semantic-success) 40%, transparent);
  }

  .good .value {
    color: var(--semantic-warning);
    text-shadow: 0 0 20px
      color-mix(in srgb, var(--semantic-warning) 40%, transparent);
  }

  .needs-work .value {
    color: var(--semantic-error);
  }

  /* Responsive */
  @media (max-width: 640px) {
    .value {
      font-size: 2.5rem;
    }

    .suffix {
      font-size: 1.25rem;
    }
  }

  @media (min-width: 1920px) {
    .value {
      font-size: 4rem;
    }

    .suffix {
      font-size: 2rem;
    }
  }
</style>
