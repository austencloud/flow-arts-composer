<script lang="ts">
  import type { EvaluatedFrameLayer } from "$lib/shared/media-composition/services/frame-evaluator";
  import { getMediaCompositionContext } from "$lib/shared/media-composition/state/media-composition-context";
  import PostStudioMediaLayer from "./PostStudioMediaLayer.svelte";
  import PostStudioPaintedLayer from "./PostStudioPaintedLayer.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { SequenceExportOptions } from "$lib/shared/render/domain/models/sequence-export-options";
  import type { PostStudioSlotId } from "$lib/shared/media-composition/domain/post-studio-slots";
  import { sourceIcon } from "./post-studio-source-menu";
  import type { HandLabeling } from "$lib/shared/video-collaboration/domain/hand-labeling";

  let {
    sequence,
    cardRenderOptions,
    handLabeling = null,
    qrSequence,
    durationLabel,
    onRootReady,
    onEditRegion,
  }: {
    sequence: SequenceData;
    cardRenderOptions?: Partial<SequenceExportOptions> | null;
    handLabeling?: HandLabeling | null;
    qrSequence?: SequenceData;
    /** Output length, shown beside the format so the canvas needs no header. */
    durationLabel?: string;
    onRootReady?: (root: HTMLElement | null) => void;
    onEditRegion?: () => void;
  } = $props();

  let outputFrame = $state<HTMLElement | null>(null);

  $effect(() => {
    onRootReady?.(outputFrame);
    return () => onRootReady?.(null);
  });

  const composition = getMediaCompositionContext();

  const orderedRegions = $derived(
    [...composition.regions].sort((left, right) => left.zIndex - right.zIndex)
  );

  function regionStyle(region: (typeof orderedRegions)[number]): string {
    const rect = composition.regionRects.get(region.id) ?? region;
    return [
      `left:${rect.x * 100}%`,
      `top:${rect.y * 100}%`,
      `width:${rect.width * 100}%`,
      `height:${rect.height * 100}%`,
      `z-index:${region.zIndex + 1}`,
    ].join(";");
  }

  function selectRegion(regionId: string, roleKey: string | null): void {
    composition.selectRegion(regionId, roleKey);
    if (!roleKey) return;
    const binding = composition.bindingForRole(roleKey);
    if (binding?.status === "missing") composition.requestSource(roleKey);
  }

  /**
   * A slot fills its half of the frame and its content is centred there. That
   * is the right answer essentially always, so dragging a source off-centre
   * was an affordance that mostly created accidents: the whole gesture, and
   * the offsets it wrote, are gone. Clicking a slot selects it and opens its
   * settings, which is the only thing the surface was really for.
   */
  function handleRegionClick(regionId: string, roleKey: string | null): void {
    selectRegion(regionId, roleKey);
    const binding = roleKey ? composition.bindingForRole(roleKey) : null;
    if (binding?.status !== "missing") onEditRegion?.();
  }

  function layersForRegion(regionId: string): EvaluatedFrameLayer[] {
    return composition.frameLayers.filter(
      (layer) => layer.regionId === regionId
    );
  }

  function roleForLayers(
    regionId: string,
    layers: EvaluatedFrameLayer[]
  ): string | null {
    return (
      layers.reduce<EvaluatedFrameLayer | null>(
        (strongest, layer) =>
          !strongest || layer.opacity >= strongest.opacity ? layer : strongest,
        null
      )?.sourceRole ?? composition.roleForRegion(regionId)
    );
  }

  function hasReadyLayer(layers: EvaluatedFrameLayer[]): boolean {
    return layers.some((layer) => {
      const binding = composition.bindingForRole(layer.sourceRole);
      // Same rule the layer itself renders by: everything except
      // `external-media` draws from the sequence and needs no file. Listing the
      // modes by name here meant every new source type shipped with its own
      // slot both drawing the media AND telling the user it was missing.
      return (
        binding?.status === "ready" &&
        (Boolean(binding.previewUrl) || binding.renderMode !== "external-media")
      );
    });
  }

  function isSlot(regionId: string): regionId is PostStudioSlotId {
    return regionId === "top" || regionId === "bottom";
  }

  /**
   * Delete on a selected slot is what Austen went looking for and did not find.
   * It lives on the region surface rather than the document so it cannot fire
   * while a text field elsewhere in the studio has focus.
   */
  function handleRegionKeydown(event: KeyboardEvent, regionId: string): void {
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    if (!isSlot(regionId) || composition.regions.length < 2) return;
    event.preventDefault();
    composition.clearSlot(regionId);
  }
</script>

