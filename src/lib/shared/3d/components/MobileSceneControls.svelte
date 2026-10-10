<script lang="ts">
  import { onDestroy } from "svelte";
  import { getViewer3DContext } from "../context/viewer-3d-context";
  import BottomSheet from "./controls/BottomSheet.svelte";
  import MobileScenePerformerSheet from "./MobileScenePerformerSheet.svelte";
  import MobileSceneEverythingSheet from "./MobileSceneEverythingSheet.svelte";
  import type { ViewerControlSink } from "#lib/shared/sequence-viewer/domain/viewer-control-analytics.js";
  import type { PerformerEditSink } from "./controls/performer-hub-types";

  interface Props {
    showPlayback?: boolean;
    isPlaying?: boolean;
    onPlaybackToggle?: () => void;
    onStepForward?: () => void;
    onStepBackward?: () => void;
    onSettingChange?: ViewerControlSink;
    /** Forwarded to the performer sheet — see PerformerHubDetail's Props. */
    onPerformerEdit?: PerformerEditSink;
    /** Monotonic request from direct performer selection in the 3D scene. */
    openPerformerRequest?: number;
    /** Monotonic request to return the compact canvas to selection. */
    closePerformerRequest?: number;
    /** A host editor replaces either compact sheet. */
    closeSheetsRequest?: number;
    /** Lets a host make room for the active compact sheet without teaching
     *  this shared control surface about the host's surrounding layout. */
    onSheetChange?: (sheet: "performer" | "scene" | null) => void;
  }
  let {
    showPlayback = true,
    isPlaying = false,
    onPlaybackToggle = () => {},
    onStepForward = () => {},
    onStepBackward = () => {},
    onSettingChange,
    onPerformerEdit,
    openPerformerRequest = 0,
    closePerformerRequest = 0,
    closeSheetsRequest = 0,
    onSheetChange,
  }: Props = $props();

  type Sheet = "performer" | "everything" | null;
  const viewer = getViewer3DContext();
  let openSheet = $state<Sheet>(null);
  let lastOpenPerformerRequest = $state(openPerformerRequest);
  let lastClosePerformerRequest = $state(closePerformerRequest);
  let lastCloseSheetsRequest = $state(closeSheetsRequest);
  $effect(() => {
    if (closeSheetsRequest === lastCloseSheetsRequest) return;
    lastCloseSheetsRequest = closeSheetsRequest;
    openSheet = null;
  });

  function toggle(sheet: Exclude<Sheet, null>) {
    openSheet = openSheet === sheet ? null : sheet;
  }

  $effect(() => {
    const request = openPerformerRequest;
    if (request === lastOpenPerformerRequest) return;
    lastOpenPerformerRequest = request;
    openSheet = "performer";
  });

  $effect(() => {
    const request = closePerformerRequest;
    if (request === lastClosePerformerRequest) return;
    lastClosePerformerRequest = request;
    if (openSheet === "performer") openSheet = null;
  });

  let lastReportedSheet = $state<Sheet>(null);
  $effect(() => {
    const current = openSheet;
    if (current === lastReportedSheet) return;
    lastReportedSheet = current;
    onSheetChange?.(current === "everything" ? "scene" : current);
  });

  onDestroy(() => onSheetChange?.(null));
</script>

<!-- Sheets render above everything in the bar -->
<BottomSheet
  open={openSheet === "performer"}
  title="Performer"
  onClose={() => (openSheet = null)}
>
  <MobileScenePerformerSheet {onSettingChange} {onPerformerEdit} />
</BottomSheet>

<BottomSheet
  open={openSheet === "everything"}
  title="Scene & Controls"
  onClose={() => (openSheet = null)}
>
  <MobileSceneEverythingSheet {onSettingChange} />
</BottomSheet>

<div
  class="bar-cluster"
  data-sheet-open={openSheet !== null ? "true" : undefined}
