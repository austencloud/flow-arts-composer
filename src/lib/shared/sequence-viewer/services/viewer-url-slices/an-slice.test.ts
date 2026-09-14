import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flushSync } from "svelte";

// The jsdom stub pins `browser` to false, which short-circuits
// `createPersistenceHelper.save()` and would make the settings half of the
// zero-write guard vacuously pass. Persistence has to be live for that test to
// mean anything.
vi.mock("$app/environment", () => ({
  browser: true,
  dev: true,
  building: false,
  version: "test",
}));

const { captureAnSlice, seedFromAnSlice, postNormalizeVisibilityDefaults } =
  await import("./an-slice");
const {
  createAnimationSettingsState,
  DEFAULT_TRAIL_SETTINGS,
  TrackingMode,
  TrailMode,
} =
  await import("$lib/shared/animation-engine/state/animation-settings-state.svelte");
const { AnimationVisibilityStateManager } =
  await import("$lib/shared/animation-engine/state/animation-visibility-state.svelte");

const SETTINGS_KEY = "tka_animation_settings";
const VISIBILITY_KEY = "animation-visibility-settings";

describe("path preview links", () => {
  it("encodes an Arc override even though Arc is the default", () => {
    const visibility = new AnimationVisibilityStateManager({ ephemeral: true });
    visibility.setPathPolicy({ pathShape: "concave", motionAwarePaths: true });
    visibility.beginPathSession(
      { pathShape: "concave", motionAwarePaths: true },
      2
    );
    visibility.setPathPolicy({ pathShape: "arc", motionAwarePaths: false });
    const payload = captureAnSlice({
      settings: createAnimationSettingsState({ ephemeral: true }),
      visibility,
    });
    expect(payload?.pathPreview).toBe(true);
    const seed = seedFromAnSlice(payload!);
    expect(seed.visibility.pathShape).toBe("arc");
    expect(seed.visibility.motionAwarePaths).toBe(false);
    expect(visibility.snapshot().motionAwarePaths).toBe(true);
    visibility.restoreSavedPaths();
    expect(
      captureAnSlice({
        settings: createAnimationSettingsState({ ephemeral: true }),
        visibility,
      })?.pathPreview
    ).toBeUndefined();
  });
});

