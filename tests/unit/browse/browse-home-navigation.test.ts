// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/shared/analytics/services/posthog-activity-logger.js", () => ({
  logModuleView: vi.fn(async () => {}),
}));
vi.mock("#lib/shared/hmr-helper.js", () => ({
  hasMimeErrorOccurred: () => false,
  verifyTabSwitch: vi.fn(),
}));
// SvelteKit's URL writer is inert outside a browser; write jsdom's history
// directly so the address can be asserted.
vi.mock(
  "#lib/shared/navigation/services/url-state.js",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    writeUrl: (destination: string | URL, options: { mode?: string } = {}) => {
      const href = new URL(destination, window.location.href).href;
      if (options.mode === "push") history.pushState({}, "", href);
      else history.replaceState({}, "", href);
    },
  })
);

async function freshModules(pathname: string) {
  history.replaceState({}, "", pathname);
  vi.resetModules();
  const browse =
    await import("#lib/shared/browse/state/browse-navigation-state.svelte.js");
  const nav =
    await import("#lib/shared/navigation/state/navigation-state.svelte.js");
  return { browse, nav };
}

describe("Browse home screen", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it.each([
    ["/browse", true],
    ["/browse/", true],
    ["/browse//", true],
    ["/browse/explore", false],
    ["/browse/you/sequences", false],
    ["/browser", false],
    ["/create", false],
  ])("treats %s as the home path: %s", async (pathname, expected) => {
    const { browse } = await freshModules("/");
    expect(browse.isBrowseHomePath(pathname)).toBe(expected);
  });

  it("opens the home on a bare /browse address", async () => {
    const { nav } = await freshModules("/browse");
    const state = nav.createNavigationState();

    expect(state.currentModule).toBe("browse");
    expect(state.isModuleHomeOpen("browse")).toBe(true);
  });

  it("goes straight to a page when the address names one", async () => {
    const { nav } = await freshModules("/browse/explore/collections");
    const state = nav.createNavigationState();

    expect(state.currentModule).toBe("browse");
    expect(state.isModuleHomeOpen("browse")).toBe(false);
    expect(state.activeTab).toBe("collections");
  });

  it.each([
    ["/browse/explore/sequences", "sequences"],
    ["/browse/explore/collections/owner/collection", "collections"],
    ["/browse/explore/visuals/mandalas", "visuals"],
    ["/browse/you/collections/collection", "saved"],
    ["/browse/you/visuals/tunnels", "your-visuals"],
  ])("selects %s in the outer navigation", async (pathname, destination) => {
    const { nav } = await freshModules(pathname);
    expect(nav.createNavigationState().activeTab).toBe(destination);
  });

  it("migrates a remembered Explore tab to Sequences", async () => {
    const { nav } = await freshModules("/browse");
    localStorage.setItem(
      "tka-module-last-tabs",
      JSON.stringify({ browse: "explore" })
    );
    const state = nav.createNavigationState();
    state.setCurrentModule("browse");
    expect(state.activeTab).toBe("sequences");
    expect(
      JSON.parse(localStorage.getItem("tka-module-last-tabs")!)
    ).toMatchObject({
      browse: "sequences",
    });
  });

  it("opens the home for a tab-less module switch, not for a named tab", async () => {
    const { nav } = await freshModules("/create/fuse");
    const state = nav.createNavigationState();

    state.setCurrentModule("browse");
    expect(state.isModuleHomeOpen("browse")).toBe(true);

    state.setCurrentModule("browse", "you");
    expect(state.isModuleHomeOpen("browse")).toBe(false);
    expect(state.activeTab).toBe("saved");
  });

  it("leaves the /browse address alone while keeping a location underneath", async () => {
    const { browse } = await freshModules("/browse");
    const state = browse.createBrowseNavigationState();
    state.initialize();

    expect(window.location.pathname).toBe("/browse");
    expect(state.currentLocation).toMatchObject({
      primary: "explore",
      section: "sequences",
    });
    state.destroy();
  });

  it("writes the address when a tile picks the location already underneath", async () => {
    const { browse } = await freshModules("/browse");
    const state = browse.createBrowseNavigationState();
    state.initialize();
    const location = state.currentLocation!;

    state.navigateTo(location);
    expect(window.location.pathname).toBe("/browse");

    state.navigateTo(location, { forceUrl: true });
    expect(window.location.pathname).toBe("/browse/explore/sequences");
    state.destroy();
  });

  it("remembers the last place under each side", async () => {
    const { browse } = await freshModules("/browse/you/collections");
    const state = browse.createBrowseNavigationState();
    state.initialize();
    state.viewExploreSequences();

    expect(state.lastLocationFor("you")).toMatchObject({
      primary: "you",
      section: "collections",
    });
    expect(state.lastLocationFor("explore")).toMatchObject({
      primary: "explore",
      section: "sequences",
    });
    state.destroy();
  });
});
