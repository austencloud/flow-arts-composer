// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { POST_STUDIO_DOM_CAPTURE_OPTIONS } from "#lib/shared/media-composition/services/post-studio-dom-capture.js";

const ICON = "\uE4BB";

/** The SVG modern-screenshot builds: its pseudo-element rules sit in a style. */
function capturedSvg(...cssParts: string[]): {
  svg: SVGSVGElement;
  parts: Text[];
} {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const style = document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "style"
  );
  const parts = cssParts.map((css) => document.createTextNode(css));
  style.append(...parts);
  svg.append(style);
  return { svg, parts };
}

function clean(svg: SVGSVGElement) {
  POST_STUDIO_DOM_CAPTURE_OPTIONS.onCreateForeignObjectSvg(svg);
}

describe("Post Studio DOM capture", () => {
  it("drops the slash modern-screenshot adds after an icon glyph", () => {
    const { svg, parts } = capturedSvg(
      `.a::before {\n  content: '${ICON} / ';\n  color: rgb(54, 195, 255);\n}\n`
    );

    clean(svg);

    expect(parts[0]!.data).toBe(
      `.a::before {\n  content: '${ICON}';\n  color: rgb(54, 195, 255);\n}\n`
    );
  });

  it("drops a non-empty accessible name as well", () => {
    const { svg, parts } = capturedSvg(
      `.a::before { content: '${ICON} / Loop'; }`
    );

    clean(svg);

    expect(parts[0]!.data).toBe(`.a::before { content: '${ICON}'; }`);
  });

  it("rewrites every icon rule, in each text node of the style", () => {
    const { svg, parts } = capturedSvg(
      `.a::before { content: '${ICON} / '; }\n.b::before { content: '\uF0C9 / '; }`,
      `.c::before { content: '${ICON} / '; }`
    );

    clean(svg);

    expect(parts.map((part) => part.data)).toEqual([
      `.a::before { content: '${ICON}'; }\n.b::before { content: '\uF0C9'; }`,
      `.c::before { content: '${ICON}'; }`,
    ]);
  });

  it("leaves a real slash in ordinary content alone", () => {
    const css = [
      ".crumb::after { content: ' / '; }",
      ".pair::after { content: 'A / B'; }",
      ".end::after { content: 'Step / '; }",
      "@font-face { font-family: 'X'; src: url(data:font/woff2;base64,AAAA/BBBB); }",
    ].join("\n");
    const { svg, parts } = capturedSvg(css);
    const node = parts[0]!;

    clean(svg);

    expect(parts[0]).toBe(node);
    expect(node.data).toBe(css);
  });

  it("tolerates a capture without a style element", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

    expect(() => clean(svg)).not.toThrow();
  });
});
