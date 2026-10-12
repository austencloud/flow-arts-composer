<script lang="ts">
  /**
   * SpeedControlBar - Animation speed selector
   *
   * Preset speed options: 0.25x, 0.5x, 1x, 2x
   */

  interface Props {
    /** Current speed value */
    value: number;
    /** Callback when speed changes */
    onchange: (speed: number) => void;
  }

  let { value, onchange }: Props = $props();

  const speeds = [0.25, 0.5, 1, 2];

  function formatSpeed(speed: number): string {
    if (speed === 0.25) return "\u00BC";
    if (speed === 0.5) return "\u00BD";
    return `${speed}`;
  }
</script>

<div class="speed-bar">
  {#each speeds as speed}
    <button
      class="speed-btn"
      class:active={value === speed}
      onclick={() => onchange(speed)}
      aria-label={`Speed: ${speed}x`}
      aria-pressed={value === speed}
    >
      {formatSpeed(speed)}&times;
    </button>
  {/each}
</div>

<style>
  .speed-bar {
    display: flex;
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 12px;
    padding: 4px;
  }

  .speed-btn {
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
    padding: 0 0.75rem;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 500;
    cursor: pointer;
    transition:
      background var(--duration-fast),
      color var(--duration-fast);
  }

  .speed-btn:hover {
    color: var(--theme-text, white);
    background: var(--theme-card-hover-bg);
  }

  .speed-btn.active {
    color: white;
    background: var(--theme-accent);
  }

  @media (max-width: 600px) {
    .speed-bar {
      padding: 2px;
    }

    .speed-btn {
      /* Touch target uses var(--min-touch-target) for WCAG AA */
      padding: 0 0.5rem;
      font-size: var(--font-size-compact, 0.75rem);
    }
  }
</style>
