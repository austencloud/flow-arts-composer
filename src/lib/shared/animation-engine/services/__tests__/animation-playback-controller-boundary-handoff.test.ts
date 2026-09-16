import { describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { AnimationPanelState } from "../../state/animation-panel-state.svelte";
import type { AnimationLoop } from "../animation-loop";
import type { SequenceAnimationOrchestrator } from "../sequence-animation-orchestrator";
import { AnimationPlaybackController } from "../animation-playback-controller";

vi.mock("$lib/shared/foundation/services/sequence-loopability-checker", () => ({
  isSeamlesslyLoopable: () => true,
}));

function sequence(id: string): SequenceData {
  return {
    id,
    name: id,
    word: id,
    steps: [],
  } as unknown as SequenceData;
}

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

function createEngine(options?: { rejectIncoming?: boolean }) {
  let loadedId = "";
  const calculateStateDurationAware = vi.fn(
    (timePosition: number) => timePosition
  );
  const engine = {
    initializeWithDomainData: vi.fn((loaded: SequenceData) => {
      if (options?.rejectIncoming && loaded.id === "incoming") return false;
      loadedId = loaded.id;
      return true;
    }),
    getMetadata: vi.fn(() => ({
      totalSteps: loadedId === "incoming" ? 6 : 4,
      word: loadedId,
      author: "test",
    })),
    getTotalDurationWithStartPlacement: vi.fn(() =>
      loadedId === "incoming" ? 6 : 4
    ),
    getStartPlacementDuration: vi.fn(() => 1),
    calculateStateDurationAware,
    getCurrentPropStates: vi.fn(() => ({ left: {}, right: {} })),
  } as unknown as SequenceAnimationOrchestrator;

  return { engine, calculateStateDurationAware };
}

describe("AnimationPlaybackController boundary handoff", () => {
  it("accepts the prepared sequence inside the running frame without pausing or replaying its start hold", () => {
    const outgoing = sequence("outgoing");
    const incoming = sequence("incoming");
    const state = createState();
    const { loop, tick } = createLoop();
    const { engine, calculateStateDurationAware } = createEngine();
    const controller = new AnimationPlaybackController(engine, loop);
    const accept = vi.fn();

    controller.initialize(outgoing, state);
    controller.onSequenceBoundary(() => ({ sequence: incoming, accept }));
    controller.togglePlayback();

    (loop.stop as ReturnType<typeof vi.fn>).mockClear();
    calculateStateDurationAware.mockClear();
    tick(4_100);

    expect(loop.stop).not.toHaveBeenCalled();
    expect(loop.start).toHaveBeenCalledTimes(1);
    expect(state.isPlaying).toBe(true);
    expect(state.setSequenceData).toHaveBeenLastCalledWith(incoming);
    expect(accept).toHaveBeenCalledTimes(1);
    // The old word ended 100ms into this frame. Preserve that overrun and
    // begin in the new word's first motion, after its one-second start hold.
    expect(calculateStateDurationAware).toHaveBeenLastCalledWith(
      expect.closeTo(1.1, 8)
    );
  });

  it("keeps looping the current sequence when no prepared handoff is available", () => {
    const outgoing = sequence("outgoing");
    const state = createState();
    const { loop, tick } = createLoop();
    const { engine, calculateStateDurationAware } = createEngine();
    const controller = new AnimationPlaybackController(engine, loop);

    controller.initialize(outgoing, state);
    controller.onSequenceBoundary(() => null);
    controller.togglePlayback();

    (loop.stop as ReturnType<typeof vi.fn>).mockClear();
    calculateStateDurationAware.mockClear();
    tick(4_100);

    expect(loop.stop).not.toHaveBeenCalled();
    expect(state.isPlaying).toBe(true);
    expect(state.setSequenceData).toHaveBeenCalledTimes(1);
    expect(calculateStateDurationAware).toHaveBeenLastCalledWith(1);
  });

  it("falls back to the outgoing loop when the engine rejects a prepared sequence", () => {
    const outgoing = sequence("outgoing");
    const incoming = sequence("incoming");
    const state = createState();
    const { loop, tick } = createLoop();
    const { engine, calculateStateDurationAware } = createEngine({
      rejectIncoming: true,
    });
    const controller = new AnimationPlaybackController(engine, loop);
    const accept = vi.fn();

    controller.initialize(outgoing, state);
    controller.onSequenceBoundary(() => ({ sequence: incoming, accept }));
    controller.togglePlayback();
    calculateStateDurationAware.mockClear();

    tick(4_100);

    expect(accept).not.toHaveBeenCalled();
    expect(state.setSequenceData).toHaveBeenCalledTimes(1);
    expect(engine.initializeWithDomainData).toHaveBeenNthCalledWith(
      2,
      incoming
    );
    expect(engine.initializeWithDomainData).toHaveBeenNthCalledWith(
      3,
      outgoing
    );
    expect(calculateStateDurationAware).toHaveBeenLastCalledWith(1);
    expect(state.isPlaying).toBe(true);
  });
});
