<!--
  InfoCardCanvasPreview - the printed "How to Read" insert, on screen.

  Renders the SAME canvas the print pipeline emits rather than a Svelte
  lookalike, so the designer preview cannot drift from what actually prints.
  The card is drawn at full print resolution and scaled down by CSS.
-->
<script lang="ts">
  import { renderInfoCardFront, renderInfoCardBack } from "../../services/info-card-canvas-renderer";
  import { CARD_SIZES, type CardSizeId } from "../../domain/card-sizes";
  import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";

  interface Props {
    face: "front" | "back";
    /** Printed on the front footer. Omitted in the designer, which has no release. */
    deckNumber?: number;
    cardSize?: CardSizeId;
  }

  let { face, deckNumber, cardSize = "poker" }: Props = $props();

  const theme = $derived(settingsService.settings.backgroundType);

  let host: HTMLDivElement | undefined = $state();

  $effect(() => {
    const el = host;
    if (!el) return;

    const size = CARD_SIZES[cardSize];
    const options = {
      width: size.canvasWidth,
      height: size.canvasHeight,
      bleedPx: size.bleedPx,
      theme,
      ...(face === "front" ? { deckNumber } : {}),
    };

    let cancelled = false;
    const render = face === "front" ? renderInfoCardFront : renderInfoCardBack;
    render(options).then((canvas) => {
      if (cancelled || !el) return;
      // The renderer caches and returns a shared canvas; copy it so mounting the
      // same face twice cannot move one instance's node into the other.
      const copy = document.createElement("canvas");
      copy.width = canvas.width;
      copy.height = canvas.height;
      copy.getContext("2d")!.drawImage(canvas, 0, 0);
      copy.className = "info-card-canvas";
      el.replaceChildren(copy);
    });

    return () => { cancelled = true; };
  });
</script>

<div class="info-card-preview" bind:this={host}></div>

<style>
  .info-card-preview {
    width: 100%;
    height: 100%;
    display: flex;
  }

  .info-card-preview :global(.info-card-canvas) {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: contain;
  }
</style>
