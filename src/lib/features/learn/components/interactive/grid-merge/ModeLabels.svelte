<!--
  ModeLabels - "Diamond" and "Box" mode titles with subtitles
  Visible in split phases, positioned above each grid
  Uses CSS custom properties from parent for responsive positioning
-->
<script lang="ts">
  import { GRID, type Phase } from "./grid-merge-constants";

  let { phase } = $props<{ phase: Phase }>();

  const isSplit = $derived(
    phase === "split" ||
      phase === "diamond-labels" ||
      phase === "box-labels" ||
      phase === "split-highlight"
  );

  const showDiamondSubtitle = $derived(phase === "diamond-labels");
  const showBoxSubtitle = $derived(phase === "box-labels");
  const dimDiamond = $derived(phase === "box-labels");
  const dimBox = $derived(phase === "diamond-labels");

  const CENTER = GRID.CENTER;
</script>

<g class="mode-labels" class:visible={isSplit}>
  <!-- Diamond mode (left/top side) - uses transform for positioning -->
  <g class="diamond-group">
    <text
      class="mode-label diamond-label"
      class:dimmed={dimDiamond}
      x={CENTER}
      y={110}
      text-anchor="middle"
      dominant-baseline="middle"
    >
      Diamond
    </text>
    <text
      class="mode-subtitle diamond-subtitle"
      class:visible={showDiamondSubtitle}
      x={CENTER}
      y={155}
      text-anchor="middle"
      dominant-baseline="middle"
    >
      Cardinal directions
    </text>
  </g>

  <!-- Box mode (right/bottom side) - uses transform for positioning -->
  <g class="box-group">
    <text
      class="mode-label box-label"
      class:dimmed={dimBox}
      x={CENTER}
      y={110}
      text-anchor="middle"
      dominant-baseline="middle"
    >
      Box
    </text>
    <text
      class="mode-subtitle box-subtitle"
      class:visible={showBoxSubtitle}
      x={CENTER}
      y={155}
      text-anchor="middle"
      dominant-baseline="middle"
    >
      Intercardinal directions
    </text>
  </g>
</g>

<style>
  .mode-labels {
    opacity: 0;
    transition: opacity var(--merge-duration) var(--ease-standard-out);
  }

  .mode-labels.visible {
    opacity: 1;
  }

  /* Position groups using inherited CSS custom properties */
  .diamond-group {
    transform: translate(
      var(--split-offset-x-neg, -260px),
      var(--split-offset-y-neg, 0)
    );
  }

  .box-group {
    transform: translate(
      var(--split-offset-x, 260px),
      var(--split-offset-y, 0)
    );
  }

  .mode-label {
    font-size: 36px;
    font-weight: 700;
    fill: var(--theme-accent, #22d3ee);
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
    transition: opacity var(--merge-duration) var(--ease-standard-out);
  }

  .mode-label.dimmed {
    opacity: 0.4;
  }

  .mode-subtitle {
    font-size: 22px;
    font-weight: 500;
    fill: var(--theme-text-dim, #9ca3af);
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
    opacity: 0;
    transition: opacity var(--merge-duration) var(--ease-standard-out);
  }

  .mode-subtitle.visible {
    opacity: 1;
  }

  /* === RESPONSIVE: Font sizes only, positioning handled by CSS vars === */
  @media (max-width: 700px) {
    .mode-label {
      font-size: 28px;
    }

    .mode-subtitle {
      font-size: 18px;
    }
  }

  @media (max-width: 500px) {
    .mode-label {
      font-size: 24px;
    }

    .mode-subtitle {
      font-size: 16px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mode-labels,
    .mode-label,
    .mode-subtitle {
      transition: none;
    }
  }
</style>
