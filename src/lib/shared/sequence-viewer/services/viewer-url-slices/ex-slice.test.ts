import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { captureExSlice, seedFromExSlice } = await import("./ex-slice");
const {
  createExportOptionsState,
  DEFAULT_VIDEO_OPTIONS,
  DEFAULT_SPLIT_OPTIONS,
  DEFAULT_IMAGE_OPTIONS,
} = await import("$lib/shared/animation-panel/state/export-options-state.svelte");

const STORAGE_KEY = "tka_export_options";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("ex slice", () => {
  it("returns null at post-normalize defaults", () => {
    const store = createExportOptionsState();
    expect(captureExSlice(store)).toBeNull();
  });

  it("returns null for a factory-fresh PERSISTED load (no stored entry)", () => {
    // The fx/an trap: a boot migration can make a fresh load differ from the
    // raw constant. loadFromStorage()'s no-stored-entry branch returns the
    // DEFAULT_* constants untouched, so this must stay null.
    localStorage.clear();
    const store = createExportOptionsState();
    expect(captureExSlice(store)).toBeNull();
    expect(store.getVideoOptions()).toEqual(DEFAULT_VIDEO_OPTIONS);
    expect(store.getImageOptions()).toEqual(DEFAULT_IMAGE_OPTIONS);
  });

  it("never captures split.quality — it is hardcoded schema shape, not user state", () => {
    // No public setter can move it away from "standard"; assert the payload
    // never carries it even after every other split field changes.
    const store = createExportOptionsState();
    store.setSplitFps(30);
    store.setSplitOrientation("vertical");
    store.setSplitGridStepSize(80);
    store.setSplitShowStepNumbers(false);
    store.setSplitIncludeStartPlacement(false);
    store.setSplitLoopCount(3);

    const slice = captureExSlice(store);
    expect(slice?.split && "quality" in slice.split).toBe(false);
  });

  it("captures only the keys that differ, per sub-payload", () => {
    const store = createExportOptionsState();
    store.setVideoFps(30);
    store.setVideoQuality("cinema");
    store.setImageShowWord(false);

    const slice = captureExSlice(store);
    expect(slice?.video).toEqual({ fps: 30, quality: "cinema" });
    expect(slice?.image).toEqual({ showWord: false });
    expect(slice && "split" in slice).toBe(false);
  });

  it("omits a sub-payload whose sub-store is untouched", () => {
    const store = createExportOptionsState();
    store.setImageDarkMode(false);

    const slice = captureExSlice(store);
    expect(slice?.image).toEqual({ darkMode: false });
    expect(slice && "video" in slice).toBe(false);
    expect(slice && "split" in slice).toBe(false);
  });

  it("round-trips: capture -> seed -> replaceAll -> capture is identity", () => {
    const a = createExportOptionsState();
    a.setVideoFps(120);
    a.setVideoResolution(2160);
    a.setVideoEffectOverrides({ fire: false, led: false, trails: true, charcoal: false });
    a.setSplitOrientation("vertical");
    a.setSplitGridStepSize(160);
    a.setImageShowDifficulty(false);
    a.setImageShowQRCode(false);
    const slice = captureExSlice(a);

    const b = createExportOptionsState();
    b.replaceAll(seedFromExSlice(slice!));

    expect(captureExSlice(b)).toEqual(slice);
    expect(b.videoFps).toBe(120);
    expect(b.videoResolution).toBe(2160);
    expect(b.splitOrientation).toBe("vertical");
    expect(b.imageShowDifficulty).toBe(false);
  });

  it("seedFromExSlice merges onto post-normalize defaults, not user state", () => {
    const seeded = seedFromExSlice({ video: { fps: 30 } });
    expect(seeded.video).toEqual({ ...DEFAULT_VIDEO_OPTIONS, fps: 30 });
    expect(seeded.split).toEqual(DEFAULT_SPLIT_OPTIONS);
    expect(seeded.image).toEqual(DEFAULT_IMAGE_OPTIONS);
  });

  it("keeps split.resolution/effectOverrides/includeEndHold even without a public setter", () => {
    // A legacy install can hold non-default values here (loaded but not
    // settable through this manager's public API today); the URL snapshot
    // must not silently drop them.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        video: DEFAULT_VIDEO_OPTIONS,
        split: {
          ...DEFAULT_SPLIT_OPTIONS,
          resolution: 2160,
          effectOverrides: { fire: true, led: false, trails: false, charcoal: false },
          includeEndHold: false,
        },
        image: DEFAULT_IMAGE_OPTIONS,
      })
    );
    const store = createExportOptionsState();
    const slice = captureExSlice(store);
    expect(slice?.split).toEqual({
      resolution: 2160,
      effectOverrides: { fire: true, led: false, trails: false, charcoal: false },
      includeEndHold: false,
    });

    const seeded = seedFromExSlice(slice!);
    expect(seeded.split.resolution).toBe(2160);
    expect(seeded.split.quality).toBe("standard");
  });

  it("suspend -> apply -> tweak -> restore -> resume writes zero times", () => {
    const store = createExportOptionsState();
    const before = store.snapshot();
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    store.setPersistenceSuspended(true);
    store.replaceAll(seedFromExSlice({ video: { fps: 120 }, image: { darkMode: false } }));

    // A recipient tweaking during the session stays session-local too.
    store.setVideoFps(30);
    store.setImageShowWord(false);

    store.replaceAll(before);
    store.setPersistenceSuspended(false);

    expect(setItem).not.toHaveBeenCalled();

    // Guard against a vacuous spy: same spy, same store, only the
    // suspension flag differs — and now a write happens.
    store.setVideoFps(60);
    expect(setItem).toHaveBeenCalledWith(STORAGE_KEY, expect.any(String));
  });

  it("restore returns the store to the pre-override snapshot", () => {
    const store = createExportOptionsState();
    store.setVideoFps(120);
    store.setSplitOrientation("vertical");

    const before = store.snapshot();
    const ownSlice = captureExSlice(store);

    store.setPersistenceSuspended(true);
    store.replaceAll(seedFromExSlice({ video: { fps: 30 } }));
    expect(store.videoFps).toBe(30);

    store.replaceAll(before);
    store.setPersistenceSuspended(false);

    expect(store.snapshot()).toEqual(before);
    expect(captureExSlice(store)).toEqual(ownSlice);
  });

  describe("full snapshot", () => {
    it("emits every key of all three sub-stores at defaults, and round-trips", () => {
      const store = createExportOptionsState();
      const full = captureExSlice(store, { full: true });
      expect(full).not.toBeNull();
      expect(Object.keys(full!.video!).sort()).toEqual(
        Object.keys(DEFAULT_VIDEO_OPTIONS).sort()
      );
      expect(Object.keys(full!.image!).sort()).toEqual(
        Object.keys(DEFAULT_IMAGE_OPTIONS).sort()
      );
      const splitKeys = Object.keys(DEFAULT_SPLIT_OPTIONS).filter((k) => k !== "quality");
      expect(Object.keys(full!.split!).sort()).toEqual(splitKeys.sort());

      const next = createExportOptionsState();
      next.replaceAll(seedFromExSlice(full!));
      expect(captureExSlice(next, { full: true })).toEqual(full);
      expect(captureExSlice(next)).toBeNull();
    });
  });
});
