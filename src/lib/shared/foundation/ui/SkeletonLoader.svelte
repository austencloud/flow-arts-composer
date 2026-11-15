<!--
  SkeletonLoader - Modern 2025 progressive loading component

  Provides subtle skeleton loading states for individual components.
  Use this instead of blocking spinners or overlays.
-->
<script lang="ts">
  const {
    variant = "text",
    width = "100%",
    height,
    count = 1,
    className = "",
  } = $props<{
    variant?: "text" | "rect" | "circle" | "card";
    width?: string;
    height?: string;
    count?: number;
    className?: string;
  }>();

  const defaultHeight = $derived.by(() => {
    switch (variant) {
      case "text":
        return "1rem";
      case "circle":
        return "40px";
      case "card":
        return "200px";
      case "rect":
      default:
        return "40px";
    }
  });

  const computedHeight = $derived(height || defaultHeight);
</script>

<div class="skeleton-container {className}">
  {#each Array(count) as _}
    <div
      class="skeleton skeleton-{variant}"
      class:skeleton-circle={variant === "circle"}
      style:width={variant === "circle" ? computedHeight : width}
      style:height={computedHeight}
    ></div>
  {/each}
</div>

<style>
  .skeleton-container {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .skeleton {
    background: linear-gradient(
      90deg,
      var(--theme-card-bg) 0%,
      rgba(255, 255, 255, 0.1) 50%,
      var(--theme-card-bg) 100%
    );
    animation: shimmer 1.5s ease-in-out infinite;
    border-radius: 4px;
  }

  /* Its own rule: in one rule with the var() shorthand above, replays lose that shorthand. */
  .skeleton {
    background-size: 200% 100%;
  }

  .skeleton-text {
    border-radius: 4px;
  }

  .skeleton-circle {
    border-radius: 50%;
  }

  .skeleton-card {
    border-radius: 12px;
  }

  @keyframes shimmer {
    0% {
      background-position: -200% 0;
    }
    100% {
      background-position: 200% 0;
    }
  }

  /* Respect user's motion preferences */
  @media (prefers-reduced-motion: reduce) {
    .skeleton {
      animation: none;
      opacity: 0.5;
    }
  }

  /* Dark theme support */
  @media (prefers-color-scheme: light) {
    .skeleton {
      background: linear-gradient(
        90deg,
        rgba(0, 0, 0, 0.05) 0%,
        rgba(0, 0, 0, 0.1) 50%,
        rgba(0, 0, 0, 0.05) 100%
      );
    }
  }
</style>
