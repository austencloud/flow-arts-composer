<!--
  MediaSpotlight.svelte

  Premium full-screen media viewer for the 2026 era.

  Features:
  - Native <dialog> with @starting-style animations
  - Gesture-first: swipe to navigate, swipe down to dismiss
  - Auto-hiding chrome with 3-second timeout
  - Pinch-to-zoom with pan support
  - Full keyboard navigation
  - WCAG AAA accessibility

  Architecture:
  - Content-first: image fills viewport edge-to-edge
  - Progressive disclosure: tap to reveal controls
  - Instant feedback: every interaction responds immediately
-->
<script lang="ts">
  import { onMount, onDestroy, untrack } from "svelte";
  import { browser } from "$app/env";
  import { SpotlightGestureHandler, type GestureState } from "./SpotlightGestures.svelte.ts";
  import SpotlightImage from "./SpotlightImage.svelte";
  import SpotlightChrome from "./SpotlightChrome.svelte";
  import SpotlightFilmstrip from "./SpotlightFilmstrip.svelte";
  import "./spotlight-tokens.css";

  export interface MediaItem {
    id: string;
    url: string;
    thumbnailUrl?: string;
    type: "image" | "video";
    alt?: string;
    tags?: string[];
    needsEditing?: boolean;
  }

  interface Props {
    /** Whether the spotlight is open */
    open: boolean;
    /** Array of media items to display */
    items: MediaItem[];
    /** Index of the currently displayed item */
    currentIndex?: number;
    /** Callback when spotlight closes */
    onclose?: () => void;
    /** Callback when index changes */
    onIndexChange?: (index: number) => void;
    /** Callback when item is tagged */
    onTag?: (itemId: string, tags: string[]) => void;
    /** Callback when item is deleted */
    onDelete?: (itemId: string) => void;
    /** Whether to show the filmstrip */
    showFilmstrip?: boolean;
    /** Whether to show the close button */
    showClose?: boolean;
  }

  let {
    open = $bindable(false),
    items,
    currentIndex = $bindable(0),
    onclose,
    onIndexChange,
    onTag,
    onDelete,
    showFilmstrip = true,
    showClose = true,
  }: Props = $props();

  let dialogElement = $state<HTMLDialogElement | null>(null);
  let imageContainer = $state<HTMLElement | null>(null);
  let shouldRender = $state(false);
  let hasEntered = $state(false);
  let isClosing = $state(false);
  let wasOpen = $state(false);

  let chromeVisible = $state(true);
  let chromeTimeout: ReturnType<typeof setTimeout> | null = null;

  let gestureHandler: SpotlightGestureHandler | null = null;
  let gestureState = $state<GestureState | null>(null);
  let isSwiping = $state(false);

  let isLoading = $state(false);
  let loadError = $state<string | null>(null);

  // ===== Navigation Direction (for slide animation) =====
  let navDirection = $state<"next" | "prev" | null>(null);

  const currentItem = $derived(items[currentIndex] ?? null);
  const canGoNext = $derived(currentIndex < items.length - 1);
  const canGoPrev = $derived(currentIndex > 0);
  const totalCount = $derived(items.length);

  function showChrome() {
    chromeVisible = true;
    scheduleHideChrome();
  }

  function hideChrome() {
    chromeVisible = false;
    clearChromeTimeout();
  }

  function scheduleHideChrome() {
    clearChromeTimeout();
    chromeTimeout = setTimeout(() => {
      // Only auto-hide if not zoomed
      if (!gestureHandler?.isZoomed()) {
        chromeVisible = false;
      }
    }, 3000);
  }

  function clearChromeTimeout() {
    if (chromeTimeout) {
      clearTimeout(chromeTimeout);
      chromeTimeout = null;
    }
  }

  function navigate(direction: "prev" | "next") {
    if (direction === "prev" && canGoPrev) {
      navDirection = "prev";
      currentIndex--;
      onIndexChange?.(currentIndex);
      showChrome();
    } else if (direction === "next" && canGoNext) {
      navDirection = "next";
      currentIndex++;
      onIndexChange?.(currentIndex);
      showChrome();
    }
  }

  function goToIndex(index: number) {
    if (index >= 0 && index < items.length && index !== currentIndex) {
      navDirection = index > currentIndex ? "next" : "prev";
      currentIndex = index;
      onIndexChange?.(currentIndex);
      showChrome();
    }
  }

  function handleGestureUpdate(state: GestureState) {
    gestureState = state;
    isSwiping = state.isActive && (state.type === "swipe-horizontal" || state.type === "swipe-vertical");

    // Show chrome during gestures
    if (state.isActive) {
      showChrome();
    }
  }

  function handleGestureEnd(state: GestureState) {
    gestureState = null;
    isSwiping = false;
  }

  function handleDismiss() {
    closeSpotlight("swipe");
  }

  function closeSpotlight(reason: "backdrop" | "escape" | "button" | "swipe" = "button") {
    open = false;
    onclose?.();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!open) return;

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        closeSpotlight("escape");
        break;
      case "ArrowLeft":
        e.preventDefault();
        navigate("prev");
        break;
      case "ArrowRight":
        e.preventDefault();
        navigate("next");
        break;
      case "ArrowUp":
      case "ArrowDown":
        // Reserved for future use (scroll through tags, etc.)
        break;
      case " ":
        // Spacebar: toggle chrome visibility
        e.preventDefault();
        if (chromeVisible) {
          hideChrome();
        } else {
          showChrome();
        }
        break;
      default:
        // Number keys 1-9: tag shortcuts
        if (e.key >= "1" && e.key <= "9") {
          e.preventDefault();
          // Tag functionality to be implemented
        }
    }
  }

  function handleDialogClose() {
    closeSpotlight("button");
  }

  function handleDialogCancel(e: Event) {
    e.preventDefault();
    closeSpotlight("escape");
  }

  function handleBackdropClick(e: MouseEvent) {
    // Only close if clicking the dialog backdrop itself
    if (e.target === dialogElement) {
      closeSpotlight("backdrop");
    }
  }

  function handleContentTap() {
    // Tap toggles chrome visibility
    if (chromeVisible) {
      hideChrome();
    } else {
      showChrome();
    }
  }

  $effect(() => {
    const currentOpen = open;
    const previouslyOpen = untrack(() => wasOpen);

    if (currentOpen === previouslyOpen) return;

    untrack(() => {
      wasOpen = currentOpen;
    });

    if (currentOpen) {
      // Opening
      shouldRender = true;

      // Wait for DOM, then show modal
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (dialogElement && !dialogElement.open) {
            dialogElement.showModal();

            // Mark as entered for animations
            requestAnimationFrame(() => {
              hasEntered = true;
              showChrome();
            });
          }
        });
      });
    } else {
      // Closing
      hasEntered = false;
      isClosing = true;
      clearChromeTimeout();

      // Wait for exit animation
      const exitDuration = 250;
      setTimeout(() => {
        if (dialogElement?.open) {
          dialogElement.close();
        }
        isClosing = false;
        shouldRender = false;
        gestureHandler?.resetZoom();
      }, exitDuration);
    }
  });

  $effect(() => {
    if (hasEntered && imageContainer && !gestureHandler) {
      gestureHandler = new SpotlightGestureHandler({
        onNavigate: navigate,
        onDismiss: handleDismiss,
        onGestureUpdate: handleGestureUpdate,
        onGestureEnd: handleGestureEnd,
        canNavigate: (dir) => (dir === "prev" ? canGoPrev : canGoNext),
      });
      gestureHandler.attach(imageContainer);
    }

    return () => {
      gestureHandler?.detach();
    };
  });

  $effect(() => {
    if (open && browser) {
      window.addEventListener("keydown", handleKeydown);
      return () => window.removeEventListener("keydown", handleKeydown);
    }
    return undefined;
  });

  onDestroy(() => {
    clearChromeTimeout();
    gestureHandler?.dispose();
  });

  const swipeTransform = $derived.by(() => {
    if (!gestureState?.isActive) return "";

    const { type, offsetX, offsetY, atEdge } = gestureState;

    if (type === "swipe-horizontal") {
      // Apply rubber band effect at edges
      const finalOffset = atEdge ? offsetX * 0.3 : offsetX;
      return `translateX(${finalOffset}px)`;
    }

    if (type === "swipe-vertical" && offsetY > 0) {
      // Swipe down to dismiss - scale and fade
      const progress = Math.min(1, offsetY / 150);
      const scale = 1 - progress * 0.1;
      return `translateY(${offsetY}px) scale(${scale})`;
    }

    return "";
  });

  const backdropOpacity = $derived.by(() => {
    if (!gestureState?.isActive || gestureState.type !== "swipe-vertical") return 1;
    const progress = Math.min(1, gestureState.offsetY / 150);
    return 1 - progress * 0.3;
  });
