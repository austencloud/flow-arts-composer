import { describe, it, expect } from "vitest";
import { sanitizeSvg } from "#lib/features/tika/services/svg-sanitizer.js";

describe("SvgSanitizer", () => {

  it("preserves valid SVG elements", () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><g class="svg-grid"><circle cx="475" cy="325" r="12" fill="#3575E2"/></g></svg>';
    const result = sanitizeSvg(input);
    expect(result).toContain("<circle");
    expect(result).toContain('class="svg-grid"');
    expect(result).toContain('fill="#3575E2"');
  });

  it("strips script tags", () => {
    const input = '<svg><script>alert("xss")</script><circle cx="10" cy="10" r="5"/></svg>';
    const result = sanitizeSvg(input);
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert");
    expect(result).toContain("<circle");
  });

  it("strips event handler attributes", () => {
    const input = '<svg><circle onclick="alert(1)" cx="10" cy="10" r="5"/></svg>';
    const result = sanitizeSvg(input);
    expect(result).not.toContain("onclick");
    expect(result).toContain("<circle");
  });

  it("strips foreignObject", () => {
    const input = '<svg><foreignObject><body><script>alert(1)</script></body></foreignObject></svg>';
    const result = sanitizeSvg(input);
    expect(result).not.toContain("foreignObject");
    expect(result).not.toContain("<script");
  });

  it("preserves CSS custom properties in fill attributes", () => {
    const input = '<svg><circle fill="var(--dm-motion-blue, #3575E2)" cx="475" cy="325" r="12"/></svg>';
    const result = sanitizeSvg(input);
    expect(result).toContain("var(--dm-motion-blue, #3575E2)");
  });

  it("preserves transform attributes", () => {
    const input = '<svg><g transform="translate(475, 325) rotate(45)"><rect width="10" height="10"/></g></svg>';
    const result = sanitizeSvg(input);
    expect(result).toContain("translate(475, 325) rotate(45)");
  });

  it("preserves path d attributes", () => {
    const input = '<svg><path d="M 10 10 L 20 20 Z" fill="#ED1C24"/></svg>';
    const result = sanitizeSvg(input);
    expect(result).toContain('d="M 10 10 L 20 20 Z"');
  });

  it("preserves safe style attributes (fill, stroke, color)", () => {
    const input = '<svg><path style="fill:var(--dm-motion-blue, #3575E2)" d="M0 0"/></svg>';
    const result = sanitizeSvg(input);
    expect(result).toContain("var(--dm-motion-blue, #3575E2)");
    expect(result).toContain("style=");
  });

  it("strips dangerous CSS properties from style attributes", () => {
    const input = '<svg><path style="fill:red; -moz-binding:url(evil)" d="M0 0"/></svg>';
    const result = sanitizeSvg(input);
    expect(result).toContain("fill");
    expect(result).not.toContain("-moz-binding");
    expect(result).not.toContain("evil");
  });

  it("preserves style with color property for grid", () => {
    const input = '<svg><g style="color: var(--dm-grid-point, #d0d0d0)"><circle cx="10" cy="10" r="5"/></g></svg>';
    const result = sanitizeSvg(input);
    expect(result).toContain("var(--dm-grid-point, #d0d0d0)");
  });
});
