import { describe, it, expect, vi } from "vitest";

vi.mock("$lib/shared/di", () => ({ container: {} }));
vi.mock("$lib/shared/di/containers/core-container", () => ({}));
vi.mock("@firebase/firestore", () => ({}));
vi.mock("@firebase/firestore/lite", () => ({}));
vi.mock("$lib/shared/application/state/app-state.svelte", () => ({
  getSettings: vi.fn(() => ({})),
}));
vi.mock(
  "$lib/shared/settings/services/implementations/FirebaseSettingsPersister",
  () => ({
    FirebaseSettingsPersister: class {},
  })
);
vi.mock(
  "$lib/shared/animation-engine/state/animation-visibility-state.svelte",
  () => ({
    getAnimationVisibilityManager: vi.fn(() => ({
      getEffortPreset: () => "linear",
    })),
  })
);
vi.mock("$lib/features/compose/utils/animation-panel-persistence", () => ({
  loadTrailSettings: vi.fn(() => ({})),
}));
vi.mock(
  "$lib/features/compose/services/implementations/Canvas2DAnimationRenderer",
  () => ({
    Canvas2DAnimationRenderer: class {},
  })
);
vi.mock("$lib/shared/animation-engine/services/animator-loader", () => ({
  loadAnimatorServices: vi.fn(),
}));
vi.mock("$lib/shared/landing/services/prop-type-applier", () => ({
  applyToSequence: vi.fn((seq: unknown) => seq),
}));
vi.mock("$lib/shared/pictograph/grid/services/grid-placement-deriver", () => ({
  getGridPlacementFromLocations: vi.fn(),
}));
vi.mock("$lib/shared/browse/get-claude-code-copier", () => ({
  getClaudeCodeCopier: vi.fn(() => ({
    copyForClaude: vi.fn(async () => ({ success: true })),
  })),
}));
vi.mock(
  "$lib/shared/pictograph/shared/services/start-placement-deriver",
  () => ({
    startPlacementDeriver: { getOrDeriveStartPlacement: vi.fn(() => null) },
  })
);

import { effect_root } from "svelte/internal/client";
import { createEndlessPlayback } from "$lib/shared/animation-engine/state/endless-playback-state.svelte";

describe("createEndlessPlayback", () => {
  it("module exports createEndlessPlayback function", () => {
    expect(typeof createEndlessPlayback).toBe("function");
  });

  it("creates state with expected shape", () => {
    const mockSpinner = {
      initialize: vi.fn(async () => {}),
      getInitialSequence: vi.fn(async () => null),
      getNextSequence: vi.fn(async () => null),
    };
    const mockGenerator = {
      generateInitial: vi.fn(async () => null),
      generateFromEndState: vi.fn(async () => null),
      getSessionCount: vi.fn(() => 0),
    };
    const mockPlaybackController = {
      initialize: vi.fn(() => true),
      togglePlayback: vi.fn(),
      seekToStep: vi.fn(),
      dispose: vi.fn(),
    };

    let state: ReturnType<typeof createEndlessPlayback>;
    const cleanup = effect_root(() => {
      state = createEndlessPlayback({
        modes: ["library", "infinite"],
        defaultMode: "library",
        spinnerOrchestrator: mockSpinner,
        infiniteGenerator: mockGenerator,
        playbackController: mockPlaybackController as any,
      });
    });

    expect(state!.currentSequence).toBeNull();
    expect(state!.sourceMode).toBe("library");
    expect(state!.history).toEqual([]);
    expect(state!.sequenceSwapCount).toBe(0);
    expect(state!.isChainingNow).toBe(false);
    expect(state!.isPreloading).toBe(false);
    expect(state!.servicesReady).toBe(false);
    expect(typeof state!.initialize).toBe("function");
    expect(typeof state!.setSourceMode).toBe("function");
    expect(typeof state!.setPropType).toBe("function");
    expect(typeof state!.setChainingEnabled).toBe("function");
    expect(typeof state!.skip).toBe("function");
    expect(typeof state!.shuffle).toBe("function");
    expect(typeof state!.copyForAI).toBe("function");
    expect(typeof state!.copyHistoryEntry).toBe("function");
    expect(typeof state!.hotSwapSequence).toBe("function");
    expect(typeof state!.dispose).toBe("function");

    state!.dispose();
    cleanup();
  });

  it("counts every accepted sequence swap", async () => {
    const initialSequence = {
      id: "initial",
      name: "initial",
      word: "initial",
      steps: [],
      thumbnails: [],
      isFavorite: false,
      isCircular: false,
      tags: [],
      metadata: {},
    } as any;
    const mockSpinner = {
      initialize: vi.fn(async () => {}),
      getInitialSequence: vi.fn(async () => initialSequence),
      getNextSequence: vi.fn(async () => null),
    };
    const mockGenerator = {
      generateInitial: vi.fn(async () => null),
      generateFromEndState: vi.fn(async () => null),
      getSessionCount: vi.fn(() => 0),
    };
    const mockPlaybackController = {
      initialize: vi.fn(() => true),
      togglePlayback: vi.fn(),
      seekToStep: vi.fn(),
      dispose: vi.fn(),
    };

    let state: ReturnType<typeof createEndlessPlayback>;
    const cleanup = effect_root(() => {
      state = createEndlessPlayback({
        modes: ["library"],
        defaultMode: "library",
        spinnerOrchestrator: mockSpinner,
        infiniteGenerator: mockGenerator,
        playbackController: mockPlaybackController as any,
      });
    });

    await state!.initialize();

    expect(state!.sequenceSwapCount).toBe(1);
    expect(state!.currentSequence?.id).toBe("initial");

    state!.dispose();
    cleanup();
  });
});
