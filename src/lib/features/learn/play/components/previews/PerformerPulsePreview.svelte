<!--
  Read the Performer — hub preview. A REAL 3D example: the actual
  PerformerRig playing a real catalog sequence (PerformerStageLite, the
  game's stage minus its chrome). Three.js is lazy-imported and only once
  the card is near the viewport, so the hub route stays light; offscreen the
  loop pauses instead of unmounting. Until the sequence and chunk arrive the
  stage holds its reserved accent glow — no shift, no spinner.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import type { Component } from "svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { loadPreviewSequence } from "./preview-sequences";

  let { accent }: { accent: string } = $props();

  let StageLite = $state<Component<{ sequence: SequenceData; active?: boolean }> | null>(null);
  let sequence = $state<SequenceData | null>(null);
  let nearViewport = $state(false);
  let visible = $state(true);
  let reducedMotion = $state(false);
  let root = $state<HTMLDivElement | undefined>();

  onMount(() => {
    reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visible = entry.isIntersecting;
          if (entry.isIntersecting) nearViewport = true;
        }
      },
      { rootMargin: "200px" }
    );
    if (root) io.observe(root);
    return () => io.disconnect();
  });

  // Lazy chunk + real data, both gated on the card approaching the viewport.
  $effect(() => {
    if (!nearViewport || StageLite) return;
    import("./PerformerStageLite.svelte").then((m) => {
      StageLite = m.default;
    });
    loadPreviewSequence(0).then((seq) => {
      sequence = seq;
    });
  });
</script>

<div class="stage" bind:this={root} style="--accent: {accent}" aria-hidden="true">
  {#if StageLite && sequence}
    <StageLite {sequence} active={visible && !reducedMotion} />
  {/if}
</div>

<style>
  .stage {
    position: absolute;
    inset: 0;
  }
</style>
