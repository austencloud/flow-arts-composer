<!-- Braces around the TKA letter of a skewed-frame beat (one hand on a
     cardinal point, the other on an intercardinal point). The word writes the
     span as "{STS}"; the pictograph shows the same mark per beat. Same
     positioning frame as TKAGlyph (translate 50,800), same visibility rules,
     and the colour is carried on the element so exports keep it. -->
<script lang="ts">
  import { getSkewBraceLayout } from "../utils/skew-brace-layout";
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
  const fill = $derived(effectiveDarkMode ? FILL_DARK : FILL_LIGHT);
</script>

{#if visible || previewMode || animateVisibility}
  <g
    class="skew-braces"
    class:visible
    class:preview-mode={previewMode}
    data-skew-braces="true"
    transform="translate({x}, {y}) scale({scale})"
    font-family="system-ui, -apple-system, 'Segoe UI', sans-serif"
    font-size={layout.fontSize}
    font-weight="500"
    {fill}
  >
    <text x={layout.openX} y={layout.y} text-anchor="end" dominant-baseline="central">&#123;</text>
    <text x={layout.closeX} y={layout.y} text-anchor="start" dominant-baseline="central">&#125;</text>
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
