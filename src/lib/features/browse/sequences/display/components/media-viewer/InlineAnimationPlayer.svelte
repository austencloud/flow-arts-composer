<!--
  InlineAnimationPlayer.svelte

  Lightweight animation player for inline use in gallery detail panels.
  Does not require Create module context - fully standalone.

  Uses the shared animation engine with BPM preset controls.
-->
<script lang="ts">
  import { onMount, onDestroy, untrack } from "svelte";
  import type { ViewerCustomColorPair } from "$lib/shared/sequence-viewer/domain/viewer-custom-colors";
  import {
    createRenderActivityGate,
    renderGateTarget,
    type RenderActivityGate,
  } from "$lib/shared/render-gating/render-activity-gate";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";
  import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import BpmChips from "$lib/shared/animation-engine/components/controls/BpmChips.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { EffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
  import type { TrailSettings } from "$lib/shared/animation-engine/domain/types/trail-types";
  import type { FireOverlayConfig } from "$lib/shared/animation-engine/domain/types/fire-types";
  import type { PreparedSequenceHandoff } from "$lib/shared/animation-engine/domain/chaining-types";
  import type {
    TipEffectMap,
    TipEffortMap,
  } from "$lib/shared/animation-engine/domain/types/tip-effect-types";
  import {
    createAnimationPanelState,
    type PlaybackMode,
  } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
  import { animationSettings } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
  import type { AnimationVisibilityStateManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import { Letter } from "$lib/shared/foundation/domain/models/letter";
  import type { QualityTier } from "$lib/shared/animation-engine/domain/types/quality-types";
  import type { ElementalType } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import type { GlyphOverlayFrameMode } from "$lib/shared/animation-engine/domain/glyph-overlay-frame";

  // Per-instance playback stack imports (avoid shared singleton)
  import { AnimationPlaybackController } from "$lib/shared/animation-engine/services/animation-playback-controller";
  import { SequenceAnimationOrchestrator } from "$lib/shared/animation-engine/services/sequence-animation-orchestrator";
  import { getViewerAnimationPropConfig } from "$lib/shared/animation-engine/get-viewer-animation-prop-config";
  import { AnimationStateManager } from "$lib/shared/animation-engine/services/animation-state-manager";
  import { AnimationLoop } from "$lib/shared/animation-engine/services/animation-loop";

  // Canvas-menu video download (opt-in via `videoDownload`)
  import { getExportOrchestrator } from "$lib/shared/export-panel/get-export-orchestrator";
  import { ensureVideoExportOrchestrator } from "$lib/shared/animation-engine/get-video-export-orchestrator";
  import {
    removeToast,
    showToast,
    toast,
  } from "$lib/shared/toast/state/toast-state.svelte";
  import type { ContextMenuEntry } from "$lib/shared/components/context-menu/context-menu-types";

  // BPM/Speed conversion constant
  const DEFAULT_BPM = 60;

  /**
   * Get the Greek letter (α, β, γ) for the start position phase.
   * Uses the sequence prop which has startingPlacementGroup preserved.
   */
  function getStartPlacementLetter(): Letter | null {
    // Use sequence prop - it has startingPlacementGroup preserved
    // (animationState.sequenceData loses this field during processing)
    const seq = sequence;
    if (!seq) return null;

    // 1. Derive from startingPlacementGroup (most reliable)
    if (seq.startingPlacementGroup) {
      const group = seq.startingPlacementGroup.toLowerCase();
      if (group === "alpha") return Letter.ALPHA;
      if (group === "beta") return Letter.BETA;
      if (group === "gamma") return Letter.GAMMA;
    }

    // 2. Check if startPlacement.letter is already a valid Greek letter
    const spLetter = seq.startPlacement?.letter;
    if (
      spLetter === Letter.ALPHA ||
      spLetter === Letter.BETA ||
      spLetter === Letter.GAMMA
    ) {
      return spLetter;
    }

    // 3. Derive from first beat's startPlacement field (GridPlacement like "alpha1")
    const firstStep = seq.steps?.[0];
    if (firstStep) {
      const startPos = firstStep.startPlacement || (firstStep as any).startPos;
      if (startPos && typeof startPos === "string") {
        const posLower = startPos.toLowerCase();
        if (posLower.startsWith("alpha")) return Letter.ALPHA;
        if (posLower.startsWith("beta")) return Letter.BETA;
        if (posLower.startsWith("gamma")) return Letter.GAMMA;
        if (posLower.startsWith("zeta")) return Letter.ZETA;
        if (posLower.startsWith("eta")) return Letter.ETA;
      }
    }

    return null;
  }

  /**
   * Greek letter (α, β, γ, ζ, η) for the FINAL held position — mirror of
   * getStartPlacementLetter for the end-hold phase. At the End the hand isn't
   * mid-letter; it holds the last step's end position, so the glyph should read
   * that position, not the previous step's letter.
   */
  function getEndPlacementLetter(): Letter | null {
    const steps = sequence?.steps;
    const lastStep = steps?.[steps.length - 1];
    const endPos = lastStep?.endPlacement || (lastStep as any)?.endPos;
    if (endPos && typeof endPos === "string") {
      const posLower = endPos.toLowerCase();
      if (posLower.startsWith("alpha")) return Letter.ALPHA;
      if (posLower.startsWith("beta")) return Letter.BETA;
      if (posLower.startsWith("gamma")) return Letter.GAMMA;
      if (posLower.startsWith("zeta")) return Letter.ZETA;
      if (posLower.startsWith("eta")) return Letter.ETA;
    }
    return null;
  }

  let {
    sequence,
    sequenceLoadKey = null,
    autoPlay = true,
    autoPlayDelay = 300,
    showControls = true,
    leftPropType = null,
    rightPropType = null,
    primaryPropColors,
    externalBpm = null,
    externalPlaying = null,
    externalPlaybackMode = null,
    externalStep = null,
    onExternalSeek = undefined,
    playbackGate = undefined,
    onExternalPlayingChange = undefined,
    chrome = "full",
    fill = false,
    disassemblyLayout = "auto",
    disassemblyTarget = null,
    onDisassemblyTargetChange = undefined,
    showWordHeader = false,
    showPlacementGlyph = false,
    onStepChange = undefined,
    onSeekRef = undefined,
    scrubbable = false,
    singlePlay = false,
    beatIndicators = true,
    onLoopComplete = undefined,
    onSequenceBoundary = undefined,
    trailSettingsOverride = null,
    tipEffectMap = undefined,
    tipEffortMap = undefined,
    fireConfig = undefined,
    effectsConfigState = undefined,
    backgroundAlpha = 1,
    hideTkaGlyph = false,
    hideStepNumbers = false,
    gridVisible = true,
    disableContextMenu = false,
    videoDownload = false,
    interactive = true,
    hoverHint = "badge",
    cornerToggle = false,
    showScrubberPlaybackControl = false,
    playbackAllowed = true,
    resumeWhenPlaybackAllowed = false,
    onTogglePlaybackRef = undefined,
    onReady = undefined,
    onCanvasInitialized = undefined,
    onLoadError = undefined,
    visibilityManagerOverride = undefined,
    propElementalType = null,
    glyphFrame = "pictograph",
    initialQualityTier = undefined,
    initialStep = null,
    ephemeral = false,
  }: {
    sequence: SequenceData;
    /** Distinguishes a deliberate host reload when selections share an ID. */
    sequenceLoadKey?: string | null;
    autoPlay?: boolean;
    /** Delay before autoplay begins after a sequence is ready. Most embeds keep
     *  the settled 300ms default; prewarmed dual-source stages pass 0 because
     *  the incoming canvas remains hidden until motion is observed. */
    autoPlayDelay?: number;
    showControls?: boolean;
    leftPropType?: string | null;
    rightPropType?: string | null;
    /** When provided, overrides internal BPM and controls playback speed externally */
    externalBpm?: number | null;
    /** Shared host playback intent. When present, hidden retained players pause
     *  without changing this value and resume to match it when visible again. */
    externalPlaying?: boolean | null;
    /** Host-owned continuous/step intent for embedded canonical players. */
    externalPlaybackMode?: PlaybackMode | null;
    /** A shared clock drives this player; its own playback loop stays stopped. */
    externalStep?: number | null;
    onExternalSeek?: (step: number) => void;
    /** A comparison's clock stays active while any part of its board is visible. */
    playbackGate?: RenderActivityGate;
    onExternalPlayingChange?: (playing: boolean) => void;
    /**
     * Reports the live 1-based fractional playback step (`currentStep`) and the
     * sequence identity currently loaded in the engine. The identity lets a
     * host ignore stale frames while this player is reloading in place. Used by
     * notation strips to ring the matching cell in time with the animation;
     * other hosts (gallery, Arena) omit it and pay no per-frame cost.
     */
    onStepChange?: (currentStep: number, sequenceId: string | null) => void;
    /** Exposes the player's canonical step seek without exposing its controller. */
    onSeekRef?: (seek: ((step: number) => void) | null) => void;
    /**
     * "full" (default) = external play button + BpmChips grid + the in-canvas
     * UnifiedTimeline scrubber (gallery detail, Arena).
     * "minimal" = tap-to-play canvas + the thin export-style progress line +
     * a mouse hover badge, no transport chrome — the embedded/showcase idiom
     * (feedback_minimal_player_chrome). Drive tempo externally via `externalBpm`.
     */
    chrome?: "full" | "minimal";
    /**
     * Show the α/β/γ start→end position indicator centered at the top of the
     * canvas. Educational overlay the guide turns on for hand-path exploration;
     * off by default so gallery/Arena embeds are unaffected.
     */
    showPlacementGlyph?: boolean;
    /**
     * Maximize the canvas: fill the whole container instead of reserving
     * vertical overhead for a header + progress pill. Minimal chrome hides both
     * by default (thin progress LINE, not the pill), so that reserved 8.5rem
     * otherwise shrinks the square for nothing. `showWordHeader` can opt the
     * header back in; other minimal hosts keep their current sizing.
     */
    fill?: boolean;
    /** Arrangement used when the canonical canvas is disassembled. `auto`
     *  (default) takes whichever of the vertical stack or the sidecar gives the
     *  hero more room in the host; pass one explicitly to pin it. */
    disassemblyLayout?: "stacked" | "sidecar" | "auto";
    /** Shared stage-level disassembly intent. The canvas still owns the visual
     *  state machine; the host owns whether every retained canvas is open. */
    disassemblyTarget?: boolean | null;
    onDisassemblyTargetChange?: (disassembled: boolean) => void;
    /** Show the sequence word above the canvas and highlight its live step.
     *  Explicit opt-in keeps existing fill-mode embeds canvas-only. */
    showWordHeader?: boolean;
    /**
     * Upgrade the minimal-chrome progress LINE into a seekable scrubber (drag/
     * click/keyboard to seek). Scrubbing pauses playback; releasing resumes it
     * only if it was already playing (SequenceProgressBar's onScrubStart/
     * onScrubEnd contract). Off by default — existing minimal-chrome callers
     * (gallery/Arena embeds) keep the display-only line. Spec:
     * docs/superpowers/specs/2026-07-17-scrubbable-guide-showcases-design.md.
     */
    scrubbable?: boolean;
    /**
     * Play through once, then rest on the end pose instead of looping. Tapping
     * the canvas (or the hover badge) while resting on the end replays from the
     * start. Off by default so every existing looping caller is byte-identical.
     */
    singlePlay?: boolean;
    /**
     * Show the canvas's Start/End text overlay (GlyphOverlay's isAtStartPlacement/
     * isAtEndPlacement indicator). On by default (unchanged for every existing
     * caller); the guide showcase turns it off — the on-screen strip already
     * labels "Start"/steps, so the canvas overlay is redundant there.
     */
    beatIndicators?: boolean;
    /**
     * Fires every time the loop wraps back to its start (not just once at
     * the end — a seamlessly-loopable sequence never truly "ends"). The
     * homepage hero attract act uses this boundary to decide when to swap
     * in the next sequence/prop; other hosts (gallery, Arena) omit it.
     */
    onLoopComplete?: () => void;
    /**
     * Supplies a fully loaded, position-linked sequence at a natural loop
     * boundary. Unlike a reactive prop reload, this keeps the existing clock
     * running and begins directly with the incoming sequence's first motion.
     */
    onSequenceBoundary?: () => PreparedSequenceHandoff | null;
    /**
     * Overrides the trail settings passed to the canvas. Null (default)
     * keeps today's behavior for every existing caller: the global
     * `animationSettings.trail` singleton. Set this instead of mutating
     * that singleton directly — the hero's vivid preset must not leak into
     * the in-app Compose panel, which reads the same singleton.
     */
    trailSettingsOverride?: TrailSettings | null;
    /**
     * Canvas background opacity, forwarded to AnimatorCanvas. At 0 the
     * engine requests an alpha context and CanvasSurface goes fully
     * transparent, so the host's own backdrop shows through — the
     * shape-matrix drill uses this to keep its mandala layer visible
     * underneath the props (same mechanism as the practice mirror).
     */
    backgroundAlpha?: number;
    /**
     * Per-tip effect assignments forwarded to the canvas. Without at least
     * one "trails" entry the render loop's hasTrailTips gate keeps
     * effectiveTrailsVisible false, so NO trails draw regardless of trail
     * settings — this player historically never passed one, which is why
     * inline surfaces showed no trails. The hero passes a cell-wide trails
     * map; hosts that omit it keep today's trail-less behavior.
     */
    tipEffectMap?: TipEffectMap;
    /** Per-instance effort (easing) overrides. Without this the canvas falls
     *  back to the global visibility manager's persisted effortPreset, so a
     *  visitor's (or Austen's) in-app easing choice leaks into public embeds.
     *  Cell-wide linear: `{ "*": { effort: "linear" } }`. */
    tipEffortMap?: TipEffortMap;
    /** Optional fire-renderer override for controlled previews and comparison
     *  surfaces. Omitted players retain the production effects configuration. */
    fireConfig?: Partial<FireOverlayConfig>;
    /** Isolated effect intent for test/editorial players. Omitted players keep
     *  the viewer-owned production configuration. */
    effectsConfigState?: EffectsConfigState;
    /** Hide the in-canvas letter glyph / step counter (chrome-free embeds
     *  like the caps live hero — "a prop floating in space"). */
    hideTkaGlyph?: boolean;
    hideStepNumbers?: boolean;
    /** Hide the diamond/box grid — pattern-trace embeds show only the prop. */
    gridVisible?: boolean;
    /** Suppress the canvas right-click / long-press settings menu so a locked
     *  public embed can't have its prop/effort/BPM changed out from under it. */
    disableContextMenu?: boolean;
    /** Adds "Download as a video" to the canvas right-click menu. Opt-in: this
     *  player owns the canvas, controller and panel state the video pipeline
     *  needs, but a gallery tile or a locked public hero has no business
     *  handing out an MP4 render. Create's workspace playback turns it on. */
    videoDownload?: boolean;
    /** Display-only mode. False strips ALL playback input from the minimal
     *  chrome — no tap-to-toggle, no hover play/pause badge, no progress line —
     *  so a locked hero is a pure continuous loop the visitor can't pause or
     *  scrub. Default true (every existing minimal caller keeps tap-to-play). */
    interactive?: boolean;
    /** Pointer-only affordance for the minimal canvas. Hosts that expose the
     *  corner control can suppress the center badge without disabling taps. */
    hoverHint?: "badge" | "none";
    /** Show the canvas-owned keyboard-accessible play/pause button. */
    cornerToggle?: boolean;
    /** Keeps a persistent transport action adjacent to a minimal scrubber. */
    showScrubberPlaybackControl?: boolean;
    /** Pause this player while its host is not visible. Returning to view does
     *  not resume motion unless autoplay has not happened yet. */
    playbackAllowed?: boolean;
    /** Resume a player that this host permission gate paused. User-paused
     *  playback stays paused. Message previews use this while a hover briefly
     *  lends the single live slot to another card. */
    resumeWhenPlaybackAllowed?: boolean;
    /** Hands the internal play/pause toggle to the host (external keyboard
     *  control, demo acts). Same contract as AnimationPlayer's prop of the
     *  same name. */
    onTogglePlaybackRef?: (toggleFn: () => void) => void;
    /** Fires after the sequence and its playback services are ready. The load
     * identity lets a retained host reject an older async reload. */
    onReady?: (loadIdentity: string | null) => void;
    /** Fires after AnimatorCanvas has initialized and painted its first frame.
     *  Heavy dual-source hosts wait for this before revealing a prewarmed
     *  replacement; `onReady` only means the sequence data is loaded. */
    onCanvasInitialized?: () => void;
    /** Reports an engine/data load failure to a host that keeps a poster above
     *  the player until readiness is confirmed. */
    /** Reports the load identity so retained hosts can reject a stale failure. */
    onLoadError?: (message: string, loadIdentity: string | null) => void;
    /** Per-instance visibility manager (ephemeral scope). Routes the
     *  orchestrator's effort/path-shape reads AND setSpeed's write-back away
     *  from the global singleton, so a public embed neither inherits the
     *  visitor's in-app settings nor mutates them. Forwarded to AnimatorCanvas
     *  so the engine-side reads scope the same way. */
    visibilityManagerOverride?: AnimationVisibilityStateManager;
    primaryPropColors?: ViewerCustomColorPair | null;
    /** Optional prop timing/direction relationship for the canvas's top-right corner. */
    propElementalType?: ElementalType | null;
    /** Let annotation chrome use a rectangular host while preserving the
     *  centered square motion plane. */
    glyphFrame?: GlyphOverlayFrameMode;
    /** Optional adaptive-quality ceiling for performance-sensitive embeds. */
    initialQualityTier?: QualityTier;
    /** Fractional playback position applied immediately after each load. */
    initialStep?: number | null;
    /** Scoped embeds must not inherit or write the user's playback defaults. */
    ephemeral?: boolean;
  } = $props();

  const minimal = $derived(chrome === "minimal");

  // Services - per-instance to allow multiple simultaneous players (e.g., Arena)
  let playbackController: AnimationPlaybackController | null = null;

  // Off-screen / hidden-tab gating for THIS player's playhead loop. The canvas
  // render loop is gated independently inside CanvasSurface; this one stops the
  // clock that advances the sequence. Created at component init (no DOM work,
  // SSR-safe) and attached to the root element by `use:renderGateTarget`.
  const activityGate = createRenderActivityGate({
    name: "inline-animation-player",
  });
  let servicesReady = $state(false);
  let loading = $state(true);
  // Once true, reloads never return to the loading-state branch — see the
  // template comment (unmounting the canvas there kills the engine mid-swap).
  let hasLoadedOnce = $state(false);
  let error = $state<string | null>(null);

  // Animation state - each player gets its own
  const animationState = createAnimationPanelState({ ephemeral });
  let appliedExternalPlaybackMode: PlaybackMode | null = null;

  // Right-click on a <canvas> is a dead gesture: unlike a real <video>, the
  // browser has no "Save video as..." to offer, so nothing about the animation
  // says it can leave the page. This adds the artifact people actually post —
  // the same MP4 the export panel renders, reached without opening it. This
  // player owns all three things the video pipeline needs (live canvas,
  // controller, panel state), so it runs the export itself rather than
  // routing through the drawer.
  let liveCanvas = $state<HTMLCanvasElement | null>(null);
  let isVideoExporting = $state(false);

  // Deliberately does NOT gate on playbackController: it is a plain `let`, so a
  // derived that read it would latch on whatever it saw at first evaluation and
  // never recompute. Both operands here are reactive and only settle once the
  // engine has loaded, by which point the controller exists; the action guards
  // it again anyway.
  const canDownloadVideo = $derived(
    videoDownload && !!liveCanvas && !!animationState.sequenceData
  );

  async function downloadAnimationVideo(): Promise<void> {
    const canvas = liveCanvas;
    const controller = playbackController;
    const seq = animationState.sequenceData;
    if (isVideoExporting || !canvas || !controller || !seq) return;

    isVideoExporting = true;
    let progressToastId: string | null = null;

    try {
      progressToastId = showToast({
        message: "Rendering video from this animation…",
        type: "info",
        duration: 0,
      });

      // The video orchestrator is registered by whichever surface loaded it
      // first (usually the export drawer). This player can be the first one
      // here, so it registers the same lazily-loaded singleton rather than
      // failing with "orchestrator not available".
      const exportOrchestrator = getExportOrchestrator();
      const videoExportOrchestrator = await ensureVideoExportOrchestrator();
      exportOrchestrator.setVideoOrchestrator(videoExportOrchestrator);

      await exportOrchestrator.export(
        seq,
        { format: "animation" },
        {
          animationDependencies: {
            canvas,
            playbackController: controller,
            animationState,
          },
        }
      );
      toast.success("Video downloaded.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Video export could not finish."
      );
    } finally {
      if (progressToastId) removeToast(progressToastId, "programmatic");
      isVideoExporting = false;
    }
  }

  const videoMenuItems = $derived<ContextMenuEntry[]>(
    canDownloadVideo
      ? [
          {
            id: "download-animation-video",
            label: isVideoExporting
              ? "Rendering video…"
              : "Download as a video",
            icon: "fa-file-arrow-down",
            disabled: isVideoExporting,
            action: downloadAnimationVideo,
          },
        ]
      : []
  );

  // Track last loaded sequence to prevent re-loading same sequence
  // Also prevents remounts during prop type changes (hot-swap handles those)
  let lastLoadedSequenceId: string | null = null;

  function getSequenceLoadId(seq: SequenceData): string | null {
    return seq.id || seq.word || seq.name || null;
  }

  // Local reactive state for UI
  let isPlaying = $state(false);
  let bpm = $state(DEFAULT_BPM); // 60 BPM = 1.0x speed

  // Sync playing state from animation state
  $effect(() => {
    const checkPlaying = () => {
      const current = animationState.isPlaying;
      if (current !== isPlaying) {
        isPlaying = current;
      }
    };
    checkPlaying();
    const interval = setInterval(checkPlaying, 50);
    return () => clearInterval(interval);
  });

  $effect(() => {
    const mode = externalPlaybackMode;
    if (
      mode === null ||
      mode === appliedExternalPlaybackMode ||
      !servicesReady ||
      !playbackController
    )
      return;

    appliedExternalPlaybackMode = mode;
    const controller = playbackController;
    const wasPlaying = animationState.isPlaying;
    untrack(() => {
      if (wasPlaying) controller.togglePlayback();
      animationState.setPlaybackMode(mode);
      if (wasPlaying) controller.togglePlayback();
    });
  });

  let pausedByPlaybackGate = false;

  $effect(() => {
    if (!servicesReady || !animationState.sequenceData || !playbackController)
      return;
    const controller = playbackController;

    if (externalStep !== null) {
      if (animationState.isPlaying) untrack(() => controller.togglePlayback());
      return;
    }

    if (externalPlaying !== null) {
      const shouldPlay = externalPlaying && playbackAllowed;
      if (animationState.isPlaying !== shouldPlay) {
        untrack(() => controller.togglePlayback());
      }
      return;
    }

    if (!playbackAllowed) {
      if (!isPlaying) return;
      pausedByPlaybackGate = resumeWhenPlaybackAllowed;
      untrack(() => controller.togglePlayback());
      return;
    }

    if (!resumeWhenPlaybackAllowed || !pausedByPlaybackGate || isPlaying) {
      return;
    }

    pausedByPlaybackGate = false;
    untrack(() => controller.togglePlayback());
  });

  $effect(() => {
    const step = externalStep;
    if (step === null || !servicesReady || loading || !playbackController)
      return;
    untrack(() => playbackController?.calculateStateForStep(step));
  });

  const canvasPlaying = $derived(
    externalStep !== null ? (externalPlaying ?? false) : isPlaying
  );

  // Derived state for canvas
  // Letters are a PROP-only glyph — a hand pictograph never shows one (a hand has
  // no thumb/pinky reference to letter). When this player renders hands, suppress
  // the letter overlay entirely (start-placement Greek letter + per-step letter).
  // Prop/staff renders (gallery, Arena) pass a non-hand type → unchanged.
  const isHandRender = $derived(
    (leftPropType ?? "").toLowerCase() === "hand" ||
      (rightPropType ?? "").toLowerCase() === "hand"
  );

  let currentLetter = $derived.by(() => {
    if (isHandRender) return null;
    if (!animationState.sequenceData) return null;
    const currentStep = animationState.currentStep;

    // At start position phase (before beat 1) - show Greek letter (α, β, γ)
    if (currentStep < 1) {
      return getStartPlacementLetter();
    }

    // At the end-hold (freeform sequences pause on the final position before
    // looping) - show the held position's Greek letter, not the last step's
    // letter. Loopable sequences wrap before reaching here so this stays inert.
    const stepCount = animationState.sequenceData.steps?.length ?? 0;
    if (stepCount > 0 && currentStep >= stepCount + 0.99) {
      return getEndPlacementLetter();
    }

    if (animationState.sequenceData.steps?.length > 0) {
      // currentStep is 1-based: currentStep 1.0-2.0 = beat 1 (uses steps[0])
      const stepIndex = Math.max(0, Math.floor(currentStep) - 1);
      const clampedIndex = Math.min(
        stepIndex,
        animationState.sequenceData.steps.length - 1
      );
      return animationState.sequenceData.steps[clampedIndex]?.letter || null;
    }

    return null;
  });

  let currentStepData = $derived.by(() => {
    if (!animationState.sequenceData) return null;
    const currentStep = animationState.currentStep;

    if (currentStep < 1 && animationState.sequenceData.startPlacement) {
      return animationState.sequenceData.startPlacement;
    }

    if (animationState.sequenceData.steps?.length > 0) {
      // currentStep is 1-based: currentStep 1.0-2.0 = beat 1 (uses steps[0])
      const stepIndex = Math.max(0, Math.floor(currentStep) - 1);
      const clampedIndex = Math.min(
        stepIndex,
        animationState.sequenceData.steps.length - 1
      );
      return animationState.sequenceData.steps[clampedIndex] || null;
    }

    return null;
  });

  // Prefer sequence prop's gridMode (always current) over animation state (may be stale during switch)
  let gridMode = $derived(
    sequence?.gridMode ?? animationState.sequenceData?.gridMode
  );

  // Load services on mount - create per-instance playback stack so multiple
  // InlineAnimationPlayers can run simultaneously (e.g., Arena side-by-side)
  onMount(async () => {
    try {
      // Stateful services - fresh instance per player
      const stateManager = new AnimationStateManager();
      const loop = new AnimationLoop();
      const orchestrator = new SequenceAnimationOrchestrator(
        stateManager,
        getViewerAnimationPropConfig
      );
      if (visibilityManagerOverride) {
        orchestrator.setVisibilityManager(visibilityManagerOverride);
      }
      playbackController = new AnimationPlaybackController(orchestrator, loop, {
        // Inline players can sit beside Create. Their local clock must never
        // drive the workspace's beat highlight for an unrelated sequence.
        syncSharedWorkspaceState: false,
      });
      playbackController.setActivityGate(playbackGate ?? activityGate);
      playbackController.onLoopComplete(() => onLoopComplete?.());
      playbackController.onSequenceBoundary(() => {
        const handoff = onSequenceBoundary?.() ?? null;
        if (!handoff) return null;

        return {
          sequence: handoff.sequence,
          accept: () => {
            // The controller already loaded this sequence. Set the guard before
            // the host publishes its matching prop so the reactive sequence
            // effect cannot pause, reset, and load it a second time.
            lastLoadedSequenceId = getSequenceLoadId(handoff.sequence);
            handoff.accept();
          },
        };
      });

      servicesReady = true;
    } catch (err) {
      console.error("Failed to initialize animation player:", err);
      error = "Failed to load animation";
      loading = false;
    }
  });

  onDestroy(() => {
    activityGate.dispose();
    playbackController?.offLoopComplete();
    playbackController?.offSequenceBoundary();
    playbackController?.dispose();
    animationState.dispose();
  });

  // Sync external BPM to playback speed when provided.
  //
  // untrack() the imperative push: setSpeed() reads reactive playback state and
  // fans its change out to every registered visibility-manager observer. Left
  // tracked, those reads become dependencies of THIS effect, so its own side
  // effect re-triggers it — an unbounded loop that trips
  // effect_update_depth_exceeded on hosts with many pictograph observers mounted
  // (the guide reader stacks 100+). The effect must react to externalBpm ALONE.
  $effect(() => {
    if (externalBpm !== null && playbackController) {
      const speed = externalBpm / DEFAULT_BPM;
      const pc = playbackController;
      untrack(() => {
        pc.setSpeed(speed);
        bpm = externalBpm;
      });
    }
  });

  // Report the live playback step to an external consumer (the guide reader
  // rings the matching on-screen strip cell in sync). Read `onStepChange` first
  // so hosts that omit it never take a dependency on currentStep — no per-frame
  // effect for gallery/Arena. untrack the callback so a consumer that writes
  // state (the reader mutates its active-step signal) can't feed back into and
  // re-trigger this effect (the same footgun the externalBpm effect avoids).
  $effect(() => {
    const cb = onStepChange;
    if (!cb || loading) return;
    const step = animationState.currentStep;
    const sequenceId = animationState.sequenceData?.id ?? null;
    untrack(() => cb(step, sequenceId));
  });

  // Autoplay: fires at most once per successfully-loaded sequence, whenever
  // `autoPlay` is true. Reactive to the PROP (not just read once at load time)
  // so a caller whose `autoPlay` starts false and flips true later — the guide
  // showcase, which waits for its first scroll-into-view before playing — gets
  // its one autoplay exactly when that happens. Existing static `autoPlay={true}`
  // callers (gallery, Arena) behave identically to before: this fires once, at
  // load, after the same 300ms settle delay the old inline call used.
  let autoPlayedForLoadId: string | null = null;
  $effect(() => {
    // Guard order is load-bearing: `servicesReady` and `sequenceData` are
    // REACTIVE and must be read before the plain (non-$state)
    // `playbackController` variable. Short-circuiting on the plain variable
    // first leaves this effect with no reactive dependency that changes when
    // the async load completes, so an `autoPlay` that was already true (the
    // showcase scrolled into view before load finished) would arm once, miss,
    // and never retry.
    if (
      !autoPlay ||
      externalStep !== null ||
      externalPlaying !== null ||
      !playbackAllowed ||
      !servicesReady ||
      !animationState.sequenceData
    )
      return;
    if (!playbackController) return;
    const loadId = lastLoadedSequenceId;
    if (autoPlayedForLoadId === loadId) return;
    if (animationState.isPlaying) {
      autoPlayedForLoadId = loadId;
      return;
    }
    const pc = playbackController;
    const autoplayTimer = setTimeout(() => {
      untrack(() => {
        if (
          pc === playbackController &&
          autoPlay &&
          playbackAllowed &&
          autoPlayedForLoadId !== loadId
        ) {
          autoPlayedForLoadId = loadId;
          pc.togglePlayback();
        }
      });
    }, autoPlayDelay);
    return () => clearTimeout(autoplayTimer);
  });

  // Watch for sequence changes and reload animation
  // Only triggers when sequence ID changes, not on every state update
  $effect(() => {
    const sequenceId = sequence
      ? (sequenceLoadKey ?? getSequenceLoadId(sequence))
      : null;

    if (sequence && servicesReady && sequenceId !== lastLoadedSequenceId) {
      // Use untrack to avoid creating dependency on isPlaying
      untrack(() => {
        // Stop any currently playing animation
        if (animationState.isPlaying) {
          playbackController?.togglePlayback();
        }
        // Reset state and reload
        animationState.reset();
        lastLoadedSequenceId = sequenceId ?? null;
        loadAnimation();
      });
    }
  });

  async function loadAnimation() {
    if (!playbackController || !sequence) return;

    const loadStartedAt = import.meta.env.DEV ? performance.now() : 0;
    const loadIdentity =
      sequenceLoadKey ?? getSequenceLoadId(sequence) ?? "unknown";
    loading = true;
    error = null;

    try {
      // Load full sequence data if needed
      const fullSequence = await loadSequenceData(sequence);

      if (!fullSequence) {
        throw new Error("Failed to load sequence data");
      }

      // Initialize playback. singlePlay reverses the loop flag: rest on the
      // end pose instead of looping (the `shouldLoop` seam the controller
      // already implements — see animation-playback-controller.ts's
      // shouldLoop branches in onAnimationUpdate/runStepPlaybackTick).
      animationState.setShouldLoop(!singlePlay);
      const success = playbackController.initialize(
        fullSequence,
        animationState
      );

      if (!success) {
        throw new Error("Failed to initialize playback");
      }

      // Note: playbackController.initialize() already sets normalized sequence data on the state
      // Autoplay is handled by the reactive $effect above (fires once per load).

      // Apply the initial external BPM AFTER initialize(). initialize() resets
      // playback speed to the 1.0x default, so the reactive externalBpm $effect
      // (which runs at most once, before the async load completes, and never
      // again for a static prop since `playbackController` isn't $state) can't
      // land the hardcoded tempo — a locked embed stays stuck at DEFAULT_BPM
      // (60). Re-apply here so the shipped BPM takes on first play; the $effect
      // still handles later runtime changes.
      if (externalBpm !== null) {
        playbackController.setSpeed(externalBpm / DEFAULT_BPM);
        bpm = externalBpm;
      }

      if (externalPlaybackMode !== null) {
        animationState.setPlaybackMode(externalPlaybackMode);
        appliedExternalPlaybackMode = externalPlaybackMode;
      }

      if (externalStep !== null) {
        playbackController.calculateStateForStep(externalStep);
      } else if (initialStep !== null) {
        playbackController.seekToStep(initialStep);
      }

      hasLoadedOnce = true;
      onReady?.(loadIdentity);
    } catch (err) {
      console.error("Failed to load animation:", err);
      error = err instanceof Error ? err.message : "Failed to load animation";
      onLoadError?.(error, loadIdentity);
    } finally {
      loading = false;
      if (import.meta.env.DEV) {
        performance.measure(`inline-animation:load:${loadIdentity}`, {
          start: loadStartedAt,
          end: performance.now(),
        });
      }
    }
  }

  async function loadSequenceData(
    seq: SequenceData
  ): Promise<SequenceData | null> {
    const hasMotionData = (s: SequenceData) =>
      Array.isArray(s.steps) &&
      s.steps.length > 0 &&
      s.steps.some((step) => step?.motions?.left && step?.motions?.right);

    if (hasMotionData(seq)) {
      return seq;
    }

    // Try to load from gallery
    const identifier = seq.word || seq.name || seq.id;
    if (identifier) {
      const { getSequenceRepository } =
        await import("$lib/shared/create/get-sequence-repository");
      const loaded = await getSequenceRepository().getSequence(identifier);
      if (loaded && hasMotionData(loaded)) {
        return loaded;
      }
    }

    return seq;
  }

  // Single-play "ended" check: past the final beat's motion (mirrors the
  // currentLetter/getEndPlacementLetter end-hold check above).
  function isAtEnd(): boolean {
    const stepCount = animationState.sequenceData?.steps?.length ?? 0;
    return stepCount > 0 && animationState.currentStep >= stepCount + 0.99;
  }

  $effect(() => {
    onTogglePlaybackRef?.(togglePlayback);
  });

  function togglePlayback() {
    if (externalPlaying !== null) {
      onExternalPlayingChange?.(!externalPlaying);
      return;
    }
    if (!playbackController) return;
    // Single-play rests on the end pose instead of looping — tapping/hover-
    // badge "play" from there must replay from the start, not silently no-op
    // (togglePlayback() alone would start the loop already-at-end and stop it
    // again on the very next tick). Gated to singlePlay so every looping
    // caller (shouldLoop=true) keeps today's exact resume-from-pause behavior.
    if (singlePlay && !animationState.isPlaying && isAtEnd()) {
      playbackController.stop();
    }
    playbackController.togglePlayback();
    // Most UI can tolerate the 50ms polling mirror above, but a direct export
    // must know synchronously whether its temporary playback actually paused.
    // Read the controller's authoritative state immediately after toggling.
    isPlaying = animationState.isPlaying;
  }

  function handleBpmChange(newBpm: number) {
    bpm = newBpm;
    const speed = newBpm / DEFAULT_BPM;
    playbackController?.setSpeed(speed);
  }

  // ── Scrub (seekable progress line) ──────────────────────────────────────
  // SequenceProgressBar's onSeek reports a 0..1 ratio; AnimatorCanvas's own
  // playbackAdapter (created internally from currentStep/steps) converts that
  // ratio into a target STEP number before calling onProgressBarSeek — so this
  // handler receives a step, not a ratio. seekToStep() is the exact seam
  // UnifiedTimeline's own scrubber uses (mixes in the current fraction for an
  // integer beat, honors an exact fraction otherwise) and keeps the loop
  // running if it was already running.
  let wasPlayingBeforeScrub = false;
  function handleScrubStart() {
    if (externalStep !== null) {
      wasPlayingBeforeScrub = externalPlaying ?? false;
      if (wasPlayingBeforeScrub) onExternalPlayingChange?.(false);
      return;
    }
    wasPlayingBeforeScrub = animationState.isPlaying;
    if (wasPlayingBeforeScrub) playbackController?.togglePlayback();
  }
  function handleScrubEnd() {
    if (externalStep !== null) {
      if (wasPlayingBeforeScrub) onExternalPlayingChange?.(true);
      wasPlayingBeforeScrub = false;
      return;
    }
    if (wasPlayingBeforeScrub) playbackController?.togglePlayback();
    wasPlayingBeforeScrub = false;
  }
  function handleSeek(targetStep: number) {
    if (externalStep !== null) {
      onExternalSeek?.(targetStep);
      return;
    }
    playbackController?.seekToStep(targetStep);
  }

  // LazyMount forwards a newly-created props object whenever its host updates.
  // Svelte may therefore re-run this effect even when the callback identity is
  // unchanged. Publishing again makes state owners replay their pending seek,
  // pinning a continuous player inside that count. Keep imperative registration
  // at the callback-identity boundary instead of the spread-props boundary.
  let publishedSeekRef: typeof onSeekRef = undefined;

  $effect(() => {
    const nextSeekRef = onSeekRef;
    if (nextSeekRef === publishedSeekRef) return;

    const previousSeekRef = publishedSeekRef;
    publishedSeekRef = nextSeekRef;
    untrack(() => {
      previousSeekRef?.(null);
      nextSeekRef?.(handleSeek);
    });
  });

  onDestroy(() => {
    untrack(() => publishedSeekRef?.(null));
  });
</script>

<div class="inline-animation-player" use:renderGateTarget={activityGate}>
  {#if loading && !hasLoadedOnce}
    <!-- First load only. On RELOADS (sequence prop swap) this branch must NOT
         fire: flipping to it unmounts AnimatorCanvas, which destroys the whole
         engine — a fresh engine treats the prop-type override as a first-time
         assignment, so the morph crossfade is suppressed and the swap pops.
         Keeping the canvas mounted through reloads is what makes the in-place
         sequence swap (and the hero act's prop morph) actually seamless. -->
    <div class="loading-state">
      <ProgressRing percent={-1} size={24} strokeWidth={3} />
      <span>Loading animation...</span>
    </div>
  {:else if error}
    <div class="error-state">
      <span>{error}</span>
      <button class="retry-btn" onclick={() => loadAnimation()}>Retry</button>
    </div>
  {:else}
    <!-- Animation Canvas -->
    <div class="canvas-container" class:bare={backgroundAlpha === 0}>
      <AnimatorCanvas
        leftProp={animationState.leftPropState}
        rightProp={animationState.rightPropState}
        {gridVisible}
        {disableContextMenu}
        {visibilityManagerOverride}
        {gridMode}
        letter={currentLetter}
        stepData={currentStepData}
        sequenceData={animationState.sequenceData}
        word={animationState.sequenceData?.word ?? sequence.word}
        currentStep={animationState.currentStep}
        isPlaying={canvasPlaying}
        onPlaybackToggle={togglePlayback}
        trailSettings={trailSettingsOverride ?? animationSettings.trail}
        {backgroundAlpha}
        {tipEffectMap}
        {tipEffortMap}
        {fireConfig}
        {effectsConfigState}
        {leftPropType}
        {rightPropType}
        {primaryPropColors}
        placementGlyphVisible={showPlacementGlyph}
        {propElementalType}
        {glyphFrame}
        tapToToggle={minimal && interactive}
        progressLine={minimal && interactive}
        hoverHint={minimal && interactive ? hoverHint : "none"}
        fillContainer={fill}
        {disassemblyLayout}
        {disassemblyTarget}
        {onDisassemblyTargetChange}
        {hideTkaGlyph}
        {hideStepNumbers}
        hideHeader={fill && !showWordHeader}
        hideProgressBar={fill && !scrubbable}
        {cornerToggle}
        {showScrubberPlaybackControl}
        onInitialized={onCanvasInitialized}
        onCanvasReady={(canvas) => (liveCanvas = canvas)}
        extraContextMenuItems={videoMenuItems}
        onProgressBarSeek={scrubbable ? handleSeek : null}
        onProgressBarScrubStart={scrubbable ? handleScrubStart : null}
        onProgressBarScrubEnd={scrubbable ? handleScrubEnd : null}
        {beatIndicators}
        {initialQualityTier}
      />
    </div>

    <!-- Controls (full chrome only — minimal uses tap-to-play + progress line) -->
    {#if showControls && !minimal}
      <div class="controls">
        <button
          class="control-btn play-btn"
          onclick={togglePlayback}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {#if isPlaying}
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          {:else}
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          {/if}
        </button>

        <div class="bpm-controls">
          <BpmChips {bpm} variant="compact" onBpmChange={handleBpmChange} />
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .inline-animation-player {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    gap: 8px;
  }

  .canvas-container {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
    overflow: hidden;
  }

  /* backgroundAlpha === 0 means the caller wants a fully transparent surface so
     the host backdrop shows through (the caps hero floating in space, the
     shape-matrix mandala underneath the props). The dark backing + rounded frame
     contradict that — drop them so nothing paints behind the transparent canvas. */
  .canvas-container.bare {
    background: transparent;
    border-radius: 0;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 8px;
  }

  .control-btn {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 50%;
    color: var(--theme-text);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    flex-shrink: 0;
  }

  .control-btn svg {
    width: 20px;
    height: 20px;
  }

  .control-btn:hover {
    background: var(--theme-card-hover-bg);
  }

  .control-btn:active {
    transform: scale(0.95);
  }

  .play-btn {
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    background: linear-gradient(
      135deg,
      var(--semantic-info) 0%,
      color-mix(in srgb, var(--semantic-info) 80%, black) 100%
    );
    border-color: transparent;
  }

  .play-btn:hover {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--semantic-info) 80%, black) 0%,
      color-mix(in srgb, var(--semantic-info) 65%, black) 100%
    );
  }

  .bpm-controls {
    flex: 1;
    min-width: 0;
  }

  /* ===========================================
     WIDE LANDSCAPE LAYOUT (e.g., unfolded Z-Fold)
     Switch to side-by-side: canvas left, controls right
     =========================================== */
  @media (orientation: landscape) and (min-width: 600px) and (min-height: 400px) {
    .inline-animation-player {
      flex-direction: row;
      gap: 12px;
    }

    .canvas-container {
      flex: 1;
      min-width: 0;
      border-radius: 12px;
    }

    .controls {
      flex-direction: column;
      width: 140px;
      flex-shrink: 0;
      padding: 12px;
      border-radius: 12px;
      gap: 12px;
      justify-content: flex-start;
      align-items: stretch;
    }

    .control-btn.play-btn {
      width: 100%;
      height: var(--min-touch-target);
      border-radius: 10px;
    }

    .bpm-controls {
      flex: none;
      width: 100%;
    }

    /* Stack BPM chips vertically in sidebar */
    .bpm-controls :global(.bpm-chips.compact) {
      flex-wrap: wrap;
      gap: 6px;
    }

    .bpm-controls :global(.preset-chip) {
      flex: 1 1 calc(50% - 3px);
      min-width: 0;
      padding: 10px 4px;
    }

    /* Custom chip takes full width at bottom */
    .bpm-controls :global(.custom-chip) {
      flex: 1 1 100%;
      max-width: none;
    }
  }

  /* Extra wide screens (like tablets or larger foldables) - give controls more room */
  @media (orientation: landscape) and (min-width: 900px) and (min-height: 500px) {
    .controls {
      width: 160px;
    }
  }

  .loading-state,
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 32px;
    height: 100%;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm);
  }

  .error-state {
    color: color-mix(in srgb, var(--semantic-error) 50%, white);
  }

  .retry-btn {
    padding: 8px 16px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 6px;
    color: var(--theme-text);
    font-size: var(--font-size-compact);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .retry-btn:hover {
    background: var(--theme-card-hover-bg);
  }

  /* Reduce motion */
  @media (prefers-reduced-motion: reduce) {
    .control-btn,
    .retry-btn {
      transition: none;
    }
  }
</style>
