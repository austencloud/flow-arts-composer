import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  captureT3Slice,
  seedFromT3Slice,
  persistedT3SliceFromStorage,
  postNormalizeSceneFeatureDefaults,
} = await import("./t3-slice");
const { createSceneFeatureState } = await import(
  "#lib/shared/3d/scene-features/state/scene-feature-state.svelte.js"
);
const { SCENE_FEATURES } = await import(
  "#lib/shared/3d/scene-features/domain/scene-feature-registry.js"
);
const { createRootedViewer3DState } = await import("./t3-slice-test-harness.svelte");
type Viewer3DOptions = Parameters<typeof createRootedViewer3DState>[0];
const { SceneEnvironmentId, DEFAULT_SCENE_ENVIRONMENT_ID } = await import(
  "#lib/shared/3d/environments/domain/scene-environment.js"
);

const ENVIRONMENT_KEY = "tka-viewer3d-environment";
const FEATURES_KEY = "tka-scene-features";
const ENCODED_KEYS = [ENVIRONMENT_KEY, FEATURES_KEY];

const disposals: Array<() => void> = [];

/** viewer-3d-state registers `$effect`s, so it needs an effect root. */
function viewer3D(options: Viewer3DOptions) {
  const rooted = createRootedViewer3DState(options);
  disposals.push(rooted.dispose);
  return rooted.state;
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  while (disposals.length) disposals.pop()!();
  vi.restoreAllMocks();
});

