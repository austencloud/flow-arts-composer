import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { ArtCache, MISSING, fsArtSource, type ArtSource } from "../src/art-source.js";
import { pictographsForLetter } from "../src/letters.js";

const assets = fileURLToPath(new URL("../assets/", import.meta.url));

describe("ArtCache", () => {
  it("records what an async-only source has not answered, then fills it", async () => {
    const reads: string[] = [];
    const source: ArtSource = {
      read: async (path) => {
        reads.push(path);
        return path === "gone.svg" ? null : `<svg id="${path}"/>`;
      },
    };
    const cache = new ArtCache(source);

    expect(cache.get("a.svg")).toBe(MISSING);
    expect(cache.get("gone.svg")).toBe(MISSING);
    expect([...cache.misses]).toEqual(["a.svg", "gone.svg"]);

    await cache.fill();
    expect(cache.misses.size).toBe(0);
    expect(cache.get("a.svg")).toBe('<svg id="a.svg"/>');
    expect(cache.get("gone.svg")).toBeNull();
    expect(reads).toEqual(["a.svg", "gone.svg"]);
  });
});

describe("fsArtSource", () => {
  it("reads packaged art and returns null for a missing file", async () => {
    const source = await fsArtSource(assets);
    expect(source.readSync?.("images/props/staff.svg")).toContain("<svg");
    expect(source.readSync?.("images/props/no-such-prop.svg")).toBeNull();
    expect(await source.read("images/props/no-such-prop.svg")).toBeNull();
  });
});

describe("pictographsForLetter", () => {
  it("keeps only the exact start placement asked for", () => {
    const found = pictographsForLetter("A", { start: "alpha3" });
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((p) => p.startPlacement === "alpha3")).toBe(true);
  });

  it("matches a whole placement group", () => {
    const found = pictographsForLetter("A", { start: "alpha" });
    const starts = new Set(found.map((p) => p.startPlacement));
    expect(starts.size).toBeGreaterThan(1);
    expect([...starts].every((s) => s?.startsWith("alpha"))).toBe(true);
  });

  it("maps blue to the left hand and red to the right", () => {
    const [first] = pictographsForLetter("A");
    expect(first?.leftMotion).toMatchObject({ hand: "left", motionType: "pro", startLocation: "w", endLocation: "n", turns: 0, startOrientation: "in" });
    expect(first?.rightMotion).toMatchObject({ hand: "right", motionType: "pro", startLocation: "e", endLocation: "s" });
  });

  it("returns nothing for an unknown letter", () => {
    expect(pictographsForLetter("not-a-letter")).toEqual([]);
  });
});
