import { describe, expect, it } from "vitest";
import {
  getGridJoinLayout,
  gridPointsSvg,
  joinedPointColors,
} from "@tka/render-core";
import {
  joinedGridFitTransform,
  joinedGridMarkup,
} from "$lib/shared/pictograph/grid/services/joined-grid-markup";

const HAND_COLORS = { left: "#2e3192", right: "#ed1c24" } as const;
const circles = (svg: string) => svg.match(/<circle\b[^>]*>/g) ?? [];

describe("joinedGridMarkup", () => {
  const layout = getGridJoinLayout({ toward: "e", steps: 1 }, "diamond");

  it("draws every layout point with render-core's tinted colors", () => {
    const svg = joinedGridMarkup(layout, {
      darkMode: true,
      box: false,
      handColors: HAND_COLORS,
    });
    const colors = joinedPointColors(layout.points, "#ffffff", HAND_COLORS);
    const expected = layout.points
      .map((point, i) => gridPointsSvg([point], false, colors[i]!))
      .join("");
    expect(svg).toBe(expected);
    expect(circles(svg).length).toBeGreaterThan(9);
    // Hand points lean toward a hand color, so some dots are not plain white.
    expect(colors.some((c) => c.toLowerCase() !== "#ffffff")).toBe(true);
  });

  it("mixes the tint into black on a light background", () => {
    const svg = joinedGridMarkup(layout, {
      darkMode: false,
      box: false,
      handColors: HAND_COLORS,
    });
    const colors = joinedPointColors(layout.points, "#000000", HAND_COLORS);
    for (const color of new Set(colors)) expect(svg).toContain(color);
  });

  it('hides hand points for "none" and keeps only lit ones for "active"', () => {
    const handPoints = layout.points.filter((p) => p.kind === "hand");
    const others = layout.points.length - handPoints.length;
    expect(handPoints.length).toBeGreaterThan(0);

    const none = joinedGridMarkup(layout, {
      darkMode: true,
      box: false,
      handColors: HAND_COLORS,
      handPointVisibility: "none",
    });
    expect(circles(none)).toHaveLength(others);

    const lit = handPoints[0]!.members[0]!;
    const active = joinedGridMarkup(layout, {
      darkMode: true,
      box: false,
      handColors: HAND_COLORS,
      handPointVisibility: "active",
      activeHandPoints: {
        left: new Set(lit.hand === "left" ? [lit.location] : []),
        right: new Set(lit.hand === "right" ? [lit.location] : []),
      },
    });
    expect(circles(active)).toHaveLength(others + 1);
  });

  it("fits the joined content with the layout's scale about the center", () => {
    expect(layout.scale).toBeLessThan(1);
    expect(joinedGridFitTransform(layout)).toBe(
      `translate(475 475) scale(${layout.scale}) translate(-475 -475)`
    );
  });
});