describe("t3 slice", () => {
  it("returns null at post-normalize defaults", () => {
    expect(
      captureT3Slice({
        environmentId: DEFAULT_SCENE_ENVIRONMENT_ID,
        features: createSceneFeatureState(undefined, { isolated: true }),
      })
    ).toBeNull();
  });

  it("returns null for a factory-fresh PERSISTED feature load (no stored entry)", () => {
    // The fx/an trap: a boot migration can make a fresh load differ from the
    // raw constant. createSceneFeatureState() with nothing stored resolves
    // every key to its registry default — no forced or derived fields — so
    // this must stay null, and the registry IS the post-normalize baseline.
    localStorage.clear();
    const features = createSceneFeatureState();
    expect(
      captureT3Slice({
        environmentId: DEFAULT_SCENE_ENVIRONMENT_ID,
        features,
      })
    ).toBeNull();

    const live: Record<string, boolean> = {};
    for (const feature of SCENE_FEATURES) live[feature.key] = features.isEnabled(feature.key);
    expect(live).toEqual(postNormalizeSceneFeatureDefaults());
  });

  it("captures the environment only when it differs from the default", () => {
    const features = createSceneFeatureState(undefined, { isolated: true });
    expect(
      captureT3Slice({ environmentId: SceneEnvironmentId.OCEAN, features })
    ).toEqual({ env: SceneEnvironmentId.OCEAN });
  });

  it("captures only the feature keys that differ", () => {
    const features = createSceneFeatureState(undefined, { isolated: true });
    features.toggle("audience"); // default false -> true
    features.toggle("tent"); // default true  -> false

    const slice = captureT3Slice({
      environmentId: DEFAULT_SCENE_ENVIRONMENT_ID,
      features,
    });
    expect(slice).toEqual({ features: { audience: true, tent: false } });
  });

  it("omits the features sub-key when no pane is mounted", () => {
    // A closed 3D pane has no feature state; the session's pass-through keeps
    // whatever `t3` already held rather than this emitting a half payload.
    expect(
      captureT3Slice({ environmentId: SceneEnvironmentId.FOREST, features: null })
    ).toEqual({ env: SceneEnvironmentId.FOREST });
    expect(
      captureT3Slice({ environmentId: DEFAULT_SCENE_ENVIRONMENT_ID, features: null })
    ).toBeNull();
  });

  it("round-trips: capture -> seed -> apply -> capture is identity", () => {
    const a = createSceneFeatureState(undefined, { isolated: true });
    a.toggle("audience");
    a.toggle("campfire");
    const slice = captureT3Slice({
      environmentId: SceneEnvironmentId.WINTER,
      features: a,
    });

    const seed = seedFromT3Slice(slice!);
    const viewer = viewer3D({ viewOnlyEnvironmentId: seed.environmentId });
    const b = createSceneFeatureState(seed.sceneFeatures, { isolated: true });

    expect(
      captureT3Slice({ environmentId: viewer.environmentId, features: b })
    ).toEqual(slice);
    expect(viewer.environmentId).toBe(SceneEnvironmentId.WINTER);
    expect(b.isEnabled("audience")).toBe(true);
    expect(b.isEnabled("campfire")).toBe(false);
  });

  it("seedFromT3Slice merges onto post-normalize defaults, not user state", () => {
    const seeded = seedFromT3Slice({ features: { audience: true } });
    expect(seeded.environmentId).toBe(DEFAULT_SCENE_ENVIRONMENT_ID);
    expect(seeded.sceneFeatures).toEqual({
      ...postNormalizeSceneFeatureDefaults(),
      audience: true,
    });
  });

  it("always seeds a COMPLETE feature map, even from an empty payload", () => {
    // A null feature override makes Viewer3DCanvas fall back to the shared
    // `tka-scene-features` key, which reads AND writes the recipient's disk.
    // An override session must never land there.
    const seeded = seedFromT3Slice({ env: SceneEnvironmentId.OCEAN });
    expect(seeded.sceneFeatures).toEqual(postNormalizeSceneFeatureDefaults());
    expect(Object.keys(seeded.sceneFeatures)).toHaveLength(SCENE_FEATURES.length);
  });

  it("seed -> tweak writes zero times to either encoded key", () => {
    const seed = seedFromT3Slice({
      env: SceneEnvironmentId.OCEAN,
      features: { audience: true },
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    const viewer = viewer3D({
      viewOnlyEnvironmentId: seed.environmentId,
      // A first-use environment the override must beat, and whose migration
      // write must not fire.
      firstUseEnvironment: SceneEnvironmentId.BLOSSOM,
    });
    const features = createSceneFeatureState(seed.sceneFeatures, { isolated: true });
    expect(viewer.environmentId).toBe(SceneEnvironmentId.OCEAN);
    expect(features.isEnabled("audience")).toBe(true);

    // A recipient tweaking during the session stays session-local too.
    viewer.setEnvironmentId(SceneEnvironmentId.FOREST);
    features.toggle("tent");
    expect(viewer.environmentId).toBe(SceneEnvironmentId.FOREST);
    expect(features.isEnabled("tent")).toBe(false);

    const touched = setItem.mock.calls
      .map((call) => String(call[0]))
      .filter((key) => ENCODED_KEYS.includes(key));
    expect(touched).toEqual([]);
    expect(localStorage.getItem(ENVIRONMENT_KEY)).toBeNull();
    expect(localStorage.getItem(FEATURES_KEY)).toBeNull();
  });

  it("beats a recipient's STORED environment and leaves their key intact", () => {
    // The recipient already chose Forest. The link says Ocean: they see Ocean,
    // their key still says forest when the tab closes.
    localStorage.setItem(ENVIRONMENT_KEY, SceneEnvironmentId.FOREST);
    localStorage.setItem(FEATURES_KEY, JSON.stringify({ tent: false }));
    const seed = seedFromT3Slice({
      env: SceneEnvironmentId.OCEAN,
      features: { audience: true },
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    const viewer = viewer3D({ viewOnlyEnvironmentId: seed.environmentId });
    const features = createSceneFeatureState(seed.sceneFeatures, { isolated: true });
    expect(viewer.environmentId).toBe(SceneEnvironmentId.OCEAN);
    expect(features.isEnabled("audience")).toBe(true);
    // The sender left `tent` at its default, so the recipient's stored `false`
    // must NOT bleed into the override.
    expect(features.isEnabled("tent")).toBe(true);

    viewer.setEnvironmentId(SceneEnvironmentId.WINTER);
    features.toggle("campfire");

    const touched = setItem.mock.calls
      .map((call) => String(call[0]))
      .filter((key) => ENCODED_KEYS.includes(key));
    expect(touched).toEqual([]);
    expect(localStorage.getItem(ENVIRONMENT_KEY)).toBe(SceneEnvironmentId.FOREST);
    expect(JSON.parse(localStorage.getItem(FEATURES_KEY)!)).toEqual({ tent: false });
  });

  it("guards the spy: the same calls DO write without the view-only seam", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    const viewer = viewer3D({ firstUseEnvironment: SceneEnvironmentId.BLOSSOM });
    const features = createSceneFeatureState();
    viewer.setEnvironmentId(SceneEnvironmentId.FOREST);
    features.toggle("tent");

    const touched = new Set(
      setItem.mock.calls
        .map((call) => String(call[0]))
        .filter((key) => ENCODED_KEYS.includes(key))
    );
    expect([...touched].sort()).toEqual([...ENCODED_KEYS].sort());
    expect(localStorage.getItem(ENVIRONMENT_KEY)).toBe(SceneEnvironmentId.FOREST);
  });

  it("persistedT3SliceFromStorage reproduces capture from disk, read-only", () => {
    localStorage.setItem(ENVIRONMENT_KEY, SceneEnvironmentId.OCEAN);
    localStorage.setItem(
      FEATURES_KEY,
      // A stale key outside the registry must be ignored, exactly as
      // createSceneFeatureState ignores it.
      JSON.stringify({ audience: true, tent: false, retiredFeature: true })
    );
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    expect(persistedT3SliceFromStorage()).toEqual({
      env: SceneEnvironmentId.OCEAN,
      features: { audience: true, tent: false },
    });
    expect(setItem).not.toHaveBeenCalled();
  });

  it("persistedT3SliceFromStorage matches what a persistent viewer holds", () => {
    // Both sides of the own-link comparison have to agree, including the
    // first-use fallback a fresh visitor gets from their app background.
    expect(persistedT3SliceFromStorage(SceneEnvironmentId.BLOSSOM)).toEqual({
      env: SceneEnvironmentId.BLOSSOM,
    });

    const viewer = viewer3D({ firstUseEnvironment: SceneEnvironmentId.BLOSSOM });
    expect(
      captureT3Slice({
        environmentId: viewer.environmentId,
        features: createSceneFeatureState(),
      })
    ).toEqual({ env: SceneEnvironmentId.BLOSSOM });
  });

  it("is null for a visitor sitting on the default environment", () => {
    localStorage.setItem(ENVIRONMENT_KEY, DEFAULT_SCENE_ENVIRONMENT_ID);
    expect(persistedT3SliceFromStorage()).toBeNull();
  });

  describe("full snapshot", () => {
    it("emits env and every registry feature at defaults, and round-trips", () => {
      const full = captureT3Slice(
        {
          environmentId: DEFAULT_SCENE_ENVIRONMENT_ID,
          features: createSceneFeatureState(undefined, { isolated: true }),
        },
        { full: true }
      );
      expect(full?.env).toBe(DEFAULT_SCENE_ENVIRONMENT_ID);
      expect(Object.keys(full!.features!).sort()).toEqual(
        SCENE_FEATURES.map((f) => f.key).sort()
      );
      const seed = seedFromT3Slice(full!);
      expect(seed.sceneFeatures).toEqual(postNormalizeSceneFeatureDefaults());
      expect(
        captureT3Slice(
          {
            environmentId: seed.environmentId,
            features: { isEnabled: (k) => seed.sceneFeatures[k] ?? false },
          },
          { full: true }
        )
      ).toEqual(full);
    });

    it("unmountedT3SliceSource expands a seed, else reads disk read-only", async () => {
      const { unmountedT3SliceSource } = await import("./t3-slice");
      const seed = seedFromT3Slice({ env: SceneEnvironmentId.BLOSSOM });
      const fromSeed = unmountedT3SliceSource(seed, DEFAULT_SCENE_ENVIRONMENT_ID)!;
      expect(fromSeed.environmentId).toBe(SceneEnvironmentId.BLOSSOM);
      expect(captureT3Slice(fromSeed, { full: true })).toEqual(
        captureT3Slice(
          {
            environmentId: SceneEnvironmentId.BLOSSOM,
            features: createSceneFeatureState(undefined, { isolated: true }),
          },
          { full: true }
        )
      );

      localStorage.setItem(ENVIRONMENT_KEY, SceneEnvironmentId.BLOSSOM);
      const setItem = vi.spyOn(Storage.prototype, "setItem");
      const fromDisk = unmountedT3SliceSource(null, DEFAULT_SCENE_ENVIRONMENT_ID)!;
      expect(captureT3Slice(fromDisk, { full: true })).toEqual(
        persistedT3SliceFromStorage(DEFAULT_SCENE_ENVIRONMENT_ID, { full: true })
      );
      expect(setItem).not.toHaveBeenCalled();
    });
  });
});
