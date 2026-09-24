<!--
  RecordSceneChrome.svelte

  The one way to film the 3D scene. A take is a performance on this stage —
  the camera moves as you steer it, or orbits on its own — so the control
  lives here, beside what it records, and not behind Share or the Export
  page. Share hands over the finished film.

  The camera mode sits inline beside Record as a two-way toggle: a menu
  behind a gear hid a choice that decides what the take looks like.
-->
<script lang="ts">
  import type { CameraChoreographyState } from "$lib/shared/sequence-viewer/camera-choreography/state.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import {
    reportViewerControlChange,
    type ViewerControlSink,
  } from "../../domain/viewer-control-analytics";

  interface Props {
    isExporting: boolean;
    canvasReady: boolean;
    onExport: () => void;
    choreography: CameraChoreographyState;
    onSettingChange?: ViewerControlSink;
  }

  let {
    isExporting,
    canvasReady,
    onExport,
    choreography,
    onSettingChange,
  }: Props = $props();

  type CameraMode = "free" | "auto-orbit";

  const cameraModeOptions: {
    value: CameraMode;
    label: string;
    icon: string;
  }[] = [
    { value: "free", label: "Free", icon: "fas fa-hand-paper" },
    { value: "auto-orbit", label: "Orbit", icon: "fas fa-sync-alt" },
  ];

  const currentMode = $derived<CameraMode>(
    choreography?.activePresetId === "auto-orbit" ? "auto-orbit" : "free"
  );

  const disabled = $derived(isExporting || !canvasReady);

  function handleModeSelect(mode: CameraMode) {
    const previous = currentMode;
    if (mode === previous) return;
    choreography?.setPresetId(mode);
    reportViewerControlChange(
      onSettingChange,
      "record_scene",
      "camera_mode",
      previous,
      mode
    );
  }
</script>

<div class="chrome-root">
  <div class="bottom-right">
    <div class="camera-mode">
      <SegmentedControl
        options={cameraModeOptions}
        value={currentMode}
        onchange={handleModeSelect}
        color="accent"
        size="sm"
        ariaLabel="Recording camera"
        semantics="radiogroup"
      />
    </div>
    <button
      type="button"
      class="record"
      {disabled}
      onclick={onExport}
      aria-label={isExporting
        ? "Recording in progress"
        : !canvasReady
          ? "Preparing"
          : "Record scene"}
    >
      {#if !canvasReady}
        <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        <span>Preparing...</span>
      {:else if isExporting}
        <i class="fas fa-circle pulse" aria-hidden="true"></i>
        <span>Recording</span>
      {:else}
        <span class="dot" aria-hidden="true"></span>
        <span>Record Scene</span>
      {/if}
    </button>
  </div>
</div>

<style>
  .chrome-root {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 5;
  }

  .bottom-right {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    pointer-events: auto;
    /* The host sets --record-scene-right / --record-scene-bottom to clear
       the scene control rail (desktop) or the compact action bar
       (SequenceViewerShell owns both offsets). */
    bottom: var(--record-scene-bottom, 80px);
    right: var(--record-scene-right, 12px);
  }

  /* The toggle sits over the live scene, so it carries the same dark glass
     as the scene rail beside it; bare segments vanish into a bright sky. */
  .camera-mode {
    padding: 2px;
    border-radius: 999px;
    background: rgba(12, 12, 20, 0.72);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    backdrop-filter: blur(8px);
  }

  .record {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: var(--min-touch-target, 44px);
    padding: 0 20px;
    border-radius: 999px;
    background: linear-gradient(
      180deg,
      rgba(239, 68, 68, 0.95) 0%,
      rgba(220, 38, 38, 0.95) 100%
    );
    border: 1px solid rgba(239, 68, 68, 0.55);
    box-shadow:
      0 6px 20px rgba(239, 68, 68, 0.35),
      0 0 0 1px rgba(0, 0, 0, 0.4);
    color: #fff;
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    letter-spacing: 0.02em;
    cursor: pointer;
    transition: filter var(--duration-fast, 150ms) ease;
  }

  .record:hover:not(:disabled) {
    filter: brightness(1.08);
  }

  .record:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }

  .record:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 0 6px rgba(255, 255, 255, 0.6);
  }

  .pulse {
    animation: pulse 1.2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }

  @media (max-width: 600px) {
    .bottom-right {
      /* Below 600px the scene control workspace is always compact (no
         rail on the right edge), so the right offset is never set; the
         bottom offset still lifts the controls above the compact action bar. */
      bottom: var(--record-scene-bottom, 80px);
      right: 8px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .record {
      transition: none;
    }
    .pulse {
      animation: none;
    }
  }
</style>
