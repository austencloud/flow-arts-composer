<script lang="ts">
  import { onMount, onDestroy, untrack, type Snippet } from "svelte";
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import HandMotionPlayer from "$lib/features/learn/components/interactive/foundations/HandMotionPlayer.svelte";
  import { DEFAULT_VIEWER_CUSTOM_COLORS } from "$lib/shared/sequence-viewer/domain/viewer-custom-colors";
  import { reparentToInspector as reparentToSlot } from "$lib/shared/sequence-viewer/components/reparent-to-inspector";
  import { reducedMotion } from "$lib/shared/transitions/motion";
  import {
    createRenderActivityGate,
    renderGateTarget,
  } from "$lib/shared/render-gating/render-activity-gate";
  import {
    createTimingDirectionState,
    setTimingDirectionState,
  } from "./_state/timing-direction-state.svelte";

  let { children }: { children: Snippet } = $props();
  const playback = createTimingDirectionState(page.params.mode);
  setTimingDirectionState(playback);
  const gate = createRenderActivityGate({ name: "timing-direction-journey" });
  onDestroy(() => gate.dispose());
  onMount(() => {
    if (reducedMotion()) playback.playing = false;
  });

  $effect(() => {
    const slug = page.params.mode;
    if (slug) untrack(() => playback.select(slug));
  });

  $effect(() => {
    playback.pendingSeek.version;
    untrack(() => playback.runPendingSeek());
  });
</script>

<div use:renderGateTarget={gate}>
  {@render children()}
  <div class="player-parking">
    <!-- This player belongs to the route layout, not either page. Moving its
         host keeps the canvas, scrub position, and context-menu settings alive. -->
    <div
      class="shared-canvas"
      style:--mode-accent={playback.selected.motion.element.accentColor}
      use:reparentToSlot={playback.target}
    >
      <!-- The animation engine is stubbed out of the production SSR build
           (see SSR_STUBBED_SHARED_RENDER_PATHS), so the canvas mounts client-only. -->
      {#if browser}
        <HandMotionPlayer
          primaryPropColors={DEFAULT_VIEWER_CUSTOM_COLORS}
          sequence={playback.sequence}
          initialStep={playback.step}
          ariaLabel={playback.selected.article.name}
          showElementalGlyph
          externalPlaying={playback.playing}
          onExternalPlayingChange={(value) => (playback.playing = value)}
          onStepChange={playback.followStep}
          onSeekRef={playback.registerSeek}
          playbackGate={gate}
          framed={false}
        />
      {/if}
    </div>
  </div>
</div>

<style>
  .player-parking {
    display: none;
  }
  .shared-canvas {
    --sequence-seek-target-size: 48px;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 1px solid
      color-mix(in srgb, var(--mode-accent) 55%, var(--theme-stroke));
    border-radius: var(--radius-lg, 0.75rem);
    background: color-mix(
      in srgb,
      var(--mode-accent) 7%,
      var(--theme-panel-bg)
    );
    view-transition-name: timing-direction-canvas;
  }
  .shared-canvas :global(.progress-bar-container) {
    background: transparent;
  }
</style>
