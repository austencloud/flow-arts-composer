import { beforeEach, describe, expect, it } from "vitest";
import { createScreenSplits } from "./screen-splits.svelte";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  Object.assign(globalThis, {
    location: { pathname: "/guide/x" },
    innerWidth: 390,
    innerHeight: 664,
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  });
});

describe("createScreenSplits", () => {
  it("starts joined and falls back one step per bump, stopping at max", () => {
    const s = createScreenSplits();
    expect(s.step("a", 2)).toBe(0);
    s.bump("a", 2);
    s.bump("a", 2);
    s.bump("a", 2);
    expect(s.step("a", 2)).toBe(2);
    expect(s.step("b", 2)).toBe(0);
  });

  it("restores what this window size found, and ignores bad data", () => {
    const s = createScreenSplits();
    s.bump("a", 1);
    const again = createScreenSplits();
    again.restore();
    expect(again.step("a", 1)).toBe(1);

    store.set("guide-splits:/guide/x:390x664", '{"a":"x","b":-1,"c":1.5,"d":1}');
    again.restore();
    expect(again.step("a", 1)).toBe(0);
    expect(again.step("d", 1)).toBe(1);
    store.set("guide-splits:/guide/x:390x664", "not json");
    again.restore();
    expect(again.key).toBe("{}");
  });
});
