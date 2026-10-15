<script lang="ts">
  /**
   * One of Gage's patterns playing on a loop in a reserved square. The square
   * holds its size before the browser-only player mounts, so nothing moves.
   * Under reduced motion the player shows the start pose and waits for play.
   */
  import { onMount } from "svelte";
  import InlineAnimationPlayer from "#lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { stripToSequence } from "../../level-1/_data/guide-sequence-adapter";
  import {
    threeLevelsStrip,
    type EightStepRecord,
  } from "#lib/shared/guide-topics/three-levels-topic.js";

  let {
    record,
    label,
    onStepChange,
    onSeekRef,
  }: {
    record: EightStepRecord;
    /** The canvas's accessible name. */
    label: string;
    onStepChange?: (step: number) => void;
    onSeekRef?: (seek: ((step: number) => void) | null) => void;
  } = $props();

  const sequence = $derived(
    stripToSequence(threeLevelsStrip(record), {
      word: record.word,
      name: record.metadata.cell,
    })
  );

  let mounted = $state(false);
  let reducedMotion = $state(false);
  onMount(() => {
    reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    mounted = true;
  });
</script>

<div class="pattern-player" role="group" aria-label={label}>
  {#if mounted}
    <InlineAnimationPlayer
      {sequence}
      chrome="minimal"
      fill={true}
      autoPlay={!reducedMotion}
      externalBpm={60}
      leftPropType={PropType.STAFF}
      rightPropType={PropType.STAFF}
      scrubbable
      beatIndicators={false}
      onStepChange={(step) => onStepChange?.(step)}
      {onSeekRef}
    />
  {/if}
</div>

<style>
  .pattern-player {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    border-radius: 12px;
    overflow: hidden;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
  }
</style>
