<!--
  SpotlightChrome.svelte

  Auto-hiding UI overlay for the media spotlight viewer.

  Features:
  - Top bar: close button, counter, needs-editing indicator
  - Side arrows: large touch targets, semi-transparent
  - All elements fade in/out together
  - WCAG AA compliant touch targets on mobile
-->
<script lang="ts">
  import type { MediaItem } from "./MediaSpotlight.svelte";

  interface Props {
    /** Whether chrome is visible */
    visible: boolean;
    /** Current item index (0-based) */
    currentIndex: number;
    /** Total number of items */
    totalCount: number;
    /** Can navigate to previous */
    canGoPrev: boolean;
    /** Can navigate to next */
    canGoNext: boolean;
    /** Current media item */
    item: MediaItem | null;
    /** Whether to show close button */
    showClose?: boolean;
    /** Callback for close button */
    onClose?: () => void;
    /** Callback for previous button */
    onPrev?: () => void;
    /** Callback for next button */
    onNext?: () => void;
  }

  let {
    visible,
    currentIndex,
    totalCount,
    canGoPrev,
    canGoNext,
    item,
    showClose = true,
    onClose,
    onPrev,
    onNext,
  }: Props = $props();

  const displayIndex = $derived(currentIndex + 1);
  const needsEditing = $derived(item?.needsEditing ?? false);
</script>

<!-- Top Bar -->
<div
  class="spotlight-chrome spotlight-chrome-top"
  data-visible={visible}
  role="toolbar"
  aria-label="Viewer controls"
>
  <!-- Counter Badge -->
  <div class="spotlight-counter" aria-live="polite">
    <span class="sr-only">Image</span>
    {displayIndex} / {totalCount}
  </div>

  <!-- Needs Editing Indicator -->
  {#if needsEditing}
    <div class="spotlight-needs-editing" aria-label="Needs editing">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
      <span>Needs editing</span>
    </div>
  {/if}

  <!-- Close Button -->
  {#if showClose}
    <button
      class="spotlight-close"
      onclick={onClose}
      aria-label="Close viewer"
      type="button"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  {/if}
</div>

<!-- Navigation Arrows -->
<div
  class="spotlight-chrome spotlight-chrome-side"
  data-visible={visible}
  role="navigation"
  aria-label="Image navigation"
>
  <!-- Previous Arrow -->
  <button
    class="spotlight-arrow spotlight-arrow-prev"
    onclick={onPrev}
    disabled={!canGoPrev}
    aria-label="Previous image"
    type="button"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  </button>

  <!-- Next Arrow -->
  <button
    class="spotlight-arrow spotlight-arrow-next"
    onclick={onNext}
    disabled={!canGoNext}
    aria-label="Next image"
    type="button"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  </button>
</div>

<style>
  /* Screen reader only */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  /* Top Bar */
  .spotlight-chrome-top {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spotlight-chrome-padding, 16px);
    padding-top: calc(
      var(--spotlight-chrome-padding, 16px) +
        var(--spotlight-safe-area-top, 0px)
    );
    padding-left: calc(
      var(--spotlight-chrome-padding, 16px) +
        var(--spotlight-safe-area-left, 0px)
    );
    padding-right: calc(
      var(--spotlight-chrome-padding, 16px) +
        var(--spotlight-safe-area-right, 0px)
    );
    background: linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0.6) 0%,
      transparent 100%
    );
    z-index: 10;
  }

  /* Counter Badge */
  .spotlight-counter {
    padding: 8px 16px;
    background: rgba(0, 0, 0, 0.4);
    border-radius: 20px;
    font-size: 14px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    color: white;
  }

  /* Needs Editing Indicator */
  .spotlight-needs-editing {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: rgba(245, 158, 11, 0.2);
    border: 1px solid rgba(245, 158, 11, 0.4);
    border-radius: 20px;
    color: rgb(245, 158, 11);
    font-size: 13px;
    font-weight: 500;
  }

  /* Close Button */
  .spotlight-close {
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    border: none;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.4);
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      background var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-spring);
  }

  .spotlight-close:hover {
    background: rgba(0, 0, 0, 0.6);
    transform: scale(1.05);
  }

  .spotlight-close:active {
    transform: scale(0.95);
  }

  .spotlight-close:focus-visible {
    outline: 2px solid white;
    outline-offset: 2px;
  }

  /* Side Navigation */
  .spotlight-chrome-side {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 5;
  }

  /* Arrow Buttons */
  .spotlight-arrow {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 64px;
    height: 64px;
    border: none;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.4);
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: auto;
    transition:
      background var(--duration-normal) var(--ease-standard),
      transform var(--duration-fast) var(--ease-spring),
      opacity var(--duration-normal) var(--ease-standard);
  }

  .spotlight-arrow:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.6);
    transform: translateY(-50%) scale(1.05);
  }

  .spotlight-arrow:active:not(:disabled) {
    transform: translateY(-50%) scale(0.95);
  }

  .spotlight-arrow:focus-visible {
    outline: 2px solid white;
    outline-offset: 2px;
  }

  .spotlight-arrow:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .spotlight-arrow-prev {
    left: var(--spotlight-chrome-padding, 16px);
  }

  .spotlight-arrow-next {
    right: var(--spotlight-chrome-padding, 16px);
  }

  .spotlight-arrow svg {
    width: 24px;
    height: 24px;
  }

  /* Mobile: larger touch targets */
  @media (max-width: 768px) {
    .spotlight-arrow {
      width: 80px;
      height: 80px;
    }

    .spotlight-arrow svg {
      width: 28px;
      height: 28px;
    }

    .spotlight-chrome-top {
      padding: var(--spotlight-chrome-padding-mobile, 12px);
      padding-top: calc(
        var(--spotlight-chrome-padding-mobile, 12px) +
          var(--spotlight-safe-area-top, 0px)
      );
    }
  }

  /* Chrome visibility transitions - handled by parent tokens */

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .spotlight-close,
    .spotlight-arrow {
      transition: none;
    }

    .spotlight-close:hover,
    .spotlight-arrow:hover:not(:disabled) {
      transform: translateY(-50%);
    }

    .spotlight-close:active,
    .spotlight-arrow:active:not(:disabled) {
      transform: translateY(-50%);
    }
  }
</style>
