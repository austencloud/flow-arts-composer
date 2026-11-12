import { describe, expect, it } from "vitest";
import {
  FIT_SEEDS_KEPT,
  fitSeedKey,
  keepFitSeed,
  keptFitSeed,
} from "./fit-seeds";

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

describe("guide fit seeds", () => {
  it("returns the scale a screen landed at in the same window", () => {
    const storage = memoryStorage();
    const key = fitSeedKey("/guide/level-1/hm-type1", "", 1769, 830);
    keepFitSeed(key, 1.611, storage);
    expect(keptFitSeed(key, storage)).toBe(1.611);
    expect(
      keptFitSeed(fitSeedKey("/guide/level-1/hm-type1", "", 1769, 700), storage)
    ).toBeNull();
  });

  it("drops the oldest entries once the list is full", () => {
    const storage = memoryStorage();
    for (let n = 0; n <= FIT_SEEDS_KEPT; n++)
      keepFitSeed(fitSeedKey(`/p${n}`, "", 100, 100), 1 + n / 1000, storage);
    expect(keptFitSeed(fitSeedKey("/p0", "", 100, 100), storage)).toBeNull();
    expect(
      keptFitSeed(fitSeedKey(`/p${FIT_SEEDS_KEPT}`, "", 100, 100), storage)
    ).toBe(1 + FIT_SEEDS_KEPT / 1000);
  });

  it("reads corrupt or foreign storage as no seed and replaces it", () => {
    const storage = memoryStorage({ "guide-fit-seeds": "{not json" });
    const key = fitSeedKey("/g", "0/3/0", 800, 600);
    expect(keptFitSeed(key, storage)).toBeNull();
    keepFitSeed(key, 0.9, storage);
    expect(keptFitSeed(key, storage)).toBe(0.9);
    storage.setItem("guide-fit-seeds", JSON.stringify({ [key]: "big" }));
    expect(keptFitSeed(key, storage)).toBeNull();
  });

  it("never throws when storage refuses", () => {
    const refusing = memoryStorage();
    refusing.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() => keepFitSeed("k", 1, refusing)).not.toThrow();
    expect(keptFitSeed("k", null)).toBeNull();
  });
});
