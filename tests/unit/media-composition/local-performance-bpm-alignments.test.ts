// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadBpmAlignment,
  saveBpmAlignment,
} from "$lib/shared/share/components/post-studio/local-performance-bpm-alignments";

const key = "sequence-1:clip.mp4:2048:1700000000000";
const storageKey = `tka:post-studio-bpm-alignment:${key}`;

describe("local performance BPM alignments", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("saves, loads, and removes an alignment", () => {
    saveBpmAlignment(key, { bpm: 127.5, firstBeatSeconds: 0 });
    expect(loadBpmAlignment(key)).toEqual({ bpm: 127.5, firstBeatSeconds: 0 });
    saveBpmAlignment(key, null);
    expect(loadBpmAlignment(key)).toBeNull();
  });

  it("accepts BPM without a known first beat", () => {
    saveBpmAlignment(key, { bpm: 120, firstBeatSeconds: null });
    expect(loadBpmAlignment(key)).toEqual({ bpm: 120, firstBeatSeconds: null });
  });

  it("rejects corrupted and mismatched stored data", () => {
    for (const raw of [
      "{bad json",
      JSON.stringify({ key: "another-video", bpm: 120, firstBeatSeconds: 1 }),
      JSON.stringify({ key, bpm: 120, firstBeatSeconds: -1 }),
      JSON.stringify({ key, bpm: 0, firstBeatSeconds: null }),
      JSON.stringify({ key, bpm: 120 }),
    ]) {
      localStorage.setItem(storageKey, raw);
      expect(loadBpmAlignment(key)).toBeNull();
    }
  });

  it("does not persist invalid input", () => {
    saveBpmAlignment(key, {
      bpm: Number.POSITIVE_INFINITY,
      firstBeatSeconds: 1,
    });
    expect(localStorage.getItem(storageKey)).toBeNull();
    saveBpmAlignment(key, { bpm: 120, firstBeatSeconds: Number.NaN });
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it("fails closed when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadBpmAlignment(key)).toBeNull();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() =>
      saveBpmAlignment(key, { bpm: 120, firstBeatSeconds: null })
    ).not.toThrow();
  });
});
