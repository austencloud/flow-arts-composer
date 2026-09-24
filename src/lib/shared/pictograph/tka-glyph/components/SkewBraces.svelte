<!-- Braces around the TKA letter of a skewed-frame beat (one hand on a
     cardinal point, the other on an intercardinal point). The word writes the
     span as "{STS}"; the pictograph shows the same mark per beat. Same
     positioning frame as TKAGlyph (translate 50,800), same visibility rules,
     and the colour is carried on the element so exports keep it. Each glyph
     is placed by its measured ink on the alphabetic baseline: a "central"
     baseline centres the font's box, which left the brace ink 0.15em low. -->
<script lang="ts">
  import {
    getSkewBraceInk,
    getSkewBraceLayout,
    placeSkewBraceGlyphs,
    SKEW_BRACE_FONT_FAMILY,
    SKEW_BRACE_FONT_WEIGHT,
  } from "../utils/skew-brace-layout";
  import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";

  const FILL_LIGHT = "#231f20";
  const FILL_DARK = "#d9d9d9";

  interface Props {
    letter: string;
    letterDimensions: { width: number; height: number };
    /** Extra width to clear on the closing side - see getTurnsColumnRightExtent. */
    rightExtent?: number;
    x?: number;
    y?: number;
    scale?: number;
    visible?: boolean;
    previewMode?: boolean;
    animateVisibility?: boolean;
    darkMode?: boolean;
  }

  let {
    letter,
    letterDimensions,
    rightExtent = 0,
    x = 50,
    y = 800,
    scale = 1,
    visible = true,
    previewMode = false,
    animateVisibility = false,
    darkMode = undefined,
  }: Props = $props();

  // Same centralized visibility-manager pattern as DirectionDot/TKAGlyph: an
  // undefined darkMode prop falls back to the live app theme instead of
  // silently resolving to the light fill on a dark background.
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

  const layout = $derived(
    getSkewBraceLayout(letter, letterDimensions, { rightExtent })
  );
  const glyphs = $derived(placeSkewBraceGlyphs(layout, getSkewBraceInk()));
  const fill = $derived(effectiveDarkMode ? FILL_DARK : FILL_LIGHT);
</script>

{#if visible || previewMode || animateVisibility}
  <g
    class="skew-braces"
    class:visible
    class:preview-mode={previewMode}
    data-skew-braces="true"
    transform="translate({x}, {y}) scale({scale})"
    font-family={SKEW_BRACE_FONT_FAMILY}
    font-size={layout.fontSize}
    font-weight={SKEW_BRACE_FONT_WEIGHT}
    {fill}
  >
    <text x={glyphs.open.x} y={glyphs.open.y} text-anchor="start" dominant-baseline="alphabetic">&#123;</text>
    <text x={glyphs.close.x} y={glyphs.close.y} text-anchor="start" dominant-baseline="alphabetic">&#125;</text>
  </g>
{/if}

<style>
  .skew-braces {
    opacity: 0;
    transition: opacity var(--duration-fast) ease-out;
    pointer-events: none;
  }

  .skew-braces.visible {
    opacity: 1;
  }

  .skew-braces.preview-mode:not(.visible) {
    opacity: 0.4;
  }
</style>
