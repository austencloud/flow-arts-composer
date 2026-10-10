import { describe, expect, it } from "vitest";
import {
  bandOf,
  mergeSmallBands,
  ringToneFor,
  type RecencyBand,
} from "#lib/features/creators/domain/creator-recency.js";

const NOW = new Date("2026-07-25T00:00:00.000Z").getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(NOW - days * DAY_MS);
}

describe("bandOf", () => {
  it("buckets a creator active today as this week", () => {
    expect(bandOf(daysAgo(0), NOW)).toBe("week");
  });

  it("holds the boundary at exactly 7 days in week", () => {
    expect(bandOf(daysAgo(7), NOW)).toBe("week");
    expect(bandOf(daysAgo(7.01), NOW)).toBe("month");
  });

  it("holds the boundary at exactly 30 days in month", () => {
    expect(bandOf(daysAgo(30), NOW)).toBe("month");
    expect(bandOf(daysAgo(30.01), NOW)).toBe("quarter");
  });

  it("holds the boundary at exactly 90 days in quarter", () => {
    expect(bandOf(daysAgo(90), NOW)).toBe("quarter");
    expect(bandOf(daysAgo(90.01), NOW)).toBe("earlier");
  });

  it("puts anything older than 90 days in earlier", () => {
    expect(bandOf(daysAgo(365), NOW)).toBe("earlier");
  });

  it("treats a missing lastActiveAt as earlier — joined, never came back", () => {
    expect(bandOf(null, NOW)).toBe("earlier");
    expect(bandOf(undefined, NOW)).toBe("earlier");
  });
});

describe("mergeSmallBands", () => {
  function band(key: RecencyBand<number>["key"], count: number): RecencyBand<number> {
    return { key, members: Array.from({ length: count }, (_, i) => i) };
  }

  it("leaves the real census shape (8/7/6/35) at four bands", () => {
    const bands = [
      band("week", 8),
      band("month", 7),
      band("quarter", 6),
      band("earlier", 35),
    ];

    const merged = mergeSmallBands(bands, 3);

    expect(merged.map((b) => b.key)).toEqual([
      "week",
      "month",
      "quarter",
      "earlier",
    ]);
    expect(merged.map((b) => b.members.length)).toEqual([8, 7, 6, 35]);
  });

  it("folds a too-small week forward into month (2/7/6/35 -> 3 bands)", () => {
    const bands = [
      band("week", 2),
      band("month", 7),
      band("quarter", 6),
      band("earlier", 35),
    ];

    const merged = mergeSmallBands(bands, 3);

    expect(merged.map((b) => b.key)).toEqual(["month", "quarter", "earlier"]);
    expect(merged.map((b) => b.members.length)).toEqual([9, 6, 35]);
  });

  it("chains a merge through two thin middle bands into the last band (8/1/1/35 -> 2 bands)", () => {
    const bands = [
      band("week", 8),
      band("month", 1),
      band("quarter", 1),
      band("earlier", 35),
    ];

    const merged = mergeSmallBands(bands, 3);

    expect(merged.map((b) => b.key)).toEqual(["week", "earlier"]);
    expect(merged.map((b) => b.members.length)).toEqual([8, 37]);
  });

  it("preserves member order when merging forward", () => {
    const bands = [band("week", 1), band("month", 2)];

    const merged = mergeSmallBands(bands, 3);

    expect(merged).toEqual([{ key: "month", members: [0, 0, 1] }]);
  });

  it("keeps the last band even if it stays under minSize (nothing left to absorb into)", () => {
    const bands = [band("week", 5), band("earlier", 1)];

    const merged = mergeSmallBands(bands, 3);

    expect(merged.map((b) => b.key)).toEqual(["week", "earlier"]);
    expect(merged.map((b) => b.members.length)).toEqual([5, 1]);
  });
});

describe("ringToneFor", () => {
  const BANDS = ["week", "month", "quarter", "earlier"] as const;
  const tones = () => BANDS.map((band) => ringToneFor(band));

  it("drives every tone from a live theme token, never a bare colour", () => {
    for (const tone of tones()) {
      // The tone may be a plain `var()` or a `color-mix()` built on one — what
      // matters is that the colour comes from the theme pipeline, so it tracks
      // `applyThemeForBackground()` instead of being frozen at author time.
      expect(tone).toMatch(/var\(--theme-[a-z-]+/);
      // A hex/rgb literal is only allowed as the fallback inside `var(...)`.
      // Anything outside that would bypass theming entirely, which is how the
      // original `--semantic-*` version silently shipped hardcoded colours:
      // those tokens are defined nowhere in the app, so every call fell
      // through to its fallback.
      // Match real colour functions, not the substring "rgb" — `color-mix(in
      // srgb, ...)` names a colour SPACE and is not a literal colour.
      expect(tone.replace(/var\([^)]*\)/g, "")).not.toMatch(
        /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i
      );
    }
  });

  it("gives each band its own distinct tone", () => {
    expect(new Set(tones()).size).toBe(BANDS.length);
  });

  it("steps one hue down in strength rather than switching colour per band", () => {
    // Four unrelated hues would read as status (good / notice / warning), not
    // as a recency scale. Recency is one accent fading out, so the three
    // active bands must share the accent and only "earlier" drops to a
    // neutral stroke.
    const [week, month, quarter, earlier] = tones();

    for (const tone of [week, month, quarter]) {
      expect(tone).toContain("--theme-accent");
    }
    expect(earlier).toContain("--theme-stroke");

    // Strength decays: full accent, then progressively more transparent.
    const mixPct = (tone: string) => Number(tone.match(/ (\d+)%/)?.[1] ?? 100);
    expect(mixPct(week)).toBeGreaterThan(mixPct(month));
    expect(mixPct(month)).toBeGreaterThan(mixPct(quarter));
  });
});
