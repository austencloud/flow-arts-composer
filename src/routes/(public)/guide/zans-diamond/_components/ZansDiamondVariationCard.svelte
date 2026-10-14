<!--
  One playable Zan's Diamond variation: the inline player on top, its word
  and caption below. The player only mounts while the card is near the
  viewport, so a page of 24 cards never runs 24 canvases at once; a card that
  scrolls far away gives its canvas back and shows the word alone. The page
  loads this component on the client after it has drawn (the player is canvas
  code the prerender has no use for).
-->
<script lang="ts">
  import { onMount } from "svelte";
  import InlineAnimationPlayer from "#lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte";
  import { stripToSequence } from "../../level-1/_data/guide-sequence-adapter";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { reducedMotion } from "#lib/shared/transitions/motion.js";
  import {
    zansDiamondStrip,
    type ZansDiamondVariation,
  } from "#lib/shared/guide-topics/zans-diamond-topic.js";

  interface Props {
    variation: ZansDiamondVariation;
    caption: string;
  }

  let { variation, caption }: Props = $props();

  const sequence = $derived(
    stripToSequence(zansDiamondStrip(variation), {
      word: variation.word,
      name: variation.word,
    })
  );

  let host: HTMLElement;
  let near = $state(false);

  onMount(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        near = entry?.isIntersecting ?? false;
      },
      { rootMargin: "25% 0px" }
    );
    observer.observe(host);
    return () => observer.disconnect();
  });
</script>

<figure class="variation-card" bind:this={host}>
  <div class="stage">
    {#if near}
      <InlineAnimationPlayer
        {sequence}
        displayWord={variation.word}
        autoPlay={!reducedMotion()}
        chrome="minimal"
        fill={true}
        externalBpm={72}
        leftPropType={PropType.HAND}
        rightPropType={PropType.HAND}
      />
    {/if}
  </div>
  <figcaption>
    <span class="word">{variation.word}</span>
    <span class="caption">{caption}</span>
  </figcaption>
</figure>

<style>
  .variation-card {
    display: grid;
    gap: var(--spacing-xs, 4px);
    margin: 0;
    min-width: 0;
  }
  .stage {
    position: relative;
    aspect-ratio: 1;
    border-radius: var(--radius-md, 12px);
    overflow: hidden;
    background: var(--theme-surface, rgba(255, 255, 255, 0.04));
  }
  figcaption {
    display: grid;
    gap: 2px;
    padding-inline: 2px;
  }
  .word {
    font-weight: 650;
    font-size: 15px;
    line-height: 1.3;
    color: var(--theme-text);
    overflow-wrap: anywhere;
  }
  .caption {
    font-size: 13px;
    line-height: 1.4;
    color: var(--theme-text-muted);
  }
</style>
