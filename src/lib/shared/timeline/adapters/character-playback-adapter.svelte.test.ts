import { describe, expect, it, vi } from "vitest";

import { createCharacterPlaybackAdapter } from "./character-playback-adapter.svelte";

describe("createCharacterPlaybackAdapter", () => {
  it("displays the orchestrator playhead when a hydrated character is stale", () => {
    let canonicalStep = 0.75;
    const seek = vi.fn((target: number) => {
      canonicalStep = target;
    });
    const adapter = createCharacterPlaybackAdapter(
      () => ({
        progress: 0.75,
        currentStepIndex: 0,
        totalSteps: 12,
        isPlaying: false,
        speed: 1,
        loop: true,
        togglePlay: vi.fn(),
        setProgress: vi.fn(),
        goToStep: vi.fn(),
      }),
      {
        onPlaybackToggle: vi.fn(),
        onProgressBarSeek: seek,
        getIsPlaying: () => false,
        getCurrentStep: () => canonicalStep,
        getTotalSteps: () => 12,
      }
    );

    adapter.seek(1 / 3);
    expect(seek).toHaveBeenCalledWith(4);
    expect(adapter.overallProgress).toBeCloseTo(1 / 3);
    expect(adapter.currentStep).toBe(5);

    canonicalStep = 7.5;
    expect(adapter.overallProgress).toBeCloseTo(7.5 / 12);
    expect(adapter.currentStep).toBe(8);
  });

  it("keeps transport available while the character sequence is hydrating", () => {
    const seek = vi.fn();
    const toggle = vi.fn();
    const adapter = createCharacterPlaybackAdapter(
      () => ({
        progress: 0,
        currentStepIndex: 0,
        totalSteps: 0,
        isPlaying: false,
        speed: 1,
        loop: true,
        togglePlay: vi.fn(),
        setProgress: vi.fn(),
        goToStep: vi.fn(),
      }),
      {
        onPlaybackToggle: toggle,
        onProgressBarSeek: seek,
        getIsPlaying: () => false,
        getCurrentStep: () => 1.5,
        getTotalSteps: () => 8,
      }
    );

    expect(adapter.totalSteps).toBe(8);
    expect(adapter.currentStep).toBe(2);
    expect(adapter.overallProgress).toBe(1.5 / 8);
    expect(adapter.beatMarkerPositions).toHaveLength(7);

    adapter.seek(0.5);
    expect(seek).toHaveBeenCalledWith(4);

    adapter.togglePlay();
    expect(toggle).toHaveBeenCalledOnce();
  });
});
