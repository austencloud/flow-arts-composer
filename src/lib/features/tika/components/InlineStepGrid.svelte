<!--
  Inline Step Grid Component

  Renders a sequence broken down into individual pictographs with step labels.
  Shows each beat (including start position) as a static pictograph.

  Loading priority (production-ready):
  1. Static files in /static/pictographs/ (instant, works in production)
  2. IndexedDB cache (fast, browser-persisted)
  3. API generation (dev only, saves to static for future)
-->
<script lang="ts">
  import { untrack } from "svelte";
  import type { InlineStepGrid } from "../types";
  import { dev } from "$app/environment";
  import { tikaPictographCache } from "$lib/shared/tika/services/tika-pictograph-cache";
  import {
    getStaticPictographPath,
    saveStaticPictograph,
    type PictographFileKey,
  } from "../services/static-pictograph-writer";
  import { sanitizeSvg } from "../services/svg-sanitizer";

  // Module-level SVG cache (shared across instances)
  const svgCache = new Map<string, string>();

  // Props
  let {
    stepGrid,
  }: {
    stepGrid: InlineStepGrid;
  } = $props();

  // API size for image generation (consistent quality)
  const apiItemSize = 180;

  // State - map of stepNumber -> image URLs (static path or base64)
  let images = $state<Map<number, string>>(new Map());
  let svgMarkups = $state<Map<number, string>>(new Map());
  let loading = $state(true);
  let loadedCount = $state(0);

  const prefersReducedMotion =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  // Generate cache key (includes grid mode)
  function getCacheKey(letter: string, variation: number, size: number): string {
    const gridMode = stepGrid.gridMode ?? "diamond";
    return `${letter}-${variation}-${size}-${gridMode}`;
  }

  function buildSvgCacheKey(letter: string, variation: number): string {
    const gridMode = stepGrid.gridMode ?? "diamond";
    return `${letter}-${variation}-${gridMode}`;
  }

  // Build static file key
  function buildStaticKey(letter: string, variation: number): PictographFileKey {
    return {
      letter,
      variation,
      gridMode: (stepGrid.gridMode ?? "diamond") as "diamond" | "box",
    };
  }

  // Check if static file exists using GET + Content-Type verification.
  // HEAD requests return 200 for non-existent files in Vite dev, so we
  // fetch the file and verify Content-Type to confirm it's actually an image.
  async function checkStaticFile(key: PictographFileKey): Promise<string | null> {
    const path = getStaticPictographPath(key);
    try {
      const response = await fetch(path, { method: "GET" });
      if (!response.ok) return null;

      const contentType = response.headers.get("Content-Type");
      if (!contentType?.startsWith("image/")) {
        return null;
      }

      return path;
    } catch {
      return null;
    }
  }

  // Fetch all step images when stepGrid changes.
  // untrack prevents state writes from re-triggering the effect.
  $effect(() => {
    const _steps = stepGrid.steps;
    const _gridMode = stepGrid.gridMode;
    untrack(() => {
      fetchStepImages();
    });
  });

  async function fetchStepImages() {
    loading = true;
    loadedCount = 0;
    const newImages = new Map<number, string>();
    const newSvgMarkups = new Map<number, string>();
    const stepsNeedingPng: Array<{ stepNumber: number; letter: string; variation: number }> = [];
    const gridMode = stepGrid.gridMode ?? "diamond";

    // Step 1: Try SVG for all items sequentially (matches InlineGallery pattern)
    for (const step of stepGrid.steps) {
      const cacheKey = buildSvgCacheKey(step.letter, step.variation);

      // Check SVG cache first (instant)
      const cached = svgCache.get(cacheKey);
      if (cached) {
        newSvgMarkups.set(step.stepNumber, cached);
        loadedCount++;
        continue;
      }

      // Fetch SVG from API
      try {
        const response = await fetch("/api/tika/pictograph", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            letter: step.letter,
            variation: step.variation,
            gridMode,
            format: "svg",
            options: {
              darkMode: true,
              size: apiItemSize,
              showTKA: true,
              showGrid: true,
            },
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.svgMarkup) {
            const sanitized = sanitizeSvg(data.svgMarkup);
            svgCache.set(cacheKey, sanitized);
            newSvgMarkups.set(step.stepNumber, sanitized);
            loadedCount++;
            continue;
          }
        }
      } catch {
        // SVG fetch failed, fall through to PNG
      }

      stepsNeedingPng.push({
        stepNumber: step.stepNumber,
        letter: step.letter,
        variation: step.variation,
      });
    }

    // Update SVG state once after all items
    svgMarkups = new Map(newSvgMarkups);

    // Step 2: Fall back to PNG for items that failed SVG
    for (const { stepNumber, letter, variation } of stepsNeedingPng) {
      const staticKey = buildStaticKey(letter, variation);

      // Priority 1: Static file
      const staticPath = await checkStaticFile(staticKey);
      if (staticPath) {
        newImages.set(stepNumber, staticPath);
        loadedCount++;
        continue;
      }

      // Priority 2: IndexedDB cache
      const cacheKey = getCacheKey(letter, variation, apiItemSize);
      const cached = await tikaPictographCache.get(cacheKey);
      if (cached) {
        newImages.set(stepNumber, `data:image/png;base64,${cached}`);
        loadedCount++;
        continue;
      }

      // No static or cached PNG available - item will show spinner
    }

    images = new Map(newImages);
    loading = false;
  }
