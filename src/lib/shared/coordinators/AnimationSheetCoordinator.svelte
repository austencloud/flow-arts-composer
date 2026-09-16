<!--
  AnimationSheetCoordinator.svelte

  Shared animation sheet coordinator that can be used across all modules.
  Decoupled from CreateModuleState - accepts sequence directly as a prop.

  This coordinator:
  - Manages animation playback lifecycle
  - Resolves services via DI
  - Handles video export
  - Provides clean prop interface for any module

  Usage:
    <AnimationSheetCoordinator
      sequence={yourSequence}
      bind:isOpen={showAnimator}
      bind:animatingStepNumber={stepNum}
      combinedPanelHeight={panelHeight}
    />
-->
<script lang="ts">
  import { getAnimationPlaybackController } from "$lib/shared/animation-engine/get-animation-playback-controller";
  import { ensureVideoExportOrchestrator } from "$lib/shared/animation-engine/get-video-export-orchestrator";
  import { getVideoExporter } from "$lib/shared/animation-engine/get-video-exporter";
  import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import AnimationShareDrawer from "../animation-engine/components/AnimationShareDrawer.svelte";
  import type { AnimationPlaybackController } from "$lib/shared/animation-engine/services/animation-playback-controller";
  import type {
    IVideoExportOrchestrator,
    VideoExportProgress,
    VideoExportFormat,
  } from "$lib/shared/compose/domain/video-export-types";
  import type { VideoExporter } from "$lib/shared/animation-engine/services/video-exporter";
  import { createAnimationPanelState } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
  import type { PublicSequencesLoader } from "$lib/shared/browse/services/public-sequences-loader";
  import { isSeamlesslyLoopable } from "$lib/shared/foundation/services/sequence-loopability-checker";
  import { getBrowseLoader } from "$lib/shared/browse/get-browse-loader";
  import {
    getCurrentAnimationPanelState,
    updateAnimationPanelState,
    openAnimationPanel,
    closeSheet,
    onRouteChange,
  } from "$lib/shared/navigation/services/sheet-router";
  import type { SequenceData } from "../foundation/domain/models/sequence-data";
  import type { HapticFeedback } from "../application/services/haptic-feedback";
  import { onMount, onDestroy } from "svelte";
  import {
    ANIMATION_LOAD_DELAY_MS,
    ANIMATION_AUTO_START_DELAY_MS,
    VIDEO_EXPORT_SUCCESS_DELAY_MS,
  } from "$lib/shared/animation-engine/domain/constants/timing";
  import type { AnimationPanelState } from "../navigation/services/types";
  import { createComponentLogger } from "../utils/debug-logger";
  import { setAnimationPlaybackRef } from "./animation-playback-ref.svelte";

  const debug = createComponentLogger("AnimationSheetCoordinator");

  // Props - decoupled from any specific module state
  let {
    sequence = $bindable(), // Sequence to animate (from any source)
    isOpen = $bindable(), // Sheet visibility
    animatingStepNumber: _animatingBeatNumber = $bindable(), // Current beat (optional)
    combinedPanelHeight = 0, // Panel height (optional)
  }: {
    sequence?: SequenceData | null;
    isOpen?: boolean;
    animatingStepNumber?: number | null;
    combinedPanelHeight?: number;
  } = $props();

  // Services
  let browseLoader: PublicSequencesLoader | null = null;
  let playbackController: AnimationPlaybackController | null = null;
  let hapticService: HapticFeedback | null = null;
  let videoExportOrchestrator: IVideoExportOrchestrator | null = null;
  let VideoExporter: VideoExporter | null = null;
  let animationCanvas: HTMLCanvasElement | null = null;

  // State to track service readiness
  let servicesReady = $state(false);

  // Animation state
  const animationPanelState = createAnimationPanelState();

  // Local reactive state that syncs with animationPanelState
  // Using $state + $effect pattern because the factory's getter pattern breaks fine-grained reactivity
  let isPlayingLocal = $state(false);

  // Sync isPlaying from state factory - this $effect subscribes to state changes
  // Polling workaround: The state factory's getter pattern breaks Svelte 5 fine-grained reactivity
  $effect(() => {
    const checkPlaying = () => {
      const current = animationPanelState.isPlaying;
      if (current !== isPlayingLocal) {
        isPlayingLocal = current;
      }
    };
    checkPlaying();
    const interval = setInterval(checkPlaying, 50);
    return () => clearInterval(interval);
  });

  // Video export state
  let _showExportDialog = $state(false);
  let isExporting = $state(false);
  let _exportProgress = $state<VideoExportProgress | null>(null);

  // Track if we're currently responding to a route change to avoid infinite loops
  let isRespondingToRouteChange = false;

  // Derived: Current letter from sequence data
  // Uses same indexing as SequenceAnimationOrchestrator:
  // - currentStep < 1: start position (the pose before animation begins)
  // - currentStep >= 1: motion steps where beat N uses steps[N-1]
  let currentLetter = $derived.by(() => {
    if (!animationPanelState.sequenceData) return null;

    const currentStep = animationPanelState.currentStep;

    // Start position: currentStep < 1 (before beat 1 starts)
    // This matches SequenceAnimationOrchestrator's check
    if (currentStep < 1 && animationPanelState.sequenceData.startPlacement) {
      return animationPanelState.sequenceData.startPlacement.letter || null;
    }

    // Motion steps: currentStep >= 1
    if (
      animationPanelState.sequenceData.steps &&
      animationPanelState.sequenceData.steps.length > 0
    ) {
      // Beat indexing: steps[0] = beat 1, steps[1] = beat 2, etc.
      // currentStep semantics: beat N's motion spans from N.0 to (N+1).0
      //
      // Formula: ceil(currentStep - 1) gives the beat number whose motion is/was playing
      // - At 3.0 (pause after beat 2): ceil(2.0) = 2, shows beat 2
      const stepNumber = Math.ceil(currentStep - 1);
      const stepIndex = Math.max(0, stepNumber - 1);
      const clampedIndex = Math.min(
        stepIndex,
        animationPanelState.sequenceData.steps.length - 1
      );
      return (
        animationPanelState.sequenceData.steps[clampedIndex]?.letter || null
      );
    }

    return null;
  });

  // Derived: Current step data (for turns tuple generation)
  // Uses same indexing as SequenceAnimationOrchestrator:
  // - currentStep < 1: start position
  // - currentStep >= 1: motion steps where beat N uses steps[N-1]
  let currentStepData = $derived.by(() => {
    if (!animationPanelState.sequenceData) return null;

    const currentStep = animationPanelState.currentStep;

    // Start position: currentStep < 1 (before beat 1 starts)
    if (currentStep < 1 && animationPanelState.sequenceData.startPlacement) {
      return animationPanelState.sequenceData.startPlacement;
    }

    // Motion steps: currentStep >= 1
    if (
      animationPanelState.sequenceData.steps &&
      animationPanelState.sequenceData.steps.length > 0
    ) {
      // Beat indexing: steps[0] = beat 1, steps[1] = beat 2, etc.
      // currentStep semantics: beat N's motion spans from N.0 to (N+1).0
      //
      // Formula: ceil(currentStep - 1) gives the beat number whose motion is/was playing
      // - At 3.0 (pause after beat 2): ceil(2.0) = 2, shows beat 2
      const stepNumber = Math.ceil(currentStep - 1);
      const stepIndex = Math.max(0, stepNumber - 1);
      const clampedIndex = Math.min(
        stepIndex,
        animationPanelState.sequenceData.steps.length - 1
      );
      return animationPanelState.sequenceData.steps[clampedIndex] || null;
    }

    return null;
  });

  // Resolved grid mode: prefer animation state's gridMode, fallback to sequence's gridMode
  let resolvedGridMode = $derived(
    animationPanelState.sequenceData?.gridMode ?? sequence?.gridMode
  );

  // Check if sequence is seamlessly loopable (for loop count selector)
  let isCircular = $derived.by(() => {
    const seq = animationPanelState.sequenceData;
    if (!seq) return false;
    return isSeamlesslyLoopable(seq);
  });

  // Export loop count from state
  let exportLoopCount = $derived(animationPanelState.exportLoopCount);

  function handleLoopCountChange(count: number) {
    animationPanelState.setExportLoopCount(count);
  }

  // Track last loaded sequence ID to prevent unnecessary remounts during prop type changes
  let lastLoadedSequenceId: string | null = null;

  // Track route listener cleanup at module level
  let cleanupRouteListener: (() => void) | undefined;

  // Cleanup on destroy
  onDestroy(() => {
    cleanupRouteListener?.();
  });

  // Resolve services on mount
  onMount(() => {
    debug.log("Resolving services...");

    // Resolve core services via ITI container
    try {
      hapticService = getHapticFeedback();
      debug.success("Core services resolved");
    } catch (error) {
      console.error("Failed to resolve core services:", error);
    }

    // Resolve animation-specific services (all registered synchronously via ITI)
    try {
      browseLoader = getBrowseLoader();
      playbackController = getAnimationPlaybackController();
      VideoExporter = getVideoExporter();
      // videoExportOrchestrator is resolved at export time, not here: its
      // factory registers in composition-root/deferred-registrations, which the
      // root layout schedules on an idle callback. Browse mounts this
      // coordinator well before that idle slot on a cold /browse/library load,
      // so resolving eagerly threw and took playback setup down with it.

      // Expose playback controller for keyboard shortcuts
      setAnimationPlaybackRef(playbackController);

      servicesReady = true;
      debug.success(
        "Animation services resolved, ready to initialize playback"
      );
    } catch (error) {
      console.error("Failed to resolve animation services:", error);
      animationPanelState.setError("Failed to initialize animation services");
    }

    // Listen for route changes to restore animation panel from URL
    cleanupRouteListener = onRouteChange((state) => {
      isRespondingToRouteChange = true;

      const sheetType = state.sheet;
      if (sheetType === "animation") {
        // Open animation panel if it's not already open
        if (!isOpen) {
          isOpen = true;
        }

        // Restore animation state from URL if available
        if (state.animationPanel) {
          restoreAnimationState(state.animationPanel);
        }
      } else if (isOpen && sheetType && sheetType !== null) {
        // Close animation panel if a different sheet is opened (not animation, not null)
        const otherSheets: readonly string[] = [
          "settings",
          "auth",
          "terms",
          "privacy",
        ];
        if (otherSheets.includes(sheetType)) {
          isOpen = false;
        }
      } else if (isOpen && !sheetType) {
        // Close animation panel if no sheet is in URL (user swiped away or pressed back)
        isOpen = false;
      }

      // Reset flag after a tick to allow effects to run
      setTimeout(() => {
        isRespondingToRouteChange = false;
      }, 0);
    });

    // Check if animation panel should be open on initial load
    const initialState = getCurrentAnimationPanelState();
    if (initialState) {
      isOpen = true;
    }
  });

  // Load and auto-start animation when panel becomes visible
  // Also reloads when sequence changes (e.g., after rotation) while panel is open
  // Only trigger full loading for truly different sequences (ID changes)
  // Prop type changes within same sequence should not cause remounts - AnimationEngine handles hot-swap
  $effect(() => {
    debug.log("Animation effect triggered:", {
      isOpen,
      servicesReady,
      hasSequence: !!sequence,
      sequenceId: sequence?.id,
      sequenceWord: sequence?.word,
      stepCount: sequence?.steps?.length,
      hasMotionData: sequence?.steps?.some(
        (b) => b?.motions?.left && b?.motions?.right
      ),
      hasPlaybackController: !!playbackController,
      hasBrowseLoader: !!browseLoader,
    });

    // Wait for services to be ready AND panel to be open AND sequence to exist
    if (
      isOpen &&
      servicesReady &&
      sequence &&
      browseLoader &&
      playbackController
    ) {
      // Check if this is the same sequence (prop type change only)
      const currentSequenceId =
        sequence.id || sequence.word || sequence.name || "unknown";
      const isSameSequence = currentSequenceId === lastLoadedSequenceId;

      if (isSameSequence) {
        // Same sequence, just prop type or other metadata change
        // Don't trigger loading state - AnimationEngine hot-swap handles prop changes
        debug.log(
          "Same sequence, skipping reload (prop type change handled by hot-swap)"
        );
        return undefined;
      }

      debug.success("All conditions met, loading animation...");
      animationPanelState.setLoading(true);
      animationPanelState.setError(null);

      const loadTimeout = setTimeout(() => {
        loadAndStartAnimation(sequence, currentSequenceId);
      }, ANIMATION_LOAD_DELAY_MS);

      return () => clearTimeout(loadTimeout);
    } else if (isOpen && sequence && !servicesReady) {
      debug.info("Waiting for animation services to be ready...");
    }
    return undefined;
  });

  async function loadAndStartAnimation(seq: SequenceData, sequenceId: string) {
    if (!browseLoader || !playbackController) return;

    animationPanelState.setLoading(true);
    animationPanelState.setError(null);

    try {
      // Inline sequence loading
      const loadedSequence = await loadSequenceData(seq, browseLoader);

      if (!loadedSequence) {
        throw new Error("Failed to load sequence");
      }

      animationPanelState.setShouldLoop(true);
      const success = playbackController.initialize(
        loadedSequence,
        animationPanelState
      );

      if (!success) {
        throw new Error("Failed to initialize animation playback");
      }

      // Track the loaded sequence ID
      lastLoadedSequenceId = sequenceId;

      animationPanelState.setSequenceData(loadedSequence);

      // Auto-start animation
      setTimeout(() => {
        playbackController?.togglePlayback();
      }, ANIMATION_AUTO_START_DELAY_MS);
    } catch (err) {
      console.error("❌ Failed to load sequence:", err);
      animationPanelState.setError(
        err instanceof Error ? err.message : "Failed to load sequence"
      );
    } finally {
      animationPanelState.setLoading(false);
    }
  }

  /**
   * Load and hydrate sequence data for animation
   */
  async function loadSequenceData(
    sequence: SequenceData | null,
    loader: PublicSequencesLoader
  ): Promise<SequenceData | null> {
    if (!sequence) return null;

    const hasMotionData = (s: SequenceData) =>
      Array.isArray(s.steps) &&
      s.steps.length > 0 &&
      s.steps.some((step) => step?.motions?.left && step?.motions?.right);

    // If sequence already has motion data, use it directly
    if (hasMotionData(sequence)) {
      // Normalize startPlacement and return
      return normalizeStartPlacement(sequence);
    }

    // Try to load from gallery using word/name (gallery sequences)
    const galleryId = sequence.word || sequence.id;
    if (galleryId) {
      try {
        const loaded = await loader.loadFullSequenceData(galleryId);
        if (loaded && hasMotionData(loaded)) {
          return normalizeStartPlacement(loaded);
        }
      } catch (err) {
        console.warn(`Could not load sequence from gallery: ${galleryId}`, err);
      }
    }

    // Return original sequence if we couldn't load motion data
    return normalizeStartPlacement(sequence);
  }

  /**
   * Normalize startPlacement field from legacy formats
   */
  function normalizeStartPlacement(sequence: SequenceData): SequenceData {
    const withStarting = sequence as unknown as {
      startingPlacement?: unknown;
    };
    if (!sequence.startPlacement && withStarting.startingPlacement) {
      return {
        ...sequence,
        startPlacement:
          withStarting.startingPlacement as SequenceData["startPlacement"],
      };
    }
    return sequence;
  }

  /**
   * Restore animation state from URL parameters
   * IMPORTANT: Only restores state on initial load, not during active playback
   * to prevent the URL sync from fighting with the animation loop.
   */
  function restoreAnimationState(urlState: AnimationPanelState) {
    if (!playbackController) return;

    // CRITICAL: Don't restore beat position if animation is currently playing
    // This prevents the URL sync effect from snapping the beat back to an integer
    // while the animation loop is continuously updating the fractional beat position.
    const isAnimationActive = animationPanelState.isPlaying;

    // Restore speed if specified (safe to do while playing)
    if (
      urlState.speed !== undefined &&
      urlState.speed !== animationPanelState.speed
    ) {
      playbackController.setSpeed(urlState.speed);
    }

    // Only restore current beat on initial load (when not playing)
    // During playback, the animation loop controls beat position
    if (
      !isAnimationActive &&
      urlState.currentStep !== undefined &&
      Math.floor(urlState.currentStep) !==
        Math.floor(animationPanelState.currentStep)
    ) {
      animationPanelState.setCurrentStep(urlState.currentStep);
    }

    // Note: sequenceId, isPlaying, and gridVisible would need additional handling
    // based on the specific requirements of your animation system
  }

  // Sync isOpen state with URL (both open and close)
  let previousIsOpen = isOpen;
  $effect(() => {
    if (!isRespondingToRouteChange) {
      if (isOpen && !previousIsOpen && sequence) {
        // Opening: Push new history entry with animation panel
        openAnimationPanel({
          sequenceId: sequence.id,
          speed: animationPanelState.speed,
          isPlaying: animationPanelState.isPlaying,
          currentStep: animationPanelState.currentStep,
          gridVisible: true,
        });
      } else if (!isOpen && previousIsOpen) {
        // Closing: Stop animation and clean up
        if (playbackController) {
          playbackController.dispose(animationPanelState);
          setAnimationPlaybackRef(null);
        }
        lastLoadedSequenceId = null;
        _animatingBeatNumber = null;

        // Keep panel history and URL cleanup owned by the sheet router.
        if (typeof window !== "undefined") {
          closeSheet();
        }
      }
    }
    previousIsOpen = isOpen;
  });

  // Update URL state when animation state changes (without pushing new history)
  // NOTE: We intentionally DON'T sync currentStep during active playback to avoid
  // rapid URL updates and the route-change event triggering restoreAnimationState.
  let previousSpeed = animationPanelState.speed;
  let previousPlaying = animationPanelState.isPlaying;

  $effect(() => {
    // CRITICAL: Only update if animation panel is actually open in URL (prevents error spam)
    if (isOpen && sequence && !isRespondingToRouteChange) {
      const currentSpeed = animationPanelState.speed;
      const currentPlaying = animationPanelState.isPlaying;

      // Only sync speed and playing state changes to URL
      // We skip currentStep syncing during playback because:
      // 1. It changes ~60 times/second, causing excessive URL updates
      // 2. The route-change event can interfere with the animation loop
      // 3. Beat position during playback isn't meaningful to bookmark
      if (
        currentSpeed !== previousSpeed ||
        currentPlaying !== previousPlaying
      ) {
        // Double-check that the current route is actually showing animation sheet
        // This prevents "Cannot update animation panel state when animation sheet is not open" errors
        const currentState = getCurrentAnimationPanelState();
        if (currentState !== null) {
          updateAnimationPanelState({
            speed: currentSpeed,
            isPlaying: currentPlaying,
          });

          previousSpeed = currentSpeed;
          previousPlaying = currentPlaying;
        }
      }
    }
  });

  // Notify parent when current beat changes during active playback
  // currentStep uses 1-indexed beat numbers: 1.x = beat 1, 2.x = beat 2, etc.
  // currentStep < 1 = start position (beat 0)
  // IMPORTANT: Only sync while playing. When stopped, clear the beat number
  // so word header highlighting doesn't persist after closing the viewer.
  $effect(() => {
    if (animationPanelState.isPlaying) {
      _animatingBeatNumber = Math.floor(animationPanelState.currentStep);
    } else {
      _animatingBeatNumber = null;
    }
  });

  // Cleanup on component destroy
  $effect(() => {
    return () => {
      if (playbackController) {
        playbackController.dispose(animationPanelState);
        setAnimationPlaybackRef(null);
      }
    };
  });

  // Event handlers
  function handleClose() {
    hapticService?.trigger("selection");

    if (playbackController) {
      playbackController.dispose(animationPanelState);
      setAnimationPlaybackRef(null);
    }

    // Reset sequence tracking so reopening properly loads the sequence
    lastLoadedSequenceId = null;

    // Close the sheet route (this will trigger the route change listener which will set isOpen = false)
    closeSheet();
    _animatingBeatNumber = null;
  }

  function handleSpeedChange(newSpeed: number) {
    hapticService?.trigger("selection");
    playbackController?.setSpeed(newSpeed);
  }

  function _handleOpenExport() {
    hapticService?.trigger("selection");
    _showExportDialog = true;
  }

  function handleCloseExport() {
    if (!isExporting) {
      _showExportDialog = false;
      _exportProgress = null;
    }
  }

  async function _handleExport(format: VideoExportFormat) {
    if (!playbackController) {
      console.error("Export services not ready");
      return;
    }

    if (!animationCanvas) {
      console.error("Animation canvas not ready");
      return;
    }

    try {
      isExporting = true;

      // Loads deferred-registrations if the idle callback hasn't fired yet.
      videoExportOrchestrator = await ensureVideoExportOrchestrator();

      // Execute export using orchestrator service
      await videoExportOrchestrator.executeExport(
        animationCanvas,
        playbackController,
        animationPanelState,
        (progress) => {
          _exportProgress = progress;
        },
        {
          format,
          // App mode: thread the user's chosen prop so the offscreen export engine
          // loads the matching textures instead of falling back to default "staff".
          leftPropType:
            settingsService.settings.leftPropType ??
            settingsService.settings.propType ??
            "staff",
          rightPropType:
            settingsService.settings.rightPropType ??
            settingsService.settings.propType ??
            "staff",
        }
      );

      // Close dialog after delay
      setTimeout(() => {
        handleCloseExport();
        isExporting = false;
      }, VIDEO_EXPORT_SUCCESS_DELAY_MS);
    } catch (error) {
      // Don't log cancellation as an error - it's intentional
      const isCancellation =
        error instanceof Error && error.message.includes("cancelled");
      if (!isCancellation) {
        console.error("Video export failed:", error);
      }
      isExporting = false;
    }
  }

  function _handleCancelExport() {
    if (videoExportOrchestrator) {
      videoExportOrchestrator.cancelExport();
    }
    isExporting = false;
    _exportProgress = null;
    handleCloseExport();
  }
  function handleCanvasReady(canvas: HTMLCanvasElement | null) {
    animationCanvas = canvas;
  }

  function handleExportVideo() {
    // Use the best available video format (MP4 preferred for universal compatibility)
    const bestFormat = VideoExporter?.getBestFormat() ?? "webm";
    _handleExport(bestFormat);
  }
