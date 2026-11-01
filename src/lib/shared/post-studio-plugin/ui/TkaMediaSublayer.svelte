<script lang="ts">
  import type { MediaSublayerProps } from "@austencloud/video-editor";
  import PostStudioSequenceAnimationLayer from "#lib/shared/post-studio-plugin/ui/PostStudioSequenceAnimationLayer.svelte";
  import PostStudioChoreoLayer from "#lib/shared/post-studio-plugin/ui/PostStudioChoreoLayer.svelte";
  import PostStudioTunnelLayer from "#lib/shared/post-studio-plugin/ui/PostStudioTunnelLayer.svelte";
  import PostStudioMandalaLayer from "#lib/shared/post-studio-plugin/ui/PostStudioMandalaLayer.svelte";
  import PostStudioShiftingMandalaLayer from "./PostStudioShiftingMandalaLayer.svelte";
  import type PostStudioArrangementLayerType from "./PostStudioArrangementLayer.svelte";
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
  import { staggeredFrames } from "../staggered-performers";
  import { createPerformerSequences } from "../performer-sequences.svelte";
  import { sequencePositionToAnimationTime } from "#lib/shared/animation-engine/services/step-calculator.js";

  /**
   * tka's sequence surfaces inside a media layer: the live animation, the
   * choreo card, the tunnel, the mandala and an arrangement's grid. Each value they take is the one
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
    exporting,
    exportSize,
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
  // A staggered tunnel: the red/blue performer stops early and the others
  // follow it on the same tapped count.
  const staggered = $derived.by(() => {
    const followers =
      sourceItem?.kind === "animation" ? sourceItem.followers : undefined;
    if (!followers?.length || !layer.sequenceFrame || !sequence) return null;
    const moveBeats = sequence.steps.map((step) => step.duration ?? 1);
    return staggeredFrames(
      layer.sequenceFrame,
      moveBeats,
      followers.map((follower) => follower.beatsBehind)
    );
  });
  const followerPositions = $derived(
    staggered?.followers.map((frame) => frame.enginePosition) ?? []
  );
  // A partner facing the other way does the moves mirrored, flipped, swapped.
  const followerSequences = createPerformerSequences(
    () => sequence,
    () => (sourceItem?.kind === "animation" ? sourceItem.followers : undefined)
  );
  const sequencePosition = $derived(
    staggered?.leader.enginePosition ?? layerSequencePosition(layer, binding)
  );
  const sequencePassIndex = $derived(
    staggered?.leader.pass ?? layer.sequencePassIndex
  );
  const sequenceProgress = $derived(
    (staggered?.leader ?? layer.sequenceFrame)?.passBeatProgress
  );
  const animationTimeSeconds = $derived(
    staggered && sequence
      ? sequencePositionToAnimationTime(
          staggered.leader.enginePosition,
          sequence.steps,
          1
        )
      : layerAnimationTimeSeconds(layer, binding)
  );
  const breakdownMotion = $derived(layerBreakdownMotion(role, sourceItem));
  const breakdownMode = $derived(layerBreakdownMode(sourceItem));
  /** The post paints the animation's labels; see the animation layer. */
  const labelsPainted = $derived(
    paintedLabelRegions(tka.bindingFor, preset).has(regionId)
  );
  const displayedBeatNumber = $derived(
    staggered?.leader.move ?? layer.displayedBeatNumber
  );

  const arrangement = $derived(
    sourceItem?.kind === "arrangement" ? sourceItem : null
  );
  /** A shifting mandala clip; the "mandala" render mode is otherwise the PiP square. */
  const mandalaItem = $derived(
    sourceItem?.kind === "mandala" ? sourceItem : null
  );
  /** The selected arrangement's marks; any other arrangement draws none. */
  const arrangementMarks = $derived(
    arrangement && arrangement.id === editor.selectedItemId
      ? tka.arrangement.marks
      : null
  );
  // A post without an arrangement should not load the grid's canvas engines.
  let ArrangementLayer = $state.raw<
    typeof PostStudioArrangementLayerType | null
  >(null);
  $effect(() => {
    if (
      binding.renderMode !== "arrangement" ||
      !arrangement ||
      ArrangementLayer
    )
      return;
    let current = true;
    void import("./PostStudioArrangementLayer.svelte").then((module) => {
      if (current) ArrangementLayer = module.default;
    });
    return () => {
      current = false;
    };
  });
</script>

{#if binding.renderMode === "arrangement" && arrangement}
  {#if ArrangementLayer}
    <ArrangementLayer
      snapshot={arrangement.snapshot}
      sourceTimeSeconds={layer.sourceTimeSeconds}
      {playing}
      {exporting}
      {exportSize}
      editing={arrangementMarks}
    />
  {/if}
{:else if binding.renderMode === "mandala" && mandalaItem}
  <PostStudioShiftingMandalaLayer
    {editor}
    item={mandalaItem}
    sourceTimeSeconds={layer.sourceTimeSeconds}
    {exporting}
    {exportSize}
  />
{:else if binding.renderMode === "sequence-animation" && sequence && sequencePosition !== undefined}
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
    {followerPositions}
    followerSequences={followerSequences.current}
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
{:else if binding.renderMode === "choreo-card" && sequence}
  <PostStudioChoreoLayer
    {sequence}
    {displayedBeatNumber}
    {cardRenderOptions}
    {qrSequence}
    {qrUrl}
  />
{:else if binding.renderMode === "tunnel" && sequence}
  <PostStudioTunnelLayer
    {sequence}
    {playing}
    bpm={60}
    leftPropType={cardRenderOptions?.leftPropTypeOverride ??
      cardRenderOptions?.propTypeOverride}
    rightPropType={cardRenderOptions?.rightPropTypeOverride ??
      cardRenderOptions?.propTypeOverride}
  />
{:else if binding.renderMode === "mandala" && sequence}
  <PostStudioMandalaLayer
    {sequence}
    leftPropType={cardRenderOptions?.leftPropTypeOverride ??
      cardRenderOptions?.propTypeOverride}
    rightPropType={cardRenderOptions?.rightPropTypeOverride ??
      cardRenderOptions?.propTypeOverride}
  />
{/if}
