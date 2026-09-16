<!--
  Watch It Bloom — hub preview. A real sequence's steps play through as real
  pictographs (PictographContainer over the sequence's own StepData, layered
  CSS crossfade = "the motion"), flowing into the REAL mandala that same
  sequence traces. One SequenceData feeds both sides, so the promise shown is
  the promise the game keeps. No second WebGL canvas on the hub — the 3D
  performer card already carries that; here the animation is the step strip.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import SequenceMandala from "$lib/shared/mandala/components/SequenceMandala.svelte";
  import { loadPreviewSequence } from "./preview-sequences";

  let { accent }: { accent: string } = $props();

  let sequence = $state<SequenceData | null>(null);
  let mandalaBox = $state<HTMLDivElement | undefined>();
  let mandalaSize = $state(120);

  onMount(() => {
    loadPreviewSequence(3).then((seq) => {
      sequence = seq;
    });
  });

  /* First four steps are plenty for the loop — the point is "motion", not
     the full phrase. */
  const steps = $derived(sequence ? sequence.steps.slice(0, 4) : []);

  $effect(() => {
    if (!mandalaBox) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      mandalaSize = Math.max(60, Math.floor(Math.min(width, height)));
    });
    observer.observe(mandalaBox);
    return () => observer.disconnect();
  });
</script>

<div class="stage" style="--accent: {accent}" aria-hidden="true">
  {#if sequence && steps.length > 0}
    <div class="motion-frame">
      {#each steps as step, i (i)}
        <div class="motion-step" class:first={i === 0} style="--step: {i}; --steps: {steps.length}">
          <PictographContainer
            pictographData={step}
            disableTransitions
            showTKA={false}
            showReversals={false}
            showNonRadialPoints={false}
            showTnD={false}
            showElemental={false}
            showPlacements={false}
            showHandPoints={false}
          />
        </div>
      {/each}
    </div>
    <span class="flow">→</span>
    <div class="mandala-side" bind:this={mandalaBox}>
      <SequenceMandala {sequence} mode="gallery" size={mandalaSize} />
    </div>
  {/if}
</div>

<style>
  .stage {
    position: absolute;
    inset: 0;
    container-type: size;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5cqi;
  }

  .motion-frame {
    position: relative;
    height: 74cqh;
    aspect-ratio: 1;
    border-radius: 10px;
    overflow: hidden;
    background: rgba(10, 10, 15, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  /* Steps play through in place — the strip IS the animation. */
  .motion-step {
    position: absolute;
    inset: 0;
    opacity: 0;
    animation: step-play calc(var(--steps) * 1.2s) linear infinite;
    animation-delay: calc(var(--step) * 1.2s);
  }

  .flow {
    font-size: 14cqh;
    color: var(--accent);
    animation: nudge 2.4s ease-in-out infinite;
  }

  .mandala-side {
    position: relative;
    height: 74cqh;
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: radial-gradient(
      circle,
      color-mix(in srgb, var(--accent) 14%, transparent),
      transparent 70%
    );
  }

  /* Each step owns a 1/N slice of the loop (tuned for 4 steps). */
  @keyframes step-play {
    0% { opacity: 0; }
    4% { opacity: 1; }
    22% { opacity: 1; }
    26% { opacity: 0; }
    100% { opacity: 0; }
  }

  @keyframes nudge {
    0%, 100% { transform: translateX(0); opacity: 0.7; }
    50% { transform: translateX(0.6cqi); opacity: 1; }
  }

  @media (prefers-reduced-motion: reduce) {
    .motion-step,
    .flow {
      animation: none;
    }

    .motion-step.first {
      opacity: 1;
    }
  }
</style>
