<!--
  CardPreviewStack.svelte - Side-by-side front+back card preview

  Renders front and back cards at equal size. Horizontal when container
  is wide enough, vertical otherwise. Uses ResizeObserver to track
  container dimensions and computes per-card scaling to fit.
-->
<script lang="ts">
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import ChoreoCard from "../ChoreoCard.svelte";
  import CardBack from "../card-back/CardBack.svelte";
  import InfoCardCanvasPreview from "../card-back/InfoCardCanvasPreview.svelte";

  interface Props {
    sequence: SequenceData | null;
    showWord: boolean;
    includeStartPlacement: boolean;
    startPlacementLayout: "row" | "column";
    showQRCode: boolean;
    showInfoCard: boolean;
    printMode?: boolean;
    frontImageUrl?: string | null;
    backImageUrl?: string | null;
    onCardContextMenu?: (x: number, y: number, rerender: () => void) => void;
  }

  let {
    sequence,
    showWord,
    includeStartPlacement,
    startPlacementLayout,
    showQRCode,
    showInfoCard,
    printMode = false,
    frontImageUrl,
    backImageUrl,
    onCardContextMenu,
  }: Props = $props();

  const CARD_PORTRAIT = 5 / 7;
  const CARD_LANDSCAPE = 7 / 5;
  const BACK_AR = 5 / 7;
  const GAP = 16;

  let containerEl: HTMLDivElement | undefined = $state();
  let cW = $state(0);
  let cH = $state(0);

  $effect(() => {
    if (!containerEl) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) {
        cW = r.width;
        cH = r.height;
      }
    });
    ro.observe(containerEl);
    return () => ro.disconnect();
  });

  const isHorizontal = $derived(cW > cH * 1.2);

  let cardAspect = $state(0);

  const frontIsLandscape = $derived(
    printMode ? false : cardAspect > 0 ? cardAspect > 1.3 : false
  );
  const frontAR = $derived(
    printMode
      ? CARD_PORTRAIT
      : frontIsLandscape
        ? CARD_LANDSCAPE
        : CARD_PORTRAIT
  );

  const availMain = $derived(Math.max(0, (isHorizontal ? cW : cH) - GAP));
  const slotMain = $derived(availMain / 2);
  const crossAxis = $derived(isHorizontal ? cH : cW);

  const frontLayout = $derived.by(() => {
    const slotW = isHorizontal ? slotMain : crossAxis;
    const slotH = isHorizontal ? crossAxis : slotMain;
    if (slotW === 0 || slotH === 0) return { w: 0, h: 0 };
    let h = slotH;
    let w = h * frontAR;
    if (w > slotW) {
      w = slotW;
      h = w / frontAR;
    }
    return { w: Math.floor(w), h: Math.floor(h) };
  });

  const backLayout = $derived.by(() => {
    const slotW = isHorizontal ? slotMain : crossAxis;
    const slotH = isHorizontal ? crossAxis : slotMain;
    if (slotW === 0 || slotH === 0) return { w: 0, h: 0 };
    let h = slotH;
    let w = h * BACK_AR;
    if (w > slotW) {
      w = slotW;
      h = w / BACK_AR;
    }
    return { w: Math.floor(w), h: Math.floor(h) };
  });

  function watchForImage(node: HTMLElement) {
    let attempts = 0;
    const check = () => {
      const img = node.querySelector("img") as HTMLImageElement | null;
      if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
        cardAspect = img.naturalWidth / img.naturalHeight;
        return;
      }
      if (attempts++ < 50) requestAnimationFrame(check);
    };
    check();

    const mo = new MutationObserver(() => {
      attempts = 0;
      check();
    });
    mo.observe(node, { childList: true, subtree: true });

    return {
      destroy() {
        mo.disconnect();
      },
    };
  }
</script>

<div
  class="preview-stack"
  class:horizontal={isHorizontal}
  class:print-mode={printMode}
  bind:this={containerEl}
>
  <div class="card-slot">
    <div
      class="card-frame"
      style="width: {frontLayout.w}px; height: {frontLayout.h}px;"
      use:watchForImage
    >
      {#if showInfoCard}
        <InfoCardCanvasPreview face="front" />
      {:else if sequence}
        <ChoreoCard
          {sequence}
          {showWord}
          {includeStartPlacement}
          {startPlacementLayout}
          showQRCodes={showQRCode}
          {printMode}
          cardMode={!printMode}
          preRenderedImageUrl={printMode ? frontImageUrl : undefined}
          eager={true}
          onContextMenu={onCardContextMenu}
        />
      {:else if frontImageUrl}
        <img
          class="rendered-card-image"
          src={frontImageUrl}
          alt="Card front"
          draggable="false"
        />
      {/if}
    </div>
  </div>

  <div class="card-slot">
    <div
      class="card-frame back-frame"
      style="width: {backLayout.w}px; height: {backLayout.h}px;"
    >
      {#if showInfoCard}
        <InfoCardCanvasPreview face="back" />
      {:else if backImageUrl}
        <img
          class="rendered-card-image"
          src={backImageUrl}
          alt="Card back"
          draggable="false"
        />
      {:else if sequence}
        <CardBack {sequence} />
      {/if}
    </div>
  </div>
</div>

<style>
  .preview-stack {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 16px;
    align-items: center;
    padding: 8px;
    overflow: hidden;
  }

  .preview-stack.horizontal {
    flex-direction: row;
    justify-content: center;
  }

  .card-slot {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    overflow: visible;
    min-height: 0;
    width: 100%;
  }

  .horizontal .card-slot {
    height: 100%;
    min-width: 0;
  }

  .card-frame {
    border-radius: 0;
    overflow: hidden;
    box-shadow: var(--shadow-card, 0 4px 20px rgba(0, 0, 0, 0.4));
    container-type: inline-size;
  }

  .preview-stack.print-mode .card-frame {
    background: var(--print-bg, #ffffff);
  }

  .preview-stack.print-mode .back-frame {
    background: transparent;
  }

  .card-frame :global(.border-frame) {
    border-radius: 0;
  }

  .card-frame :global(.back) {
    border-radius: 0;
  }

  .card-frame :global(.choreo-card) {
    cursor: default;
  }

  .rendered-card-image {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
