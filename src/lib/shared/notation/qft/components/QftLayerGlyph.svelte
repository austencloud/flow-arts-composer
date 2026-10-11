<script lang="ts">
  /**
   * A 20px mark of what one layer actually draws.
   *
   * The layer switches were six word chips in a row that scrolled sideways, so
   * turning a layer off meant reading a label, guessing which mark it named, and
   * scrolling to find the rest. Each switch now carries a miniature of its own
   * mark, drawn from the same shapes QftFigure draws at full size — so the
   * control looks like the thing it controls.
   */
  import type { QftLayers } from "#lib/shared/notation/qft/qft-layers.js";

  interface Props {
    layer: keyof QftLayers;
  }

  let { layer }: Props = $props();
</script>

<svg class="glyph" viewBox="-12 -12 24 24" aria-hidden="true">
  {#if layer === "handCompass"}
    <!-- The outer ring and its numbered points: a dashed circle with beads. -->
    <circle class="hairline dashed" r="8" />
    {#each [0, 1, 2, 3, 4, 5, 6, 7] as k (k)}
      <circle
        class="bead"
        cx={8 * Math.sin((k * Math.PI) / 4)}
        cy={-8 * Math.cos((k * Math.PI) / 4)}
        r="2"
      />
    {/each}
  {:else if layer === "handPath"}
    <!-- The circle the hand traces, and the arm out to it. -->
    <circle class="lit" r="6.5" />
    <line class="lit" x1="0" y1="0" x2="0" y2="-6.5" />
    <circle class="fill" cy="-6.5" r="2" />
  {:else if layer === "propCompass"}
    <!-- The prop's own compass, riding the hand rather than the centre. -->
    <circle class="hairline dashed" cx="-2" cy="2" r="7.5" />
    <circle class="fill" cx="-2" cy="2" r="1.6" />
    <circle class="fill" cx="3" cy="-3.6" r="2.4" />
  {:else if layer === "dart"}
    <!-- The direction dart. -->
    <line class="lit" x1="-7" y1="6" x2="5" y2="-6" />
    <path class="fill" d="M5 -6 L9 -8 L7 -2 Z" />
  {:else if layer === "sector"}
    <!-- The wedge swept across the current increment. -->
    <path class="fill wash" d="M0 0 L0 -9 A9 9 0 0 1 6.4 -6.4 Z" />
    <path class="hairline" d="M0 0 L0 -9 M0 0 L6.4 -6.4" />
  {:else}
    <!-- The traced shape, fading behind the head. -->
    <path
      class="lit"
      d="M-9 5 C-5 -9 4 -9 8 -4"
      stroke-linecap="round"
      pathLength="1"
      stroke-dasharray="0.62 0.38"
    />
    <circle class="fill" cx="8" cy="-4" r="2.4" />
  {/if}
</svg>

<style>
  .glyph {
    display: block;
    width: 1.15rem;
    height: 1.15rem;
    flex: none;
    overflow: visible;
  }

  /*
   * currentColor throughout, so a glyph inherits the chip's own on/off state
   * rather than carrying a second colour that could disagree with it.
   */
  circle,
  line,
  path {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
    vector-effect: non-scaling-stroke;
  }

  .hairline {
    opacity: 0.55;
  }

  .dashed {
    stroke-dasharray: 2 2.6;
  }

  .bead {
    fill: currentColor;
    stroke: none;
    opacity: 0.7;
  }

  .fill {
    fill: currentColor;
    stroke: none;
  }

  .wash {
    fill: currentColor;
    stroke: none;
    opacity: 0.28;
  }
</style>
