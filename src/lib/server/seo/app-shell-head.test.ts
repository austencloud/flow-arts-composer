import { describe, expect, it } from "vitest";
import { APP_SHELL_OG_IMAGE, injectAppShellHead } from "./app-shell-head";

const SHELL = `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n  </head>\n  <body></body>\n</html>`;

describe("app shell head", () => {
  it("names a known app path and points at the site image", () => {
    const html = injectAppShellHead(SHELL, "/create/generate/");

    expect(html).toContain(
      "<title>Generate a Sequence | Flow Arts Composer</title>"
    );
    expect(html).toContain(
      '<meta property="og:url" content="https://tkaflowarts.com/create/generate">'
    );
    expect(html).toContain(
      `<meta property="og:image" content="${APP_SHELL_OG_IMAGE}">`
    );
    // Tags land inside the head, once.
    expect(html.indexOf("<title>")).toBeLessThan(html.indexOf("</head>"));
    expect(html.match(/<title>/g)).toHaveLength(1);
  });

  it("gives any other app path the generic title", () => {
    expect(injectAppShellHead(SHELL, "/settings/display")).toContain(
      "<title>Flow Arts Composer</title>"
    );
  });

  it("escapes an ampersand in the fallback url", () => {
    expect(injectAppShellHead(SHELL, "/browse/a&b")).toContain(
      'content="https://tkaflowarts.com/browse/a&amp;b"'
    );
  });

  it("leaves a chunk without a head end, or a page with its own title, alone", () => {
    expect(injectAppShellHead("<body></body>", "/create")).toBe(
      "<body></body>"
    );
    const titled = SHELL.replace("</head>", "<title>Own</title></head>");
    expect(injectAppShellHead(titled, "/create")).toBe(titled);
  });
});
