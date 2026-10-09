import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Public pages are prerendered with the canonical blue and red hands, and
// their posters, cards and figures carry those colors. The (public) layout
// pins the landing settings so a browser's saved palette cannot make the live
// figures disagree with the markup they arrived in. One owner: a page that
// pinned on its own would race the layout's release when the reader left.

const PUBLIC_ROUTES = resolve(process.cwd(), "src/routes/(public)");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const layout = readFileSync(join(PUBLIC_ROUTES, "+layout@.svelte"), "utf-8");

describe("public layout landing pin contract", () => {
  it("pins the canonical prop colors for every public page and releases them on leave", () => {
    expect(layout).toContain("pinLandingSettings({ primaryPropColors: null })");
    expect(layout).toContain("onDestroy(() => pinLandingSettings(null))");
  });

  it("is the only public route file that pins settings", () => {
    const otherPinners = walk(PUBLIC_ROUTES)
      .filter((file) => /\.(svelte|ts)$/.test(file))
      .filter((file) => !file.endsWith("+layout@.svelte"))
      .filter((file) =>
        readFileSync(file, "utf-8").includes("pinLandingSettings")
      )
      .map((file) => relative(process.cwd(), file));
    expect(otherPinners).toEqual([]);
  });
});
