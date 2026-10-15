import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = path.resolve("scripts/check-localized-prerender.mjs");
const LOCALES = ["de", "es", "fr", "it", "pt"];
const ENGLISH = [
  "Every letter starts from a position and ends at another.",
  "The grid has four points around a center point.",
];
const GERMAN = [
  "Jeder Buchstabe beginnt an einer Position und endet an einer anderen.",
  "Das Gitter hat vier Punkte um einen Mittelpunkt herum.",
];

const page = (lang: string, path: string, lines: string[]) => {
  const alternates = ["en", ...LOCALES, "x-default"]
    .map((tag) => `<link rel="alternate" hreflang="${tag}" href="x">`)
    .join("");
  return `<!doctype html><html lang="${lang}"><head>
<link rel="canonical" href="https://tkaflowarts.com${path}">${alternates}</head>
<body><main>${lines.map((l) => `<p>${l}</p>`).join("")}</main></body></html>`;
};

let root = "";
function tree(localized: string[]) {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "seo-prerender-"));
  fs.writeFileSync(
    path.join(root, "guide.html"),
    page("en", "/guide", ENGLISH)
  );
  for (const locale of LOCALES) {
    fs.mkdirSync(path.join(root, locale));
    fs.writeFileSync(
      path.join(root, locale, "guide.html"),
      page(locale, `/${locale}/guide`, localized)
    );
  }
}
const run = () =>
  spawnSync(process.execPath, [SCRIPT], {
    env: { ...process.env, SEO_PRERENDER_ROOT: root },
    encoding: "utf8",
  });

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("check-localized-prerender", () => {
  it("passes translated, correctly tagged pages", () => {
    tree(GERMAN);
    const result = run();
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it("fails a page that still shows the English text", () => {
    tree(ENGLISH);
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("/de/guide: 2/2 sentences still English");
  });
});
