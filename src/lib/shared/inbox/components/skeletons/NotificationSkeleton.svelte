<script lang="ts">
  /**
   * NotificationSkeleton
   *
   * Skeleton placeholder for notification list items
   */

  interface Props {
    count?: number;
  }

  let { count = 5 }: Props = $props();
</script>

<div class="skeleton-list" aria-hidden="true">
  {#each Array(count) as _, i}
    <div class="skeleton-item" style="--stagger: {i}">
      <div class="skeleton-icon"></div>
      <div class="skeleton-content">
        <div class="skeleton-message"></div>
        <div class="skeleton-time"></div>
      </div>
    </div>
  {/each}
</div>

<style>
  .skeleton-list {
    display: flex;
    flex-direction: column;
  }

  .skeleton-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--theme-stroke);
    animation: fadeIn var(--duration-emphasis) var(--ease-standard-out)
      backwards;
    animation-delay: calc(var(--stagger) * var(--stagger-normal));
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .skeleton-icon {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: linear-gradient(
      90deg,
      var(--theme-card-bg) 25%,
      var(--theme-card-hover-bg, var(--theme-stroke)) 50%,
      var(--theme-card-bg) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
  }

  .skeleton-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .skeleton-message {
    width: 90%;
    height: 14px;
    border-radius: 4px;
    background: linear-gradient(
      90deg,
      var(--theme-card-bg) 25%,
      var(--theme-card-hover-bg, var(--theme-stroke)) 50%,
      var(--theme-card-bg) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    animation-delay: var(--duration-instant);
  }

  .skeleton-time {
    width: 60px;
    height: 12px;
    border-radius: 4px;
    background: linear-gradient(
      90deg,
      var(--theme-card-bg) 25%,
      var(--theme-card-hover-bg, var(--theme-stroke)) 50%,
      var(--theme-card-bg) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    animation-delay: var(--duration-normal);
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
    .skeleton-icon,
    .skeleton-message,
    .skeleton-time,
    .skeleton-item {
      animation: none !important;
    }
  }
</style>
