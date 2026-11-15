<script lang="ts">
  /**
   * ShimmerBlock - Configurable shimmer placeholder rectangle for skeleton screens.
   * Uses the inbox skeleton shimmer pattern (gold standard in this codebase).
   */

  interface Props {
    /** CSS width value. Default "100%". */
    width?: string;
    /** CSS height value. Default "16px". */
    height?: string;
    /** CSS border-radius. Default "4px". */
    borderRadius?: string;
    /** Animation delay in ms for stagger. Default 0. */
    delay?: number;
    /** If true, uses 50% border-radius and width=height. Default false. */
    circle?: boolean;
  }

  let {
    width = "100%",
    height = "16px",
    borderRadius = "4px",
    delay = 0,
    circle = false,
  }: Props = $props();

  const resolvedWidth = $derived(circle ? height : width);
  const resolvedRadius = $derived(circle ? "50%" : borderRadius);
</script>

<div
  class="shimmer-block"
  style:width={resolvedWidth}
  style:height={height}
  style:border-radius={resolvedRadius}
  style:animation-delay="{delay}ms"
  aria-hidden="true"
></div>

<style>
  .shimmer-block {
    background: linear-gradient(
      90deg,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04)) 25%,
      var(
          --theme-card-hover-bg,
          var(--theme-stroke, rgba(255, 255, 255, 0.1))
        )
        50%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04)) 75%
    );
    animation: shimmer-sweep 1.5s infinite;
    flex-shrink: 0;
  }

  /* Its own rule: in one rule with the var() shorthand above, replays lose that shorthand. */
  .shimmer-block {
    background-size: 200% 100%;
  }

  @keyframes shimmer-sweep {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .shimmer-block {
      animation: none;
      background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
      border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    }
  }
</style>
