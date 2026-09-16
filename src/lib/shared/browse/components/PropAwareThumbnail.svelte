<!--
  PropAwareThumbnail

  Thin presentation component for sequence thumbnails.
  All logic delegated to services:
  - ThumbnailKeyDeriver: Cache key derivation
  - ThumbnailRenderOrchestrator: Cache check → queue → render → upload

  Features:
  - Lazy loading via IntersectionObserver
  - Single hash comparison for change detection (replaces 13 prev* variables)
  - Throttled rendering (queue caps concurrency at up to 8 when Web Workers
    are available, 3 otherwise — see getThumbnailRenderQueue)
  - Cloud caching for instant subsequent loads
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";
  import RenderingOverlay from "$lib/shared/components/loading/RenderingOverlay.svelte";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type {
    ThumbnailVariant,
    ThumbnailRenderInput,
    ThumbnailVisibilitySettings,
    ThumbnailCacheKey,
  } from "$lib/shared/browse/services/thumbnail-key-deriver";
  import { getThumbnailRenderOrchestrator } from "$lib/shared/browse/get-thumbnail-render-orchestrator";
  import { getThumbnailLocalCache } from "$lib/shared/browse/get-thumbnail-local-cache";
  import type {
    ThumbnailLoadStatus,
    ThumbnailRenderOrchestrator,
  } from "$lib/shared/browse/services/thumbnail-render-orchestrator";
  import type { ThumbnailLocalCache } from "$lib/shared/browse/services/thumbnail-local-cache";
  import { deriveKey } from "$lib/shared/browse/services/thumbnail-key-deriver";
  import {
    buildGalleryRenderInput,
    deriveThumbnailSequenceName,
    galleryQrPolicy,
    galleryThumbnailRequestChanged,
    galleryStepCount,
    type GalleryQrPolicy,
  } from "$lib/shared/browse/services/gallery-render-input";
  import { repairThumbnailCaches } from "$lib/shared/browse/services/thumbnail-repair";
  import { calculateGalleryAspectRatio } from "$lib/shared/render/services/layout-calculator";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import { deriveWord } from "$lib/shared/foundation/services/word-deriver";
  import TKAWordGlyph from "$lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import { getImageCompositionManager } from "$lib/shared/share/state/image-composition-state.svelte";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";

  interface Props {
    sequence: SequenceData;
    leftPropType?: PropType;
    rightPropType?: PropType;
    catDogModeEnabled?: boolean;
    lightMode?: boolean;
    variant?: ThumbnailVariant;
    // Composition overrides
    addWord?: boolean;
    addStepNumbers?: boolean;
    includeStartPlacement?: boolean;
    startPlacementLayout?: "row" | "column";
    addDifficultyLevel?: boolean;
    addUserInfo?: boolean;
    showNotes?: boolean;
    customNotesText?: string;
    /** Show the LOOP transform icon strip in the card header (default true) */
    showLoopGlyph?: boolean;
    // Visibility overrides (grid, hand points, glyphs)
    visibility?: ThumbnailVisibilitySettings;
    // Render as hand-path visualization (float arrows for shifts, zero-turn dash for dashes)
    handPathMode?: boolean;
    /** Show blue motion (prop + arrow). Default: true */
    showLeftMotion?: boolean;
    /** Show red motion (prop + arrow). Default: true */
    showRightMotion?: boolean;
    // Skip IntersectionObserver and load immediately (use in modals/pickers)
    eager?: boolean;
    /** Allow a QR when this card has a prepared public scan asset. */
    allowQR?: boolean;
    /** Use 5:7 playing card layout for physical card export (different from lightMode/printMode) */
    cardMode?: boolean;
  }

  const {
    sequence,
    leftPropType,
    rightPropType,
    catDogModeEnabled = false,
    lightMode = false,
    variant = "gallery",
    addWord,
    addStepNumbers,
    includeStartPlacement,
    startPlacementLayout,
    addDifficultyLevel,
    addUserInfo,
    showNotes,
    customNotesText,
    showLoopGlyph,
    visibility,
    handPathMode = false,
    showLeftMotion = true,
    showRightMotion = true,
    eager = false,
    allowQR = true,
    cardMode = false,
  }: Props = $props();

  // State
  let containerRef = $state<HTMLDivElement | null>(null);
  let thumbnailUrl = $state<string | null>(null);
  let status = $state<ThumbnailLoadStatus>({ state: "idle" });
  let isVisible = $state(false);
  let currentKeyHash = $state<string | null>(null);
  let currentQrPolicy = $state<GalleryQrPolicy | null>(null);
  let displayedKey = $state<ThumbnailCacheKey | null>(null);
  let currentRequestController: AbortController | null = null;

  // Non-reactive flag to skip cache after 404 (avoids $effect dependency loop)
  let skipCacheOnNextRequest = false;
  // Debounce error handling to prevent rapid re-triggers
  let errorDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Services (resolved once on mount)
  let orchestrator: ThumbnailRenderOrchestrator | null = null;
  let localCache: ThumbnailLocalCache | null = null;
  let servicesReady = $state(false);

  // Layout calculator resolved synchronously (direct import for instant HMR)

  // Resolve effective settings: explicit props > user preference from composition manager
  const compositionManager = getImageCompositionManager();

  // Derived: beat count. Declared before the layout/visibility deriveds below
  // because both read it (one-count gating + per-length start layout).
  // Priority: steps array length (if not empty) > sequenceLength field > fallback to 4
  // NOTE: Use || not ?? because steps is often [] (empty array) for Community sequences,
  // and [].length is 0 which ?? treats as valid (only null/undefined fall through)
  const stepCount = $derived(galleryStepCount(sequence));

  // Resolve the per-step-count start-placement layout (honors the user's
  // "Top Row" / "Left Column" choice for THIS length), matching the viewer
  // preview and the export path. Reading the global startPlacementLayout here
  // ignored per-length overrides, so a one-count set to "Left Column" still
  // rendered row-mode in the gallery.
  const effectiveStartPlacementLayout = $derived(
    startPlacementLayout ??
      compositionManager.getStartPlacementLayoutForStepCount(stepCount)
  );

  // Derived: sequence name (raw) — used as the cache-key + source-doc lookup
  // identity. Kept as word||name so existing cloud/local thumbnail keys and
  // loadFullSequenceData() lookups stay stable.
  const sequenceName = $derived(deriveThumbnailSequenceName(sequence));

  // Derived: simplified display name (removes repeated patterns like "ABCABC" → "ABC").
  // Use the CONTENT-derived word (steps/stepPairings letters) rather than the raw
  // stored word/name. Sequences saved without a `word` carry an auto-generated
  // name like "Sequence 11:46:02 PM"; the glyph renderer keeps only TKA letters,
  // collapsing that to a nonsense "SPM"/"SAM". deriveWord reads the real letters,
  // matching what the section bucket and the rendered thumbnail show.
  const displayName = $derived(simplifyRepeatedWord(deriveWord(sequence)));

  // Derived: aspect ratio based on beat count, variant, and start position layout
  // Gallery variant has header + footer, wordcard uses natural aspect ratio
  const aspectRatio = $derived.by(() => {
    if (variant === "wordcard") {
      return undefined; // Choreo card uses natural image aspect ratio
    }
    return calculateGalleryAspectRatio(stepCount, effectiveStartPlacementLayout);
  });

  // Derived: Build render input from props via the shared builder so the live
  // card and the gallery-thumbnail-warmer produce byte-identical cache keys.
  const renderInput = $derived<ThumbnailRenderInput>(
    buildGalleryRenderInput({
      sequence,
      leftPropType,
      rightPropType,
      catDogModeEnabled,
      // The same palette the live PictographRenderer reads, so a card in a
      // picker matches the sheet it gets added to. Null keeps the card on the
      // shared default-color cache class.
      primaryPropColors: getSettings().primaryPropColors ?? null,
      lightMode,
      variant,
      addWord,
      addStepNumbers,
      includeStartPlacement,
      startPlacementLayout,
      addDifficultyLevel,
      addUserInfo,
      showNotes,
      customNotesText,
      showLoopGlyph,
      visibility,
      handPathMode,
      showLeftMotion,
      showRightMotion,
      allowQR,
      cardMode,
      compositionManager,
      isAuthenticated: authState.isAuthenticated,
    })
  );

  // Intersection observer for lazy loading
  let observer: IntersectionObserver | null = null;

  onMount(async () => {
    // Resolve services
    orchestrator = getThumbnailRenderOrchestrator();
    localCache = getThumbnailLocalCache();
    servicesReady = true;

    // Eager mode: skip IntersectionObserver entirely (used in modals/pickers
    // where cards are already visible but dialog top-layer breaks observer)
    if (eager) {
      isVisible = true;
      return;
    }

    // Set up intersection observer for lazy loading
    if (containerRef) {
      observer = new IntersectionObserver(
        ([entry]) => {
          isVisible = entry?.isIntersecting ?? false;
          if (!isVisible && currentRequestController) {
            currentRequestController.abort();
            currentRequestController = null;
            currentKeyHash = null;
            currentQrPolicy = null;
            status = { state: "idle" };
          }
        },
        { rootMargin: "50px", threshold: 0.01 }
      );
      observer.observe(containerRef);
    }
  });

  // Listen for cache invalidation (fired by admin "Clear Cloud Thumbnails" button)
  function handleCacheCleared() {
    if (!isVisible) return; // Only re-render visible thumbnails
    currentRequestController?.abort();
    currentRequestController = null;
    // Revoke old blob URL to prevent memory leak
    releaseUncachedThumbnail();
    // Skip all cache tiers on re-render - the whole point of clearing is to
    // get a fresh render. Without this, stale static/local thumbnails (e.g.
    // ones rendered before LOOP detection existed) would be served again.
    skipCacheOnNextRequest = true;
    // Reset state to force the $effect to re-fetch
    thumbnailUrl = null;
    currentKeyHash = null;
    currentQrPolicy = null;
    status = { state: "idle" };
  }

  $effect(() => {
    window.addEventListener("thumbnailCacheCleared", handleCacheCleared);
    return () => {
      window.removeEventListener("thumbnailCacheCleared", handleCacheCleared);
    };
  });

  onDestroy(() => {
    observer?.disconnect();

    // Clear any pending error debounce
    if (errorDebounceTimer) {
      clearTimeout(errorDebounceTimer);
    }

    currentRequestController?.abort();
    currentRequestController = null;

    // Don't revoke blob URLs that are in the memory cache - other components may reuse them.
    // The memory cache handles revocation on LRU eviction.
    releaseUncachedThumbnail();
  });

  function releaseUncachedThumbnail(): void {
    if (
      thumbnailUrl?.startsWith("blob:") &&
      orchestrator?.getCached(displayedKey?.hash ?? "") !== thumbnailUrl
    ) {
      URL.revokeObjectURL(thumbnailUrl);
    }
  }

  function handleImageLoad() {
    // Image loaded successfully
  }

  /**
   * Handle image load error (e.g., 404 from stale cloud URL).
   * Invalidates the cached URL and forces a fresh render (skipping cache).
   * Debounced to prevent rapid re-triggers from multiple error events.
   */
  function handleImageError() {
    // Debounce: if we already have a pending error handler, skip
    if (errorDebounceTimer) return;

    const urlType = thumbnailUrl?.startsWith("blob:") ? "blob" : "cloud";
    console.warn(
      `[Thumbnail] "${sequenceName}" - img ERROR (${urlType}) - will re-render`
    );

    if (!orchestrator) return;

    const key = displayedKey ?? deriveKey(renderInput);

    // Purge the tiers this failure actually condemns. A cloud URL that fails to
    // decode is a confirmed dead object — it outranks the manifest and the
    // persisted positive. A blob failure only proves the local bytes are bad.
    void repairThumbnailCaches({
      kind: urlType === "blob" ? "blob-decode" : "cloud-404",
      hash: key.hash,
      cloudKey: key.usesDefaults ? orchestrator.buildCloudKey(key) : null,
      localCache,
      evictHash: (h) => orchestrator?.evictHash(h),
    });

    // Set flag to skip cache on next request (prevents infinite loop)
    skipCacheOnNextRequest = true;

    // Debounce the state reset to prevent rapid cycling
    errorDebounceTimer = setTimeout(() => {
      errorDebounceTimer = null;
      // Revoke blob URL before clearing to prevent memory leak
      releaseUncachedThumbnail();
      // Clear current state to force re-fetch
      thumbnailUrl = null;
      currentKeyHash = null; // This will trigger the $effect to re-run
      currentQrPolicy = null;
      status = { state: "idle" };
    }, 100);
  }

  // React to visibility + input changes
  // Single effect replaces 13 prev* variable comparisons
  $effect(() => {
    if (!isVisible || !servicesReady || !orchestrator || !sequenceName) {
      return;
    }

    const key = deriveKey(renderInput);
    const qrPolicy = galleryQrPolicy({
      variant,
      cardMode,
      isAuthenticated: authState.isAuthenticated,
    });
    const sameImageKey = key.hash === currentKeyHash;

    // The image cache key stays stable during auth hydration, but a signed-in
    // reader may now prepare the preview's missing QR. Track that policy too.
    if (
      !galleryThumbnailRequestChanged(
        currentKeyHash === null
          ? null
          : { keyHash: currentKeyHash, qrPolicy: currentQrPolicy ?? undefined },
        { keyHash: key.hash, qrPolicy }
      )
    ) {
      return;
    }

    // Cancel previous render
    if (currentKeyHash) {
      currentRequestController?.abort();
      currentRequestController = null;
    }
    currentKeyHash = key.hash;
    currentQrPolicy = qrPolicy;

    // Synchronous memory cache check - instant on revisits, no placeholder flash
    if (!skipCacheOnNextRequest) {
      const cached = orchestrator.getCached(key.hash);
      if (cached) {
        if (thumbnailUrl !== cached) releaseUncachedThumbnail();
        displayedKey = key;
        thumbnailUrl = cached;
        status = { state: "complete", url: cached };
        return;
      }
    }

    // Auth hydration can promote this preview without changing its image key.
    // Keep the visible no-QR card in place while its QR work moves to the
    // background queue; a different image still gets the normal placeholder.
    if (!sameImageKey) {
      releaseUncachedThumbnail();
      displayedKey = null;
      thumbnailUrl = null;
    }

    // Capture and reset the skipCache flag
    const shouldSkipCache = skipCacheOnNextRequest;
    skipCacheOnNextRequest = false;

    // Calculate priority based on Y position (lower = closer to top = higher priority)
    const priority = containerRef?.getBoundingClientRect().top ?? Infinity;
    const requestController = new AbortController();
    currentRequestController = requestController;
    const requestIsCurrent = () =>
      key.hash === currentKeyHash &&
      qrPolicy === currentQrPolicy &&
      currentRequestController === requestController;

    // Request thumbnail (cache check → queue → render → upload)
    orchestrator
      .getThumbnail({
        sequence,
        input: renderInput,
        skipCache: shouldSkipCache,
        priority,
        signal: requestController.signal,
        // A signed-in reader sees the preview first, then the separate
        // background queue prepares the exact scan-ready QR. Guests only reuse
        // public prepared artwork, so scrolling can never allocate a code.
        qrPolicy,
        onPreview: (preview) => {
          if (requestIsCurrent() && preview.url) {
            displayedKey = preview.key;
            thumbnailUrl = preview.url;
            status = { state: "complete", url: preview.url };
          }
        },
        onStatusChange: (s) => {
          if (requestIsCurrent()) {
            status = s;
          }
        },
      })
      .then((result) => {
        // Only apply if still current
        if (requestIsCurrent()) {
          if (result.url) {
            displayedKey = result.key;
            thumbnailUrl = result.url;
            // Ensure loading overlay clears - prevents race where a re-queued
            // render sets status back to "queued" while thumbnailUrl persists
            status = { state: "complete", url: result.url };
          } else if (result.error) {
            thumbnailUrl = null;
            status = { state: "error", error: result.error };
          }
        }
      })
      .catch((err) => {
        const isCancellation =
          err?.message === "Cancelled" || err?.name === "AbortError";
        // Only show error if still current and not cancelled
        if (requestIsCurrent() && !isCancellation) {
          status = { state: "error", error: err };
        }
      })
      .then(() => {
        if (currentRequestController === requestController) {
          currentRequestController = null;
        }
      });
  });

  // Derive display states
  const isLoading = $derived(
    status.state === "checking-cache" ||
      status.state === "queued" ||
      status.state === "rendering" ||
      status.state === "uploading"
  );
  const hasError = $derived(status.state === "error");

  // Derive progress percentage from status state
  // Maps to where time is ACTUALLY spent:
  // - Waiting (cache/queue): 0% - no work started yet
  // - Rendering steps: 0-98% of bar (all the real work)
  // - Finalize: instant → 98-100% of bar
  const progressPercent = $derived.by(() => {
    switch (status.state) {
      case "idle":
      case "checking-cache":
      case "queued":
        // No progress until rendering actually starts
        return 0;
      case "rendering": {
        // Rendering gets 98% of the bar since it's virtually all the work
        if (status.progress) {
          const { current, total } = status.progress;
          if (total > 0) {
            // Scale beat progress to 0-98% range
            const stepProgress = (current / total) * 98;
            return Math.round(stepProgress);
          }
        }
        // Fallback when no progress data yet (just started)
        return 0;
      }
      case "uploading":
        return 99;
      case "complete":
        return 100;
      case "error":
        return 0;
      default:
        return 0;
    }
  });

  // Status label for accessibility
  // Uses stepCount (defined above) for display instead of progress.total which includes start position
  const statusLabel = $derived.by(() => {
    switch (status.state) {
      case "checking-cache":
        return "Checking";
      case "queued":
        return "Queued";
      case "rendering": {
        if (status.progress && status.progress.total > 0) {
          // Show progress relative to beat count, not total (which includes start position)
          // current starts at 1 for start position, so subtract 1 for beat-only display
          const currentStep = Math.max(
            0,
            status.progress.current - (status.progress.total - stepCount)
          );
          return `${currentStep}/${stepCount}`;
        }
        return "Rendering";
      }
      case "uploading":
        return "Saving";
      default:
        return "Loading";
    }
  });

  /**
   * Force re-render: delete from all cache tiers, then re-fetch from scratch.
   */
  export function forceRerender(): void {
    if (!orchestrator) return;

    const key = displayedKey ?? deriveKey(renderInput);

    // 1+2. Purge the local tiers through the shared repair path so the manual
    // force and the image-error path can't drift again. A manual force is NOT a
    // confirmed 404, so it uses blob-decode semantics — the cloud object keeps
    // its benefit of the doubt.
    void repairThumbnailCaches({
      kind: "blob-decode",
      hash: key.hash,
      cloudKey: key.usesDefaults ? orchestrator.buildCloudKey(key) : null,
      localCache,
      evictHash: (h) => orchestrator?.evictHash(h),
    });

    // 3. Force skip cache on next request
    skipCacheOnNextRequest = true;

    // 4. Revoke old blob URL
    releaseUncachedThumbnail();

    // 5. Reset state to trigger the $effect to re-fetch
    thumbnailUrl = null;
    currentKeyHash = null;
    currentQrPolicy = null;
    status = { state: "idle" };
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="prop-thumbnail"
  data-variant={variant}
  bind:this={containerRef}
  style:aspect-ratio={aspectRatio}
>
  {#if thumbnailUrl && !hasError}
    <img
      src={thumbnailUrl}
      alt={`Preview of ${sequenceName}`}
      loading="lazy"
      decoding="async"
      draggable="false"
      onload={handleImageLoad}
      onerror={handleImageError}
    />
    <!-- Loading overlay during re-renders (e.g., prop change) -->
    {#if isLoading}
      <RenderingOverlay
        label={statusLabel}
        progress={progressPercent}
        showProgressBar={true}
      />
    {/if}
  {:else if hasError}
    <div class="error-placeholder" aria-label="Failed to load">
      <span class="error-icon">!</span>
      <div class="placeholder-glyph">
        <TKAWordGlyph word={displayName} height={24} darkMode={!lightMode} />
      </div>
    </div>
  {:else}
    <!-- Unified placeholder: always shows word, conditionally shows loading indicators -->
    <div
      class="loading-placeholder"
      aria-label={isLoading ? statusLabel : "Waiting to load"}
    >
      <div class="placeholder-glyph">
        <TKAWordGlyph word={displayName} height={24} darkMode={!lightMode} />
      </div>
      {#if isLoading}
        <div class="loading-indicator">
          <ProgressRing percent={-1} size={24} strokeWidth={2} />
          <span class="loading-status">{statusLabel}</span>
        </div>
        <div
          class="progress-bar"
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={statusLabel}
        >
          <div class="progress-fill" style:width="{progressPercent}%"></div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .prop-thumbnail {
    position: relative;
    width: 100%;
    max-width: 100%;
    max-height: 100%;
    /* aspect-ratio is set dynamically via inline style based on beat count */
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg);
    overflow: hidden;
    position: relative;
    box-sizing: border-box;
    flex-shrink: 1;
  }

  /* Container query adaptive sizing */
  @container image-container (aspect-ratio > 4/3) {
    .prop-thumbnail {
      width: auto;
      height: 100cqh;
      max-height: 100%;
    }
  }

  @container image-container (aspect-ratio <= 4/3) {
    .prop-thumbnail {
      width: 100cqw;
      height: auto;
      max-width: 100%;
    }
  }

  /* Word cards use natural image dimensions */
  .prop-thumbnail[data-variant="wordcard"] {
    aspect-ratio: unset;
  }

  .prop-thumbnail[data-variant="wordcard"] img {
    width: 100%;
    height: auto;
    object-fit: fill;
  }

  .prop-thumbnail img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: contain;
    max-width: 100%;
    max-height: 100%;
    -webkit-user-drag: none;
    user-select: none;
    pointer-events: none;
  }

  .loading-placeholder,
  .error-placeholder {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 12px;
    background: linear-gradient(
      135deg,
      var(--theme-card-hover-bg),
      var(--theme-panel-bg)
    );
    color: var(--theme-text-dim);
    box-sizing: border-box;
    overflow: hidden;
  }

  /* Skeleton shimmer effect for loading state */
  .loading-placeholder::before {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.04) 50%,
      transparent 100%
    );
    animation: skeleton-shimmer 1.5s ease-in-out infinite;
    pointer-events: none;
  }

  @keyframes skeleton-shimmer {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }

  .placeholder-glyph {
    max-width: 95%;
    opacity: 0.95;
    display: flex;
    justify-content: center;
    overflow: hidden;
  }

  .loading-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .loading-status {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text, rgba(255, 255, 255, 0.9));
    text-transform: capitalize;
  }

  .error-placeholder {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--semantic-error) 10%, transparent),
      var(--theme-panel-bg)
    );
  }

  .error-icon {
    font-size: 2rem;
    font-weight: 700;
    color: var(--semantic-error);
  }

  /* Progress bar */
  .progress-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--theme-accent, #6366f1);
    transition: width var(--duration-emphasis) ease-out;
    border-radius: 0 2px 2px 0;
  }

  /* Container query responsive sizing */
  @container choreo-card (max-width: 249px) {
    .loading-indicator {
      gap: 4px;
    }
    .loading-status {
      font-size: 12px;
    }
    .progress-bar {
      height: 3px;
    }
  }

  /* Very small cards - hide some elements */
  @container choreo-card (max-width: 149px) {
    .loading-status {
      display: none;
    }
    .loading-indicator {
      gap: 0;
    }
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .loading-placeholder::before {
      animation: none;
    }
  }
</style>
