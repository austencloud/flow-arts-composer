import { describe, expect, it, vi } from "vitest";
import { PlaybackSync, type PlaybackSyncDeps } from "./playback-sync";
import type { AnimatorState } from "../../state/animator-state.svelte";
import type { AnimationEngineProps } from "../animation-engine.svelte";
import type { RenderFrameParams } from "../IAnimationRenderLoop";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

function createSync() {
  const gridLoads: Array<() => void> = [];
  const triggerRender = vi.fn<(get: () => RenderFrameParams) => void>();
  const resetRunHistory = vi.fn();
  const initializeWithDomainData = vi.fn();
  const clearBuffers = vi.fn();
  const deps = {
    lifecycleManager: {
      animationRenderer: {
        loadGridTexture: vi.fn(() => {
          const load = deferred();
          gridLoads.push(load.resolve);
          return load.promise;
        }),
      },
      renderLoop: { triggerRender, resetRunHistory },
      orchestrator: { initializeWithDomainData },
      syncMandalaOverlay: vi.fn(),
    },
    propSystem: {
      handlePropTypeChanges: vi.fn(),
      syncPropTypeFromChanger: vi.fn(),
    },
    frameSystem: {
      buildFrameParams: (props: AnimationEngineProps) =>
        ({ props }) as unknown as RenderFrameParams,
      onGridJoinTweenEnd: vi.fn(),
      syncGlyphState: vi.fn(),
      calculateBeatNumber: () => 0,
      calculateMusicalPosition: () => null,
      getSequenceContentHash: (sequence: SequenceData) => sequence.id,
      lastSequenceContentHash: null,
    },
    effectSystem: { trailOverlay: { clearBuffers } },
    getVM: vi.fn(),
    getCallbacks: () => ({}),
    getCanvasSize: () => 500,
    setCanvasSize: vi.fn(),
    buildFrameDeps: () => ({}),
  } as unknown as PlaybackSyncDeps;
  const state = {
    isInitialized: true,
    visibilityState: { mandala: false },
    currentLeftPropType: "staff",
    currentRightPropType: "staff",
    trailSettings: { usePathCache: false },
  } as unknown as AnimatorState;
  return {
    sync: new PlaybackSync(state, deps),
    gridLoads,
    triggerRender,
    resetRunHistory,
    initializeWithDomainData,
    clearBuffers,
  };
}

function sequence(id: string, startPlacement = "alpha1"): SequenceData {
  return {
    id,
    steps: [],
    isCircular: true,
    startPlacement: { startPlacement },
  } as unknown as SequenceData;
}

function showing(sequenceData: SequenceData | null): AnimationEngineProps {
  return {
    leftProp: { centerPathAngle: 0, staffRotationAngle: 0 },
    rightProp: { centerPathAngle: 0, staffRotationAngle: 0 },
    sequenceData,
  };
}

describe("PlaybackSync redraw requests", () => {
  // The render loop keeps the last frame callback it was handed. A grid
  // texture that finishes loading after newer props arrived must not hand it
  // the props from before the wait: a player that had just loaded another
  // sequence drew one frame of the previous sequence, and the trail kept it.
  it("draws the newest props when a grid reload finishes late", async () => {
    const { sync, gridLoads, triggerRender } = createSync();
    const before: AnimationEngineProps = {
      leftProp: { centerPathAngle: 1, staffRotationAngle: 1 },
      rightProp: { centerPathAngle: 1, staffRotationAngle: 1 },
      gridMode: GridMode.BOX,
    };
    const after: AnimationEngineProps = {
      leftProp: { centerPathAngle: 2, staffRotationAngle: 2 },
      rightProp: { centerPathAngle: 2, staffRotationAngle: 2 },
      gridMode: GridMode.BOX,
    };

    sync.update(before);
    expect(gridLoads).toHaveLength(1);
    sync.update(after);
    gridLoads[0]!();
    await Promise.resolve();

    const latestRequest = triggerRender.mock.calls.at(-1)![0];
    expect(latestRequest().props).toBe(after);
  });
});

describe("PlaybackSync runs", () => {
  // Play loads the sequence again even when it is the one already in the
  // player. The player was hidden since the last run, so the trail, Ghost and
  // flames froze where that run stopped; without a clear they opened the new
  // run at Start.
  it("starts the effects over when the same sequence loads again", () => {
    const { sync, resetRunHistory, initializeWithDomainData, clearBuffers } =
      createSync();
    sync.update(showing(sequence("a")));
    clearBuffers.mockClear();
    resetRunHistory.mockClear();

    sync.update(showing(null));
    sync.update(showing(sequence("a")));

    expect(clearBuffers).toHaveBeenCalledTimes(1);
    expect(resetRunHistory).toHaveBeenCalledTimes(1);
    // Same content, so no second setup of the motion data.
    expect(initializeWithDomainData).toHaveBeenCalledTimes(1);
  });

  it("keeps the effects while the same run keeps updating", () => {
    const { sync, resetRunHistory, clearBuffers } = createSync();
    sync.update(showing(sequence("a")));
    clearBuffers.mockClear();
    resetRunHistory.mockClear();

    sync.update(showing(sequence("a")));

    expect(clearBuffers).not.toHaveBeenCalled();
    expect(resetRunHistory).not.toHaveBeenCalled();
  });

  // The homepage hero chains loops that start where the last one ended, so
  // the trail flows across the handoff instead of vanishing.
  it("keeps the trail across a seamless handoff to the next loop", () => {
    const { sync, resetRunHistory, clearBuffers } = createSync();
    sync.update(showing(sequence("a")));
    clearBuffers.mockClear();
    resetRunHistory.mockClear();

    sync.update(showing(null));
    sync.update(showing(sequence("b")));

    expect(clearBuffers).not.toHaveBeenCalled();
    expect(resetRunHistory).not.toHaveBeenCalled();
  });

  it("starts the effects over for a different sequence", () => {
    const { sync, resetRunHistory, clearBuffers } = createSync();
    sync.update(showing(sequence("a")));
    clearBuffers.mockClear();
    resetRunHistory.mockClear();

    sync.update(showing(null));
    sync.update(showing(sequence("b", "beta5")));

    expect(clearBuffers).toHaveBeenCalledTimes(1);
    expect(resetRunHistory).toHaveBeenCalledTimes(1);
  });
});
