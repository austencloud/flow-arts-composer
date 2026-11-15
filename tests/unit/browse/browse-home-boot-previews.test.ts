// @vitest-environment jsdom

/**
 * Browse home's tile previews on a cold start. The scene code starts
 * downloading as the home mounts, and when the home is the visit's first
 * view the boot screen waits for every tile's picture, up to the same limit
 * Create's first view has.
 */
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIRST_VIEW_WAIT_MS } from "#lib/shared/application/services/boot-screen.js";
import { BROWSE_TABS } from "#lib/shared/navigation/config/tab-definitions.js";

// The scene loaders, each a spy the tests make resolve or reject.
const scenes = vi.hoisted(() => ({
  loaders: {} as Record<string, ReturnType<typeof vi.fn>>,
}));

vi.mock(
  "#lib/features/browse/home/previews/browse-home-scenes",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("#lib/features/browse/home/previews/browse-home-scenes")
      >();
    for (const id of ["sequences", "collections", "visuals", "you"]) {
      scenes.loaders[id] = vi.fn(() => new Promise(() => {}));
    }
    const loaders = scenes.loaders as unknown as typeof original.BROWSE_HOME_SCENES;
    return {
      BROWSE_HOME_SCENES: loaders,
      warmBrowseHomeScenes: (ids: readonly string[]) =>
        original.warmBrowseHomeScenes(ids, loaders),
    };
  }
);
// The real preview box loads scenes jsdom cannot draw. The stand-in reports
// ready on mount, unless held back, and shows the props it was given.
vi.mock(
  "#lib/features/create/shared/components/method-previews/CreateMethodPreview.svelte",
  async () => ({
    default: (await import("../create/FakeMethodPreview.svelte")).default,
  })
);

const { default: BrowseHome } =
  await import("#lib/features/browse/home/BrowseHome.svelte");
const { warmBrowseHomeScenes } = await vi.importActual<
  typeof import("#lib/features/browse/home/previews/browse-home-scenes")
>("#lib/features/browse/home/previews/browse-home-scenes");

// vitest-setup.ts swaps document.createElement for canvas stubs that are not
// DOM nodes. Mounting a component needs jsdom's own, from document's prototype.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;

const TILES = ["sequences", "collections", "visuals"];

describe("Browse home, tile previews", () => {
  let host: HTMLElement;
  let home: ReturnType<typeof mount> | null = null;
  let bootScreen: HTMLElement | null = null;
  let stubbedCreateElement: typeof document.createElement;

  /** app.html's boot hold registry: what was asked for, and what is open. */
  function stubBootHolds(): {
    open: Set<string>;
    asked: Array<{ name: string; waitMs: unknown }>;
  } {
    const open = new Set<string>();
    const asked: Array<{ name: string; waitMs: unknown }> = [];
    window.__tkaBootHold = ((name: string, waitMs?: unknown) => {
      asked.push({ name, waitMs });
      open.add(name);
      return () => open.delete(name);
    }) as typeof window.__tkaBootHold;
    return { open, asked };
  }

  function coverWithBootScreen(): void {
    bootScreen = document.createElement("div");
    bootScreen.id = "app-loading";
    document.body.append(bootScreen);
  }

  function render(): void {
    home = mount(BrowseHome, {
      target: host,
      props: { destinations: BROWSE_TABS, onSelect: vi.fn() },
    });
    flushSync();
  }

  function preview(id: string): HTMLElement | null {
    return host.querySelector<HTMLElement>(
      `.fake-preview[data-method="${id}"]`
    );
  }

  beforeEach(() => {
    vi.useFakeTimers();
    stubbedCreateElement = document.createElement;
    document.createElement = realCreateElement.bind(document);
    host = document.createElement("div");
    document.body.append(host);
    for (const loader of Object.values(scenes.loaders)) {
      loader.mockReset();
      loader.mockImplementation(() => new Promise(() => {}));
    }
  });

  afterEach(() => {
    if (home) unmount(home);
    home = null;
    host.remove();
    bootScreen?.remove();
    bootScreen = null;
    delete window.__tkaBootHold;
    document.createElement = stubbedCreateElement;
    vi.useRealTimers();
  });

  it("holds the boot screen up to Create's first-view limit when it covers", async () => {
    coverWithBootScreen();
    const holds = stubBootHolds();
    render();
    expect(holds.asked).toEqual([
      { name: "browse-home-previews", waitMs: FIRST_VIEW_WAIT_MS },
    ]);
    // Every stand-in drew on mount, so the hold is released once that has
    // reached the page.
    await Promise.resolve();
    await Promise.resolve();
    expect(holds.open.size).toBe(0);
  });

  it("takes no hold when the boot screen is not covering", () => {
    const holds = stubBootHolds();
    render();
    expect(holds.asked).toEqual([]);
  });

  it("starts downloading each tile's scene as the home mounts", () => {
    render();
    for (const id of TILES) {
      expect(scenes.loaders[id]).toHaveBeenCalledTimes(1);
    }
    // Not a Community tile, so not shown and not fetched.
    expect(scenes.loaders.you).not.toHaveBeenCalled();
  });

  it("marks no tile failed when a warm-up download fails", async () => {
    coverWithBootScreen();
    const holds = stubBootHolds();
    for (const id of TILES) {
      scenes.loaders[id]!.mockImplementation(() =>
        Promise.reject(new Error("offline"))
      );
    }
    render();
    await vi.advanceTimersByTimeAsync(0);
    flushSync();
    // The stand-ins drew, so every tile arrives; the failed warm-ups
    // changed nothing.
    expect(holds.open.size).toBe(0);
    for (const id of TILES) {
      expect(preview(id)?.dataset.revealed).toBe("true");
    }
  });
});

describe("warmBrowseHomeScenes", () => {
  it("calls each named loader once and skips unknown ids", () => {
    const sequences = vi.fn(() => new Promise<never>(() => {}));
    const visuals = vi.fn(() => new Promise<never>(() => {}));
    warmBrowseHomeScenes(["sequences", "missing"], { sequences, visuals });
    expect(sequences).toHaveBeenCalledTimes(1);
    expect(visuals).not.toHaveBeenCalled();
  });

  it("swallows a rejected or throwing loader", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      expect(() =>
        warmBrowseHomeScenes(["a", "b"], {
          a: () => Promise.reject(new Error("offline")),
          b: () => {
            throw new Error("broken");
          },
        })
      ).not.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});
