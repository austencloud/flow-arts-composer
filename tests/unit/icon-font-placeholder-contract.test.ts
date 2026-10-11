/**
 * Public routes load Font Awesome after first paint, so app.html holds each
 * icon's box until the stylesheet arrives. If the two boxes drift apart (a
 * Font Awesome upgrade changes its default width, or the placeholder is
 * edited), every arrow and chevron pushes its row aside a few seconds after
 * the page appears again.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8").replace(/\s+/g, " ");
}

describe("icon font placeholder", () => {
  const fontAwesome = source("static/fonts/css/fontawesome.min.css");
  const appTemplate = source("src/app.html");
  const declarations = [
    "display: var(--fa-display, inline-block);",
    "width: var(--fa-width, 1.25em);",
  ];

  it("holds the same box Font Awesome gives an icon", () => {
    for (const declaration of declarations) {
      expect(fontAwesome).toContain(declaration);
      expect(appTemplate).toContain(declaration);
    }
  });

  it("holds no box on visits that never load the font", () => {
    expect(appTemplate).toContain(':where(html:not([data-icon-font="off"]))');
    expect(appTemplate).toContain(
      'document.documentElement.setAttribute("data-icon-font", "off");'
    );
  });
});
