<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import ChoreoCard from "#lib/shared/sequence-viewer/components/ChoreoCard.svelte";
  import type { SequenceExportOptions } from "#lib/shared/render/domain/models/sequence-export-options.js";
  import { isCardLayoutAutomatic } from "#lib/shared/share/services/card-render-options.js";
  import { getImageCompositionManager } from "#lib/shared/share/state/image-composition-state.svelte.js";
  import { getViewerStudioSurfaces } from "#lib/shared/sequence-viewer/context/viewer-studio-surfaces-context.js";
  import { postCardHighlightedStepIndex } from "./post-card-highlight";
  import TunnelChoreoCard from "./TunnelChoreoCard.svelte";
  import type { PostFollower } from "../tunnel-performers";
  import {
    cardEndingFrame,
    hasCardEnding,
    lerpBox,
    qrLandingBox,
    type PostCardEnding,
  } from "../card-ending";
  import {
    cardEndingMask,
    measureCardLayout,
    paintCardRings,
    paintQrFlight,
    sameCardLayout,
    type MeasuredCardLayout,
  } from "../card-ending-draw";
  import { registerCardLayer } from "./card-layer-registry";
  import { loadBrandSerif } from "#lib/shared/media-composition/services/brand-serif.js";

  let {
    sequence,
    displayedBeatNumber,
    cardRenderOptions = null,
    qrSequence = sequence,
    qrUrl,
    followers = [],
    tunnelSource = null,
    cardId = null,
    ending = null,
    seconds = 0,
    opacity = 1,
    beatSeconds = null,
  }: {
    sequence: SequenceData;
    displayedBeatNumber?: number;
    cardRenderOptions?: Partial<SequenceExportOptions> | null;
    /** The source behind a labeled `sequence`; what a scan of the card opens. */
    qrSequence?: SequenceData;
    /** A saved scan link the card's QR shows instead of the account's own code. */
    qrUrl?: string;
    /** The performers behind on a tunnel post; the card then draws the tunnel. */
    followers?: readonly PostFollower[];
    /** The stored sequence behind the labeled one; the tunnel QR names its code. */
    tunnelSource?: SequenceData | null;
    /** The card clip's id, so the titles' landing can measure this card. */
    cardId?: string | null;
    /** The clip's ending settings; none draws the card exactly as before. */
    ending?: PostCardEnding | null;
    /** Seconds into the clip. */
    seconds?: number;
    /** The clip's own opacity, for the QR that flies outside its box. */
    opacity?: number;
    /** One beat of the song's grid, when it has one. */
    beatSeconds?: number | null;
  } = $props();

  const animated = $derived(ending !== null && hasCardEnding(ending));
  const titleFromClip = $derived(ending?.headerTitle === "clip");
  /** The settings and beat the export reads off the card. */
  const endingData = $derived(
    animated ? JSON.stringify({ ending, beatSeconds }) : undefined
  );

  const tunnel = $derived(followers.length > 0);

  // A ringed card shows its ring instead of the beat's highlight.
  const highlightedStepIndex = $derived(
    ending?.ring ? null : postCardHighlightedStepIndex(displayedBeatNumber)
  );

  let cardLayer = $state<HTMLDivElement | null>(null);
  let ringCanvas = $state<HTMLCanvasElement | null>(null);
  let layout = $state.raw<MeasuredCardLayout>({ pieces: [] });

  $effect(() => {
    const node = cardLayer;
    const id = cardId;
    if (!node || !id) return;
    return registerCardLayer(id, node);
  });

  // Measure the drawn card while it has an ending: again when it resizes or
  // its tiles change, never per frame.
  $effect(() => {
    const node = cardLayer;
    if (!node || !animated) return;
    let queued = 0;
    const measure = () => {
      queued = 0;
      const next = measureCardLayout(node);
      const last = untrack(() => layout);
      if (!sameCardLayout(next, last) || next.qrImage !== last.qrImage)
        layout = next;
    };
    const queue = () => {
      if (!queued) queued = requestAnimationFrame(measure);
    };
    measure();
    const resize = new ResizeObserver(queue);
    resize.observe(node);
    const mutation = new MutationObserver(queue);
    mutation.observe(node, { childList: true, subtree: true });
    return () => {
      resize.disconnect();
      mutation.disconnect();
      if (queued) cancelAnimationFrame(queued);
    };
  });

  const frame = $derived(
    animated && ending && layout.pieces.length > 0
      ? cardEndingFrame(ending, seconds, layout, beatSeconds)
      : null
  );
  const mask = $derived(frame ? cardEndingMask(frame, layout) : null);

  $effect(() => {
    const canvas = ringCanvas;
    const current = frame;
    if (!canvas || !cardLayer) return;
    const width = cardLayer.clientWidth;
    const height = cardLayer.clientHeight;
    const scale = window.devicePixelRatio || 1;
    const pixelWidth = Math.max(1, Math.round(width * scale));
    const pixelHeight = Math.max(1, Math.round(height * scale));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (current?.rings.length)
      paintCardRings(context, canvas.width, canvas.height, current, layout);
  });

  // The flying QR leaves the card's box, so it draws on a canvas over the
  // whole post canvas, at the card's place in the stack.
  let flightCanvas = $state.raw<HTMLCanvasElement | null>(null);
  // The caption's serif draws only once loaded; a paused frame redraws then.
  let serifLoaded = $state(false);
  $effect(() => {
    if (!ending?.qrExit?.caption || serifLoaded) return;
    void loadBrandSerif().then(() => (serifLoaded = true));
  });
  $effect(() => {
    const node = cardLayer;
    if (!node || !animated || !ending?.qrExit) return;
    const post = node.closest<HTMLElement>("[data-post-canvas]");
    if (!post) return;
    const canvas = document.createElement("canvas");
    canvas.className = "post-card-qr-flight";
    canvas.setAttribute("aria-hidden", "true");
    Object.assign(canvas.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: node.closest<HTMLElement>(".region")?.style.zIndex ?? "",
    });
    post.appendChild(canvas);
    flightCanvas = canvas;
    return () => {
      canvas.remove();
      if (flightCanvas === canvas) flightCanvas = null;
    };
  });

  $effect(() => {
    const canvas = flightCanvas;
    const current = frame;
    const qrExit = ending?.qrExit;
    void opacity;
    void serifLoaded;
    if (!canvas || !cardLayer) return;
    const post = canvas.parentElement;
    if (!post) return;
    const box = post.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    const pixelWidth = Math.max(1, Math.round(post.clientWidth * scale));
    const pixelHeight = Math.max(1, Math.round(post.clientHeight * scale));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const image = layout.qrImage;
    if (!current?.qr || !qrExit || !image || box.width <= 0) return;
    const at = image.getBoundingClientRect();
    const from = {
      x: (at.left - box.left) / box.width,
      y: (at.top - box.top) / box.height,
      width: at.width / box.width,
      height: at.height / box.height,
    };
    context.globalAlpha = opacity;
    paintQrFlight(context, canvas.width, canvas.height, {
      image,
      box: lerpBox(
        from,
        qrLandingBox(qrExit, box.width / box.height),
        current.qr.progress
      ),
      plate: layout.qrPlate,
      qrExit,
      flight: current.qr,
    });
  });

  // The composition manager publishes through observers rather than runes, so
  // reading it inside a derived subscribes to nothing without this counter.
  const compositionManager = getImageCompositionManager();
  let compositionVersion = $state(0);
  function onCardSettingsChanged(): void {
    compositionVersion++;
  }
  compositionManager.registerObserver(onCardSettingsChanged);
  onDestroy(() => compositionManager.unregisterObserver(onCardSettingsChanged));

  /**
   * A slot is a different frame from the Card pane, so on Auto the card gets to
   * measure this one. Pinned columns are a deliberate choice and still carry.
   */
  const automatic = $derived.by(() => {
    void compositionVersion;
    return isCardLayoutAutomatic(sequence.steps?.length ?? 0) &&
      cardRenderOptions?.columnCount == null &&
      !cardRenderOptions?.startPlacementLayout;
  });

  const columnCount = $derived(cardRenderOptions?.columnCount ?? null);
  const startPlacementLayoutOverride = $derived(
    cardRenderOptions?.startPlacementLayout ?? null
  );
  const shared = getViewerStudioSurfaces();
  const owner = {};
  function cardDestination(node: HTMLElement) {
    // The shared card draws one performer; a tunnel card draws here.
    if (tunnel) return {};
    return {
      destroy: shared?.requestCard(owner, node, () => ({
        sequence,
        // The post's footer choice owns this line; viewer hand guidance must
        // not replace its Off, Credit, or Custom selection.
        handLabeling: null,
        qrSequence,
        qrUrl,
        highlightedStepIndex,
        options: cardRenderOptions,
        automatic,
      })),
    };
  }
