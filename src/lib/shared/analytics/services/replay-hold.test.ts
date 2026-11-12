import { afterEach, describe, expect, it, vi } from "vitest";
import {
  REPLAY_HOLD_CAP_MS,
  _resetReplayHoldForTests,
  armReplayHold,
  createReplayHold,
  releaseReplayHold,
  replayHoldReleasedEarly,
  shouldHoldReplay,
} from "./replay-hold";
import {
  pageBootsInto3D,
  urlOpens3DViewer,
} from "#lib/shared/sequence-viewer/services/viewer-boot-3d.js";

const held = {
  recordingAllowed: true,
  bootsInto3D: true,
  workerRendererSupported: true,
  releasedEarly: false,
};

describe("shouldHoldReplay", () => {
  it("holds a recorded direct 3D open on the worker path", () => {
    expect(shouldHoldReplay(held)).toBe(true);
  });

  it("never holds when the page would not record anyway", () => {
    // Dev and agent browsers: nothing to hold, nothing to release later.
    expect(shouldHoldReplay({ ...held, recordingAllowed: false })).toBe(false);
  });

  it("leaves pages that do not open into 3D unchanged", () => {
    expect(shouldHoldReplay({ ...held, bootsInto3D: false })).toBe(false);
  });

  it("records from the start when only the main-thread renderer can run", () => {
    // That canvas must exist under rrweb's getContext patch or it replays black.
    expect(shouldHoldReplay({ ...held, workerRendererSupported: false })).toBe(
      false
    );
  });

  it("does not hold once a release already happened before init", () => {
    expect(shouldHoldReplay({ ...held, releasedEarly: true })).toBe(false);
  });
});

describe("createReplayHold", () => {
  function fakeTimers() {
    let pending: (() => void) | null = null;
    return {
      timers: {
        set: vi.fn((callback: () => void) => {
          pending = callback;
          return 1;
        }),
        clear: vi.fn(() => {
          pending = null;
        }),
      },
      fire: () => pending?.(),
    };
  }

  it.each(["scene-revealed", "main-thread-renderer", "left-3d"] as const)(
    "starts recording once on %s",
    (reason) => {
      const start = vi.fn();
      const { timers, fire } = fakeTimers();
      const hold = createReplayHold(start, timers);
      expect(start).not.toHaveBeenCalled();

      expect(hold.release(reason)).toBe(true);
      expect(hold.release("scene-revealed")).toBe(false);
      fire();

      expect(start).toHaveBeenCalledTimes(1);
      expect(hold.releasedBy).toBe(reason);
      expect(timers.clear).toHaveBeenCalled();
    }
  );

  it("starts recording at the 15 s cap if nothing else released it", () => {
    const start = vi.fn();
    const { timers, fire } = fakeTimers();
    const hold = createReplayHold(start, timers);
    expect(timers.set).toHaveBeenCalledWith(
      expect.any(Function),
      REPLAY_HOLD_CAP_MS
    );
    fire();
    expect(start).toHaveBeenCalledTimes(1);
    expect(hold.releasedBy).toBe("cap");
  });
});

describe("module hold", () => {
  afterEach(() => _resetReplayHoldForTests());

  it("remembers a release that arrives before PostHog initialised", () => {
    releaseReplayHold("scene-revealed");
    expect(replayHoldReleasedEarly()).toBe(true);
  });

  it("starts the armed recording on release", () => {
    vi.useFakeTimers();
    try {
      const start = vi.fn();
      armReplayHold(start);
      releaseReplayHold("scene-revealed");
      vi.advanceTimersByTime(REPLAY_HOLD_CAP_MS);
      expect(start).toHaveBeenCalledTimes(1);
      expect(replayHoldReleasedEarly()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("urlOpens3DViewer", () => {
  const opens = (query: string) =>
    urlOpens3DViewer(new URLSearchParams(query));

  it("reads the three ways a URL asks for 3D", () => {
    expect(opens("render=3d")).toBe(true);
    expect(opens("pane=animation-3d")).toBe(true);
    expect(opens("pane=split&split=animation,animation-3d")).toBe(true);
  });

  it("lets pane own the mode over render", () => {
    // A full-state link captured on the tunnel with 3D warm opens the tunnel.
    expect(opens("pane=tunnel&render=3d")).toBe(false);
  });

  it("is false for 2D and plain opens", () => {
    expect(opens("")).toBe(false);
    expect(opens("render=2d")).toBe(false);
    expect(opens("pane=split&split=animation,card")).toBe(false);
  });

  it("does not count a viewport too small for 3D", () => {
    const location = { search: "?render=3d" };
    expect(pageBootsInto3D(location, { width: 1280, height: 800 })).toBe(true);
    expect(pageBootsInto3D(location, { width: 390, height: 844 })).toBe(false);
  });
});
