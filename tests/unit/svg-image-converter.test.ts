import { describe, expect, it } from "vitest";
import { withRootSvgSize } from "$lib/shared/foundation/services/svg-image-converter";

// The glyph composite draws a dash letter's dash as an inner <rect>. Sizing
// the image once stripped every width/height in the string, which left that
// rect with no size, so Ψ-, Φ-, Λ- and the rest exported without their dash.
describe("withRootSvgSize", () => {
  const composite =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 213 111" width="213" height="111">' +
    '<g style="filter: invert(0.9)"><path d="M0 0h10v10z"/>' +
    '<rect x="97.23" y="40.025" width="70" height="20" rx="9.5" ry="9.5" fill="#231f20"/></g>' +
    "</svg>";

  it("keeps an inner rect's own width and height", () => {
    const sized = withRootSvgSize(composite, 426, 222);
    const doc = new DOMParser().parseFromString(sized, "image/svg+xml");
    const rect = doc.querySelector("rect");

    expect(rect?.getAttribute("width")).toBe("70");
    expect(rect?.getAttribute("height")).toBe("20");
  });

  it("gives the root svg the requested size exactly once", () => {
    const sized = withRootSvgSize(composite, 426, 222);
    const root = new DOMParser().parseFromString(
      sized,
      "image/svg+xml"
    ).documentElement;

    expect(root.getAttribute("width")).toBe("426");
    expect(root.getAttribute("height")).toBe("222");
    expect(root.getAttribute("viewBox")).toBe("0 0 213 111");
    expect(sized.match(/\swidth="/g)).toHaveLength(2);
  });
});
