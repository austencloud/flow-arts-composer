<script lang="ts">
  /**
   * ConversationSkeleton
   *
   * Skeleton placeholder for conversation list items
   */

  interface Props {
    count?: number;
  }

  let { count = 5 }: Props = $props();
</script>

<div class="skeleton-list" aria-hidden="true">
  {#each Array(count) as _, i}
    <div class="skeleton-item" style="--stagger: {i}">
      <div class="skeleton-avatar"></div>
      <div class="skeleton-content">
        <div class="skeleton-header">
          <div class="skeleton-name"></div>
          <div class="skeleton-time"></div>
        </div>
        <div class="skeleton-preview"></div>
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
    align-items: center;
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

  .skeleton-avatar {
    width: 44px;
    height: 44px;
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

  .skeleton-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .skeleton-name {
    width: 120px;
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
    width: 32px;
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

  .skeleton-preview {
    width: 80%;
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
    animation-delay: var(--duration-emphasis);
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
    .skeleton-avatar,
    .skeleton-name,
    .skeleton-time,
    .skeleton-preview,
    .skeleton-item {
      animation: none !important;
    }
  }
</style>