</script>

<div
  class="choreo-frame"
  style:mask-image={mask}
  style:-webkit-mask-image={mask}
  style:mask-size={mask ? "100% 100%" : undefined}
  style:-webkit-mask-size={mask ? "100% 100%" : undefined}
  style:mask-repeat={mask ? "no-repeat" : undefined}
  style:-webkit-mask-repeat={mask ? "no-repeat" : undefined}
  style:mask-mode={mask ? "alpha" : undefined}
>
<div
  class="choreo-layer"
  class:title-from-clip={titleFromClip}
  data-card-ending={endingData}
  bind:this={cardLayer}
  use:cardDestination
  data-studio-card-destination
>
  {#if tunnel}
    <TunnelChoreoCard
      {sequence}
      sourceSequence={tunnelSource}
      {followers}
      {highlightedStepIndex}
      showHighlight={highlightedStepIndex !== null}
      visibilityOverrides={cardRenderOptions?.visibilityOverrides}
      darkMode={cardRenderOptions?.visibilityOverrides?.darkMode ?? true}
      showWord={cardRenderOptions?.addWord ?? true}
      showStepNumbers={cardRenderOptions?.addStepNumbers ?? true}
      showDifficultyLevel={cardRenderOptions?.addDifficultyLevel ?? true}
      includeStartPlacement={cardRenderOptions?.includeStartPlacement ?? true}
      showNotes={cardRenderOptions?.showNotes ?? false}
      customNotesText={cardRenderOptions?.customNotesText}
      showLoopGlyph={cardRenderOptions?.showLoopGlyph ?? true}
      leftPropType={cardRenderOptions?.leftPropTypeOverride ??
        cardRenderOptions?.propTypeOverride}
      rightPropType={cardRenderOptions?.rightPropTypeOverride ??
        cardRenderOptions?.propTypeOverride}
      {columnCount}
      {startPlacementLayoutOverride}
      forceContain
      fitWidth
    />
  {:else if !shared?.ownsCard(owner)}
    <ChoreoCard
      {sequence}
      {qrSequence}
      {qrUrl}
      {highlightedStepIndex}
      showHighlight={highlightedStepIndex !== null}
      visibilityOverrides={cardRenderOptions?.visibilityOverrides}
      darkMode={cardRenderOptions?.visibilityOverrides?.darkMode ?? true}
      showWord={cardRenderOptions?.addWord ?? true}
      showStepNumbers={cardRenderOptions?.addStepNumbers ?? true}
      showDifficultyLevel={cardRenderOptions?.addDifficultyLevel ?? true}
      includeStartPlacement={cardRenderOptions?.includeStartPlacement ?? true}
      showNotes={cardRenderOptions?.showNotes ?? false}
      customNotesText={cardRenderOptions?.customNotesText}
      showLoopGlyph={cardRenderOptions?.showLoopGlyph ?? true}
      showQRCode={cardRenderOptions?.visibilityOverrides?.showQRCode ?? false}
      showMandala={cardRenderOptions?.visibilityOverrides?.showMandala ?? false}
      handPathMode={cardRenderOptions?.visibilityOverrides?.handPathMode ??
        false}
      leftPropType={cardRenderOptions?.leftPropTypeOverride ??
        cardRenderOptions?.propTypeOverride}
      rightPropType={cardRenderOptions?.rightPropTypeOverride ??
        cardRenderOptions?.propTypeOverride}
      {columnCount}
      {startPlacementLayoutOverride}
      forceContain
      fitWidth
    />
  {/if}
</div>
</div>
{#if ending?.ring}
  <canvas class="card-rings" bind:this={ringCanvas} aria-hidden="true"></canvas>
{/if}

<style>
  .choreo-frame {
    width: 100%;
    height: 100%;
  }
  .card-rings {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  /* The titles clip draws the name here; the header keeps its space. */
  .choreo-layer.title-from-clip :global(.header-section .word-title) {
    visibility: hidden;
  }
  .choreo-layer {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #08080c;
  }
</style>
