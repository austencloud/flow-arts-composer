<!--
StreakDisplay - Shows current answer streak with tiered celebration animations.
Streak 1-2: subtle glow. Streak 3-4: bounce + particles. Streak 5+: accent pulse.
Reset triggers a crack/fade animation.
-->
<script lang="ts">
  interface Props {
    streak: number;
    bestStreak: number;
  }

  let { streak, bestStreak }: Props = $props();

  // Track previous streak for detecting resets
  let prevStreak = $state(0);
  let justReset = $state(false);
  let resetTimer: ReturnType<typeof setTimeout> | null = null;

  // Celebration tier derived from current streak
  const tier = $derived.by((): "none" | "glow" | "bounce" | "pulse" => {
    if (streak === 0) return "none";
    if (streak <= 2) return "glow";
    if (streak <= 4) return "bounce";
    return "pulse";
  });

  $effect(() => {
    const current = streak;
    if (prevStreak > 0 && current === 0) {
      justReset = true;
      if (resetTimer !== null) clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        justReset = false;
      }, 600);
    }
    prevStreak = current;
  });
</script>

<div
  class="streak-display"
  class:tier-glow={tier === "glow"}
  class:tier-bounce={tier === "bounce"}
  class:tier-pulse={tier === "pulse"}
  class:just-reset={justReset}
  aria-label="Current streak: {streak}. Best streak: {bestStreak}."
>
  <div class="streak-main">
    <span class="streak-icon" aria-hidden="true">
      {#if streak >= 5}
        <!-- Fire for 5+ -->
        &#x1F525;
      {:else if streak >= 3}
        <!-- Zap for 3-4 -->
        &#x26A1;
      {:else if streak >= 1}
        <!-- Star for 1-2 -->
        &#x2B50;
      {:else}
        <!-- Empty circle for 0 -->
        &#x25CB;
      {/if}
    </span>
    <span class="streak-number">{streak}</span>
  </div>

  {#if bestStreak > 0}
    <span class="best-streak">Best: {bestStreak}</span>
  {/if}

  <!-- CSS pseudo-element particles are handled via the tier-bounce class -->
</div>

<style>
  .streak-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.125rem;
    padding: 0.5rem 1rem;
    min-width: 60px;
    position: relative;
  }

  .streak-main {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .streak-icon {
    font-size: 1.125rem;
    line-height: 1;
  }

  .streak-number {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--theme-text, #ffffff);
    line-height: 1;
    transition: transform 0.2s ease, color 0.2s ease;
  }

  .best-streak {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text, rgba(255, 255, 255, 0.4));
    font-weight: 500;
  }

  /* Tier: Glow (streak 1-2) */
  .tier-glow .streak-number {
    color: var(--theme-accent, #60a5fa);
    text-shadow: 0 0 8px color-mix(in srgb, var(--theme-accent, #60a5fa) 40%, transparent);
  }

  /* Tier: Bounce (streak 3-4) */
  .tier-bounce .streak-number {
    color: var(--semantic-warning, #f59e0b);
    animation: streak-bounce 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    text-shadow: 0 0 12px color-mix(in srgb, var(--semantic-warning, #f59e0b) 50%, transparent);
  }

  /* Particle effect via pseudo-element */
  .tier-bounce::after {
    content: "";
    position: absolute;
    top: 0.25rem;
    left: 50%;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--semantic-warning, #f59e0b);
    box-shadow:
      -8px -4px 0 var(--semantic-warning, #f59e0b),
      8px -6px 0 var(--semantic-warning, #f59e0b),
      -4px -10px 0 var(--semantic-warning, #f59e0b),
      6px -2px 0 var(--semantic-warning, #f59e0b);
    animation: particles-burst 0.5s ease-out forwards;
    pointer-events: none;
  }

  /* Tier: Pulse (streak 5+) */
  .tier-pulse .streak-number {
    color: var(--semantic-success, #22c55e);
    animation: streak-pulse 1s ease-in-out infinite;
    text-shadow: 0 0 16px color-mix(in srgb, var(--semantic-success, #22c55e) 60%, transparent);
  }

  /* Reset: crack/fade */
  .just-reset .streak-number {
    animation: streak-crack 0.5s ease-out;
    color: var(--semantic-error, #ef4444);
  }

  /* Keyframes */
  @keyframes streak-bounce {
    0% {
      transform: scale(1);
    }
    40% {
      transform: scale(1.4);
    }
    70% {
      transform: scale(0.95);
    }
    100% {
      transform: scale(1);
    }
  }

  @keyframes streak-pulse {
    0%,
    100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.08);
      opacity: 0.85;
    }
  }

  @keyframes streak-crack {
    0% {
      transform: scale(1);
      opacity: 1;
    }
    30% {
      transform: scale(1.1) rotate(-3deg);
    }
    60% {
      transform: scale(0.9) rotate(2deg);
      opacity: 0.6;
    }
    100% {
      transform: scale(1) rotate(0deg);
      opacity: 1;
    }
  }

  @keyframes particles-burst {
    0% {
      opacity: 1;
      transform: translateX(-50%) scale(1);
    }
    100% {
      opacity: 0;
      transform: translateX(-50%) scale(1.8) translateY(-8px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tier-glow .streak-number,
    .tier-bounce .streak-number,
    .tier-pulse .streak-number,
    .just-reset .streak-number {
      animation: none;
      text-shadow: none;
    }

    .streak-number {
      transition: none;
    }

    .tier-bounce::after {
      display: none;
    }
  }
</style>
