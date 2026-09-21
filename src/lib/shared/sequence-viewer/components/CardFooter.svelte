<!--
  CardFooter.svelte

  Renders centered card notes and path-shape metadata. Submission provenance
  and record dates belong on the sequence record, not the portable card.
-->
<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { TextRenderer } from "$lib/shared/render/services/text-renderer";
  import { ensureCardFonts } from "$lib/shared/render/services/gelasio-fonts";
  import type { HandLegend } from "../services/hand-legend";

  interface Props {
    showFooter: boolean;
    showNotes: boolean;
    hasPathShapeMetadata: boolean;
    customNotesText: string;
    scaledFooterHeight: number;
    footerFontSize: number;
    footerMargin: number;
    activeDarkMode: boolean;
    /** The downloaded artifact uses the canvas card palette exactly. */
    exportPresentation?: boolean;
    /** Which color is the viewer's right hand. Only beside performance footage. */
    handLegend?: HandLegend | null;
  }

  const {
    showFooter,
    showNotes,
    hasPathShapeMetadata,
    customNotesText,
    scaledFooterHeight,
    footerFontSize,
    footerMargin,
    activeDarkMode,
    exportPresentation = false,
    handLegend = null,
  }: Props = $props();

  const exportTextRenderer = new TextRenderer();
  let exportCanvas = $state<HTMLCanvasElement>();
  let exportCanvasWidth = $state(0);

  $effect(() => {
    const canvas = exportCanvas;
    if (!exportPresentation || !canvas || exportCanvasWidth < 1) return;
    const width = Math.round(exportCanvasWidth);
    const height = Math.round(scaledFooterHeight);
    if (height < 1) return;
    const snapshot = {
      customNotesText,
      footerHeight: height,
      darkMode: activeDarkMode,
      showNotes,
    };
    let cancelled = false;
    void (async () => {
      await ensureCardFonts();
      if (cancelled) return;
      canvas.width = width;
      canvas.height = height;
      await exportTextRenderer.renderCardFooter({ canvas, ...snapshot });
    })();
    return () => {
      cancelled = true;
    };
  });
</script>

{#if showFooter}
  <div
    class="footer-section"
    class:dark-mode={activeDarkMode}
    class:export-presentation={exportPresentation}
    role={exportPresentation ? "img" : undefined}
    aria-label={exportPresentation
      ? showNotes && customNotesText.trim()
        ? customNotesText
        : "Card footer"
      : undefined}
    style="height: {scaledFooterHeight}px; padding-left: {footerMargin}px; padding-right: {footerMargin}px; font-size: max(var(--font-size-compact, 12px), {footerFontSize}px);"
    transition:fly|local={{
      y: 20,
      duration: exportPresentation ? 0 : 250,
      easing: cubicOut,
    }}
  >
    {#if exportPresentation}
      <canvas
        class="export-footer-canvas"
        bind:this={exportCanvas}
        bind:clientWidth={exportCanvasWidth}
        aria-hidden="true"
      ></canvas>
    {:else}
      {#if handLegend}
        <span
          class="footer-hand-legend"
          data-hand-legend
          role="img"
          aria-label={handLegend.spoken}
        >
          {handLegend.lead}
          <span
            class="hand-swatch"
            style="background: {handLegend.swatch};"
            aria-hidden="true"
          ></span>
          {handLegend.rest}
        </span>
      {/if}

      {#if showNotes}
        <span class="footer-notes" transition:fade|local={{ duration: 200 }}>
          {customNotesText}
        </span>
      {/if}

      {#if hasPathShapeMetadata}
        <span class="footer-path-shape">Linear shifts</span>
      {/if}
    {/if}
  </div>
{/if}

<style>
  /* The footer contains card facts only, centered as one balanced group. */
  .footer-section {
    /* Sized so the hand legend can scale to the footer's width. */
    container-type: inline-size;
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    column-gap: 10px;
    background: rgba(245, 245, 245, 0.98);
    border-top: 1px solid rgba(0, 0, 0, 0.1);
    font-family: Georgia, serif;
    color: black;
    flex-shrink: 0;
    width: 100%;
    box-sizing: border-box;
    transition:
      background-color 350ms ease,
      border-color 350ms ease,
      color 350ms ease;
  }

  .footer-section.dark-mode {
    background: rgba(10, 10, 15, 0.98);
    border-top-color: var(--theme-stroke, rgba(255, 255, 255, 0.15));
    color: white;
  }

  .footer-section.export-presentation {
    background: transparent;
    border-top: 0;
    padding: 0 !important;
  }

  .export-footer-canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  .footer-notes {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .footer-path-shape {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: inherit;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-style: italic;
  }

  .footer-hand-legend {
    display: flex;
    align-items: center;
    gap: 0.35em;
    /* The footer floors its type at 12px for legibility. A narrow card (a
       phone-frame preview in a short window) is not wide enough for the
       as-performed line at that floor, so the legend shrinks with the footer
       below roughly 300px rather than spilling past the card edges. */
    font-size: min(1em, 4cqi);
    font-weight: 600;
    white-space: nowrap;
  }

  .hand-swatch {
    display: inline-block;
    flex-shrink: 0;
    width: 0.9em;
    height: 0.9em;
    border-radius: 0.2em;
    border: 1px solid rgba(0, 0, 0, 0.25);
  }

  .dark-mode .hand-swatch {
    border-color: rgba(255, 255, 255, 0.35);
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .footer-section {
      transition: none;
    }
  }
</style>
