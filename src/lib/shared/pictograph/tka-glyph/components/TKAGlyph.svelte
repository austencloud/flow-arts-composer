<script lang="ts" module>
  import { getLetterImagePath as getPath } from "../utils/letter-image-getter";
  import { Letter as LetterType } from "#lib/shared/foundation/domain/models/letter.js";

  // Restore caches from HMR data if available, otherwise create fresh
  const globalDimensionsCache: Map<string, { width: number; height: number }> =
    import.meta.hot?.data?.dimensionsCache ?? new Map();
  const globalSvgDataUrlCache: Map<string, string> =
    import.meta.hot?.data?.svgDataUrlCache ?? new Map();
  // Parallel cache of dark-mode (white-recolored) letter data URLs. Dark mode
  // recolors the letter AT THE SOURCE (swap black fills → off-white in the SVG
  // markup) instead of applying an SVG/CSS filter to the rendered <image>.
  // iOS WebKit (bug 184601) defers filter rasterization on a <g> containing an
  // <image>, so the glyph rendered black when static and only inverted while
  // animating. A pre-recolored source has no filter, so it is white in every
  // state and also serializes correctly for the image-export pipeline.
  const globalWhiteSvgDataUrlCache: Map<string, string> =
    import.meta.hot?.data?.whiteSvgDataUrlCache ?? new Map();
  const globalLoadingPromises = new Map<
    string,
    Promise<{ width: number; height: number }>
  >(); // Not persisted - in-flight requests should restart

  // Persist caches before HMR disposal
  if (import.meta.hot) {
    import.meta.hot.dispose((data) => {
      data.dimensionsCache = globalDimensionsCache;
      data.svgDataUrlCache = globalSvgDataUrlCache;
      data.whiteSvgDataUrlCache = globalWhiteSvgDataUrlCache;
    });
  }

  /** Off-white used for dark-mode glyphs (matches the grid + old invert look). */
  const DARK_GLYPH_COLOR = "#d9d9d9";

  /**
   * Recolor a letter SVG's black ink to off-white for dark mode. Letter SVGs
   * use explicit black fills (`fill="#000000"`, occasionally `#000`/`black`/
   * `#231f20`); swap those to off-white and inject a default fill on the root so
   * any unfilled path (which would default to black) is covered too.
   */
  function recolorSvgToWhite(svgText: string): string {
    const recolored = svgText.replace(
      /fill\s*=\s*(["'])\s*(#000000|#000|black|#231f20)\s*\1/gi,
      `fill="${DARK_GLYPH_COLOR}"`
    );
    // Inject a default fill on the <svg> root so any path lacking an explicit
    // fill (browser default = black) also renders off-white.
    return recolored.replace(
      /<svg\b([^>]*)>/i,
      (match, attrs) =>
        /\bfill\s*=/.test(attrs)
          ? match
          : `<svg${attrs} fill="${DARK_GLYPH_COLOR}">`
    );
  }

  /** Build a base64 data URL from SVG markup. */
  function svgToDataUrl(svgText: string): string {
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgText)))}`;
  }

  /**
   * Get cached data URL for a letter, or null if not cached.
   */
  export function getCachedSvgDataUrl(letter: string): string | null {
    return globalSvgDataUrlCache.get(letter) ?? null;
  }

  /**
   * Get cached dimensions for a letter, or default if not cached.
   * Used by TurnsColumn to position turn numbers to the right of the letter.
   */
  export function getLetterDimensions(letter: string | null | undefined): {
    width: number;
    height: number;
  } {
    if (!letter) return { width: 100, height: 100 };
    return globalDimensionsCache.get(letter) ?? { width: 100, height: 100 };
  }

  /**
   * Preload letter SVGs for a list of letters.
   * Call this before animation starts to prevent flash on first render.
   * Caches both dimensions AND the SVG as a data URL for instant rendering.
   * Returns a promise that resolves when all letters are cached.
   */
  export async function preloadLetterDimensions(
    letters: (string | null | undefined)[]
  ): Promise<void> {
    const uniqueLetters = [
      ...new Set(
        letters.filter((l): l is string => l != null && l.trim() !== "")
      ),
    ];

    await Promise.all(
      uniqueLetters.map(async (letter) => {
        // Already cached - skip
        if (
          globalDimensionsCache.has(letter) &&
          globalSvgDataUrlCache.has(letter)
        )
          return;

        // Already loading - wait for it
        if (globalLoadingPromises.has(letter)) {
          await globalLoadingPromises.get(letter);
          return;
        }

        // Load and cache
        const loadPromise = (async () => {
          try {
            const svgPath = getPath(letter as LetterType);
            const response = await fetch(svgPath);
            if (!response.ok) throw new Error(`Failed to fetch ${svgPath}`);

            const svgText = await response.text();
            const viewBoxMatch = svgText.match(
              /viewBox\s*=\s*"[\d.-]+\s+[\d.-]+\s+([\d.-]+)\s+([\d.-]+)"/i
            );

            const dims = viewBoxMatch
              ? {
                  width: parseFloat(viewBoxMatch[1] || "100"),
                  height: parseFloat(viewBoxMatch[2] || "100"),
                }
              : { width: 100, height: 100 };

            // Cache dimensions
            globalDimensionsCache.set(letter, dims);

            // Cache SVG as data URL for instant rendering (no network request needed)
            globalSvgDataUrlCache.set(letter, svgToDataUrl(svgText));
            // Cache the dark-mode (white-recolored) variant alongside it.
            globalWhiteSvgDataUrlCache.set(
              letter,
              svgToDataUrl(recolorSvgToWhite(svgText))
            );

            return dims;
          } catch (error) {
            console.error(
              `Failed to preload letter dimensions for ${letter}:`,
              error
            );
            return { width: 50, height: 50 };
          } finally {
            globalLoadingPromises.delete(letter);
          }
        })();

        globalLoadingPromises.set(letter, loadPromise);
        await loadPromise;
      })
    );
  }
</script>

<script lang="ts">
  import type { PictographData } from "../../shared/domain/models/pictograph-data";
  import { Letter } from "#lib/shared/foundation/domain/models/letter.js";
  import {
    getLetterImagePath,
    isDashLetter,
  } from "../utils/letter-image-getter";
  import { onMount } from "svelte";
  import Dash from "./Dash.svelte";
  import { getAnimationVisibilityManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";

  let {
    letter,
    x = 50, // Match legacy positioning exactly
    y = 800, // Match legacy positioning exactly
    pictographData = undefined,
    scale = 1, // Match legacy default scale
    visible = true,
    previewMode = false,
    animateVisibility = false,
    onToggle = undefined,
    // Dark Mode override for export (when set, applies filter override)
    darkMode = undefined,
  } = $props<{
    /** The letter to display */
    letter: string | null | undefined;
    /** Position X coordinate */
    x?: number;
    /** Position Y coordinate */
    y?: number;
    /** Full pictograph data for turn color interpretation */
    pictographData?: PictographData | null;
    /** Scale factor - match legacy behavior */
    scale?: number;
    /** Visibility control for fade effect */
    visible?: boolean;
    /** Preview mode: show at 50% opacity when off instead of hidden */
    previewMode?: boolean;
    /** Keep mounted while hidden so the opacity fade can play (live DOM only, not export) */
    animateVisibility?: boolean;
    /** Callback when glyph is clicked to toggle visibility */
    onToggle?: () => void;
    /** Dark Mode override for export. When set, applies filter override. */
    darkMode?: boolean;
  }>();

  // Dark mode is applied as an inline filter rather than via the global
  // :root.dark CSS cascade. iOS Safari PWA fails to re-apply `filter: invert()`
  // on an SVG <g> when the class is added after first style resolution -
  // the glyph renders in its native black color against the dark background
  // while the DirectionDot and TurnsColumn (which use inline fills) render fine.
  // Matching DirectionDot's pattern: read dark mode from the visibility manager
  // and bake it into an inline style so the filter never depends on the cascade.
  const visibilityManager = getAnimationVisibilityManager();
  let localDarkMode = $state(visibilityManager.isDarkMode());
  $effect(() => {
    const handler = () => {
      localDarkMode = visibilityManager.isDarkMode();
    };
    visibilityManager.registerObserver(handler);
    return () => visibilityManager.unregisterObserver(handler);
  });
  const effectiveDarkMode = $derived(darkMode ?? localDarkMode);

  // Letter dimensions state - async-loaded by $effect for uncached letters
  let letterDimensions = $state({ width: 100, height: 100 });

  // Effective dimensions: synchronous cache lookup + async fallback.
  // TurnsColumn uses the same sync-cache pattern for positioning.
  // Both MUST agree on dimensions to prevent turn numbers overlapping the letter.
  // Without this, TKAGlyph's $effect updates dimensions AFTER render,
  // while TurnsColumn's $derived.by reads from cache DURING render - one-frame mismatch.
  const effectiveDimensions = $derived.by(() => {
    if (letter) {
      const cached = globalDimensionsCache.get(letter);
      if (cached && (cached.width !== 100 || cached.height !== 100)) {
        return cached;
      }
    }
    return letterDimensions;
  });

  // Local SVG data URL for this component instance (avoids global state reactivity issues)
  let localSvgDataUrl = $state<string | null>(null);

  // Image source - checks global cache for CURRENT letter first (synchronous)
  // CRITICAL: localSvgDataUrl is $state updated by $effect (runs AFTER render),
  // so it's stale for one frame when letter changes. Reading from globalSvgDataUrlCache
  // keyed by the current letter avoids showing the old letter's image.
  //
  // Dark mode uses the white-recolored variant (no filter — see recolorSvgToWhite
  // for the iOS WebKit reason). It's cached in lockstep with the normal URL, so
  // whenever the normal one is available the white one is too.
  const imageSrc = $derived.by(() => {
    if (!letter) return "";
    // Sync lookup for current letter - no $effect delay
    if (effectiveDarkMode) {
      const whiteUrl = globalWhiteSvgDataUrlCache.get(letter);
      if (whiteUrl) return whiteUrl;
    }
    const cachedUrl = globalSvgDataUrlCache.get(letter);
    if (cachedUrl) return cachedUrl;
    // Fall back to file path (will be replaced when $effect loads data).
    // The raw file is black; it shows for at most one frame before the
    // recolored data URL lands, then the $derived re-runs with the white URL.
    return localSvgDataUrl ?? getLetterImagePath(letter as Letter);
  });

  // Check if image is ready (has cached data URL)
  const imageReady = $derived(localSvgDataUrl !== null);

  // Load letter dimensions and SVG data URL using cache
  // Uses global cache to prevent duplicate fetches across all TKAGlyph instances
  async function loadLetterData(currentLetter: Letter) {
    if (!currentLetter) return;

    const cacheKey = currentLetter;

    // Check global cache first (fastest path) - sync access for instant render
    if (globalDimensionsCache.has(cacheKey)) {
      letterDimensions = globalDimensionsCache.get(cacheKey)!;
    }
    if (globalSvgDataUrlCache.has(cacheKey)) {
      // Already cached - set local state
      localSvgDataUrl = globalSvgDataUrlCache.get(cacheKey)!;
      return;
    }

    // Check if already loading (prevents duplicate concurrent fetches)
    if (globalLoadingPromises.has(cacheKey)) {
      await globalLoadingPromises.get(cacheKey);
      // After loading completes, grab from cache
      if (globalDimensionsCache.has(cacheKey)) {
        letterDimensions = globalDimensionsCache.get(cacheKey)!;
      }
      if (globalSvgDataUrlCache.has(cacheKey)) {
        localSvgDataUrl = globalSvgDataUrlCache.get(cacheKey)!;
      }
      return;
    }

    // Create loading promise for deduplication
    const loadPromise = (async () => {
      try {
        const svgPath = getLetterImagePath(currentLetter as Letter);
        const response = await fetch(svgPath);
        if (!response.ok)
          throw new Error(`Failed to fetch ${svgPath}: ${response.status}`);

        const svgText = await response.text();
        const viewBoxMatch = svgText.match(
          /viewBox\s*=\s*"[\d.-]+\s+[\d.-]+\s+([\d.-]+)\s+([\d.-]+)"/i
        );

        let dims: { width: number; height: number };
        if (!viewBoxMatch) {
          dims = { width: 100, height: 100 };
        } else {
          dims = {
            width: parseFloat(viewBoxMatch[1] || "100"),
            height: parseFloat(viewBoxMatch[2] || "100"),
          };
        }

        // Cache dimensions
        globalDimensionsCache.set(cacheKey, dims);

        // Cache SVG as data URL for instant rendering
        globalSvgDataUrlCache.set(cacheKey, svgToDataUrl(svgText));
        // Cache the dark-mode (white-recolored) variant alongside it.
        globalWhiteSvgDataUrlCache.set(
          cacheKey,
          svgToDataUrl(recolorSvgToWhite(svgText))
        );

        return dims;
      } catch (error) {
        console.error(
          `Failed to load letter data for ${currentLetter}:`,
          error
        );
        return { width: 50, height: 50 };
      } finally {
        globalLoadingPromises.delete(cacheKey);
      }
    })();

    globalLoadingPromises.set(cacheKey, loadPromise);
    letterDimensions = await loadPromise;

    // Update local state with cached URL
    if (globalSvgDataUrlCache.has(cacheKey)) {
      localSvgDataUrl = globalSvgDataUrlCache.get(cacheKey)!;
    }
  }

  // Load data when letter changes - reset local cache first
  $effect(() => {
    if (letter) {
      // Reset local URL when letter changes to avoid showing wrong letter briefly
      localSvgDataUrl = globalSvgDataUrlCache.get(letter) ?? null;
      // Then load if not already cached
      if (!localSvgDataUrl) {
        loadLetterData(letter as Letter);
      } else {
        // Also update dimensions from cache
        if (globalDimensionsCache.has(letter)) {
          letterDimensions = globalDimensionsCache.get(letter)!;
        }
      }
    }
  });

  // Derived state - check if we have a valid letter
  const hasLetter = $derived.by(() => {
    return letter != null && letter.trim() !== "";
  });

  // Check if letter dimensions are loaded
  const dimensionsLoaded = $derived.by(
    () => effectiveDimensions.width > 0 && effectiveDimensions.height > 0
  );

  // Check if this letter needs a separate dash rendered
  const showDash = $derived(isDashLetter(letter));

</script>

<!-- TKA Glyph Group - only render when dimensions are loaded AND when visible
     NOTE: We check visibility here (not just CSS) because when exporting to SVG/image,
     CSS classes don't carry over - only the raw SVG markup is captured.
     Preview mode allows rendering at reduced opacity even when not visible.
     CRITICAL: When darkMode is explicitly set (for export), we apply inline style
     because CSS filter won't be captured in outerHTML. -->
{#if hasLetter && dimensionsLoaded && (visible || previewMode || animateVisibility)}
  <g
    class="tka-glyph"
    class:visible={visible && imageReady}
    class:preview-mode={previewMode}
    class:interactive={onToggle !== undefined}
    data-letter={letter}
    transform="translate({x}, {y}) scale({scale})"
    onclick={onToggle}
    {...onToggle
      ? {
          role: "button",
          tabindex: 0,
          "aria-label": "Toggle TKA letter visibility",
        }
      : {}}
  >
      <!-- Main letter with exact legacy dimensions.
           Dark mode swaps `imageSrc` to a white-recolored data URL (see
           recolorSvgToWhite) rather than applying an SVG/CSS filter — iOS WebKit
           (bug 184601) defers filter rasterization on a <g> with an <image>, so
           a filtered glyph rendered black when static and only inverted while
           animating. A recolored source is white in every state and serializes
           correctly for export. -->
      <image
        x="0"
        y="0"
        href={imageSrc}
        width={effectiveDimensions.width}
        height={effectiveDimensions.height}
        preserveAspectRatio="xMinYMin meet"
        class="letter-image"
      />

      <!-- Dash for Type3/Type5 letters (rendered separately for dot centering).
           Recolored to off-white in dark mode to match the source-recolored
           letter (no filter on the parent group anymore). -->
      {#if showDash}
        <Dash
          letterWidth={effectiveDimensions.width}
          letterHeight={effectiveDimensions.height}
          {visible}
          {previewMode}
          {animateVisibility}
          darkMode={effectiveDarkMode}
        />
      {/if}
  </g>
{/if}

<style>
  .tka-glyph {
    /* Glyphs are rendered on top layer above arrows */
    z-index: 4;
    /* Beautiful fade in/out effect */
    opacity: 0;
    transition: opacity var(--duration-fast) ease-out;
  }

  .tka-glyph.visible {
    opacity: 1;
  }

  /* Preview mode: show "off" state at 40% opacity instead of hidden */
  .tka-glyph.preview-mode:not(.visible) {
    opacity: 0.4;
  }

  .tka-glyph.interactive {
    cursor: pointer;
    pointer-events: auto;
  }

  /* When visible, maintain full opacity even on hover */
  .tka-glyph.visible.interactive:hover {
    opacity: 0.9;
  }

  /* When not visible in preview mode, dim on hover */
  .tka-glyph.preview-mode:not(.visible).interactive:hover {
    opacity: 0.5;
  }

  .letter-image {
    /* Smooth image rendering */
    image-rendering: optimizeQuality;
  }

  /* Dark mode recoloring is done at the SOURCE: `imageSrc` points at a
     white-recolored data URL of the letter SVG (see recolorSvgToWhite in the
     module script). No SVG/CSS filter is applied to the rendered glyph, which
     sidesteps iOS WebKit bug 184601 (deferred filter rasterization on a <g>
     containing an <image> — the glyph stayed black when static, only inverting
     while animating). A recolored source is white in every state. */
</style>