<div class="preview-shell">
  <div
    class="output-frame"
    aria-label="9 by 16 post preview"
    bind:this={outputFrame}
  >
    {#each orderedRegions as region (region.id)}
      {@const layers = layersForRegion(region.id)}
      {@const roleKey = roleForLayers(region.id, layers)}
      {@const binding = roleKey ? composition.bindingForRole(roleKey) : null}
      {@const hasVisibleSource = hasReadyLayer(layers)}
      <!-- Nothing is drawn on top of the artwork. The source pickers used to
           float here as chips over each slot; they cover the picture they
           describe, so they live in the composition bar above the frame. What
           remains inside the frame is the post. -->
      <div
        class="region"
        class:selected={composition.selectedRegion?.id === region.id}
        class:missing={!hasVisibleSource}
        style={regionStyle(region)}
      >
        <button
          type="button"
          class="region-surface"
          aria-pressed={composition.selectedRegion?.id === region.id}
          aria-label={`Edit ${region.label ?? "region"}${binding?.status === "missing" ? "; source missing" : ""}`}
          onkeydown={(event) => handleRegionKeydown(event, region.id)}
          onclick={() => handleRegionClick(region.id, roleKey)}
        >
          {#each layers as layer (layer.clipId)}
            {@const layerBinding = composition.bindingForRole(layer.sourceRole)}
            {#if layerBinding?.status === "ready" && (layerBinding.previewUrl || layerBinding.renderMode !== "external-media")}
              <span class="rendered-media" aria-hidden="true">
                {#if layerBinding.renderMode === "painted" && layerBinding.painter}
                  <PostStudioPaintedLayer
                    painter={layerBinding.painter}
                    opacity={layer.opacity}
                    frame={{
                      sequencePosition: layer.sequencePosition,
                      carouselPosition: layer.carouselPosition,
                      displayedBeatNumber: layer.displayedBeatNumber,
                      projectProgress: layer.projectProgress,
                      sourceTimeSeconds: layer.sourceTimeSeconds,
                    }}
                  />
                {:else}
                  <PostStudioMediaLayer
                    binding={layerBinding}
                    fit={region.fit}
                    opacity={layer.opacity}
                    sourceTimeSeconds={layer.sourceTimeSeconds}
                    playing={composition.isPlaying}
                    {sequence}
                    {cardRenderOptions}
                    {handLabeling}
                    {qrSequence}
                    sequencePosition={layer.sequencePosition}
                    displayedBeatNumber={layer.displayedBeatNumber}
                    clipId={layer.clipId}
                    transform={layer.transform}
                  />
                {/if}
              </span>
            {/if}
          {/each}
          {#if !hasVisibleSource}
            <span class="empty-source">
              <i
                class={binding?.status === "preparing"
                  ? "fa-solid fa-circle-notch fa-spin"
                  : sourceIcon(binding?.kind ?? "image")}
                aria-hidden="true"
              ></i>
              <strong>{binding?.label ?? region.label ?? "Source"}</strong>
              <span>
                {binding?.status === "preparing"
                  ? "Preparing preview"
                  : (binding?.missingMessage ?? "Click to choose a source")}
              </span>
            </span>
          {/if}
        </button>
      </div>
    {/each}

    {#if composition.safeZonesVisible}
      <!-- The shading is the whole message: warm where Instagram's own chrome
           will sit, clear where it will not. It was captioned "Keep key details
           here", which is what a dashed rectangle already says. -->
      <div class="instagram-chrome" aria-hidden="true">
        <div class="top-zone"></div>
        <div class="right-zone"></div>
        <div class="bottom-zone"></div>
        <div class="safe-frame"></div>
      </div>
    {/if}
  </div>

  <div class="preview-meta">
    <span class="format">
      <i class="fa-solid fa-mobile-screen" aria-hidden="true"></i>
      9:16{#if durationLabel}<span class="duration">
          · {durationLabel}</span
        >{/if}
    </span>
  </div>
</div>

<style>
  .preview-shell {
    --preview-width: min(100%, calc((100cqb - 2.75rem) * 0.5625), 44rem);
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 0.625rem;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .output-frame {
    position: relative;
    aspect-ratio: 9 / 16;
    width: var(--preview-width);
    height: auto;
    overflow: hidden;
    border: 1px solid
      color-mix(in srgb, var(--theme-stroke, #fff) 72%, transparent);
    border-radius: clamp(1rem, 2cqi, 1.75rem);
    background:
      radial-gradient(
        circle at 50% 12%,
        rgba(104, 81, 255, 0.13),
        transparent 38%
      ),
      #08080c;
    box-shadow:
      0 2rem 5rem rgba(0, 0, 0, 0.4),
      0 0 0 0.35rem rgba(255, 255, 255, 0.035);
    isolation: isolate;
  }

  .rendered-media {
    display: contents;
  }

  .region {
    position: absolute;
    overflow: hidden;
    min-width: 0;
    min-height: 0;
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: var(--theme-text, #fff);
    transition:
      border-color var(--duration-fast, 120ms) ease,
      box-shadow var(--duration-fast, 120ms) ease;
  }

  .region-surface {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: rgba(255, 255, 255, 0.025);
    color: inherit;
    cursor: pointer;
  }

  /* Selection marks the WHOLE slot — a ring, never a bar down one edge. The
     slot is the thing selected, so the whole thing says so. */
  .region:hover,
  .region.selected {
    border-color: color-mix(in srgb, var(--theme-accent, #8b7cff) 85%, white);
    box-shadow: inset 0 0 0 2px var(--theme-accent, #8b7cff);
  }

  .region-surface:focus-visible {
    outline: 3px solid var(--theme-accent, #8b7cff);
    outline-offset: -4px;
  }

  .empty-source {
    display: grid;
    justify-items: center;
    gap: 0.375rem;
    padding: 1rem;
    text-align: center;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.68));
  }

  .empty-source i {
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    font-size: 1rem;
  }

  .empty-source strong {
    color: var(--theme-text, #fff);
    font-size: max(var(--font-size-min, 0.875rem), 0.875rem);
  }

  .empty-source span {
    max-width: 13rem;
    font-size: max(var(--font-size-compact, 0.75rem), 0.75rem);
    line-height: 1.35;
  }

  .instagram-chrome,
  .instagram-chrome > div {
    position: absolute;
    pointer-events: none;
    z-index: 20;
  }

  .instagram-chrome {
    inset: 0;
  }

  .top-zone {
    inset: 0 0 auto;
    height: 12%;
    background: linear-gradient(180deg, rgba(255, 145, 77, 0.13), transparent);
  }

  .right-zone {
    inset: 12% 0 21% auto;
    width: 12%;
    background: linear-gradient(270deg, rgba(255, 145, 77, 0.14), transparent);
  }

  .bottom-zone {
    inset: auto 0 0;
    height: 21%;
    background: linear-gradient(0deg, rgba(255, 145, 77, 0.16), transparent);
  }

  .safe-frame {
    inset: 12% 12% 21% 7%;
    border: 1px dashed rgba(255, 200, 154, 0.7);
    border-radius: 0.4rem;
  }

  .preview-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: var(--preview-width);
    gap: 1rem;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.66));
    font-size: max(var(--font-size-compact, 0.75rem), 0.75rem);
  }

  .format {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    color: var(--theme-text, #fff);
  }

  /* Length changes as layouts and performances swap; tabular digits keep the
     edit hint from sliding when 5.0 becomes 17.0. */
  .duration {
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.66));
    font-variant-numeric: tabular-nums;
  }

  @container post-studio (min-width: 84rem) {
    .preview-shell {
      --preview-width: min(100%, calc((100cqb - 3rem) * 0.5625), 44rem);
    }
  }

  @container post-studio (min-width: 105rem) {
    .preview-shell {
      --preview-width: min(100%, calc((100cqb - 3.25rem) * 0.5625), 56rem);
    }

    .preview-meta {
      font-size: var(--studio-body-size, 1rem);
    }
  }

  @container post-studio (min-width: 180rem) {
    .preview-shell {
      --preview-width: min(100%, calc((100cqb - 3.75rem) * 0.5625), 68rem);
    }
  }

  /* Below 70rem the frame column is sized to the frame, so the stage height
     drives it. Sizing off a viewport fraction (45dvh) instead left a 820x1180
     tablet with a 350px frame under 300px of empty stage — the width cap is a
     ceiling, not the driver. The column's own width is the only other limit.
     A 21rem phone-width ceiling used to hold the frame beside the share panel
     on an 884x1028 Fold to 336px wide; without it the frame is 412x732. */
  @container post-studio (max-width: 70rem) {
    .preview-shell {
      --preview-width: min(100%, calc((100cqb - 2.75rem) * 0.5625), 34rem);
    }
  }

  /* A short stage (a landscape phone, or a phone with the share panel docked
     under the studio) drops the meta line so the frame takes the stage's full
     height rather than reserving a row for it. Asked of the stage, not the
     viewport: a 667px-tall phone is not short, but its stage above an open
     share panel is. */
  @container post-studio-stage (max-height: 20rem) {
    .preview-shell {
      --preview-width: min(100%, calc((100cqb - 0.5rem) * 0.5625));
    }

    .preview-meta {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .region {
      transition: none;
    }
  }
</style>
