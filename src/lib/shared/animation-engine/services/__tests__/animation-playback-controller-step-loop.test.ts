import { afterEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { AnimationPanelState } from "../../state/animation-panel-state.svelte";
import type { AnimationLoop } from "../animation-loop";
import type { SequenceAnimationOrchestrator } from "../sequence-animation-orchestrator";
import { AnimationPlaybackController } from "../animation-playback-controller";

vi.mock(
  "#lib/shared/foundation/services/sequence-loopability-checker.js",
  () => ({
    isSeamlesslyLoopable: () => false,
  })
);

afterEach(() => vi.useRealTimers());

describe("step playback loop", () => {
  it("starts the first motion after one normal pause at the final pose", () => {
    vi.useFakeTimers();
    const sequence = { id: "freeform", steps: [] } as unknown as SequenceData;
    let playing = false;
    let currentStep = 3;
    const state = {
      get isPlaying() {
        return playing;
      },
      get currentStep() {
        return currentStep;
      },
      playbackMode: "step",
      shouldLoop: true,
      stepPlaybackStepSize: 1,
      stepPlaybackPauseMs: 300,
      speed: 1,
      totalSteps: 2,
      setIsPlaying: vi.fn((value: boolean) => {
        playing = value;
      }),
      setCurrentStep: vi.fn((value: number) => {
        currentStep = value;
      }),
      setTotalSteps: vi.fn(),
      setSequenceMetadata: vi.fn(),
      setPropStates: vi.fn(),
      setSequenceData: vi.fn(),
    } as unknown as AnimationPanelState;
    const engine = {
      initializeWithDomainData: vi.fn(() => true),
      getMetadata: vi.fn(() => ({ totalSteps: 2, word: "", author: "" })),
      getTotalDurationWithStartPlacement: vi.fn(() => 3),
      getTimePositionForBeat: vi.fn((beat: number) => beat),
      calculateState: vi.fn(),
      getCurrentPropStates: vi.fn(() => ({ left: {}, right: {} })),
    } as unknown as SequenceAnimationOrchestrator;
    let update: (() => void) | null = null;
    // Reading `update` through a wrapper keeps it correctly typed at the call
    // site below: TS's control-flow analysis doesn't see the reassignment
    // inside `loop.start`'s mock (reached through `controller.togglePlayback()`),
    // so a direct `update?.()` after that call sees a stale narrowed type.
    const callUpdate = () => update?.();
    const loop = {
      start: vi.fn((callback: () => void) => {
        update = callback;
      }),
      stop: vi.fn(),
      setActivityGate: vi.fn(),
    } as unknown as AnimationLoop;
    const controller = new AnimationPlaybackController(engine, loop);

    controller.initialize(sequence, state);
    currentStep = 3; // The final motion has landed and its pause has elapsed.
    controller.togglePlayback();
    vi.advanceTimersByTime(0);

    expect(state.setCurrentStep).toHaveBeenLastCalledWith(0);
    expect(loop.start).toHaveBeenCalledTimes(1);
    expect(playing).toBe(true);

    vi.advanceTimersByTime(1_000);
    callUpdate();
    vi.advanceTimersByTime(299);
    expect(loop.start).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(loop.start).toHaveBeenCalledTimes(2);

    controller.dispose();
  });
});
