<script lang="ts">
  import { onMount } from "svelte";
  import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { ViewerPlaybackState } from "../domain/viewer-prop-groups";
  import type { TipEffectMap } from "$lib/shared/animation-engine/domain/types/tip-effect-types";
  import type { TunnelViewController } from "./tunnel-view-controller.svelte";
  import type { ContextMenuEntry } from "$lib/shared/components/context-menu/context-menu-types";
  import { getEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import {
    animationSettings,
    type AnimationSettingsState,
  } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
  import {
    getAnimationVisibilityManager,
    type AnimationVisibilityStateManager,
    type GridMode as GridVisibilityMode,
  } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import { foldTrailIntentIntoSettings } from "$lib/shared/effects/translators/canvas2d-translator";
  import {
    toggleTunnelPlayback,
    type TunnelPlaybackSource,
  } from "../domain/tunnel-playback";

  let {
    sequence,
    playback,
    controller,
    bpm = 60,
    leftPropType,
    rightPropType,
    onSaveTunnel,
    saveTunnelLabel = "Save tunnel",
    onPlayingChange,
    playing = $bindable(true),
    stageFit = "cover",
    animationSettingsState = animationSettings,
    visibilityManager,
    leftBuugengFlipped,
    rightBuugengFlipped,
    onCanvasReady,
    onActivePerformerStepsChange,
  }: {
    sequence: SequenceData;
    playback?: ViewerPlaybackState;
    /** Shared controller owned by ArtPane — its controls live in ArtSettingsPanel. */
    controller: TunnelViewController;
    /** Global tempo from the sidebar's Playback section. Drives the playhead so
     *  the tempo selector controls the kaleidoscope (60 BPM = 1 beat/sec). */
    bpm?: number;
    leftPropType?: string;
    rightPropType?: string;
    /** Save the live tunnel to the collection (owned by ArtPane). Absent = no
     *  save entry in the canvas right-click menu. */
    onSaveTunnel?: () => void;
    saveTunnelLabel?: string;
    /** Controlled hosts own the clock; standalone hosts keep the bindable fallback. */
    onPlayingChange?: (playing: boolean, source: TunnelPlaybackSource) => void;
    /** Pause the self-clock (the playhead holds its frame). Bindable so a tap
     *  on the canvas toggles it (matching the regular animation canvas) while
     *  hosts with their own pause control (e.g. the collection's detail
     *  preview) stay in sync — WCAG 2.2.2. */
    playing?: boolean;
    /** The viewer fills its pane; framed previews preserve the complete tunnel. */
    stageFit?: "cover" | "contain";
    animationSettingsState?: AnimationSettingsState;
    visibilityManager?: AnimationVisibilityStateManager;
    leftBuugengFlipped?: boolean;
    rightBuugengFlipped?: boolean;
    onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
    /** Reports the one card cell that matches each authored stage instance. */
    onActivePerformerStepsChange?: (
      stepIndices: Readonly<Record<string, number>>
    ) => void;
  } = $props();

  let readyFrame = 0;

  function handleCanvasReady(canvas: HTMLCanvasElement | null): void {
    cancelAnimationFrame(readyFrame);
    if (!canvas) {
      onCanvasReady?.(null);
      return;
    }

    // AnimatorCanvas announces its backing surface before starting the render
    // loop. Hold the parent reveal through the first painted frame so a cold
    // Tunnel never fades up as an initialized-but-empty canvas.
    readyFrame = requestAnimationFrame(() => {
      readyFrame = requestAnimationFrame(() => onCanvasReady?.(canvas));
    });
  }

  function handlePlaybackToggle(): void {
    const next = toggleTunnelPlayback(playing, "canvas");
    if (onPlayingChange) onPlayingChange(next, "canvas");
    else playing = next;
  }

  // Prepend a "Save tunnel" entry (+ separator) to the canvas context menu when
  // a save handler is wired. AnimatorCanvas prepends these to its own menu.
  const saveMenuItems = $derived<ContextMenuEntry[]>(
    onSaveTunnel
      ? [
          {
            id: "save-tunnel",
            label: saveTunnelLabel,
            icon: "fa-bookmark",
            action: onSaveTunnel,
          },
          { type: "separator" },
        ]
      : []
  );

  // An art view animates on its own clock (like the mandala) — it must not
  // depend on the 2D transport being played. Effects/props/effort come from the
  // viewer's shared effects-config; the only tunnel-unique knobs are fold + mirror
  // (driven through the shared controller from ArtSettingsPanel).
  const effectsConfig = getEffectsConfigContext();

  const seq = $derived(playback?.animationState.sequenceData ?? sequence);
  const gridMode = $derived(seq?.gridMode);
  let selectedGridMode = $state<GridVisibilityMode>("auto");
  const effectiveGridMode = $derived(
    selectedGridMode === "8point" ? GridMode.EIGHT_POINT : gridMode
  );

  $effect(() => {
    const manager = visibilityManager ?? getAnimationVisibilityManager();

    const syncGridMode = () => {
      selectedGridMode = manager.getGridMode();
    };
    syncGridMode();
    manager.registerObserver(syncGridMode);
    return () => manager.unregisterObserver(syncGridMode);
  });

  const stepCount = $derived(seq?.steps?.length ?? 0);

  // Self-driven playhead — a MONOTONIC 0-indexed beat accumulator. It does NOT
  // reset every base loop; it wraps at `loopSteps` (a whole number of base
  // cycles). That lets per-performer Speed arms drift across the base loop
  // instead of snapping home with the 1× base — a ¼× arm is only a quarter of
  // the way through when the base completes, so playback follows through into a
  // fresh kaleidoscope and the whole ring re-homes together only at the loop
  // boundary. Driven by the global tempo: beats/sec = bpm/60 (60 BPM = 1 beat/s).
  let phase = $state(0);
  const speed = $derived(Math.max(0, bpm) / 60);
  // One base loop = stepCount; slow arms need more loops to return home, so the
  // shared clock spans `controller.loopCycles` of them (¼× → 4, ½× → 2, else 1).
  const loopSteps = $derived(controller.loopSteps);

  // Honor the OS motion preference on the self-clock itself (the controller
  // already caps copy DENSITY under reduced motion; this damps the MOTION —
  // WCAG 2.3.3). A slow drift keeps the kaleidoscope legible without the spin.
  let reducedMotion = $state(
    typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  $effect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => {
      reducedMotion = e.matches;
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  });
  const REDUCED_MOTION_DAMP = 0.15;
  const effSpeed = $derived(
    reducedMotion ? speed * REDUCED_MOTION_DAMP : speed
  );

  onMount(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (stepCount > 0 && playing) {
        phase = (phase + dt * effSpeed) % loopSteps;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(readyFrame);
    };
  });

  // Unbounded-within-loop playhead (1-indexed) for the kaleidoscope sampling —
  // the controller wraps it per-arm so drift works.
  const samplingStep = $derived(phase + 1);
  // Base-cycle-wrapped playhead for the canvas's own step bookkeeping (word-header
  // underline / glyph highlight expect a value inside one sequence length).
  const displayStep = $derived((stepCount > 0 ? phase % stepCount : 0) + 1);
  const base = $derived(controller.basePropsAt(samplingStep));
  const additionalLayers = $derived(
    controller.additionalLayersAt(samplingStep)
  );
  let announcedPerformerSteps = "";
  $effect(() => {
    if (!onActivePerformerStepsChange) return;
    const next = controller.authoredPerformerStepIndicesAt(samplingStep);
    const key = Object.entries(next)
      .map(([performerId, index]) => `${performerId}:${index}`)
      .join("|");
    if (key === announcedPerformerSteps) return;
    announcedPerformerSteps = key;
    onActivePerformerStepsChange(next);
  });

  // Reuse the sidebar's chosen effect, applied uniformly across every layer.
  const activeEffect = $derived(effectsConfig?.activeEffect ?? "none");
  const tipEffectMap = $derived<TipEffectMap | undefined>(
    activeEffect === "none" ? undefined : { "*": { effect: activeEffect } }
  );

  // The Art panel's Trail dials are split across two stores: tracking / length /
  // mode / fade live on the legacy animationSettings.trail, while the visual
  // dials (thickness, brightness, colors) write to the unified effects config.
  // The 2D trail overlay only reads the legacy TrailSettings, so fold the
  // effects-config visuals back in — otherwise dragging a dial mutates a store
  // the renderer never reads. Shared with the landing showcase via the helper.
  const trailSettings = $derived(
    foldTrailIntentIntoSettings(
      animationSettingsState.trail,
      effectsConfig?.trails
    )
  );
