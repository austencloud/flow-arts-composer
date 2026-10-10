<script lang="ts">
  import type { MediaSublayerProps } from "@austencloud/video-editor";
  import PostStudioSequenceAnimationLayer from "$lib/shared/post-studio-plugin/ui/PostStudioSequenceAnimationLayer.svelte";
  import PostStudioChoreoLayer from "$lib/shared/post-studio-plugin/ui/PostStudioChoreoLayer.svelte";
  import PostStudioTunnelLayer from "$lib/shared/post-studio-plugin/ui/PostStudioTunnelLayer.svelte";
  import PostStudioMandalaLayer from "$lib/shared/post-studio-plugin/ui/PostStudioMandalaLayer.svelte";
  import { useTkaEditor } from "./tka-editor-context";
  import {
    hookChromeOpacity,
    layerAnimationAppearance,
    layerAnimationTimeSeconds,
    layerBreakdownMode,
    layerBreakdownMotion,
    layerCardRenderOptions,
    layerMandalaIn,
    layerQrUrl,
    layerSequencePosition,
    paintedLabelRegions,
  } from "./tka-canvas-layer";

  /**
   * tka's sequence surfaces inside a media layer: the live animation, the
   * choreo card, the tunnel and the mandala. Each value they take is the one
   * the canvas passed the media layer before Task 14, derived here from the
   * layer, its items and the TKA context.
   */
  let {
    editor,
    binding,
    layer,
    role,
    regionId,
    preset,
    sourceItem,
    playing,
  }: MediaSublayerProps = $props();

  const tka = useTkaEditor();

  const sequence = $derived(tka.sequence);
  /** The record a scan of the card opens: the source, not a labeled copy. */
  const qrSequence = $derived(tka.qrSequence);
  const qrUrl = $derived(layerQrUrl(sourceItem));
  const cardRenderOptions = $derived(
    layerCardRenderOptions(tka.cardRenderOptions, sourceItem)
  );
  const animationAppearance = $derived(
    layerAnimationAppearance(layer, sourceItem)
  );
  const tunnelHook = $derived(layer.tunnelHook ?? null);
  const chromeOpacity = $derived(hookChromeOpacity(editor, regionId));
  const mandalaIn = $derived(
    layerMandalaIn(editor, layer, regionId, sourceItem)
  );
  /** An animation turning into its square's look on one surface, 0 to 1. */
  const lookBlend = $derived(layer.lookBlend ?? 0);
  const effectsIn = $derived(layer.effectsIn ?? 1);
  const sequencePosition = $derived(layerSequencePosition(layer, binding));
  const sequencePassIndex = $derived(layer.sequencePassIndex);
  const sequenceProgress = $derived(layer.sequenceFrame?.passBeatProgress);
  const animationTimeSeconds = $derived(
    layerAnimationTimeSeconds(layer, binding)
  );
  const breakdownMotion = $derived(layerBreakdownMotion(role, sourceItem));
  const breakdownMode = $derived(layerBreakdownMode(sourceItem));
  /** The post paints the animation's labels; see the animation layer. */
  const labelsPainted = $derived(
    paintedLabelRegions(tka.bindingFor, preset).has(regionId)
  );
  const displayedBeatNumber = $derived(layer.displayedBeatNumber);
</script>

{#if binding.renderMode === "sequence-animation" && sequencePosition !== undefined}
  <PostStudioSequenceAnimationLayer
    {sequence}
    {sequencePosition}
    {displayedBeatNumber}
    {sequencePassIndex}
    {sequenceProgress}
    {animationTimeSeconds}
    {breakdownMotion}
    {breakdownMode}
    {labelsPainted}
    {animationAppearance}
    {tunnelHook}
    {chromeOpacity}
    {mandalaIn}
    {lookBlend}
    {effectsIn}
    {playing}
    leftPropType={cardRenderOptions?.leftPropTypeOverride ??
      cardRenderOptions?.propTypeOverride}
    rightPropType={cardRenderOptions?.rightPropTypeOverride ??
      cardRenderOptions?.propTypeOverride}
  />
{:else if binding.renderMode === "choreo-card"}
  <PostStudioChoreoLayer
    {sequence}
    {displayedBeatNumber}
    {cardRenderOptions}
    {qrSequence}
    {qrUrl}
  />
{:else if binding.renderMode === "tunnel"}
  <PostStudioTunnelLayer
    {sequence}
    {playing}
    bpm={60}
    leftPropType={cardRenderOptions?.leftPropTypeOverride ??
      cardRenderOptions?.propTypeOverride}
    rightPropType={cardRenderOptions?.rightPropTypeOverride ??
      cardRenderOptions?.propTypeOverride}
  />
{:else if binding.renderMode === "mandala"}
  <PostStudioMandalaLayer
    {sequence}
    leftPropType={cardRenderOptions?.leftPropTypeOverride ??
      cardRenderOptions?.propTypeOverride}
    rightPropType={cardRenderOptions?.rightPropTypeOverride ??
      cardRenderOptions?.propTypeOverride}
  />
{/if}
