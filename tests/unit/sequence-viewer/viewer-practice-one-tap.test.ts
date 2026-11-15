import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnimationPlaybackController } from "#lib/shared/animation-engine/services/animation-playback-controller.js";
import type { AnimationPanelState } from "#lib/shared/animation-engine/state/animation-panel-state.svelte.js";

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

const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock("#lib/shared/toast/state/toast-state.svelte.js", () => toast);

vi.mock("#lib/shared/audio/metronome.js", () => ({
  Metronome: class {
    resume() {}
    tick() {}
    dispose() {}
  },
}));

// The ramp ends itself on the first loop when `endsOnNextLoop` is set.
const ramp = vi.hoisted(() => ({ endsOnNextLoop: false }));
vi.mock(
  "#lib/shared/sequence-viewer/services/tempo-practice-orchestrator.js",
  () => ({
    TempoPracticeOrchestrator: class {
      private active = false;
      start() {
        this.active = true;
        return 15;
      }
      stop() {
        this.active = false;
        return 21;
      }
      isActive() {
        return this.active;
      }
      getProgress() {
        return { held: false, startBpm: 15 };
      }
      adjustBpm() {}
      patchConfig() {}
      setHeld() {}
      onLoopComplete() {
        if (ramp.endsOnNextLoop) this.active = false;
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
import { createPracticeViewPrefs } from "#lib/shared/sequence-viewer/state/practice-view-prefs.svelte.js";
import {
  CAMERA_FAILURE_NOTICE_MS,
  createPracticeGuide,
} from "#lib/shared/sequence-viewer/state/practice-guide-state.svelte.js";
import { classifyCameraFailure } from "#lib/shared/train/services/camera-failure.js";

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

function createHarness() {
  let loopHandler: (() => void) | null = null;
  const controller = {
    jumpToStep: vi.fn(),
    setSpeed: vi.fn(),
    offLoopComplete: vi.fn(),
    onLoopComplete: vi.fn((handler: () => void) => {
      loopHandler = handler;
    }),
    togglePlayback: vi.fn(),
    dispose: vi.fn(),
  };
  const playback = createPlaybackController({
    modalAnimationState: createModalAnimationState(),
    initialBpm: 60,
    initialStep: 0,
  });
  const prefs = createPracticeViewPrefs();
  playback.setPracticeViewPrefs(prefs);
  playback.setPlaybackController(
    controller as unknown as AnimationPlaybackController
  );
  return {
    playback,
    prefs,
    controller,
    completeLoop: () => loopHandler?.(),
  };
}

/** The mirror layer mounts CameraPreview only while both hold. */
function cameraMounted(playback: ReturnType<typeof createHarness>["playback"]) {
  return playback.practiceActive && playback.mirrorEnabled;
}

describe("practice: one tap in, one way out", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    ramp.endsOnNextLoop = false;
    toast.showToast.mockClear();
    try {
      localStorage.clear();
    } catch {
      // node environment: prefs fall back to defaults
    }
  });

  it("entering practice goes straight to the running count-in, no setup gate", () => {
    const { playback, controller } = createHarness();

    expect(playback.enterPracticeMode()).toBe(true);

    expect(playback.practiceActive).toBe(true);
    expect(playback.practiceRunning).toBe(true);
    expect(playback.practiceCountdown).toBe(3);

    vi.advanceTimersByTime(3 * 700);

    expect(playback.practiceCountdown).toBe(0);
    expect(controller.onLoopComplete).toHaveBeenCalledOnce();
    expect(controller.togglePlayback).toHaveBeenCalledOnce();
    playback.dispose();
  });

  it("stays off and says so when the animation is not ready", () => {
    const playback = createPlaybackController({
      modalAnimationState: createModalAnimationState(),
      initialBpm: 60,
      initialStep: 0,
    });

    expect(playback.enterPracticeMode()).toBe(false);
    expect(playback.practiceActive).toBe(false);
    expect(toast.showToast).toHaveBeenCalledOnce();
    playback.dispose();
  });

  it.each([
    ["Stop", "handlePracticeStop"],
    ["the back button", "exitPracticeMode"],
  ] as const)("%s ends in phase off with the camera released", (_, exit) => {
    const { playback, controller } = createHarness();
    playback.enterPracticeMode();
    vi.advanceTimersByTime(3 * 700);
    playback.handleToggleMirror();
    playback.practiceGuide.cameraReady();
    expect(cameraMounted(playback)).toBe(true);

    playback[exit]();

    expect(playback.practiceActive).toBe(false);
    expect(playback.practiceRunning).toBe(false);
    expect(playback.practiceGuide.mirrorStatus).toBe("off");
    expect(playback.practiceGuide.noticeKey).toBeNull();
    expect(cameraMounted(playback)).toBe(false);
    expect(controller.offLoopComplete).toHaveBeenCalled();
    playback.dispose();
  });

  it("Stop during the count-in also leaves practice", () => {
    const { playback } = createHarness();
    playback.enterPracticeMode();

    playback.handlePracticeStop();

    expect(playback.practiceActive).toBe(false);
    expect(playback.practiceCountdown).toBe(0);
    expect(toast.showToast).not.toHaveBeenCalled();
    playback.dispose();
  });

  it("a run that ends by itself leaves through the shell's handler", () => {
    const { playback, completeLoop } = createHarness();
    const onEnded = vi.fn(() => playback.exitPracticeMode());
    playback.setOnPracticeRunEnded(onEnded);
    playback.enterPracticeMode();
    vi.advanceTimersByTime(3 * 700);

    ramp.endsOnNextLoop = true;
    completeLoop();

    expect(onEnded).toHaveBeenCalledOnce();
    expect(playback.practiceActive).toBe(false);
    expect(toast.showToast).toHaveBeenCalledOnce();
    playback.dispose();
  });
});

describe("practice mirror camera", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  function guideWithPrefs(permission: "granted" | "prompt" | "denied" = "prompt") {
    const prefs = createPracticeViewPrefs();
    const guide = createPracticeGuide({
      getPrefs: () => prefs,
      readPermission: async () => permission,
    });
    return { prefs, guide };
  }

  it("a refused camera turns Mirror off, resets the pref and shows one message", () => {
    const { prefs, guide } = guideWithPrefs();

    guide.toggleMirror();
    expect(guide.mirrorStatus).toBe("starting");
    expect(prefs.mirrorEnabled).toBe(true);
    expect(guide.noticeKey).toBe("viewer_practice_mirror_intro");

    guide.cameraFailed("blocked");

    expect(guide.mirrorStatus).toBe("off");
    expect(prefs.mirrorEnabled).toBe(false);
    expect(guide.noticeKey).toBe("viewer_practice_camera_blocked");

    vi.advanceTimersByTime(CAMERA_FAILURE_NOTICE_MS);
    expect(guide.noticeKey).toBeNull();
  });

  it.each([
    ["granted", "starting"],
    ["prompt", "off"],
    ["denied", "off"],
  ] as const)(
    "a saved Mirror comes back on entry only when permission is %s",
    async (permission, expected) => {
      const { prefs, guide } = guideWithPrefs(permission);
      prefs.setMirrorEnabled(true);

      await guide.resumeMirrorOnEntry();

      expect(guide.mirrorStatus).toBe(expected);
    }
  );

  it("a permission answer that lands after leaving does not restart the camera", async () => {
    const { prefs, guide } = guideWithPrefs("granted");
    prefs.setMirrorEnabled(true);

    const pending = guide.resumeMirrorOnEntry();
    guide.reset();
    await pending;

    expect(guide.mirrorStatus).toBe("off");
  });

  it("plays the coach once per device and a tap ends it", () => {
    const { prefs, guide } = guideWithPrefs();

    guide.startCoach();
    expect(guide.coachTarget).toBe("strip");
    vi.advanceTimersByTime(4000);
    expect(guide.coachTarget).toBe("tempo");
    guide.dismissLine();
    expect(guide.coachTarget).toBeNull();
    expect(prefs.coachSeen).toBe(true);

    guide.startCoach();
    expect(guide.noticeKey).toBeNull();
  });

  it("a camera message outranks the coach line", () => {
    const { guide } = guideWithPrefs();
    guide.startCoach();
    guide.toggleMirror();
    guide.cameraFailed("missing");

    expect(guide.noticeKey).toBe("viewer_practice_camera_missing");
    expect(guide.coachTarget).toBeNull();
  });
});

describe("classifyCameraFailure", () => {
  const wrapped = (name: string) =>
    new Error("Couldn't access your camera.", {
      cause: Object.assign(new Error(name), { name }),
    });

  it.each([
    [wrapped("NotFoundError"), "prompt", "missing"],
    [wrapped("NotReadableError"), "granted", "busy"],
    [wrapped("NotAllowedError"), "denied", "blocked"],
    [wrapped("NotAllowedError"), "prompt", "not-started"],
    [wrapped("NotAllowedError"), "unknown", "not-started"],
    [Object.assign(new Error("x"), { name: "NotFoundError" }), "unknown", "missing"],
    [new Error("Couldn't access your camera."), "unknown", "not-started"],
  ] as const)("maps %s with permission %s to %s", (error, permission, kind) => {
    expect(classifyCameraFailure(error, permission)).toBe(kind);
  });
});
