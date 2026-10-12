<script lang="ts">
  /**
   * MessageSkeleton
   *
   * Skeleton placeholder for message bubbles
   */

  interface Props {
    count?: number;
  }

  let { count = 6 }: Props = $props();

  // Alternating pattern for realistic chat appearance
  const patterns = [
    { own: false, width: "70%" },
    { own: false, width: "45%" },
    { own: true, width: "60%" },
    { own: true, width: "40%" },
    { own: false, width: "55%" },
    { own: true, width: "50%" },
  ];
</script>

<div class="skeleton-messages" aria-hidden="true">
  {#each Array(count) as _, i}
    {@const pattern = patterns[i % patterns.length]!}
    <div
      class="skeleton-bubble"
      class:own={pattern.own}
      style="--width: {pattern.width}; --stagger: {i}"
    >
      <div class="skeleton-content">
        <div class="skeleton-text"></div>
        <div class="skeleton-meta"></div>
      </div>
    </div>
  {/each}
</div>

<style>
  .skeleton-messages {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
  }

  .skeleton-bubble {
    display: flex;
    max-width: var(--width, 60%);
    animation: fadeIn var(--duration-emphasis) var(--ease-standard-out)
      backwards;
    animation-delay: calc(var(--stagger) * var(--stagger-relaxed));
  }

  .skeleton-bubble.own {
    margin-left: auto;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .skeleton-content {
    width: 100%;
    padding: 12px 14px;
    border-radius: 18px;
    background: var(--theme-card-bg);
  }

  .skeleton-bubble.own .skeleton-content {
    background: color-mix(
      in srgb,
      var(--theme-accent, var(--semantic-info)) 30%,
      transparent
    );
    border-bottom-right-radius: 6px;
  }

  .skeleton-bubble:not(.own) .skeleton-content {
    border-bottom-left-radius: 6px;
  }

  .skeleton-text {
    width: 100%;
    height: 14px;
    margin-bottom: 8px;
    border-radius: 4px;
    background: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.04) 25%,
      var(--theme-card-bg) 50%,
      rgba(255, 255, 255, 0.04) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
  }

  .skeleton-meta {
    width: 40px;
    height: 10px;
    border-radius: 3px;
    background: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.03) 25%,
      rgba(255, 255, 255, 0.06) 50%,
      rgba(255, 255, 255, 0.03) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    animation-delay: var(--duration-normal);
  }

  .skeleton-bubble.own .skeleton-meta {
    margin-left: auto;
  }

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton-bubble,
    .skeleton-text,
    .skeleton-meta {
      animation: none !important;
    }
  }
</style>
