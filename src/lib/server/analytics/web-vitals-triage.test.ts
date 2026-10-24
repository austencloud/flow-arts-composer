import { describe, expect, it } from "vitest";
import {
  aggregateVitals,
  parseVitalsEventRow,
  percentile,
  rankRouteVitals,
  routePattern,
  type VitalsEventRow,
} from "./web-vitals-triage";

describe("routePattern", () => {
  it("collapses ids, language folders and the one-shape routes", () => {
    expect(
      routePattern("https://tkaflowarts.com/sequence/d1%3AabcDEF?render=3d")
    ).toBe("/sequence/[id]");
    expect(routePattern("https://tkaflowarts.com/de/guide/eight-step")).toBe(
      "/guide/[slug]"
    );
    expect(
      routePattern(
        "https://tkaflowarts.com/browse/explore/collections/8UJYAt0xsleL6zHAUpdpcBwO0i93/a007a1a0-9cf5-4b55-8899-5b0fc10e4fe1"
      )
    ).toBe("/browse/explore/collections/[...]");
    expect(
      routePattern(
        "https://tkaflowarts.com/browse/you/collections/founding_book"
      )
    ).toBe("/browse/you/collections/[id]");
    expect(routePattern("https://tkaflowarts.com/create/generate/")).toBe(
      "/create/generate"
    );
    expect(routePattern("https://tkaflowarts.com/")).toBe("/");
  });
});

describe("percentile", () => {
  it("uses nearest rank", () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(values, 50)).toBe(50);
    expect(percentile(values, 75)).toBe(80);
    expect(percentile(values, 95)).toBe(100);
    expect(percentile([], 75)).toBeNull();
  });
});

describe("parseVitalsEventRow", () => {
  it("takes LCP's route from the hard navigation and INP's from where it happened", () => {
    const row = parseVitalsEventRow([
      "2026-10-22 10:00:00",
      "s1",
      "Mobile",
      5480,
      72,
      null,
      JSON.stringify({
        navigationURL: "https://tkaflowarts.com/create",
        $current_url: "https://tkaflowarts.com/create/generate",
      }),
      JSON.stringify({
        navigationURL: "https://tkaflowarts.com/create",
        $current_url: "https://tkaflowarts.com/create/generate",
        attribution: { interactionTarget: "button.generate" },
      }),
      null,
      "https://tkaflowarts.com/create/generate",
    ]);
    expect(row.lcpUrl).toBe("https://tkaflowarts.com/create");
    expect(row.inpUrl).toBe("https://tkaflowarts.com/create/generate");
    expect(row.cls).toBeNull();
    expect(row.lcpElement).toBeNull();
    expect(row.inpTarget).toBe("button.generate");
  });
});

function event(partial: Partial<VitalsEventRow>): VitalsEventRow {
  return {
    occurredAt: "",
    sessionId: "s",
    deviceType: "Mobile",
    lcp: null,
    inp: null,
    cls: null,
    lcpUrl: "https://tkaflowarts.com/",
    inpUrl: "https://tkaflowarts.com/",
    clsUrl: "https://tkaflowarts.com/",
    lcpElement: null,
    inpTarget: null,
    ...partial,
  };
}

describe("rankRouteVitals", () => {
  it("drops thin groups and puts mobile first, worst p75 LCP first", () => {
    const rows = [
      ...Array.from({ length: 10 }, () =>
        event({ deviceType: "Desktop", lcp: 9000, lcpUrl: "https://x/a" })
      ),
      ...Array.from({ length: 10 }, () =>
        event({ lcp: 1000, lcpUrl: "https://x/b" })
      ),
      ...Array.from({ length: 10 }, () =>
        event({ lcp: 4000, lcpUrl: "https://x/c" })
      ),
      ...Array.from({ length: 3 }, () =>
        event({ lcp: 20000, lcpUrl: "https://x/thin" })
      ),
    ];
    const ranked = rankRouteVitals(aggregateVitals(rows), 10);
    expect(ranked.map((g) => `${g.deviceType} ${g.route}`)).toEqual([
      "Mobile /c",
      "Mobile /b",
      "Desktop /a",
    ]);
  });
});
