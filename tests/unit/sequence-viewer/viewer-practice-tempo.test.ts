import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnimationPlaybackController } from "#lib/shared/animation-engine/services/animation-playback-controller.js";
import type { AnimationPanelState } from "#lib/shared/animation-engine/state/animation-panel-state.svelte.js";
import { PLAYBACK_MIN_BPM } from "#lib/shared/animation-engine/domain/constants/timing.js";

// The real ramp orchestrator runs here; only the device and audio edges are
// stubbed, so the tempo floor and the start-tempo rule are the shipped ones.
vi.mock("#lib/shared/device/services/screen-wake-lock-manager.js", () => ({
  createScreenWakeLockManager: () => ({ setActive: vi.fn(), dispose: vi.fn() }),
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
  lanSyncState: { updatePlayback: vi.fn() },
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

import { createPlaybackController } from "#lib/shared/sequence-viewer/components/playback-controller.svelte.js";
import { createPracticeViewPrefs } from "#lib/shared/sequence-viewer/state/practice-view-prefs.svelte.js";

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

function createHarness({ ready = true } = {}) {
  const controller = {
    jumpToStep: vi.fn(),
    setSpeed: vi.fn(),
    offLoopComplete: vi.fn(),
    onLoopComplete: vi.fn(),
    togglePlayback: vi.fn(),
    dispose: vi.fn(),
  };
  const url = vi.fn();
  const playback = createPlaybackController({
    modalAnimationState: createModalAnimationState(),
    initialBpm: 60,
    initialStep: 0,
  });
  playback.setOnUrlParamChange(url);
  playback.setPracticeViewPrefs(createPracticeViewPrefs());
  if (ready) {
    playback.setPlaybackController(
      controller as unknown as AnimationPlaybackController
    );
  }
  const lastUrlBpm = () =>
    url.mock.calls.filter(([key]) => key === "bpm").at(-1)?.[1];
  return { playback, controller, url, lastUrlBpm };
}

function enterAndRun(playback: ReturnType<typeof createHarness>["playback"]) {
  playback.enterPracticeMode();
  vi.advanceTimersByTime(3 * 700);
}

describe("practice gives the tempo back on the way out", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    try {
      localStorage.clear();
    } catch {
      // node environment: the ramp config starts from its defaults
    }
  });

  it.each([
    ["Stop", "handlePracticeStop"],
    ["the back button", "exitPracticeMode"],
  ] as const)("%s puts 60 BPM back, URL included", (_, exit) => {
    const { playback, controller, lastUrlBpm } = createHarness();
    enterAndRun(playback);
    expect(playback.bpmLocal).toBe(15);
    expect(lastUrlBpm()).toBe("15");

    playback[exit]();

    expect(playback.bpmLocal).toBe(60);
    expect(lastUrlBpm()).toBe("60");
    expect(controller.setSpeed).toHaveBeenLastCalledWith(1);
    playback.dispose();
  });

  it("a run that ends itself at its goal puts 60 BPM back too", () => {
    const { playback, lastUrlBpm } = createHarness();
    playback.practiceState.updateConfig({ targetEnabled: true, targetBpm: 16 });
    playback.setOnPracticeRunEnded(() => playback.exitPracticeMode());
    enterAndRun(playback);

    playback.handlePracticeStepLevel(1);

    expect(playback.practiceActive).toBe(false);
    expect(playback.bpmLocal).toBe(60);
    expect(lastUrlBpm()).toBe("60");
    playback.dispose();
  });

  it("an entry that bails out because the animation is not ready leaves the tempo alone", () => {
    const { playback, url } = createHarness({ ready: false });

    expect(playback.enterPracticeMode()).toBe(false);
    playback.exitPracticeMode();

    expect(playback.bpmLocal).toBe(60);
    expect(url).not.toHaveBeenCalled();
    playback.dispose();
  });
});

describe("Slower at the ramp's start tempo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    try {
      localStorage.clear();
    } catch {
      // node environment
    }
  });

  it("lowers the start tempo with it, saved, down to the playback floor", () => {
    const { playback } = createHarness();
    enterAndRun(playback);
    expect(playback.practiceState.progress.startBpm).toBe(15);

    playback.handlePracticeStepLevel(-1);

    expect(playback.bpmLocal).toBe(14);
    expect(playback.practiceState.progress.startBpm).toBe(14);
    expect(playback.practiceState.userConfig.startBpm).toBe(14);

    for (let i = 0; i < 20; i++) playback.handlePracticeStepLevel(-1);

    expect(playback.bpmLocal).toBe(PLAYBACK_MIN_BPM);
    expect(playback.practiceState.progress.startBpm).toBe(PLAYBACK_MIN_BPM);
    expect(playback.practiceState.userConfig.startBpm).toBe(PLAYBACK_MIN_BPM);
    expect(playback.practiceActive).toBe(true);
    playback.dispose();
  });

  it("above the start it steps down without moving the start", () => {
    const { playback } = createHarness();
    enterAndRun(playback);
    playback.handlePracticeStepLevel(1);
    playback.handlePracticeStepLevel(1);
    expect(playback.bpmLocal).toBe(17);

    playback.handlePracticeStepLevel(-1);

    expect(playback.bpmLocal).toBe(16);
    expect(playback.practiceState.progress.startBpm).toBe(15);
    playback.dispose();
  });

  it("the minus beside the big BPM lowers the start the same way", () => {
    const { playback } = createHarness();
    enterAndRun(playback);

    playback.handleBpmChange(12);

    expect(playback.practiceState.progress.startBpm).toBe(12);
    expect(playback.practiceState.userConfig.startBpm).toBe(12);
    playback.dispose();
  });
});