</script>

{#if shouldRender}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <dialog
    bind:this={dialogElement}
    class="media-spotlight"
    data-entered={hasEntered}
    data-closing={isClosing}
    data-swiping={isSwiping}
    aria-label="Media viewer"
    aria-modal="true"
    onclick={handleBackdropClick}
    onclose={handleDialogClose}
    oncancel={handleDialogCancel}
    style:--backdrop-opacity={backdropOpacity}
  >
    <!-- Content container -->
    <div
      class="spotlight-content"
      style:transform={swipeTransform}
      onclick={(e) => e.stopPropagation()}
      onkeydown={() => {}}
      role="presentation"
    >
      <!-- Image Display -->
      <div
        bind:this={imageContainer}
        class="spotlight-image-wrapper"
        onclick={handleContentTap}
        onkeydown={(e) => { if (e.key === "Enter") handleContentTap(); }}
        role="button"
        tabindex="0"
        aria-label="Tap to toggle controls"
      >
        {#if currentItem}
          <SpotlightImage
            item={currentItem}
            direction={navDirection}
            scale={gestureState?.scale ?? 1}
            panX={gestureState?.panX ?? 0}
            panY={gestureState?.panY ?? 0}
            onLoad={() => { isLoading = false; loadError = null; }}
            onError={(msg) => { isLoading = false; loadError = msg; }}
          />
        {:else}
          <div class="spotlight-empty">
            <p>No media to display</p>
          </div>
        {/if}

        {#if isLoading}
          <div class="spotlight-skeleton" aria-hidden="true"></div>
        {/if}
      </div>

      <!-- Chrome Overlay -->
      <SpotlightChrome
        visible={chromeVisible}
        {currentIndex}
        {totalCount}
        {canGoPrev}
        {canGoNext}
        item={currentItem}
        {showClose}
        onClose={() => closeSpotlight("button")}
        onPrev={() => navigate("prev")}
        onNext={() => navigate("next")}
      />

      <!-- Filmstrip -->
      {#if showFilmstrip && items.length > 1}
        <SpotlightFilmstrip
          {items}
          {currentIndex}
          visible={chromeVisible}
          onSelect={goToIndex}
        />
      {/if}
    </div>
  </dialog>
{/if}

<style>
  .spotlight-content {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    will-change: transform;
  }

  .spotlight-image-wrapper {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    cursor: pointer;
    outline: none;
  }

  .spotlight-image-wrapper:focus-visible {
    /* Focus indicator on the entire image area */
    box-shadow: inset 0 0 0 3px rgba(255, 255, 255, 0.5);
  }

  .spotlight-empty {
    color: rgba(255, 255, 255, 0.6);
    text-align: center;
    padding: 24px;
  }

  .spotlight-skeleton {
    position: absolute;
    inset: 20%;
    background: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.05) 0%,
      rgba(255, 255, 255, 0.1) 50%,
      rgba(255, 255, 255, 0.05) 100%
    );
    background-size: 200% 100%;
    animation: spotlightSkeletonShimmer 1.5s infinite;
    border-radius: 8px;
  }

  @keyframes spotlightSkeletonShimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  /* Backdrop opacity control via CSS variable */
  dialog.media-spotlight::backdrop {
    opacity: var(--backdrop-opacity, 1);
  }
</style>
