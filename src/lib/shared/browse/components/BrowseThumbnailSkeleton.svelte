<!--
Gallery Thumbnail Skeleton - Loading State Component

State-of-the-art skeleton that matches the real browse gallery:
- Same responsive column breakpoints as BrowseGrid
- Cards are image-only (no metadata/actions) matching ChoreoCardThumbnail
- One even card shape, in a tone that reads as loading on any scene
- Staggered shimmer for organic feel
- Fade-out transition for smooth handoff to real content
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  const { count = 12, pinchColumnOverride } = $props<{
    count?: number;
    pinchColumnOverride?: number;
  }>();

  let gridRef = $state<HTMLElement | undefined>(undefined);
  let containerWidth = $state(0);

  // Match BrowseGrid breakpoints exactly
  const columnCount = $derived.by(() => {
    if (pinchColumnOverride !== undefined) return pinchColumnOverride;
    if (containerWidth === 0) return 2;
    if (containerWidth >= 1600) return 5;
    if (containerWidth >= 1200) return 4;
    if (containerWidth >= 800) return 3;
    return 2;
  });

  // One even shape: the common eight-beat card. Varied heights made a grid
  // that is still loading look like a broken one (Austen, 2026-11-06).
  const CARD_ASPECT_RATIO = 1.15;

  let resizeObserver: ResizeObserver | null = null;

  onMount(() => {
    if (!gridRef) return;
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) containerWidth = w;
      }
    });
    resizeObserver.observe(gridRef);

    requestAnimationFrame(() => {
      if (gridRef) {
        const w = gridRef.getBoundingClientRect().width;
        if (w > 0) containerWidth = w;
      }
    });
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
  });
</script>

<div
  bind:this={gridRef}
  class="skeleton-grid"
  style:grid-template-columns="repeat({columnCount}, 1fr)"
>
  {#each Array(count) as _, index}
    <div class="skeleton-card">
      <div
        class="skeleton-image"
        style:aspect-ratio={CARD_ASPECT_RATIO}
      ></div>
      <!-- Shimmer overlay with staggered timing per card -->
      <div
        class="shimmer"
        style:animation-delay="{(index % columnCount) * 150}ms"
      ></div>
    </div>
  {/each}
</div>

<style>
  .skeleton-grid {
    display: grid;
    gap: var(--spacing-sm);
    width: 100%;
    align-items: start;
  }

  .skeleton-card {
    position: relative;
    border-radius: 8px;
    overflow: hidden;
    /* Not the card background: on a dark scene that is black, which read as
       thumbnails that had failed. */
    background: color-mix(in srgb, var(--theme-text, #fff) 9%, transparent);
    border: 1px solid var(--theme-stroke);
  }

  .skeleton-image {
    width: 100%;
    /* aspect-ratio set dynamically via inline style */
  }

  /* Separate shimmer element so stagger delay applies per-card */
  .shimmer {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      color-mix(in srgb, var(--theme-text, #fff) 8%, transparent) 50%,
      transparent 100%
    );
    animation: shimmer 1.8s ease-in-out infinite;
  }

  @keyframes shimmer {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .shimmer {
      animation: none;
      opacity: 0;
    }
  }
</style>
