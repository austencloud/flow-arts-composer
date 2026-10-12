<!--
  SpotlightImage.svelte

  Image display component with zoom/pan support and smooth transitions.

  Features:
  - Smooth crossfade transitions between images
  - Direction-aware slide animations
  - Zoom and pan transforms
  - Preloading of adjacent images
  - Error handling with retry
-->
<script lang="ts">
  import { onMount } from "svelte";
  import type { MediaItem } from "./MediaSpotlight.svelte";

  interface Props {
    /** The media item to display */
    item: MediaItem;
    /** Navigation direction for slide animation */
    direction?: "prev" | "next" | null;
    /** Current zoom scale */
    scale?: number;
    /** Pan X offset when zoomed */
    panX?: number;
    /** Pan Y offset when zoomed */
    panY?: number;
    /** Called when image loads successfully */
    onLoad?: () => void;
    /** Called when image fails to load */
    onError?: (message: string) => void;
  }

  let {
    item,
    direction = null,
    scale = 1,
    panX = 0,
    panY = 0,
    onLoad,
    onError,
  }: Props = $props();

  let isLoaded = $state(false);
  let hasError = $state(false);
  let previousUrl = $state<string | null>(null);
  let isTransitioning = $state(false);

  const preloadedUrls = new Set<string>();

  function handleLoad() {
    isLoaded = true;
    hasError = false;
    isTransitioning = false;
    onLoad?.();
  }

  function handleError() {
    hasError = true;
    isLoaded = false;
    onError?.("Failed to load image");
  }

  $effect(() => {
    // When URL changes, trigger transition
    if (item.url !== previousUrl && previousUrl !== null) {
      isTransitioning = true;
      isLoaded = false;
    }
    previousUrl = item.url;
  });

  const transform = $derived.by(() => {
    const transforms: string[] = [];

    if (scale !== 1) {
      transforms.push(`scale(${scale})`);
    }

    if (panX !== 0 || panY !== 0) {
      transforms.push(`translate(${panX}px, ${panY}px)`);
    }

    return transforms.length > 0 ? transforms.join(" ") : "none";
  });

  // ===== Slide Direction CSS Variable =====
  const slideDirection = $derived(direction === "prev" ? "-30px" : "30px");
</script>

<div
  class="spotlight-image-container"
  class:transitioning={isTransitioning}
  style:--slide-direction={slideDirection}
>
  {#if item.type === "image"}
    {#key item.url}
      <img
        src={item.url}
        alt={item.alt || "Media image"}
        class="spotlight-image"
        class:loaded={isLoaded}
        class:entering={isTransitioning}
        style:transform
        onload={handleLoad}
        onerror={handleError}
        draggable="false"
      />
    {/key}
  {:else}
    <!-- Video placeholder - to be implemented in SpotlightVideo.svelte -->
    <div class="spotlight-video-placeholder">
      <p>Video support coming soon</p>
    </div>
  {/if}

  {#if hasError}
    <div class="spotlight-error">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <p>Failed to load image</p>
      <button
        class="spotlight-retry"
        onclick={() => {
          hasError = false;
          isLoaded = false;
          // Force re-render by clearing and re-setting
          const currentUrl = item.url;
          item = { ...item, url: "" };
          requestAnimationFrame(() => {
            item = { ...item, url: currentUrl };
          });
        }}
      >
        Retry
      </button>
    </div>
  {/if}
</div>

<style>
  .spotlight-image-container {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .spotlight-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
    touch-action: none;
    opacity: 0;
    transition: opacity var(--duration-normal) var(--ease-standard-out);
    will-change: transform, opacity;
  }

  .spotlight-image.loaded {
    opacity: 1;
  }

  /* Entry animation when transitioning */
  .spotlight-image.entering {
    animation: spotlightImageEnter var(--duration-emphasis) var(--ease-out)
      forwards;
  }

  @keyframes spotlightImageEnter {
    from {
      opacity: 0;
      transform: translateX(var(--slide-direction, 30px));
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .spotlight-video-placeholder {
    color: rgba(255, 255, 255, 0.6);
    text-align: center;
    padding: 24px;
  }

  .spotlight-error {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    color: rgba(255, 255, 255, 0.8);
    background: rgba(0, 0, 0, 0.5);
  }

  .spotlight-error svg {
    opacity: 0.6;
  }

  .spotlight-error p {
    margin: 0;
    font-size: 14px;
  }

  .spotlight-retry {
    padding: 8px 20px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 20px;
    color: white;
    font-size: 14px;
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard);
  }

  .spotlight-retry:hover {
    background: rgba(255, 255, 255, 0.15);
  }

  .spotlight-retry:active {
    transform: scale(0.95);
  }

  .spotlight-retry:focus-visible {
    outline: 2px solid white;
    outline-offset: 2px;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .spotlight-image {
      transition: none;
    }

    .spotlight-image.entering {
      animation: none;
      opacity: 1;
    }
  }
</style>