</script>

<figure class="inline-step-grid">
  <div class="word-header">
    <span class="word-label">{stepGrid.word}</span>
    <span class="step-count">{stepGrid.steps.length} steps</span>
  </div>

  <div class="steps-grid">
    {#each stepGrid.steps as step}
      {@const imageUrl = images.get(step.stepNumber)}
      {@const svgContent = svgMarkups.get(step.stepNumber)}
      <div class="step-item" class:is-start={step.stepNumber === 0}>
        <div class="step-label">{step.label}</div>
        <div class="pictograph-container">
          {#if svgContent}
            <div class="svg-pictograph" class:animate={!prefersReducedMotion}>
              {@html svgContent}
            </div>
          {:else if imageUrl}
            <img src={imageUrl} alt="{step.label}: {step.letter}" />
          {:else}
            <div class="placeholder">
              <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
            </div>
          {/if}
        </div>
        <div class="step-letter">{step.letter}</div>
        <div class="step-positions">
          {step.startPlacement} → {step.endPlacement}
        </div>
      </div>
    {/each}
  </div>

  {#if stepGrid.caption}
    <figcaption class="grid-caption">{stepGrid.caption}</figcaption>
  {/if}

  {#if loading && loadedCount < stepGrid.steps.length}
    <div class="loading-indicator">
      Loading {loadedCount}/{stepGrid.steps.length} steps
    </div>
  {/if}
</figure>

<style>
  .inline-step-grid {
    margin: 12px 0;
    padding: 0;
    width: 100%;
  }

  .word-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .word-label {
    font-size: 18px;
    font-weight: 600;
    color: var(--theme-text, #ffffff);
    letter-spacing: 0.05em;
  }

  .step-count {
    font-size: 12px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    padding: 2px 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-radius: 10px;
  }

  .steps-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
  }

  .step-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    transition: border-color var(--duration-fast, 0.15s) ease;
  }

  .step-item:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .step-item.is-start {
    border-color: var(--theme-accent, #a855f7);
    border-width: 2px;
  }

  .step-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    padding: 2px 8px;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.5));
    border-radius: 4px;
  }

  .step-item.is-start .step-label {
    background: var(--theme-accent, #a855f7);
    color: var(--theme-text, #ffffff);
  }

  .pictograph-container {
    width: 100%;
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pictograph-container img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    border-radius: 6px;
  }

  .placeholder {
    width: 100%;
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    font-size: 20px;
  }

  .step-letter {
    font-size: 16px;
    font-weight: 700;
    color: var(--theme-text, #ffffff);
  }

  .step-positions {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    white-space: nowrap;
  }

  .grid-caption {
    margin-top: 12px;
    font-size: 12px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    text-align: center;
    font-style: italic;
  }

  .loading-indicator {
    margin-top: 8px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    text-align: center;
  }

  /* SVG inline rendering */
  .svg-pictograph {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
  }

  .svg-pictograph :global(svg) {
    width: 100%;
    height: auto;
    border-radius: 6px;
  }

  /* GPU-accelerated progressive reveal */
  .svg-pictograph.animate :global(.svg-bg),
  .svg-pictograph.animate :global(.svg-grid),
  .svg-pictograph.animate :global(.svg-prop),
  .svg-pictograph.animate :global(.svg-arrow),
  .svg-pictograph.animate :global(.svg-glyph) {
    will-change: transform, opacity;
  }

  .svg-pictograph.animate :global(.svg-bg) {
    animation: svgReveal 0.3s ease-out both;
    animation-delay: 0ms;
  }

  .svg-pictograph.animate :global(.svg-grid) {
    animation: svgReveal 0.3s ease-out both;
    animation-delay: 80ms;
  }

  .svg-pictograph.animate :global(.svg-prop) {
    animation: svgReveal 0.35s ease-out both;
    animation-delay: 200ms;
  }

  .svg-pictograph.animate :global(.svg-arrow) {
    animation: svgReveal 0.35s ease-out both;
    animation-delay: 350ms;
  }

  .svg-pictograph.animate :global(.svg-glyph) {
    animation: svgReveal 0.3s ease-out both;
    animation-delay: 480ms;
  }

  @keyframes svgReveal {
    from {
      opacity: 0;
      transform: scale(0.96);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* Mobile: 2 columns */
  @media (max-width: 480px) {
    .steps-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .placeholder i {
      animation: none;
    }

    .step-item {
      transition: none;
    }

    .svg-pictograph :global(.svg-bg),
    .svg-pictograph :global(.svg-grid),
    .svg-pictograph :global(.svg-prop),
    .svg-pictograph :global(.svg-arrow),
    .svg-pictograph :global(.svg-glyph) {
      animation: none !important;
      opacity: 1 !important;
    }
  }
</style>
