<!-- Braces around the TKA letter of a skewed-frame beat (one hand on a
     cardinal point, the other on an intercardinal point). The word writes the
     span as "{STS}"; the pictograph shows the same mark per beat. Same
     positioning frame as TKAGlyph (translate 50,800), same visibility rules,
     and the colour is carried on the element so exports keep it. -->
<script lang="ts">
  import { getSkewBraceLayout } from "../utils/skew-brace-layout";

  const FILL_LIGHT = "#231f20";
  const FILL_DARK = "#d9d9d9";

  interface Props {
    letter: string;
    letterDimensions: { width: number; height: number };
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
    x = 50,
    y = 800,
    scale = 1,
    visible = true,
    previewMode = false,
    animateVisibility = false,
    darkMode = false,
  }: Props = $props();

  const layout = $derived(getSkewBraceLayout(letter, letterDimensions));
  const fill = $derived(darkMode ? FILL_DARK : FILL_LIGHT);
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
