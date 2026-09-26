import { existsSync, readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { detectSiteMode } from "../../src/config/domains";
import { GUIDE_BODY_PAGES } from "../../src/routes/(public)/guide/level-1/_data/guide-manifest";
import { TIMING_DIRECTION_ARTICLE_SLUGS } from "../../src/routes/(public)/timing-and-direction/_data/timing-direction-articles";
import { TRICK_NAMES } from "../../src/routes/(public)/tricks/_data/trick-names";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false },
}));

const bootScript = [
  ...readFileSync("src/app.html", "utf8").matchAll(
    /<script>([\s\S]*?)<\/script>/g
  ),
].find((match) => match[1]?.includes("var isLanding ="))?.[1];

afterEach(() => window.history.replaceState({}, "", "/"));

/** True when the href lands on a page that exists, including its anchor. */
function resolves(href: string): boolean {
  const [path = "", anchor] = href.split("#");
  const tnd = path.match(/^\/timing-and-direction\/(.+)$/);
  if (tnd) return TIMING_DIRECTION_ARTICLE_SLUGS.includes(tnd[1]!);
  const guide = path.match(/^\/guide\/level-1\/(.+)$/);
  if (guide) return GUIDE_BODY_PAGES.some((page) => page.id === guide[1]);
  const file = `src/routes/(public)${path}/+page.svelte`;
  if (!existsSync(file)) return false;
  return !anchor || readFileSync(file, "utf8").includes(`id="${anchor}"`);
}

describe("trick names page", () => {
  it("links every trick to a page that exists", () => {
    const broken = TRICK_NAMES.filter((trick) => !resolves(trick.link.href));
    expect(broken.map((trick) => trick.link.href)).toEqual([]);
  });

  it("gives every trick a unique anchor", () => {
    const ids = TRICK_NAMES.map((trick) => trick.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps a direct visit out of app initialization", () => {
    window.history.replaceState({}, "", "/tricks");
    expect(detectSiteMode()).toBe("landing");
    const bootWindow = { location: { pathname: "/tricks" } };
    expect(bootScript).toBeDefined();
    runInNewContext(bootScript!, { window: bootWindow });
    expect(bootWindow).toHaveProperty("__tkaIsLanding", true);
  });
});
