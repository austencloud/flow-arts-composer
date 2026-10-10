import { describe, expect, it, vi } from "vitest";
import { PlaybackSync, type PlaybackSyncDeps } from "./playback-sync";
import type { AnimatorState } from "../../state/animator-state.svelte";
import type { AnimationEngineProps } from "../animation-engine.svelte";
import type { RenderFrameParams } from "../IAnimationRenderLoop";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

function createSync() {
  const gridLoads: Array<() => void> = [];
  const triggerRender = vi.fn<(get: () => RenderFrameParams) => void>();
  const deps = {
    lifecycleManager: {
      animationRenderer: {
        loadGridTexture: vi.fn(() => {
          const load = deferred();
          gridLoads.push(load.resolve);
          return load.promise;
        }),
      },
      renderLoop: { triggerRender },
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
    },
    effectSystem: {},
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
  } as unknown as AnimatorState;
  return { sync: new PlaybackSync(state, deps), gridLoads, triggerRender };
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
