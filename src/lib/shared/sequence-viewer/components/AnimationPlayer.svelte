<!--
  AnimationPlayer.svelte

  Thin coordinator for sequence animation playback.
  Composes existing primitives - does NOT duplicate their functionality.

  Modes:
  - Standalone: Creates own AnimationPanelState, loads services internally
  - External: Consumes AnimationExportContext from parent

  Primitives used:
  - AnimatorCanvas (rendering)
  - HorizontalSidebar / HorizontalTransportRow (horizontal layout)
  - VerticalModeControls (vertical layout)
  - ExportTakeover (export progress ring)
-->
<script lang="ts">
  import { getAnimationPlaybackController } from "$lib/shared/animation-engine/get-animation-playback-controller";
  import {
    createRenderActivityGate,
    renderGateTarget,
  } from "$lib/shared/render-gating/render-activity-gate";
  import { ensureMotionData } from "$lib/shared/sequence-viewer/services/sequence-motion-loader";
  import { onMount, onDestroy, untrack } from "svelte";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";
  import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { AnimationPlaybackController } from "$lib/shared/animation-engine/services/animation-playback-controller";
  import {
    clampDisplayedBeatNumber,
    displayedBeatNumber,
  } from "$lib/shared/animation-engine/services/step-calculator";
  import {
    createAnimationPanelState,
    type AnimationPanelState,
  } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
  import { animationSettings } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
  import {
    TrackingMode,
    type TrailSettings,
  } from "$lib/shared/animation-engine/domain/types/trail-types";
  import type { TipEffectMap } from "$lib/shared/animation-engine/domain/types/tip-effect-types";
  import { isBilateralProp } from "$lib/shared/pictograph/prop/domain/enums/prop-classification";
  import { tryGetAnimationExportContext } from "$lib/shared/export-panel/context/animation-export-context.svelte";
  import type { ControlsLevel } from "../domain/types";

  // Extracted components
  import ExportTakeover from "$lib/shared/video-export/components/ExportTakeover.svelte";
  import TKAWordGlyph from "$lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import { toExportTakeoverPhase } from "$lib/shared/video-export/services/export-takeover-phase";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import HorizontalSidebar from "./HorizontalSidebar.svelte";
  import HorizontalTransportRow from "./HorizontalTransportRow.svelte";
  import VerticalModeControls from "./VerticalModeControls.svelte";

  const DEFAULT_BPM = 60;

  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

  let {
    sequence,
    autoPlay = true,
    showControls = true,
    controlsLevel = "minimal" as ControlsLevel,
    externalControl = false,
    onCanvasReady,
    onStepChange,
    previewDarkMode = null,
    layout = "vertical" as "vertical" | "horizontal",
    leftPropType = null,
    rightPropType = null,
    onTogglePlaybackRef,
    onControllerReady,
    hideProgressBar = false,
    hideWordHeader = false,
    tapToToggle = false,
    progressLine = false,
    progressLineSeekable = false,
    hoverHint = "none" as "none" | "badge" | "pill" | "scrim",
    trailSettingsOverride = null,
    tipEffectMap = undefined,
  }: {
    sequence: SequenceData;
    autoPlay?: boolean;
    showControls?: boolean;
    controlsLevel?: ControlsLevel;
    externalControl?: boolean;
    onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
    /** Called when current step changes (0-indexed step index or null when not playing) */
    onStepChange?: (stepIndex: number | null, isPlaying: boolean) => void;
    previewDarkMode?: boolean | null;
    layout?: "vertical" | "horizontal";
    leftPropType?: PropType | null;
    rightPropType?: PropType | null;
    /** Callback to receive reference to toggle playback function (for external keyboard control) */
    onTogglePlaybackRef?: (toggleFn: () => void) => void;
    /** Called when the internal playback controller is initialized, exposing it for external sync */
    onControllerReady?: (
      ctrl: AnimationPlaybackController,
      state: AnimationPanelState
    ) => void;
    hideProgressBar?: boolean;
    hideWordHeader?: boolean;
    /** When true, a quick tap on the canvas body toggles play/pause (forwarded to AnimatorCanvas). */
    tapToToggle?: boolean;
    /** Swap the full UnifiedTimeline transport for the thin non-interactive
     *  progress LINE (SequenceProgressBar). For embedded/showcase players that
     *  pair it with tapToToggle. Forwarded to AnimatorCanvas. */
    progressLine?: boolean;
    /** Make the progress LINE a scrubber (click/drag/keyboard seek, with the
     *  viewer shell's pause-while-scrubbing bracket). Standalone mode only;
     *  off by default so existing progressLine consumers keep a passive line. */
    progressLineSeekable?: boolean;
    /** Mouse-only hover affordance teaching "click the canvas to play/pause".
     *  Forwarded to AnimatorCanvas. */
    hoverHint?: "none" | "badge" | "pill" | "scrim";
    /** Per-instance trail settings. Null keeps the shared animation settings. */
    trailSettingsOverride?: TrailSettings | null;
    /** Per-tip effect assignments forwarded to AnimatorCanvas. */
    tipEffectMap?: TipEffectMap;
  } = $props();

  // Context for external control mode
  const ctx = $derived(externalControl ? tryGetAnimationExportContext() : null);
  const useContext = $derived(externalControl && !!ctx);

  // Services (standalone mode only)
  let controller = $state<AnimationPlaybackController | null>(null);

  // Off-screen / hidden-tab gating for the playhead loop. Standalone mode only:
  // in context mode the viewer shell owns the controller and its gating, and a
  // second gate on the shared singleton would fight it. The canvas render loop
  // is gated independently inside CanvasSurface.
  const activityGate = createRenderActivityGate({ name: "animation-player" });

  // State (standalone mode only)
  const animState = createAnimationPanelState();

  // UI state
  let loading = $state(true);
  let error = $state<string | null>(null);
  let bpm = $state(DEFAULT_BPM);
  let lastSequenceId = $state<string | null>(null);

  // Derived: effective state from context or internal
  // Use optional chaining to handle potential timing issues where ctx might not be ready
  const isPlaying = $derived(
    useContext
      ? (ctx?.state?.isPlaying ?? false)
      : (animState?.isPlaying ?? false)
  );
  const currentStep = $derived(
    useContext ? (ctx?.state?.currentStep ?? 0) : (animState?.currentStep ?? 0)
  );
  const leftPropState = $derived(
    useContext
      ? (ctx?.state?.leftPropState ?? null)
      : (animState?.leftPropState ?? null)
  );
  const rightPropState = $derived(
    useContext
      ? (ctx?.state?.rightPropState ?? null)
      : (animState?.rightPropState ?? null)
  );
  const sequenceData = $derived(
    useContext
      ? (ctx?.state?.sequenceData ?? sequence)
      : (animState?.sequenceData ?? sequence)
  );
  const playbackMode = $derived(
    useContext
      ? (ctx?.state?.playbackMode ?? "continuous")
      : (animState?.playbackMode ?? "continuous")
  );
  const stepSize = $derived(
    useContext
      ? (ctx?.state?.stepPlaybackStepSize ?? 1)
      : (animState?.stepPlaybackStepSize ?? 1)
  );
  const isExporting = $derived(
    useContext ? (ctx?.state?.isExporting ?? false) : false
  );
  const exportProgress = $derived(
    useContext ? (ctx?.state?.exportProgress ?? null) : null
  );
  // Drives the shared ExportTakeover ring (same premium overlay as /q + Art +
  // mandala). One mapper → phase + label key, no per-host duplication.
  const takeover = $derived(toExportTakeoverPhase(exportProgress, isExporting));
  const titleWord = $derived(
    simplifyRepeatedWord(sequenceData?.word ?? sequence?.word ?? "")
  );
  // Deterministic export time. The video orchestrator freezes panelState's
  // virtualTime per captured frame; the engine's render loop must read it so the
  // trail's duplicate-stamp guard fires (one stamp per frozen frame). Undefined
  // during live playback → render loop falls back to its free-running rAF clock.
  const virtualTime = $derived(animState?.virtualTime);

  // Step playback parks on integer beat boundaries for its pause. During that
  // freeze the props hold the COMPLETED beat's end position, so glyph/labels
  // must keep attributing the boundary to the completed beat (not the upcoming
  // one). See displayedBeatNumber for the two attribution conventions.
  const stepDwell = $derived(playbackMode === "step" && isPlaying);

  // Derived: current step data for canvas
  const stepData = $derived.by(() => {
    const seq = sequenceData;
    if (!seq) return null;
    const beat = clampDisplayedBeatNumber(
      displayedBeatNumber(currentStep, stepDwell),
      seq.steps?.length ?? 0
    );
    if (beat < 1) return seq.startPlacement ?? null;
    const idx = Math.min(Math.max(0, beat - 1), (seq.steps?.length ?? 1) - 1);
    return seq.steps?.[idx] ?? null;
  });

  const letter = $derived(stepData?.letter ?? null);
  const gridMode = $derived(sequenceData?.gridMode ?? sequence?.gridMode);

  // Notify parent of step changes for animation sync (e.g., highlighting in dual view)
  $effect(() => {
    const playing = isPlaying;
    // Same boundary attribution as the canvas glyph so highlights never point
    // at a different beat than the displayed pictograph.
    const beat = clampDisplayedBeatNumber(
      displayedBeatNumber(currentStep, stepDwell),
      sequenceData?.steps?.length ?? 0
    );
    // Convert beat number (1-indexed) to stepIndex (0-indexed)
    // When beat < 1, it's the start position - pass null
    const stepIndex = beat < 1 ? null : Math.max(0, beat - 1);
    onStepChange?.(stepIndex, playing);
  });

  // Trail settings with fine-grained reactivity and unilateral prop enforcement.
  // Unilateral props (fan, club, etc.) always use RIGHT_END - they only have
  // one meaningful endpoint, so BOTH_ENDS would show an imaginary second trail.
  const trailSettings = $derived.by(() => {
    const t = trailSettingsOverride ?? animationSettings.trail;
    void t.mode;
    void t.fadeDurationMs;
    void t.lineWidth;
    void t.maxOpacity;
    void t.trackingMode;
    void t.effect;

    const settings = { ...t };

    if (settings.trackingMode === TrackingMode.BOTH_ENDS) {
      const hasBilateral =
        (leftPropType != null && isBilateralProp(String(leftPropType))) ||
        (rightPropType != null && isBilateralProp(String(rightPropType)));
      if (!hasBilateral) {
        settings.trackingMode = TrackingMode.RIGHT_END;
      }
    }

    return settings;
  });

  // Service initialization (standalone mode)
  onMount(async () => {
    if (useContext) {
      loading = false;
      // Expose toggle function to parent even in context mode
      onTogglePlaybackRef?.(() => ctx?.actions?.onPlaybackToggle());
      return;
    }

    try {
      controller = getAnimationPlaybackController();
      controller.setActivityGate(activityGate);
      loading = false;
      // Expose toggle function to parent for keyboard control
      onTogglePlaybackRef?.(togglePlayback);
    } catch (err) {
      console.error("Failed to initialize animation player:", err);
      error = "Failed to load animation";
      loading = false;
    }
  });

  onDestroy(() => {
    if (!useContext) {
      // Identity-scoped: the shared singleton must never be left gated to this
      // host's detached element after a newer host has claimed it.
      controller?.clearActivityGate(activityGate);
      activityGate.dispose();
      // Owner-scoped release so a stale teardown can't clobber a newer host
      // that already re-claimed the shared singleton (HMR remount overlap).
      controller?.dispose(animState);
      animState?.dispose();
    }
  });

  // Watch sequence changes (standalone mode)
  // IMPORTANT: Explicitly track controller so effect re-runs when it's set
  $effect(() => {
    // Track dependencies to ensure effect re-runs when controller is set
    void controller;

    if (useContext || !controller) return;

    // Create content hash to detect edits (same ID, different content)
    // Include steps data to detect any step modifications
    const stepsHash =
      sequence?.steps
        ?.map(
          (s) => `${s.letter}:${s.duration}:${s.startPlacement ? "start" : ""}`
        )
        .join("|") ?? "";

    const seqId = sequence?.id
      ? `${sequence.id}:${sequence.ownerId ?? "local"}:${stepsHash}`
      : `${sequence?.word ?? ""}:${stepsHash}`;

    if (seqId === lastSequenceId) return;

    untrack(async () => {
      lastSequenceId = seqId ?? null;
      if (animState?.isPlaying) controller?.togglePlayback();
      animState?.reset();

      const fullSeq = await ensureMotionData(sequence);
      if (!fullSeq) {
        error = "Failed to load sequence";
        return;
      }

      animState?.setShouldLoop(true);
      const ok = controller!.initialize(fullSeq, animState!);
      if (!ok) {
        error = "Failed to initialize playback";
        return;
      }

      // Expose controller + state to parent for external sync
      onControllerReady?.(controller!, animState!);

      if (autoPlay) {
        setTimeout(() => controller?.togglePlayback(), 300);
      }
    });
  });

  // Action handlers - delegate to context or controller
  function togglePlayback() {
    useContext
      ? ctx?.actions?.onPlaybackToggle()
      : controller?.togglePlayback();
  }

  function handleBpmChange(newBpm: number) {
    bpm = newBpm;
    const speed = newBpm / DEFAULT_BPM;
    useContext
      ? ctx?.actions?.onSpeedChange(speed)
      : controller?.setSpeed(speed);
  }

  function handleCanvasReady(canvas: HTMLCanvasElement | null) {
    onCanvasReady?.(canvas);
    if (useContext) ctx?.actions?.onCanvasReady(canvas);
  }

  // Step handlers
  const stepHalfBack = () =>
    useContext
      ? ctx?.actions?.onStepHalfBeatBackward()
      : controller?.stepHalfBeatBackward();
  const stepHalfFwd = () =>
    useContext
      ? ctx?.actions?.onStepHalfBeatForward()
      : controller?.stepHalfBeatForward();
  const restartToStart = () => {
    if (useContext) {
      ctx?.actions?.onStepFullBeatBackward();
    } else {
      // seekToStep preserves playback state - if playing, continues from start
      controller?.seekToStep(0);
    }
  };
  const stepFullFwd = () =>
    useContext
      ? ctx?.actions?.onStepFullBeatForward()
      : controller?.stepFullBeatForward();

  // Seekable progress line (standalone mode): same gesture bracket as the
  // viewer shell's playback-controller — pause while the finger is down,
  // resume when it lifts, so scrubbing never fights the playback loop.
  let wasPlayingBeforeScrub = false;
  const lineSeek = (targetStep: number) => controller?.seekToStep(targetStep);
  const lineScrubStart = () => {
    wasPlayingBeforeScrub = isPlaying;
    if (wasPlayingBeforeScrub) togglePlayback();
  };
  const lineScrubEnd = () => {
    if (wasPlayingBeforeScrub) togglePlayback();
    wasPlayingBeforeScrub = false;
  };

  const setPlaybackMode = (m: "continuous" | "step") =>
    ctx?.actions.onPlaybackModeChange(m);
  const setStepSize = (s: 0.5 | 1) =>
    ctx?.actions.onStepPlaybackStepSizeChange(s);
  const cancelExport = () => ctx?.actions.onCancelExport();
