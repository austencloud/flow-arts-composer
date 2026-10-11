<!--
  ArenaStreakCounter.svelte - Session streak display

  Shows flame icon + consecutive vote count.
  Scale-bounces on increment. Milestone effects at 5, 10, 25, 50, 100.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  let { streak = 0 }: { streak: number } = $props();

  let prevStreak = $state(0);
  let bouncing = $state(false);
  let milestone = $state(false);

  const MILESTONES = new Set([5, 10, 25, 50, 100]);

  $effect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (streak > prevStreak && streak > 0) {
      bouncing = true;
      milestone = MILESTONES.has(streak);
      timeoutId = setTimeout(() => {
        bouncing = false;
        milestone = false;
      }, 600);
    }
    prevStreak = streak;

    return () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  });
</script>

{#if streak > 0}
  <div
    class="streak-counter"
    class:bouncing
    class:milestone
    role="status"
    aria-label={t('arena_battle_streak', { count: streak })}
  >
    <svg
      class="flame-icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="flame-grad" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stop-color="#f59e0b" />
          <stop offset="100%" stop-color="#ef4444" />
        </linearGradient>
      </defs>
      <path
        d="M12 2C12 2 6 8 6 13a6 6 0 0 0 12 0c0-5-6-11-6-11z"
        fill="url(#flame-grad)"
      />
      <path
        d="M12 9c0 0-3 3-3 5.5a3 3 0 0 0 6 0c0-2.5-3-5.5-3-5.5z"
        fill="#fbbf24"
        opacity="0.8"
      />
    </svg>
    <span class="streak-count">{streak}</span>
  </div>
{/if}

<style>
  .streak-counter {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 20px;
    background: color-mix(in srgb, var(--semantic-warning, #f59e0b) 12%, transparent);
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .streak-counter.bouncing {
    transform: scale(1.15);
  }

  .streak-counter.milestone {
    background: color-mix(in srgb, var(--semantic-warning, #f59e0b) 25%, transparent);
    box-shadow: 0 0 16px color-mix(in srgb, var(--semantic-warning, #f59e0b) 30%, transparent);
  }

  .streak-count {
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    color: var(--semantic-warning, #f59e0b);
    font-variant-numeric: tabular-nums;
  }

  .flame-icon {
    flex-shrink: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .streak-counter {
      transition: none;
    }

    .streak-counter.bouncing {
      transform: none;
    }
  }
</style>
