<!--
  SpotlightFilmstrip.svelte

  Horizontal thumbnail navigation strip for the media spotlight viewer.

  Features:
  - Auto-scrolls to keep active thumbnail centered
  - Active thumbnail has white border and 1.1x scale
  - Slides up/down with chrome visibility
  - Keyboard navigable
-->
<script lang="ts">
  import { onMount } from "svelte";
  import type { MediaItem } from "./MediaSpotlight.svelte";

  interface Props {
    /** Array of media items */
    items: MediaItem[];
    /** Currently active index */
    currentIndex: number;
    /** Whether filmstrip is visible */
    visible: boolean;
    /** Callback when thumbnail is selected */
    onSelect?: (index: number) => void;
  }

  let { items, currentIndex, visible, onSelect }: Props = $props();

  let containerRef = $state<HTMLElement | null>(null);
  let thumbnailRefs = $state<(HTMLButtonElement | null)[]>([]);

  $effect(() => {
    if (!containerRef) return;

    const activeThumb = thumbnailRefs[currentIndex];
    if (activeThumb) {
      // Scroll to center the active thumbnail
      const containerWidth = containerRef.offsetWidth;
      const thumbLeft = activeThumb.offsetLeft;
      const thumbWidth = activeThumb.offsetWidth;
      const scrollLeft = thumbLeft - containerWidth / 2 + thumbWidth / 2;

      containerRef.scrollTo({
        left: scrollLeft,
        behavior: "smooth",
      });
    }
  });

  function handleKeydown(e: KeyboardEvent, index: number) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect?.(index);
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      thumbnailRefs[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < items.length - 1) {
      e.preventDefault();
      thumbnailRefs[index + 1]?.focus();
    }
  }
</script>

<div
  class="spotlight-filmstrip spotlight-chrome spotlight-chrome-bottom"
  data-visible={visible}
  bind:this={containerRef}
  role="tablist"
  aria-label="Image thumbnails"
>
  {#each items as item, index}
    <button
      bind:this={thumbnailRefs[index]}
      class="spotlight-filmstrip-thumb"
      data-active={index === currentIndex}
      onclick={() => onSelect?.(index)}
      onkeydown={(e) => handleKeydown(e, index)}
      role="tab"
      aria-selected={index === currentIndex}
      aria-label="View image {index + 1} of {items.length}"
      tabindex={index === currentIndex ? 0 : -1}
      type="button"
    >
      <img
        src={item.thumbnailUrl || item.url}
        alt=""
        loading="lazy"
        draggable="false"
      />
      {#if item.needsEditing}
        <div class="filmstrip-edit-badge" aria-hidden="true">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
            />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </div>
      {/if}
    </button>
  {/each}
</div>

<style>
  .spotlight-filmstrip {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: var(--spotlight-filmstrip-height, 80px);
    padding: var(--spotlight-chrome-padding, 16px);
    padding-bottom: calc(
      var(--spotlight-chrome-padding, 16px) +
        var(--spotlight-safe-area-bottom, 0px)
    );
    background: linear-gradient(
      to top,
      rgba(0, 0, 0, 0.8) 0%,
      transparent 100%
    );
    overflow-x: auto;
    overflow-y: hidden;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--spotlight-filmstrip-gap, 4px);
    z-index: 5;

    /* Hide scrollbar */
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .spotlight-filmstrip::-webkit-scrollbar {
    display: none;
  }

  /* Center thumbnails when they don't overflow */
  @container (min-width: 0px) {
    .spotlight-filmstrip {
      justify-content: center;
    }
  }

  .spotlight-filmstrip-thumb {
    flex-shrink: 0;
    width: var(--spotlight-filmstrip-thumb-size, 60px);
    height: var(--spotlight-filmstrip-thumb-size, 60px);
    border-radius: 4px;
    border: 2px solid transparent;
    background: rgba(255, 255, 255, 0.1);
    overflow: hidden;
    cursor: pointer;
    padding: 0;
    position: relative;
    transition:
      transform var(--duration-fast) var(--ease-spring),
      border-color var(--duration-fast) var(--ease-standard),
      box-shadow var(--duration-fast) var(--ease-standard);
  }

  .spotlight-filmstrip-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    pointer-events: none;
  }

  .spotlight-filmstrip-thumb:hover {
    border-color: rgba(255, 255, 255, 0.5);
  }

  .spotlight-filmstrip-thumb[data-active="true"] {
    border-color: white;
    transform: scale(1.1);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    z-index: 1;
  }

  .spotlight-filmstrip-thumb:focus-visible {
    outline: 2px solid white;
    outline-offset: 2px;
  }

  /* Needs editing badge */
  .filmstrip-edit-badge {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 16px;
    height: 16px;
    background: rgba(245, 158, 11, 0.9);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  /* Mobile adjustments */
  @media (max-width: 768px) {
    .spotlight-filmstrip {
      padding: var(--spotlight-chrome-padding-mobile, 12px);
      padding-bottom: calc(
        var(--spotlight-chrome-padding-mobile, 12px) +
          var(--spotlight-safe-area-bottom, 0px)
      );
    }

    .spotlight-filmstrip-thumb {
      /* Slightly larger on mobile for easier tapping */
      width: 56px;
      height: 56px;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .spotlight-filmstrip-thumb {
      transition: none;
    }

    .spotlight-filmstrip-thumb[data-active="true"] {
      transform: none;
    }
  }
</style>
