<script lang="ts">
  import { onMount } from "svelte";
  import type { FestivalSamplerPair } from "../../services/festival-sampler-renderer";
  import {
    drawFestivalSamplerSheetPreview,
    FESTIVAL_PREVIEW_PAGE_HEIGHT,
    FESTIVAL_PREVIEW_PAGE_WIDTH,
    planFestivalSamplerSheetPreview,
    type FestivalSamplerSheetSide,
  } from "../../services/festival-sampler-sheet-preview";

  interface Props {
    pairs: readonly FestivalSamplerPair[] | null;
    side: FestivalSamplerSheetSide;
    packNumber: number;
    onCardClick?: (
      pair: FestivalSamplerPair,
      trigger: HTMLButtonElement
    ) => void;
  }

  let { pairs, side, packNumber, onCardClick }: Props = $props();
  let canvas: HTMLCanvasElement;
  let preview: HTMLDivElement;
  let isNearViewport = $state(false);
  let isPainted = $state(false);
  const cardTargets = $derived.by(() =>
    pairs ? planFestivalSamplerSheetPreview(pairs, side) : []
  );

  $effect(() => {
    if (!canvas) return;

    if (!pairs || !isNearViewport) {
      // Sixty packs means 120 sheets. Releasing distant backing stores keeps
      // scrolling light without changing the size or position of any row.
      canvas.width = 1;
      canvas.height = 1;
      isPainted = false;
      return;
    }

    drawFestivalSamplerSheetPreview(canvas, pairs, side);
    isPainted = true;
  });

  onMount(() => {
    if (!("IntersectionObserver" in window)) {
      isNearViewport = true;
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        isNearViewport = entry?.isIntersecting ?? false;
      },
      { rootMargin: "900px 0px" }
    );
    observer.observe(preview);
    return () => observer.disconnect();
  });
</script>

<div
  bind:this={preview}
  class="sheet-preview"
  class:loading={!isPainted}
  aria-busy={!isPainted}
>
  <canvas
    bind:this={canvas}
    class:rendered={isPainted}
    aria-label={`Pack ${packNumber} ${side} sheet`}
  >
    Pack {packNumber}
    {side} sheet
  </canvas>
  {#if isPainted && onCardClick}
    <div
      class="card-targets"
      role="group"
      aria-label={`Pack ${packNumber} ${side} cards`}
    >
      {#each cardTargets as target (target.sourceIndex)}
        <button
          type="button"
          class="card-target"
          style={`--target-x: ${(target.destinationX / FESTIVAL_PREVIEW_PAGE_WIDTH) * 100}%; --target-y: ${(target.destinationY / FESTIVAL_PREVIEW_PAGE_HEIGHT) * 100}%; --target-width: ${(target.destinationWidth / FESTIVAL_PREVIEW_PAGE_WIDTH) * 100}%; --target-height: ${(target.destinationHeight / FESTIVAL_PREVIEW_PAGE_HEIGHT) * 100}%;`}
          aria-label={`Inspect ${target.pair.label}, shown on the ${side} sheet`}
          title="View front and back"
          onclick={(event) => onCardClick(target.pair, event.currentTarget)}
        >
          <span aria-hidden="true"><i class="fas fa-expand"></i></span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .sheet-preview {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 8.5 / 11;
    overflow: hidden;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    contain: layout paint;
  }

  .sheet-preview.loading::before {
    position: absolute;
    z-index: 0;
    inset: 2.2727% 5.8824%;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background:
      repeating-linear-gradient(
        to right,
        transparent 0 calc(33.3333% - 1px),
        var(--theme-stroke, rgba(255, 255, 255, 0.12)) calc(33.3333% - 1px)
          33.3333%
      ),
      repeating-linear-gradient(
        to bottom,
        transparent 0 calc(33.3333% - 1px),
        var(--theme-stroke, rgba(255, 255, 255, 0.12)) calc(33.3333% - 1px)
          33.3333%
      ),
      color-mix(
        in srgb,
        var(--theme-text, #fff) 5%,
        var(--theme-card-bg, transparent)
      );
    content: "";
  }

  .sheet-preview.loading::after {
    position: absolute;
    z-index: 1;
    inset: 0;
    background: linear-gradient(
      105deg,
      transparent 35%,
      color-mix(in srgb, var(--theme-text, #fff) 9%, transparent) 48%,
      transparent 61%
    );
    content: "";
    transform: translateX(-100%);
    animation: sheet-shimmer 1.8s ease-in-out infinite;
  }

  canvas {
    position: absolute;
    z-index: 2;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    background: transparent;
  }

  canvas.rendered {
    background: #ffffff;
  }

  .card-targets {
    position: absolute;
    z-index: 3;
    inset: 0;
    pointer-events: none;
  }

  .card-target {
    position: absolute;
    top: var(--target-y);
    left: var(--target-x);
    width: var(--target-width);
    height: var(--target-height);
    min-width: 0;
    min-height: 0;
    margin: 0;
    padding: 0;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 16%, transparent);
    border-radius: 0;
    background: transparent;
    color: var(--theme-text-on-accent, #fff);
    cursor: zoom-in;
    pointer-events: auto;
    transition:
      border-color 140ms ease,
      box-shadow 140ms ease,
      background 140ms ease;
  }

  .card-target span {
    position: absolute;
    top: 5px;
    right: 5px;
    display: grid;
    width: 24px;
    height: 24px;
    place-items: center;
    border: 1px solid color-mix(in srgb, #fff 52%, transparent);
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.68);
    font-size: 10px;
    opacity: 0;
    transform: scale(0.88);
    transition:
      opacity 140ms ease,
      transform 140ms ease;
  }

  .card-target:hover,
  .card-target:focus-visible {
    border-color: var(--theme-accent, #8b5cf6);
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 8%,
      transparent
    );
    box-shadow: inset 0 0 0 2px var(--theme-accent, #8b5cf6);
    outline: none;
  }

  .card-target:hover span,
  .card-target:focus-visible span {
    opacity: 1;
    transform: scale(1);
  }

  @keyframes sheet-shimmer {
    to {
      transform: translateX(100%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sheet-preview.loading::after {
      animation: none;
    }

    .card-target,
    .card-target span {
      transition: none;
    }
  }
</style>
