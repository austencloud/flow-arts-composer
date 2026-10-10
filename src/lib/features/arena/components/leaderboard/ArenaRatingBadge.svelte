<!--
  ArenaRatingBadge.svelte - Display rating with confidence ring

  Shows the conservative display rating (mu - 2*phi) with an SVG
  confidence arc that fills as phi decreases (more votes = more certain).
-->
<script lang="ts">
  import {
    INITIAL_PHI,
    ARENA_COLOR,
  } from "../../domain/constants/arena-constants";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  let {
    rating,
    phi,
    size = 48,
  }: {
    rating: number;
    phi: number;
    size?: number;
  } = $props();

  // Confidence ring: 0% at INITIAL_PHI, 100% at phi=0
  const confidence = $derived(Math.max(0, Math.min(1, 1 - phi / INITIAL_PHI)));

  // SVG arc math
  const cx = $derived(size / 2);
  const cy = $derived(size / 2);
  const radius = $derived(size / 2 - 3);
  const circumference = $derived(2 * Math.PI * radius);
  const dashOffset = $derived(circumference * (1 - confidence));
</script>

<div
  class="rating-badge"
  style="width: {size}px; height: {size}px;"
  title={t('arena_leaderboard_rating_confidence', { rating, confidence: Math.round(confidence * 100) })}
>
  <svg
    viewBox="0 0 {size} {size}"
    width={size}
    height={size}
    aria-hidden="true"
  >
    <!-- Track -->
    <circle
      {cx}
      {cy}
      r={radius}
      fill="none"
      stroke="var(--theme-stroke, rgba(255, 255, 255, 0.1))"
      stroke-width="2.5"
    />
    <!-- Confidence arc -->
    <circle
      {cx}
      {cy}
      r={radius}
      fill="none"
      stroke={ARENA_COLOR}
      stroke-width="2.5"
      stroke-dasharray={circumference}
      stroke-dashoffset={dashOffset}
      stroke-linecap="round"
      transform="rotate(-90 {cx} {cy})"
    />
  </svg>
  <span class="rating-value">{Math.round(rating)}</span>
</div>

<style>
  .rating-badge {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .rating-badge svg {
    position: absolute;
    inset: 0;
  }

  .rating-value {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    color: var(--theme-text, #fff);
    font-variant-numeric: tabular-nums;
    z-index: 1;
  }
</style>
