import { describe, expect, it } from "vitest";
import {
  HAND_COLOR_KEY,
  calculateHandColorKeyLayout,
  drawHandColorKey,
  renderHandColorKeySvg,
} from "../src/calculations/hand-color-key.js";

const SOUTH_OUTER_POINT_BOTTOM = 775 + 25;
const VIEWBOX = 950;

describe("calculateHandColorKeyLayout", () => {
  it("centres both pairs symmetrically about the band centre", () => {
    const layout = calculateHandColorKeyLayout(true, true);
    expect(layout.entries.map((e) => e.label)).toEqual(["L", "R"]);
    const [left, right] = layout.entries;
    const pairWidth =
      HAND_COLOR_KEY.SWATCH_RADIUS * 2 +
      HAND_COLOR_KEY.LABEL_GAP +
      HAND_COLOR_KEY.LABEL_WIDTH;
    const leftStart = left.swatchX - HAND_COLOR_KEY.SWATCH_RADIUS;
    const rightEnd = right.labelX + HAND_COLOR_KEY.LABEL_WIDTH;
    expect(leftStart).toBeCloseTo(-rightEnd);
    expect(
      right.swatchX -
        HAND_COLOR_KEY.SWATCH_RADIUS -
        (left.labelX + HAND_COLOR_KEY.LABEL_WIDTH)
    ).toBe(HAND_COLOR_KEY.PAIR_GAP);
    expect(rightEnd - leftStart).toBe(pairWidth * 2 + HAND_COLOR_KEY.PAIR_GAP);
  });

  it("centres a lone hand on its own", () => {
    for (const [showLeft, showRight, label] of [
      [true, false, "L"],
      [false, true, "R"],
    ] as const) {
      const layout = calculateHandColorKeyLayout(showLeft, showRight);
      expect(layout.entries).toHaveLength(1);
      expect(layout.entries[0].label).toBe(label);
      const start = layout.entries[0].swatchX - HAND_COLOR_KEY.SWATCH_RADIUS;
      const end = layout.entries[0].labelX + HAND_COLOR_KEY.LABEL_WIDTH;
      expect(start).toBeCloseTo(-end);
    }
  });

  it("returns no entries when neither hand is present", () => {
    expect(calculateHandColorKeyLayout(false, false).entries).toEqual([]);
  });

  it("keeps the swatches clear of the south grid point and inside the box", () => {
    const layout = calculateHandColorKeyLayout(true, true);
    const top = layout.centerY - layout.swatchRadius;
    const bottom = layout.centerY + layout.swatchRadius;
    expect(top - SOUTH_OUTER_POINT_BOTTOM).toBeGreaterThanOrEqual(40);
    expect(VIEWBOX - bottom).toBeGreaterThanOrEqual(40);
    // Centred in the band between the grid point and the box edge.
    expect(layout.centerY).toBe((SOUTH_OUTER_POINT_BOTTOM + VIEWBOX) / 2);
  });
});

describe("hand colour key renderers", () => {
  it("uses the same hands, colors, and coordinates in Canvas and SVG", () => {
    const operations: string[] = [];
    const context = {
      font: "",
      textAlign: "",
      textBaseline: "",
      fillStyle: "",
      save: () => operations.push("save"),
      restore: () => operations.push("restore"),
      beginPath: () => operations.push("path"),
      arc: (x: number, y: number, radius: number) =>
        operations.push(`circle:${x}:${y}:${radius}`),
      fill: () => operations.push(`fill:${context.fillStyle}`),
      moveTo: (x: number, y: number) => operations.push(`move:${x}:${y}`),
      lineTo: (x: number, y: number) => operations.push(`line:${x}:${y}`),
      quadraticCurveTo: (cpx: number, cpy: number, x: number, y: number) =>
        operations.push(`quadratic:${cpx}:${cpy}:${x}:${y}`),
      closePath: () => operations.push("close"),
    };
    const colorForHand = (hand: "left" | "right") =>
      hand === "left" ? "#123456" : "#abcdef";

    drawHandColorKey(context, {
      showLeft: true,
      showRight: false,
      scale: 2,
      centerX: 950,
      textColor: "#fedcba",
      colorForHand,
    });
    const svg = renderHandColorKeySvg({
      showLeft: true,
      showRight: false,
      centerX: 475,
      textColor: "#fedcba",
      colorForHand,
    });
    const [entry] = calculateHandColorKeyLayout(true, false).entries;

    expect(operations).toContain(
      `circle:${950 + entry.swatchX * 2}:${875 * 2}:${20 * 2}`
    );
    expect(operations).toContain(
      `move:${950 + (entry.labelX + 4.53125) * 2}:${898 * 2 - 0.75}`
    );
    expect(operations).toContain("fill:#123456");
    expect(svg).toContain('transform="translate(475, 0)"');
    expect(svg).toContain(
      `<circle cx="${entry.swatchX}" cy="875" r="20" fill="#123456"/>`
    );
    expect(svg).toContain(`<path d="M4.53125 -0.375`);
    expect(svg).toContain(`transform="translate(${entry.labelX} 898)"`);
    expect(svg).toContain('fill="#fedcba"');
  });
});