>
  {#if showPlayback}
    <div class="playback-row">
      <button class="ctl" onclick={onStepBackward} aria-label="Previous step">
        <i class="fas fa-backward-step"></i>
      </button>
      <button
        class="ctl play"
        onclick={onPlaybackToggle}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        <i class="fas {isPlaying ? 'fa-pause' : 'fa-play'}"></i>
      </button>
      <button class="ctl" onclick={onStepForward} aria-label="Next step">
        <i class="fas fa-forward-step"></i>
      </button>
    </div>
  {/if}

  <div class="scene-action-row" aria-label="Scene editing">
    <button
      class="scene-action"
      aria-label="Focus avatar"
      disabled={viewer.performerManager.performers.length === 0}
      onclick={() => viewer.focusSelectedPerformers()}
    >
      <i class="fas fa-crosshairs" aria-hidden="true"></i>
      <span>Focus</span>
    </button>
    <button
      class="scene-action"
      class:active={openSheet === "performer"}
      aria-label="Performer controls"
      aria-pressed={openSheet === "performer"}
      onclick={() => toggle("performer")}
    >
      <i class="fas fa-user-group" aria-hidden="true"></i>
      <span>Performer</span>
    </button>

    <button
      class="scene-action"
      class:active={openSheet === "everything"}
      aria-label="Scene and controls"
      aria-pressed={openSheet === "everything"}
      onclick={() => toggle("everything")}
    >
      <i class="fas fa-sliders" aria-hidden="true"></i>
      <span>Scene</span>
    </button>
  </div>
</div>

<style>
  /* The parent .compact-controls layer spans the whole 3D workspace with
     pointer-events: none; this cluster reclaims the bottom-bar footprint. */
  .bar-cluster {
    position: absolute;
    right: 0;
    /* The workspace publishes the host's bottom chrome band when the host owns
       one taller than the viewer's own bar. */
    bottom: var(
      --scene-controls-bottom,
      max(4.75rem, calc(env(safe-area-inset-bottom) + 4.75rem))
    );
    left: 0;
    display: flex;
    justify-content: center;
    padding: 0 0.75rem;
    pointer-events: none;
    opacity: 1;
    transform: translateY(0);
    transition:
      opacity var(--transition-fast),
      transform var(--transition-fast);
  }

  .bar-cluster[data-sheet-open="true"] {
    opacity: 0;
    transform: translateY(0.5rem);
  }

  .bar-cluster > * {
    pointer-events: auto;
  }

  @media (max-height: 34rem) {
    .bar-cluster {
      right: auto;
      left: max(0.5rem, env(safe-area-inset-left));
      justify-content: flex-start;
      padding: 0;
    }
  }

  .playback-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }
  .scene-action-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    width: min(100%, 24rem);
    padding: 0.375rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 1rem;
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, #0c0e16) 94%,
      transparent
    );
    box-shadow: 0 0.75rem 2.5rem rgba(0, 0, 0, 0.45);
  }

  .ctl {
    min-width: 44px;
    min-height: 44px;
    border-radius: 50%;
    background: rgba(20, 22, 32, 0.78);
    backdrop-filter: blur(20px) saturate(140%);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.85);
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
  }

  .scene-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-width: 7.5rem;
    min-height: 44px;
    padding: 0.625rem 0.875rem;
    border: 1px solid transparent;
    border-radius: 0.75rem;
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.76));
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    cursor: pointer;
  }
  .ctl.play {
    min-width: 52px;
    min-height: 52px;
    font-size: 18px;
    background: rgba(255, 255, 255, 0.15);
  }
  .scene-action.active {
    background: color-mix(
      in srgb,
      var(--theme-accent, #4a9eff) 22%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #4a9eff) 55%,
      transparent
    );
    color: color-mix(in srgb, var(--theme-accent, #4a9eff) 70%, #fff);
  }
  .ctl:hover,
  .scene-action:hover,
  .ctl:focus-visible,
  .scene-action:focus-visible,
  .ctl:active,
  .scene-action:active {
    background: rgba(255, 255, 255, 0.22);
  }
  .ctl:focus-visible,
  .scene-action:focus-visible {
    outline: 2px solid
      color-mix(in srgb, var(--theme-accent, #4a9eff) 72%, #fff);
    outline-offset: 2px;
  }

  @media (max-width: 24rem) {
    .scene-action {
      flex: 1;
      min-width: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .bar-cluster {
      transition: none;
    }
  }
</style>
