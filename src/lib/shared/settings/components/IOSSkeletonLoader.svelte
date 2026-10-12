<!-- IOSSkeletonLoader.svelte - iOS-native skeleton loading state -->
<script lang="ts">
  interface Props {
    variant?: "list" | "toggle" | "card" | "text";
    count?: number;
  }

  let { variant = "list", count = 3 }: Props = $props();
</script>

<div class="skeleton-container">
  {#if variant === "list"}
    {#each Array(count) as _}
      <div class="skeleton-list-item">
        <div class="skeleton-circle"></div>
        <div class="skeleton-text-block">
          <div class="skeleton-line skeleton-line--title"></div>
          <div class="skeleton-line skeleton-line--subtitle"></div>
        </div>
        <div class="skeleton-accessory"></div>
      </div>
    {/each}
  {:else if variant === "toggle"}
    {#each Array(count) as _}
      <div class="skeleton-toggle-row">
        <div class="skeleton-line skeleton-line--label"></div>
        <div class="skeleton-toggle"></div>
      </div>
    {/each}
  {:else if variant === "card"}
    <div class="skeleton-card">
      <div class="skeleton-line skeleton-line--title"></div>
      <div class="skeleton-line skeleton-line--body"></div>
      <div class="skeleton-line skeleton-line--body skeleton-line--short"></div>
    </div>
  {:else if variant === "text"}
    {#each Array(count) as _}
      <div class="skeleton-line skeleton-line--body"></div>
    {/each}
  {/if}
</div>

<style>
  .skeleton-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
  }

  /* iOS Skeleton Shimmer Effect */
  @keyframes ios-shimmer {
    0% {
      background-position: -468px 0;
    }
    100% {
      background-position: 468px 0;
    }
  }

  /* Base skeleton styles with iOS shimmer */
  .skeleton-line,
  .skeleton-circle,
  .skeleton-toggle,
  .skeleton-accessory {
    background: linear-gradient(
      90deg,
      rgba(118, 118, 128, 0.12) 0%,
      rgba(118, 118, 128, 0.24) 50%,
      rgba(118, 118, 128, 0.12) 100%
    );
    background-size: 936px 104px;
    animation: ios-shimmer 1.8s var(--ease-smooth) infinite;
    border-radius: 4px;
  }

  /* List Item Skeleton */
  .skeleton-list-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 16px;
    min-height: var(--min-touch-target);
    background: rgba(255, 255, 255, 0.04);
    border: 0.33px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
  }

  .skeleton-circle {
    flex-shrink: 0;
    width: 29px;
    height: 29px;
    border-radius: 50%;
  }

  .skeleton-text-block {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .skeleton-line--title {
    width: 60%;
    height: 17px;
  }

  .skeleton-line--subtitle {
    width: 40%;
    height: 13px;
  }

  .skeleton-line--label {
    width: 50%;
    height: 17px;
  }

  .skeleton-line--body {
    width: 100%;
    height: 15px;
  }

  .skeleton-line--short {
    width: 75%;
  }

  .skeleton-accessory {
    flex-shrink: 0;
    width: 8px;
    height: 14px;
    border-radius: 2px;
  }

  /* Toggle Row Skeleton */
  .skeleton-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 0;
    border-bottom: 0.33px solid rgba(255, 255, 255, 0.08);
  }

  .skeleton-toggle-row:last-child {
    border-bottom: none;
  }

  .skeleton-toggle {
    flex-shrink: 0;
    width: 51px;
    height: 31px;
    border-radius: 999px;
  }

  /* Card Skeleton */
  .skeleton-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
    background: rgba(255, 255, 255, 0.04);
    border: 0.33px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
  }

  /* Light Mode */
  @media (prefers-color-scheme: light) {
    .skeleton-line,
    .skeleton-circle,
    .skeleton-toggle,
    .skeleton-accessory {
      background: linear-gradient(
        90deg,
        rgba(118, 118, 128, 0.08) 0%,
        rgba(118, 118, 128, 0.18) 50%,
        rgba(118, 118, 128, 0.08) 100%
      );
    }

    .skeleton-list-item,
    .skeleton-card {
      background: rgba(0, 0, 0, 0.02);
      border-color: rgba(0, 0, 0, 0.08);
    }

    .skeleton-toggle-row {
      border-bottom-color: rgba(0, 0, 0, 0.08);
    }
  }

  /* Reduced Motion */
  @media (prefers-reduced-motion: reduce) {
    .skeleton-line,
    .skeleton-circle,
    .skeleton-toggle,
    .skeleton-accessory {
      animation: none;
      background: rgba(118, 118, 128, 0.18);
    }
  }

  /* High Contrast */
  @media (prefers-contrast: high) {
    .skeleton-line,
    .skeleton-circle,
    .skeleton-toggle,
    .skeleton-accessory {
      background: rgba(118, 118, 128, 0.3);
      animation: none;
    }

    .skeleton-list-item,
    .skeleton-card {
      border-width: 1px;
      border-color: rgba(255, 255, 255, 0.2);
    }
  }

  @media (prefers-contrast: high) and (prefers-color-scheme: light) {
    .skeleton-line,
    .skeleton-circle,
    .skeleton-toggle,
    .skeleton-accessory {
      background: rgba(118, 118, 128, 0.25);
    }

    .skeleton-list-item,
    .skeleton-card {
      border-color: rgba(0, 0, 0, 0.2);
    }
  }
</style>
