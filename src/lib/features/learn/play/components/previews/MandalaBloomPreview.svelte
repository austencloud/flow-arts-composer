<!--
  Mandala Match — hub preview. A REAL mandala: the shared SequenceMandala
  rendering a real catalog sequence (the same pool the game quizzes from),
  with the gentle built-in breathe animation. Sized by ResizeObserver — the
  same technique MandalaMatchGame uses — because SequenceMandala takes a
  numeric pixel size. Until data arrives the stage keeps its reserved accent
  glow; reduced-motion renders it static (animate=false).
-->
<script lang="ts">
  import { onMount } from "svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import SequenceMandala from "#lib/shared/mandala/components/SequenceMandala.svelte";
  import { loadPreviewSequence } from "./preview-sequences";

  let { accent }: { accent: string } = $props();

  let sequence = $state<SequenceData | null>(null);
  let reducedMotion = $state(false);
  let stageEl = $state<HTMLDivElement | undefined>();
  let stageSize = $state(200);

  onMount(() => {
    reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // A different index than the performer card so the two real-content
    // cards don't show the same sequence side by side.
    loadPreviewSequence(1).then((seq) => {
      sequence = seq;
    });
  });

  $effect(() => {
    if (!stageEl) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      stageSize = Math.max(80, Math.floor(Math.min(width, height)));
    });
    observer.observe(stageEl);
    return () => observer.disconnect();
  });
</script>

<div class="stage" style="--accent: {accent}" aria-hidden="true">
  <div class="bloom"></div>
  <div class="mandala-box" bind:this={stageEl}>
    {#if sequence}
      <SequenceMandala
        {sequence}
        mode="gallery"
        size={stageSize}
        animate={!reducedMotion}
        animatePeriod={10}
        animateMin={110}
        animateMax={170}
        animateEasing="breathe"
        animateRotation={0}
      />
    {/if}
  </div>
</div>

<style>
  .stage {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .bloom {
    position: absolute;
    inset: 12%;
    border-radius: 50%;
    background: radial-gradient(
      circle,
      color-mix(in srgb, var(--accent) 14%, transparent),
      transparent 68%
    );
    filter: blur(4px);
  }

  .mandala-box {
    position: relative;
    height: 92%;
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
