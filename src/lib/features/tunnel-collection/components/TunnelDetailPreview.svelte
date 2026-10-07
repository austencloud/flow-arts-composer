<!--
  TunnelDetailPreview.svelte — a live, in-page reproduction of a saved tunnel.

  Mounts the real kaleidoscope renderer (TunnelArtView) with fully per-instance
  state. The saved sequence reconstruction restores its start pose, and an
  authored composition stays attached so this preview performs the same cast as
  the viewer. Merely previewing a saved tunnel must not mutate the user's live
  viewer state.
-->
<script lang="ts">
  import TunnelArtView from "$lib/shared/sequence-viewer/tunnel/TunnelArtView.svelte";
  import { TunnelViewController } from "$lib/shared/sequence-viewer/tunnel/tunnel-view-controller.svelte";
  import { createEffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
  import { setEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import { AnimationVisibilityStateManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import { createAnimationSettingsState } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
  import { normalizePropLook } from "$lib/shared/pictograph/prop/domain/prop-look";
  import type { ViewerPlaybackState } from "$lib/shared/sequence-viewer/domain/viewer-prop-groups";
  import type { CollectedTunnel } from "../domain/tunnel-collection-types";
  import { collectedTunnelViewerSequence } from "../domain/collected-tunnel-source";

  const { tunnel }: { tunnel: CollectedTunnel } = $props();

  // Autoplaying motion needs a user-reachable pause (WCAG 2.2.2) — the viewer
  // has a transport; this gallery preview gets its own toggle.
  let playing = $state(true);
  // Unwrap the $state proxy from the collection store into plain data ONCE —
  // structuredClone (inside createEffectsConfigState) throws DataCloneError on
  // Svelte 5 state proxies, and downstream transforms shouldn't see proxies
  // either. The record is immutable while previewing, so a one-time deep
  // snapshot is safe.
  const data = $state.snapshot(tunnel) as CollectedTunnel;
  const snap = data.snapshot;

  // Per-instance effects context (NEVER the global; persist:false so it can't read
  // from or write to the shared tka_effects_config key).
  const effects = createEffectsConfigState(snap.effects, { persist: false });
  setEffectsConfigContext(effects);

  const visibility = new AnimationVisibilityStateManager({ ephemeral: true });
  visibility.setGridMode(snap.tunnel.gridVisible ? "8point" : "none");
  visibility.setEffortPreset(snap.effort);
  visibility.setPathPolicy({
    pathShape: snap.paths.pathShape,
    motionAwarePaths: snap.paths.motionAwarePaths,
  });
  visibility.setVisibility("leftPathLines", snap.paths.leftPathLines);
  visibility.setVisibility("rightPathLines", snap.paths.rightPathLines);

  const previewAnimationSettings = createAnimationSettingsState({
    ephemeral: true,
  });
  previewAnimationSettings.updateSettings({ trail: snap.trailRender });

  // Use the same saved-source owner as Open in Viewer. Rebuilding from only
  // `steps` dropped the start pose at the loop boundary, and omitting the
  // composition made authored performers revert to generated lead copies.
  const sequence = collectedTunnelViewerSequence(data);
  const controller = new TunnelViewController({
    getSequence: () => sequence,
    getComposition: () => data.composition ?? null,
    initialViewState: snap.tunnel,
    persistViewState: false,
    visibilityManager: visibility,
  });
  controller.active = true;

  // Minimal stub playback: TunnelArtView only reads
  // playback.animationState.sequenceData, and falls back to the `sequence` prop
  // when it's undefined — which is exactly what we want here.
  const playback = {
    animationState: { sequenceData: undefined },
  } as unknown as ViewerPlaybackState;
</script>

<div class="preview-stage">
  <div class="art" role="img" aria-label="Live animated preview of {data.name}">
    <TunnelArtView
      {sequence}
      {playback}
      {controller}
      bpm={snap.playback.bpm}
      leftPropType={snap.props.leftPropType}
      rightPropType={snap.props.rightPropType}
      leftBuugengFlipped={snap.props.leftBuugengFlipped}
      rightBuugengFlipped={snap.props.rightBuugengFlipped}
      propLook={normalizePropLook(snap.props.propLook)}
      animationSettingsState={previewAnimationSettings}
      visibilityManager={visibility}
      bind:playing
      stageFit="contain"
    />
  </div>
  <button
    type="button"
    class="pause-toggle"
    aria-pressed={!playing}
    aria-label={playing ? "Pause preview" : "Play preview"}
    onclick={() => (playing = !playing)}
  >
    <i class="fas {playing ? 'fa-pause' : 'fa-play'}" aria-hidden="true"></i>
  </button>
</div>

<style>
  .preview-stage {
    position: relative;
    /* Fit the square to BOTH the container's width AND height (100cqmin), so the
       tunnel never clips top/bottom or overflows onto the controls — robust at
       any aspect ratio (tiny phone, Z Fold near-square, 4K). The host
       .detail-preview is `container-type: size`. Replaces max-width:
       min(100%, 80vh), which ignored available height and let the square outgrow
       its slot on short / near-square viewports. */
    width: min(100cqw, 100cqh);
    height: min(100cqw, 100cqh);
    max-width: 100%;
    max-height: 100%;
    background: #000;
    border-radius: 12px;
    overflow: hidden;
    /* Ambient accent glow lifts the stage off the page. */
    box-shadow:
      0 0 0 1px var(--theme-stroke, rgba(255, 255, 255, 0.08)),
      0 12px 60px
        color-mix(in srgb, var(--theme-accent, #22d3ee) 14%, transparent);
  }

  .art {
    position: absolute;
    inset: 0;
  }

  .pause-toggle {
    position: absolute;
    right: 12px;
    bottom: 12px;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.55);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    color: rgba(255, 255, 255, 0.85);
    font-size: 14px;
    cursor: pointer;
    backdrop-filter: blur(4px);
    transition: all var(--duration-fast, 150ms) var(--ease-out, ease);
  }
  @media (hover: hover) {
    .pause-toggle:hover {
      background: rgba(0, 0, 0, 0.75);
      border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
      color: white;
    }
  }
  .pause-toggle:focus-visible {
    outline: 2px solid var(--theme-accent, #22d3ee);
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .pause-toggle {
      transition: none;
    }
  }
</style>
