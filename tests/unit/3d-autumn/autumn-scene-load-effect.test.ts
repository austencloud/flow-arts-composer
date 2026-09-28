import { flushSync, mount, unmount } from "svelte";
import { Group } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AutumnEnvironmentAssets,
  LoadAutumnEnvironmentAssetsOptions,
} from "$lib/shared/3d/environments/worlds/autumn/autumn-environment-assets";
import {
  createSceneFeatureState,
  type SceneFeatureState,
} from "$lib/shared/3d/scene-features/state/scene-feature-state.svelte";

import AutumnSceneHarness from "./AutumnSceneHarness.svelte";

interface PendingLoad {
  options: LoadAutumnEnvironmentAssetsOptions;
  resolve(assets: AutumnEnvironmentAssets): void;
  settled: Promise<AutumnEnvironmentAssets>;
}

const stubs = vi.hoisted(() => ({
  loads: [] as PendingLoad[],
  loadAssets: vi.fn(),
  createWorld: vi.fn(),
}));

vi.mock("@threlte/core", () => ({
  useThrelte: () => ({
    camera: { current: null },
    renderer: { domElement: document.createElement("canvas") },
    scene: { fog: null, background: null },
  }),
  useTask: () => undefined,
}));

vi.mock("@austencloud/scene-3d", () => ({
  userProportionsState: { groundY: 0 },
}));

vi.mock(
  "$lib/shared/3d/environments/worlds/autumn/autumn-environment-assets",
  () => ({
    AutumnEnvironmentLoadError: class AutumnEnvironmentLoadError extends Error {},
    loadAutumnEnvironmentAssets: stubs.loadAssets,
  })
);

vi.mock(
  "$lib/shared/3d/environments/worlds/autumn/autumn-environment-world",
  () => ({
    createAutumnEnvironmentWorld: stubs.createWorld,
    attachAutumnEnvironmentWorld: () => () => {},
  })
);

// Like the real loader, report both tracked assets as pending before the first
// await. Those reports run synchronously inside the scene's load effect.
function startLoad(
  options: LoadAutumnEnvironmentAssetsOptions
): Promise<AutumnEnvironmentAssets> {
  options.onAssetStatus?.("environment", "pending");
  options.onAssetStatus?.("groundDetail", "pending");
  let resolve!: (assets: AutumnEnvironmentAssets) => void;
  const settled = new Promise<AutumnEnvironmentAssets>((done) => {
    resolve = done;
  });
  stubs.loads.push({ options, resolve, settled });
  return settled;
}

function fakeWorld() {
  return {
    root: new Group(),
    environmentRoot: new Group(),
    fog: null,
    background: null,
    update: vi.fn(),
    pointerMove: vi.fn(() => false),
    pointerLeave: vi.fn(),
    setActive: vi.fn(),
    setConfig: vi.fn(),
    setGroundY: vi.fn(),
    setMotionScale: vi.fn(),
    setPerformers: vi.fn(),
    setTier: vi.fn(),
    dispose: vi.fn(),
  };
}

// The load effect resets the boot ledger to a fresh object, then starts the
// loader, which reports status back into that ledger before its first await.
// If a report reads the ledger, the effect subscribes to the object it just
// replaced and reruns forever: every rerun aborts the load and starts another,
// until Svelte throws effect_update_depth_exceeded. In the browser each rerun
// also fetched the moon texture again, thousands of times per page load.
describe("AutumnScene load effect", () => {
  let features: SceneFeatureState;
  let mounted: ReturnType<typeof mount> | null = null;

  beforeEach(() => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    stubs.loads.length = 0;
    stubs.loadAssets.mockImplementation(startLoad);
    stubs.createWorld.mockImplementation(fakeWorld);
    features = createSceneFeatureState(undefined, { isolated: true });
    mounted = mount(AutumnSceneHarness, {
      target: document.body,
      props: { features },
    });
  });

  afterEach(() => {
    if (mounted) void unmount(mounted);
    mounted = null;
    stubs.loadAssets.mockReset();
    stubs.createWorld.mockReset();
    vi.restoreAllMocks();
  });

  it("starts one asset load when it mounts", () => {
    flushSync();

    expect(stubs.loadAssets).toHaveBeenCalledTimes(1);
  });

  it("builds the world once and reports the environment ready", async () => {
    flushSync();
    const [load] = stubs.loads;
    if (!load) throw new Error("the scene never started a load");

    load.options.onAssetStatus?.("groundDetail", "ready");
    load.options.onAssetStatus?.("environment", "ready");
    load.resolve({
      environment: new Group(),
      groundDetailMap: null,
      moonTexture: null,
    });
    await load.settled;
    flushSync();

    // A world rebuilt from the same assets means the first one, and the
    // assets under it, were disposed while the scene was still showing them.
    expect(stubs.createWorld).toHaveBeenCalledTimes(1);
    const world = stubs.createWorld.mock.results[0]?.value as ReturnType<
      typeof fakeWorld
    >;
    expect(world.dispose).not.toHaveBeenCalled();
    expect(features.isReady("environment")).toBe(true);
    expect(stubs.loadAssets).toHaveBeenCalledTimes(1);
  });

  it("restarts the load once per retry request", () => {
    flushSync();

    features.requestRetry("environment");
    flushSync();

    expect(stubs.loadAssets).toHaveBeenCalledTimes(2);
    expect(stubs.loads[0]?.options.signal?.aborted).toBe(true);
    expect(stubs.loads[1]?.options.retryRequest).toBe(1);
  });
});