</script>

<div
  class="animation-player"
  class:horizontal={layout === "horizontal"}
  use:renderGateTarget={useContext ? null : activityGate}
>
  {#if loading}
    <div class="state-msg">
      <ProgressRing percent={-1} size={32} strokeWidth={3} /><span
        >Loading animation...</span
      >
    </div>
  {:else if error}
    <div class="state-msg error"><span>{error}</span></div>
  {:else if layout === "horizontal"}
    <!-- Horizontal mode: canvas + sidebar in a row -->
    <div class="horizontal-row">
      <div class="canvas-wrap">
        <AnimatorCanvas
          leftProp={leftPropState}
          rightProp={rightPropState}
          gridVisible={true}
          {gridMode}
          {letter}
          {stepData}
          {sequenceData}
          {currentStep}
          {isPlaying}
          {virtualTime}
          word={hideWordHeader
            ? null
            : (sequenceData?.word ?? sequence?.word ?? null)}
          onPlaybackToggle={togglePlayback}
          {trailSettings}
          onCanvasReady={handleCanvasReady}
          {previewDarkMode}
          {leftPropType}
          {rightPropType}
          {tipEffectMap}
          progressBarVariant="minimal"
          {hideProgressBar}
          {tapToToggle}
          {progressLine}
          onProgressBarSeek={progressLineSeekable ? lineSeek : null}
          onProgressBarScrubStart={progressLineSeekable ? lineScrubStart : null}
          onProgressBarScrubEnd={progressLineSeekable ? lineScrubEnd : null}
          {hoverHint}
        />

        {#if takeover.phase !== "idle"}
          <ExportTakeover
            phase={takeover.phase}
            progress={exportProgress?.progress ?? 0}
            phaseLabel={takeover.labelKey ? t(takeover.labelKey) : ""}
            error={exportProgress?.error ?? null}
            onCancel={cancelExport}
          >
            {#snippet title()}
              <TKAWordGlyph word={titleWord} height={28} darkMode />
            {/snippet}
          </ExportTakeover>
        {/if}
      </div>

      <HorizontalSidebar
        {controlsLevel}
        {useContext}
        {isPlaying}
        bind:bpm
        {playbackMode}
        {stepSize}
        onBpmChange={handleBpmChange}
        onPlaybackModeChange={setPlaybackMode}
        onStepSizeChange={setStepSize}
        onPlaybackToggle={togglePlayback}
      />
    </div>

    {#if showControls}
      <HorizontalTransportRow
        {isPlaying}
        onPlaybackToggle={togglePlayback}
        onStepHalfBack={stepHalfBack}
        onStepHalfFwd={stepHalfFwd}
        onRestartToStart={restartToStart}
        onStepFullFwd={stepFullFwd}
      />
    {/if}
  {:else}
    <!-- Vertical mode: original layout -->
    <div class="canvas-wrap">
      <AnimatorCanvas
        leftProp={leftPropState}
        rightProp={rightPropState}
        gridVisible={true}
        {gridMode}
        {letter}
        {stepData}
        {sequenceData}
        {currentStep}
        {isPlaying}
        word={hideWordHeader
          ? null
          : (sequenceData?.word ?? sequence?.word ?? null)}
        onPlaybackToggle={togglePlayback}
        {trailSettings}
        onCanvasReady={handleCanvasReady}
        {previewDarkMode}
        {leftPropType}
        {rightPropType}
        {tipEffectMap}
        progressBarVariant="minimal"
        {hideProgressBar}
        {tapToToggle}
        {progressLine}
        onProgressBarSeek={progressLineSeekable ? lineSeek : null}
        onProgressBarScrubStart={progressLineSeekable ? lineScrubStart : null}
        onProgressBarScrubEnd={progressLineSeekable ? lineScrubEnd : null}
        {hoverHint}
      />

      {#if takeover.phase !== "idle"}
        <ExportTakeover
          phase={takeover.phase}
          progress={exportProgress?.progress ?? 0}
          phaseLabel={takeover.labelKey ? t(takeover.labelKey) : ""}
          error={exportProgress?.error ?? null}
          onCancel={cancelExport}
        >
          {#snippet title()}
            <TKAWordGlyph word={titleWord} height={28} darkMode />
          {/snippet}
        </ExportTakeover>
      {/if}
    </div>

    {#if showControls}
      <VerticalModeControls
        {controlsLevel}
        {useContext}
        {isPlaying}
        {bpm}
        {playbackMode}
        {stepSize}
        onPlaybackToggle={togglePlayback}
        onBpmChange={handleBpmChange}
        onPlaybackModeChange={setPlaybackMode}
        onStepSizeChange={setStepSize}
        onStepHalfBack={stepHalfBack}
        onStepHalfFwd={stepHalfFwd}
        onRestartToStart={restartToStart}
        onStepFullFwd={stepFullFwd}
      />
    {/if}
  {/if}
</div>

<style>
  .animation-player {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    gap: 12px;
    padding: 8px;
    box-sizing: border-box;
  }

  .animation-player.horizontal {
    flex-direction: column;
    gap: 12px;
  }

  .horizontal-row {
    display: flex;
    flex-direction: row;
    align-items: stretch;
    gap: 16px;
    flex: 1;
    min-height: 0;
  }

  .horizontal-row .canvas-wrap {
    flex: 1;
    min-width: 0;
    max-width: none;
  }

  .canvas-wrap {
    position: relative;
    flex: 1;
    min-height: 0;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    overflow: visible;
    background: transparent;
    padding: 4px;
    box-sizing: border-box;
  }

  .state-msg {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    width: 100%;
    height: 100%;
    min-height: 120px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm);
  }

  .state-msg.error {
    color: var(--semantic-error, #fca5a5);
  }

  @media (min-width: 1200px) {
    .animation-player {
      gap: 8px;
      padding: 4px;
    }
  }
</style>