</script>

<div class="tunnel-art" class:contained={stageFit === "contain"}>
  <div class="stage">
    {#if controller.buildError}
      <div class="tunnel-error" role="alert">
        <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
        <strong>The tunnel could not be built</strong>
        <span>{controller.buildError}</span>
      </div>
    {:else if seq}
      <AnimatorCanvas
        leftProp={base.left}
        rightProp={base.right}
        {additionalLayers}
        tunnelSpectrum={controller.spectrum}
        tunnelPropColors={controller.exactPropColors}
        tunnelSelectedLayer={controller.spotlightLayers}
        {leftPropType}
        {rightPropType}
        {leftBuugengFlipped}
        {rightBuugengFlipped}
        sequenceData={seq}
        currentStep={displayStep}
        isPlaying={playing}
        tapToToggle={true}
        hoverHint="badge"
        cornerToggle={true}
        onPlaybackToggle={handlePlaybackToggle}
        gridMode={effectiveGridMode}
        {trailSettings}
        {tipEffectMap}
        effectsConfigState={effectsConfig ?? undefined}
        onCanvasReady={handleCanvasReady}
        visibilityManagerOverride={visibilityManager}
        gridVisible={controller.gridVisible}
        hideHeader={true}
        hideProgressBar={true}
        hideTkaGlyph={true}
        hideStepNumbers={true}
        hidePathLines={true}
        fillContainer={true}
        fireConfig={{ disableFrameCache: true }}
        extraContextMenuItems={saveMenuItems}
      />
    {/if}
  </div>
</div>

<style>
  .tunnel-art {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  /* Oversize the stage past the pane (140%) and let .tunnel-art clip it. The
     square canvas then fits the LARGER box, so its backing resolution grows
     with it — the kaleidoscope fills the available width instead of sitting in
     a height-bound square with wide black margins, and stays sharp (no CSS
     upscale). The pattern is roughly circular, so the clipped corners are
     empty. */
  .stage {
    position: absolute;
    inset: -15%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .tunnel-art.contained .stage {
    inset: 0;
  }
  .stage :global(canvas) {
    max-width: 100%;
    max-height: 100%;
  }
  .tunnel-error {
    display: grid;
    justify-items: center;
    gap: 0.6rem;
    max-width: 28rem;
    padding: 1.25rem;
    color: var(--theme-text, #fff);
    text-align: center;
  }
  .tunnel-error i {
    color: var(--semantic-error, #ef4444);
    font-size: 1.5rem;
  }
  .tunnel-error span {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    font-size: var(--font-size-min, 14px);
    line-height: 1.45;
  }
</style>
