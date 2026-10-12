import { describe, expect, it } from "vitest";
import {
  getGridJoinLayout,
  gridPointsSvg,
  joinedPointColors,
} from "@tka/render-core";
import {
  joinedGridFitTransform,
  joinedGridMarkup,
  slidingGridsMarkup,
} from "#lib/shared/pictograph/grid/services/joined-grid-markup.js";

const HAND_COLORS = { left: "#2e3192", right: "#ed1c24" } as const;
const circles = (svg: string) => svg.match(/<circle\b[^>]*>/g) ?? [];

describe("joinedGridMarkup", () => {
  const layout = getGridJoinLayout({ toward: "e", steps: 1 }, "diamond");

  it("draws every layout point with render-core's tinted colors", () => {
    const svg = joinedGridMarkup(layout, {
      darkMode: true,
      grids: layout.grids,
      handColors: HAND_COLORS,
    });
    const colors = joinedPointColors(layout.points, "#ffffff", HAND_COLORS);
    const expected = layout.points
      .map((point, i) => gridPointsSvg([point], point.ring, colors[i]!))
      .join("");
    expect(svg).toBe(expected);
    expect(circles(svg).length).toBeGreaterThan(9);
    // Hand points lean toward a hand color, so some dots are not plain white.
    expect(colors.some((c) => c.toLowerCase() !== "#ffffff")).toBe(true);
  });

  it("mixes the tint into black on a light background", () => {
    const svg = joinedGridMarkup(layout, {
      darkMode: false,
      grids: layout.grids,
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
      grids: layout.grids,
      handColors: HAND_COLORS,
      handPointVisibility: "none",
    });
    expect(circles(none)).toHaveLength(others);

    const lit = handPoints[0]!.members[0]!;
    const active = joinedGridMarkup(layout, {
      darkMode: true,
      grids: layout.grids,
      handColors: HAND_COLORS,
      handPointVisibility: "active",
      activeHandPoints: {
        left: new Set(lit.hand === "left" ? [lit.location] : []),
        right: new Set(lit.hand === "right" ? [lit.location] : []),
      },
    });
    expect(circles(active)).toHaveLength(others + 1);
  });

  it("rings only the box hand's outer points when one hand turned 45°", () => {
    const mixed = getGridJoinLayout(
      { toward: "e", steps: 1 },
      { left: "box", right: "diamond" }
    );
    const svg = joinedGridMarkup(mixed, {
      darkMode: true,
      grids: mixed.grids,
      handColors: HAND_COLORS,
    });
    const rings = circles(svg).filter((c) => c.includes('fill="none"'));
    expect(rings).toHaveLength(
      mixed.points.filter(
        (p) => p.kind === "outer" && p.members[0]!.hand === "left"
      ).length
    );
    expect(rings.length).toBeGreaterThan(0);
    // The slide draws blue's box grid and red's diamond grid whole: blue's
    // four outer rings, drawn twice mid-slide (plain under tint) and once
    // at rest.
    const options = {
      darkMode: true,
      grids: mixed.grids,
      handColors: HAND_COLORS,
    };
    const ringsIn = (svg: string) =>
      circles(svg).filter((c) => c.includes('fill="none"')).length;
    expect(ringsIn(slidingGridsMarkup(mixed.offsets, 0.5, options))).toBe(8);
    expect(ringsIn(slidingGridsMarkup(mixed.offsets, 1, options))).toBe(4);
  });

  it("fits the joined content with the layout's scale about the center", () => {
    expect(layout.scale).toBeLessThan(1);
    expect(joinedGridFitTransform(layout)).toBe(
      `translate(475 475) scale(${layout.scale}) translate(-475 -475)`
    );
  });
});
