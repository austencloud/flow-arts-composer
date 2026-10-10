<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  /**
   * ProgressRing - Circular SVG progress indicator.
   * Works in both determinate and indeterminate modes.
   */

  interface Props {
    /** 0-100 for determinate. Pass -1 for indeterminate spinning. */
    percent: number;
    /** Diameter in pixels. Default 48. */
    size?: number;
    /** Ring stroke width. Default 4. */
    strokeWidth?: number;
    /** Ring color. Defaults to theme accent. */
    color?: string;
    /** Optional center label (e.g. "75%"). */
    label?: string;
  }

  let { percent, size = 48, strokeWidth = 4, color, label }: Props = $props();

  const isIndeterminate = $derived(percent < 0);
  const clamped = $derived(Math.max(0, Math.min(100, percent)));
  const radius = $derived((size - strokeWidth) / 2);
  const circumference = $derived(2 * Math.PI * radius);
  const center = $derived(size / 2);

  const dashOffset = $derived.by(() => {
    if (isIndeterminate) {
      return circumference * 0.75;
    }
    return circumference * (1 - clamped / 100);
  });
</script>

<div
  class="progress-ring"
  class:indeterminate={isIndeterminate}
  style:width="{size}px"
  style:height="{size}px"
  style:--ring-color={color}
  role="progressbar"
  aria-valuenow={isIndeterminate ? undefined : clamped}
  aria-valuemin={0}
  aria-valuemax={100}
  aria-label={label ??
    (isIndeterminate
      ? t("common_loading")
      : t("shared_progress_complete", { percent: Math.round(clamped) }))}
>
  <svg width={size} height={size} viewBox="0 0 {size} {size}" class="ring-svg">
    <circle
      cx={center}
      cy={center}
      r={radius}
      fill="none"
      stroke="rgba(255, 255, 255, 0.08)"
      stroke-width={strokeWidth}
    />
    <circle
      cx={center}
      cy={center}
      r={radius}
      fill="none"
      stroke="var(--ring-color, var(--theme-accent, #6366f1))"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-dasharray={circumference}
      stroke-dashoffset={dashOffset}
      class="progress-arc"
    />
  </svg>

  {#if label}
    <span class="center-label">{label}</span>
  {/if}
</div>

<style>
  .progress-ring {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .ring-svg {
    transform: rotate(-90deg);
  }

  .indeterminate .ring-svg {
    animation: ring-spin 1.2s linear infinite;
  }

  .progress-arc {
    transition: stroke-dashoffset var(--duration-fast, 150ms) ease-out;
  }

  .indeterminate .progress-arc {
    transition: none;
  }

  .center-label {
    position: absolute;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--theme-text, #ffffff);
  }

  @keyframes ring-spin {
    from {
      transform: rotate(-90deg);
    }
    to {
      transform: rotate(270deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .indeterminate .ring-svg {
      animation: none;
    }

    .indeterminate .progress-arc {
      opacity: 0.6;
    }

    .progress-arc {
      transition: none;
    }
  }
</style>
