import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnimationPlaybackController } from "#lib/shared/animation-engine/services/animation-playback-controller.js";
import type { AnimationPanelState } from "#lib/shared/animation-engine/state/animation-panel-state.svelte.js";

const wakeLock = vi.hoisted(() => ({
  setActive: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock("#lib/shared/device/services/screen-wake-lock-manager.js", () => ({
  createScreenWakeLockManager: () => wakeLock,
}));

vi.mock(
  "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js",
  () => ({
    getAnimationVisibilityManager: () => ({
      getPlaybackMode: () => "continuous",
      registerObserver: vi.fn(),
      unregisterObserver: vi.fn(),
      setPlaybackMode: vi.fn(),
    }),
  })
);

vi.mock("#lib/shared/lan-sync/state/lan-sync-state.svelte.js", () => ({
  lanSyncState: {
    updatePlayback: vi.fn(),
  },
}));

vi.mock("#lib/shared/toast/state/toast-state.svelte.js", () => ({
  showToast: vi.fn(),
}));

vi.mock("#lib/shared/audio/metronome.js", () => ({
  Metronome: class {
    resume() {}
    tick() {}
    dispose() {}
  },
}));

vi.mock(
  "#lib/shared/sequence-viewer/state/tempo-practice-state.svelte.js",
  () => ({
    createTempoPracticeState: () => ({
      userConfig: {},
      progress: { held: false },
      clearCompletion: vi.fn(),
      updateProgress: vi.fn(),
      updateConfig: vi.fn(),
      showCompletion: vi.fn(),
    }),
  })
);

vi.mock(
  "#lib/shared/sequence-viewer/services/tempo-practice-orchestrator.js",
  () => ({
    TempoPracticeOrchestrator: class {
      private active = false;

      start() {
        this.active = true;
        return 60;
      }

      stop() {
        this.active = false;
        return 60;
      }

      isActive() {
        return this.active;
      }

      getProgress() {
        return { held: false };
      }

      adjustBpm() {}
      patchConfig() {}
      setHeld() {}
      onLoopComplete() {
        return null;
      }
      advanceLevel() {
        return null;
      }
      decreaseLevel() {
        return null;
      }
    },
  })
);

import { createPlaybackController } from "#lib/shared/sequence-viewer/components/playback-controller.svelte.js";

function createModalAnimationState(): AnimationPanelState {
  return {
    isPlaying: false,
    playbackMode: "continuous",
    setCurrentStep: vi.fn(),
    setShouldLoop: vi.fn(),
    setPlaybackMode: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
  } as unknown as AnimationPanelState;
}

function createAnimationPlaybackController(): AnimationPlaybackController {
  return {
    jumpToStep: vi.fn(),
    setSpeed: vi.fn(),
    offLoopComplete: vi.fn(),
    onLoopComplete: vi.fn(),
    togglePlayback: vi.fn(),
    dispose: vi.fn(),
  } as unknown as AnimationPlaybackController;
}

describe("viewer practice wake lock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    wakeLock.setActive.mockClear();
    wakeLock.dispose.mockClear();
  });

  it("holds the screen from Start through count-in and releases on Stop", () => {
    const playback = createPlaybackController({
      modalAnimationState: createModalAnimationState(),
      initialBpm: 60,
      initialStep: 0,
    });
    playback.setPlaybackController(createAnimationPlaybackController());

    playback.enterPracticeMode();
    playback.handlePracticeStart();

    expect(wakeLock.setActive).toHaveBeenCalledTimes(1);
    expect(wakeLock.setActive).toHaveBeenLastCalledWith(true);

    playback.handlePracticeStop();

    expect(wakeLock.setActive).toHaveBeenLastCalledWith(false);
    expect(playback.practiceRunning).toBe(false);

    playback.dispose();
  });

  it("releases and disposes the lock when the viewer closes mid-session", () => {
    const playback = createPlaybackController({
      modalAnimationState: createModalAnimationState(),
      initialBpm: 60,
      initialStep: 0,
    });
    playback.setPlaybackController(createAnimationPlaybackController());

    playback.enterPracticeMode();
    playback.handlePracticeStart();
    playback.dispose();

    expect(wakeLock.setActive).toHaveBeenCalledWith(true);
    expect(wakeLock.setActive).toHaveBeenLastCalledWith(false);
    expect(wakeLock.dispose).toHaveBeenCalledOnce();
  });
});
