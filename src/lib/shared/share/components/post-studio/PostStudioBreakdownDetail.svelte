<script lang="ts">
  import type { EvaluatedFrameLayer } from "$lib/shared/media-composition/services/frame-evaluator";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { SequenceExportOptions } from "$lib/shared/render/domain/models/sequence-export-options";
  import { getMediaCompositionContext } from "$lib/shared/media-composition/state/media-composition-context";
  import PostStudioPaintedLayer from "./PostStudioPaintedLayer.svelte";
  import PostStudioSequenceAnimationLayer from "./PostStudioSequenceAnimationLayer.svelte";
  import PostStudioBreakdownMandala from "./PostStudioBreakdownMandala.svelte";

  let {
    sequence,
    cardRenderOptions = null,
  }: {
    sequence: SequenceData;
    cardRenderOptions?: Partial<SequenceExportOptions> | null;
  } = $props();

  const composition = getMediaCompositionContext();

  const animationLayers = $derived(
    composition.frameLayers.filter(
      (layer) => layer.regionId === "strip-animation"
    )
  );
  const carouselLayers = $derived(
    composition.frameLayers.filter(
      (layer) => layer.regionId === "strip-carousel"
    )
  );

  function readyPainter(layer: EvaluatedFrameLayer) {
    const binding = composition.bindingForRole(layer.sourceRole);
    return binding?.status === "ready" && binding.renderMode === "painted"
      ? binding.painter
      : null;
  }

  function readyAnimation(layer: EvaluatedFrameLayer): boolean {
    const binding = composition.bindingForRole(layer.sourceRole);
    return (
      binding?.status === "ready" &&
      binding.renderMode === "sequence-animation" &&
      layer.sequencePosition !== undefined
    );
  }
</script>

<section class="breakdown-detail" aria-label="Breakdown strip detail">
  {#if animationLayers.length === 0 && carouselLayers.length === 0}
    <p class="empty-state">Scrub into the breakdown to inspect the strip.</p>
  {:else}
    <div class="detail-card">
      <span class="card-label">Animation</span>
      <div class="artwork animation-artwork" aria-hidden="true">
        {#each animationLayers as layer (layer.clipId)}
          {#if readyAnimation(layer) && layer.sequencePosition !== undefined}
            {#if (layer.sequencePassIndex ?? 0) % 2 === 1}
              <PostStudioBreakdownMandala
                {sequence}
                sequencePosition={layer.sequencePosition}
                leftPropType={cardRenderOptions?.leftPropTypeOverride ??
                  cardRenderOptions?.propTypeOverride}
                rightPropType={cardRenderOptions?.rightPropTypeOverride ??
                  cardRenderOptions?.propTypeOverride}
              />
            {:else}
              <PostStudioSequenceAnimationLayer
                breakdownMotion
                {sequence}
                sequencePosition={layer.sequencePosition}
                sequencePassIndex={layer.sequencePassIndex ?? 0}
                animationTimeSeconds={layer.animationTimeSeconds}
                playing={composition.isPlaying}
                leftPropType={cardRenderOptions?.leftPropTypeOverride ??
                  cardRenderOptions?.propTypeOverride}
                rightPropType={cardRenderOptions?.rightPropTypeOverride ??
                  cardRenderOptions?.propTypeOverride}
              />
            {/if}
          {/if}
        {/each}
      </div>
    </div>
    <div class="detail-card">
      <span class="card-label">Beat carousel</span>
      <div class="artwork carousel-artwork" aria-hidden="true">
        {#each carouselLayers as layer (layer.clipId)}
          {@const painter = readyPainter(layer)}
          {#if painter}
            <PostStudioPaintedLayer
              {painter}
              opacity={layer.opacity}
              frame={{
                sequencePosition: layer.sequencePosition,
                carouselPosition: layer.carouselPosition,
                displayedBeatNumber: layer.displayedBeatNumber,
                projectProgress: layer.projectProgress,
                sourceTimeSeconds: layer.sourceTimeSeconds,
              }}
            />
          {/if}
        {/each}
      </div>
    </div>
  {/if}
</section>

<style>
  .breakdown-detail {
    display: grid;
    grid-template-rows: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .detail-card {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    justify-items: center;
    gap: 0.35rem;
    min-width: 0;
    min-height: 0;
    padding: 0.625rem;
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.75rem;
    background: var(--theme-card-bg);
  }

  .card-label {
    justify-self: start;
    color: var(--theme-text-secondary);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
    line-height: 1.2;
  }

  .artwork {
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border-radius: 0.375rem;
    background: #08080c;
  }

  .animation-artwork {
    width: auto;
    max-width: 100%;
    aspect-ratio: 1;
  }

  .artwork :global(.painted-layer) {
    position: absolute;
    inset: 0;
  }

  .empty-state {
    grid-row: 1 / -1;
    align-self: center;
    margin: 0;
    padding: 1rem;
    color: var(--theme-text-secondary);
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1.4;
    text-align: center;
  }
</style>
