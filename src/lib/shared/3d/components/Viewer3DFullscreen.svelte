<script lang="ts">
  /**
   * Viewer3DFullscreen
   *
   * Full-screen surface for the 3D viewer. It takes over the viewport so the
   * canvas has maximum real estate while the user watches a sequence in 3D.
   *
   * Floating top and bottom bars keep the UI out of the canvas until the user
   * needs it. The same responsive control panel serves phones through 4K.
   *
   * The parent must have called setViewer3DContext() before mounting this.
   */

  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import Viewer3DCanvas from "./Viewer3DCanvas.svelte";
  import type { SceneControlLayout } from "../domain/scene-control-layout";
  import { onMount, type Snippet } from "svelte";
  import { createEffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
  import { setEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import { createScene3DRenderState } from "$lib/shared/3d/scene-features/state/scene-3d-render-state.svelte";
  import { setScene3DRenderContext } from "$lib/shared/3d/scene-features/state/scene-3d-render-context";
  import SceneChromeButton from "./controls/SceneChromeButton.svelte";
  import { warmSelectedSceneAssets } from "../scene-boot/scene-prefetch";
  import type { PlaybackMode } from "$lib/shared/timeline/unified-playback-context";

  // Canonical effects config - single source of truth for both 2D canvas
  // and 3D viewer effect parameters. One-time migration from the old VM
  // localStorage key happens inside createEffectsConfigState.
  const effectsConfigState = createEffectsConfigState();
  setEffectsConfigContext(effectsConfigState);

  // Scene-wide 3D render modifiers (motion blur + speed lines).
  // Separate from per-tip EffectsConfig because these are whole-scene passes.
  const scene3DRenderState = createScene3DRenderState();
  setScene3DRenderContext(scene3DRenderState);

  interface Props {
    sequenceData: SequenceData | null;
    currentStep: number;
    isPlaying: boolean;
    bpm: number;
    word: string | null;
    /** A stage the host authored, in metres — see Viewer3DScene. */
    stageExtent?: { width: number; depth: number } | null;
    cameraFov?: number;
    leftPropType?: string | null;
    rightPropType?: string | null;
    onClose?: () => void;
    onPlaybackToggle: () => void;
    isLooping?: boolean;
    onLoopToggle?: () => void;
    onBpmChange: (bpm: number) => void;
    onProgressBarSeek?: (targetStep: number) => void;
    playbackMode?: PlaybackMode;
    onPlaybackModeChange?: (mode: PlaybackMode) => void;
    onSystemPlaybackChange?: (
      playing: boolean,
      source: "system_3d_loading"
    ) => void;
    onSceneReadyChange?: (ready: boolean) => void;
    /** Imported characters can opt into the calibrated palm attachment. */
    weldPerformerGrip?: boolean;
    enablePerformerLocomotion?: boolean;
    initialRevealMode?: "gated" | "streaming";
    initialRevealDeferredFeatures?: readonly string[];
    /** Immersive toggle. Receives the overlay root for native fullscreen. */
    immersive?: boolean;
    onToggleImmersive?: (host: HTMLElement | null) => void;
    /** Keep the surface inside its module workspace instead of covering the app. */
    contained?: boolean;
    onChangeSequence?: () => void;
    onExport?: () => void;
    exportBusy?: boolean;
    /** Keep the environment and camera visible without a loaded sequence. */
    renderEmptyScene?: boolean;
    /** Keep reserved rigs mounted while rendering only this many performers. */
    visiblePerformerCount?: number;
    /** Resolved per-performer step for hosts whose lanes run independent clocks. */
    performerSteps?: readonly (number | null | undefined)[] | null;
    /** Host world geometry rendered in the performer coordinate frame. */
    worldChildren?: Snippet;
    /** Host commands added to the left of the HUD's command bar. */
    hudActions?: Snippet;
    /** Host editor shares the scene inspector's space and dismissal behavior. */
    hostPanel?: Snippet<[() => void, boolean]>;
    hostPanelTitle?: string;
    hostPanelOpen?: boolean;
    /**
     * Host chrome layered over the canvas — a transport, a timeline, a chart.
     * It sits below the scene controls, so a host that reserves space with
     * `sceneControlsBottomOffset` keeps the rail clear of it.
     */
    overlayChildren?: Snippet;
    /**
     * Suppress the canvas's own transport and step strip, for a host that owns
     * the timeline itself. Without it the surface shows two timelines.
     */
    hideCanvasOverlays?: boolean;
    /** Room reserved below the rail for host chrome such as a timeline. */
    sceneControlsBottomOffset?: string;
    /** Room reserved at the stage's top-left for host chrome. */
    sceneControlsLeftOffset?: string;
    /** Hosts whose artifact is a document, not a look, turn saving off. */
    allowSaveScene?: boolean;
    /**
     * Hosts can temporarily quiet every editing affordance while the canvas
     * remains mounted. The Stage starter uses this during its empty-stage
     * setup so the user meets one decision at a time.
     */
    showSceneChrome?: boolean;
    /** Compact control sheets can ask a document host to make room around the
     *  shared viewer without coupling the viewer to that host's layout. */
    onCompactSceneSheetChange?: (sheet: "performer" | "scene" | null) => void;
  }

  let {
    sequenceData,
    currentStep,
    isPlaying,
    bpm,
    word,
    stageExtent = null,
    leftPropType = null,
    rightPropType = null,
    onClose,
    onPlaybackToggle,
    isLooping,
    onLoopToggle,
    onBpmChange,
    onProgressBarSeek,
    playbackMode,
    onPlaybackModeChange,
    onSystemPlaybackChange,
    onSceneReadyChange,
    weldPerformerGrip = false,
    enablePerformerLocomotion = true,
    initialRevealMode = "gated",
    initialRevealDeferredFeatures = [],
    immersive = false,
    onToggleImmersive,
    contained = false,
    onChangeSequence,
    onExport,
    exportBusy = false,
    renderEmptyScene = false,
    cameraFov,
    visiblePerformerCount,
    performerSteps = null,
    worldChildren,
    hudActions,
    hostPanel,
    hostPanelTitle,
    hostPanelOpen = $bindable(false),
    overlayChildren,
    hideCanvasOverlays = false,
    sceneControlsBottomOffset,
    sceneControlsLeftOffset,
    allowSaveScene = true,
    showSceneChrome = true,
    onCompactSceneSheetChange,
  }: Props = $props();

  let hostEl = $state<HTMLElement | null>(null);
  type SceneControlWorkspaceComponent =
    typeof import("./controls/SceneControlWorkspace.svelte").default;
  type WordGlyphComponent =
    typeof import("$lib/shared/choreo-card/components/TKAWordGlyph.svelte").default;

  let SceneControls = $state<SceneControlWorkspaceComponent | null>(null);
  let WordGlyph = $state<WordGlyphComponent | null>(null);
  let sceneControlLayout = $state<SceneControlLayout>({
    presentation: "overlay",
    panelWidth: 520,
    reservedWidth: 0,
  });
  const reservedSceneWidth = $derived(
    immersive || !showSceneChrome ? 0 : sceneControlLayout.reservedWidth
  );

  // The canvas is the product on this route. Controls and notation are useful
  // once it is visible, but neither should hold the first scene frame hostage.
  onMount(() => {
    // Shared decoders and the selected environment's models, warmed on idle so
    // a scene switch inside this surface reads them from cache.
    warmSelectedSceneAssets();

    let active = true;
    void import("./controls/SceneControlWorkspace.svelte").then(
      ({ default: component }) => {
        if (active) SceneControls = component;
      }
    );
    void import("$lib/shared/choreo-card/components/TKAWordGlyph.svelte").then(
      ({ default: component }) => {
        if (active) WordGlyph = component;
      }
    );
    return () => {
      active = false;
    };
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- Backdrop tap-to-exit is a redundant convenience; the immersive toggle button (below) is keyboard-accessible. -->
<div
  class="viewer-3d-fullscreen"
  class:immersive
  class:contained
  bind:this={hostEl}
  onclick={immersive ? () => onToggleImmersive?.(hostEl) : undefined}
>
  <div
    class="viewer-hud"
    class:hidden={immersive || !showSceneChrome}
    aria-hidden={immersive || !showSceneChrome ? true : undefined}
    inert={immersive || !showSceneChrome ? true : undefined}
  >
    {#if word && WordGlyph}
      <span class="word-label"><WordGlyph {word} height={14} darkMode /></span>
    {/if}

    <div class="scene-command-bar" aria-label="3D Studio commands">
      <div class="command-group">
        {@render hudActions?.()}
        {#if onChangeSequence}
          <SceneChromeButton
            icon="fa-folder-open"
            label="Change sequence"
            tooltipSide="bottom"
            onclick={(event) => {
              event.stopPropagation();
              onChangeSequence();
            }}
          />
        {/if}
        {#if onExport}
          <SceneChromeButton
            icon={exportBusy ? "fa-spinner fa-spin" : "fa-download"}
            label={exportBusy ? "Exporting 3D video" : "Export 3D video"}
            tooltipSide="bottom"
            onclick={(event) => {
              event.stopPropagation();
              onExport();
            }}
            disabled={exportBusy}
          />
        {/if}
      </div>

      <span class="command-divider" aria-hidden="true"></span>

      <div class="command-group">
        <SceneChromeButton
          icon={immersive ? "fa-compress" : "fa-expand"}
          label={immersive ? "Exit immersive" : "Immersive fullscreen"}
          tooltipSide="bottom"
          onclick={(e) => {
            e.stopPropagation();
            onToggleImmersive?.(hostEl);
          }}
          aria-pressed={immersive}
        />
        {#if onClose}
          <SceneChromeButton
            icon="fa-xmark"
            label="Exit 3D view"
            tooltipSide="bottom"
            onclick={(event) => {
              event.stopPropagation();
              onClose();
            }}
          />
        {/if}
      </div>
    </div>
  </div>

  <!-- 3D canvas fills remaining space -->
  <div
    class="canvas-area"
    data-scene-inspector-docked={reservedSceneWidth > 0 || undefined}
    style:--scene-control-reserved-width="{reservedSceneWidth}px"
  >
    <Viewer3DCanvas
      {sequenceData}
      {currentStep}
      {isPlaying}
      {bpm}
      {onBpmChange}
      {leftPropType}
      {rightPropType}
      hideOverlays={immersive || hideCanvasOverlays}
      {initialRevealMode}
      {initialRevealDeferredFeatures}
      {onPlaybackToggle}
      {isLooping}
      {onLoopToggle}
      {onProgressBarSeek}
      {playbackMode}
      {onPlaybackModeChange}
      {onSystemPlaybackChange}
      {onSceneReadyChange}
      {weldPerformerGrip}
      {enablePerformerLocomotion}
      {renderEmptyScene}
      {cameraFov}
      {visiblePerformerCount}
      {performerSteps}
      {worldChildren}
      {stageExtent}
    />
  </div>

  {#if overlayChildren}
    <div class="host-overlay" class:hidden={immersive}>
      {@render overlayChildren()}
    </div>
  {/if}

  <!-- The standalone viewer uses the same adaptive scene-control owner as the
       embedded viewer. Sequence Viewer chrome is not involved. -->
  {#if SceneControls}
    <div
      class="scene-controls"
      class:hidden={immersive || !showSceneChrome}
      aria-hidden={immersive || !showSceneChrome ? true : undefined}
      inert={immersive || !showSceneChrome ? true : undefined}
    >
      <SceneControls
        {bpm}
        topOffset="76px"
        topLeftOffset={word ? undefined : "max(1rem, env(safe-area-inset-top))"}
        bottomOffset={sceneControlsBottomOffset}
        leftOffset={sceneControlsLeftOffset}
        {allowSaveScene}
        {hostPanel}
        {hostPanelTitle}
        bind:hostPanelOpen
        onCompactSheetChange={onCompactSceneSheetChange}
        onLayoutChange={(next) => (sceneControlLayout = next)}
      />
    </div>
  {/if}
</div>

<style>
  .viewer-3d-fullscreen {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: #0a0a14;
    display: flex;
    flex-direction: column;
  }

  /* z-index: auto, not a number: a contained viewer must not become a
     stacking context, so a host's empty-state card (e.g. Scene Studio's
     "No sequence loaded", z-index 3) can sit above the canvas and HUD yet
     below the scene controls and their sheets (z-index 4+). */
  .viewer-3d-fullscreen.contained {
    position: absolute;
    z-index: auto;
  }

  .viewer-hud {
    position: absolute;
    inset: 0;
    z-index: 3;
    pointer-events: none;
    opacity: 1;
    transition: opacity var(--duration-normal, 200ms)
      var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
  }

  .word-label {
    position: absolute;
    top: max(1rem, env(safe-area-inset-top));
    left: max(1rem, env(safe-area-inset-left));
    min-width: 0;
    max-width: min(38rem, calc(100% - 24rem));
    overflow: hidden;
    color: rgba(255, 255, 255, 0.9);
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    letter-spacing: 0.05em;
    filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.65));
    pointer-events: none;
  }

  /* Canvas fills all remaining space */
  .canvas-area {
    flex: 1;
    position: relative;
    /* Keep the canvas transport below workspace inspectors and compact sheets. */
    isolation: isolate;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    margin-right: var(--scene-control-reserved-width, 0px);
    transition: margin-right var(--duration-emphasis, 280ms)
      var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
  }

  .scene-command-bar {
    position: absolute;
    top: max(1rem, env(safe-area-inset-top));
    right: max(0.75rem, env(safe-area-inset-right));
    display: flex;
    align-items: center;
    gap: 0.625rem;
    pointer-events: auto;
  }

  .command-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .command-divider {
    width: 1px;
    height: 2rem;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.12));
  }

  /* Between the canvas and the rail: host chrome can cover the stage, and the
     rail's tools still open over it. */
  .host-overlay {
    position: absolute;
    inset: 0;
    z-index: 3;
    pointer-events: none;
    opacity: 1;
    transition: opacity var(--duration-normal, 200ms)
      var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
  }

  .host-overlay > :global(*) {
    pointer-events: auto;
  }

  .viewer-hud.hidden,
  .host-overlay.hidden,
  .scene-controls.hidden {
    opacity: 0;
    pointer-events: none;
  }
  .scene-controls {
    position: absolute;
    inset: 0;
    z-index: 4;
    pointer-events: none;
    opacity: 1;
    transition: opacity var(--duration-normal, 200ms)
      var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
  }
  .scene-controls :global(button),
  .scene-controls :global([role="button"]),
  .scene-controls :global([role="dialog"]),
  .scene-controls :global(.viewer-popover-panel) {
    pointer-events: auto;
  }

  @media (max-width: 700px) {
    .scene-command-bar {
      right: max(0.5rem, env(safe-area-inset-right));
      gap: 0.375rem;
    }

    .word-label {
      left: max(5.5rem, env(safe-area-inset-left));
      max-width: calc(100vw - 19rem);
    }

    .command-group {
      gap: 0.375rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .canvas-area {
      transition: none;
    }
  }
</style>
