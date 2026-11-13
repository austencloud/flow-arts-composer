// @vitest-environment jsdom
/**
 * A landing page that heads into the app (Remix on a sequence page, "Open the
 * app") starts the app's code when the navigation starts, not after the new
 * route has loaded and mounted. Losing that only makes the trip slower, which
 * no test or error would notice, so it is pinned here.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { detectSiteMode } from "../../src/config/domains";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false },
}));

afterEach(() => window.history.replaceState({}, "", "/"));

describe("site mode for a navigation's destination", () => {
  it("answers for where the visitor is going, not where they are", () => {
    window.history.replaceState({}, "", "/sequence/ABCD");
    const create = new URL("/create/construct", window.location.origin);

    expect(detectSiteMode()).toBe("landing");
    expect(detectSiteMode(create)).toBe("app");
    expect(detectSiteMode(new URL("/guide", window.location.origin))).toBe(
      "landing"
    );
  });

  it("reads the destination's own mode override", () => {
    window.history.replaceState({}, "", "/create");
    const forced = new URL("/create?mode=landing", window.location.origin);

    expect(detectSiteMode(forced)).toBe("landing");
  });
});

describe("root layout starts app code on the way into the app", () => {
  const layout = readFileSync("src/routes/+layout.svelte", "utf8");

  it("starts the imports in beforeNavigate for an app destination", () => {
    expect(layout).toMatch(
      /beforeNavigate\(\(navigation\) => \{\s*if \(siteMode !== "landing" \|\| preloadedImports\) return;[\s\S]*?detectSiteMode\(to\) !== "app"[\s\S]*?preloadedImports = startAppImports\(to\.pathname\);/
    );
  });

  it("preloads the destination's module, not the page being left", () => {
    expect(layout).toMatch(
      /function startAppImports\(pathname\?: string\) \{[\s\S]*?startActiveModulePreload\(pathname\);/
    );
  });

  it("lets app-mode startup reuse imports that are already running", () => {
    expect(layout).toMatch(
      /async function initAppMode\(\) \{[\s\S]*?if \(!preloadedImports\) preloadedImports = startAppImports\(\);/
    );
  });
});
