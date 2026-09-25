import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StepMap } from "$lib/shared/video-collaboration/domain/collaborative-video";
import {
  loadLocalStepMap,
  localStepMapKey,
  saveLocalStepMap,
} from "$lib/shared/share/components/post-studio/local-performance-step-maps";

function tappedMap(overrides: Partial<StepMap> = {}): StepMap {
  return {
    beatTimestamps: [0.5, 1.4, 3.1, 5.8],
    stepCount: 4,
    source: "manual",
    updatedAt: new Date("2026-09-24T01:00:00Z"),
    ...overrides,
  };
}

describe("localStepMapKey", () => {
  it("builds a key from the sequence id and the file's name, size and modified time", () => {
    const key = localStepMapKey("sequence-1", {
      name: "clip.mp4",
      size: 2048,
      lastModified: 1700000000000,
    });
    expect(key).toBe("sequence-1:clip.mp4:2048:1700000000000");
  });

  it("differs when the same file name is picked for a different sequence", () => {
    const identity = {
      name: "clip.mp4",
      size: 2048,
      lastModified: 1700000000000,
    };
    expect(localStepMapKey("sequence-1", identity)).not.toBe(
      localStepMapKey("sequence-2", identity)
    );
  });
});

describe("loadLocalStepMap / saveLocalStepMap", () => {
  const key = "sequence-1:clip.mp4:2048:1700000000000";

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("round-trips a saved map back into a StepMap with a real Date", () => {
    saveLocalStepMap(key, tappedMap({ endTimestamp: 7.2 }));

    const loaded = loadLocalStepMap(key, 4);

    expect(loaded).not.toBeNull();
    expect(loaded?.beatTimestamps).toEqual([0.5, 1.4, 3.1, 5.8]);
    expect(loaded?.endTimestamp).toBe(7.2);
    expect(loaded?.stepCount).toBe(4);
    expect(loaded?.source).toBe("manual");
    expect(loaded?.updatedAt).toBeInstanceOf(Date);
    expect(loaded?.updatedAt.getTime()).toBe(
      new Date("2026-09-24T01:00:00Z").getTime()
    );
  });

  it("returns null when nothing has been saved for that key", () => {
    expect(loadLocalStepMap(key, 4)).toBeNull();
  });

  it("returns null when the stored value is not valid JSON", () => {
    localStorage.setItem(
      `tka:post-studio-local-step-map:${key}`,
      "{ not valid json"
    );
    expect(loadLocalStepMap(key, 4)).toBeNull();
  });

  it("returns null when the stored value has the wrong shape", () => {
    localStorage.setItem(
      `tka:post-studio-local-step-map:${key}`,
      JSON.stringify({ beatTimestamps: "nope", stepCount: 4 })
    );
    expect(loadLocalStepMap(key, 4)).toBeNull();
  });

  it("returns null when the saved map's stepCount no longer matches the sequence", () => {
    saveLocalStepMap(key, tappedMap());
    // The sequence gained a step since this map was tapped.
    expect(loadLocalStepMap(key, 5)).toBeNull();
  });

  it("returns null when the beat timestamps are not strictly increasing", () => {
    saveLocalStepMap(key, tappedMap());
    const raw = localStorage.getItem(`tka:post-studio-local-step-map:${key}`);
    const corrupted = JSON.parse(raw as string);
    corrupted.beatTimestamps = [0.5, 1.4, 1.4, 5.8];
    localStorage.setItem(
      `tka:post-studio-local-step-map:${key}`,
      JSON.stringify(corrupted)
    );

    expect(loadLocalStepMap(key, 4)).toBeNull();
  });

  it("returns null when the end timestamp does not land after the last beat", () => {
    saveLocalStepMap(key, tappedMap({ endTimestamp: 4 })); // before the last beat at 5.8
    expect(loadLocalStepMap(key, 4)).toBeNull();
  });

  it("does not throw when localStorage.setItem throws (quota exceeded, private mode)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException(
        "The quota has been exceeded.",
        "QuotaExceededError"
      );
    });

    expect(() => saveLocalStepMap(key, tappedMap())).not.toThrow();
  });

  it("does not throw and returns null when localStorage.getItem throws", () => {
    saveLocalStepMap(key, tappedMap());
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Access denied.", "SecurityError");
    });

    expect(() => loadLocalStepMap(key, 4)).not.toThrow();
    expect(loadLocalStepMap(key, 4)).toBeNull();
  });
});