</script>

<AnimationShareDrawer
  show={isOpen ?? false}
  {combinedPanelHeight}
  loading={animationPanelState.loading}
  error={animationPanelState.error}
  speed={animationPanelState.speed}
  isPlaying={isPlayingLocal}
  playbackMode={animationPanelState.playbackMode}
  stepPlaybackPauseMs={animationPanelState.stepPlaybackPauseMs}
  stepPlaybackStepSize={animationPanelState.stepPlaybackStepSize}
  leftProp={animationPanelState.leftPropState}
  rightProp={animationPanelState.rightPropState}
  gridVisible={true}
  gridMode={resolvedGridMode}
  letter={currentLetter}
  stepData={currentStepData}
  sequenceData={animationPanelState.sequenceData}
  onClose={handleClose}
  onSpeedChange={handleSpeedChange}
  onPlaybackToggle={() => playbackController?.togglePlayback()}
  onPlaybackModeChange={(mode) => animationPanelState.setPlaybackMode(mode)}
  onStepPlaybackPauseMsChange={(pauseMs) =>
    animationPanelState.setStepPlaybackPauseMs(pauseMs)}
  onStepPlaybackStepSizeChange={(stepSize) =>
    animationPanelState.setStepPlaybackStepSize(stepSize)}
  onStepHalfBeatBackward={() => playbackController?.stepHalfBeatBackward()}
  onStepHalfBeatForward={() => playbackController?.stepHalfBeatForward()}
  onStepFullBeatBackward={() => playbackController?.stepFullBeatBackward()}
  onStepFullBeatForward={() => playbackController?.stepFullBeatForward()}
  onCanvasReady={handleCanvasReady}
  onExportVideo={handleExportVideo}
  onCancelExport={_handleCancelExport}
  {isExporting}
  exportProgress={_exportProgress}
  {isCircular}
  loopCount={exportLoopCount}
  onLoopCountChange={handleLoopCountChange}
/>
