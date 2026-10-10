<!--
  Inline Pictograph Component

  Renders a single pictograph image inline within a message bubble.

  Loading priority (production-ready):
  1. Static files in /static/pictographs/ (instant, works in production)
  2. IndexedDB cache (fast, browser-persisted)
  3. API generation (dev only, saves to static for future)

  Uses responsive sizing when no explicit size is provided.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import type { InlinePictograph } from "../types";
  import { dev } from "$app/env";
  import { tikaPictographCache } from "#lib/shared/tika/services/tika-pictograph-cache.js";
  import {
    getStaticPictographPath,
    saveStaticPictograph,
    type PictographFileKey,
  } from "../services/static-pictograph-writer";
  import { sanitizeSvg } from "../services/svg-sanitizer";

  /**
   * Module-level SVG cache shared across all InlinePictograph instances.
   * Keyed by "letter-variation-gridMode[-propType]" - same key pattern as PNG cache.
   * Themeable SVGs work in both light/dark mode, so one cache entry serves all themes.
   */
  const svgCache = new Map<string, string>();

  function buildSvgCacheKey(p: InlinePictograph): string {
    const parts = [p.letter, String(p.variation ?? 0), p.gridMode ?? "diamond"];
    if (p.propType) parts.push(p.propType);
    return parts.join("-");
  }

  // Props - size is optional; when not provided, uses responsive CSS sizing
  let {
    pictograph,
    size,
  }: {
    pictograph: InlinePictograph;
    size?: number;
  } = $props();

  // API request size - use explicit size or high quality default for responsive display
  const apiSize = $derived(size ?? 280);

  // State
  let imageUrl = $state<string | null>(null);
  let loading = $state(true);
  let error = $state(false);
  let svgMarkup = $state<string | null>(null);
  let useSvg = $state(true);

  const prefersReducedMotion =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  // Generate cache key (includes grid mode and prop type for uniqueness)
  function getCacheKey(letter: string, variation: number, imageSize: number): string {
    const gridMode = pictograph.gridMode ?? "diamond";
    const base = `${letter}-${variation}-${imageSize}-${gridMode}`;
    return pictograph.propType ? `${base}-${pictograph.propType}` : base;
  }

  // Build static file key
  function buildStaticKey(letter: string, variation: number): PictographFileKey {
    return {
      letter,
      variation,
      gridMode: (pictograph.gridMode ?? "diamond") as "diamond" | "box",
      propType: pictograph.propType,
    };
  }

  // Check if static file exists
  // Note: HEAD requests don't work reliably in Vite dev (returns 200 for non-existent files)
  // Instead, we fetch the file and check Content-Type to verify it's actually an image
  async function checkStaticFile(key: PictographFileKey): Promise<string | null> {
    const path = getStaticPictographPath(key);
    try {
      const response = await fetch(path, { method: "GET" });
      if (!response.ok) return null;

      // Verify it's actually an image (not an HTML error page)
      const contentType = response.headers.get("Content-Type");
      if (!contentType?.startsWith("image/")) {
        return null;
      }

      return path;
    } catch {
      return null;
    }
  }

  async function fetchSvgPictograph(): Promise<boolean> {
    const cacheKey = buildSvgCacheKey(pictograph);

    const cached = svgCache.get(cacheKey);
    if (cached) {
      svgMarkup = cached;
      return true;
    }

    try {
      const response = await fetch("/api/tika/pictograph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          letter: pictograph.letter,
          variation: pictograph.variation ?? 0,
          gridMode: pictograph.gridMode ?? "diamond",
          format: "svg",
          options: {
            darkMode: true,
            size: apiSize,
            showTKA: true,
            showGrid: true,
            ...(pictograph.propType && {
              leftPropType: pictograph.propType,
              rightPropType: pictograph.propType,
            }),
          },
        }),
      });

      if (!response.ok) return false;

      const data = await response.json();
      if (!data.svgMarkup) return false;

      const sanitized = sanitizeSvg(data.svgMarkup);
      svgCache.set(cacheKey, sanitized);
      svgMarkup = sanitized;
      return true;
    } catch {
      return false;
    }
  }

  // Fetch pictograph on mount or when pictograph changes.
  // untrack prevents state writes from re-triggering the effect.
  $effect(() => {
    const _letter = pictograph.letter;
    if (!_letter) return;

    untrack(() => {
      loading = true;
      error = false;
      svgMarkup = null;

      (async () => {
        if (useSvg) {
          const svgSuccess = await fetchSvgPictograph();
          if (svgSuccess) {
            loading = false;
            return;
          }
          useSvg = false;
        }
        await fetchPictograph();
      })();
    });
  });

  async function fetchPictograph() {
    loading = true;
    error = false;
    imageUrl = null;

    const variation = pictograph.variation ?? 0;
    const staticKey = buildStaticKey(pictograph.letter, variation);

    try {
      // Priority 1: Static file (instant, works in production)
      const staticPath = await checkStaticFile(staticKey);
      if (staticPath) {
        imageUrl = staticPath;
        loading = false;
        return;
      }

      // Priority 2: IndexedDB cache
      const cacheKey = getCacheKey(pictograph.letter, variation, apiSize);
      const cached = await tikaPictographCache.get(cacheKey);
      if (cached) {
        imageUrl = `data:image/png;base64,${cached}`;
        loading = false;
        return;
      }

      // Priority 3: API (dev only)
      // Note: dev can be undefined in some contexts, so check explicitly for false
      if (dev === false) {
        console.warn(`[InlinePictograph] Missing pictograph in production: ${pictograph.letter}-${variation}`);
        error = true;
        loading = false;
        return;
      }

      // Fetch from API
      const response = await fetch("/api/tika/pictograph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          letter: pictograph.letter,
          variation,
          gridMode: pictograph.gridMode ?? "diamond",
          options: {
            darkMode: true,
            size: apiSize,
            showTKA: true,
            showGrid: true,
            ...(pictograph.propType && {
              leftPropType: pictograph.propType,
              rightPropType: pictograph.propType,
            }),
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch pictograph: ${response.status}`);
      }

      const data = await response.json();
      const base64 = data.imageBase64 as string;

      // Save to static directory for production (dev only)
      await saveStaticPictograph(staticKey, base64);

      // Also cache in IndexedDB for this session
      await tikaPictographCache.set(cacheKey, base64);

      imageUrl = `data:image/png;base64,${base64}`;
    } catch (e) {
      console.error(`[InlinePictograph] Error fetching ${pictograph.letter}:`, e);
      error = true;
    } finally {
      loading = false;
    }
  }
</script>

<figure
  class="inline-pictograph"
  class:responsive={!size}
  style={size ? `--size: ${size}px` : undefined}
>
  {#if loading}
    <div class="placeholder">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
    </div>
  {:else if error}
    <div class="error-state">
      <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
      <span>{pictograph.letter}</span>
    </div>
  {:else if svgMarkup}
    <div
      class="svg-pictograph"
      class:animate={!prefersReducedMotion}
    >
      {@html svgMarkup}
    </div>
  {:else if imageUrl}
    <img src={imageUrl} alt="Letter {pictograph.letter}" />
  {/if}

  {#if pictograph.label}
    <figcaption class="label {pictograph.label}">{pictograph.label}</figcaption>
  {/if}
</figure>

<style>
  .inline-pictograph {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    margin: 8px 4px;
    padding: 0;
  }

  .inline-pictograph img {
    width: var(--size, 120px);
    max-width: 40vw;
    height: auto;
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .placeholder,
  .error-state {
    width: var(--size, 120px);
    max-width: 40vw;
    aspect-ratio: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-size: 14px;
  }

  /* Responsive mode - single pictograph can be BIG */
  .inline-pictograph.responsive img,
  .inline-pictograph.responsive .placeholder,
  .inline-pictograph.responsive .error-state {
    width: clamp(180px, 50vw, 320px);
    max-width: none;
  }

  .error-state {
    color: var(--semantic-error, #ef4444);
  }

  .error-state i {
    font-size: 20px;
  }

  .error-state span {
    font-weight: 600;
    font-size: 16px;
  }

  .label {
    margin: 0;
    padding: 2px 10px;
    border-radius: 4px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .label.pro {
    background: color-mix(in srgb, var(--semantic-success, #22c55e) 20%, transparent);
    color: var(--semantic-success, #22c55e);
    border: 1px solid color-mix(in srgb, var(--semantic-success, #22c55e) 40%, transparent);
  }

  .label.anti {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 20%, transparent);
    color: var(--semantic-error, #ef4444);
    border: 1px solid color-mix(in srgb, var(--semantic-error, #ef4444) 40%, transparent);
  }

  .label.hybrid {
    background: color-mix(in srgb, var(--semantic-info, #a855f7) 20%, transparent);
    color: var(--semantic-info, #a855f7);
    border: 1px solid color-mix(in srgb, var(--semantic-info, #a855f7) 40%, transparent);
  }

  /* Default label style */
  .label:not(.pro):not(.anti):not(.hybrid) {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.7));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
  }

  /* SVG inline rendering */
  .svg-pictograph {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .svg-pictograph :global(svg) {
    width: var(--size, 120px);
    max-width: 40vw;
    height: auto;
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .inline-pictograph.responsive .svg-pictograph :global(svg) {
    width: clamp(180px, 50vw, 320px);
    max-width: none;
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

  /* Mobile adjustments */
  @media (max-width: 480px) {
    .inline-pictograph img,
    .placeholder,
    .error-state {
      max-width: 35vw;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .placeholder i {
      animation: none;
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
