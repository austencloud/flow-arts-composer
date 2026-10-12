<script lang="ts">
  /**
   * ProgressBar - Deterministic fill bar (0-100%) with optional label.
   */

  interface Props {
    /** Progress percentage (0-100). Clamped internally. */
    percent: number;
    /** Text label beside the bar (e.g. "3 / 8"). */
    label?: string;
    /** Show numeric percentage. Default false. */
    showPercent?: boolean;
    /** Bar color. Defaults to theme accent. */
    color?: string;
    /** Bar height in pixels. Default 6. */
    height?: number;
  }

  let {
    percent,
    label,
    showPercent = false,
    color,
    height = 6,
  }: Props = $props();

  const clamped = $derived(Math.max(0, Math.min(100, percent)));
  const isActive = $derived(clamped > 0 && clamped < 100);
  const hasLabelRow = $derived(!!label || showPercent);
</script>

<div class="progress-bar-wrapper" style:--bar-color={color}>
  <div
    class="track"
    style:height="{height}px"
    role="progressbar"
    aria-valuenow={clamped}
    aria-valuemin={0}
    aria-valuemax={100}
  >
    <div class="fill" style:width="{clamped}%">
      {#if isActive}
        <div class="shimmer"></div>
      {/if}
    </div>
  </div>

  {#if hasLabelRow}
    <div class="label-row">
      {#if label}
        <span class="label-text">{label}</span>
      {/if}
      {#if showPercent}
        <span class="percent-text">{Math.round(clamped)}%</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .progress-bar-wrapper {
    width: 100%;
  }

  .track {
    width: 100%;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    border-radius: 9999px;
    overflow: hidden;
  }

  .fill {
    height: 100%;
    background: var(--bar-color, var(--theme-accent, #6366f1));
    border-radius: 9999px;
    transition: width var(--duration-fast) var(--ease-standard-out);
    position: relative;
    overflow: hidden;
  }

  .shimmer {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.25) 50%,
      transparent 100%
    );
    background-size: 200% 100%;
    animation: progress-shimmer 1.5s ease-in-out infinite;
  }

  @keyframes progress-shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  .label-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 4px;
    gap: 8px;
  }

  .label-text {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-variant-numeric: tabular-nums;
  }

  .percent-text {
    font-size: var(--font-size-compact, 12px);
    color: var(--bar-color, var(--theme-accent, #6366f1));
    font-variant-numeric: tabular-nums;
    margin-left: auto;
  }

  @media (prefers-reduced-motion: reduce) {
    .fill {
      transition: none;
    }

    .shimmer {
      animation: none;
      display: none;
    }
  }
</style>
