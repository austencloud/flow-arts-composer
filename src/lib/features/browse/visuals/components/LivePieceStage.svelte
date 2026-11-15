<!--
  LivePieceStage.svelte — one piece in a box, still first. The stored poster
  fills the box (VisualStill); the live piece (the real tunnel or mandala
  renderer, the same ones the piece page runs) mounts behind it and fades in
  over it once it has drawn its first frame. DualSourceCrossfade owns that
  hand-off, as it does for Create's poster-to-player swap, so a heavy source is
  ready before it is shown and the box is never blank.

  Used by the front-page stage and by the piece page. The host owns the pause
  control and passes `playing`. `stillOnly` keeps the still and mounts no
  renderer at all (reduced motion). `hold` keeps the still up even after the
  live piece is ready (the front stage gave up waiting for it).

  Key this component by the piece: a new piece is a new mount, and the host
  swaps pieces through Crossfade so only one live renderer exists at a time.
-->
<script lang="ts">
  import type { Component } from "svelte";
  import type { PublicArtifactEnvelope } from "#lib/shared/artifact-revisions/domain/public-artifact.js";
  import DualSourceCrossfade from "#lib/shared/components/DualSourceCrossfade.svelte";
  import type { CollectedTunnel } from "#lib/features/tunnel-collection/domain/tunnel-collection-types.js";
  import type { MandalaPublicPayload } from "#lib/features/mandala/tabs/collection/domain/mandala-public-revision.js";
  import type { VisualPiece } from "../services/visual-piece-loader.js";
  import VisualStill from "./VisualStill.svelte";

  let {
    envelope,
    piece,
    playing = $bindable(true),
    stillOnly = false,
    hold = false,
    onReady,
  }: {
    /** The list's envelope: it carries the poster before any detail loads. */
    envelope: PublicArtifactEnvelope;
    /** The loaded detail, or null while it is still on its way. */
    piece: VisualPiece | null;
    playing?: boolean;
    stillOnly?: boolean;
    hold?: boolean;
    /** The live piece drew its first frame (it may still be held back). */
    onReady?: () => void;
  } = $props();

  const kind = $derived(envelope.artifactType === "mandala" ? "mandala" : "tunnel");

  // Both renderers are heavy: each loads only when a piece of its kind is
  // about to play, and stays for the rest of the visit.
  type TunnelRenderer = Component<{
    tunnel: CollectedTunnel;
    playing?: boolean;
    showPause?: boolean;
    framed?: boolean;
    onReady?: () => void;
  }>;
  type MandalaRenderer = Component<{
    payload: MandalaPublicPayload;
    playing?: boolean;
    onReady?: () => void;
  }>;
  let TunnelDetailPreview = $state<TunnelRenderer | null>(null);
  let MandalaDetailPreview = $state<MandalaRenderer | null>(null);

  $effect(() => {
    if (stillOnly || !piece) return;
    if (piece.kind === "tunnel" && !TunnelDetailPreview) {
      void import(
        "#lib/features/tunnel-collection/components/TunnelDetailPreview.svelte"
      ).then((loaded) => (TunnelDetailPreview = loaded.default as TunnelRenderer));
    } else if (piece.kind === "mandala" && !MandalaDetailPreview) {
      void import("./MandalaDetailPreview.svelte").then(
        (loaded) => (MandalaDetailPreview = loaded.default as MandalaRenderer)
      );
    }
  });

  let ready = $state(false);

  function liveReady() {
    ready = true;
    onReady?.();
  }

  const showLive = $derived(ready && !hold && !stillOnly);
</script>

{#snippet still()}
  <VisualStill src={envelope.posterUrl} {kind} shape="fill" flush />
{/snippet}

{#snippet live()}
  <div class="live">
    {#if !stillOnly && piece?.kind === "tunnel" && TunnelDetailPreview}
      <TunnelDetailPreview
        tunnel={piece.tunnel}
        bind:playing
        showPause={false}
        framed={false}
        onReady={liveReady}
      />
    {:else if !stillOnly && piece?.kind === "mandala" && MandalaDetailPreview}
      <MandalaDetailPreview
        payload={piece.mandala}
        {playing}
        onReady={liveReady}
      />
    {/if}
  </div>
{/snippet}

<div class="live-stage">
  <DualSourceCrossfade
    active={showLive ? "second" : "first"}
    first={still}
    second={live}
  />
</div>

<style>
  .live-stage {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }

  .live {
    width: 100%;
    height: 100%;
    background: var(--surface-panel-floor);
  }
</style>
