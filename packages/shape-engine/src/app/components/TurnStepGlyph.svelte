<!-- How much of a turn one step adds at a level, drawn as an arc on a circle:
     no arc (Level 1, no turns), a whole circle (2), half of one (3), a quarter
     (4). It reads without words, which matters most to a visitor whose
     language the level names reach only partly. The arc takes the colour of
     its host (currentColor), so LevelSelector paints it in the level's own. -->
<script lang="ts">
  import type { TurnLevel } from "#lib/shared/create/services/level-turn-values.js";

  interface Props {
    level: TurnLevel;
  }
  let { level }: Props = $props();
</script>

<svg viewBox="0 0 44 44" width="100%" height="100%" aria-hidden="true">
  {#if level === 1}
    <circle class="track" cx="22" cy="22" r="14" stroke-dasharray="3 4" />
    <circle cx="22" cy="8" r="3.5" fill="currentColor" />
  {:else}
    <circle class="track" cx="22" cy="22" r="14" />
    {#if level === 2}
      <path class="arc" d="M29 9.88 A14 14 0 1 1 22 8" />
      <path class="arc" d="M17.1 4.6 L22 8 L17.1 11.4" />
    {:else if level === 3}
      <path class="arc" d="M22 8 A14 14 0 0 1 22 36" />
      <path class="arc" d="M26.9 32.6 L22 36 L26.9 39.4" />
    {:else}
      <path class="arc" d="M22 8 A14 14 0 0 1 36 22" />
      <path class="arc" d="M32.6 17.1 L36 22 L39.4 17.1" />
    {/if}
  {/if}
</svg>

<style>
  svg {
    display: block;
    overflow: visible;
  }

  .track {
    fill: none;
    stroke: currentColor;
    stroke-opacity: 0.28;
    stroke-width: 2;
  }

  .arc {
    fill: none;
    stroke: currentColor;
    stroke-width: 3.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
