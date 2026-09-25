<script lang="ts">
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
  import { buildBackJob } from "../../services/card-back/card-back-job-builder";
  import { paintBackJob } from "../../services/card-back/card-back-raster";
  import { hydrateSequence } from "../../services/sequence-render-hydrator";

  interface Props {
    sequence: SequenceData;
    themeOverride?: string;
    leftPropTypeOverride?: PropType;
    rightPropTypeOverride?: PropType;
    primaryPropColorsOverride?: { left: string; right: string } | null;
    onready?: () => void;
    onerror?: (error: unknown) => void;
  }

  let {
    sequence,
    themeOverride,
    leftPropTypeOverride,
    rightPropTypeOverride,
    primaryPropColorsOverride,
    onready,
    onerror,
  }: Props = $props();

  let canvas: HTMLCanvasElement | undefined = $state();
  let state = $state<"loading" | "ready" | "error">("loading");

  const theme = $derived(
    themeOverride ?? settingsService.settings.backgroundType ?? "cosmic"
  );
  const leftPropType = $derived(
    leftPropTypeOverride ?? settingsService.settings.leftPropType
  );
  const rightPropType = $derived(
    rightPropTypeOverride ?? settingsService.settings.rightPropType
  );
  const primaryPropColors = $derived(
    primaryPropColorsOverride === undefined
      ? getSettings().primaryPropColors
      : primaryPropColorsOverride
  );

  $effect(() => {
    if (!canvas) return;
    const target = canvas;
    const currentSequence = sequence;
    const appearance = {
      theme,
      leftPropType,
      rightPropType,
      primaryPropColors: primaryPropColors
        ? { left: primaryPropColors.left, right: primaryPropColors.right }
        : null,
    };
    let cancelled = false;
    state = "loading";
    void (async () => {
      try {
        const hydrated = hydrateSequence({ ...currentSequence });
        const job = await buildBackJob(hydrated, {
          width: 1644,
          height: 2244,
          bleedPx: 72,
          ...appearance,
        });
        if (cancelled) return;
        const rendered = paintBackJob(job);
        if (cancelled) return;
        target.width = rendered.width;
        target.height = rendered.height;
        const context = target.getContext("2d");
        if (!context) throw new Error("Card back canvas is unavailable");
        context.drawImage(rendered, 0, 0);
        state = "ready";
        onready?.();
      } catch (error) {
        if (cancelled) return;
        console.warn("[BackJobPreview] card back render failed", error);
        state = "error";
        onerror?.(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  });
</script>

<div class="back-job-preview" class:ready={state === "ready"}>
  <canvas bind:this={canvas} aria-label="Card back" role="img"></canvas>
  {#if state === "loading"}
    <div class="status" role="status">Preparing card back…</div>
  {:else if state === "error"}
    <div class="status" role="alert">Card back preview unavailable</div>
  {/if}
</div>

<style>
  .back-job-preview {
    position: relative;
    width: 100%;
    height: 100%;
    background: #fff;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: fill;
    opacity: 0;
  }
  .ready canvas {
    opacity: 1;
  }
  .status {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 1rem;
    color: #293142;
    background: #fff;
    font-size: 0.85rem;
    text-align: center;
  }
</style>
