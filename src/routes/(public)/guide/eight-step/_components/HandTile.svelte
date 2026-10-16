<!--
  HandTile - one looping canvas with a caption under it, showing both hands
  or one hand alone. The hidden hand rides in the same sequence: the viewer's
  motion-visibility context (the one the sequence viewer's Blue/Red toggle
  sets) tells the canvas to skip its prop and trail, so a solo tile stays in
  step with the both-hands tile beside it. Only a tile that asks for it shows
  the step number, so a row of tiles carries one counter between them.
-->
<script lang="ts">
  import { browser } from "$app/env";
  import InlineAnimationPlayer from "#lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte";
  import { setViewerVisibilityContext } from "#lib/shared/sequence-viewer/context/viewer-visibility-context.js";
  import { SequenceViewerVisibilityState } from "#lib/shared/sequence-viewer/state/viewer-visibility-state.svelte.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { TrailSettings } from "#lib/shared/animation-engine/domain/types/trail-types.js";

  let {
    sequence,
    hand,
    caption,
    trail,
    stepNumbers = false,
  }: {
    sequence: SequenceData;
    hand: "both" | "left" | "right";
    caption: string;
    trail: TrailSettings;
    stepNumbers?: boolean;
  } = $props();

  // Set once: a tile never changes which hand it shows.
  const visibility = new SequenceViewerVisibilityState();
  // svelte-ignore state_referenced_locally
  if (hand === "left") visibility.setRightMotion(false);
  // svelte-ignore state_referenced_locally
  if (hand === "right") visibility.setLeftMotion(false);
  setViewerVisibilityContext(visibility);
</script>

<figure class="hand-tile">
  <div class="canvas-box">
    {#if browser}
      <InlineAnimationPlayer
        {sequence}
        chrome="minimal"
        fill={true}
        autoPlay
        externalBpm={60}
        leftPropType={PropType.HAND}
        rightPropType={PropType.HAND}
        beatIndicators={false}
        trailSettingsOverride={trail}
        hideTkaGlyph
        hideStepNumbers={!stepNumbers}
      />
    {/if}
  </div>
  <figcaption>
    {#if hand !== "right"}<span class="dot left" aria-hidden="true"></span>{/if}
    {#if hand !== "left"}<span class="dot right" aria-hidden="true"></span>{/if}
    {caption}
  </figcaption>
</figure>

<style>
  .hand-tile {
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
    min-width: 0;
  }
  .canvas-box {
    width: 100%;
    aspect-ratio: 1;
    border-radius: 14px;
    overflow: hidden;
    background: color-mix(in oklab, var(--theme-text) 6%, transparent);
    border: 1.5px solid color-mix(in oklab, var(--theme-text) 12%, transparent);
  }
  .canvas-box :global(.inline-animation-player) {
    width: 100%;
    height: 100%;
  }
  figcaption {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-weight: 600;
    text-align: center;
    color: var(--theme-text);
  }
  .dot {
    flex: none;
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
  }
  .dot.left {
    background: var(--dm-motion-blue, #3575e2);
  }
  .dot.right {
    background: var(--dm-motion-red, #ed1c24);
  }
</style>
