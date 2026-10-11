/**
 * PlaybackController.svelte.ts
 *
 * Reactive module that owns all playback state and logic:
 * - Play/pause toggle, BPM changes, mode switching
 * - Step clicks, half/full beat stepping, restart
 * - isPlayingLocal, currentStepLocal, bpmLocal, playback modes, arrivedViaStepping
 * - Practice training system: TempoPracticeOrchestrator, practiceState, BPM escalation
 *
 * Extracted from SequenceViewerOrchestrator.
 */

import type { AnimationPlaybackController } from "#lib/shared/animation-engine/services/animation-playback-controller.js";
import type { AnimationPanelState, AnimationStateKey, PlaybackMode } from "#lib/shared/animation-engine/state/animation-panel-state.svelte.js";
import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
import { getAnimationVisibilityManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
import { lanSyncState } from "#lib/shared/lan-sync/state/lan-sync-state.svelte.js";
import { showToast } from "#lib/shared/toast/state/toast-state.svelte.js";
import { TempoPracticeOrchestrator, type TempoPracticeConfig } from "#lib/shared/sequence-viewer/services/tempo-practice-orchestrator.js";
import { createTempoPracticeState } from "#lib/shared/sequence-viewer/state/tempo-practice-state.svelte.js";
import { Metronome } from "#lib/shared/audio/metronome.js";
import type { PracticeViewPrefs } from "#lib/shared/sequence-viewer/state/practice-view-prefs.svelte.js";
import { createScreenWakeLockManager } from "#lib/shared/device/services/screen-wake-lock-manager.js";

export interface PlaybackControllerDeps {
  modalAnimationState: AnimationPanelState;
  initialBpm: number;
  initialStep: number;
}

export function createPlaybackController(deps: PlaybackControllerDeps) {
  const { modalAnimationState } = deps;

  let isPlayingLocal = $state(false);
  let currentStepLocal = $state(deps.initialStep);
  let bpmLocal = $state(deps.initialBpm);
  let arrivedViaStepping = $state(false);

  // Practice phase: off (normal viewer) → setup (config screen) → running (ramp).
  // `practiceActive` = in-mode (setup|running); `practiceRunning` = ramp active.
  let practicePhase = $state<"off" | "setup" | "running">("off");

  // 3·2·1 count-in before a practice ramp starts. practiceCountdown drives the
  // overlay (3/2/1 while counting, 0 = idle/hidden); _countInActive guards
  // re-entry + marks the pre-roll window; _countInTimer is the fixed ticker.
  let practiceCountdown = $state(0);
  let _countInActive = false;
  let _countInTimer: ReturnType<typeof setTimeout> | null = null;
  const COUNT_IN_MS = 700;

  // External dependencies (set by orchestrator after service load)
  let _playbackController: AnimationPlaybackController | null = null;
  let _hapticService: HapticFeedback | null = null;
  let _onUrlParamChange: ((key: string, value: string) => void) | undefined;
  let _isAnimationVisible: (() => boolean) | null = null;
  let _practiceViewPrefs: PracticeViewPrefs | null = null;
  let _metronome: Metronome | null = null;

  let lastStepNumber = 0;

  const cleanupSubscription = modalAnimationState.subscribe(
    (key: AnimationStateKey, value: unknown) => {
      switch (key) {
        case "isPlaying":
          isPlayingLocal = value as boolean;
          lanSyncState.updatePlayback({ isPlaying: value as boolean });
          break;
        case "currentStep": {
          const rawStep = value as number;
          const newBeat = Math.floor(rawStep);
          if (isPlayingLocal && newBeat !== lastStepNumber && newBeat >= 1 && (_isAnimationVisible?.() !== false)) {
            _hapticService?.trigger("selection");
            // Ramp-only audible beat. Accent the loop downbeat (beat 1 of each
            // loop) so the restart is audible. Driven by the visual beat event,
            // so it stays locked to playback through every ramp speed-up.
            if (practicePhase === "running" && _practiceViewPrefs?.metronomeEnabled) {
              _metronome?.tick(newBeat === 1);
            }
          }
          lastStepNumber = newBeat;
          currentStepLocal = rawStep;
          lanSyncState.updatePlayback({ currentStep: rawStep });
          break;
        }
        case "speed":
          bpmLocal = Math.round((value as number) * 60);
          lanSyncState.updatePlayback({ speed: value as number });
          break;
      }
    }
  );

  const animationVisibility = getAnimationVisibilityManager();
  let visibilityObserver: (() => void) | undefined;

  function registerVisibilityObserver() {
    const visObs = () => {
      const newMode = animationVisibility.getPlaybackMode();
      if (modalAnimationState.playbackMode !== newMode) {
        const wasPlaying = modalAnimationState.isPlaying;
        if (wasPlaying && _playbackController) {
          _playbackController.togglePlayback();
        }
        modalAnimationState.setPlaybackMode(newMode);
        if (wasPlaying && _playbackController) {
          _playbackController.togglePlayback();
        }
      }
    };
    animationVisibility.registerObserver(visObs);
    visibilityObserver = visObs;
  }

  function unregisterVisibilityObserver() {
    if (visibilityObserver) {
      animationVisibility.unregisterObserver(visibilityObserver);
    }
  }

  const practiceOrchestrator = new TempoPracticeOrchestrator();
  const practiceState = createTempoPracticeState();
  const screenWakeLockManager = createScreenWakeLockManager();

  let wasPlayingBeforeScrub = false;

  let startHoldTimer: ReturnType<typeof setTimeout> | null = null;


  function handlePlaybackToggle() {
    // Locked during the count-in pre-roll: a tap would start the ramp before GO
    // arms looping, breaking the isPlayingLocal-false-until-GO invariant (and
    // doubling ticks). The count-in's GO is the only thing that starts playback.
    if (_countInActive) return;
    arrivedViaStepping = false;
    _playbackController?.togglePlayback();
  }

  function handleProgressBarSeek(targetStep: number) {
    arrivedViaStepping = false;
    modalAnimationState.setCurrentStep(targetStep);
    _playbackController?.seekToStep(targetStep);
  }

  function handleProgressBarScrubStart() {
    wasPlayingBeforeScrub = isPlayingLocal;
    if (wasPlayingBeforeScrub) _playbackController?.togglePlayback();
  }

  function handleProgressBarScrubEnd() {
    if (wasPlayingBeforeScrub) _playbackController?.togglePlayback();
    wasPlayingBeforeScrub = false;
  }

  function handleBpmChange(newBpm: number) {
    _hapticService?.trigger("selection");
    const speedMultiplier = newBpm / 60;
    _playbackController?.setSpeed(speedMultiplier);
    _onUrlParamChange?.("bpm", String(newBpm));
    if (practiceOrchestrator.isActive()) {
      practiceOrchestrator.adjustBpm(newBpm);
      practiceState.updateProgress(practiceOrchestrator.getProgress());
    }
  }

  function handlePlaybackModeChange(mode: PlaybackMode) {
    const wasPlaying = isPlayingLocal;
    if (wasPlaying && _playbackController) {
      _playbackController.togglePlayback();
    }
    modalAnimationState.setPlaybackMode(mode);
    animationVisibility.setPlaybackMode(mode);
    if (wasPlaying && _playbackController) {
      setTimeout(() => _playbackController?.togglePlayback(), 0);
    }
  }

  function handleStepClick(stepIndex: number, blockClicks: boolean, editingPane: string | null) {
    if (blockClicks) return;
    // Seek-on-click works in the normal viewer (split / single) and image-export
    // preview. Video-upload editing reserves cell clicks for attaching clips.
    if (editingPane === 'video-upload') return;
    if (!_playbackController) return;

    _hapticService?.trigger("selection");
    arrivedViaStepping = false;

    if (startHoldTimer !== null) {
      clearTimeout(startHoldTimer);
      startHoldTimer = null;
    }

    // Start position (index -1): park at the start pose, hold a beat, then play.
    if (stepIndex < 0) {
      if (isPlayingLocal) _playbackController.togglePlayback();
      modalAnimationState.setCurrentStep(0);
      _playbackController.seekToStep(0);
      startHoldTimer = setTimeout(() => {
        startHoldTimer = null;
        if (_playbackController && !isPlayingLocal) _playbackController.togglePlayback();
      }, 700);
      return;
    }

    // Regular step: snap to it and preserve play state (snap + keep playing).
    const targetStep = stepIndex + 1;
    modalAnimationState.setCurrentStep(targetStep);
    _playbackController.seekToStep(targetStep);
  }

  function handlePracticeStart() {
    if (!_playbackController) {
      showToast("Animation not ready yet. Wait for it to load.", "info");
      return;
    }

    // Re-entrancy guard (synchronous): a double-tap (common on mobile) would
    // otherwise spawn two count-ins whose GO toggles cancel out, leaving
    // practicePhase "running" but playback paused. Everything below is async.
    if (_countInActive || practicePhase === "running") return;
    _countInActive = true;

    // Ask from the Start tap itself. The practice run begins with timer-driven
    // count-in ticks, so waiting for GO would lose the initiating user gesture.
    screenWakeLockManager.setActive(true);
    _hapticService?.trigger("selection");
    // Start is a user gesture; unlock audio now so the count-in ticks — which
    // fire on later, non-gesture timer turns — can play.
    if (_practiceViewPrefs?.metronomeEnabled) ensureMetronome();
    practiceState.clearCompletion();

    const startBpm = practiceOrchestrator.start(practiceState.userConfig);
    practiceState.updateProgress(practiceOrchestrator.getProgress());
    handleBpmChange(startBpm); // ramp speed for AFTER the count-in (not playing yet)

    // Park at the start pose, paused, for the count-in. jumpToStep(0) stops the
    // loop, pauses (isPlayingLocal → false), and lands at exactly 0 — a bare
    // seekToStep would preserve a prior scrub's fraction and start mid-beat.
    _playbackController.jumpToStep(0);

    // Show the cockpit now (also reinforces the re-entrancy guard). isPlayingLocal
    // stays false through the count-in, so the beat-boundary metronome stays silent.
    practicePhase = "running";

    // Fixed-tempo 3·2·1 count-in, then GO arms looping and starts the ramp.
    runCountIn(() => {
      if (!_playbackController) return;
      // Arm looping BEFORE play so the very first loop wraps (and is counted).
      _playbackController.onLoopComplete(() => {
        // Returns a new BPM on a speed-up loop (every X loops), else null while the
        // step is still accumulating its reps.
        const newBpm = practiceOrchestrator.onLoopComplete();
        practiceState.updateProgress(practiceOrchestrator.getProgress());

        if (newBpm !== null) {
          handleBpmChange(newBpm);
          _hapticService?.trigger("selection");
        }

        if (!practiceOrchestrator.isActive()) {
          handlePracticeStop();
        }
      });

      modalAnimationState.setShouldLoop(true);
      if (!isPlayingLocal) {
        _playbackController.togglePlayback();
      }
    });
  }

  /** Enter practice mode → setup screen. Does NOT start the ramp. */
  function enterPracticeMode() {
    practiceState.clearCompletion();
    practicePhase = "setup";
    _hapticService?.trigger("selection");
  }

  /** Leave practice mode entirely; stop the ramp if it's running. */
  function exitPracticeMode() {
    if (practicePhase === "running") stopPracticeIfActive();
    screenWakeLockManager.setActive(false);
    practicePhase = "off";
    _hapticService?.trigger("selection");
  }

  /**
   * The bar's big −/+ : step one level down (dir -1) or up (dir +1). Up at the
   * cap stops the session (mirrors stepped auto); down floors at the start tempo.
   */
  function handlePracticeStepLevel(dir: 1 | -1) {
    if (!_playbackController) return;

    const newBpm =
      dir > 0 ? practiceOrchestrator.advanceLevel() : practiceOrchestrator.decreaseLevel();
    practiceState.updateProgress(practiceOrchestrator.getProgress());

    if (newBpm !== null) {
      handleBpmChange(newBpm);
      _hapticService?.trigger("selection");
    }

    if (!practiceOrchestrator.isActive()) {
      handlePracticeStop();
    }
  }

  /** Toggle the tempo hold — freeze the auto-climb at the current speed. */
  function handlePracticeToggleHold() {
    practiceOrchestrator.setHeld(!practiceState.progress.held);
    practiceState.updateProgress(practiceOrchestrator.getProgress());
    _hapticService?.trigger("selection");
  }

  /** Lazily build + unlock the metronome. Must be called from a user gesture
   *  (Start, or the toggle) — browsers only unlock audio inside one. */
  function ensureMetronome() {
    if (!_metronome) _metronome = new Metronome();
    _metronome.resume();
  }

  /** Cancel an in-progress count-in (Stop / exit / dispose). Idempotent. */
  function cancelCountIn() {
    if (_countInTimer !== null) {
      clearTimeout(_countInTimer);
      _countInTimer = null;
    }
    practiceCountdown = 0;
    _countInActive = false;
  }

  /** Fixed ~700ms 3·2·1 count-in, independent of the ramp BPM (which can be
   *  15 = 4s/beat). Plain tick on 3/2/1, accented tick on GO, then onGo() starts
   *  the ramp. The visual count still runs when the metronome is off (tick no-ops). */
  function runCountIn(onGo: () => void) {
    // Gate each count tick on the pref (mirrors the beat-boundary gate). The
    // instance lingers after a toggle-off — only dispose nulls it — so a bare
    // _metronome?.tick() would click through a "Muted" count-in.
    const tick = (accent: boolean) => {
      if (_practiceViewPrefs?.metronomeEnabled) _metronome?.tick(accent);
    };
    practiceCountdown = 3;
    tick(false);
    const step = () => {
      practiceCountdown -= 1;
      if (practiceCountdown > 0) {
        tick(false);
        _countInTimer = setTimeout(step, COUNT_IN_MS);
      } else {
        tick(true); // accented GO
        _countInTimer = null;
        _countInActive = false;
        onGo();
      }
    };
    _countInTimer = setTimeout(step, COUNT_IN_MS);
  }

  /** Cockpit toggle: flip the persisted on/off pref. Turning on unlocks audio
   *  on this gesture. */
  function handleToggleMetronome() {
    const next = !(_practiceViewPrefs?.metronomeEnabled ?? false);
    _practiceViewPrefs?.setMetronomeEnabled(next);
    if (next) ensureMetronome();
    _hapticService?.trigger("selection");
  }

  /** Cockpit toggle: flip the persisted AR-mirror pref. The camera itself is
   *  owned by the mirror layer's mount/unmount — no side effect here. */
  function handleToggleMirror() {
    const next = !(_practiceViewPrefs?.mirrorEnabled ?? false);
    _practiceViewPrefs?.setMirrorEnabled(next);
    _hapticService?.trigger("selection");
  }

  /** Apply a live config change from the bar's inline controls (loops X, step Y,
   *  goal, target on/off). Persists for the next session too. */
  function handlePracticeSetConfig(patch: Partial<TempoPracticeConfig>) {
    practiceOrchestrator.patchConfig(patch);
    practiceState.updateConfig(patch);
    practiceState.updateProgress(practiceOrchestrator.getProgress());
    _hapticService?.trigger("selection");
  }

  function handlePracticeStop() {
    screenWakeLockManager.setActive(false);
    if (!_playbackController) return;

    // Cancelled during the count-in — the ramp never ran, so skip the completion
    // celebration; unwind quietly back to the setup screen.
    if (_countInActive) {
      cancelCountIn();
      practiceOrchestrator.stop();
      _playbackController.offLoopComplete();
      practiceState.updateProgress(practiceOrchestrator.getProgress());
      practicePhase = "setup";
      return;
    }

    const finalBpm = practiceOrchestrator.stop();
    practiceState.updateProgress(practiceOrchestrator.getProgress());

    _playbackController.offLoopComplete();

    practiceState.showCompletion(finalBpm);
    _hapticService?.trigger("success");

    // No "personal best" — we don't track props, so a best BPM would just be
    // "the highest the slider was dragged to". Honest completion only.
    showToast(`Practice complete: reached ${finalBpm} BPM`, "success");

    // Stop returns to the setup screen (not out of practice mode); exiting the
    // mode entirely is exitPracticeMode().
    practicePhase = "setup";
  }

  // ── Stepping ──
  function stepHalfBeatBackward() { arrivedViaStepping = true; _playbackController?.stepHalfBeatBackward(); }
  function stepHalfBeatForward() { arrivedViaStepping = true; _playbackController?.stepHalfBeatForward(); }
  function stepFullBeatBackward() { arrivedViaStepping = true; _playbackController?.stepFullBeatBackward(); }
  function stepFullBeatForward() { arrivedViaStepping = true; _playbackController?.stepFullBeatForward(); }
  function restartToStart() { arrivedViaStepping = true; _playbackController?.seekToStep(0); }

  // ── Practice cleanup ──
  function stopPracticeIfActive() {
    screenWakeLockManager.setActive(false);
    cancelCountIn();
    if (practiceOrchestrator.isActive()) {
      practiceOrchestrator.stop();
      _playbackController?.offLoopComplete();
      practiceState.updateProgress(practiceOrchestrator.getProgress());
    }
  }

  function dispose() {
    if (startHoldTimer !== null) {
      clearTimeout(startHoldTimer);
      startHoldTimer = null;
    }
    stopPracticeIfActive();
    screenWakeLockManager.dispose();
    _metronome?.dispose();
    _metronome = null;
    cleanupSubscription?.();
    unregisterVisibilityObserver();
    if (_playbackController) {
      // Pass our state as owner: the shared singleton must not tear down if a
      // newer viewer instance already re-claimed it (HMR remount overlap).
      _playbackController.dispose(modalAnimationState);
    }
  }

  return {
    // Reactive state (read via getters for reactivity)
    get isPlayingLocal() { return isPlayingLocal; },
    set isPlayingLocal(v: boolean) { isPlayingLocal = v; },
    get currentStepLocal() { return currentStepLocal; },
    set currentStepLocal(v: number) { currentStepLocal = v; },
    get bpmLocal() { return bpmLocal; },
    set bpmLocal(v: number) { bpmLocal = v; },
    get arrivedViaStepping() { return arrivedViaStepping; },
    set arrivedViaStepping(v: boolean) { arrivedViaStepping = v; },
    get practiceActive() { return practicePhase !== "off"; },
    get practiceRunning() { return practicePhase === "running"; },
    get practiceCountdown() { return practiceCountdown; },
    get metronomeEnabled() { return _practiceViewPrefs?.metronomeEnabled ?? false; },
    get mirrorEnabled() { return _practiceViewPrefs?.mirrorEnabled ?? false; },
    practiceState,

    // Dependency injection (set after service load)
    setPlaybackController(pc: AnimationPlaybackController) { _playbackController = pc; },
    getPlaybackController() { return _playbackController; },
    setHapticService(hs: HapticFeedback) { _hapticService = hs; },
    setAnimationVisible(fn: () => boolean) { _isAnimationVisible = fn; },
    setOnUrlParamChange(cb: ((key: string, value: string) => void) | undefined) { _onUrlParamChange = cb; },
    setPracticeViewPrefs(p: PracticeViewPrefs) { _practiceViewPrefs = p; },

    // Handlers
    handlePlaybackToggle,
    handleProgressBarSeek,
    handleProgressBarScrubStart,
    handleProgressBarScrubEnd,
    handleBpmChange,
    handlePlaybackModeChange,
    handleStepClick,
    handlePracticeStart,
    enterPracticeMode,
    exitPracticeMode,
    handlePracticeStepLevel,
    handlePracticeToggleHold,
    handleToggleMetronome,
    handleToggleMirror,
    handlePracticeSetConfig,
    handlePracticeStop,
    stepHalfBeatBackward,
    stepHalfBeatForward,
    stepFullBeatBackward,
    stepFullBeatForward,
    restartToStart,
    stopPracticeIfActive,
    registerVisibilityObserver,
    dispose,
  };
}

export type PlaybackControllerState = ReturnType<typeof createPlaybackController>;
