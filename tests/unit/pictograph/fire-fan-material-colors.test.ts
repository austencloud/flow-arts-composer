import { describe, expect, it } from "vitest";

import { applyFanFrameColor } from "$lib/shared/pictograph/prop/domain/fan-appearance";
import {
  applyColorToSvg,
  applyMotionColorToSvg,
} from "$lib/shared/utils/svg-color-utils";
import { readFileSync } from "node:fs";

describe("physical fire-fan material colors", () => {
  it("keeps CSS selectors attached after an already prepared prop is recolored", () => {
    const source =
      '<svg><style>.st0{fill:#aaaaaa}</style><path class="st0 detail"/></svg>';
    const prepared = applyMotionColorToSvg(source, "left", {
      makeClassNamesUnique: true,
    });
    const recolored = applyColorToSvg(prepared, "#00ff88", {
      makeClassNamesUnique: true,
      colorSuffix: "00ff88",
    });
    expect(recolored).toContain(".st0-00ff88{fill:#00ff88}");
    expect(recolored).toContain('class="st0-00ff88 detail"');
    expect(recolored).not.toContain("st0-left");
  });

  it("changes an already colored club body while keeping its authored materials", () => {
    const source =
      '<svg><path fill="#aaaaaa"/><path fill="#222222"/><path fill="#c9ac68"/></svg>';
    const prepared = applyMotionColorToSvg(source, "left", {
      selectiveColorMode: true,
    });
    const recolored = applyColorToSvg(prepared, "#00ff88", {
      selectiveColorMode: true,
      sourceColors: ["#3575E2"],
    });
    expect(recolored).toContain('fill="#00ff88"');
    expect(recolored).toContain('fill="#222222"');
    expect(recolored).toContain('fill="#c9ac68"');
    expect(recolored).not.toContain("#3575E2");
  });

  it.each([
    "fire",
    "fire-covered",
    "flat-grip",
    "lotus",
    "day",
    "day-covered",
    "moon",
  ])(
    "preserves %s materials after repeated display-color overrides",
    (build) => {
      const source = readFileSync(
        `static/images/props/appearances/fan-${build}.svg`,
        "utf8"
      );
      const framePattern = /<g\b(?=[^>]*\bdata-fan-frame="")[^>]*>/g;
      const materials = (svg: string) => svg.replace(framePattern, "FRAME");
      const prepared = applyFanFrameColor(source, "#3575E2");
      const custom = applyColorToSvg(prepared, "#00ff88");
      const swapped = applyColorToSvg(custom, "#ff8800");
      expect(materials(custom)).toBe(materials(source));
      expect(materials(swapped)).toBe(materials(source));
      expect(custom.match(framePattern)?.join("")).toContain("#00ff88");
      expect(swapped.match(framePattern)?.join("")).toContain("#ff8800");
    }
  );

  it("colors the marked frame without repainting wicks or fitted covers", () => {
    const source = `<svg><g data-fan-frame="" fill="none" stroke="#2E3192"><path/></g><g data-fire-wick="1" fill="#f5e6b8"><rect/></g><g data-fan-cover="" fill="#df255f"><path/></g></svg>`;

    const colored = applyFanFrameColor(source, "#3575E2");

    expect(colored).toContain(
      '<g data-fan-frame="" fill="none" stroke="#3575E2">'
    );
    expect(colored).toContain('data-fire-wick="1" fill="#f5e6b8"');
    expect(colored).toContain('data-fan-cover="" fill="#df255f"');
  });
});
