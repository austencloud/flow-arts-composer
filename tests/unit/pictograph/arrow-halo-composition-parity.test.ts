import { describe, it, expect } from "vitest";
import {
  buildArrowHaloFilter,
  haloColor,
  HALO_STD_DEVIATION,
} from "#lib/shared/pictograph/arrow/rendering/arrow-halo.js";
import { wrapSvgContent } from "#lib/shared/render/services/canvas-2d-transform-helper.js";

describe("arrow halo — shared definition", () => {
  it("dark/light halo colors match the pictograph background", () => {
    expect(haloColor(true)).toBe("#0a0a0f");
    expect(haloColor(false)).toBe("white");
  });

  it("builds a 3-pass feDropShadow filter with the shared std deviation", () => {
    const svg = buildArrowHaloFilter("h1", true);
    expect(svg).toContain('<filter id="h1"');
    const passes = svg.match(/<feDropShadow/g) ?? [];
    expect(passes).toHaveLength(3);
    expect(svg).toContain(`stdDeviation="${HALO_STD_DEVIATION}"`);
    expect(svg).toContain('flood-color="#0a0a0f"');
    // Generous region so the compounding blur never clips.
    expect(svg).toContain('x="-20%"');
  });
});

describe("wrapSvgContent — halo baked for arrows only", () => {
  it("preserves the xlink namespace required by legacy prop assets", () => {
    const { svg } = wrapSvgContent(
      '<use xlink:href="#torch-shaft"/>',
      300,
      15.5
    );

    expect(svg).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
    expect(svg).toContain('xlink:href="#torch-shaft"');
  });

  it("injects the halo filter and wraps content when halo is provided", () => {
    const { svg } = wrapSvgContent(
      "<path d='M0 0'/>",
      250,
      250,
      true,
      "0 0 250 250",
      {
        id: "arrow-halo-blue",
        isDarkMode: false,
      }
    );
    expect(svg).toContain('<filter id="arrow-halo-blue"');
    expect(svg).toContain('<g filter="url(#arrow-halo-blue)">');
    expect(svg).toContain('flood-color="white"');
    expect(svg).toContain("<path d='M0 0'/>");
  });

  it("emits no filter when halo is omitted (props path)", () => {
    const { svg } = wrapSvgContent(
      "<path d='M0 0'/>",
      250,
      250,
      true,
      "0 0 250 250"
    );
    expect(svg).not.toContain("<filter");
    expect(svg).not.toContain("url(#");
  });
});
