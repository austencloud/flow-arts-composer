<!--
  ResidentPlayerHost

  Renders the one resident player (resident-player.svelte.ts) and moves it into
  whichever stage has claimed it. Mounted once by MarketingChrome, because that
  is the layer that survives navigating between / and /composer: the homepage
  sits outside the (public) route group, so that group's layout does not.

  The two slots are static children of the parking box, never the top level of
  a block. Svelte removes a block by walking its top-level nodes as siblings, so
  a node moved into another page would make that walk delete that page's nodes.
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import LazyMount from "#lib/shared/components/LazyMount.svelte";
  import { markLanding } from "#lib/shared/performance/landing-marks.js";
  import {
    loadHeroNotationRail,
    loadHeroPlayer,
  } from "../services/hero-player-chunks";
  import {
    moveResidentNode,
    residentPlayer as resident,
    type ResidentClaim,
  } from "../services/resident-player.svelte";

  let parking = $state<HTMLElement>();
  let playerSlot = $state<HTMLElement>();
  let railSlot = $state<HTMLElement>();

  // Registered during init so it is in place before any page's claim effect,
  // whichever order the chrome and the page mount in.
  const detachHost =
    typeof window === "undefined" ? null : resident.attachHost();

  // Copied out of the claim rather than read through it, so a parked player
  // never reads the reactive props of a page that no longer exists.
  let playerProps = $state.raw<Record<string, unknown>>({});
  let railProps = $state.raw<Record<string, unknown>>({});
  let latest = $state.raw<ResidentClaim | null>(null);
  let playerRequested = $state(false);
  let railRequested = $state(false);

  function handleCanvasReady(): void {
    resident.reportCanvasReady();
    markLanding("hero:canvas-ready");
  }

  $effect.pre(() => {
    const claim = resident.current;
    if (!resident.alive) {
      latest = null;
      playerRequested = false;
      railRequested = false;
      return;
    }
    if (!claim) return;
    latest = claim;
    // Each stage asks for its chunk once; the mounted player stays either way.
    if (claim.playerActive) playerRequested = true;
    if (claim.railActive && resident.canvasReady) railRequested = true;

    const fromPage = claim.playerProps;
    playerProps = {
      ...fromPage,
      visibilityManagerOverride: fromPage.showWordHeader
        ? resident.manager
        : undefined,
      onCanvasInitialized: handleCanvasReady,
      onStepChange: fromPage.onStepChange ? resident.reportStep : undefined,
    };
    const sequence = claim.railProps.sequence as { id?: string } | null;
    railProps = {
      ...claim.railProps,
      currentStep: resident.stepFor(sequence?.id ?? null),
    };
  });

  const gatedPlayerProps = $derived({
    ...playerProps,
    playbackAllowed: resident.playbackAllowed,
    resumeWhenPlaybackAllowed: true,
  });

  // The stage's size while it had one, so parking never tells the engine to
  // resize its canvas and clear the frame it would come back to.
  let parkedWidth = $state(0);
  let parkedHeight = $state(0);
  $effect(() => {
    const slot = playerSlot;
    if (!slot) return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry?.contentRect;
      if (!box || box.width === 0 || box.height === 0) return;
      parkedWidth = box.width;
      parkedHeight = box.height;
    });
    observer.observe(slot);
    return () => observer.disconnect();
  });

  $effect(() => {
    if (!parking || !playerSlot || !railSlot) return;
    const claim = resident.current;
    if (claim) {
      moveResidentNode(playerSlot, claim.stage);
      moveResidentNode(railSlot, claim.railStage ?? parking);
      return;
    }
    // A released player waits where it is: the next page usually claims it in
    // this same navigation, and a stop in the parking box would only add a move.
    if (resident.phase === "releasing") return;
    moveResidentNode(playerSlot, parking);
    moveResidentNode(railSlot, parking);
  });

  onDestroy(() => {
    detachHost?.();
    // The slots may sit inside a page's stage, which can outlive this host for
    // the rest of the teardown. Take them with it.
    playerSlot?.remove();
    railSlot?.remove();
  });
</script>

<div
  class="resident-parking"
  bind:this={parking}
  style:width={parkedWidth ? `${parkedWidth}px` : undefined}
  style:height={parkedHeight ? `${parkedHeight}px` : undefined}
>
  <div
    class="resident-slot player"
    bind:this={playerSlot}
    data-resident-slot="player"
    data-resident-claimed={resident.current ? "" : undefined}
  >
    {#if resident.alive}
      <LazyMount
        loader={loadHeroPlayer}
        active={playerRequested}
        placeholder={latest?.placeholder}
        error={latest?.playerError}
        onStatusChange={(status) => {
          if (status === "loaded") markLanding("hero:player-loaded");
          resident.reportPlayerStatus(status);
        }}
        props={gatedPlayerProps}
      />
    {/if}
  </div>
  <div
    class="resident-slot rail"
    bind:this={railSlot}
    data-resident-slot="rail"
    data-resident-claimed={resident.current?.railStage ? "" : undefined}
  >
    {#if resident.alive}
      <LazyMount
        loader={loadHeroNotationRail}
        active={railRequested}
        error={latest?.railError}
        onStatusChange={resident.reportRailStatus}
        props={railProps}
      />
    {/if}
  </div>
</div>

<style>
  /* Out of sight and out of the page's layout. Visibility, not display: the
     player keeps its measured box, so nothing rebuilds when it comes back. */
  .resident-parking {
    position: fixed;
    top: 0;
    left: 0;
    visibility: hidden;
    pointer-events: none;
  }
  .resident-slot.player {
    position: absolute;
    inset: 0;
  }
  .resident-slot.rail {
    width: 100%;
    height: 100%;
  }
</style>
