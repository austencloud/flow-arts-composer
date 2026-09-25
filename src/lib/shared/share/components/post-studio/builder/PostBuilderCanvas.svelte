<script lang="ts">
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { SequenceExportOptions } from "$lib/shared/render/domain/models/sequence-export-options";
  import type { HandLabeling } from "$lib/shared/video-collaboration/domain/hand-labeling";
  import type { CompositionSourceBinding } from "$lib/shared/media-composition/state/media-composition-state.svelte";
  import type { EvaluatedFrameLayer } from "$lib/shared/media-composition/services/frame-evaluator";
  import type { PostBuilderState } from "$lib/shared/media-composition/state/post-builder-state.svelte";
  import { toPaintFrame } from "$lib/shared/media-composition/services/post-studio-layer-painter";
  import {
    ANIMATION_OVERLAY_ROLE,
    STRIP_AREA,
    stripModeFromRole,
  } from "$lib/shared/media-composition/domain/post-plan-compiler";
  import PostStudioMediaLayer from "../PostStudioMediaLayer.svelte";
  import PostStudioPaintedLayer from "../PostStudioPaintedLayer.svelte";

  /**
   * The post as it will render: every act's regions, drawn from the frame the
   * evaluator produced for the playhead. The export reads its video and
   * animation surfaces from this element, so it must stay mounted while a
   * render runs.
   */
  interface Props {
    builder: PostBuilderState;
    sequence: SequenceData;
    bindingFor: (role: string) => CompositionSourceBinding | null;
    cardRenderOptions?: Partial<SequenceExportOptions> | null;
    handLabeling?: HandLabeling | null;
    /** The record a scan of the card opens: the source, not a labeled copy. */
    qrSequence?: SequenceData;
    /** Outline the strip so prop ends can be framed clear of it. */
    showStripGuide?: boolean;
    root?: HTMLElement | null;
  }

  let {
    builder,
    sequence,
    bindingFor,
    cardRenderOptions = null,
    handLabeling = null,
    qrSequence,
    showStripGuide = false,
    root = $bindable(null),
  }: Props = $props();

  const preset = $derived(builder.compiled?.preset ?? null);
  const visible = $derived(
    new Map(builder.frameLayers.map((layer) => [layer.clipId, layer]))
  );

  /**
   * A take's video stays mounted for the whole post, parked on its act's
   * first frame while another act plays, so the cut into it is instant
   * rather than a reload.
   */
  function parkedLayer(clipId: string): EvaluatedFrameLayer | null {
    const clip = preset?.clips.find((candidate) => candidate.id === clipId);
    if (!clip || clip.kind !== "visual") return null;
    const sourceIn = clip.sourceIn.unit === "seconds" ? clip.sourceIn.value : 0;
    return {
      clipId: clip.id,
      regionId: clip.regionId,
      sourceRole: clip.sourceRole,
      opacity: 0,
      sourceTimeSeconds: sourceIn,
      projectProgress: 0,
      transform: clip.transform,
    };
  }

  /** The split's labels are painted over the animation, not drawn by it. */
  const labelsPainted = $derived(
    Boolean(
      preset?.clips.some((clip) => clip.sourceRole === ANIMATION_OVERLAY_ROLE)
    ) && bindingFor(ANIMATION_OVERLAY_ROLE)?.status === "ready"
  );

  const stripGuideVisible = $derived(
    showStripGuide &&
      builder.frameLayers.some((layer) => stripModeFromRole(layer.sourceRole))
  );

  /**
   * Until its take is mapped, a layer drawn from the sequence holds the
   * opening pose, the engine's position 1, rather than going blank.
   */
  const OPENING_POSITION = 1;

  function pct(value: number): string {
    return `${value * 100}%`;
  }
</script>

<div
  class="post-canvas"
  bind:this={root}
  style:aspect-ratio={preset
    ? `${preset.output.width} / ${preset.output.height}`
    : "9 / 16"}
  data-post-canvas
>
  {#if preset}
    {#each preset.regions as region (region.id)}
      {@const clips = preset.clips.filter(
        (clip) => clip.kind === "visual" && clip.regionId === region.id
      )}
      <div
        class="region"
        style:left={pct(region.x)}
        style:top={pct(region.y)}
        style:width={pct(region.width)}
        style:height={pct(region.height)}
        style:z-index={region.zIndex}
      >
        {#each clips as clip (clip.id)}
          {@const binding = bindingFor(clip.sourceRole)}
          {@const live = visible.get(clip.id) ?? null}
          {@const isVideo = binding?.renderMode === "external-media"}
          {@const layer = live ?? (isVideo ? parkedLayer(clip.id) : null)}
          {#if binding?.status === "ready" && layer}
            {#if binding.renderMode === "painted" && binding.painter}
              <div class="painted" style:opacity={layer.opacity}>
                <PostStudioPaintedLayer
                  painter={binding.painter}
                  frame={toPaintFrame(layer, builder.previewSeconds)}
                />
              </div>
            {:else if isVideo ? binding.previewUrl : true}
              <div class="layer" class:parked={!live}>
                <PostStudioMediaLayer
                  {binding}
                  fit={region.fit}
                  opacity={layer.opacity}
                  sourceTimeSeconds={layer.sourceTimeSeconds}
                  playing={builder.isPlaying && Boolean(live)}
                  {sequence}
                  {cardRenderOptions}
                  {handLabeling}
                  {qrSequence}
                  sequencePosition={layer.sequencePosition ??
                    (isVideo ? undefined : OPENING_POSITION)}
                  sequencePassIndex={layer.sequencePassIndex}
                  animationTimeSeconds={layer.animationTimeSeconds ??
                    (isVideo ? undefined : 0)}
                  breakdownMotion={stripModeFromRole(clip.sourceRole) !== null}
                  {labelsPainted}
                  displayedBeatNumber={layer.displayedBeatNumber ??
                    (binding.renderMode === "choreo-card" ? 0 : undefined)}
                  clipId={clip.id}
                  transform={layer.transform}
                  playbackRate={clip.playbackRate}
                />
              </div>
            {/if}
          {/if}
        {/each}
      </div>
    {/each}
    {#if stripGuideVisible}
      <div
        class="strip-guide"
        aria-hidden="true"
        style:left={pct(STRIP_AREA.x)}
        style:top={pct(STRIP_AREA.y)}
        style:width={pct(STRIP_AREA.width)}
        style:height={pct(STRIP_AREA.height)}
      ></div>
    {/if}
  {:else}
    <div class="empty">
      <i class="fa-solid fa-film" aria-hidden="true"></i>
      <span>Add a take to start the post</span>
    </div>
  {/if}
</div>

<style>
  .post-canvas {
    position: relative;
    width: 100%;
    max-height: 100%;
    overflow: hidden;
    border-radius: 0.5rem;
    background: #08080c;
    container-type: inline-size;
  }
  .region {
    position: absolute;
    overflow: hidden;
  }
  .layer,
  .painted {
    position: absolute;
    inset: 0;
  }
  .layer.parked {
    visibility: hidden;
  }
  .strip-guide {
    position: absolute;
    z-index: 20000;
    border: 2px dashed rgb(255 255 255 / 0.7);
    pointer-events: none;
  }
  .empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.75rem;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.875rem;
    text-align: center;
  }
  .empty i {
    font-size: 1.75rem;
  }
</style>
