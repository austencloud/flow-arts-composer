<!--
  Trace the Card — hub preview. Real content acting out the real mechanic:
  one real catalog sequence shown BOTH ways — its choreo card on the left,
  the mandala it traces on the right — with the accent flowing card → bloom.
  The pairing is genuine (same SequenceData feeds both), which is the whole
  promise of the game.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import ChoreoCard from "#lib/features/choreo-card/components/ChoreoCard.svelte";
  import SequenceMandala from "#lib/shared/mandala/components/SequenceMandala.svelte";
  import { loadPreviewSequence } from "./preview-sequences";

  let { accent }: { accent: string } = $props();

  let sequence = $state<SequenceData | null>(null);
  let mandalaBox = $state<HTMLDivElement | undefined>();
  let mandalaSize = $state(120);

  onMount(() => {
    loadPreviewSequence(2).then((seq) => {
      sequence = seq;
    });
  });

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
  {#if sequence}
    <div class="card-side">
      <ChoreoCard {sequence} showQRCodes={false} />
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
    padding: 5cqh 4cqi;
  }

  .card-side {
    height: 88cqh;
    aspect-ratio: 5 / 7;
    display: flex;
    align-items: center;
    pointer-events: none;
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

  @keyframes nudge {
    0%, 100% { transform: translateX(0); opacity: 0.7; }
    50% { transform: translateX(0.6cqi); opacity: 1; }
  }

  @media (prefers-reduced-motion: reduce) {
    .flow {
      animation: none;
    }
  }
</style>
