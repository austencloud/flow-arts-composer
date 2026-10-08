import { describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { AnimationPanelState } from "../../state/animation-panel-state.svelte";
import type { AnimationLoop } from "../animation-loop";
import type { SequenceAnimationOrchestrator } from "../sequence-animation-orchestrator";
import { AnimationPlaybackController } from "../animation-playback-controller";

// Toggled per test so one file covers the seamless and the freeform wrap.
const loopability = vi.hoisted(() => ({ seamless: true }));

vi.mock("$lib/shared/foundation/services/sequence-loopability-checker", () => ({
  isSeamlesslyLoopable: () => loopability.seamless,
}));

function createState(): AnimationPanelState {
  let isPlaying = false;
  return {
    get isPlaying() {
      return isPlaying;
    },
    get playbackMode() {
      return "continuous";
    },
    get speed() {
      return 1;
    },
    get shouldLoop() {
      return true;
    },
    setIsPlaying: vi.fn((playing: boolean) => {
      isPlaying = playing;
    }),
    setCurrentStep: vi.fn(),
    setTotalSteps: vi.fn(),
    setSequenceMetadata: vi.fn(),
    setPropStates: vi.fn(),
    setSequenceData: vi.fn(),
  } as unknown as AnimationPanelState;
}

function createLoop() {
  let update: ((deltaTime: number) => void) | null = null;
  const loop = {
    start: vi.fn((callback: (deltaTime: number) => void) => {
      update = callback;
    }),
    stop: vi.fn(),
    setSpeed: vi.fn(),
    getSpeed: vi.fn(() => 1),
    isRunning: vi.fn(() => update !== null),
  } as unknown as AnimationLoop;

  return {
    loop,
    tick(deltaTime: number) {
      if (!update) throw new Error("Playback loop has not started");
      update(deltaTime);
    },
  };
}

// One second of start hold, then three beats of motion. The controller adds
// a one-second end hold for freeform sequences, so the loop body is three
// seconds (1 → 4) when seamless and five seconds (0 → 5) when freeform.
function createEngine() {
  const calculateStateDurationAware = vi.fn(
    (timePosition: number) => timePosition
  );
  const engine = {
    initializeWithDomainData: vi.fn(() => true),
    getMetadata: vi.fn(() => ({ totalSteps: 3, word: "abc", author: "test" })),
    getTotalDurationWithStartPlacement: vi.fn(() => 4),
    getStartPlacementDuration: vi.fn(() => 1),
    calculateStateDurationAware,
    getCurrentPropStates: vi.fn(() => ({ left: {}, right: {} })),
  } as unknown as SequenceAnimationOrchestrator;

  return { engine, calculateStateDurationAware };
}

function startPlaying(seamless: boolean) {
  loopability.seamless = seamless;
  const sequence = {
    id: "abc",
    name: "abc",
    word: "abc",
    steps: [],
  } as unknown as SequenceData;
  const state = createState();
  const { loop, tick } = createLoop();
  const { engine, calculateStateDurationAware } = createEngine();
  const controller = new AnimationPlaybackController(engine, loop);
  controller.initialize(sequence, state);
  controller.togglePlayback();
  calculateStateDurationAware.mockClear();
  return { tick, calculateStateDurationAware, state };
}

describe("AnimationPlaybackController same-sequence loop wrap", () => {
  it("carries a frame's overrun past the end into the next seamless loop", () => {
    const { tick, calculateStateDurationAware } = startPlaying(true);

    // 3.95 s in, a 100 ms frame lands 50 ms past the 4 s end.
    tick(3_950);
    tick(100);

    // Seamless loops skip the repeated start hold: wrap to 1 s, plus 50 ms.
    expect(calculateStateDurationAware).toHaveBeenLastCalledWith(
      expect.closeTo(1.05, 8)
    );
  });

  it("carries a frame's overrun past the end into the next freeform loop", () => {
    const { tick, calculateStateDurationAware } = startPlaying(false);

    // 4.95 s in, a 100 ms frame lands 50 ms past the 5 s end.
    tick(4_950);
    tick(100);

    // Freeform loops replay the start hold: wrap to 0 s, plus 50 ms.
    expect(calculateStateDurationAware).toHaveBeenLastCalledWith(
      expect.closeTo(0.05, 8)
    );
  });

  it("wraps an overrun longer than the seamless loop body by that body", () => {
    const { tick, calculateStateDurationAware, state } = startPlaying(true);

    // A hidden tab delivers 11.3 s as one frame: 7.3 s past the 4 s end,
    // which is two full 3 s loops and 1.3 s into a third.
    tick(11_300);

    expect(calculateStateDurationAware).toHaveBeenLastCalledWith(
      expect.closeTo(2.3, 8)
    );
    expect(state.isPlaying).toBe(true);
  });

  it("wraps an overrun longer than the freeform loop body by that body", () => {
    const { tick, calculateStateDurationAware, state } = startPlaying(false);

    // 12.3 s as one frame: 7.3 s past the 5 s end, one full 5 s loop and
    // 2.3 s into the next.
    tick(12_300);

    expect(calculateStateDurationAware).toHaveBeenLastCalledWith(
      expect.closeTo(2.3, 8)
    );
    expect(state.isPlaying).toBe(true);
  });
});
