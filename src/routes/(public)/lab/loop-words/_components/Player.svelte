<!--
  One real animator, driven by the page clock (externalStep), with its caption
  under it. Both players read the same clock, so they move together. Until the
  browser has the player, the square holds its place.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { browser } from "$app/env";
  import HandMotionPlayer from "#lib/features/learn/components/interactive/foundations/HandMotionPlayer.svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { DEFAULT_VIEWER_CUSTOM_COLORS } from "#lib/shared/sequence-viewer/domain/viewer-custom-colors.js";
  import type { ReflectionLine } from "../_data/loop-kinds";

  // Ends of each reflection line across the square, north at the top.
  const LINE_ENDS: Record<ReflectionLine, [number, number, number, number]> = {
    "north-south": [50, 4, 50, 96],
    "east-west": [4, 50, 96, 50],
    "northeast-southwest": [17, 83, 83, 17],
    "northwest-southeast": [17, 17, 83, 83],
  };

  let {
    sequence,
    step,
    moving,
    label,
    caption,
    line,
    transitionKey = null,
  }: {
    sequence: SequenceData | null;
    step: number;
    moving: boolean;
    label: string;
    caption?: Snippet;
    /** A reflection line drawn over the player. */
    line?: ReflectionLine;
    /** Same key across a sequence change: the props glide to the new pose. */
    transitionKey?: string | null;
  } = $props();
</script>

<figure class="player">
  <div class="square">
    {#if browser && sequence}
      <HandMotionPlayer
        {sequence}
        ariaLabel={label}
        propDisplay="staff"
        primaryPropColors={DEFAULT_VIEWER_CUSTOM_COLORS}
        interactive={false}
        externalStep={step}
        externalPlaying={moving}
        {transitionKey}
      />
    {/if}
    {#if line}
      {@const [x1, y1, x2, y2] = LINE_ENDS[line]}
      <svg class="line" viewBox="0 0 100 100" aria-hidden="true">
        <line {x1} {y1} {x2} {y2} />
      </svg>
    {/if}
  </div>
  {#if caption}
    <figcaption>{@render caption()}</figcaption>
  {/if}
</figure>

<style>
  .player {
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
    min-height: 0;
  }

  .square {
    position: relative;
    width: var(--side, 100%);
    aspect-ratio: 1;
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.14));
    border-radius: var(--radius-lg, 0.75rem);
    background: var(--theme-card-bg, rgb(255 255 255 / 0.04));
    overflow: hidden;
  }

  /* The player draws its own frame; the square already has one. */
  .square :global(.motion-player.framed) {
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .line {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .line line {
    stroke: var(--line-color, rgb(255 255 255 / 0.75));
    stroke-width: 0.8;
    stroke-dasharray: 3 2;
    stroke-linecap: round;
  }

  figcaption {
    font-size: var(--font-size-sm);
    line-height: 1.2;
    color: var(--theme-text-dim, rgb(255 255 255 / 0.72));
    text-align: center;
    white-space: nowrap;
  }
</style>