function defaultStores() {
  return {
    settings: createAnimationSettingsState({ ephemeral: true }),
    visibility: new AnimationVisibilityStateManager({ ephemeral: true }),
  };
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("an slice", () => {
  it("returns null at post-normalize defaults", () => {
    expect(captureAnSlice(defaultStores())).toBeNull();
  });

  it("returns null for a factory-fresh PERSISTED load (no stored entry)", () => {
    // The fx trap: a boot migration can make a fresh load differ from the raw
    // constant. Diffing a real persisted load proves the baselines are right.
    const stores = {
      settings: createAnimationSettingsState(),
      visibility: new AnimationVisibilityStateManager(),
    };
    expect(captureAnSlice(stores)).toBeNull();
  });

  it("returns null when migrations rewrite a legacy entry back to defaults", () => {
    // v1 install: Thumb End tracking + a stale trail look. `loadSettings`
    // promotes the tracking mode and force-writes the vivid preset, so the
    // result is the default experience and must not stamp an `an` payload.
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        version: 1,
        bpm: 120,
        shouldLoop: true,
        trail: {
          ...DEFAULT_TRAIL_SETTINGS,
          trackingMode: TrackingMode.RIGHT_END,
          mode: TrailMode.OFF,
          lineWidth: 99,
          glowBlur: 0,
        },
      })
    );
    // Same trap on the other key: `stepNumbers` is forced true on every load.
    localStorage.setItem(
      VISIBILITY_KEY,
      JSON.stringify({ stepNumbers: false, pathLines: false })
    );

    const stores = {
      settings: createAnimationSettingsState(),
      visibility: new AnimationVisibilityStateManager(),
    };
    expect(stores.settings.trail.trackingMode).toBe(TrackingMode.BOTH_ENDS);
    expect(stores.settings.trail.lineWidth).toBe(
      DEFAULT_TRAIL_SETTINGS.lineWidth
    );
    expect(captureAnSlice(stores)).toBeNull();
  });

  it("captures only the keys that differ, on both sub-keys", () => {
    const stores = defaultStores();
    stores.settings.setBpm(96);
    stores.settings.setTailLength(180);
    stores.visibility.setGridMode("none");

    const slice = captureAnSlice(stores);
    expect(slice?.settings?.bpm).toBe(96);
    expect(slice?.settings?.trail).toEqual({ tailLength: 180 });
    expect(slice?.settings && "shouldLoop" in slice.settings).toBe(false);
    expect(slice?.visibility).toEqual({ gridMode: "none" });
  });

  it("omits a sub-key whose store is untouched", () => {
    const stores = defaultStores();
    stores.visibility.setVisibility("mandala", false);

    const slice = captureAnSlice(stores);
    expect(slice?.visibility).toEqual({ mandala: false });
    expect(slice && "settings" in slice).toBe(false);
  });

  it("treats effortPreset + tipEffortMap as one quantity", () => {
    const stores = defaultStores();
    // Diverged pair: the wildcard map is what the renderer keys off, so it wins
    // and both fields travel together.
    stores.visibility.setTipEffortMap({ "*": { effort: "bounce" } });

    const slice = captureAnSlice(stores);
    expect(slice?.visibility?.effortPreset).toBe("bounce");
    expect(slice?.visibility?.tipEffortMap).toEqual({
      "*": { effort: "bounce" },
    });

    const seeded = seedFromAnSlice(slice!);
    expect(seeded.visibility.effortPreset).toBe("bounce");
    expect(seeded.visibility.tipEffortMap).toEqual({
      "*": { effort: "bounce" },
    });
  });

  it("keeps an exotic per-tip effort map verbatim", () => {
    const stores = defaultStores();
    stores.visibility.setTipEffortMap({ "3": { effort: "bounce" } });

    const slice = captureAnSlice(stores);
    expect(slice?.visibility?.effortPreset).toBe("linear");
    expect(slice?.visibility?.tipEffortMap).toEqual({
      "3": { effort: "bounce" },
    });

    const b = defaultStores();
    const seeded = seedFromAnSlice(slice!);
    b.settings.replaceAll(seeded.settings);
    b.visibility.replaceAll(seeded.visibility);
    expect(captureAnSlice(b)).toEqual(slice);
  });

  it("round-trips: capture -> seed -> replaceAll -> capture is identity", () => {
    const a = defaultStores();
    a.settings.setBpm(88);
    a.settings.setShouldLoop(false);
    a.settings.setHideProps(true);
    a.settings.setFadeDuration(4000);
    a.visibility.setGridMode("none");
    a.visibility.setDarkMode(false);
    a.visibility.setSpeed(1.75);
    a.visibility.setEffortPreset("bounce");
    const slice = captureAnSlice(a);

    const b = defaultStores();
    const seeded = seedFromAnSlice(slice!);
    b.settings.replaceAll(seeded.settings);
    b.visibility.replaceAll(seeded.visibility);

    expect(captureAnSlice(b)).toEqual(slice);
    expect(b.settings.bpm).toBe(88);
    expect(b.settings.trail.hideProps).toBe(true);
    expect(b.visibility.isDarkMode()).toBe(false);
    expect(b.visibility.getGridMode()).toBe("none");
  });

  it("seedFromAnSlice merges onto post-normalize defaults, not user state", () => {
    const seeded = seedFromAnSlice({ settings: { bpm: 70 } });
    expect(seeded.settings.bpm).toBe(70);
    expect(seeded.settings.trail).toEqual(DEFAULT_TRAIL_SETTINGS);
    // stepNumbers is forced true by the loader; the baseline must reflect that.
    expect(postNormalizeVisibilityDefaults().stepNumbers).toBe(true);
    expect(seeded.visibility).toEqual(postNormalizeVisibilityDefaults());
  });

  it("suspend -> apply -> tweak -> restore -> resume writes to neither key", () => {
    const settings = createAnimationSettingsState();
    const visibility = new AnimationVisibilityStateManager();
    const stores = { settings, visibility };
    flushSync();

    const before = {
      settings: settings.snapshot(),
      visibility: visibility.snapshot(),
    };
    // Both stores have finished their boot writes; from here the link session
    // must not touch disk at all.
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    settings.setPersistenceSuspended(true);
    visibility.setPersistenceSuspended(true);

    const seeded = seedFromAnSlice({
      settings: { bpm: 84, trail: { hideProps: true } },
      visibility: { gridMode: "none", darkMode: false },
    });
    settings.replaceAll(seeded.settings);
    visibility.replaceAll(seeded.visibility);
    flushSync();

    // A recipient tweaking during the session stays session-local too.
    settings.setBpm(150);
    visibility.setGridMode("8point");
    flushSync();

    settings.replaceAll(before.settings);
    visibility.replaceAll(before.visibility);
    flushSync();
    settings.setPersistenceSuspended(false);
    visibility.setPersistenceSuspended(false);
    flushSync();

    const touchedKeys = setItem.mock.calls.map((call) => call[0]);
    expect(touchedKeys).not.toContain(SETTINGS_KEY);
    expect(touchedKeys).not.toContain(VISIBILITY_KEY);

    // Guard against a vacuous spy: the same spy, the same stores, the same
    // flush — only the suspension flag differs — and now both keys are written.
    settings.setBpm(101);
    visibility.setGridMode("none");
    flushSync();
    const afterResume = setItem.mock.calls.map((call) => call[0]);
    expect(afterResume).toContain(SETTINGS_KEY);
    expect(afterResume).toContain(VISIBILITY_KEY);
  });

  it("restore returns both stores to the pre-override snapshot", () => {
    const stores = {
      settings: createAnimationSettingsState(),
      visibility: new AnimationVisibilityStateManager(),
    };
    stores.settings.setBpm(132);
    stores.visibility.setGridMode("none");
    flushSync();

    const before = {
      settings: stores.settings.snapshot(),
      visibility: stores.visibility.snapshot(),
    };
    const ownSlice = captureAnSlice(stores);

    stores.settings.setPersistenceSuspended(true);
    stores.visibility.setPersistenceSuspended(true);
    const seeded = seedFromAnSlice({
      settings: { bpm: 60 },
      visibility: { mandala: false, darkMode: false },
    });
    stores.settings.replaceAll(seeded.settings);
    stores.visibility.replaceAll(seeded.visibility);
    flushSync();
    expect(stores.settings.bpm).toBe(60);
    expect(stores.visibility.getVisibility("mandala")).toBe(false);

    stores.settings.replaceAll(before.settings);
    stores.visibility.replaceAll(before.visibility);
    stores.settings.setPersistenceSuspended(false);
    stores.visibility.setPersistenceSuspended(false);
    flushSync();

    expect(stores.settings.snapshot()).toEqual(before.settings);
    expect(stores.visibility.snapshot()).toEqual(before.visibility);
    expect(captureAnSlice(stores)).toEqual(ownSlice);
  });

  it("replaceAll drives dark mode through the theme sync, not just the field", () => {
    // `ephemeral` would have disabled this; the link session uses the
    // suspension flag precisely so a shared link's dark mode still renders.
    const visibility = new AnimationVisibilityStateManager();
    visibility.setPersistenceSuspended(true);
    const seeded = seedFromAnSlice({ visibility: { darkMode: false } });

    visibility.replaceAll(seeded.visibility);
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    visibility.replaceAll({ ...seeded.visibility, darkMode: true });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("seedFromAnSlice ignores unknown and __proto__ keys from a hand-edited blob", () => {
    const payload = JSON.parse(
      '{"settings":{"__proto__":{"polluted":true},"bogus":1,"bpm":77,"trail":{"__proto__":{"polluted":true},"nope":2}},' +
        '"visibility":{"__proto__":{"polluted":true},"stepNumbers":false,"junk":true}}'
    );
    const seeded = seedFromAnSlice(payload);
    for (const obj of [
      seeded.settings,
      seeded.settings.trail,
      seeded.visibility,
    ]) {
      expect(Object.getPrototypeOf(obj)).toBe(Object.prototype);
      expect((obj as { polluted?: boolean }).polluted).toBeUndefined();
    }
    expect("bogus" in seeded.settings).toBe(false);
    expect("junk" in seeded.visibility).toBe(false);
    expect(seeded.settings.bpm).toBe(77);
    expect(seeded.visibility.stepNumbers).toBe(false);
  });

  describe("full snapshot", () => {
    it("emits every settings and visibility key at defaults, and round-trips", () => {
      const stores = defaultStores();
      const full = captureAnSlice(stores, { full: true });
      expect(full).not.toBeNull();
      expect(full?.settings?.bpm).toBe(stores.settings.snapshot().bpm);
      expect(full?.settings?.shouldLoop).toBe(
        stores.settings.snapshot().shouldLoop
      );
      expect(Object.keys(full!.settings!.trail!).sort()).toEqual(
        Object.keys(DEFAULT_TRAIL_SETTINGS).sort()
      );
      expect(Object.keys(full!.visibility!).sort()).toEqual(
        Object.keys(postNormalizeVisibilityDefaults()).sort()
      );

      const seeded = seedFromAnSlice(full!);
      const next = defaultStores();
      next.settings.replaceAll(seeded.settings);
      next.visibility.replaceAll(seeded.visibility);
      expect(captureAnSlice(next, { full: true })).toEqual(full);
      expect(captureAnSlice(next)).toBeNull();
    });
  });
});
