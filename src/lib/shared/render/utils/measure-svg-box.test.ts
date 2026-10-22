import { afterEach, describe, expect, it, vi } from "vitest";
import { measureSvgBox } from "./measure-svg-box";

function glyphGroup(): SVGGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.classList.add("tka-glyph");
  svg.appendChild(g);
  return g;
}

describe("measureSvgBox (glyph serializer guard)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns null without throwing or logging when .tka-glyph has no getBBox", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const g = glyphGroup();
    (g as unknown as { getBBox?: unknown }).getBBox = undefined;
    const found = g.ownerSVGElement!.querySelector(".tka-glyph");

    expect(() => measureSvgBox(found)).not.toThrow();
    expect(measureSvgBox(found)).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("returns null when getBBox throws (display:none subtree in Firefox)", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const g = glyphGroup();
    g.getBBox = () => {
      throw new Error("NS_ERROR_FAILURE");
    };

    expect(measureSvgBox(g)).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("returns null for a missing element", () => {
    expect(measureSvgBox(null)).toBeNull();
  });

  it("returns the measured box in a renderer with SVG layout", () => {
    const g = glyphGroup();
    g.getBBox = () => ({ x: 1, y: -2, width: 30, height: 40 }) as DOMRect;

    expect(measureSvgBox(g)).toEqual({ x: 1, y: -2, width: 30, height: 40 });
  });
});
